/**
 * @file context-builder.ts
 * @description ContextBuilder - Single entry point for context creation
 *
 * RESPONSABILIDADES:
 * - Coordenar serviços existentes (Memory, Session, State)
 * - Criar AgentContext com APIs limpas
 * - Gerenciar lifecycle de contextos
 * - Eliminar circular references
 */

import { createLogger } from '../../observability/index.js';
import { IdGenerator } from '../../utils/id-generator.js';
import {
    getGlobalMemoryManager,
    MemoryManager,
    setGlobalMemoryManager,
} from '../memory/memory-manager.js';
import { SessionService } from './services/session-service.js';
import { ContextStateService } from './services/state-service.js';
import { ExecutionRuntime } from './execution-runtime-simple.js';

import type {
    AgentContext,
    AgentExecutionOptions,
} from '../types/agent-types.js';
import type { Session, SessionConfig } from './services/session-service.js';
import type { ToolEngine } from '../../engine/tools/tool-engine.js';
import { StorageType } from '../storage/index.js';

/**
 * ✅ CLEAN: ContextBuilder usa as interfaces corretas de cada serviço
 * AMBOS usam o padrão adapterType + options consistente
 */
export interface ContextBuilderConfig {
    // Memory usa o padrão adapterType + adapterConfig
    memory?: {
        adapterType?: StorageType;
        adapterConfig?: {
            connectionString?: string;
            options?: Record<string, unknown>;
        };
    };
    // Session usa SessionConfig (que agora também usa adapterType + adapterOptions)
    session?: SessionConfig;
}

/**
 * ContextBuilder - Single entry point for all context creation
 * Coordinates existing services without implementing business logic
 */
export class ContextBuilder {
    private static instance: ContextBuilder;
    private readonly logger = createLogger('ContextBuilder');
    private readonly _config: ContextBuilderConfig;

    // Service instances (singleton pattern)
    private memoryManager!: MemoryManager;
    private sessionService: SessionService;
    private toolEngine?: ToolEngine;

