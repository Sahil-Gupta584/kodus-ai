/**
 * @file execution-runtime.ts
 * @description Unified ExecutionRuntime facade over existing services
 */

import { createLogger } from '../../observability/index.js';
import type {
    AgentContext,
    AgentExecutionOptions,
} from '../types/agent-types.js';
import type { AgentIdentity } from '../types/agent-definition.js';
import type { ConversationHistory } from './services/session-service.js';
import type { PlannerExecutionContext } from '../../engine/planning/planner-factory.js';
import type { MemoryManager } from '../memory/memory-manager.js';
import type { SystemContext } from '../types/base-types.js';
import { ContextStateService } from './services/state-service.js';
import { SessionService } from './services/session-service.js';
import { IdGenerator } from '../../utils/id-generator.js';
import type {
    ExecutionRuntime as IExecutionRuntime,
    ContextSource,
    ContextData,
    ContextVersion,
    ExecutionEvent,
    ContextPath,
    ContextQuery,
    ContextResult,
    Pattern,
    FailurePattern,
    ExecutionStep,
    ExecutionResult,
    ToolExecutionContext,
    ContextValueUpdate,
    HealthStatus,
} from './execution-runtime-types.js';
import type { ExecutionHistoryEntry } from '../../engine/planning/planner-factory.js';
import { ToolMetadataForLLM } from '../types/tool-types.js';

/**
 * 🎯 ExecutionRuntime - Unified facade over existing context services
 *
 * Acts as orchestrator and coordinator for:
 * - SessionService (conversation & threads)
 * - ContextStateService (working memory & namespaces)
 * - MemoryManager (long-term knowledge & patterns)
 */
export class ExecutionRuntime implements IExecutionRuntime {
    private readonly logger = createLogger('ExecutionRuntime');
    private readonly versions = new Map<string, ContextVersion>();
    private readonly executions = new Map<string, ExecutionStep[]>();
    private readonly contextValues = new Map<
        string,
        Map<string, ContextValueUpdate>
    >();
    private currentContext?: AgentContext;

    // ✅ ADICIONAR: Componentes da Engine Layer
    private readonly sessionService: SessionService;
    private readonly memoryManager: MemoryManager;
    private currentStateService?: ContextStateService;

