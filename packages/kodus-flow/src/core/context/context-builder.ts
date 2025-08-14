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
    snapshot?: {
        adapterType?: StorageType;
        adapterConfig?: {
            connectionString?: string;
            options?: Record<string, unknown>;
        };
    };
}

export class ContextBuilder {
    private static instance: ContextBuilder | undefined;
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
            snapshotConfig: config.snapshot ? 'configured' : 'default',
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
            hasSnapshot: !!config.snapshot,
            memoryAdapterType: config.memory?.adapterType,
            sessionAdapterType: config.session?.adapterType,
            snapshotAdapterType: config.snapshot?.adapterType,
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
            const tenantId = options.tenantId || 'default';
            let session = await this.sessionService.getSessionByThread(
                threadId,
                tenantId,
            );
            if (!session) {
                session = await this.sessionService.createSession(
                    tenantId,
                    threadId,
                    {},
                );
            }

            const workingMemory = new ContextStateService(
                { sessionId: session.id },
                { maxNamespaceSize: 1000, maxNamespaces: 50 },
            );

            const agentContext = await this.buildAgentContext({
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

    private async buildAgentContext({
        session,
        workingMemory,
        options,
    }: {
        session: Session;
        workingMemory: ContextStateService;
        options: AgentExecutionOptions;
    }): Promise<AgentContext> {
        const invocationId = IdGenerator.executionId();

        // Instâncias únicas e compartilhadas para rastreabilidade consistente
        const sharedStepExecution = new StepExecution();
        const sharedContextManager = new ContextManager(sharedStepExecution);
        const sharedMessageContext = new EnhancedMessageContext(
            sharedContextManager,
        );

        // Reidratar workingMemory com contexto persistido por sessão (por namespace)
        try {
            const contextData = (session.contextData || {}) as Record<
                string,
                unknown
            >;
            for (const [namespace, nsValue] of Object.entries(contextData)) {
                if (
                    typeof nsValue === 'object' &&
                    nsValue !== null &&
                    !Array.isArray(nsValue)
                ) {
                    const entries = Object.entries(
                        nsValue as Record<string, unknown>,
                    );
                    for (const [key, value] of entries) {
                        // each key/value re-hydrated into working memory

                        await workingMemory.set(namespace, key, value);
                    }
                }
            }
            this.logger.debug(
                'Working memory rehydrated from session context',
                {
                    sessionId: session.id,
                    tenantId: session.tenantId,
                },
            );
        } catch (rehydrateError) {
            this.logger.warn('Failed to rehydrate working memory', {
                error:
                    rehydrateError instanceof Error
                        ? rehydrateError.message
                        : String(rehydrateError),
                sessionId: session.id,
            });
        }

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
                set: async (namespace: string, key: string, value: unknown) => {
                    await workingMemory.set(namespace, key, value);
                    // Espelhar no SessionService como contexto persistente por namespace
                    await this.sessionService.updateSessionContext(session.id, {
                        [namespace]: { [key]: value },
                    });
                },
                clear: (namespace: string) => workingMemory.clear(namespace),
                getNamespace: async (namespace: string) => {
                    const nsMap = workingMemory.getNamespace(namespace);
                    return nsMap ? new Map(Object.entries(nsMap)) : undefined;
                },
            },

            memory: {
                store: async (content: unknown, type = 'general') => {
                    // Suporta dois formatos:
                    // 1) store(value, type)
                    // 2) store({ content, type?, key?, metadata?, entityId?, sessionId?, tenantId?, contextId?, expireAt? })
                    if (
                        content &&
                        typeof content === 'object' &&
                        'content' in (content as Record<string, unknown>)
                    ) {
                        const input = content as {
                            content: unknown;
                            type?: string;
                            key?: string;
                            metadata?: Record<string, unknown>;
                            entityId?: string;
                            sessionId?: string;
                            tenantId?: string;
                            contextId?: string;
                            expireAt?: number;
                        };

                        const stored = await this.memoryManager.store({
                            key: input.key,
                            content: input.content,
                            type: input.type ?? type,
                            entityId: input.entityId,
                            sessionId: input.sessionId ?? session.id,
                            tenantId: input.tenantId ?? session.tenantId,
                            contextId: input.contextId,
                            metadata: input.metadata,
                            expireAt: input.expireAt,
                        });
                        return stored.id;
                    }

                    const stored = await this.memoryManager.store({
                        content,
                        type,
                        sessionId: session.id,
                        tenantId: session.tenantId,
                    });
                    return stored.id;
                },
                get: async (id: string) => {
                    const item = await this.memoryManager.get(id);
                    return item?.value;
                },
                search: async (query: string, limit = 5) => {
                    const results = await this.memoryManager.search(query, {
                        topK: limit,
                        filter: {
                            tenantId: session.tenantId,
                            sessionId: session.id,
                        },
                    });
                    return results.map(
                        (r) => r.metadata?.content || r.text || 'No content',
                    );
                },
                getRecent: async (limit = 5) => {
                    // Buscar itens recentes escopados ao tenant/session do contexto
                    const results = await this.memoryManager.query({
                        tenantId: session.tenantId,
                        sessionId: session.id,
                        until: Date.now(),
                        limit,
                    });
                    // Ordenar por timestamp desc para garantir ordem
                    const sorted = results.sort(
                        (a, b) => b.timestamp - a.timestamp,
                    );
                    return sorted.map((item) => item.value);
                },
                query: async (filters: {
                    type?: string;
                    key?: string;
                    since?: number;
                    until?: number;
                    limit?: number;
                }) => {
                    const results = await this.memoryManager.query({
                        type: filters.type,
                        // key support depende do adapter; incluímos via keyPattern ≈ exato
                        // mas como MemoryQuery não possui key diretamente no manager, fica para adapter
                        // aqui focamos em filtros multi-tenant/sessão e tempo
                        tenantId: session.tenantId,
                        sessionId: session.id,
                        since: filters.since,
                        until: filters.until,
                        limit: filters.limit,
                    });
                    return results.map((r) => r.value);
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

            stepExecution: sharedStepExecution,
            messageContext: sharedMessageContext,
            contextManager: sharedContextManager,
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

export const createAgentContext = (
    options: AgentExecutionOptions,
): Promise<AgentContext> => {
    return ContextBuilder.getInstance().createAgentContext(options);
};
