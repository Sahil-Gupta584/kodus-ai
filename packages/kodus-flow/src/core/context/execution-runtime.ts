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
import { sessionService } from './services/session-service.js';
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
    HealthStatus,
    ServiceHealth,
    ToolExecutionContext,
    ContextValueUpdate,
} from './execution-runtime-types.js';
import {
    ToolMetadataForLLM,
    ToolMetadataForPlanner,
} from '../types/tool-types.js';

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

    constructor(private readonly memoryManager: MemoryManager) {}
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
            const foundSession = sessionService.findSessionByThread(
                thread.id,
                tenantId || 'default',
            );

            if (!foundSession) {
                const session = sessionService.createSession(
                    tenantId || 'default',
                    thread.id,
                    { agentName: agentName },
                );

                const newSessionContext = sessionService.getSessionContext(
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
            stateManager: stateService,
            memoryManager: this.memoryManager,
            executionRuntime: this, // ✅ Add reference to ExecutionRuntime
            signal: new AbortController().signal,
            cleanup: async () => {
                await stateService.clear();
            },
        };

        // 🚀 Add initial conversation entry if session exists and input provided
        if (sessionId && input) {
            sessionService.addConversationEntry(
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

    /**
     * Get available tools from current context
     */
    getAvailableTools(): ToolMetadataForPlanner[] {
        return this.currentContext?.availableTools || [];
    }

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
     * Get session history from current context
     */
    getSessionHistory(): unknown[] {
        return this.currentContext?.system?.conversationHistory || [];
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

            // 🚀 Gather context values collected via addContextValue
            const enrichedContext =
                this.buildEnrichedContextFromValues(agentContext);

            // 📊 Get tool information with metadata
            const enhancedTools = await this.enhanceToolsWithContext(
                agentContext.availableTools || [],
            );

            // 🧠 Generate execution hints from collected context
            const executionHints = this.generateExecutionHintsFromContext(
                input,
                enrichedContext,
            );

            // // 📚 Generate learning context from collected patterns
            // const learningContext =
            //     this.generateLearningContextFromValues(enrichedContext);

            const plannerContext: PlannerExecutionContext = {
                // Base context
                input,
                history: [],
                iterations: 0,
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
                },

                executionHints,
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

            this.logger.debug('Rich planner context built', {
                agentIdentity: !!enrichedContext.agentIdentity,
                toolsEnhanced: enhancedTools.length,
                contextTypesUsed: Object.keys(enrichedContext).length,
                executionHints: Object.keys(executionHints).length,
                // learningPatterns: learningContext.successPatterns.length,
            });

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
    // ──────────────────────────────────────────────────────────────────────────────

    async health(): Promise<HealthStatus> {
        const sessionHealth = await this.checkSessionHealth();
        const stateHealth = await this.checkStateHealth();
        const memoryHealth = await this.checkMemoryHealth();

        const overall = this.determineOverallHealth([
            sessionHealth,
            stateHealth,
            memoryHealth,
        ]);

        return {
            overall,
            services: {
                session: sessionHealth,
                state: stateHealth,
                memory: memoryHealth,
            },
            metrics: {
                activeExecutions: this.executions.size,
                versionsStored: this.versions.size,
                memoryUsage: process.memoryUsage().heapUsed,
                averageResponseTime: 0, // TODO: implement
            },
        };
    }

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
        agentIdentity?: AgentContext['agentIdentity'];
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
            enriched.agentIdentity =
                identityUpdate?.value as AgentContext['agentIdentity'];
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
    private async enhanceToolsWithContext(
        basicTools: AgentContext['availableTools'],
    ): Promise<
        import('../../engine/planning/planner-factory.js').EnhancedToolInfo[]
    > {
        if (!basicTools) return [];

        return basicTools.map((tool) => {
            // Get tool-specific context values
            const toolTypeValues = this.contextValues.get(`tool:${tool.name}`);

            const enhanced: import('../../engine/planning/planner-factory.js').EnhancedToolInfo =
                {
                    name: tool.name,
                    description: tool.description,
                    schema: tool.inputSchema,
                    categories: tool.categories,
                    dependencies: tool.dependencies,

                    // Add usage analytics if available
                    usageCount: 0,
                    lastSuccess: undefined,
                    errorRate: 0,
                    avgResponseTime: 0,
                    lastUsed: undefined,
                };

            // Enhance with collected tool values if available
            if (toolTypeValues) {
                for (const [key, update] of toolTypeValues) {
                    switch (key) {
                        case 'usage_count':
                            enhanced.usageCount = update.value as number;
                            break;
                        case 'last_success':
                            enhanced.lastSuccess = update.value as boolean;
                            break;
                        case 'error_rate':
                            enhanced.errorRate = update.value as number;
                            break;
                        case 'avg_response_time':
                            enhanced.avgResponseTime = update.value as number;
                            break;
                        case 'last_used':
                            enhanced.lastUsed = update.value as number;
                            break;
                    }
                }
            }

            return enhanced;
        });
    }

    /**
     * Generate execution hints from collected context
     */
    private generateExecutionHintsFromContext(
        input: string,
        enrichedContext: ReturnType<typeof this.buildEnrichedContextFromValues>,
    ): import('../../engine/planning/planner-factory.js').ExecutionHints {
        const hints: import('../../engine/planning/planner-factory.js').ExecutionHints =
            {};

        // Extract current goal from agent identity
        if (enrichedContext.agentIdentity?.goal) {
            hints.currentGoal = enrichedContext.agentIdentity.goal;
        }

        // Determine urgency based on input and context
        if (
            input.toLowerCase().includes('urgent') ||
            input.toLowerCase().includes('quickly')
        ) {
            hints.userUrgency = 'high';
        } else if (
            input.toLowerCase().includes('when possible') ||
            input.toLowerCase().includes('eventually')
        ) {
            hints.userUrgency = 'low';
        } else {
            hints.userUrgency = 'medium';
        }

        // Set user preferences based on agent identity and collected values
        if (enrichedContext.agentIdentity || enrichedContext.userPreferences) {
            hints.userPreferences = {
                preferredStyle:
                    enrichedContext.agentIdentity?.style === 'formal'
                        ? 'formal'
                        : enrichedContext.agentIdentity?.style === 'casual'
                          ? 'casual'
                          : 'technical',
                verbosity: enrichedContext.agentIdentity?.personality?.includes(
                    'concise',
                )
                    ? 'concise'
                    : enrichedContext.agentIdentity?.personality?.includes(
                            'detailed',
                        )
                      ? 'detailed'
                      : 'verbose',
                riskTolerance:
                    enrichedContext.agentIdentity?.personality?.includes(
                        'careful',
                    )
                        ? 'conservative'
                        : enrichedContext.agentIdentity?.personality?.includes(
                                'bold',
                            )
                          ? 'aggressive'
                          : 'moderate',
            };
        }

        // Add environment state from execution context
        if (enrichedContext.executionState) {
            hints.environmentState = enrichedContext.executionState as Record<
                string,
                unknown
            >;
        }

        return hints;
    }

    /**
     * Generate learning context from collected values
     */
    // private generateLearningContextFromValues(
    //     enrichedContext: ReturnType<typeof this.buildEnrichedContextFromValues>,
    // ): import('../../engine/planning/planner-factory.js').LearningContext {
    //     const context: import('../../engine/planning/planner-factory.js').LearningContext =
    //         {
    //             commonMistakes: [],
    //             successPatterns: [],
    //             userFeedback: [],
    //             preferredTools: [],
    //         };

    //     // Extract patterns from tool results
    //     if (
    //         enrichedContext.toolResults &&
    //         enrichedContext.toolResults.length > 0
    //     ) {
    //         // Analyze successful tool patterns
    //         const successfulTools = enrichedContext.toolResults
    //             .filter((result: any) => result?.success === true)
    //             .map((result: any) => result?.toolName)
    //             .filter(Boolean);

    //         context.preferredTools = [...new Set(successfulTools)].slice(0, 5);

    //         // Extract success patterns
    //         context.successPatterns = enrichedContext.toolResults
    //             .filter((result: any) => result?.success === true)
    //             .map(
    //                 (result: any) =>
    //                     `${result?.toolName || 'tool'} succeeded with ${JSON.stringify(result?.parameters || {})}`,
    //             )
    //             .slice(0, 5);

    //         // Extract common mistakes
    //         const failedTools = enrichedContext.toolResults
    //             .filter((result: unknown) => result?.success === false)
    //             .map(
    //                 (result: unknown) =>
    //                     `${result?.toolName || 'tool'} failed: ${result?.error || 'unknown error'}`,
    //             )
    //             .slice(0, 5);

    //         context.commonMistakes = [...new Set(failedTools)];
    //     }

    //     // Extract user feedback from conversation history
    //     if (
    //         enrichedContext.conversationHistory &&
    //         enrichedContext.conversationHistory.length > 0
    //     ) {
    //         context.userFeedback = enrichedContext.conversationHistory
    //             .filter((entry: unknown) => entry?.type === 'feedback')
    //             .map((entry: unknown) => entry?.content || entry?.input)
    //             .filter(Boolean)
    //             .slice(0, 3);
    //     }

    //     return context;
    // }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🔧 PRIVATE HELPER METHODS
    // ──────────────────────────────────────────────────────────────────────────────

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

    // private async routeToStorage(
    //     version: ContextVersion,
    //     data: ContextData,
    // ): Promise<void> {
    //     // Route to State if needed
    //     if (this.routingStrategy.shouldStoreInState(version.source, data)) {
    //         const namespace = this.routingStrategy.getStateNamespace(
    //             version.source,
    //             data,
    //         );
    //         const key = this.routingStrategy.getStateKey(version.source, data);

    //         await this.stateService.set(namespace, key, data.data);
    //         version.storage.state = { namespace, key };
    //     }

    //     // Route to Session if needed
    //     if (this.routingStrategy.shouldStoreInSession(version.source, data)) {
    //         // Add to conversation history
    //         // const entry = {
    //         //     timestamp: data.timestamp,
    //         //     input: data.data.input || data.data,
    //         //     output: data.data.output || null,
    //         //     agentName: data.metadata?.agentName,
    //         //     metadata: data.metadata,
    //         // };
    //         // This would need sessionId from context - for now, skip
    //         // await this.sessionService.addConversationEntry(sessionId, entry);
    //     }

    //     // Route to Memory if needed
    //     if (this.routingStrategy.shouldStoreInMemory(version.source, data)) {
    //         const memoryType = this.routingStrategy.getMemoryType(
    //             version.source,
    //             data,
    //         );
    //         const memoryMetadata = this.routingStrategy.getMemoryMetadata(
    //             version.source,
    //             data,
    //         );

    //         const memoryItem = {
    //             content: JSON.stringify(data.data),
    //             type: memoryType,
    //             entityId: data.executionId,
    //             sessionId: data.metadata?.sessionId,
    //             metadata: memoryMetadata,
    //         };

    //         const storedItem = await this.memoryManager.store(memoryItem);
    //         version.storage.memory = {
    //             itemId: storedItem.id,
    //             type: memoryType,
    //         };
    //     }
    // }

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
    // private async getSessionContext(
    //     agentContext: AgentContext,
    // ): Promise<unknown> {
    //     if (!agentContext.sessionId) {
    //         return {
    //             conversationHistory: [],
    //             metadata: { lastActivity: new Date(), totalInteractions: 0 },
    //         };
    //     }

    //     try {
    //         const sessionContext = this.sessionService.getSessionContext(
    //             agentContext.sessionId,
    //         );
    //         return {
    //             conversationHistory: sessionContext.conversationHistory || [],
    //             metadata: sessionContext.metadata || {},
    //         };
    //     } catch (error) {
    //         this.logger.warn('Failed to get session context', {
    //             sessionId: agentContext.sessionId,
    //             error: error instanceof Error ? error.message : String(error),
    //         });
    //         return {
    //             conversationHistory: [],
    //             metadata: { lastActivity: new Date(), totalInteractions: 0 },
    //         };
    //     }
    // }

    // private async getWorkingMemory(
    //     agentContext: AgentContext,
    // ): Promise<unknown> {
    //     try {
    //         const executionSteps =
    //             (await agentContext.stateManager.get('execution', 'steps')) ||
    //             [];
    //         const temporaryData =
    //             (await agentContext.stateManager.getNamespace('temp')) || {};
    //         const toolResults =
    //             (await agentContext.stateManager.get('tools', 'results')) || [];

    //         return {
    //             executionSteps,
    //             temporaryData,
    //             toolResults,
    //             currentState: {
    //                 currentStep: 'planning',
    //                 progress: 0,
    //                 nextActions: [],
    //                 blockers: [],
    //             },
    //         };
    //     } catch (error) {
    //         this.logger.warn('Failed to get working memory', {
    //             error: error instanceof Error ? error.message : String(error),
    //         });
    //         return {
    //             executionSteps: [],
    //             temporaryData: {},
    //             toolResults: [],
    //             currentState: {
    //                 currentStep: 'planning',
    //                 progress: 0,
    //                 nextActions: [],
    //                 blockers: [],
    //             },
    //         };
    //     }
    // }

    // private async getUserContext(agentContext: AgentContext): Promise<any> {
    //     try {
    //         const userMemoryItems = await this.memoryManager.query({
    //             entityId: agentContext.user?.id || agentContext.tenantId,
    //             type: 'user_preference',
    //         });

    //         const preferences: UserPreferences = {
    //             language: 'en',
    //             timezone: 'UTC',
    //             outputFormat: 'text',
    //             verbosity: 'normal',
    //             tools: { preferred: [], blocked: [] },
    //         };

    //         const patterns: UserPattern[] = [];
    //         const history: unknown[] = [];

    //         // Extract preferences from memory items
    //         for (const item of userMemoryItems) {
    //             try {
    //                 const data = JSON.parse(item.content);
    //                 if (data.type === 'preference') {
    //                     Object.assign(preferences, data.preferences);
    //                 }
    //             } catch (parseError) {
    //                 // Skip invalid JSON
    //             }
    //         }

    //         return { preferences, patterns, history };
    //     } catch (error) {
    //         this.logger.warn('Failed to get user context', {
    //             error: error instanceof Error ? error.message : String(error),
    //         });
    //         return {
    //             preferences: {
    //                 language: 'en',
    //                 timezone: 'UTC',
    //                 outputFormat: 'text',
    //                 verbosity: 'normal',
    //                 tools: { preferred: [], blocked: [] },
    //             },
    //             patterns: [],
    //             history: [],
    //         };
    //     }
    // }

    // private async getToolIntelligence(
    //     agentContext: AgentContext,
    // ): Promise<Record<string, unknown>> {
    //     const intelligence: Record<string, unknown> = {};

    //     for (const tool of agentContext.availableTools || []) {
    //         try {
    //             const patterns = await this.getSuccessPatterns(
    //                 `tool:${tool.name}`,
    //             );
    //             const failures = await this.getFailureAnalysis(
    //                 `tool:${tool.name}`,
    //             );

    //             intelligence[tool.name] = {
    //                 successRate: patterns.length > 0 ? 0.8 : 0.5, // Default
    //                 commonParameters: {},
    //                 userPatterns: [],
    //                 recentFailures: failures,
    //             };
    //         } catch {
    //             intelligence[tool.name] = {
    //                 successRate: 0.5,
    //                 commonParameters: {},
    //                 userPatterns: [],
    //                 recentFailures: [],
    //             };
    //         }
    //     }

    //     return intelligence;
    // }

    // Query helpers
    // private async getFromSession(
    //     pathParts: string[],
    //     path: ContextPath,
    // ): Promise<unknown> {
    //     // Implement session-specific path resolution
    //     return null;
    // }

    // private async getFromState(
    //     pathParts: string[],
    //     path: ContextPath,
    // ): Promise<unknown> {
    //     // Implement state-specific path resolution
    //     return null;
    // }

    // private async getFromMemory(
    //     pathParts: string[],
    //     path: ContextPath,
    // ): Promise<unknown> {
    //     // Implement memory-specific path resolution
    //     return null;
    // }

    // private async getFromExecution(
    //     pathParts: string[],
    //     path: ContextPath,
    // ): Promise<unknown> {
    //     // Implement execution-specific path resolution
    //     if (path.executionId) {
    //         return this.executions.get(path.executionId);
    //     }
    //     return null;
    // }

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

    // private extractPatterns(
    //     versions: ContextVersion[],
    //     type: string,
    // ): Pattern[] {
    //     // Simplified pattern extraction
    //     return [];
    // }

    // private extractFailurePatterns(
    //     versions: ContextVersion[],
    // ): FailurePattern[] {
    //     // Simplified failure pattern extraction
    //     return [];
    // }

    // private async getUserToolPreferences(
    //     toolName: string,
    //     agentContext: AgentContext,
    // ): Promise<unknown> {
    //     return {};
    // }

    // Health check helpers
    private async checkSessionHealth(): Promise<ServiceHealth> {
        return {
            status: 'healthy',
            responseTime: 0,
            errorRate: 0,
            lastCheck: new Date(),
        };
    }

    private async checkStateHealth(): Promise<ServiceHealth> {
        return {
            status: 'healthy',
            responseTime: 0,
            errorRate: 0,
            lastCheck: new Date(),
        };
    }

    private async checkMemoryHealth(): Promise<ServiceHealth> {
        const isHealthy = await this.memoryManager.isHealthy();
        return {
            status: isHealthy ? 'healthy' : 'unhealthy',
            responseTime: 0,
            errorRate: 0,
            lastCheck: new Date(),
        };
    }

    private determineOverallHealth(
        serviceHealths: ServiceHealth[],
    ): 'healthy' | 'degraded' | 'unhealthy' {
        const unhealthyCount = serviceHealths.filter(
            (h) => h.status === 'unhealthy',
        ).length;
        const degradedCount = serviceHealths.filter(
            (h) => h.status === 'degraded',
        ).length;

        if (unhealthyCount > 0) return 'unhealthy';
        if (degradedCount > 0) return 'degraded';
        return 'healthy';
    }
}

/**
 * 🔄 Default Storage Routing Strategy
 */
// class DefaultStorageRoutingStrategy implements StorageRoutingStrategy {
//     shouldStoreInState(source: ContextSource, data: unknown): boolean {
//         // Store working data in state
//         return ['agent', 'tool'].includes(source);
//     }

//     shouldStoreInSession(source: ContextSource, data: unknown): boolean {
//         // Store conversation data in session
//         return ['user', 'llm'].includes(source);
//     }

//     shouldStoreInMemory(source: ContextSource, data: unknown): boolean {
//         // Store long-term patterns in memory
//         return data.metadata?.persistLongTerm === true;
//     }

//     getStateNamespace(source: ContextSource, data: unknown): string {
//         switch (source) {
//             case 'agent':
//                 return 'agent';
//             case 'tool':
//                 return 'tools';
//             default:
//                 return 'general';
//         }
//     }

//     getStateKey(source: ContextSource, data: unknown): string {
//         return data.metadata?.key || `${source}_${Date.now()}`;
//     }

//     getMemoryType(source: ContextSource, data: unknown): string {
//         return data.metadata?.memoryType || `${source}_data`;
//     }

//     getMemoryMetadata(
//         source: ContextSource,
//         data: unknown,
//     ): Record<string, unknown> {
//         return {
//             source,
//             timestamp: data.timestamp,
//             executionId: data.executionId,
//         };
//     }
// }
