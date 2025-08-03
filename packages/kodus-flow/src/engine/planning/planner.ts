/**
 * @module engine/planner-handler
 * @description Planner Handler híbrido: ctx.plan() + estratégias pluggáveis (CoT, ToT, Graph)
 *
 * FEATURES:
 * ✅ Interface simples ctx.plan() (SUA VISÃO)
 * ✅ Estratégias pluggáveis CoT/ToT/Graph (MINHA IMPLEMENTAÇÃO)
 * ✅ Dynamic planner switching
 * ✅ Context-aware strategy selection
 * ✅ Plan execution tracking
 */

import { createLogger } from '../../observability/index.js';
import { EngineError } from '../../core/errors.js';
import type { Event } from '../../core/types/events.js';
import type { AgentContext } from '../../core/types/agent-types.js';
import { createAgentContext } from '../../core/context/context-builder.js';
import type { MultiKernelHandler } from '../core/multi-kernel-handler.js';
import type {
    ToolExecutionStrategy,
    ToolExecutionHint,
    ToolId,
} from '../../core/types/tool-types.js';

import * as z from 'zod';
import { AgentId } from '@/core/types/base-types.js';

// ──────────────────────────────────────────────────────────────────────────────
// 🧠 PLANNING TYPES & INTERFACES
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Planning strategies
 */
export type PlanningStrategy =
    | 'cot'
    | 'tot'
    | 'graph'
    | 'multi'
    | 'react'
    | 'ooda'
    | 'llm_hybrid';

/**
 * Tool parameters for plan steps
 */
export interface ToolParameters {
    input?: unknown;
    options?: Record<string, unknown>;
    timeout?: number;
    retry?: number;
}

/**
 * Agent parameters for plan steps
 */
export interface AgentParameters {
    input?: unknown;
    context?: Record<string, unknown>;
    options?: Record<string, unknown>;
    timeout?: number;
}

/**
 * Plan step parameters
 */
export interface PlanStepParameters {
    tool?: ToolParameters;
    agent?: AgentParameters;
    custom?: Record<string, unknown>;
}

/**
 * Plan step definition
 */
export interface PlanStep {
    id: string;
    description: string;
    // SDK-compatible properties
    tool?: ToolId; // ID da tool a ser executada
    agent?: AgentId; // ID do agent a ser delegado
    params?: PlanStepParameters; // Parâmetros tipados para tool/agent
    critical?: boolean; // Se o step é crítico para o plano
    retry?: number; // Número de tentativas permitidas
    // Original properties
    dependencies?: string[]; // IDs of steps this depends on
    estimatedDuration?: number;
    complexity?: 'low' | 'medium' | 'high';
    completed?: boolean;
    result?: unknown;

    // ===== 🚀 NEW: TOOL EXECUTION INTELLIGENCE =====
    executionHint?: ToolExecutionHint; // Dica de estratégia de execução
    canRunInParallel?: boolean; // Pode ser executado em paralelo
    toolDependencies?: string[]; // Dependencies específicas de tools
    resourceRequirements?: {
        memory?: 'low' | 'medium' | 'high';
        cpu?: 'low' | 'medium' | 'high';
        network?: 'low' | 'medium' | 'high';
    };
}

/**
 * Plan definition
 */
export interface Plan {
    id: string;
    goal: string | string[];
    strategy: PlanningStrategy;
    steps: PlanStep[];
    context: Record<string, unknown>;
    createdAt: number;
    agentName: string;
    status: 'created' | 'executing' | 'completed' | 'failed';
    // SDK-compatible property
    metadata?: Record<string, unknown>;
}

/**
 * Plan execution result
 */
export interface PlanExecutionResult {
    planId: string;
    stepId?: string;
    success: boolean;
    result?: unknown;
    error?: string;
    duration: number;
    completedSteps: number;
    totalSteps: number;
}

/**
 * Planner interface (MINHA IMPLEMENTAÇÃO)
 */
export interface Planner {
    name: string;
    strategy: PlanningStrategy;

    /**
     * Create plan from goal and context
     */
    createPlan(
        goal: string | string[],
        context: AgentContext,
        options?: PlannerOptions,
        callbacks?: PlannerCallbacks,
    ): Promise<Plan>;

    /**
     * Execute plan (opcional - pode ser implementado pelo agent)
     */
    executePlan?(
        plan: Plan,
        context: AgentContext,
    ): Promise<PlanExecutionResult>;
}

/**
 * Planner options
 */
export interface PlannerOptions {
    maxSteps?: number;
    maxDepth?: number;
    beamWidth?: number; // For ToT
    temperature?: number; // For CoT
    timeout?: number;
    context?: Record<string, unknown>; // Additional context for planning
}

/**
 * Agent with planning capability
 */
export interface PlanningAgent {
    setPlanner(planner: Planner): void;
    getPlanner(): Planner | undefined;
}

/**
 * Callbacks para eventos do Planner
 */
export interface PlannerCallbacks {
    onPlanStart?: (
        goal: string | string[],
        context: AgentContext,
        strategy: PlanningStrategy,
    ) => void;
    onPlanStep?: (step: PlanStep, stepIndex: number, plan: Plan) => void;
    onPlanComplete?: (plan: Plan) => void;
    onPlanError?: (error: Error, plan?: Plan) => void;
    onReplan?: (plan: Plan, reason: string) => void;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🧠 CHAIN-OF-THOUGHT PLANNER
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Chain-of-Thought planner - linear, step-by-step reasoning (MINHA IMPLEMENTAÇÃO)
 */
export class CoTPlanner implements Planner {
    name = 'CoTPlanner';
    strategy: PlanningStrategy = 'cot';
    private logger = createLogger('cot-planner');

    constructor(
        private options: { temperature?: number; maxSteps?: number } = {},
    ) {}

    async createPlan(
        goal: string | string[],
        context: AgentContext,
        _options?: PlannerOptions,
        callbacks?: PlannerCallbacks,
    ): Promise<Plan> {
        const goalText = Array.isArray(goal) ? goal.join('; ') : goal;
        const maxSteps = _options?.maxSteps || this.options.maxSteps || 5;

        // Criar contexto de planning simples
        const planningContext = {
            plannerName: this.name,
            strategy: this.strategy,
            goal: goalText,
            maxSteps,
            maxDepth: _options?.maxDepth || 3,
            tenantId: context.tenantId,
            executionId: context.invocationId,
            correlationId: context.correlationId,
            addPlanHistory: (
                planId: string,
                stepsCount: number,
                success: boolean,
            ) => {
                this.logger.debug('Plan history added', {
                    planId,
                    stepsCount,
                    success,
                });
            },
        };

        this.logger.debug('Creating CoT plan', {
            goal: goalText,
            agentName: context.agentName,
            maxSteps,
        });

        // 🔥 CALLBACK: onPlanStart (se disponível)
        callbacks?.onPlanStart?.(goal, context, this.strategy);

        const steps: PlanStep[] = [];

        if (Array.isArray(goal)) {
            // 🎯 SUA VISÃO: Se goals são provided como steps, use direto
            goal.forEach((stepGoal, index) => {
                const step: PlanStep = {
                    id: `step-${index + 1}`,
                    description: stepGoal,
                    // SDK-compatible properties
                    tool: undefined,
                    agent: undefined,
                    params: {
                        custom: {
                            stepType: 'analysis',
                            complexity: 'medium',
                        },
                    },
                    critical: false,
                    retry: 0,
                    // Original properties
                    dependencies: index > 0 ? [`step-${index}`] : undefined,
                    complexity: 'medium',
                    completed: false,
                };
                steps.push(step);

                // 🔥 CALLBACK: onPlanStep (se disponível) - Plan será criado depois
                // callbacks?.onPlanStep?.(step, index, plan);
            });
        } else {
            // Decompose single goal into linear steps
            const decomposed = this.decomposeGoal(goalText, maxSteps);
            decomposed.forEach((stepDesc, index) => {
                const step: PlanStep = {
                    id: `step-${index + 1}`,
                    description: stepDesc,
                    // SDK-compatible properties
                    tool: undefined,
                    agent: undefined,
                    params: {
                        custom: {
                            stepType: 'analysis',
                            complexity: 'medium',
                        },
                    },
                    critical: false,
                    retry: 0,
                    // Original properties
                    dependencies: index > 0 ? [`step-${index}`] : undefined,
                    complexity: 'medium',
                    completed: false,
                };
                steps.push(step);

                // 🔥 CALLBACK: onPlanStep (se disponível) - Plan será criado depois
                // callbacks?.onPlanStep?.(step, index, plan);
            });
        }

        // NEW: Analyze parallelization opportunities
        const availableToolNames =
            context.availableToolsForLLM?.map(
                (t: { name: string }) => t.name,
            ) || [];
        if (availableToolNames.length > 0) {
            const parallelOpportunities = this.analyzeParallelization(
                availableToolNames,
                { goal: goalText, ...context },
            );

            // If parallel opportunities exist, add special step
            if (parallelOpportunities.parallelizable.length > 0) {
                const parallelTools =
                    parallelOpportunities.parallelizable.flat();
                steps.push({
                    id: 'parallel-execution',
                    description: `Execute ${parallelTools.join(', ')} in parallel`,
                    tool: undefined,
                    params: {
                        custom: {
                            executionStrategy: 'parallel_tools',
                            suggestedTools: parallelTools,
                            reasoning: 'Multiple independent tools identified',
                        },
                    },
                    critical: false,
                    retry: 0,
                    complexity: 'medium',
                    completed: false,
                });

                // Add to context state for agent intelligence
                await context.executionRuntime.setState(
                    'main',
                    'plannerSuggestions',
                    [
                        {
                            stepId: 'parallel-execution',
                            toolStrategy: 'parallel',
                            tools: parallelTools,
                            confidence: 0.8,
                            reasoning:
                                'Goal benefits from parallel tool execution',
                        },
                    ],
                );
            }
        }

        const plan: Plan = {
            id: `cot-plan-${Date.now()}`,
            goal: goalText,
            strategy: 'cot',
            steps,
            context: {
                temperature: this.options.temperature || 0.7,
                reasoningMode: 'linear',
                planner: 'CoT',
            },
            createdAt: Date.now(),
            agentName: context.agentName,
            status: 'created',
            metadata: {
                planner: 'CoT',
                temperature: this.options.temperature || 0.7,
                maxSteps,
            },
        };

        // 🔥 CALLBACK: onPlanStep (para cada step, agora que o plan existe)
        if (callbacks?.onPlanStep) {
            steps.forEach((step, index) => {
                callbacks.onPlanStep!(step, index, plan);
            });
        }

        // Adicionar histórico de plano criado
        planningContext.addPlanHistory(plan.id, steps.length, true);

        // 🔥 CALLBACK: onPlanComplete (se disponível)
        callbacks?.onPlanComplete?.(plan);

        return plan;
    }

