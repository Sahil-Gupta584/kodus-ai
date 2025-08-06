import { createLogger } from '../../observability/index.js';
import { IdGenerator } from '../../utils/id-generator.js';
import {
    getGlobalMemoryManager,
    MemoryManager,
    setGlobalMemoryManager,
} from '../memory/memory-manager.js';
import { SessionService } from './services/session-service.js';
import { ContextStateService } from './services/state-service.js';

import type {
    AgentContext,
    AgentExecutionOptions,
} from '../types/agent-types.js';
import type { Session, SessionConfig } from './services/session-service.js';
import type { ToolEngine } from '../../engine/tools/tool-engine.js';
import { StorageType } from '../storage/index.js';

import {
    StepExecution,
    EnhancedMessageContext,
    ContextManager,
} from './step-execution.js';

export interface ContextBuilderConfig {
    memory?: {
        adapterType?: StorageType;
        adapterConfig?: {
            connectionString?: string;
            options?: Record<string, unknown>;
        };
    };
    session?: SessionConfig;
}

export class ContextBuilder {
    private static instance: ContextBuilder;
    private readonly logger = createLogger('ContextBuilder');
    private readonly _config: ContextBuilderConfig;

    private memoryManager!: MemoryManager;
    private sessionService: SessionService;
    private toolEngine?: ToolEngine;

    private constructor(config: ContextBuilderConfig = {}) {
        this._config = config;

        if (config.memory) {
            this.initializeMemoryManager(config.memory);
        } else {
            this.memoryManager = getGlobalMemoryManager();
        }
        const sessionConfig = {
            maxSessions: 1000,
            sessionTimeout: 30 * 60 * 1000, // 30 min
            enableAutoCleanup: true,
            ...config.session,
        };

        this.logger.info('🔍 [DEBUG] Creating SessionService with config', {
            sessionConfig,
            hasConnectionString: !!sessionConfig.connectionString,
            adapterType: sessionConfig.adapterType,
            originalConfigSession: config.session,
        });

        this.sessionService = new SessionService(sessionConfig);

        this.logger.info('ContextBuilder initialized', {
            memoryConfig: config.memory ? 'configured' : 'default',
            sessionConfig: config.session ? 'configured' : 'default',
        });
    }

    static getInstance(config?: ContextBuilderConfig): ContextBuilder {
        if (!ContextBuilder.instance) {
            ContextBuilder.instance = new ContextBuilder(config);
        }
        return ContextBuilder.instance;
    }

    static resetInstance(): void {
        ContextBuilder.instance = undefined as unknown as ContextBuilder;
    }

    static configure(config: ContextBuilderConfig): ContextBuilder {
        const logger = createLogger('ContextBuilder');
        logger.info('🔍 [DEBUG] ContextBuilder.configure called', {
            config,
            hasMemory: !!config.memory,
            hasSession: !!config.session,
            memoryAdapterType: config.memory?.adapterType,
            sessionAdapterType: config.session?.adapterType,
        });

        ContextBuilder.resetInstance();
        return ContextBuilder.getInstance(config);
    }

    getConfig(): ContextBuilderConfig {
        return this._config;
    }

    private initializeMemoryManager(
        memoryConfig: NonNullable<ContextBuilderConfig['memory']>,
    ): void {
        const memoryManager = new MemoryManager({
            adapterType: memoryConfig.adapterType || 'memory',
            adapterConfig: memoryConfig.adapterConfig,
        });

        setGlobalMemoryManager(memoryManager);
        this.memoryManager = memoryManager;

        this.logger.info('MemoryManager initialized with custom config', {
            adapterType: memoryConfig.adapterType || 'memory',
            hasConnectionString: !!memoryConfig.adapterConfig?.connectionString,
        });
    }

    async createAgentContext(
        options: AgentExecutionOptions,
    ): Promise<AgentContext> {
        this.logger.info('Creating agent context', {
            agentName: options.agentName,
            threadId: options.thread?.id,
            tenantId: options.tenantId,
        });

        try {
            await this.memoryManager.initialize();

            const threadId = options.thread?.id || 'default';
            let session =
                await this.sessionService.getSessionByThread(threadId);
            if (!session) {
                session = await this.sessionService.createSession(
                    options.tenantId || 'default',
                    threadId,
                    {},
                );
            }

            const workingMemory = new ContextStateService(
                { sessionId: session.id },
                { maxNamespaceSize: 1000, maxNamespaces: 50 },
            );

            const agentContext = this.buildAgentContext({
                session,
                workingMemory,
                options,
            });

            this.logger.info('Agent context created successfully', {
                sessionId: session.id,
                agentName: options.agentName,
                invocationId: agentContext.invocationId,
            });

            return agentContext;
        } catch (error) {
            this.logger.error(
                'Failed to create agent context',
                error instanceof Error ? error : new Error('Unknown error'),
            );
            throw error;
        }
    }