    constructor(memoryManager: MemoryManager) {
        this.memoryManager = memoryManager;

        // ✅ Inicializar SessionService (Engine Layer)
        this.sessionService = new SessionService({
            maxSessions: 1000,
            sessionTimeout: 30 * 60 * 1000, // 30 min
            enableAutoCleanup: true,
        });
    }
    health(): Promise<HealthStatus> {
        throw new Error('Method not implemented.');
    }
    getSuccessPatterns(_component: string): Promise<Pattern[]> {
        throw new Error('Method not implemented.');
    }
    getFailureAnalysis(_component: string): Promise<FailurePattern[]> {
        throw new Error('Method not implemented.');
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🚀 AGENT CONTEXT INITIALIZATION - Main Responsibility
    // ──────────────────────────────────────────────────────────────────────────────

    async initializeAgentContext(
        agent: {
            name: string;
            identity?: AgentIdentity;
            config?: {
                enableSession?: boolean;
                enableState?: boolean;
                enableMemory?: boolean;
            };
        },
        input: unknown,
        config: AgentExecutionOptions,
    ): Promise<AgentContext> {
        const {
            agentName,
            tenantId,
            thread,
            correlationId,
            sessionId,
            userContext,
        } = config;

        // Agent configuration from AgentDefinition.config
        const enableSession = agent?.config?.enableSession ?? true;
        const enableMemory = agent?.config?.enableMemory ?? true;

        this.logger.info('Initializing agent context via ExecutionRuntime', {
            agentName: agentName,
            tenantId: tenantId,
            enableSession: enableSession,
            enableMemory: enableMemory,
        });

        const contextKey = {
            agentName: agentName,
            tenantId: tenantId,
            threadId: thread?.id,
            correlationId: correlationId,
        };

        // 1. Create state service for this agent
        const stateService = new ContextStateService(contextKey, {
            maxNamespaceSize: 1000,
            maxNamespaces: 50,
        });

        // Save reference for getStateService()
        this.currentStateService = stateService;

        // 2. Create or get session if enabled
        let sessionContext: {
            id: string | undefined;
            threadId: string | undefined;
            tenantId: string;
            conversationHistory: unknown[];
        } = {
            id: sessionId,
            threadId: thread?.id,
            tenantId: tenantId || 'default',
            conversationHistory: [],
        };

        if (enableSession && thread) {
            const foundSession = this.sessionService.findSessionByThread(
                thread.id,
                tenantId || 'default',
            );

            if (!foundSession) {
                const session = this.sessionService.createSession(
                    tenantId || 'default',
                    thread.id,
                    { agentName: agentName },
                );

                const newSessionContext = this.sessionService.getSessionContext(
                    session.id,
                );

                if (newSessionContext) {
                    sessionContext = {
                        id: newSessionContext.id,
                        threadId: thread.id,
                        tenantId: tenantId || 'default',
                        conversationHistory:
                            newSessionContext.conversationHistory || [],
                    };
                }

                this.logger.debug('Created new session', {
                    sessionId: session.id,
                    threadId: thread.id,
                });
            } else {
                sessionContext = {
                    id: foundSession.id,
                    threadId: thread.id,
                    tenantId: tenantId || 'default',
                    conversationHistory: foundSession.conversationHistory || [],
                };
                this.logger.debug('Found existing session', {
                    sessionId: foundSession.id,
                    threadId: thread.id,
                });
            }
        }

        // 3. Create system context
        const systemContext: SystemContext = {
            executionId: IdGenerator.executionId(),
            correlationId: correlationId || IdGenerator.correlationId(),
            sessionId: sessionContext?.id || sessionId,
            threadId: thread.id,
            tenantId: tenantId || 'default',
            conversationHistory: (sessionContext?.conversationHistory ||
                []) as ConversationHistory[],
            startTime: Date.now(),
            status: 'running',
        };

        // RuntimeContext removed - using SystemContext directly

        // 4. Build unified agent context
        const agentContext: AgentContext = {
            tenantId: tenantId || 'default',
            correlationId: correlationId || IdGenerator.correlationId(),
            startTime: Date.now(),
            agentName: agentName,
            invocationId: IdGenerator.executionId(),
            user: userContext || {},
            system: systemContext,
            executionRuntime: this, // ✅ SINGLE REFERENCE TO RUNTIME
            signal: new AbortController().signal,
            cleanup: async () => {
                await stateService.clear();
            },
        };

        // 🚀 Add initial conversation entry if session exists and input provided
        if (sessionId && input) {
            this.sessionService.addConversationEntry(
                sessionId,
                input,
                null, // output será adicionado depois
                agentName,
            );
            this.logger.debug('Initial conversation entry added', {
                sessionId,
                agentName: agentName,
            });
        }

        // 5. Initialize execution tracking
        await this.startExecution(systemContext.executionId, agentContext);

        // 6. Save current context for getter methods
        this.currentContext = agentContext;

        // ✅ ADD: Log após inicialização bem-sucedida
        console.log(
            '🔧 EXECUTION RUNTIME - AGENT CONTEXT INITIALIZED SUCCESS',
            {
                agentName: agentName,
                executionId: systemContext.executionId,
                sessionId,
                threadId: thread.id,
                hasStateManager: !!stateService,
                hasMemoryManager: !!this.memoryManager,
                hasExecutionRuntime: !!this,
                trace: {
                    source: 'execution-runtime',
                    step: 'agent-context-initialized',
                    timestamp: Date.now(),
                },
            },
        );

        this.logger.info('Agent context initialized successfully', {
            agentName: agentName,
            executionId: systemContext.executionId,
            sessionId,
            threadId: thread.id,
        });

        return agentContext;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🔧 DYNAMIC CONTEXT UPDATES - Agent Communication
    // ──────────────────────────────────────────────────────────────────────────────

    async addContextValue(update: ContextValueUpdate): Promise<void> {
        // Auto-generate timestamp if not provided
        const contextUpdate: ContextValueUpdate = {
            ...update,
            timestamp: update.timestamp || Date.now(),
            metadata: {
                ...update.metadata,
                addedAt: new Date().toISOString(),
            },
        };

        // Store in internal context values map
        if (!this.contextValues.has(update.type)) {
            this.contextValues.set(update.type, new Map());
        }

        const typeMap = this.contextValues.get(update.type)!;
        typeMap.set(update.key, contextUpdate);

        // Also track as an event for versioning
        await this.append('agent' as ContextSource, {
            timestamp: new Date(contextUpdate.timestamp!),
            executionId: 'dynamic-context', // Will be improved with real execution tracking
            data: {
                type: 'context_update',
                contextType: update.type,
                contextKey: update.key,
                value: update.value,
            },
            metadata: {
                source: 'addContextValue',
                ...contextUpdate.metadata,
            },
        });

        this.logger.debug('Context value added', {
            type: update.type,
            key: update.key,
            hasValue: !!update.value,
            metadata: contextUpdate.metadata,
        });
    }

    /**
     * Get context value by type and key
     */
    getContextValue(type: string, key: string): ContextValueUpdate | undefined {
        return this.contextValues.get(type)?.get(key);
    }

    /**
     * Get all context values for a type
     */
    getContextType(type: string): Map<string, ContextValueUpdate> | undefined {
        return this.contextValues.get(type);
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🔧 SIMPLE API FOR COMPONENTS - Getter Methods
    // ──────────────────────────────────────────────────────────────────────────────

    getAvailableToolsForLLM(): ToolMetadataForLLM[] {
        return this.currentContext?.availableToolsForLLM || [];
    }

    getAgentIdentity(): AgentIdentity {
        return this.currentContext?.agentIdentity || {};
    }

    /**
     * Get user context data
     */
    getUserContext(): Record<string, unknown> {
        return this.currentContext?.user || Object.create(null);
    }

    /**
     * Get tool results from context values
     */
    getToolResults(): ContextValueUpdate[] {
        const toolValues = this.contextValues.get('tools');
        return toolValues ? Array.from(toolValues.values()) : [];
    }

    /**
     * Get memory manager instance
     * Required by plan-execute-planner for memory context
     */
    getMemoryManager(): MemoryManager {
        return this.memoryManager;
    }

    /**
     * Get session service instance
     * Required for session-based context
     */
    getSessionService(): SessionService {
        return this.sessionService;
    }

    /**
     * Get state service instance from current context
     * Required for working memory access
     */
    getStateService(): ContextStateService {
        if (!this.currentStateService) {
            throw new Error(
                'State service not available - context not initialized',
            );
        }
        return this.currentStateService;
    }

    /**
     * Get session history from current context
     */
    getSessionHistory(): unknown[] {
        return this.currentContext?.system?.conversationHistory || [];
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🚀 CONVENIENCE METHODS - Direct access to common operations
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Get value from memory by key
     */
    async getMemory(key: string): Promise<unknown> {
        const memoryManager = this.getMemoryManager();
        const item = await memoryManager.get(key);
        return item?.value;
    }

    /**
     * Store value in memory
     */
    async setMemory(
        key: string,
        value: unknown,
        type: string = 'general',
    ): Promise<void> {
        const memoryManager = this.getMemoryManager();
        await memoryManager.store({
            key,
            content: value,
            type,
            tenantId: this.currentContext?.tenantId,
            sessionId: this.currentContext?.system?.sessionId,
        });
    }

    /**
     * Get value from state
     */
    async getState(namespace: string, key: string): Promise<unknown> {
        const stateService = this.getStateService();
        return stateService.get(namespace, key);
    }

    /**
     * Set value in state
     */
    async setState(
        namespace: string,
        key: string,
        value: unknown,
    ): Promise<void> {
        const stateService = this.getStateService();
        await stateService.set(namespace, key, value);
    }

    /**
     * Get conversation history from session
     */
    async getConversationHistory(): Promise<unknown[]> {
        return this.getSessionHistory();
    }

    /**
     * ✅ Get real planner history from current context
     */
    getPlannerHistory(): ExecutionHistoryEntry[] {
        // ✅ Get planner history from current context
        if (!this.currentContext) return [];

        // ✅ Try to get planner history from state service
        let plannerHistory: unknown;
        try {
            const stateService = this.getStateService();
            plannerHistory = stateService.get('planner', 'history');
        } catch {
            // State service not available, continue to fallback
            plannerHistory = null;
        }

        if (Array.isArray(plannerHistory)) {
            return plannerHistory as ExecutionHistoryEntry[];
        }

        // ✅ Fallback: try to get from session service
        const sessionHistory = this.getSessionHistory();
        if (Array.isArray(sessionHistory) && sessionHistory.length > 0) {
            // ✅ Convert session history to planner format (simplified)
            return sessionHistory.map((entry: unknown) => {
                const typedEntry = entry as Record<string, unknown>;
                return {
                    thought: {
                        reasoning: `Previous execution: ${String(typedEntry.input || 'unknown')}`,
                        action: {
                            type: 'final_answer' as const,
                            content: 'Previous execution completed',
                        },
                        confidence: 0.8,
                    },
                    action: {
                        type: 'final_answer' as const,
                        content: 'Previous execution completed',
                    },
                    result: {
                        type: 'final_answer' as const,
                        content: String(
                            typedEntry.output || 'Previous execution completed',
                        ),
                        metadata: {
                            timestamp:
                                Number(typedEntry.timestamp) || Date.now(),
                        },
                    },
                    observation: {
                        isComplete: true,
                        isSuccessful: true,
                        feedback: 'Previous execution completed successfully',
                        shouldContinue: false,
                    },
                };
            });
        }

        return [];
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 📝 EVENT COLLECTION & VERSIONING
    // ──────────────────────────────────────────────────────────────────────────────

    async append(
        source: ContextSource,
        data: ContextData,
    ): Promise<ContextVersion> {
        const version = this.createVersion(source, data);

        try {
            // Route to appropriate storage based on strategy
            // await this.routeToStorage(version, data);

            // Store version metadata
            this.versions.set(version.id, version);

            // Update execution trace
            await this.updateExecutionTrace(version);

            this.logger.debug('Context data appended', {
                versionId: version.id,
                source,
                executionId: data.executionId,
                storage: version.storage,
            });

            return version;
        } catch (error) {
            this.logger.error('Failed to append context data', error as Error, {
                source,
                executionId: data.executionId,
            });
            throw error;
        }
    }

    async observe(event: ExecutionEvent): Promise<void> {
        await this.append(event.source, {
            timestamp: event.timestamp,
            executionId: event.executionId,
            data: event.data,
            metadata: {
                eventType: event.type,
            },
        });
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🧠 RICH CONTEXT BUILDING
    // ──────────────────────────────────────────────────────────────────────────────

    async buildPlannerContext(
        input: string,
        agentContext: AgentContext,
    ): Promise<PlannerExecutionContext> {
        try {
            this.logger.debug(
                'Building rich planner context with collected values',
                {
                    input: input.substring(0, 100),
                    agentName: agentContext.agentName,
                    collectContextTypes: Array.from(this.contextValues.keys()),
                },
            );

            // // 🚀 Gather context values collected via addContextValue
            // const enrichedContext =
            //     this.buildEnrichedContextFromValues(agentContext);

            // // 📊 Get tool information with metadata
            // const enhancedTools = await this.enhanceToolsWithContext(
            //     agentContext.availableTools || [],
            // );

            // // 📚 Generate learning context from collected patterns
            // const learningContext =
            //     this.generateLearningContextFromValues(enrichedContext);

            // ✅ CARREGAR HISTÓRICO REAL DO PLANNER (se disponível)
            const plannerHistory = this.getPlannerHistory() || [];

            // ✅ CARREGAR CONTEXTO DA SESSÃO (se disponível)
            const sessionContext = await this.getSessionContext(agentContext);

            const plannerContext: PlannerExecutionContext = {
                // Base context
                input,
                history: plannerHistory,
                iterations: plannerHistory.length,
                maxIterations: 10,
                plannerMetadata: {
                    thread: {
                        id: agentContext.system.threadId,
                        metadata: { description: 'Agent execution thread' },
                    },
                    agentName: agentContext.agentName,
                    correlationId: agentContext.correlationId,
                    tenantId: agentContext.tenantId,
                    startTime: Date.now(),
                    plannerType: 'react', // Will be set properly by planner
                    sessionContext, // ✅ ADICIONAR: Contexto da sessão
                },

                isComplete: false,

                // Methods
                update: (thought, result, observation) => {
                    plannerContext.history.push({
                        thought,
                        action: thought.action || {
                            type: 'final_answer',
                            content: 'No action available',
                        },
                        result,
                        observation,
                    });
                },
                getCurrentSituation: () => {
                    const recentHistory = plannerContext.history.slice(-3);
                    return recentHistory
                        .map(
                            (entry) =>
                                `Action: ${JSON.stringify(entry.action)} -> Result: ${JSON.stringify(entry.result)}`,
                        )
                        .join('\n');
                },
                getFinalResult: () => {
                    const lastEntry =
                        plannerContext.history[
                            plannerContext.history.length - 1
                        ];
                    return {
                        success: lastEntry?.observation.isComplete || false,
                        result: lastEntry?.result,
                        iterations: plannerContext.iterations,
                        totalTime:
                            Date.now() -
                            plannerContext.plannerMetadata.startTime!,
                        thoughts: plannerContext.history.map((h) => h.thought),
                        metadata: {
                            plannerType:
                                plannerContext.plannerMetadata.plannerType,
                            toolCallsCount: plannerContext.history.filter(
                                (h) => h.action.type === 'tool_call',
                            ).length,
                            errorsCount: plannerContext.history.filter(
                                (h) => h.result.type === 'error',
                            ).length,
                        },
                    };
                },
            };

            return plannerContext;
        } catch (error) {
            this.logger.error(
                'Failed to build planner context',
                error as Error,
                {
                    agentName: agentContext.agentName,
                },
            );
            throw error;
        }
    }

    async buildToolContext(
        toolName: string,
        agentContext: AgentContext,
    ): Promise<ToolExecutionContext> {
        // Get tool-specific intelligence and patterns
        // const toolPatterns = await this.getSuccessPatterns(`tool:${toolName}`);
        // const toolFailures = await this.getFailureAnalysis(`tool:${toolName}`);

        // Build enhanced tool context
        return {
            toolName,
            agentContext,
            // successPatterns: toolPatterns,
            // recentFailures: toolFailures,
            // userPreferences: await this.getUserToolPreferences(
            //     toolName,
            //     agentContext,
            // ),
        };
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🔍 UNIFIED QUERY API
    // ──────────────────────────────────────────────────────────────────────────────

    async get(path: ContextPath): Promise<unknown> {
        const pathParts = path.path.split('.');
        const rootComponent = pathParts[0];

        try {
            switch (rootComponent) {
                // case 'session':
                //     return await this.getFromSession(pathParts.slice(1), path);
                // case 'state':
                // case 'working':
                //     return await this.getFromState(pathParts.slice(1), path);
                // case 'memory':
                // case 'user':
                //     return await this.getFromMemory(pathParts.slice(1), path);
                // case 'execution':
                //     return await this.getFromExecution(
                //         pathParts.slice(1),
                //         path,
                //     );
                default:
                    throw new Error(
                        `Unknown context path root: ${rootComponent}`,
                    );
            }
        } catch (error) {
            this.logger.warn('Failed to get context path', {
                path: path.path,
                error: error instanceof Error ? error.message : String(error),
            });
            return undefined;
        }
    }

    async query(filter: ContextQuery): Promise<ContextResult[]> {
        const results: ContextResult[] = [];

        // Filter versions based on query criteria
        for (const version of this.versions.values()) {
            if (this.matchesQuery(version, filter)) {
                results.push({
                    version,
                    data: version.data,
                    relevance: this.calculateRelevance(version, filter),
                });
            }
        }

        // Sort by relevance and apply limit
        results.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));

        if (filter.limit) {
            return results.slice(
                filter.offset || 0,
                (filter.offset || 0) + filter.limit,
            );
        }

        return results;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 📊 ANALYSIS & LEARNING
    // ──────────────────────────────────────────────────────────────────────────────

    // async getSuccessPatterns(component: string): Promise<Pattern[]> {
    //     const successVersions = Array.from(this.versions.values()).filter(
    //         (v) =>
    //             (v.metadata?.success === true &&
    //                 (v.data as any)?.component === component) ||
    //             v.source === component,
    //     );

    //     return this.extractPatterns(successVersions, 'success');
    // }

    // async getFailureAnalysis(component: string): Promise<FailurePattern[]> {
    //     const failureVersions = Array.from(this.versions.values()).filter(
    //         (v) =>
    //             (v.metadata?.success === false &&
    //                 (v.data as any)?.component === component) ||
    //             v.source === component,
    //     );

    //     return this.extractFailurePatterns(failureVersions);
    // }

    async getExecutionTrace(executionId?: string): Promise<ExecutionStep[]> {
        if (executionId) {
            return this.executions.get(executionId) || [];
        }

        // Return all execution steps sorted by timestamp
        const allSteps: ExecutionStep[] = [];
        for (const steps of this.executions.values()) {
            allSteps.push(...steps);
        }

        return allSteps.sort(
            (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
        );
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🔄 LIFECYCLE MANAGEMENT
    // ──────────────────────────────────────────────────────────────────────────────

    async startExecution(
        executionId: string,
        agentContext: AgentContext,
    ): Promise<void> {
        this.executions.set(executionId, []);

        await this.append('system', {
            timestamp: new Date(),
            executionId,
            data: {
                event: 'execution_started',
                agentName: agentContext.agentName,
                tenantId: agentContext.tenantId,
            },
        });

        this.logger.info('Execution started', {
            executionId,
            agentName: agentContext.agentName,
        });
    }

    async endExecution(
        executionId: string,
        result: ExecutionResult,
    ): Promise<void> {
        await this.append('system', {
            timestamp: new Date(),
            executionId,
            data: {
                event: 'execution_ended',
                result,
                duration: result.duration,
                status: result.status,
            },
        });

        this.logger.info('Execution ended', {
            executionId,
            status: result.status,
            duration: result.duration,
        });
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🏥 HEALTH & MONITORING
    // ─────────────────────────────────────────────────────────────────────────────

    async cleanup(): Promise<void> {
        this.logger.info('Starting ExecutionRuntime cleanup');

        // Clear old versions (keep last 1000)
        if (this.versions.size > 1000) {
            const sortedVersions = Array.from(this.versions.entries()).sort(
                ([, a], [, b]) => b.timestamp.getTime() - a.timestamp.getTime(),
            );

            for (let i = 1000; i < sortedVersions.length; i++) {
                const versionEntry = sortedVersions[i];
                if (versionEntry) {
                    this.versions.delete(versionEntry[0]);
                }
            }
        }

        // Clear old executions (keep last 100)
        if (this.executions.size > 100) {
            const oldestExecutions = Array.from(this.executions.keys()).slice(
                100,
            );
            for (const executionId of oldestExecutions) {
                this.executions.delete(executionId);
            }
        }

        this.logger.info('ExecutionRuntime cleanup completed', {
            versionsRetained: this.versions.size,
            executionsRetained: this.executions.size,
        });
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🧠 CONTEXT ENRICHMENT METHODS
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Build enriched context from collected values
     */
    private buildEnrichedContextFromValues(_agentContext: AgentContext): {
        agentIdentity?: AgentIdentity;
        userPreferences?: unknown;
        toolResults?: unknown[];
        executionState?: unknown;
        conversationHistory?: unknown[];
    } {
        const enriched: ReturnType<typeof this.buildEnrichedContextFromValues> =
            {};

        // Get agent identity from collected values
        const agentValues = this.contextValues.get('agent');

        if (agentValues?.has('identity')) {
            const identityUpdate = agentValues.get('identity');
            enriched.agentIdentity = identityUpdate?.value as AgentIdentity;
        }

        // Get user preferences
        const userValues = this.contextValues.get('user');

        if (userValues?.has('preferences')) {
            const preferencesUpdate = userValues.get('preferences');
            enriched.userPreferences = preferencesUpdate?.value;
        }

        // Get tool results
        const toolValues = this.contextValues.get('tools');

        if (toolValues) {
            enriched.toolResults = Array.from(toolValues.values()).map(
                (update) => update.value,
            );
        }

        // Get execution state
        const executionValues = this.contextValues.get('execution');

        if (executionValues?.has('state')) {
            const stateUpdate = executionValues.get('state');
            enriched.executionState = stateUpdate?.value;
        }

        // Get conversation history from session values
        const sessionValues = this.contextValues.get('session');

        if (sessionValues?.has('conversation')) {
            const conversationUpdate = sessionValues.get('conversation');
            enriched.conversationHistory =
                conversationUpdate?.value as unknown[];
        }

        return enriched;
    }

    /**
     * Enhance tools with context and usage patterns
     */
    // private async enhanceToolsWithContext(
    //     basicTools: AgentContext['availableTools'],
    // ): Promise<EnhancedToolInfo[]> {
    //     if (!basicTools) return [];

    //     return basicTools.map((tool) => {
    //         // Get tool-specific context values
    //         const toolTypeValues = this.contextValues.get(`tool:${tool.name}`);

    //         const enhanced: EnhancedToolInfo = {
    //             name: tool.name,
    //             description: tool.description,
    //             schema: tool.inputSchema,
    //             categories: tool.categories,
    //             dependencies: tool.dependencies,

    //             // Add usage analytics if available
    //             usageCount: 0,
    //             lastSuccess: undefined,
    //             errorRate: 0,
    //             avgResponseTime: 0,
    //             lastUsed: undefined,
    //         };

    //         // Enhance with collected tool values if available
    //         if (toolTypeValues) {
    //             for (const [key, update] of toolTypeValues) {
    //                 switch (key) {
    //                     case 'usage_count':
    //                         enhanced.usageCount = update.value as number;
    //                         break;
    //                     case 'last_success':
    //                         enhanced.lastSuccess = update.value as boolean;
    //                         break;
    //                     case 'error_rate':
    //                         enhanced.errorRate = update.value as number;
    //                         break;
    //                     case 'avg_response_time':
    //                         enhanced.avgResponseTime = update.value as number;
    //                         break;
    //                     case 'last_used':
    //                         enhanced.lastUsed = update.value as number;
    //                         break;
    //                 }
    //             }
    //         }

    //         return enhanced;
    //     });
    // }

    private createVersion(
        source: ContextSource,
        data: ContextData,
    ): ContextVersion {
        const version = this.getNextVersionNumber(data.executionId);
        const timestamp = data.timestamp || new Date();

        return {
            id: `${data.executionId}_v${version}_${source}_${timestamp.getTime()}`,
            executionId: data.executionId,
            version,
            source,
            timestamp,
            data: data.data,
            metadata: data.metadata,
            storage: {},
            links: {},
        };
    }

    private getNextVersionNumber(executionId: string): number {
        const executionVersions = Array.from(this.versions.values()).filter(
            (v) => v.executionId === executionId,
        );

        return executionVersions.length + 1;
    }

    private async updateExecutionTrace(version: ContextVersion): Promise<void> {
        const steps = this.executions.get(version.executionId) || [];

        const step: ExecutionStep = {
            step: steps.length + 1,
            executionId: version.executionId,
            component: version.source,
            action: (version.data as { action?: string })?.action || 'unknown',
            versionId: version.id,
            status: version.metadata?.success === false ? 'error' : 'success',
            timestamp: version.timestamp,
            data: version.data,
            duration: version.metadata?.duration,
        };

        steps.push(step);
        this.executions.set(version.executionId, steps);
    }

    // Context building helpers
    private async getSessionContext(
        agentContext: AgentContext,
    ): Promise<unknown> {
        const sessionId = agentContext.system?.sessionId;
        if (!sessionId) {
            return {
                conversationHistory: [],
                metadata: { lastActivity: new Date(), totalInteractions: 0 },
            };
        }

        try {
            const sessionContext =
                this.sessionService.getSessionContext(sessionId);
            if (!sessionContext) {
                return {
                    conversationHistory: [],
                    metadata: {
                        lastActivity: new Date(),
                        totalInteractions: 0,
                    },
                };
            }

            return {
                conversationHistory: sessionContext.conversationHistory || [],
                metadata: sessionContext.metadata || {},
            };
        } catch (error) {
            this.logger.warn('Failed to get session context', {
                sessionId,
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                conversationHistory: [],
                metadata: { lastActivity: new Date(), totalInteractions: 0 },
            };
        }
    }

    private matchesQuery(
        version: ContextVersion,
        filter: ContextQuery,
    ): boolean {
        if (filter.source && !filter.source.includes(version.source))
            return false;
        if (filter.executionId && version.executionId !== filter.executionId)
            return false;
        if (
            filter.success !== undefined &&
            version.metadata?.success !== filter.success
        )
            return false;

        if (filter.timeRange) {
            const timestamp = version.timestamp.getTime();
            if (
                timestamp < filter.timeRange.from.getTime() ||
                timestamp > filter.timeRange.to.getTime()
            )
                return false;
        }

        return true;
    }

    private calculateRelevance(
        version: ContextVersion,
        filter: ContextQuery,
    ): number {
        let relevance = 1.0;

        // More recent = higher relevance
        const ageHours =
            (Date.now() - version.timestamp.getTime()) / (1000 * 60 * 60);
        relevance *= Math.max(0.1, 1.0 - ageHours / 24); // Decay over 24 hours

        // Exact matches get boost
        if (filter.executionId === version.executionId) relevance *= 2.0;
        if (filter.agentName === version.metadata?.agentName) relevance *= 1.5;

        return relevance;
    }

    // private determineOverallHealth(
    //     serviceHealths: ServiceHealth[],
    // ): 'healthy' | 'degraded' | 'unhealthy' {
    //     const unhealthyCount = serviceHealths.filter(
    //         (h) => h.status === 'unhealthy',
    //     ).length;
    //     const degradedCount = serviceHealths.filter(
    //         (h) => h.status === 'degraded',
    //     ).length;

    //     if (unhealthyCount > 0) return 'unhealthy';
    //     if (degradedCount > 0) return 'degraded';
    //     return 'healthy';
    // }
}