    private decomposeGoal(goal: string, maxSteps: number): string[] {
        // Simple heuristic decomposition
        const words = goal.split(' ');
        if (words.length <= 5) {
            return [goal]; // Simple goal, single step
        }

        // Break into logical chunks
        return [
            `Analyze the goal: ${goal}`,
            `Identify key components and requirements`,
            `Execute main task step by step`,
            `Verify results and completion`,
            `Provide final summary`,
        ].slice(0, maxSteps);
    }

    // ===== 🚀 NEW: PLANNER INTELLIGENCE METHODS =====

    /**
     * Analyze parallelization opportunities in plan steps
     */
    analyzeParallelization(
        tools: string[],
        context: Record<string, unknown>,
    ): {
        parallelizable: string[][];
        sequential: string[];
        conditional: Record<string, string[]>;
        reasoning: string;
    } {
        this.logger.debug('Analyzing parallelization opportunities', {
            toolCount: tools.length,
            context: Object.keys(context),
        });

        const parallelizable: string[][] = [];
        const sequential: string[] = [];
        const conditional: Record<string, string[]> = {};

        // Simple heuristic analysis for CoT (Chain of Thought)
        // In CoT, we prefer sequential reasoning but can identify opportunities

        if (tools.length <= 1) {
            sequential.push(...tools);
            return {
                parallelizable,
                sequential,
                conditional,
                reasoning:
                    'Single or no tools - sequential execution optimal for CoT reasoning',
            };
        }

        // Check goal for parallelization hints
        const goalText = String(context.goal || '').toLowerCase();
        const hasParallelHints =
            goalText.includes('pesquisar') ||
            goalText.includes('buscar') ||
            goalText.includes('múltiplas') ||
            goalText.includes('analisar') ||
            goalText.includes('verificar') ||
            goalText.includes('coletar') ||
            goalText.includes('obter');

        // Group tools by type/category for parallel execution
        const readOnlyTools = tools.filter(
            (tool) =>
                tool.includes('read') ||
                tool.includes('get') ||
                tool.includes('fetch') ||
                tool.includes('search'),
        );
        const writeTools = tools.filter(
            (tool) =>
                tool.includes('write') ||
                tool.includes('create') ||
                tool.includes('update') ||
                tool.includes('delete'),
        );
        const analysisTools = tools.filter(
            (tool) =>
                tool.includes('analyze') ||
                tool.includes('process') ||
                tool.includes('calculate') ||
                tool.includes('check') ||
                tool.includes('validate'),
        );

        // If goal suggests parallel execution and we have search tools
        if (hasParallelHints && readOnlyTools.length > 1) {
            parallelizable.push(readOnlyTools);
        } else if (readOnlyTools.length > 1) {
            parallelizable.push(readOnlyTools);
        } else {
            sequential.push(...readOnlyTools);
        }

        // Write tools usually need to be sequential
        sequential.push(...writeTools);

        // Analysis tools can sometimes run in parallel if independent
        if (
            (hasParallelHints || analysisTools.length > 1) &&
            !context.requiresSequentialAnalysis
        ) {
            parallelizable.push(analysisTools);
        } else {
            sequential.push(...analysisTools);
        }

        // Conditional execution based on context
        if (context.hasAlternativePaths) {
            const alternatives = tools.filter(
                (tool) =>
                    tool.includes('alternative') || tool.includes('fallback'),
            );
            if (alternatives.length > 0) {
                conditional['alternative_execution'] = alternatives;
            }
        }

        const reasoning =
            `CoT Analysis: Found ${parallelizable.length} parallel groups, ` +
            `${sequential.length} sequential tools, ${Object.keys(conditional).length} conditional groups. ` +
            `CoT prefers sequential reasoning but allows parallel data gathering.`;

        this.logger.debug('Parallelization analysis complete', {
            parallelGroups: parallelizable.length,
            sequentialTools: sequential.length,
            conditionalGroups: Object.keys(conditional).length,
        });

        return { parallelizable, sequential, conditional, reasoning };
    }

    /**
     * Estimate execution complexity and suggest strategy
     */
    estimateComplexity(
        plan: Plan,
        context: Record<string, unknown>,
    ): {
        timeEstimate: number;
        resourceEstimate: number;
        riskLevel: 'low' | 'medium' | 'high';
        confidence: number;
    } {
        this.logger.debug('Estimating plan complexity', {
            stepCount: plan.steps.length,
            strategy: plan.strategy,
        });

        let timeEstimate = 0;
        let resourceEstimate = 0;
        let riskLevel: 'low' | 'medium' | 'high' = 'low';

        // Analyze each step
        plan.steps.forEach((step) => {
            const complexity = step.complexity || 'medium';
            const duration =
                step.estimatedDuration || this.getDefaultDuration(complexity);

            timeEstimate += duration;
            resourceEstimate += this.getResourceWeight(complexity);

            // Increase risk for critical steps
            if (step.critical) {
                riskLevel = riskLevel === 'low' ? 'medium' : 'high';
            }
        });

        // Consider context factors
        if (context.hasExternalDependencies) {
            timeEstimate *= 1.5;
            riskLevel = riskLevel === 'low' ? 'medium' : 'high';
        }

        if (context.requiresHighAccuracy) {
            timeEstimate *= 1.3;
            resourceEstimate *= 1.4;
        }

        // Confidence based on plan structure and available data
        const confidence = this.calculateConfidence(plan, context);

        this.logger.debug('Complexity estimation complete', {
            timeEstimate,
            resourceEstimate,
            riskLevel,
            confidence,
        });

        return { timeEstimate, resourceEstimate, riskLevel, confidence };
    }

    /**
     * Suggest optimizations for the plan
     */
    suggestOptimizations(
        plan: Plan,
        _context: Record<string, unknown>,
    ): {
        optimizations: string[];
        potentialSavings: number;
        tradeoffs: string[];
    } {
        const optimizations: string[] = [];
        const tradeoffs: string[] = [];
        let potentialSavings = 0;

        // Analyze step dependencies for optimization opportunities
        const independentSteps = plan.steps.filter(
            (step) => !step.dependencies || step.dependencies.length === 0,
        );

        if (independentSteps.length > 1) {
            optimizations.push(
                `Parallelize ${independentSteps.length} independent steps`,
            );
            potentialSavings += 0.3; // 30% time savings
            tradeoffs.push(
                'Increased resource usage during parallel execution',
            );
        }

        // Look for redundant or similar steps
        const stepDescriptions = plan.steps.map((s) =>
            s.description.toLowerCase(),
        );
        const duplicates = stepDescriptions.filter(
            (desc, index) => stepDescriptions.indexOf(desc) !== index,
        );

        if (duplicates.length > 0) {
            optimizations.push('Merge or eliminate duplicate analysis steps');
            potentialSavings += 0.15; // 15% time savings
            tradeoffs.push(
                'May reduce redundancy that helps with error detection',
            );
        }

        // Suggest caching for expensive operations
        const expensiveSteps = plan.steps.filter(
            (step) =>
                step.complexity === 'high' ||
                (step.estimatedDuration && step.estimatedDuration > 5000),
        );

        if (expensiveSteps.length > 0) {
            optimizations.push('Implement caching for expensive operations');
            potentialSavings += 0.25; // 25% savings on repeated executions
            tradeoffs.push(
                'Increased memory usage and cache invalidation complexity',
            );
        }

        // Consider batch processing
        if (plan.steps.length > 5) {
            optimizations.push('Group similar operations for batch processing');
            potentialSavings += 0.2; // 20% efficiency gain
            tradeoffs.push(
                'Less granular progress tracking and error isolation',
            );
        }

        this.logger.debug('Optimization analysis complete', {
            optimizationCount: optimizations.length,
            potentialSavings,
            tradeoffCount: tradeoffs.length,
        });

        return { optimizations, potentialSavings, tradeoffs };
    }

