/**
 * @module engine/planning/feedback-optimizer
 * @description Performance Feedback Optimizer for Planner
 *
 * OBJETIVO:
 * Coletar métricas de execução e usar para otimizar futuras decisões
 * de planejamento, criando um loop de feedback performance → planning.
 */

import { createLogger } from '../../observability/index.js';
import type { Plan, PlanStep, PlanningStrategy } from './planner.js';

const logger = createLogger('feedback-optimizer');

/**
 * Tool execution metrics
 */
export interface ToolExecutionMetrics {
    toolName: string;
    averageExecutionTime: number;
    successRate: number;
    failureRate: number;
    retryRate: number;
    totalExecutions: number;
    lastExecutions: Array<{
        timestamp: number;
        duration: number;
        success: boolean;
        retries?: number;
    }>;
}

/**
 * Plan execution metrics
 */
export interface PlanExecutionMetrics {
    planId: string;
    strategy: PlanningStrategy;
    totalDuration: number;
    stepMetrics: Array<{
        stepId: string;
        toolName: string;
        duration: number;
        success: boolean;
        parallel: boolean;
    }>;
    overallSuccess: boolean;
    parallelizationEfficiency: number; // 0-1
    dependencyOverhead: number; // ms waited for deps
}

/**
 * Performance insights
 */
export interface PerformanceInsights {
    /** Tools that consistently perform well */
    reliableTools: string[];
    /** Tools that often fail or timeout */
    problematicTools: string[];
    /** Optimal concurrency level based on history */
    optimalConcurrency: number;
    /** Average overhead for dependency resolution */
    averageDependencyOverhead: number;
    /** Strategies that work best for different contexts */
    strategyPerformance: Record<
        PlanningStrategy,
        {
            averageSuccessRate: number;
            averageDuration: number;
            contextSuitability: string[];
        }
    >;
    /** Complexity threshold adjustments */
    complexityAdjustments: {
        current: number;
        recommended: number;
        reason: string;
    };
}

/**
 * Feedback configuration
 */
export interface FeedbackConfig {
    /** Enable learning from execution metrics */
    enableLearning: boolean;
    /** Minimum executions before insights are generated */
    minExecutionsForInsights: number;
    /** Weight for recent executions (0-1) */
    recencyWeight: number;
    /** Max history size per tool */
    maxHistorySize: number;
    /** Threshold for marking tool as problematic */
    failureThreshold: number;
    /** Threshold for marking tool as reliable */
    reliabilityThreshold: number;
}

/**
 * Performance Feedback Optimizer
 */
export class FeedbackOptimizer {
    private toolMetrics = new Map<string, ToolExecutionMetrics>();
    private planMetrics: PlanExecutionMetrics[] = [];
    private insights: PerformanceInsights | null = null;
    private config: FeedbackConfig;

    constructor(config: Partial<FeedbackConfig> = {}) {
        this.config = {
            enableLearning: true,
            minExecutionsForInsights: 10,
            recencyWeight: 0.7,
            maxHistorySize: 100,
            failureThreshold: 0.3,
            reliabilityThreshold: 0.95,
            ...config,
        };

        logger.info('FeedbackOptimizer initialized', { config: this.config });
    }

    /**
     * Record tool execution
     */
    recordToolExecution(
        toolName: string,
        duration: number,
        success: boolean,
        retries: number = 0,
    ): void {
        if (!this.config.enableLearning) return;

        const metrics = this.toolMetrics.get(toolName) || {
            toolName,
            averageExecutionTime: 0,
            successRate: 0,
            failureRate: 0,
            retryRate: 0,
            totalExecutions: 0,
            lastExecutions: [],
        };

        // Add new execution
        const execution = {
            timestamp: Date.now(),
            duration,
            success,
            retries,
        };

        metrics.lastExecutions.push(execution);

        // Maintain history size
        if (metrics.lastExecutions.length > this.config.maxHistorySize) {
            metrics.lastExecutions.shift();
        }

        // Update metrics
        metrics.totalExecutions++;
        this.updateToolMetrics(metrics);

        this.toolMetrics.set(toolName, metrics);

        logger.debug('Tool execution recorded', {
            toolName,
            duration,
            success,
            retries,
        });

        // Update insights if enough data
        if (this.shouldUpdateInsights()) {
            this.updateInsights();
        }
    }