    private constructor(config: ContextBuilderConfig = {}) {
        this._config = config;

        // ✅ Initialize MemoryManager with provided config
        if (config.memory) {
            this.initializeMemoryManager(config.memory);
        } else {
            this.memoryManager = getGlobalMemoryManager();
        }
        const sessionConfig = {
            maxSessions: 1000,
            sessionTimeout: 30 * 60 * 1000, // 30 min
            enableAutoCleanup: true,
            // ✅ Apply session config from constructor - SessionConfig já tem as propriedades corretas
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

    /**
     * ✅ NEW: Reset instance to allow reconfiguration
     */
    static resetInstance(): void {
        ContextBuilder.instance = undefined as unknown as ContextBuilder;
    }

    /**
     * ✅ NEW: Configure services after instantiation
     */
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

    /**
     * Get current configuration
     */
    getConfig(): ContextBuilderConfig {
        return this._config;
    }

    /**
     * ✅ NEW: Initialize MemoryManager with provided config
     */
    private initializeMemoryManager(
        memoryConfig: NonNullable<ContextBuilderConfig['memory']>,
    ): void {
        const memoryManager = new MemoryManager({
            // ✅ Use correct properties from MemoryManager constructor
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

    /**
     * Main entry point - creates complete agent context
     */
    async createAgentContext(
        options: AgentExecutionOptions,
    ): Promise<AgentContext> {
        this.logger.info('Creating agent context', {
            agentName: options.agentName,
            threadId: options.thread?.id,
            tenantId: options.tenantId,
        });

        try {
            // 1. Initialize memory if needed
            await this.memoryManager.initialize();

            // 2. Get or create session
            const threadId = options.thread?.id || 'default';
            let session =
                await this.sessionService.getSessionByThread(threadId);
            if (!session) {
                session = await this.sessionService.createSession(
                    options.tenantId || 'default',
                    threadId,
                    {}, // metadata será passado via options.userContext
                );
            }

            // 3. Create working memory for this execution
            const workingMemory = new ContextStateService(
                { sessionId: session.id },
                { maxNamespaceSize: 1000, maxNamespaces: 50 },
            );

            // 4. Create execution runtime (lifecycle manager)
            const executionRuntime = new ExecutionRuntime({
                sessionId: session.id,
                tenantId: options.tenantId || 'default',
                threadId,
            });

            // 5. Build clean AgentContext with service references
            const agentContext = this.buildAgentContext({
                session,
                workingMemory,
                executionRuntime,
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

    /**
     * Build AgentContext with clean APIs and no circular references
     */
    private buildAgentContext({
        session,
        workingMemory,
        executionRuntime,
        options,
    }: {
        session: Session;
        workingMemory: ContextStateService;
        executionRuntime: ExecutionRuntime;
        options: AgentExecutionOptions;
    }): AgentContext {
        const invocationId = IdGenerator.executionId(); // usando executionId como invocationId

        return {
            // ===== EXECUTION DATA =====
            sessionId: session.id,
            tenantId: session.tenantId,
            correlationId: options.correlationId || IdGenerator.correlationId(),
            thread: options.thread,
            agentName: options.agentName,
            invocationId,

            // ===== CLEAN SERVICE APIS (NO CIRCULAR REFERENCES) =====
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
                    return item?.value; // MemoryItem tem 'value', não 'content'
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
                    return items.map((item) => item.value); // MemoryItem tem 'value'
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
                    // ✅ SIMPLE: Tool usage goes to Session only - single source of truth
                    await this.sessionService.addConversationEntry(
                        session.id,
                        { type: 'tool_call', toolName, params },
                        { type: 'tool_result', result, success },
                        'system',
                        { timestamp: Date.now() },
                    );
                },
                plannerStep: async (step: unknown) => {
                    // ✅ CORRECTED: Planner steps are part of conversation - goes to Session
                    await this.sessionService.addConversationEntry(
                        session.id,
                        { type: 'planner_step', step },
                        null,
                        'system',
                        { timestamp: Date.now() },
                    );
                },
                error: async (error: Error, context?: unknown) => {
                    // ✅ SIMPLE: Errors go to Session for historical tracking
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

            cleanup: async () => {
                await executionRuntime.cleanup();
                // Note: workingMemory uses WeakMap, so it cleans up automatically
            },

            // // ===== BACKWARD COMPATIBILITY (NO CIRCULAR REFS) =====
            // system: {
            //     sessionId: session.id,
            //     threadId: session.threadId,
            //     executionId: executionRuntime.getExecutionInfo().executionId,
            //     conversationHistory: session.conversationHistory,
            //     iteration: 0,
            //     toolsUsed: [],
            // },

            // Provide safe access to runtime info (not the runtime itself)
            executionRuntime: {
                addContextValue: async (update) => {
                    // Context updates são temporários - vão para State
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
                    toolName,
                    input,
                    output,
                    success,
                    duration,
                ) => {
                    // Padrões de uso de ferramentas são conhecimento de longo prazo - vão para Memory
                    await this.memoryManager.store({
                        content: { toolName, input, output, success, duration },
                        type: 'tool_usage_pattern',
                        sessionId: session.id,
                        tenantId: session.tenantId,
                    });
                },
                storeExecutionPattern: async (
                    patternType,
                    action,
                    result,
                    context,
                ) => {
                    // Padrões de execução são conhecimento de longo prazo - vão para Memory
                    await this.memoryManager.store({
                        content: { patternType, action, result, context },
                        type: 'execution_pattern',
                        sessionId: session.id,
                        tenantId: session.tenantId,
                    });
                },
                setState: async (namespace, key, value) => {
                    await workingMemory.set(namespace, key, value);
                },
            },

            agentIdentity: undefined, // ✅ Will be set by agent-core from AgentDefinition
            agentExecutionOptions: options,
            availableToolsForLLM: this.toolEngine?.getToolsForLLM() || [],
        };
    }

    /**
     * Set ToolEngine for providing tools to AgentContext
     */
    setToolEngine(toolEngine: ToolEngine): void {
        this.toolEngine = toolEngine;
        this.logger.info('ToolEngine set for ContextBuilder', {
            hasToolEngine: !!toolEngine,
            toolCount: toolEngine?.listTools().length || 0,
        });
    }

    /**
     * Get service instances for debugging/monitoring
     */
    getServices() {
        return {
            memoryManager: this.memoryManager,
            sessionService: this.sessionService,
            toolEngine: this.toolEngine,
        };
    }

    /**
     * Health check for all services
     */
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

// ===== SINGLETON INSTANCE =====
export const contextBuilder = ContextBuilder.getInstance();

// ===== MAIN ENTRY FUNCTION =====
export const createAgentContext = (
    options: AgentExecutionOptions,
): Promise<AgentContext> => {
    return contextBuilder.createAgentContext(options);
};