    /**
     * Get default duration based on complexity
     */
    private getDefaultDuration(complexity: 'low' | 'medium' | 'high'): number {
        switch (complexity) {
            case 'low':
                return 1000; // 1 second
            case 'medium':
                return 3000; // 3 seconds
            case 'high':
                return 8000; // 8 seconds
            default:
                return 3000;
        }
    }

    /**
     * Get resource weight based on complexity
     */
    private getResourceWeight(complexity: 'low' | 'medium' | 'high'): number {
        switch (complexity) {
            case 'low':
                return 1;
            case 'medium':
                return 3;
            case 'high':
                return 8;
            default:
                return 3;
        }
    }

    /**
     * Calculate confidence in estimates
     */
    private calculateConfidence(
        plan: Plan,
        context: Record<string, unknown>,
    ): number {
        let confidence = 0.8; // Base confidence

        // Reduce confidence for complex plans
        if (plan.steps.length > 10) confidence -= 0.2;
        if (plan.steps.some((s) => s.complexity === 'high')) confidence -= 0.1;

        // Reduce confidence for uncertain context
        if (context.hasUnknownRequirements) confidence -= 0.3;
        if (context.hasExternalDependencies) confidence -= 0.2;

        // Increase confidence for well-defined plans
        if (plan.steps.every((s) => s.estimatedDuration)) confidence += 0.1;
        if (context.hasHistoricalData) confidence += 0.2;

        return Math.max(0.1, Math.min(1.0, confidence));
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 🌳 TREE-OF-THOUGHTS PLANNER
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Tree-of-Thoughts planner - explores multiple reasoning paths (MINHA IMPLEMENTAÇÃO)
 */
export class ToTPlanner implements Planner {
    name = 'ToTPlanner';
    strategy: PlanningStrategy = 'tot';
    private logger = createLogger('tot-planner');

    constructor(
        private options: {
            beamWidth?: number;
            depth?: number;
        } = {},
    ) {}

    async createPlan(
        goal: string | string[],
        context: AgentContext,
        _options?: PlannerOptions,
        callbacks?: PlannerCallbacks,
    ): Promise<Plan> {
        const goalText = Array.isArray(goal) ? goal.join('; ') : goal;
        const beamWidth = _options?.beamWidth || this.options.beamWidth || 3;
        const maxDepth = _options?.maxDepth || this.options.depth || 3;

        this.logger.debug('Creating ToT plan', {
            goal: goalText,
            agentName: context.agentName,
            beamWidth,
            maxDepth,
        });

        // 🔥 CALLBACK: onPlanStart (se disponível)
        callbacks?.onPlanStart?.(goal, context, this.strategy);

        const steps: PlanStep[] = [];

        // 🎯 SUA VISÃO: Se array de goals, trata como branches a explorar
        if (Array.isArray(goal)) {
            goal.forEach((branchGoal, index) => {
                steps.push({
                    id: `branch-${index + 1}`,
                    description: `Explore approach: ${branchGoal}`,
                    // SDK-compatible properties
                    tool: undefined,
                    agent: undefined,
                    params: {
                        custom: {
                            stepType: 'exploration',
                            complexity: 'high',
                        },
                    },
                    critical: false,
                    retry: 0,
                    // Original properties
                    complexity: 'high',
                    completed: false,
                });
            });

            // Synthesis step
            steps.push({
                id: 'synthesis',
                description: 'Synthesize best approach from explored branches',
                // SDK-compatible properties
                tool: undefined,
                agent: undefined,
                params: {
                    custom: {
                        stepType: 'synthesis',
                        complexity: 'high',
                    },
                },
                critical: true,
                retry: 0,
                // Original properties
                dependencies: steps.map((s) => s.id),
                complexity: 'high',
                completed: false,
            });
        } else {
            // Create tree structure with multiple exploration paths

            // Root analysis
            steps.push({
                id: 'root',
                description: `Root analysis: ${goalText}`,
                // SDK-compatible properties
                tool: undefined,
                agent: undefined,
                params: {
                    custom: {
                        stepType: 'analysis',
                        complexity: 'low',
                    },
                },
                critical: false,
                retry: 0,
                // Original properties
                complexity: 'low',
                completed: false,
            });

            // Generate multiple thought branches
            for (let branch = 1; branch <= beamWidth; branch++) {
                for (let depth = 1; depth <= maxDepth; depth++) {
                    const stepId = `branch-${branch}-depth-${depth}`;
                    const parentId =
                        depth === 1
                            ? 'root'
                            : `branch-${branch}-depth-${depth - 1}`;

                    steps.push({
                        id: stepId,
                        description: `Branch ${branch}, Level ${depth}: Explore approach ${branch}`,
                        // SDK-compatible properties
                        tool: undefined,
                        agent: undefined,
                        params: {
                            custom: {
                                stepType: 'exploration',
                                complexity:
                                    depth === maxDepth ? 'high' : 'medium',
                            },
                        },
                        critical: depth === maxDepth,
                        retry: 0,
                        // Original properties
                        dependencies: [parentId],
                        complexity: depth === maxDepth ? 'high' : 'medium',
                        completed: false,
                    });
                }
            }

            // Synthesis step
            steps.push({
                id: 'synthesis',
                description: 'Synthesize best path from explored branches',
                // SDK-compatible properties
                tool: undefined,
                agent: undefined,
                params: {
                    custom: {
                        stepType: 'synthesis',
                        complexity: 'high',
                    },
                },
                critical: true,
                retry: 0,
                // Original properties
                dependencies: steps
                    .filter((s) => s.id.includes(`-depth-${maxDepth}`))
                    .map((s) => s.id),
                complexity: 'high',
                completed: false,
            });
        }

        // NEW: Add strategy branches with different tool execution approaches
        const availableTools =
            context.availableToolsForLLM?.map(
                (t: { name: string }) => t.name,
            ) || [];
        if (availableTools.length > 1) {
            const strategies = this.identifyToolExecutionStrategies(
                goalText,
                context,
            );

            strategies.forEach((strategy, index) => {
                steps.push({
                    id: `strategy-branch-${index + 1}`,
                    description: `Explore ${strategy.pattern} execution approach`,
                    tool: undefined,
                    params: {
                        custom: {
                            executionStrategy: strategy.pattern,
                            confidence: strategy.confidence,
                            reasoning: strategy.reasoning,
                            suggestedTools: strategy.tools,
                        },
                    },
                    critical: false,
                    retry: 0,
                    complexity: 'medium',
                    completed: false,
                });
            });

            // Add synthesis step for strategies
            if (strategies.length > 0) {
                steps.push({
                    id: 'strategy-synthesis',
                    description:
                        'Synthesize best execution strategy from explored branches',
                    dependencies: strategies.map(
                        (_, index) => `strategy-branch-${index + 1}`,
                    ),
                    critical: true,
                    tool: undefined,
                    params: {
                        custom: {
                            stepType: 'synthesis',
                            complexity: 'high',
                        },
                    },
                    retry: 0,
                    complexity: 'high',
                    completed: false,
                });
            }
        }

        const plan: Plan = {
            id: `tot-plan-${Date.now()}`,
            goal: goalText,
            strategy: 'tot',
            steps,
            context: {
                beamWidth,
                maxDepth,
                reasoningMode: 'tree_exploration',
                planner: 'ToT',
            },
            createdAt: Date.now(),
            agentName: context.agentName,
            status: 'created',
            metadata: {
                planner: 'ToT',
                beamWidth,
                maxDepth,
            },
        };

        // 🔥 CALLBACK: onPlanStep (para cada step, agora que o plan existe)
        if (callbacks?.onPlanStep) {
            steps.forEach((step, index) => {
                callbacks.onPlanStep!(step, index, plan);
            });
        }

        // 🔥 CALLBACK: onPlanComplete (se disponível)
        callbacks?.onPlanComplete?.(plan);

        return plan;
    }

    // ===== 🚀 NEW: PLANNER INTELLIGENCE METHODS =====

    /**
     * Analisa oportunidades de paralelização entre branches
     */
    analyzeBranchParallelization(
        steps: PlanStep[],
        _context: AgentContext,
    ): ToolExecutionHint {
        const branches = steps.filter((s) => s.id.includes('branch-'));
        const independentBranches = branches.filter(
            (s) =>
                !s.dependencies ||
                s.dependencies.length === 0 ||
                s.dependencies.every((dep) => dep === 'root'),
        );

        const strategy: ToolExecutionStrategy =
            independentBranches.length > 1 ? 'parallel' : 'sequential';

        return {
            strategy,
            confidence: independentBranches.length > 1 ? 0.9 : 0.3,
            reasoning:
                `ToT: ${independentBranches.length} branches independentes identificadas. ` +
                `Paralelização ${strategy === 'parallel' ? 'recomendada' : 'não recomendada'}.`,
            estimatedTime: branches.length * 2000,
            riskLevel: 'medium',
            benefits:
                strategy === 'parallel'
                    ? [
                          'Exploração simultânea de múltiplas abordagens',
                          'Redução do tempo total',
                      ]
                    : ['Execução sequencial mais controlada'],
            drawbacks:
                strategy === 'parallel'
                    ? ['Maior uso de recursos', 'Complexidade de sincronização']
                    : ['Tempo de execução maior'],
        };
    }

    /**
     * Estima complexidade de execução por branch
     */
    estimateBranchComplexity(
        steps: PlanStep[],
        _context: AgentContext,
    ): ToolExecutionHint {
        const branches = steps.filter((s) => s.id.includes('branch-'));
        const avgComplexity =
            branches.reduce((acc, step) => {
                const complexity = step.complexity || 'medium';
                return (
                    acc +
                    (complexity === 'high'
                        ? 3
                        : complexity === 'medium'
                          ? 2
                          : 1)
                );
            }, 0) / branches.length;

        const strategy: ToolExecutionStrategy =
            avgComplexity > 2.5 ? 'resourceAware' : 'parallel';

        return {
            strategy,
            confidence: 0.8,
            reasoning:
                `ToT: Complexidade média das branches: ${avgComplexity.toFixed(1)}. ` +
                `Estratégia ${strategy} escolhida baseada na complexidade.`,
            estimatedTime: Math.ceil(avgComplexity * 1500),
            riskLevel: avgComplexity > 2.5 ? 'high' : 'medium',
            benefits:
                strategy === 'resourceAware'
                    ? ['Uso eficiente de recursos', 'Prevenção de sobrecarga']
                    : ['Exploração paralela eficiente'],
            drawbacks:
                strategy === 'resourceAware'
                    ? ['Tempo de execução pode ser maior']
                    : ['Uso intenso de recursos'],
        };
    }

    /**
     * Sugere otimizações para execução das branches
     */
    suggestBranchOptimizations(
        steps: PlanStep[],
        _context: AgentContext,
    ): ToolExecutionHint {
        const branches = steps.filter((s) => s.id.includes('branch-'));
        const depthLevels = new Set(
            branches.map((s) => s.id.split('-depth-')[1]).filter(Boolean),
        ).size;

        const strategy: ToolExecutionStrategy =
            depthLevels > 2 ? 'dependencyBased' : 'parallel';

        return {
            strategy,
            confidence: 0.85,
            reasoning:
                `ToT: ${depthLevels} níveis de profundidade detectados. ` +
                `Estratégia ${strategy} otimizada para estrutura tree.`,
            estimatedTime: depthLevels * 1000,
            riskLevel: 'low',
            benefits:
                strategy === 'dependencyBased'
                    ? [
                          'Respeitא dependências entre níveis',
                          'Execução otimizada por profundidade',
                      ]
                    : ['Exploração paralela rápida'],
            drawbacks:
                strategy === 'dependencyBased'
                    ? ['Pode ser mais lenta que paralelização total']
                    : ['Pode não respeitar dependências adequadamente'],
            alternatives: ['sequential', 'conditional'],
        };
    }

    /**
     * Identify tool execution strategies based on goal and context
     */
    private identifyToolExecutionStrategies(
        _goal: string,
        context: AgentContext,
    ): Array<{
        pattern: ToolExecutionStrategy;
        confidence: number;
        reasoning: string;
        tools: string[];
    }> {
        const strategies = [];
        const availableTools =
            context.availableToolsForLLM?.map(
                (t: { name: string }) => t.name,
            ) || [];

        // Strategy 1: Parallel execution
        if (availableTools.length > 2) {
            strategies.push({
                pattern: 'parallel' as ToolExecutionStrategy,
                confidence: 0.8,
                reasoning: 'Multiple tools available for parallel execution',
                tools: availableTools.slice(0, 3),
            });
        }

        // Strategy 2: Sequential execution
        strategies.push({
            pattern: 'sequential' as ToolExecutionStrategy,
            confidence: 0.6,
            reasoning: 'Sequential execution ensures proper data flow',
            tools: availableTools.slice(0, 2),
        });

        // Strategy 3: Conditional execution
        if (availableTools.length > 1) {
            strategies.push({
                pattern: 'conditional' as ToolExecutionStrategy,
                confidence: 0.7,
                reasoning:
                    'Conditional execution based on intermediate results',
                tools: availableTools.slice(0, 2),
            });
        }

        return strategies;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 🕸️ GRAPH-OF-THOUGHTS PLANNER
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Graph-of-Thoughts planner - non-linear, interconnected reasoning (MINHA IMPLEMENTAÇÃO)
 */
export class GraphPlanner implements Planner {
    name = 'GraphPlanner';
    strategy: PlanningStrategy = 'graph';
    private logger = createLogger('graph-planner');

    constructor() {}

    async createPlan(
        goal: string | string[],
        context: AgentContext,
        _options?: PlannerOptions,
        callbacks?: PlannerCallbacks,
    ): Promise<Plan> {
        const goalText = Array.isArray(goal) ? goal.join('; ') : goal;

        this.logger.debug('Creating Graph plan', {
            goal: goalText,
            agentName: context.agentName,
        });

        // 🔥 CALLBACK: onPlanStart (se disponível)
        callbacks?.onPlanStart?.(goal, context, this.strategy);

        const steps: PlanStep[] = [];

        // 🎯 SUA VISÃO: Se array de goals, cria graph com connections
        if (Array.isArray(goal)) {
            goal.forEach((nodeGoal, index) => {
                const dependencies = index > 0 ? [`node-${index}`] : undefined;
                steps.push({
                    id: `node-${index + 1}`,
                    description: nodeGoal,
                    // SDK-compatible properties
                    tool: undefined,
                    agent: undefined,
                    params: {
                        custom: {
                            stepType: 'analysis',
                            complexity: 'medium',
                        },
                    },
                    critical: false,
                    retry: 0,
                    // Original properties
                    dependencies,
                    complexity: 'medium',
                    completed: false,
                });
            });

            // Add connection analysis
            steps.push({
                id: 'connections',
                description:
                    'Analyze connections and dependencies between goals',
                // SDK-compatible properties
                tool: undefined,
                agent: undefined,
                params: {
                    custom: {
                        stepType: 'analysis',
                        complexity: 'high',
                    },
                },
                critical: true,
                retry: 0,
                // Original properties
                dependencies: steps.map((s) => s.id),
                complexity: 'high',
                completed: false,
            });
        } else {
            // Create interconnected reasoning graph
            const graphSteps = [
                {
                    id: 'analyze',
                    description: `Analyze goal: ${goalText}`,
                    complexity: 'medium' as const,
                },
                {
                    id: 'context',
                    description: 'Gather relevant context and constraints',
                    dependencies: ['analyze'],
                    complexity: 'low' as const,
                },
                {
                    id: 'decompose',
                    description: 'Decompose into sub-problems',
                    dependencies: ['analyze', 'context'],
                    complexity: 'high' as const,
                },
                {
                    id: 'explore-A',
                    description: 'Explore solution path A',
                    dependencies: ['decompose'],
                    complexity: 'medium' as const,
                },
                {
                    id: 'explore-B',
                    description: 'Explore solution path B',
                    dependencies: ['decompose'],
                    complexity: 'medium' as const,
                },
                {
                    id: 'connect',
                    description: 'Find connections between paths',
                    dependencies: ['explore-A', 'explore-B'],
                    complexity: 'high' as const,
                },
                {
                    id: 'synthesize',
                    description: 'Synthesize optimal solution',
                    dependencies: ['connect', 'context'],
                    complexity: 'high' as const,
                },
                {
                    id: 'validate',
                    description: 'Validate solution against original goal',
                    dependencies: ['synthesize', 'analyze'],
                    complexity: 'medium' as const,
                },
            ];

            steps.push(
                ...graphSteps.map((step) => ({
                    ...step,
                    // SDK-compatible properties
                    tool: undefined,
                    agent: undefined,
                    params: {
                        custom: {
                            stepType: 'analysis',
                            complexity: step.complexity,
                        },
                    },
                    critical:
                        step.id === 'synthesize' || step.id === 'validate',
                    retry: 0,
                    // Original properties
                    completed: false,
                })),
            );
        }

        const plan: Plan = {
            id: `graph-plan-${Date.now()}`,
            goal: goalText,
            strategy: 'graph',
            steps,
            context: {
                reasoningMode: 'graph_exploration',
                connectivity: 0.6,
                planner: 'Graph',
            },
            createdAt: Date.now(),
            agentName: context.agentName,
            status: 'created',
            metadata: {
                planner: 'Graph',
                connectivity: 0.6,
            },
        };

        // 🔥 CALLBACK: onPlanStep (para cada step, agora que o plan existe)
        if (callbacks?.onPlanStep) {
            steps.forEach((step, index) => {
                callbacks.onPlanStep!(step, index, plan);
            });
        }

        // 🔥 CALLBACK: onPlanComplete (se disponível)
        callbacks?.onPlanComplete?.(plan);

        return plan;
    }

    // ===== 🚀 NEW: PLANNER INTELLIGENCE METHODS =====

    /**
     * Analisa interconexões entre nós do grafo
     */
    analyzeGraphConnections(
        steps: PlanStep[],
        _context: AgentContext,
    ): ToolExecutionHint {
        const connections = new Map<string, string[]>();

        // Mapear todas as conexões
        steps.forEach((step) => {
            if (step.dependencies) {
                step.dependencies.forEach((dep) => {
                    if (!connections.has(dep)) {
                        connections.set(dep, []);
                    }
                    connections.get(dep)!.push(step.id);
                });
            }
        });

        const parallelGroups = this.findParallelGroups(steps, connections);
        const strategy: ToolExecutionStrategy =
            parallelGroups.length > 1 ? 'dependencyBased' : 'sequential';

        return {
            strategy,
            confidence: 0.9,
            reasoning:
                `Graph: ${parallelGroups.length} grupos paralelos identificados. ` +
                `Execução ${strategy} otimizada para estrutura em grafo.`,
            estimatedTime: steps.length * 1500,
            riskLevel: 'medium',
            benefits:
                strategy === 'dependencyBased'
                    ? [
                          'Respeitא dependências entre nós',
                          'Paralelização onde possível',
                      ]
                    : ['Execução sequencial segura'],
            drawbacks:
                strategy === 'dependencyBased'
                    ? ['Complexidade de coordenação']
                    : ['Não aproveita oportunidades de paralelismo'],
            alternatives: ['parallel', 'sequential'],
        };
    }

    /**
     * Estima complexidade de execução do grafo
     */
    estimateGraphComplexity(
        steps: PlanStep[],
        _context: AgentContext,
    ): ToolExecutionHint {
        const complexityMap = { low: 1, medium: 2, high: 3 };
        const avgComplexity =
            steps.reduce(
                (acc, step) => acc + complexityMap[step.complexity || 'medium'],
                0,
            ) / steps.length;

        const interconnectedness = this.calculateInterconnectedness(steps);
        const strategy: ToolExecutionStrategy =
            interconnectedness > 0.7 ? 'dependencyBased' : 'adaptive';

        return {
            strategy,
            confidence: 0.85,
            reasoning:
                `Graph: Complexidade média ${avgComplexity.toFixed(1)}, ` +
                `interconectividade ${interconnectedness.toFixed(2)}. ` +
                `Estratégia ${strategy} escolhida.`,
            estimatedTime: Math.ceil(avgComplexity * interconnectedness * 2000),
            riskLevel: avgComplexity > 2.2 ? 'high' : 'medium',
            benefits:
                strategy === 'dependencyBased'
                    ? [
                          'Execução respeitando dependências',
                          'Otimização de caminhos críticos',
                      ]
                    : ['Adaptação dinâmica', 'Flexibilidade de execução'],
            drawbacks:
                strategy === 'dependencyBased'
                    ? ['Possível sub-otimização']
                    : ['Overhead de decisões adaptativas'],
        };
    }

    /**
     * Sugere otimizações para execução do grafo
     */
    suggestGraphOptimizations(
        steps: PlanStep[],
        _context: AgentContext,
    ): ToolExecutionHint {
        const criticalPath = this.findCriticalPath(steps);
        const bottlenecks = this.identifyBottlenecks(steps);

        const strategy: ToolExecutionStrategy =
            bottlenecks.length > 0 ? 'resourceAware' : 'parallel';

        return {
            strategy,
            confidence: 0.8,
            reasoning:
                `Graph: Caminho crítico tem ${criticalPath.length} nós, ` +
                `${bottlenecks.length} gargalos identificados. ` +
                `Estratégia ${strategy} para otimização.`,
            estimatedTime: criticalPath.length * 1000,
            riskLevel: bottlenecks.length > 2 ? 'high' : 'low',
            benefits:
                strategy === 'resourceAware'
                    ? ['Evita gargalos de recursos', 'Execução balanceada']
                    : ['Maximiza paralelismo', 'Tempo mínimo de execução'],
            drawbacks:
                strategy === 'resourceAware'
                    ? ['Pode ser mais lenta']
                    : ['Risco de sobrecarregar recursos'],
            alternatives: ['priorityBased', 'conditional'],
        };
    }

    /**
     * Encontra grupos de execução paralela
     */
    private findParallelGroups(
        steps: PlanStep[],
        connections: Map<string, string[]>,
    ): string[][] {
        const groups: string[][] = [];
        const visited = new Set<string>();

        steps.forEach((step) => {
            if (
                !visited.has(step.id) &&
                (!step.dependencies || step.dependencies.length === 0)
            ) {
                const group = this.collectParallelGroup(
                    step.id,
                    steps,
                    connections,
                    visited,
                );
                if (group.length > 0) {
                    groups.push(group);
                }
            }
        });

        return groups;
    }

    /**
     * Coleta grupo paralelo a partir de um nó
     */
    private collectParallelGroup(
        startId: string,
        steps: PlanStep[],
        connections: Map<string, string[]>,
        visited: Set<string>,
    ): string[] {
        const group: string[] = [];
        const queue = [startId];

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (visited.has(current)) continue;

            visited.add(current);
            group.push(current);

            // Adicionar dependentes que podem executar em paralelo
            const dependents = connections.get(current) || [];
            dependents.forEach((dep) => {
                const depStep = steps.find((s) => s.id === dep);
                if (depStep && this.canRunInParallel(depStep, steps, visited)) {
                    queue.push(dep);
                }
            });
        }

        return group;
    }

    /**
     * Verifica se um step pode executar em paralelo
     */
    private canRunInParallel(
        step: PlanStep,
        steps: PlanStep[],
        visited: Set<string>,
    ): boolean {
        if (!step.dependencies) return true;

        // Verificar se todas as dependências já foram visitadas
        const dependenciesMet = step.dependencies.every((dep) =>
            visited.has(dep),
        );

        // Verificar se as dependências realmente existem nos steps
        const dependenciesExist = step.dependencies.every((dep) =>
            steps.some((s) => s.id === dep),
        );

        return dependenciesMet && dependenciesExist;
    }

    /**
     * Calcula interconectividade do grafo
     */
    private calculateInterconnectedness(steps: PlanStep[]): number {
        const totalConnections = steps.reduce(
            (acc, step) => acc + (step.dependencies?.length || 0),
            0,
        );
        const maxPossibleConnections = (steps.length * (steps.length - 1)) / 2;

        return maxPossibleConnections > 0
            ? totalConnections / maxPossibleConnections
            : 0;
    }

    /**
     * Encontra caminho crítico no grafo
     */
    private findCriticalPath(steps: PlanStep[]): string[] {
        // Implementação simplificada do caminho crítico
        const complexityMap = { low: 1, medium: 2, high: 3 };
        let longestPath: string[] = [];
        let maxComplexity = 0;

        const findPath = (
            stepId: string,
            currentPath: string[],
            currentComplexity: number,
        ) => {
            const step = steps.find((s) => s.id === stepId);
            if (!step) return;

            const newPath = [...currentPath, stepId];
            const newComplexity =
                currentComplexity + complexityMap[step.complexity || 'medium'];

            if (newComplexity > maxComplexity) {
                maxComplexity = newComplexity;
                longestPath = newPath;
            }

            // Continuar para dependentes
            steps.forEach((s) => {
                if (s.dependencies?.includes(stepId)) {
                    findPath(s.id, newPath, newComplexity);
                }
            });
        };

        // Começar de nós sem dependências
        steps.forEach((step) => {
            if (!step.dependencies || step.dependencies.length === 0) {
                findPath(step.id, [], 0);
            }
        });

        return longestPath;
    }

    /**
     * Identifica gargalos no grafo
     */
    private identifyBottlenecks(steps: PlanStep[]): string[] {
        const inDegree = new Map<string, number>();
        const outDegree = new Map<string, number>();

        // Calcular graus de entrada e saída
        steps.forEach((step) => {
            inDegree.set(step.id, step.dependencies?.length || 0);
            outDegree.set(step.id, 0);
        });

        steps.forEach((step) => {
            step.dependencies?.forEach((dep) => {
                outDegree.set(dep, (outDegree.get(dep) || 0) + 1);
            });
        });

        // Identificar gargalos (nós com alto grau de saída)
        const bottlenecks: string[] = [];
        outDegree.forEach((degree, stepId) => {
            if (degree > 2) {
                // Threshold para considerar gargalo
                bottlenecks.push(stepId);
            }
        });

        return bottlenecks;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 🧠 PLANNER HANDLER & REGISTRY
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Planner handler manages planning strategies for agents (HÍBRIDO)
 */
export class PlannerHandler {
    private logger = createLogger('planner-handler');
    private planners = new Map<string, Planner>();
    private activePlans = new Map<string, Plan>();
    private agentPlanners = new Map<string, string>(); // agentName -> plannerName
    private kernelHandler?: MultiKernelHandler;
    private callbacks?: PlannerCallbacks;
    private planningStats = {
        total: 0,
        success: 0,
        failed: 0,
        duration: 0,
    };

    constructor(
        kernelHandler?: MultiKernelHandler,
        callbacks?: PlannerCallbacks,
    ) {
        this.kernelHandler = kernelHandler;
        this.callbacks = callbacks;

        // Register default planners (MINHA IMPLEMENTAÇÃO)
        this.registerPlanner('cot', new CoTPlanner());
        this.registerPlanner('tot', new ToTPlanner());
        this.registerPlanner('graph', new GraphPlanner());

        this.logger.info('PlannerHandler created', {
            hasKernelHandler: !!kernelHandler,
        });
    }

    /**
     * Handle planning request (HÍBRIDO: Event-driven + ctx.plan())
     */
    async handlePlanning(event: Event): Promise<Event> {
        const startTime = Date.now();
        this.planningStats.total++;

        // Emit planning start event via KernelHandler
        if (this.kernelHandler) {
            this.kernelHandler.emit('planner.start', {
                eventId: event.id,
                eventType: event.type,
                startTime,
            });
        }

        try {
            const {
                plannerName,
                goal,
                agentName,
                context: planContext = {},
                options = {},
                correlationId,
                executionId,
            } = event.data as {
                plannerName?: string;
                goal: string | string[];
                agentName: string;
                context?: Record<string, unknown>;
                options?: PlannerOptions;
                correlationId: string;
                executionId: string;
            };

            this.logger.debug('Processing planning request', {
                plannerName,
                goal,
                agentName,
                correlationId,
            });

            // 🎯 SUA VISÃO: Get planner for agent (pode ser setado dinamicamente)
            const selectedPlannerName =
                plannerName || this.agentPlanners.get(agentName) || 'cot';
            const planner = this.planners.get(selectedPlannerName);

            if (!planner) {
                throw new EngineError(
                    'AGENT_ERROR',
                    `Planner not found: ${selectedPlannerName}`,
                    {
                        context: {
                            plannerName: selectedPlannerName,
                            availablePlanners: Array.from(this.planners.keys()),
                        },
                    },
                );
            }

            // Create agent context using factory
            const agentContext = await createAgentContext({
                agentName,
                thread: {
                    id: executionId,
                    metadata: { description: 'Planner execution thread' },
                },
                correlationId, // Optional - will be generated if not provided
            });

            // 🔥 CALLBACK: onPlanStart
            this.callbacks?.onPlanStart?.(goal, agentContext, planner.strategy);

            // Create plan using selected planner (callbacks já são chamados dentro da estratégia)
            const plan = await planner.createPlan(
                goal,
                agentContext,
                { ...options, context: planContext },
                this.callbacks,
            );

            // Store active plan
            this.activePlans.set(plan.id, plan);

            // Update stats
            this.updatePlanningStats(
                true,
                Date.now() - startTime,
                planner.strategy,
            );

            // 🔥 CALLBACK: onPlanComplete (já chamado dentro da estratégia)

            // Emit planning success event via KernelHandler
            if (this.kernelHandler) {
                this.kernelHandler.emit('planner.success', {
                    planId: plan.id,
                    strategy: plan.strategy,
                    stepsCount: plan.steps.length,
                    agentName,
                    correlationId,
                    duration: Date.now() - startTime,
                });
            }

            this.logger.info('Planning completed successfully', {
                planId: plan.id,
                strategy: plan.strategy,
                stepsCount: plan.steps.length,
                agentName,
                correlationId,
            });

            return {
                id: `planner-planned-${Date.now()}`,
                type: 'planner.planned',
                threadId: event.threadId,
                data: {
                    plan,
                    plannerName: selectedPlannerName,
                    agentName,
                    correlationId,
                    executionId,
                },
                ts: Date.now(),
            };
        } catch (error) {
            // 🔥 CALLBACK: onPlanError
            this.callbacks?.onPlanError?.(
                error instanceof Error ? error : new Error(String(error)),
            );

            // Emit planning error event via KernelHandler
            if (this.kernelHandler) {
                this.kernelHandler.emit('planner.error', {
                    error: (error as Error).message,
                    duration: Date.now() - startTime,
                });
            }

            this.updatePlanningStats(false, Date.now() - startTime);

            this.logger.error('Planning failed', error as Error);

            throw new EngineError('AGENT_ERROR', 'Planning failed', {
                context: {
                    originalError: error,
                    operation: 'planning',
                },
            });
        }
    }

    /**
     * 🎯 SUA VISÃO: Set planner for agent (dynamic switching)
     */
    setAgentPlanner(agentName: string, plannerName: string): void {
        if (!this.planners.has(plannerName)) {
            throw new EngineError(
                'AGENT_ERROR',
                `Planner not found: ${plannerName}`,
                {
                    context: {
                        plannerName,
                        availablePlanners: Array.from(this.planners.keys()),
                    },
                },
            );
        }

        this.agentPlanners.set(agentName, plannerName);
        this.logger.info('Agent planner updated', {
            agentName,
            plannerName,
        });
    }

    /**
     * Get planner for agent
     */
    getAgentPlanner(agentName: string): string {
        return this.agentPlanners.get(agentName) || 'cot';
    }

    /**
     * Register planner (MINHA IMPLEMENTAÇÃO)
     */
    registerPlanner(name: string, planner: Planner): void {
        this.planners.set(name, planner);
        this.logger.info('Planner registered', {
            plannerName: name,
            strategy: planner.strategy,
        });
    }

    /**
     * Update planning statistics
     */
    private updatePlanningStats(
        success: boolean,
        duration: number,
        _strategy?: PlanningStrategy,
    ): void {
        if (success) {
            this.planningStats.success++;
        } else {
            this.planningStats.failed++;
        }

        // Update average planning time
        const currentAvg = this.planningStats.duration;
        const total = this.planningStats.total;
        this.planningStats.duration =
            (currentAvg * (total - 1) + duration) / total;
    }

    /**
     * Get planning statistics
     */
    getPlanningStats(): typeof this.planningStats & { successRate: number } {
        const successRate =
            this.planningStats.total > 0
                ? this.planningStats.success / this.planningStats.total
                : 0;

        return {
            ...this.planningStats,
            successRate,
        };
    }

    /**
     * Get available planners
     */
    getAvailablePlanners(): string[] {
        return Array.from(this.planners.keys());
    }

    /**
     * Get active plan
     */
    getActivePlan(planId: string): Plan | undefined {
        return this.activePlans.get(planId);
    }

    /**
     * 🔥 REPLAN: Replan existing plan (API Target V2)
     */
    async replan(
        planId: string,
        reason: string,
        newGoal?: string | string[],
        options?: PlannerOptions,
    ): Promise<Plan> {
        const existingPlan = this.activePlans.get(planId);
        if (!existingPlan) {
            throw new EngineError('AGENT_ERROR', `Plan not found: ${planId}`);
        }

        this.logger.info('Starting replan', {
            planId,
            reason,
            agentName: existingPlan.agentName,
        });

        // 🔥 CALLBACK: onReplan
        this.callbacks?.onReplan?.(existingPlan, reason);

        // Get planner for the agent
        const plannerName = this.getAgentPlanner(existingPlan.agentName);
        const planner = this.planners.get(plannerName);
        if (!planner) {
            throw new EngineError(
                'AGENT_ERROR',
                `Planner not found: ${plannerName}`,
            );
        }

        // Create new agent context using factory
        const agentContext = await createAgentContext({
            agentName: existingPlan.agentName,
            thread: {
                id: `replan-${Date.now()}`,
                metadata: { description: 'Replan execution thread' },
            },
        });

        // 🔥 CALLBACK: onPlanStart (for replan)
        this.callbacks?.onPlanStart?.(
            newGoal || existingPlan.goal,
            agentContext,
            planner.strategy,
        );

        // Create new plan
        const newPlan = await planner.createPlan(
            newGoal || existingPlan.goal,
            agentContext,
            options,
            this.callbacks,
        );

        // 🔥 CALLBACK: onPlanStep (para cada step do novo plano)
        newPlan.steps.forEach((step, index) => {
            this.callbacks?.onPlanStep?.(step, index, newPlan);
        });

        // Update active plans
        this.activePlans.delete(planId);
        this.activePlans.set(newPlan.id, newPlan);

        // 🔥 CALLBACK: onPlanComplete (for replan)
        this.callbacks?.onPlanComplete?.(newPlan);

        this.logger.info('Replan completed', {
            oldPlanId: planId,
            newPlanId: newPlan.id,
            reason,
            stepsCount: newPlan.steps.length,
        });

        return newPlan;
    }

    /**
     * Cleanup resources
     */
    async dispose(): Promise<void> {
        this.planners.clear();
        this.activePlans.clear();
        this.agentPlanners.clear();
        this.logger.info('PlannerHandler disposed');
    }

    /**
     * Set KernelHandler (for dependency injection)
     */
    setKernelHandler(kernelHandler: MultiKernelHandler): void {
        this.kernelHandler = kernelHandler;
        this.logger.info('KernelHandler set for PlannerHandler');
    }

    /**
     * Get KernelHandler status
     */
    hasKernelHandler(): boolean {
        return !!this.kernelHandler;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 🛠️ FACTORY & UTILITY FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Create planner handler
 */
export function createPlannerHandler(
    callbacks?: PlannerCallbacks,
): PlannerHandler {
    return new PlannerHandler(undefined, callbacks);
}

/**
 * 🔥 API Target V2: Create planner with multiple strategies
 */
export function createAdvancedPlanner(config: {
    name: string;
    description?: string;
    strategies?: {
        cot?: { prompt?: string; maxSteps?: number; temperature?: number };
        tot?: { prompt?: string; maxBranches?: number; maxSteps?: number };
        graph?: { prompt?: string };
        dynamic?: {
            fallbackStrategy: PlanningStrategy;
            complexityThreshold: number;
        };
    };
    decideStrategy?: (input: unknown) => PlanningStrategy;
    planSchema?: z.ZodType;
    defaultOptions?: PlannerOptions;
}): Planner {
    // For now, return a simple planner based on the first available strategy
    if (config.strategies?.cot) {
        return new CoTPlanner({
            temperature: config.strategies.cot.temperature,
            maxSteps: config.strategies.cot.maxSteps,
        });
    }

    if (config.strategies?.tot) {
        return new ToTPlanner({
            beamWidth: config.strategies.tot.maxBranches,
            depth: config.strategies.tot.maxSteps,
        });
    }

    if (config.strategies?.graph) {
        return new GraphPlanner();
    }

    // Default
    return new CoTPlanner();
}

/**
 * Create context-aware planner (MINHA IMPLEMENTAÇÃO)
 */
export function createContextAwarePlanner(context: AgentContext): Planner {
    // Simple heuristics for planner selection
    const complexity = estimateComplexity(context);

    if (complexity < 0.3) {
        return new CoTPlanner({ temperature: 0.7 });
    } else if (complexity < 0.7) {
        return new ToTPlanner({ beamWidth: 3, depth: 2 });
    } else {
        return new GraphPlanner();
    }
}

/**
 * Dynamic planner factory - compatível com planners.ts
 * Replacement for dynamicPlanner from planners.ts
 */
export function dynamicPlanner(planningContext?: {
    maxDepth?: number;
    maxBranches?: number;
    preferredStrategy?: 'cot' | 'tot' | 'graph';
}): PlannerHandler {
    const handler = new PlannerHandler();

    // Configure planners based on context
    const strategy = planningContext?.preferredStrategy || 'cot';
    const maxDepth = planningContext?.maxDepth || 3;
    const maxBranches = planningContext?.maxBranches || 3;

    // Register planners with context-aware configuration
    handler.registerPlanner(
        'cot',
        new CoTPlanner({
            temperature: 0.7,
            maxSteps: maxDepth,
        }),
    );
    handler.registerPlanner(
        'tot',
        new ToTPlanner({
            beamWidth: maxBranches,
            depth: maxDepth,
        }),
    );
    handler.registerPlanner('graph', new GraphPlanner());

    // Set preferred strategy if provided
    if (strategy && strategy !== 'cot') {
        // Set default planner for dynamic selection
        handler.setAgentPlanner('default', strategy);
    }

    return handler;
}

/**
 * Estimate task complexity from context
 */
function estimateComplexity(context: AgentContext): number {
    // Mock complexity estimation
    let complexity = 0.5; // Base complexity

    // More tools available = more complex
    if (context.availableToolsForLLM) {
        complexity += Math.min(context.availableToolsForLLM.length * 0.1, 0.3);
    }

    return Math.min(complexity, 1.0);
}

// ──────────────────────────────────────────────────────────────────────────────
// 📋 ENHANCED CONTEXT EXTENSION (SUA VISÃO: ctx.plan())
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Planning context extension para ctx.plan() (SUA VISÃO)
 */
export interface PlanningContext {
    /**
     * 🎯 SUA VISÃO: Simple planning interface
     */
    plan(goal: string | string[], options?: PlannerOptions): Promise<Plan>;

    /**
     * Set planner strategy for this agent
     */
    setPlanner(strategy: PlanningStrategy): void;

    /**
     * Get current planner strategy
     */
    getPlanner(): PlanningStrategy;
}

/**
 * Create planning context extension
 */
export function createPlanningContext(
    agentName: string,
    plannerHandler: PlannerHandler,
    correlationId: string,
    executionId: string,
    threadId: string,
): PlanningContext {
    return {
        async plan(
            goal: string | string[],
            options?: PlannerOptions,
        ): Promise<Plan> {
            // Simulate event-driven planning via PlannerHandler
            const event = {
                id: `planner-plan-${Date.now()}`,
                type: 'planner.plan',
                threadId: threadId,
                data: {
                    goal,
                    agentName,
                    options,
                    correlationId,
                    executionId,
                },
                ts: Date.now(),
            };

            const result = await plannerHandler.handlePlanning(event);
            return (result.data as { plan: Plan }).plan;
        },

        setPlanner(strategy: PlanningStrategy): void {
            plannerHandler.setAgentPlanner(agentName, strategy);
        },

        getPlanner(): PlanningStrategy {
            const plannerName = plannerHandler.getAgentPlanner(agentName);
            const planner = plannerHandler['planners'].get(plannerName);
            return planner?.strategy || 'cot';
        },
    };
}

/**
 * Planner strategy configuration (API Target V2)
 */
export interface PlannerStrategyConfig {
    prompt?: string;
    maxSteps?: number;
    maxBranches?: number;
    temperature?: number;
    evaluationFn?: (branch: unknown) => number;
}

/**
 * Planner configuration (API Target V2)
 */
export interface PlannerConfig {
    name: string;
    description?: string;

    // ✨ Multiple strategies with configs
    strategies?: {
        cot?: PlannerStrategyConfig;
        tot?: PlannerStrategyConfig;
        graph?: PlannerStrategyConfig;
        dynamic?: {
            fallbackStrategy: PlanningStrategy;
            complexityThreshold: number;
        };
    };

    // ✨ Auto strategy selection
    decideStrategy?: (input: unknown) => PlanningStrategy;

    // ✨ Plan structure definition
    planSchema?: z.ZodType;

    // ✨ Default options
    defaultOptions?: PlannerOptions;
}

/**
 * Planner with multiple strategies (API Target V2)
 */
export class MultiStrategyPlanner implements Planner {
    name: string;
    strategy: PlanningStrategy = 'cot'; // Default
    private logger = createLogger('multi-strategy-planner');
    private config: PlannerConfig;
    private planners = new Map<PlanningStrategy, Planner>();

    constructor(config: PlannerConfig) {
        this.name = config.name;
        this.config = config;
        this.initializePlanners();
    }

    private initializePlanners(): void {
        // Initialize individual planners with custom configs
        if (this.config.strategies?.cot) {
            const cotConfig = this.config.strategies.cot;
            this.planners.set(
                'cot',
                new CoTPlanner({
                    temperature: cotConfig.temperature,
                    maxSteps: cotConfig.maxSteps,
                }),
            );
        }

        if (this.config.strategies?.tot) {
            const totConfig = this.config.strategies.tot;
            this.planners.set(
                'tot',
                new ToTPlanner({
                    beamWidth: totConfig.maxBranches,
                    depth: totConfig.maxSteps,
                }),
            );
        }

        if (this.config.strategies?.graph) {
            this.planners.set('graph', new GraphPlanner());
        }

        // Set default planners if not configured
        if (!this.planners.has('cot'))
            this.planners.set('cot', new CoTPlanner());
        if (!this.planners.has('tot'))
            this.planners.set('tot', new ToTPlanner());
        if (!this.planners.has('graph'))
            this.planners.set('graph', new GraphPlanner());
    }

    async createPlan(
        goal: string | string[],
        context: AgentContext,
        options?: PlannerOptions,
        callbacks?: PlannerCallbacks,
    ): Promise<Plan> {
        // ✨ Auto strategy selection
        const selectedStrategy = this.selectStrategy(goal, context);
        this.strategy = selectedStrategy;

        this.logger.info('Creating plan with multi-strategy', {
            plannerName: this.name,
            selectedStrategy,
            goal: Array.isArray(goal) ? goal.join('; ') : goal,
        });

        const planner = this.planners.get(selectedStrategy);
        if (!planner) {
            throw new Error(
                `Planner not found for strategy: ${selectedStrategy}`,
            );
        }

        // Merge options
        const mergedOptions = {
            ...this.config.defaultOptions,
            ...options,
        };

        // Create plan using selected planner
        const plan = await planner.createPlan(
            goal,
            context,
            mergedOptions,
            callbacks,
        );

        // ✨ Validate plan against schema if provided
        if (this.config.planSchema) {
            try {
                this.config.planSchema.parse(plan);
            } catch (error) {
                this.logger.warn('Plan validation failed', { error });
            }
        }

        return plan;
    }

    private selectStrategy(
        _goal: string | string[],
        context: AgentContext,
    ): PlanningStrategy {
        // Use custom strategy selection if provided
        if (this.config.decideStrategy) {
            return this.config.decideStrategy({ goal: _goal, context });
        }

        // Default strategy selection logic
        const goalText = Array.isArray(_goal) ? _goal.join(' ') : _goal;
        const complexity = this.estimateComplexity(goalText);

        if (
            this.config.strategies?.dynamic &&
            complexity >
                (this.config.strategies.dynamic.complexityThreshold || 0.7)
        ) {
            return this.config.strategies.dynamic.fallbackStrategy;
        }

        // Simple heuristics
        if (
            goalText.length > 200 ||
            goalText.includes('complex') ||
            goalText.includes('multiple')
        ) {
            return 'tot';
        } else if (goalText.includes('graph') || goalText.includes('network')) {
            return 'graph';
        } else {
            return 'cot';
        }
    }

    private estimateComplexity(goalText: string): number {
        // Simple complexity estimation
        const words = goalText.split(' ').length;
        const hasComplexWords = /complex|multiple|advanced|sophisticated/i.test(
            goalText,
        );
        return Math.min(1, words / 50 + (hasComplexWords ? 0.3 : 0));
    }

    // ===== 🚀 NEW: PLANNER INTELLIGENCE METHODS =====

    /**
     * Analyze tool patterns across all strategies to recommend optimal approach
     */
    analyzeToolPatterns(
        goals: string[],
        context: Record<string, unknown>,
    ): {
        recommendedStrategy: PlanningStrategy;
        patterns: {
            cot: {
                tools: string[];
                parallelizable: boolean;
                complexity: number;
            };
            tot: { branches: number; depth: number; parallelizable: boolean };
            graph: { nodes: string[]; edges: number; cyclic: boolean };
        };
        reasoning: string;
    } {
        const patterns = {
            cot: this.analyzeCotPatterns(goals, context),
            tot: this.analyzeToTPatterns(goals, context),
            graph: this.analyzeGraphPatterns(goals, context),
        };

        // Determine best strategy based on patterns
        let recommendedStrategy: PlanningStrategy = 'cot';
        let reasoning = 'Default CoT strategy selected';

        // Check if ToT is better for branching scenarios
        if (patterns.tot.branches > 3 && patterns.tot.depth > 2) {
            recommendedStrategy = 'tot';
            reasoning = `ToT recommended: ${patterns.tot.branches} branches with depth ${patterns.tot.depth}`;
        }

        // Check if Graph is better for interconnected tasks
        if (patterns.graph.edges > patterns.graph.nodes.length) {
            recommendedStrategy = 'graph';
            reasoning = `Graph recommended: ${patterns.graph.edges} connections between ${patterns.graph.nodes.length} nodes`;
        }

        // Override with CoT if tools are highly parallelizable
        if (patterns.cot.parallelizable && patterns.cot.complexity < 0.6) {
            recommendedStrategy = 'cot';
            reasoning = `CoT recommended: ${patterns.cot.tools.length} parallelizable tools with low complexity`;
        }

        return {
            recommendedStrategy,
            patterns,
            reasoning,
        };
    }

    /**
     * Select optimized strategy based on multiple factors
     */
    selectOptimizedStrategy(
        goals: string[],
        context: Record<string, unknown>,
        constraints?: {
            timeLimit?: number;
            resourceLimit?: number;
            qualityThreshold?: number;
        },
    ): {
        strategy: PlanningStrategy;
        confidence: number;
        alternativeStrategies: PlanningStrategy[];
        reasoning: string;
    } {
        const toolAnalysis = this.analyzeToolPatterns(goals, context);
        const complexityScore = this.estimateComplexity(goals.join(' '));

        // Factor in constraints
        const timeConstrained =
            constraints?.timeLimit && constraints.timeLimit < 30000;
        const resourceConstrained =
            constraints?.resourceLimit && constraints.resourceLimit < 0.5;
        const qualityRequired =
            constraints?.qualityThreshold && constraints.qualityThreshold > 0.8;

        let strategy: PlanningStrategy = toolAnalysis.recommendedStrategy;
        let confidence = 0.7;
        let reasoning = toolAnalysis.reasoning;

        // Adjust based on constraints
        if (timeConstrained && strategy === 'tot') {
            strategy = 'cot';
            confidence = 0.8;
            reasoning = `Switched to CoT due to time constraints (${constraints?.timeLimit}ms)`;
        } else if (resourceConstrained && strategy === 'graph') {
            strategy = 'cot';
            confidence = 0.75;
            reasoning = `Switched to CoT due to resource constraints (${constraints?.resourceLimit})`;
        } else if (
            qualityRequired &&
            strategy === 'cot' &&
            complexityScore > 0.7
        ) {
            strategy = 'tot';
            confidence = 0.9;
            reasoning = `Switched to ToT for higher quality output (complexity: ${complexityScore.toFixed(2)})`;
        }

        // Determine alternative strategies
        const allStrategies: PlanningStrategy[] = ['cot', 'tot', 'graph'];
        const alternativeStrategies = allStrategies.filter(
            (s) => s !== strategy,
        );

        return {
            strategy,
            confidence,
            alternativeStrategies,
            reasoning,
        };
    }

    /**
     * Suggest optimal planner configuration for each strategy
     */
    suggestPlannerConfiguration(
        goals: string[],
        _context: Record<string, unknown>,
    ): {
        cot: { maxSteps: number; temperature: number; reasoning: string };
        tot: { beamWidth: number; depth: number; reasoning: string };
        graph: { maxNodes: number; maxEdges: number; reasoning: string };
    } {
        const goalComplexity = this.estimateComplexity(goals.join(' '));
        const goalCount = goals.length;

        return {
            cot: {
                maxSteps: Math.min(10, Math.max(3, goalCount * 2)),
                temperature: goalComplexity > 0.7 ? 0.8 : 0.5,
                reasoning: `${goalCount} goals with ${goalComplexity.toFixed(2)} complexity`,
            },
            tot: {
                beamWidth: Math.min(5, Math.max(2, Math.ceil(goalCount / 2))),
                depth: Math.min(8, Math.max(3, Math.ceil(goalComplexity * 10))),
                reasoning: `Branching factor based on ${goalCount} goals and ${goalComplexity.toFixed(2)} complexity`,
            },
            graph: {
                maxNodes: Math.min(15, Math.max(5, goalCount * 3)),
                maxEdges: Math.min(25, Math.max(8, goalCount * 4)),
                reasoning: `Node/edge limits for ${goalCount} interconnected goals`,
            },
        };
    }

    /**
     * Analyze CoT patterns for sequential tool execution
     */
    private analyzeCotPatterns(
        goals: string[],
        _context: Record<string, unknown>,
    ): { tools: string[]; parallelizable: boolean; complexity: number } {
        // Extract potential tools from goals
        const tools = goals.flatMap(
            (goal) =>
                goal.match(
                    /\b(search|analyze|process|generate|validate|execute|fetch|calculate)\w*\b/gi,
                ) || [],
        );

        // Check if tools can be parallelized
        const parallelizable = !goals.some(
            (goal) =>
                goal.includes('then') ||
                goal.includes('after') ||
                goal.includes('depends'),
        );

        const complexity = this.estimateComplexity(goals.join(' '));

        return {
            tools: Array.from(new Set(tools)),
            parallelizable,
            complexity,
        };
    }

    /**
     * Analyze ToT patterns for branching scenarios
     */
    private analyzeToTPatterns(
        goals: string[],
        _context: Record<string, unknown>,
    ): { branches: number; depth: number; parallelizable: boolean } {
        // Count potential branches based on goal structure
        const branches = goals.reduce((count, goal) => {
            const branchKeywords =
                goal.match(/\b(or|alternative|option|choice|either)\b/gi) || [];
            return count + Math.max(1, branchKeywords.length);
        }, 0);

        // Estimate depth based on goal complexity
        const depth = Math.ceil(this.estimateComplexity(goals.join(' ')) * 10);

        // Check if branches can be evaluated in parallel
        const parallelizable = !goals.some(
            (goal) => goal.includes('sequential') || goal.includes('ordered'),
        );

        return {
            branches: Math.max(2, branches),
            depth: Math.max(3, depth),
            parallelizable,
        };
    }

    /**
     * Analyze Graph patterns for interconnected tasks
     */
    private analyzeGraphPatterns(
        goals: string[],
        _context: Record<string, unknown>,
    ): { nodes: string[]; edges: number; cyclic: boolean } {
        // Extract nodes (entities/concepts) from goals
        const nodes = goals.flatMap(
            (goal) => goal.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [],
        );

        // Estimate edges based on relationship keywords
        const edges = goals.reduce((count, goal) => {
            const relationships =
                goal.match(
                    /\b(with|between|from|to|depends|connects|links)\b/gi,
                ) || [];
            return count + relationships.length;
        }, 0);

        // Check for cyclic dependencies
        const cyclic = goals.some(
            (goal) =>
                goal.includes('cycle') ||
                goal.includes('feedback') ||
                goal.includes('recursive'),
        );

        return {
            nodes: Array.from(new Set(nodes)),
            edges: Math.max(1, edges),
            cyclic,
        };
    }
}

/**
 * 🔥 API Target V2: Create planner with multiple strategies
 */
export function createPlanner(config: PlannerConfig): MultiStrategyPlanner {
    return new MultiStrategyPlanner(config);
}