    /**
     * Record plan execution
     */
    recordPlanExecution(planMetrics: PlanExecutionMetrics): void {
        if (!this.config.enableLearning) return;

        this.planMetrics.push(planMetrics);

        // Maintain history size
        if (this.planMetrics.length > this.config.maxHistorySize) {
            this.planMetrics.shift();
        }

        logger.info('Plan execution recorded', {
            planId: planMetrics.planId,
            strategy: planMetrics.strategy,
            duration: planMetrics.totalDuration,
            success: planMetrics.overallSuccess,
        });

        // Update insights
        if (this.shouldUpdateInsights()) {
            this.updateInsights();
        }
    }

    /**
     * Get performance insights
     */
    getInsights(): PerformanceInsights | null {
        if (!this.insights && this.shouldUpdateInsights()) {
            this.updateInsights();
        }
        return this.insights;
    }

    /**
     * Get tool performance metrics
     */
    getToolMetrics(toolName: string): ToolExecutionMetrics | undefined {
        return this.toolMetrics.get(toolName);
    }

    /**
     * Get optimization suggestions for a plan
     */
    getOptimizationSuggestions(plan: Plan): {
        optimizedSteps: PlanStep[];
        suggestions: string[];
        estimatedImprovement: number;
    } {
        const suggestions: string[] = [];
        const optimizedSteps = [...plan.steps];
        let totalImprovement = 0;

        const insights = this.getInsights();
        if (!insights) {
            return { optimizedSteps, suggestions, estimatedImprovement: 0 };
        }

        // Suggest replacing problematic tools
        plan.steps.forEach((step, index) => {
            if (step.tool && insights.problematicTools.includes(step.tool)) {
                suggestions.push(
                    `Consider replacing tool '${step.tool}' - failure rate above ${this.config.failureThreshold * 100}%`,
                );
                // Mark step as high risk
                optimizedSteps[index] = {
                    ...step,
                    critical: true,
                    retry: (step.retry || 0) + 2,
                };
            }
        });

        // Suggest parallelization based on tool reliability
        const parallelizableSteps = plan.steps.filter(
            (step) =>
                !step.dependencies?.length &&
                step.tool &&
                insights.reliableTools.includes(step.tool),
        );

        if (parallelizableSteps.length > 1) {
            suggestions.push(
                `${parallelizableSteps.length} steps can run in parallel with high reliability`,
            );
            totalImprovement += parallelizableSteps.length * 100; // ms saved
        }

        // Suggest optimal concurrency
        if (insights.optimalConcurrency !== plan.context?.maxConcurrency) {
            suggestions.push(
                `Adjust max concurrency to ${insights.optimalConcurrency} based on performance history`,
            );
        }

        // Suggest strategy based on performance
        const currentStrategy = plan.strategy;
        const bestStrategy = Object.entries(insights.strategyPerformance)
            .sort(([, a], [, b]) => b.averageSuccessRate - a.averageSuccessRate)
            .find(([strategy]) => strategy !== currentStrategy)?.[0];

        if (bestStrategy) {
            suggestions.push(
                `Consider using '${bestStrategy}' strategy - ${Math.round(
                    insights.strategyPerformance[
                        bestStrategy as PlanningStrategy
                    ]?.averageSuccessRate * 100 || 75,
                )}% success rate`,
            );
        }

        return {
            optimizedSteps,
            suggestions,
            estimatedImprovement: totalImprovement,
        };
    }

