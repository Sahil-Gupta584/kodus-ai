import { createLogger, getObservability } from '../../observability/index.js';
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

import { ExecutionTracker } from './execution-tracker.js';

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
    private readonly contextBuilderConfig: ContextBuilderConfig;

    private memoryManager!: MemoryManager;
    private sessionService: SessionService;
    private toolEngine?: ToolEngine;

    private constructor(config: ContextBuilderConfig = {}) {
        this.contextBuilderConfig = config;

        if (config.memory) {
            this.initializeMemoryManager(config.memory);
        } else {
            this.memoryManager = getGlobalMemoryManager();
        }

        const sessionConfig = {
            maxSessions: 1000,
            sessionTimeout: 60 * 60 * 1000,
            enableAutoCleanup: true,
            ...config.session,
        };

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
        ContextBuilder.resetInstance();
        return ContextBuilder.getInstance(config);
    }

    getConfig(): ContextBuilderConfig {
        return this.contextBuilderConfig;
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
            correlationId: options.correlationId,
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
                this.logger.info(
                    'No existing session found, creating new session',
                    {
                        threadId,
                        tenantId,
                    },
                );
                session = await this.sessionService.createSession(
                    tenantId,
                    threadId,
                    {},
                );
                // Conversation history initialized as empty array in SessionService
            } else {
                this.logger.info('Found existing session, reusing', {
                    sessionId: session.id,
                    threadId,
                    tenantId,
                });
            }

            const workingState = new ContextStateService(
                { sessionId: session.id },
                { maxNamespaceSize: 1000, maxNamespaces: 50 },
            );

            const agentContext = await this.buildAgentContext({
                session,
                workingState,
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
        workingState,
        options,
    }: {
        session: Session;
        workingState: ContextStateService;
        options: AgentExecutionOptions;
    }): Promise<AgentContext> {
        const invocationId = IdGenerator.executionId();

        const observability = getObservability();
        observability.updateContextWithExecution(
            invocationId,
            session.id,
            session.tenantId,
        );

        const executionTracker = new ExecutionTracker();

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
                        await workingState.set(namespace, key, value);
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
                // Pure working memory operations - NO automatic persistence
                get: <T>(namespace: string, key: string, _threadId?: string) =>
                    workingState.get<T>(namespace, key),
                set: async (
                    namespace: string,
                    key: string,
                    value: unknown,
                    _threadId?: string,
                ) => {
                    await workingState.set(namespace, key, value);
                },
                clear: (namespace: string) => workingState.clear(namespace),
                getNamespace: async (namespace: string) => {
                    const nsMap = workingState.getNamespace(namespace);
                    return nsMap ? new Map(Object.entries(nsMap)) : undefined;
                },
                // EXPLICIT persistence methods
                persist: async (namespace?: string) => {
                    if (namespace) {
                        // Persist specific namespace
                        const data = workingState.getNamespace(namespace);
                        if (data) {
                            await this.sessionService.updateSessionContext(
                                session.id,
                                {
                                    [namespace]: data,
                                },
                            );
                        }
                    } else {
                        // Persist all namespaces
                        const allData = workingState.getAllNamespaces();
                        await this.sessionService.updateSessionContext(
                            session.id,
                            allData,
                        );
                    }
                },
                // Check if there are unsaved changes
                hasChanges: () => workingState.hasUnsavedChanges(),
            },

            conversation: {
                addMessage: async (
                    role: 'user' | 'assistant' | 'system',
                    content: string,
                    metadata?: Record<string, unknown>,
                ) => {
                    await this.sessionService.addMessage(
                        session.id,
                        role,
                        content,
                        metadata,
                        session.tenantId,
                    );
                },
                getHistory: async () => {
                    return await this.sessionService.getConversationHistory(
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
                // Store tool usage patterns in long-term memory
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
                // Store execution patterns in long-term memory
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
                // REMOVED duplicated methods - use state.set() directly
            },
            agentIdentity: undefined,
            agentExecutionOptions: options,
            allTools: this.toolEngine?.listTools() || [],
            stepExecution: executionTracker,
            messageContext: executionTracker,
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
