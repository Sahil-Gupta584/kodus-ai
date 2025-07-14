/**
 * @module engine/router
 * @description Intelligent routing system with Zod schemas
 */

import { z } from 'zod';
import { createLogger } from '../../observability/index.js';
import { IdGenerator } from '../../utils/id-generator.js';
import { cosineSimilarity } from '../../core/memory/vector-store.js';
import type {
    AgentContext,
    AgentThought,
} from '../../core/types/common-types.js';
import type {
    AgentDefinition,
    AgentId,
    AgentMetrics,
} from '../../core/types/agent-types.js';
import { getAgentSummary } from '../../core/types/agent-types.js';
import { createAgentId } from '../../core/index.js';
import type { MultiKernelHandler } from '../core/multi-kernel-handler.js';
import type {
    ToolContext,
    ToolExecutionStrategy,
    ToolExecutionRule,
} from '../../core/types/tool-types.js';

/**
 * Critérios de seleção de agentes
 */
export interface AgentSelectionCriteria {
    /** Capacidades específicas requeridas */
    requiredCapabilities?: string[];
    /** Tags requeridas */
    requiredTags?: string[];
    /** Agentes a serem excluídos */
    excludedAgents?: AgentId[];
    /** Capacidades opcionais que dão bônus */
    preferredCapabilities?: string[];
    /** Tags opcionais que dão bônus */
    preferredTags?: string[];
    /** Máximo de agentes a selecionar */
    maxAgents?: number;
    /** Score mínimo para seleção */
    minScore?: number;
}

/**
 * Custom rule function for advanced routing
 */
export type CustomRuleFn<
    TInput = unknown,
    TSchema extends z.ZodType = z.ZodType,
> = (
    input: TInput,
    availableRoutes: string[],
    router: Router<TSchema>,
) => string | Promise<string>;

/**
 * Semantic similarity configuration
 */
export interface SemanticSimilarityConfig {
    /** Enable semantic similarity matching */
    enabled: boolean;
    /** Similarity threshold (0-1) */
    threshold?: number;
    /** Embedding model to use */
    model?: string;
    /** Cache embeddings */
    cacheEmbeddings?: boolean;
}

/**
 * Router callback functions
 */
export interface RouterCallbacks<TInput = unknown, TOutput = unknown> {
    /** Called before routing starts */
    onRouteStart?: (input: TInput, criteria: AgentSelectionCriteria) => void;
    /** Called when route is selected */
    onRouteSelected?: (
        route: string,
        confidence: number,
        reasoning: string,
    ) => void;
    /** Called when agent execution starts */
    onAgentExecutionStart?: (route: string, agentId: string) => void;
    /** Called when agent execution completes */
    onAgentExecutionComplete?: (
        route: string,
        result: TOutput,
        duration: number,
    ) => void;
    /** Called when routing completes */
    onRouteComplete?: (result: RoutingResult<TOutput>) => void;
    /** Called when routing fails */
    onRouteError?: (error: Error, input: TInput) => void;
}

/**
 * Router as Tool - para integração com agentes (API Target V2)
 */
export interface RouterAsTool {
    name: string;
    description: string;
    schema: z.ZodType;
    execute: (input: unknown, context?: AgentContext) => Promise<RoutingResult>;
}

/**
 * Router result handler para agentes
 */
export type RouterResultHandler = (
    routingResult: RoutingResult,
    context: AgentContext,
) => Promise<{ action: { type: string; [key: string]: unknown } }>;

/**
 * Router configuration
 */
export interface RouterConfig<TSchema extends z.ZodType = z.ZodType> {
    name: string;
    description?: string;
    routes: Record<
        string,
        AgentId | AgentDefinition<unknown, unknown, unknown>
    >;
    intentSchema: TSchema;
    fallback?: AgentId | AgentDefinition<unknown, unknown, unknown>;

    // Advanced routing options
    routingStrategy?:
        | 'first_match'
        | 'best_match'
        | 'llm_decision'
        | 'custom_rules'
        | 'semantic_similarity';
    confidenceThreshold?: number;

    // Agent selection criteria
    defaultCriteria?: AgentSelectionCriteria;

    // Custom routing logic
    customRules?: CustomRuleFn<z.infer<TSchema>, TSchema>[];

    // Semantic similarity
    semanticSimilarity?: SemanticSimilarityConfig;

    // Callbacks
    callbacks?: RouterCallbacks<z.infer<TSchema>>;

    // API Target V2 - Router as Tool
    asTool?: boolean;
    toolName?: string;
    toolDescription?: string;

    // API Target V2 - Router result handler
    onRouterResult?: RouterResultHandler;

    // ===== 🚀 NEW: TOOL EXECUTION STRATEGY OPTIONS =====

    // Default tool execution strategy for agents managed by this router
    defaultToolExecutionStrategy?:
        | 'parallel'
        | 'sequential'
        | 'conditional'
        | 'adaptive';

    // Tool execution constraints and preferences
    toolExecutionConstraints?: {
        maxConcurrency?: number;
        defaultTimeout?: number;
        resourceLimits?: {
            cpu?: number;
            memory?: number;
            network?: number;
        };
        qualityThreshold?: number;
        failFast?: boolean;
    };

    // Enable automatic tool strategy optimization
    enableAdaptiveToolStrategy?: boolean;

    // Tool execution rules for this router
    toolExecutionRules?: Array<{
        id: string;
        name: string;
        description: string;
        condition: string | ((context: ToolContext) => boolean);
        strategy: 'parallel' | 'sequential' | 'conditional' | 'adaptive';
        priority: number;
        enabled: boolean;
        metadata?: Record<string, unknown>;
    }>;

    // Routing logic (optional custom function) - DEPRECATED: use customRules
    routeLogic?: (
        input: z.infer<TSchema>,
        availableRoutes: AgentId[],
    ) => AgentId | Promise<AgentId>;
}

/**
 * Routing result
 */
export interface RoutingResult<T = unknown> {
    selectedRoute: string;
    confidence: number;
    reasoning: string;
    result: T;
    metadata: {
        routerId: string;
        executionId: string;
        duration: number;
        inputValidation: boolean;
        selectionCriteria?: AgentSelectionCriteria;
        availableAgents?: string[];
        excludedAgents?: string[];
    };
}

/**
 * Router implementation
 */
export class Router<TSchema extends z.ZodType = z.ZodType> {
    private readonly logger = createLogger('Router');
    private readonly agents = new Map<
        string,
        AgentDefinition<unknown, unknown, unknown>
    >();
    private readonly routeNames: string[];
    private readonly agentCapabilities = new Map<string, string[]>();
    private readonly agentTags = new Map<string, string[]>();
    private readonly agentMetrics = new Map<string, AgentMetrics>();
    private kernelHandler?: MultiKernelHandler;