    /**
     * Get adjusted complexity threshold
     */
    getAdjustedComplexityThreshold(currentThreshold: number): number {
        const insights = this.getInsights();
        if (!insights) return currentThreshold;

        return insights.complexityAdjustments.recommended;
    }

    /**
     * Update tool metrics
     */
    private updateToolMetrics(metrics: ToolExecutionMetrics): void {
        const allExecutions = metrics.lastExecutions;

        // Calculate weighted averages (recent executions have more weight)
        const weightedDuration = this.calculateWeightedAverage(
            allExecutions.map((e) => e.duration),
            this.config.recencyWeight,
        );

        const successCount = allExecutions.filter((e) => e.success).length;
        const retryCount = allExecutions.filter(
            (e) => (e.retries || 0) > 0,
        ).length;

        metrics.averageExecutionTime = Math.round(weightedDuration);
        metrics.successRate = successCount / allExecutions.length;
        metrics.failureRate = 1 - metrics.successRate;
        metrics.retryRate = retryCount / allExecutions.length;
    }

    /**
     * Calculate weighted average
     */
    private calculateWeightedAverage(
        values: number[],
        recencyWeight: number,
    ): number {
        if (values.length === 0) return 0;

        let weightedSum = 0;
        let totalWeight = 0;

        values.forEach((value, index) => {
            const weight = Math.pow(recencyWeight, values.length - index - 1);
            weightedSum += value * weight;
            totalWeight += weight;
        });

        return weightedSum / totalWeight;
    }

    /**
     * Should update insights
     */
    private shouldUpdateInsights(): boolean {
        const totalToolExecutions = Array.from(
            this.toolMetrics.values(),
        ).reduce((sum, m) => sum + m.totalExecutions, 0);

        return totalToolExecutions >= this.config.minExecutionsForInsights;
    }

    /**
     * Update performance insights
     */
    private updateInsights(): void {
        logger.debug('Updating performance insights');

        const reliableTools: string[] = [];
        const problematicTools: string[] = [];

        // Analyze tool performance
        this.toolMetrics.forEach((metrics, toolName) => {
            if (metrics.successRate >= this.config.reliabilityThreshold) {
                reliableTools.push(toolName);
            } else if (metrics.failureRate >= this.config.failureThreshold) {
                problematicTools.push(toolName);
            }
        });

        // Analyze plan performance by strategy
        const strategyPerformance: Record<
            string,
            {
                averageSuccessRate: number;
                averageDuration: number;
                contextSuitability: string[];
            }
        > = {};
        const strategyGroups = this.groupBy(this.planMetrics, 'strategy');

        Object.entries(strategyGroups).forEach(([strategy, plans]) => {
            const successCount = plans.filter((p) => p.overallSuccess).length;
            const totalDuration = plans.reduce(
                (sum, p) => sum + p.totalDuration,
                0,
            );

            strategyPerformance[strategy] = {
                averageSuccessRate: successCount / plans.length,
                averageDuration: totalDuration / plans.length,
                contextSuitability: this.analyzeContextSuitability(
                    strategy as PlanningStrategy,
                    plans,
                ),
            };
        });

        // Calculate optimal concurrency
        const concurrencyAnalysis = this.analyzeOptimalConcurrency();

        // Calculate complexity adjustments
        const complexityAdjustments = this.analyzeComplexityThreshold();

        this.insights = {
            reliableTools,
            problematicTools,
            optimalConcurrency: concurrencyAnalysis.optimal,
            averageDependencyOverhead:
                this.calculateAverageDependencyOverhead(),
            strategyPerformance: strategyPerformance as Record<
                PlanningStrategy,
                {
                    averageSuccessRate: number;
                    averageDuration: number;
                    contextSuitability: string[];
                }
            >,
            complexityAdjustments,
        };

        logger.info('Performance insights updated', {
            reliableToolsCount: reliableTools.length,
            problematicToolsCount: problematicTools.length,
            optimalConcurrency: concurrencyAnalysis.optimal,
        });
    }

