import { createLogger } from '../../observability/index.js';
import { IdGenerator } from '../../utils/id-generator.js';
import {
    getGlobalMemoryManager,
    MemoryManager,
    setGlobalMemoryManager,
} from '../memory/memory-manager.js';
import { SessionService } from './services/session-service.js';
import { ContextStateService } from './services/state-service.js';
import { ConversationManager } from './services/conversation-manager.js';
import { STATE_NAMESPACES } from './namespace-constants.js';

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
    private conversationManager: ConversationManager;
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

        this.sessionService = new SessionService(sessionConfig);

        // Initialize conversation manager
        this.conversationManager = new ConversationManager({
            maxHistory: sessionConfig.maxConversationHistory || 100,
            persistent: false, // Can be made configurable later
        });

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
                // Initialize conversation for new session
                this.conversationManager.initializeSession(
                    session.id,
                    [],
                    session.tenantId,
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
            agentName: options.agentName || 'default-agent',
            correlationId: options.correlationId || IdGenerator.correlationId(),
            thread: options.thread,
            invocationId,
            state: {
                get: <T>(namespace: string, key: string, _threadId?: string) =>
                    workingMemory.get<T>(namespace, key),
                set: async (
                    namespace: string,
                    key: string,
                    value: unknown,
                    _threadId?: string,
                ) => {
                    await workingMemory.set(namespace, key, value);
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

            conversation: {
                addMessage: async (
                    role: 'user' | 'assistant' | 'system',
                    content: string,
                    metadata?: Record<string, unknown>,
                ) => {
                    await this.conversationManager.addMessage(
                        session.id,
                        role,
                        content,
                        metadata,
                        session.tenantId,
                    );
                },
                getHistory: async () => {
                    return await this.conversationManager.getHistory(
                        session.id,
                        session.tenantId,
                    );
                },
                updateMetadata: async (metadata: Record<string, unknown>) => {
                    await this.sessionService.updateSessionMetadata(
                        session.id,
                        metadata,
                    );
                },
            },
            availableTools: [],
            signal: new AbortController().signal,
            cleanup: async () => {},
            executionRuntime: {
                addContextValue: async (update: Record<string, unknown>) => {
                    const contextValues =
                        (await workingMemory.get<unknown[]>(
                            STATE_NAMESPACES.RUNTIME,
                            'contextValues',
                        )) || [];
                    contextValues.push({ ...update, timestamp: Date.now() });
                    await workingMemory.set(
                        STATE_NAMESPACES.RUNTIME,
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

/**
 * Simple base context creation for basic use cases
 */
export function createBaseContext(config: {
    tenantId: string;
    executionId?: string;
}): {
    executionId: string;
    tenantId: string;
    startTime: number;
    status: 'RUNNING' | 'COMPLETED' | 'FAILED';
    cleanup: () => Promise<void>;
} {
    // Validate tenantId for security
    if (
        !config.tenantId ||
        typeof config.tenantId !== 'string' ||
        config.tenantId.trim() === ''
    ) {
        throw new Error(
            'Valid tenantId is required for multi-tenant isolation',
        );
    }

    // Sanitize tenantId - only allow alphanumeric, underscore, and hyphen
    if (!/^[a-zA-Z0-9_-]+$/.test(config.tenantId)) {
        throw new Error('TenantId contains invalid characters');
    }

    return {
        executionId:
            config.executionId ||
            `exec_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        tenantId: config.tenantId,
        startTime: Date.now(),
        status: 'RUNNING' as const,
        cleanup: async () => {
            // Simple cleanup placeholder
        },
    };
}

/**
 * Unified context factory for various context types
 */
export class UnifiedContextFactory {
    createBaseContext(config: { tenantId: string; executionId?: string }) {
        return createBaseContext(config);
    }

    createWorkflowContext(config: { tenantId: string; workflowName: string }) {
        return {
            ...createBaseContext(config),
            workflowName: config.workflowName,
            data: {},
            currentSteps: [],
            completedSteps: [],
            failedSteps: [],
            metadata: {},
        };
    }
}