    constructor(
        public readonly config: RouterConfig<TSchema>,
        agentRegistry: Map<
            string,
            AgentDefinition<unknown, unknown, unknown>
        > = new Map(),
        kernelHandler?: MultiKernelHandler,
    ) {
        this.routeNames = Object.keys(config.routes);

        // Resolve agent references
        Object.entries(config.routes).forEach(([route, agentOrName]) => {
            if (typeof agentOrName === 'string') {
                const agent = agentRegistry.get(agentOrName);
                if (agent) {
                    this.agents.set(route, agent);
                    this.initializeAgentMetadata(route, agent);
                } else {
                    this.logger.warn('Agent not found in registry', {
                        routerName: config.name,
                        route,
                        agentName: agentOrName,
                    });
                }
            } else {
                this.agents.set(route, agentOrName);
                this.initializeAgentMetadata(route, agentOrName);
            }
        });

        this.kernelHandler = kernelHandler;

        // Initialize tool execution rules from config
        if (config.toolExecutionRules) {
            config.toolExecutionRules.forEach((rule) => {
                this.addToolExecutionRule({
                    id: rule.id,
                    name: rule.name,
                    description: rule.description,
                    condition: rule.condition,
                    strategy: rule.strategy,
                    priority: rule.priority,
                    enabled: rule.enabled,
                    metadata: rule.metadata,
                });
            });
        }

        // Create default tool execution rules if adaptive strategy is enabled
        if (config.enableAdaptiveToolStrategy) {
            this.createDefaultToolExecutionRules();
        }

        this.logger.info('Router created', {
            name: config.name,
            routes: this.routeNames,
            strategy: config.routingStrategy || 'first_match',
            hasKernelHandler: !!kernelHandler,
            defaultToolStrategy: config.defaultToolExecutionStrategy,
            adaptiveToolStrategy: config.enableAdaptiveToolStrategy,
            toolExecutionRulesCount: this.toolExecutionRules.size,
        });
    }