    /**
     * Group by helper
     */
    private groupBy<T, K extends keyof T>(
        array: T[],
        key: K,
    ): Record<string, T[]> {
        return array.reduce(
            (result, item) => {
                const group = String(item[key]);
                if (!result[group]) result[group] = [];
                result[group].push(item);
                return result;
            },
            {} as Record<string, T[]>,
        );
    }

    /**
     * Analyze context suitability
     */
    private analyzeContextSuitability(
        strategy: PlanningStrategy,
        plans: PlanExecutionMetrics[],
    ): string[] {
        // Simple heuristic based on plan characteristics
        const avgSteps =
            plans.reduce((sum, p) => sum + p.stepMetrics.length, 0) /
            plans.length;
        const avgParallelism =
            plans.reduce((sum, p) => sum + p.parallelizationEfficiency, 0) /
            plans.length;

        const suitability: string[] = [];

        if (strategy === 'cot' && avgSteps <= 5) {
            suitability.push('simple-tasks');
        } else if (strategy === 'tot' && avgSteps > 5 && avgSteps <= 15) {
            suitability.push('medium-complexity');
        } else if (strategy === 'graph' && avgParallelism > 0.5) {
            suitability.push('parallel-workflows');
        }

        return suitability;
    }

    /**
     * Analyze optimal concurrency
     */
    private analyzeOptimalConcurrency(): { optimal: number; reason: string } {
        // Analyze parallel execution performance
        const parallelMetrics = this.planMetrics
            .flatMap((p) => p.stepMetrics)
            .filter((s) => s.parallel);

        if (parallelMetrics.length < 10) {
            return { optimal: 3, reason: 'insufficient-data' };
        }

        // Group by approximate concurrency levels and analyze success rates

        // Simplified analysis - real implementation would be more sophisticated
        const avgDuration =
            parallelMetrics.reduce((sum, m) => sum + m.duration, 0) /
            parallelMetrics.length;

        if (avgDuration < 1000) {
            return { optimal: 5, reason: 'fast-tools' };
        } else if (avgDuration < 3000) {
            return { optimal: 3, reason: 'medium-speed-tools' };
        } else {
            return { optimal: 2, reason: 'slow-tools' };
        }
    }

    /**
     * Calculate average dependency overhead
     */
    private calculateAverageDependencyOverhead(): number {
        const overheads = this.planMetrics
            .filter((p) => p.dependencyOverhead > 0)
            .map((p) => p.dependencyOverhead);

        if (overheads.length === 0) return 0;

        return Math.round(
            overheads.reduce((sum, o) => sum + o, 0) / overheads.length,
        );
    }

    /**
     * Analyze complexity threshold
     */
    private analyzeComplexityThreshold(): {
        current: number;
        recommended: number;
        reason: string;
    } {
        // Analyze success rates by complexity
        const complexPlans = this.planMetrics.filter(
            (p) => p.stepMetrics.length > 10,
        );
        const simplePlans = this.planMetrics.filter(
            (p) => p.stepMetrics.length <= 5,
        );

        const complexSuccessRate =
            complexPlans.filter((p) => p.overallSuccess).length /
            (complexPlans.length || 1);
        const simpleSuccessRate =
            simplePlans.filter((p) => p.overallSuccess).length /
            (simplePlans.length || 1);

        // Simplified logic - real implementation would be more sophisticated
        let recommended = 10; // default
        let reason = 'balanced';

        if (complexSuccessRate < 0.7 && simpleSuccessRate > 0.9) {
            recommended = 8;
            reason = 'complex-plans-struggling';
        } else if (complexSuccessRate > 0.9) {
            recommended = 15;
            reason = 'complex-plans-succeeding';
        }

        return {
            current: 10,
            recommended,
            reason,
        };
    }

    /**
     * Clear all metrics
     */
    clearMetrics(): void {
        this.toolMetrics.clear();
        this.planMetrics = [];
        this.insights = null;
        logger.info('All metrics cleared');
    }
}