    private buildAgentContext({
        session,
        workingMemory,
        options,
    }: {
        session: Session;
        workingMemory: ContextStateService;
        options: AgentExecutionOptions;
    }): AgentContext {
        const invocationId = IdGenerator.executionId();

        return {
            sessionId: session.id,
            tenantId: session.tenantId,
            correlationId: options.correlationId || IdGenerator.correlationId(),
            thread: options.thread,
            agentName: options.agentName,
            invocationId,

            state: {
                get: <T>(namespace: string, key: string) =>
                    workingMemory.get<T>(namespace, key),
                set: (namespace: string, key: string, value: unknown) =>
                    workingMemory.set(namespace, key, value),
                clear: (namespace: string) => workingMemory.clear(namespace),
                getNamespace: async (namespace: string) => {
                    const nsMap = workingMemory.getNamespace(namespace);
                    return nsMap ? new Map(Object.entries(nsMap)) : undefined;
                },
            },

            memory: {
                store: async (content: unknown, type = 'general') => {
                    await this.memoryManager.store({
                        content,
                        type,
                        sessionId: session.id,
                        tenantId: session.tenantId,
                    });
                },
                get: async (id: string) => {
                    const item = await this.memoryManager.get(id);
                    return item?.value;
                },
                search: async (query: string, limit = 5) => {
                    const results = await this.memoryManager.search(query, {
                        topK: limit,
                    });
                    return results.map(
                        (r) => r.metadata?.content || r.text || 'No content',
                    );
                },
                getRecent: async (limit = 5) => {
                    const items =
                        await this.memoryManager.getRecentMemories(limit);
                    return items.map((item) => item.value);
                },
            },

            session: {
                addEntry: async (input: unknown, output: unknown) => {
                    await this.sessionService.addConversationEntry(
                        session.id,
                        input,
                        output,
                    );
                },
                getHistory: async () => {
                    const currentSession = await this.sessionService.getSession(
                        session.id,
                    );
                    return currentSession?.conversationHistory || [];
                },
                updateMetadata: async (metadata: Record<string, unknown>) => {
                    await this.sessionService.updateSessionMetadata(
                        session.id,
                        metadata,
                    );
                },
            },

            track: {
                toolUsage: async (
                    toolName: string,
                    params: unknown,
                    result: unknown,
                    success: boolean,
                ) => {
                    await this.sessionService.addConversationEntry(
                        session.id,
                        { type: 'tool_call', toolName, params },
                        { type: 'tool_result', result, success },
                        'system',
                        { timestamp: Date.now() },
                    );
                },
                plannerStep: async (step: unknown) => {
                    await this.sessionService.addConversationEntry(
                        session.id,
                        { type: 'planner_step', step },
                        null,
                        'system',
                        { timestamp: Date.now() },
                    );
                },
                error: async (error: Error, context?: unknown) => {
                    await this.sessionService.addConversationEntry(
                        session.id,
                        { type: 'error', context },
                        {
                            type: 'error_details',
                            message: error.message,
                            stack: error.stack,
                            timestamp: Date.now(),
                        },
                        'system',
                    );
                },
            },

            signal: new AbortController().signal,

            cleanup: async () => {},

            executionRuntime: {
                addContextValue: async (update: Record<string, unknown>) => {
                    const contextValues =
                        (await workingMemory.get<unknown[]>(
                            'runtime',
                            'contextValues',
                        )) || [];
                    contextValues.push({ ...update, timestamp: Date.now() });
                    await workingMemory.set(
                        'runtime',
                        'contextValues',
                        contextValues,
                    );
                },
                storeToolUsagePattern: async (
                    toolName: string,
                    input: unknown,
                    output: unknown,
                    success: boolean,
                    duration: number,
                ) => {
                    await this.memoryManager.store({
                        content: { toolName, input, output, success, duration },
                        type: 'tool_usage_pattern',
                        sessionId: session.id,
                        tenantId: session.tenantId,
                    });
                },
                storeExecutionPattern: async (
                    patternType: string,
                    action: unknown,
                    result: unknown,
                    context: unknown,
                ) => {
                    await this.memoryManager.store({
                        content: { patternType, action, result, context },
                        type: 'execution_pattern',
                        sessionId: session.id,
                        tenantId: session.tenantId,
                    });
                },
                setState: async (
                    namespace: string,
                    key: string,
                    value: unknown,
                ) => {
                    await workingMemory.set(namespace, key, value);
                },
            },
            agentIdentity: undefined,
            agentExecutionOptions: options,
            allTools: this.toolEngine?.listTools() || [],

            stepExecution: new StepExecution(),
            messageContext: new EnhancedMessageContext(
                new ContextManager(new StepExecution()),
            ),
            contextManager: new ContextManager(new StepExecution()),
        };
    }

    setToolEngine(toolEngine: ToolEngine): void {
        this.toolEngine = toolEngine;
        this.logger.info('ToolEngine set for ContextBuilder', {
            hasToolEngine: !!toolEngine,
            toolCount: toolEngine?.listTools().length || 0,
        });
    }

    getServices() {
        return {
            memoryManager: this.memoryManager,
            sessionService: this.sessionService,
            toolEngine: this.toolEngine,
        };
    }

    async health(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        services: Record<string, unknown>;
    }> {
        try {
            const [memoryStats, sessionStats] = await Promise.all([
                this.memoryManager.getStats(),
                Promise.resolve(this.sessionService.getSessionStats()),
            ]);

            return {
                status: 'healthy',
                services: {
                    memory: memoryStats,
                    session: sessionStats,
                },
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                services: {
                    error:
                        error instanceof Error
                            ? error.message
                            : 'Unknown error',
                },
            };
        }
    }
}

export const contextBuilder = ContextBuilder.getInstance();

export const createAgentContext = (
    options: AgentExecutionOptions,
): Promise<AgentContext> => {
    return contextBuilder.createAgentContext(options);
};