    /**
     * Route input to appropriate agent and execute
     */
    async route<TInput extends z.infer<TSchema>, TOutput = unknown>(
        input: TInput,
        context?: Partial<AgentContext>,
        criteria?: AgentSelectionCriteria,
    ): Promise<RoutingResult<TOutput>> {
        const executionId = IdGenerator.executionId();
        const startTime = Date.now();

        // Merge criteria with defaults
        const finalCriteria = this.mergeCriteria(criteria);

        // Emit routing start event via KernelHandler
        if (this.kernelHandler) {
            this.kernelHandler.emit('router.start', {
                routerId: this.config.name,
                executionId,
                inputType: typeof input,
                criteria: finalCriteria,
            });
        }

        this.logger.info('Starting routing', {
            routerId: this.config.name,
            executionId,
            inputType: typeof input,
            criteria: finalCriteria,
        });

        try {
            // 1. Create router context inline
            const routerContext = {
                routerName: this.config.name,
                availableRoutes: this.routeNames,
                selectionCriteria: finalCriteria as Record<string, unknown>,
                routingStrategy: this.config.routingStrategy || 'best_match',
                tenantId: context?.tenantId || 'default',
                executionId,
                correlationId:
                    context?.correlationId || IdGenerator.correlationId(),
                addRouteHistory: (
                    route: string,
                    confidence: number,
                    reasoning: string,
                ) => {
                    this.logger.debug('Route history added', {
                        route,
                        confidence,
                        reasoning,
                    });
                },
            };

            // Adicionar histórico de roteamento
            routerContext.addRouteHistory('start', 1.0, 'Routing initiated');

            // 2. Validate input against schema
            const validatedInput = this.config.intentSchema.parse(input);

            // 3. Filter available routes based on criteria
            const availableRoutes = this.filterRoutesByCriteria(finalCriteria);

            if (availableRoutes.length === 0) {
                throw new Error(
                    'No routes available that meet the selection criteria',
                );
            }

            // 3. Determine route
            const selectedRoute = await this.selectRoute(
                validatedInput,
                availableRoutes,
            );

            // 4. Get agent for route
            const agent = this.agents.get(selectedRoute);
            if (!agent) {
                throw new Error(`No agent found for route: ${selectedRoute}`);
            }

            // 5. Execute agent
            const agentContext = {
                executionId,
                correlationId:
                    context?.correlationId || IdGenerator.correlationId(),
                availableTools: context?.availableTools || [],
                state: context?.state || new Map(),
                logger: this.logger,
                routerId: this.config.name,
                selectedRoute,
                routingMetadata: {
                    inputValidation: true,
                    availableRoutes: this.routeNames,
                    selectionCriteria: finalCriteria,
                },
                // Required AgentContext properties
                agentName: selectedRoute,
                invocationId: IdGenerator.executionId(),
                tenantId: context?.tenantId || 'default',
                startTime: Date.now(),
                status: 'RUNNING' as const,
                signal: new AbortController().signal,
            } as unknown as AgentContext & {
                routerId: string;
                selectedRoute: string;
                routingMetadata: Record<string, unknown>;
            };

            const thought = await agent.think(validatedInput, agentContext);

            // 6. Extract result
            let result: TOutput;
            if (thought.action.type === 'final_answer') {
                result = thought.action.content as TOutput;
            } else {
                throw new Error(
                    `Agent ${agent.name} did not provide final answer`,
                );
            }

            const duration = Date.now() - startTime;

            // Emit routing success event via KernelHandler
            if (this.kernelHandler) {
                this.kernelHandler.emit('router.success', {
                    routerId: this.config.name,
                    executionId,
                    selectedRoute,
                    duration,
                    criteria: finalCriteria,
                    confidence: this.calculateConfidence(thought),
                });
            }

            this.logger.info('Routing completed successfully', {
                routerId: this.config.name,
                executionId,
                selectedRoute,
                duration,
                criteria: finalCriteria,
            });

            // Adicionar histórico de roteamento bem-sucedido
            routerContext.addRouteHistory(
                selectedRoute,
                this.calculateConfidence(thought),
                thought.reasoning,
            );

            return {
                selectedRoute,
                confidence: this.calculateConfidence(thought),
                reasoning: thought.reasoning,
                result,
                metadata: {
                    routerId: this.config.name,
                    executionId,
                    duration,
                    inputValidation: true,
                    selectionCriteria: finalCriteria,
                    availableAgents: availableRoutes,
                    excludedAgents: finalCriteria.excludedAgents,
                },
            };
        } catch (error) {
            const duration = Date.now() - startTime;

            // Emit routing error event via KernelHandler
            if (this.kernelHandler) {
                this.kernelHandler.emit('router.error', {
                    routerId: this.config.name,
                    executionId,
                    duration,
                    criteria: finalCriteria,
                    error: (error as Error).message,
                });
            }

            this.logger.error('Routing failed', error as Error, {
                routerId: this.config.name,
                executionId,
                duration,
                criteria: finalCriteria,
            });

            // Try fallback if available
            if (this.config.fallback) {
                return await this.executeFallback(
                    input as TInput,
                    context,
                    executionId,
                    finalCriteria,
                );
            }

            throw error;
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 🏷️ AGENT METADATA MANAGEMENT
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Set agent capabilities
     */
    setAgentCapabilities(route: string, capabilities: string[]): void {
        this.agentCapabilities.set(route, capabilities);
        this.logger.debug('Agent capabilities set', { route, capabilities });
    }

    /**
     * Set agent tags
     */
    setAgentTags(route: string, tags: string[]): void {
        this.agentTags.set(route, tags);
        this.logger.debug('Agent tags set', { route, tags });
    }

    /**
     * Update agent metrics
     */
    updateAgentMetrics(route: string, metrics: Partial<AgentMetrics>): void {
        const current = this.agentMetrics.get(route) || {
            currentLoad: 0,
            averageResponseTime: 0,
            successRate: 1.0,
            availability: true,
            lastUsed: 0,
            totalTasks: 0,
            totalErrors: 0,
        };

        this.agentMetrics.set(route, { ...current, ...metrics });
        this.logger.debug('Agent metrics updated', { route, metrics });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 🔍 PRIVATE IMPLEMENTATION METHODS
    // ──────────────────────────────────────────────────────────────────────────

    private initializeAgentMetadata(
        route: string,
        _agent: AgentDefinition<unknown, unknown, unknown>,
    ): void {
        // Initialize with default metadata
        this.agentCapabilities.set(route, []);
        this.agentTags.set(route, []);
        this.agentMetrics.set(route, {
            currentLoad: 0,
            averageResponseTime: 0,
            successRate: 1.0,
            availability: true,
            lastUsed: 0,
            totalTasks: 0,
            totalErrors: 0,
        });
    }

    private mergeCriteria(
        criteria?: AgentSelectionCriteria,
    ): AgentSelectionCriteria {
        const defaultCriteria = this.config.defaultCriteria || {};
        return {
            ...defaultCriteria,
            ...criteria,
            requiredCapabilities: [
                ...(defaultCriteria.requiredCapabilities || []),
                ...(criteria?.requiredCapabilities || []),
            ],
            requiredTags: [
                ...(defaultCriteria.requiredTags || []),
                ...(criteria?.requiredTags || []),
            ],
            excludedAgents: [
                ...(defaultCriteria.excludedAgents || []),
                ...(criteria?.excludedAgents || []),
            ],
            preferredCapabilities: [
                ...(defaultCriteria.preferredCapabilities || []),
                ...(criteria?.preferredCapabilities || []),
            ],
            preferredTags: [
                ...(defaultCriteria.preferredTags || []),
                ...(criteria?.preferredTags || []),
            ],
        };
    }

    private filterRoutesByCriteria(criteria: AgentSelectionCriteria): string[] {
        let availableRoutes = [...this.routeNames];

        // Filter by excluded agents
        if (criteria.excludedAgents && criteria.excludedAgents.length > 0) {
            availableRoutes = availableRoutes.filter((route) => {
                const routeAgentId = createAgentId(route);
                return (
                    !routeAgentId ||
                    !criteria.excludedAgents!.includes(routeAgentId)
                );
            });
        }

        // Filter by required capabilities
        if (
            criteria.requiredCapabilities &&
            criteria.requiredCapabilities.length > 0
        ) {
            availableRoutes = availableRoutes.filter((route) => {
                const routeCapabilities =
                    this.agentCapabilities.get(route) || [];
                return criteria.requiredCapabilities!.every((cap) =>
                    routeCapabilities.includes(cap),
                );
            });
        }

        // Filter by required tags
        if (criteria.requiredTags && criteria.requiredTags.length > 0) {
            availableRoutes = availableRoutes.filter((route) => {
                const routeTags = this.agentTags.get(route) || [];
                return criteria.requiredTags!.every((tag) =>
                    routeTags.includes(tag),
                );
            });
        }

        return availableRoutes;
    }

    private async selectRoute<TInput extends z.infer<TSchema>>(
        input: TInput,
        availableRoutes: string[],
    ): Promise<string> {
        const strategy = this.config.routingStrategy || 'first_match';

        switch (strategy) {
            case 'first_match':
                return this.selectFirstMatch(input, availableRoutes);

            case 'best_match':
                return await this.selectBestMatch(input, availableRoutes);

            case 'llm_decision':
                return await this.selectViaLLM(input, availableRoutes);

            case 'custom_rules':
                return await this.selectViaCustomRules(input, availableRoutes);

            case 'semantic_similarity':
                return await this.selectViaSemanticSimilarity(
                    input,
                    availableRoutes,
                );

            default:
                throw new Error(`Unknown routing strategy: ${strategy}`);
        }
    }

    private selectFirstMatch<TInput extends z.infer<TSchema>>(
        input: TInput,
        availableRoutes: string[],
    ): string {
        // If input has a 'target' field, map it to agent name
        if (typeof input === 'object' && input && 'target' in input) {
            const target = (input as Record<string, unknown>).target as string;

            // Map target values to agent names
            const targetMapping: Record<string, string> = {
                bugFinder: 'BugFinder',
                securityScan: 'SecurityScan',
                docsSync: 'DocsSync',
            };

            const mappedTarget = targetMapping[target] || target;
            if (availableRoutes.includes(mappedTarget)) {
                return mappedTarget;
            }
        }

        // Custom routing logic if provided
        if (this.config.routeLogic) {
            const agentIds = availableRoutes
                .map((route) => createAgentId(route))
                .filter((id): id is AgentId => id !== null);
            const result = this.config.routeLogic(input, agentIds);
            if (
                typeof result === 'string' &&
                availableRoutes.includes(result)
            ) {
                return result;
            }
        }

        // Default: return first available route
        if (availableRoutes.length === 0) {
            throw new Error('No routes available');
        }
        return availableRoutes[0]!;
    }

    private async selectBestMatch<TInput extends z.infer<TSchema>>(
        input: TInput,
        availableRoutes: string[],
    ): Promise<string> {
        // Score routes based on capabilities, tags, metrics, and input analysis
        const scoredRoutes = availableRoutes.map((route) => {
            let score = 0;
            const capabilities = this.agentCapabilities.get(route) || [];
            const tags = this.agentTags.get(route) || [];
            const metrics = this.agentMetrics.get(route);

            // Score based on capabilities match
            if (this.config.defaultCriteria?.preferredCapabilities) {
                const capabilityMatch =
                    this.config.defaultCriteria.preferredCapabilities.filter(
                        (cap) => capabilities.includes(cap),
                    ).length /
                    this.config.defaultCriteria.preferredCapabilities.length;
                score += capabilityMatch * 0.3;
            }

            // Score based on tags match
            if (this.config.defaultCriteria?.preferredTags) {
                const tagMatch =
                    this.config.defaultCriteria.preferredTags.filter((tag) =>
                        tags.includes(tag),
                    ).length / this.config.defaultCriteria.preferredTags.length;
                score += tagMatch * 0.2;
            }

            // Score based on input analysis (25%)
            score +=
                this.analyzeInputMatch(input, route, capabilities, tags) * 0.25;

            // Score based on performance metrics (25%)
            if (metrics) {
                score += metrics.successRate * 0.15;
                score += (1 - metrics.currentLoad / 100) * 0.1;
            }

            return { route, score };
        });

        // Return route with highest score
        scoredRoutes.sort((a, b) => b.score - a.score);
        return scoredRoutes[0]!.route;
    }

    private analyzeInputMatch(
        input: unknown,
        route: string,
        capabilities: string[],
        tags: string[],
    ): number {
        let score = 0;

        // Analyze string input
        if (typeof input === 'string') {
            const inputLower = input.toLowerCase();
            const routeLower = route.toLowerCase();

            // Direct route name match
            if (inputLower.includes(routeLower)) {
                score += 0.8;
            }

            // Capability match in input
            capabilities.forEach((cap) => {
                if (inputLower.includes(cap.toLowerCase())) {
                    score += 0.3;
                }
            });

            // Tag match in input
            tags.forEach((tag) => {
                if (inputLower.includes(tag.toLowerCase())) {
                    score += 0.2;
                }
            });
        }

        // Analyze object input
        if (typeof input === 'object' && input) {
            const inputStr = JSON.stringify(input).toLowerCase();
            const routeLower = route.toLowerCase();

            // Route name in object properties
            if (inputStr.includes(routeLower)) {
                score += 0.6;
            }

            // Capabilities in object
            capabilities.forEach((cap) => {
                if (inputStr.includes(cap.toLowerCase())) {
                    score += 0.2;
                }
            });

            // Tags in object
            tags.forEach((tag) => {
                if (inputStr.includes(tag.toLowerCase())) {
                    score += 0.15;
                }
            });
        }

        return Math.min(score, 1.0); // Cap at 1.0
    }

    private async selectViaLLM<TInput extends z.infer<TSchema>>(
        input: TInput,
        availableRoutes: string[],
    ): Promise<string> {
        // This would integrate with an LLM to make routing decisions
        // For now, fall back to best match
        this.logger.info(
            'LLM routing not yet implemented, falling back to best_match',
        );
        return await this.selectBestMatch(input, availableRoutes);
    }

    private async selectViaCustomRules<TInput extends z.infer<TSchema>>(
        input: TInput,
        availableRoutes: string[],
    ): Promise<string> {
        if (!this.config.customRules || this.config.customRules.length === 0) {
            this.logger.warn(
                'Custom rules strategy selected but no rules provided',
            );
            return await this.selectBestMatch(input, availableRoutes);
        }

        this.logger.info('Executing custom rules', {
            routerId: this.config.name,
            ruleCount: this.config.customRules.length,
            availableRoutes,
        });

        // Execute custom rules in sequence
        for (const rule of this.config.customRules) {
            try {
                const selectedRoute = await rule(input, availableRoutes, this);

                // Validate that selected route is available
                if (availableRoutes.includes(selectedRoute)) {
                    this.logger.info('Custom rule selected route', {
                        routerId: this.config.name,
                        rule: rule.name || 'anonymous',
                        selectedRoute,
                    });
                    return selectedRoute;
                } else {
                    this.logger.warn('Custom rule returned invalid route', {
                        routerId: this.config.name,
                        rule: rule.name || 'anonymous',
                        selectedRoute,
                        availableRoutes,
                    });
                }
            } catch (error) {
                this.logger.error(
                    `Custom rule execution failed: ${rule.name || 'anonymous'}: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }

        // Fallback to best match if no custom rule succeeds
        this.logger.info('All custom rules failed, falling back to best match');
        return await this.selectBestMatch(input, availableRoutes);
    }

    private async selectViaSemanticSimilarity<TInput extends z.infer<TSchema>>(
        input: TInput,
        availableRoutes: string[],
    ): Promise<string> {
        const config = this.config.semanticSimilarity;
        if (!config?.enabled) {
            this.logger.warn('Semantic similarity not enabled');
            return await this.selectBestMatch(input, availableRoutes);
        }

        this.logger.info('Executing semantic similarity routing', {
            routerId: this.config.name,
            threshold: config.threshold,
            model: config.model,
            availableRoutes,
        });

        try {
            // Simple semantic similarity implementation
            // In production, this would use embeddings and vector similarity
            const inputText =
                typeof input === 'string' ? input : JSON.stringify(input);
            const routeScores = new Map<string, number>();

            for (const route of availableRoutes) {
                const agent = this.agents.get(route);
                if (!agent) continue;

                // Calculate similarity based on route name and agent identity
                const agentSummary = getAgentSummary(agent.identity);
                const routeText = `${route} ${agentSummary}`;
                const similarity = await this.calculateTextSimilarity(
                    inputText,
                    routeText,
                );
                routeScores.set(route, similarity);
            }

            // Find best match
            let bestRoute = availableRoutes[0] ?? '';
            let bestScore = routeScores.get(bestRoute) ?? 0;

            for (const [route, score] of routeScores) {
                if (score > bestScore) {
                    bestRoute = route;
                    bestScore = score;
                }
            }

            // Check threshold
            const threshold = config.threshold || 0.5;
            if (bestScore >= threshold) {
                this.logger.info('Semantic similarity selected route', {
                    routerId: this.config.name,
                    selectedRoute: bestRoute,
                    score: bestScore,
                    threshold,
                });
                return bestRoute;
            } else {
                this.logger.warn('No route meets similarity threshold', {
                    routerId: this.config.name,
                    bestScore,
                    threshold,
                    availableRoutes,
                });
                return await this.selectBestMatch(input, availableRoutes);
            }
        } catch (error) {
            this.logger.error(
                `Semantic similarity routing failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            return await this.selectBestMatch(input, availableRoutes);
        }
    }

    /**
     * Calculate semantic similarity between two texts using vector embeddings
     * Falls back to Jaccard similarity if vectorization fails
     */
    private async calculateTextSimilarity(
        text1: string,
        text2: string,
    ): Promise<number> {
        try {
            // If we have stored the text2 in memory, we can compare directly
            // For now, we'll vectorize both texts and compare
            return await this.calculateVectorSimilarity(text1, text2);
        } catch (error) {
            this.logger.warn(
                'Vector similarity failed, falling back to Jaccard',
                {
                    error:
                        error instanceof Error
                            ? error.message
                            : 'Unknown error',
                },
            );

            // Fallback to simple Jaccard similarity
            return this.calculateJaccardSimilarity(text1, text2);
        }
    }

    /**
     * Calculate vector-based semantic similarity
     */
    private async calculateVectorSimilarity(
        text1: string,
        text2: string,
    ): Promise<number> {
        // This is a placeholder implementation
        // In production, you would use the same vectorization service for both texts
        // and then calculate cosine similarity between the vectors

        // For now, we'll simulate this by using a simple hash-based approach
        // that mimics the behavior of the MemoryManager's vectorization
        const vector1 = await this.simulateVectorization(text1);
        const vector2 = await this.simulateVectorization(text2);

        return cosineSimilarity(vector1, vector2);
    }

    /**
     * Simulate vectorization for demo purposes
     * In production, this would use the same service as MemoryManager
     */
    private async simulateVectorization(text: string): Promise<number[]> {
        // Simple hash-based vectorization (same as MemoryManager)
        const hash = this.simpleHash(text);
        const vector = new Array(1536).fill(0);

        for (let i = 0; i < 1536; i++) {
            vector[i] = Math.sin(hash + i) * 0.1;
        }

        return vector;
    }

    /**
     * Simple hash function (same as MemoryManager)
     */
    private simpleHash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash;
    }

    /**
     * Calculate Jaccard similarity as fallback
     */
    private calculateJaccardSimilarity(text1: string, text2: string): number {
        const words1 = new Set(text1.toLowerCase().split(/\s+/));
        const words2 = new Set(text2.toLowerCase().split(/\s+/));

        const intersection = new Set([...words1].filter((x) => words2.has(x)));
        const union = new Set([...words1, ...words2]);

        return intersection.size / union.size;
    }

    private async executeFallback<
        TInput extends z.infer<TSchema>,
        TOutput = unknown,
    >(
        input: TInput,
        context: Partial<AgentContext> | undefined,
        executionId: string,
        criteria: AgentSelectionCriteria,
    ): Promise<RoutingResult<TOutput>> {
        this.logger.info('Executing fallback route', {
            routerId: this.config.name,
            executionId,
            fallback: this.config.fallback,
        });

        const fallback = this.config.fallback!;
        const fallbackAgent =
            typeof fallback === 'string' ? this.agents.get(fallback) : fallback;

        if (!fallbackAgent) {
            throw new Error(`Fallback agent not found: ${fallback}`);
        }

        const agentContext = {
            executionId,
            correlationId:
                context?.correlationId || IdGenerator.correlationId(),
            availableTools: context?.availableTools || [],
            state: context?.state || new Map(),
            logger: this.logger,
            routerId: this.config.name,
            selectedRoute: 'fallback',
            routingMetadata: {
                inputValidation: false,
                availableRoutes: this.routeNames,
                fallbackUsed: true,
                selectionCriteria: criteria,
            },
            // Required AgentContext properties
            agentName: 'fallback',
            invocationId: IdGenerator.executionId(),
            tenantId: context?.tenantId || 'default',
            startTime: Date.now(),
            status: 'RUNNING' as const,
            signal: new AbortController().signal,
        } as unknown as AgentContext & {
            routerId: string;
            selectedRoute: string;
            routingMetadata: Record<string, unknown>;
        };

        const thought = await fallbackAgent.think(input, agentContext);

        return {
            selectedRoute: 'fallback',
            confidence: 0.1, // Low confidence for fallback
            reasoning: `Fallback execution: ${thought.reasoning}`,
            result: (thought.action.type === 'final_answer'
                ? thought.action.content
                : thought) as TOutput,
            metadata: {
                routerId: this.config.name,
                executionId,
                duration: 0,
                inputValidation: false,
                selectionCriteria: criteria,
                availableAgents: [],
                excludedAgents: criteria.excludedAgents,
            },
        };
    }

    private calculateConfidence(thought: AgentThought): number {
        // Simple confidence calculation
        // Can be enhanced based on agent response patterns
        return thought.action.type === 'final_answer' ? 0.9 : 0.6;
    }

    /**
     * Get available routes
     */
    getRoutes(): string[] {
        return [...this.routeNames];
    }

    /**
     * Add new route
     */
    addRoute(
        route: string,
        agent: AgentDefinition<unknown, unknown, unknown>,
    ): void {
        this.agents.set(route, agent);
        this.routeNames.push(route);
        this.initializeAgentMetadata(route, agent);

        this.logger.info('Route added', {
            routerId: this.config.name,
            route,
            agentName: agent.name,
        });
    }

    /**
     * Remove route
     */
    removeRoute(route: string): boolean {
        const removed = this.agents.delete(route);
        if (removed) {
            const index = this.routeNames.indexOf(route);
            if (index > -1) {
                this.routeNames.splice(index, 1);
            }
            this.agentCapabilities.delete(route);
            this.agentTags.delete(route);
            this.agentMetrics.delete(route);
        }
        return removed;
    }

    /**
     * Set KernelHandler (for dependency injection)
     */
    setKernelHandler(kernelHandler: MultiKernelHandler): void {
        this.kernelHandler = kernelHandler;
        this.logger.info('KernelHandler set for Router');
    }

    /**
     * Get KernelHandler status
     */
    hasKernelHandler(): boolean {
        return !!this.kernelHandler;
    }

    // ===== 🚀 NEW: ROUTER INTELLIGENCE METHODS =====

    /**
     * Determine optimal tool execution strategy based on context and patterns
     */
    determineToolExecutionStrategy(
        tools: string[],
        context: Record<string, unknown>,
        constraints?: {
            timeLimit?: number;
            resourceLimit?: number;
            qualityThreshold?: number;
        },
    ): {
        strategy: 'parallel' | 'sequential' | 'conditional' | 'adaptive';
        confidence: number;
        reasoning: string;
        executionPlan: {
            phases: Array<{
                tools: string[];
                strategy: 'parallel' | 'sequential';
                estimatedTime: number;
            }>;
            totalEstimatedTime: number;
            riskLevel: 'low' | 'medium' | 'high';
        };
    } {
        // Analyze tool patterns and dependencies
        const analysis = this.analyzeToolPatterns(tools, context);

        // Factor in constraints
        const timeConstrained =
            constraints?.timeLimit && constraints.timeLimit < 30000;
        const resourceConstrained =
            constraints?.resourceLimit && constraints.resourceLimit < 0.5;
        const qualityRequired =
            constraints?.qualityThreshold && constraints.qualityThreshold > 0.8;

        let strategy: 'parallel' | 'sequential' | 'conditional' | 'adaptive' =
            'parallel';
        let confidence = 0.7;
        let reasoning = 'Default parallel execution selected';

        // Determine strategy based on analysis
        if (analysis.hasStrictDependencies) {
            strategy = 'sequential';
            confidence = 0.9;
            reasoning =
                'Sequential execution required due to strict dependencies';
        } else if (analysis.hasConditionalLogic) {
            strategy = 'conditional';
            confidence = 0.8;
            reasoning = 'Conditional execution detected based on tool patterns';
        } else if (analysis.complexityScore > 0.7 || qualityRequired) {
            strategy = 'adaptive';
            confidence = 0.85;
            reasoning = 'Adaptive strategy for complex execution patterns';
        } else if (timeConstrained || resourceConstrained) {
            strategy = 'parallel';
            confidence = 0.9;
            reasoning =
                'Parallel execution optimized for time/resource constraints';
        }

        // Build execution plan
        const executionPlan = this.buildExecutionPlan(
            tools,
            strategy,
            analysis,
        );

        return {
            strategy,
            confidence,
            reasoning,
            executionPlan,
        };
    }

    /**
     * Analyze tool patterns to understand execution requirements
     */
    private analyzeToolPatterns(
        tools: string[],
        context: Record<string, unknown>,
    ): {
        hasStrictDependencies: boolean;
        hasConditionalLogic: boolean;
        complexityScore: number;
        parallelizableGroups: string[][];
        sequentialChains: string[][];
        resourceRequirements: {
            cpu: 'low' | 'medium' | 'high';
            memory: 'low' | 'medium' | 'high';
            network: 'low' | 'medium' | 'high';
        };
    } {
        // Check for dependency keywords in tool names
        const dependencyTools = tools.filter(
            (tool) =>
                /^(get|fetch|load|read)/.test(tool) ||
                /^(process|transform|analyze)/.test(tool) ||
                /^(save|write|store|update)/.test(tool),
        );

        const hasStrictDependencies = dependencyTools.length > 1;

        // Check for conditional logic patterns
        const hasConditionalLogic =
            tools.some(
                (tool) =>
                    tool.includes('if') ||
                    tool.includes('when') ||
                    tool.includes('condition'),
            ) ||
            Object.keys(context).some(
                (key) =>
                    key.includes('condition') ||
                    key.includes('rule') ||
                    key.includes('criteria'),
            );

        // Calculate complexity score
        const complexityScore = Math.min(
            1.0,
            tools.length / 10 +
                (hasStrictDependencies ? 0.3 : 0) +
                (hasConditionalLogic ? 0.2 : 0),
        );

        // Group tools for parallel execution
        const parallelizableGroups = this.groupParallelizableTools(tools);

        // Identify sequential chains
        const sequentialChains = this.identifySequentialChains(tools);

        // Estimate resource requirements
        const resourceRequirements = this.estimateResourceRequirements(tools);

        return {
            hasStrictDependencies,
            hasConditionalLogic,
            complexityScore,
            parallelizableGroups,
            sequentialChains,
            resourceRequirements,
        };
    }

    /**
     * Group tools that can be executed in parallel
     */
    private groupParallelizableTools(tools: string[]): string[][] {
        const groups: string[][] = [];

        // Simple grouping based on tool patterns
        const readTools = tools.filter((tool) =>
            /^(get|fetch|load|read)/.test(tool),
        );
        const processTools = tools.filter((tool) =>
            /^(process|transform|analyze|calculate)/.test(tool),
        );
        const writeTools = tools.filter((tool) =>
            /^(save|write|store|update|send)/.test(tool),
        );

        if (readTools.length > 1) groups.push(readTools);
        if (processTools.length > 1) groups.push(processTools);
        if (writeTools.length > 1) groups.push(writeTools);

        // If no clear grouping, put all tools in one group for parallel execution
        if (groups.length === 0 && tools.length > 1) {
            groups.push(tools);
        }

        return groups;
    }

    /**
     * Identify sequential chains of tools
     */
    private identifySequentialChains(tools: string[]): string[][] {
        const chains: string[][] = [];

        // Look for typical data flow patterns
        const readTools = tools.filter((tool) =>
            /^(get|fetch|load|read)/.test(tool),
        );
        const processTools = tools.filter((tool) =>
            /^(process|transform|analyze)/.test(tool),
        );
        const writeTools = tools.filter((tool) =>
            /^(save|write|store|update)/.test(tool),
        );

        // Create chain if we have all three types
        if (
            readTools.length > 0 &&
            processTools.length > 0 &&
            writeTools.length > 0
        ) {
            chains.push([...readTools, ...processTools, ...writeTools]);
        }

        return chains;
    }

    /**
     * Estimate resource requirements for tools
     */
    private estimateResourceRequirements(tools: string[]): {
        cpu: 'low' | 'medium' | 'high';
        memory: 'low' | 'medium' | 'high';
        network: 'low' | 'medium' | 'high';
    } {
        const toolCount = tools.length;

        // CPU estimation based on processing tools
        const processingTools = tools.filter((tool) =>
            /^(process|transform|analyze|calculate|generate)/.test(tool),
        ).length;
        const cpu =
            processingTools > 3
                ? 'high'
                : processingTools > 1
                  ? 'medium'
                  : 'low';

        // Memory estimation based on tool count and data tools
        const dataTools = tools.filter(
            (tool) =>
                /^(load|cache|store|buffer)/.test(tool) ||
                tool.includes('large') ||
                tool.includes('bulk'),
        ).length;
        const memory =
            dataTools > 2 || toolCount > 8
                ? 'high'
                : dataTools > 0 || toolCount > 4
                  ? 'medium'
                  : 'low';

        // Network estimation based on I/O tools
        const networkTools = tools.filter(
            (tool) =>
                /^(fetch|get|send|post|upload|download)/.test(tool) ||
                tool.includes('api') ||
                tool.includes('http'),
        ).length;
        const network =
            networkTools > 3 ? 'high' : networkTools > 1 ? 'medium' : 'low';

        return { cpu, memory, network };
    }

    /**
     * Build execution plan based on strategy and analysis
     */
    private buildExecutionPlan(
        tools: string[],
        strategy: 'parallel' | 'sequential' | 'conditional' | 'adaptive',
        analysis: ReturnType<Router['analyzeToolPatterns']>,
    ): {
        phases: Array<{
            tools: string[];
            strategy: 'parallel' | 'sequential';
            estimatedTime: number;
        }>;
        totalEstimatedTime: number;
        riskLevel: 'low' | 'medium' | 'high';
    } {
        const phases: Array<{
            tools: string[];
            strategy: 'parallel' | 'sequential';
            estimatedTime: number;
        }> = [];

        switch (strategy) {
            case 'parallel':
                phases.push({
                    tools,
                    strategy: 'parallel',
                    estimatedTime: Math.max(500, tools.length * 200), // Assume parallel execution
                });
                break;

            case 'sequential':
                phases.push({
                    tools,
                    strategy: 'sequential',
                    estimatedTime: tools.length * 1000, // Sequential adds up
                });
                break;

            case 'conditional':
                // Create phases for conditional execution
                const conditionalGroups =
                    analysis.parallelizableGroups.length > 0
                        ? analysis.parallelizableGroups
                        : [tools];

                conditionalGroups.forEach((group) => {
                    phases.push({
                        tools: group,
                        strategy: 'parallel',
                        estimatedTime: Math.max(500, group.length * 300),
                    });
                });
                break;

            case 'adaptive':
                // Mix of parallel and sequential based on analysis
                if (analysis.sequentialChains.length > 0) {
                    analysis.sequentialChains.forEach((chain) => {
                        phases.push({
                            tools: chain,
                            strategy: 'sequential',
                            estimatedTime: chain.length * 800,
                        });
                    });
                }

                if (analysis.parallelizableGroups.length > 0) {
                    analysis.parallelizableGroups.forEach((group) => {
                        phases.push({
                            tools: group,
                            strategy: 'parallel',
                            estimatedTime: Math.max(500, group.length * 250),
                        });
                    });
                }

                // If no clear grouping, default to parallel
                if (phases.length === 0) {
                    phases.push({
                        tools,
                        strategy: 'parallel',
                        estimatedTime: Math.max(500, tools.length * 300),
                    });
                }
                break;
        }

        const totalEstimatedTime = phases.reduce(
            (total, phase) => total + phase.estimatedTime,
            0,
        );

        // Determine risk level
        const riskLevel =
            analysis.complexityScore > 0.7
                ? 'high'
                : analysis.complexityScore > 0.4
                  ? 'medium'
                  : 'low';

        return {
            phases,
            totalEstimatedTime,
            riskLevel,
        };
    }

    // ===== 🚀 NEW: TOOL EXECUTION RULE SYSTEM =====

    private toolExecutionRules: Map<string, ToolExecutionRule> = new Map();

    /**
     * Add a tool execution rule to the router
     */
    addToolExecutionRule(rule: ToolExecutionRule): void {
        this.toolExecutionRules.set(rule.id, rule);
        this.logger.info('Tool execution rule added', {
            routerId: this.config.name,
            ruleId: rule.id,
            ruleName: rule.name,
            strategy: rule.strategy,
            priority: rule.priority,
        });
    }

    /**
     * Remove a tool execution rule
     */
    removeToolExecutionRule(ruleId: string): boolean {
        const removed = this.toolExecutionRules.delete(ruleId);
        if (removed) {
            this.logger.info('Tool execution rule removed', {
                routerId: this.config.name,
                ruleId,
            });
        }
        return removed;
    }

    /**
     * Get all active tool execution rules
     */
    getToolExecutionRules(): ToolExecutionRule[] {
        return Array.from(this.toolExecutionRules.values())
            .filter((rule) => rule.enabled)
            .sort((a, b) => b.priority - a.priority); // Higher priority first
    }

    /**
     * Evaluate tool execution rules and determine strategy
     */
    evaluateToolExecutionRules(
        tools: string[],
        context: Record<string, unknown>,
    ): {
        appliedRules: Array<{
            ruleId: string;
            ruleName: string;
            strategy: ToolExecutionStrategy;
            confidence: number;
            reasoning: string;
        }>;
        recommendedStrategy: ToolExecutionStrategy;
        fallbackStrategy: ToolExecutionStrategy;
        conflictResolution?: string;
    } {
        const activeRules = this.getToolExecutionRules();
        const appliedRules: Array<{
            ruleId: string;
            ruleName: string;
            strategy: ToolExecutionStrategy;
            confidence: number;
            reasoning: string;
        }> = [];

        // Create a mock ToolContext for rule evaluation
        const mockToolContext = {
            toolName: tools[0] || 'unknown',
            callId: `rule-eval-${Date.now()}`,
            executionId: `exec-${Date.now()}`,
            tenantId: 'default',
            correlationId: `corr-${Date.now()}`,
            parentId: undefined,
            startTime: Date.now(),
            status: 'PENDING' as const,
            metadata: context,
            parameters: context,
            signal: new AbortController().signal,
            cleanup: async () => {},
        };

        // Evaluate each rule
        for (const rule of activeRules) {
            try {
                let conditionMet = false;

                if (typeof rule.condition === 'string') {
                    // Simple string-based condition evaluation
                    conditionMet = this.evaluateStringCondition(
                        rule.condition,
                        tools,
                        context,
                    );
                } else if (typeof rule.condition === 'function') {
                    // Function-based condition evaluation
                    conditionMet = rule.condition(mockToolContext);
                }

                if (conditionMet) {
                    const confidence = this.calculateRuleConfidence(
                        rule,
                        tools,
                        context,
                    );
                    appliedRules.push({
                        ruleId: rule.id,
                        ruleName: rule.name,
                        strategy: rule.strategy,
                        confidence,
                        reasoning: `Rule "${rule.name}" applied: ${rule.description}`,
                    });
                }
            } catch (error) {
                this.logger.warn('Error evaluating tool execution rule', {
                    ruleId: rule.id,
                    ruleName: rule.name,
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            }
        }

        // Determine recommended strategy based on applied rules
        const { recommendedStrategy, conflictResolution } =
            this.resolveRuleConflicts(appliedRules);

        // Fallback strategy
        const fallbackStrategy: ToolExecutionStrategy = 'adaptive';

        return {
            appliedRules,
            recommendedStrategy,
            fallbackStrategy,
            conflictResolution,
        };
    }

    /**
     * Evaluate string-based conditions
     */
    private evaluateStringCondition(
        condition: string,
        tools: string[],
        context: Record<string, unknown>,
    ): boolean {
        try {
            // Simple condition evaluation patterns
            const lowerCondition = condition.toLowerCase();
            const toolsStr = tools.join(' ').toLowerCase();
            const contextStr = JSON.stringify(context).toLowerCase();

            // Tool count conditions
            if (lowerCondition.includes('tool_count')) {
                const match = lowerCondition.match(
                    /tool_count\s*([><=]+)\s*(\d+)/,
                );
                if (match && match[1] && match[2]) {
                    const operator = match[1];
                    const value = parseInt(match[2]);
                    const toolCount = tools.length;

                    switch (operator) {
                        case '>':
                            return toolCount > value;
                        case '<':
                            return toolCount < value;
                        case '>=':
                            return toolCount >= value;
                        case '<=':
                            return toolCount <= value;
                        case '==':
                            return toolCount === value;
                        case '=':
                            return toolCount === value;
                        default:
                            return false;
                    }
                }
            }

            // Tool name patterns
            if (lowerCondition.includes('tool_name_contains')) {
                const match = lowerCondition.match(
                    /tool_name_contains\s*\(\s*["']([^"']+)["']\s*\)/,
                );
                if (match && match[1]) {
                    const pattern = match[1];
                    return tools.some((tool) =>
                        tool.toLowerCase().includes(pattern),
                    );
                }
            }

            // Context property conditions
            if (lowerCondition.includes('context.')) {
                const match = lowerCondition.match(
                    /context\.(\w+)\s*([><=]+)\s*(.+)/,
                );
                if (match && match[1] && match[2] && match[3]) {
                    const property = match[1];
                    const operator = match[2];
                    let value = match[3].trim();

                    // Remove quotes if present
                    if (
                        (value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"))
                    ) {
                        value = value.slice(1, -1);
                    }

                    const contextValue = context[property];

                    if (operator === '==' || operator === '=') {
                        return (
                            String(contextValue).toLowerCase() ===
                            value.toLowerCase()
                        );
                    }
                    // Add more operators as needed
                }
            }

            // Pattern matching
            if (
                lowerCondition.includes('parallel') &&
                (toolsStr.includes('parallel') ||
                    contextStr.includes('parallel'))
            ) {
                return true;
            }
            if (
                lowerCondition.includes('sequential') &&
                (toolsStr.includes('sequential') ||
                    contextStr.includes('sequential'))
            ) {
                return true;
            }
            if (
                lowerCondition.includes('conditional') &&
                (toolsStr.includes('condition') ||
                    contextStr.includes('condition'))
            ) {
                return true;
            }

            // Default: simple string matching
            return (
                toolsStr.includes(lowerCondition) ||
                contextStr.includes(lowerCondition)
            );
        } catch (error) {
            this.logger.warn('Error evaluating string condition', {
                condition,
                error: error instanceof Error ? error.message : String(error),
            });
            return false;
        }
    }

    /**
     * Calculate confidence score for a rule application
     */
    private calculateRuleConfidence(
        rule: ToolExecutionRule,
        tools: string[],
        context: Record<string, unknown>,
    ): number {
        let confidence = 0.5; // Base confidence

        // Higher priority rules get higher confidence
        confidence += (rule.priority / 100) * 0.3;

        // More specific rules (more conditions) get higher confidence
        const conditionComplexity =
            typeof rule.condition === 'string'
                ? rule.condition.split(' ').length / 10
                : 0.2; // Function conditions get moderate complexity score
        confidence += Math.min(0.2, conditionComplexity);

        // Rule metadata can influence confidence
        if (rule.metadata?.confidence) {
            confidence = Math.max(confidence, Number(rule.metadata.confidence));
        }

        // Context relevance
        if (context.priority === 'high') confidence += 0.1;
        if (tools.length > 1 && rule.strategy === 'parallel') confidence += 0.1;
        if (tools.length === 1 && rule.strategy === 'sequential')
            confidence += 0.1;

        return Math.min(1.0, Math.max(0.0, confidence));
    }

    /**
     * Resolve conflicts when multiple rules apply
     */
    private resolveRuleConflicts(
        appliedRules: Array<{
            ruleId: string;
            ruleName: string;
            strategy: ToolExecutionStrategy;
            confidence: number;
            reasoning: string;
        }>,
    ): {
        recommendedStrategy: ToolExecutionStrategy;
        conflictResolution?: string;
    } {
        if (appliedRules.length === 0) {
            return { recommendedStrategy: 'adaptive' };
        }

        if (appliedRules.length === 1) {
            return { recommendedStrategy: appliedRules[0]!.strategy };
        }

        // Multiple rules applied - resolve conflicts
        const strategyCounts = new Map<ToolExecutionStrategy, number>();
        const strategyConfidences = new Map<ToolExecutionStrategy, number>();

        for (const rule of appliedRules) {
            strategyCounts.set(
                rule.strategy,
                (strategyCounts.get(rule.strategy) || 0) + 1,
            );
            strategyConfidences.set(
                rule.strategy,
                Math.max(
                    strategyConfidences.get(rule.strategy) || 0,
                    rule.confidence,
                ),
            );
        }

        // Strategy with highest confidence wins
        let recommendedStrategy: ToolExecutionStrategy = 'adaptive';
        let maxConfidence = 0;

        for (const [strategy, confidence] of strategyConfidences) {
            if (confidence > maxConfidence) {
                maxConfidence = confidence;
                recommendedStrategy = strategy;
            }
        }

        const conflictResolution = `Resolved ${appliedRules.length} rule conflicts. Selected ${recommendedStrategy} with confidence ${maxConfidence.toFixed(2)}`;

        return {
            recommendedStrategy,
            conflictResolution,
        };
    }

    /**
     * Create a default set of tool execution rules
     */
    createDefaultToolExecutionRules(): void {
        // Rule 1: Parallel execution for independent tools
        this.addToolExecutionRule({
            id: 'parallel-independent-tools',
            name: 'Parallel Independent Tools',
            description: 'Execute multiple independent tools in parallel',
            condition: 'tool_count > 1',
            strategy: 'parallel',
            priority: 70,
            enabled: true,
            metadata: { confidence: 0.8 },
        });

        // Rule 2: Sequential execution for dependent tools
        this.addToolExecutionRule({
            id: 'sequential-dependent-tools',
            name: 'Sequential Dependent Tools',
            description: 'Execute tools sequentially when dependencies exist',
            condition:
                'tool_name_contains("fetch") && tool_name_contains("process")',
            strategy: 'sequential',
            priority: 80,
            enabled: true,
            metadata: { confidence: 0.9 },
        });

        // Rule 3: Conditional execution for conditional logic
        this.addToolExecutionRule({
            id: 'conditional-logic-tools',
            name: 'Conditional Logic Tools',
            description:
                'Use conditional execution when conditional logic is present',
            condition: 'conditional',
            strategy: 'conditional',
            priority: 75,
            enabled: true,
            metadata: { confidence: 0.85 },
        });

        // Rule 4: Adaptive for high complexity
        this.addToolExecutionRule({
            id: 'adaptive-complex-tools',
            name: 'Adaptive Complex Tools',
            description: 'Use adaptive strategy for complex tool combinations',
            condition: 'tool_count > 5',
            strategy: 'adaptive',
            priority: 60,
            enabled: true,
            metadata: { confidence: 0.7 },
        });

        this.logger.info('Default tool execution rules created', {
            routerId: this.config.name,
            ruleCount: this.toolExecutionRules.size,
        });
    }

    // ===== 🚀 NEW: ADAPTIVE INTELLIGENCE METHODS =====

    /**
     * Get tool execution strategy recommendation for agents
     */
    getToolExecutionRecommendation(
        tools: string[],
        context: Record<string, unknown>,
        agentRoute?: string,
    ): {
        recommendedStrategy: ToolExecutionStrategy;
        confidence: number;
        reasoning: string;
        constraints: {
            maxConcurrency?: number;
            timeout?: number;
            qualityThreshold?: number;
            failFast?: boolean;
        };
        executionHints: Array<{
            strategy: ToolExecutionStrategy;
            confidence: number;
            reasoning: string;
        }>;
    } {
        // Apply config constraints
        const constraints = this.config.toolExecutionConstraints || {};

        // Get base strategy recommendation
        const baseRecommendation = this.determineToolExecutionStrategy(
            tools,
            context,
            {
                timeLimit: constraints.defaultTimeout,
                resourceLimit: constraints.resourceLimits?.cpu,
                qualityThreshold: constraints.qualityThreshold,
            },
        );

        // Evaluate tool execution rules
        const ruleEvaluation = this.evaluateToolExecutionRules(tools, context);

        // Combine recommendations
        let finalStrategy = baseRecommendation.strategy;
        let confidence = baseRecommendation.confidence;
        let reasoning = baseRecommendation.reasoning;

        // Rule evaluation takes precedence if confident
        if (ruleEvaluation.appliedRules.length > 0) {
            const highestConfidenceRule = ruleEvaluation.appliedRules.sort(
                (a, b) => b.confidence - a.confidence,
            )[0];

            if (
                highestConfidenceRule &&
                highestConfidenceRule.confidence > confidence
            ) {
                // Map complex strategies to basic ones supported by the router
                let mappedStrategy = highestConfidenceRule.strategy;
                if (
                    mappedStrategy === 'dependencyBased' ||
                    mappedStrategy === 'priorityBased'
                ) {
                    mappedStrategy = 'sequential';
                } else if (mappedStrategy === 'resourceAware') {
                    mappedStrategy = 'adaptive';
                }

                finalStrategy = mappedStrategy as
                    | 'parallel'
                    | 'sequential'
                    | 'conditional'
                    | 'adaptive';
                confidence = highestConfidenceRule.confidence;
                reasoning = `${highestConfidenceRule.reasoning}. ${ruleEvaluation.conflictResolution || ''}`;
            }
        }

        // Apply agent-specific considerations
        if (agentRoute && this.agentMetrics.has(agentRoute)) {
            const agentMetrics = this.agentMetrics.get(agentRoute)!;

            // Adjust strategy based on agent performance
            if (
                agentMetrics.averageResponseTime > 5000 &&
                finalStrategy === 'sequential'
            ) {
                finalStrategy = 'parallel';
                confidence *= 0.9; // Slightly reduce confidence
                reasoning +=
                    ' (Adjusted to parallel due to agent response time)';
            }

            if (
                agentMetrics.successRate < 0.8 &&
                finalStrategy === 'parallel'
            ) {
                finalStrategy = 'sequential';
                confidence *= 0.95;
                reasoning +=
                    ' (Adjusted to sequential due to agent reliability)';
            }
        }

        // Create execution hints from all evaluated strategies
        const executionHints: Array<{
            strategy: ToolExecutionStrategy;
            confidence: number;
            reasoning: string;
        }> = [
            {
                strategy: baseRecommendation.strategy,
                confidence: baseRecommendation.confidence,
                reasoning: `Base analysis: ${baseRecommendation.reasoning}`,
            },
            ...ruleEvaluation.appliedRules.map((rule) => ({
                strategy: rule.strategy,
                confidence: rule.confidence,
                reasoning: rule.reasoning,
            })),
        ];

        return {
            recommendedStrategy: finalStrategy,
            confidence,
            reasoning,
            constraints: {
                maxConcurrency: constraints.maxConcurrency,
                timeout: constraints.defaultTimeout,
                qualityThreshold: constraints.qualityThreshold,
                failFast: constraints.failFast,
            },
            executionHints,
        };
    }

    /**
     * Update tool execution strategy based on execution results
     */
    updateStrategyFromResults(
        tools: string[],
        strategy: ToolExecutionStrategy,
        results: Array<{ success: boolean; duration: number; error?: string }>,
        agentRoute?: string,
    ): void {
        const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
        const successCount = results.filter((r) => r.success).length;
        const successRate = successCount / results.length;

        // Update agent metrics if route provided
        if (agentRoute && this.agentMetrics.has(agentRoute)) {
            const currentMetrics = this.agentMetrics.get(agentRoute)!;
            this.updateAgentMetrics(agentRoute, {
                averageResponseTime:
                    (currentMetrics.averageResponseTime + totalDuration) / 2,
                successRate: (currentMetrics.successRate + successRate) / 2,
                totalTasks: currentMetrics.totalTasks + 1,
                totalErrors:
                    currentMetrics.totalErrors +
                    (results.length - successCount),
                lastUsed: Date.now(),
            });
        }

        // Log strategy performance for future improvements
        this.logger.info('Tool execution strategy performance', {
            routerId: this.config.name,
            agentRoute,
            strategy,
            toolCount: tools.length,
            totalDuration,
            successRate,
            averageDuration: totalDuration / results.length,
        });

        // TODO: Implement machine learning-based strategy optimization
        // This could involve updating rule priorities or creating new rules
        // based on observed performance patterns
    }
}

/**
 * Factory function to create routers
 */
export function createRouter<TSchema extends z.ZodType = z.ZodType>(
    config: RouterConfig<TSchema>,
    agentRegistry?: Map<string, AgentDefinition<unknown, unknown, unknown>>,
): Router<TSchema> {
    return new Router(config, agentRegistry);
}

/**
 * Router as agent (can be used in multi-agent coordination)
 */
export function routerAsAgent<TSchema extends z.ZodType = z.ZodType>(
    router: Router<TSchema>,
    name?: string,
): AgentDefinition<z.infer<TSchema>, unknown, unknown> {
    // Return agent-compatible object without circular dependency
    return {
        name: name || `router-${router.config.name}`,
        identity: {
            role: 'Router',
            description: `Router: ${router.config.description || router.config.name}`,
            goal: 'Route requests to the most appropriate agent based on input analysis',
        },

        async think(input: z.infer<TSchema>, context: AgentContext) {
            const result = await router.route(input, context);

            return {
                reasoning: `Routed to: ${result.selectedRoute}. ${result.reasoning}`,
                action: {
                    type: 'final_answer',
                    content: result.result,
                },
            };
        },
    };
}

/**
 * 🔥 API Target V2: Router as Tool
 */
export function routerAsTool<TSchema extends z.ZodType = z.ZodType>(
    router: Router<TSchema>,
    toolName?: string,
    toolDescription?: string,
): RouterAsTool {
    return {
        name: toolName || `${router.config.name}-router`,
        description: toolDescription || `Router tool for ${router.config.name}`,
        schema: router.config.intentSchema,
        execute: async (input: unknown, context?: AgentContext) => {
            return await router.route(input as z.infer<TSchema>, context);
        },
    };
}
