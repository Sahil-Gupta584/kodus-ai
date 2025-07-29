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
import { getGlobalMemoryManager } from '../memory/memory-manager.js';
import { SessionService } from './services/session-service.js';
import { ContextStateService } from './services/state-service.js';
import { ExecutionRuntime } from './execution-runtime-simple.js';

import type {
    AgentContext,
    AgentExecutionOptions,
} from '../types/agent-types.js';
import type { Session } from './services/session-service.js';
import type { MemoryManager } from '../memory/memory-manager.js';
import type { ToolEngine } from '../../engine/tools/tool-engine.js';

/**
 * ContextBuilder - Single entry point for all context creation
 * Coordinates existing services without implementing business logic
 */
export class ContextBuilder {
    private static instance: ContextBuilder;
    private readonly logger = createLogger('ContextBuilder');

    // Service instances (singleton pattern)
    private memoryManager: MemoryManager;
    private sessionService: SessionService;
    private toolEngine?: ToolEngine;

    private constructor() {
        // Initialize global services once
        this.memoryManager = getGlobalMemoryManager();
        this.sessionService = new SessionService({
            maxSessions: 1000,
            sessionTimeout: 30 * 60 * 1000, // 30 min
            enableAutoCleanup: true,
        });

        this.logger.info('ContextBuilder initialized');
    }

    static getInstance(): ContextBuilder {
        if (!ContextBuilder.instance) {
            ContextBuilder.instance = new ContextBuilder();
        }
        return ContextBuilder.instance;
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
            let session = this.sessionService.getSessionByThread(threadId);
            if (!session) {
                session = this.sessionService.createSession(
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
        debugger;
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
                    const nsMap = await workingMemory.getNamespace(namespace);
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
                    this.sessionService.addConversationEntry(
                        session.id,
                        input,
                        output,
                    );
                },
                getHistory: async () => {
                    const currentSession = this.sessionService.getSession(
                        session.id,
                    );
                    return currentSession?.conversationHistory || [];
                },
                updateMetadata: async (metadata: Record<string, unknown>) => {
                    this.sessionService.updateSessionMetadata(
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
                    await this.memoryManager.store({
                        content: {
                            toolName,
                            params,
                            result,
                            success,
                            timestamp: Date.now(),
                        },
                        type: 'tool_usage',
                        sessionId: session.id,
                        tenantId: session.tenantId,
                    });
                },
                plannerStep: async (step: unknown) => {
                    await this.memoryManager.store({
                        content: { step, timestamp: Date.now() },
                        type: 'planner_step',
                        sessionId: session.id,
                        tenantId: session.tenantId,
                    });
                },
                error: async (error: Error, context?: unknown) => {
                    await this.memoryManager.store({
                        content: {
                            error: error.message,
                            stack: error.stack,
                            context,
                            timestamp: Date.now(),
                        },
                        type: 'error',
                        sessionId: session.id,
                        tenantId: session.tenantId,
                    });
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
                    // Store in memory instead of runtime
                    await this.memoryManager.store({
                        content: update,
                        type: 'context_update',
                        sessionId: session.id,
                        tenantId: session.tenantId,
                    });
                },
                storeToolUsagePattern: async (
                    toolName,
                    input,
                    output,
                    success,
                    duration,
                ) => {
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
