/**
 * @module engine/planning/learning-strategy-selector
 * @description Learning-based Strategy Selector for Planner
 *
 * OBJETIVO:
 * Selecionar automaticamente a melhor estratégia de planejamento
 * baseado em histórico de performance e características do contexto.
 */

import { createLogger } from '../../observability/index.js';
import type { PlanningStrategy } from './planner.js';
import type { AgentContext } from '../../core/types/agent-types.js';
import type {
    FeedbackOptimizer,
    PerformanceInsights,
} from './feedback-optimizer.js';

const logger = createLogger('learning-strategy-selector');

/**
 * Context features for strategy selection
 */
export interface ContextFeatures {
    /** Goal text length */
    goalLength: number;
    /** Number of mentioned tools/actions */
    mentionedTools: number;
    /** Complexity keywords found */
    complexityKeywords: string[];
    /** Has sequential indicators */
    hasSequentialIndicators: boolean;
    /** Has parallel indicators */
    hasParallelIndicators: boolean;
    /** Has conditional logic */
    hasConditionalLogic: boolean;
    /** Estimated number of steps */
    estimatedSteps: number;
    /** Domain type */
    domainType:
        | 'technical'
        | 'business'
        | 'creative'
        | 'analytical'
        | 'unknown';
}

/**
 * Strategy selection result
 */
export interface StrategySelectionResult {
    /** Selected strategy */
    strategy: PlanningStrategy;
    /** Confidence in selection (0-1) */
    confidence: number;
    /** Reasoning for selection */
    reasoning: string;
    /** Alternative strategies ranked */
    alternatives: Array<{
        strategy: PlanningStrategy;
        score: number;
        reason: string;
    }>;
}

/**
 * Learning configuration
 */
export interface LearningConfig {
    /** Enable learning from feedback */
    enableLearning: boolean;
    /** Minimum confidence to use learned strategy */
    minConfidenceThreshold: number;
    /** Weight for historical performance */
    historyWeight: number;
    /** Weight for context features */
    featureWeight: number;
    /** Enable experimental strategies */
    enableExperimental: boolean;
    /** Exploration rate (0-1) for trying new strategies */
    explorationRate: number;
}

/**
 * Learning-based Strategy Selector
 */
export class LearningStrategySelector {
    private config: LearningConfig;
    private feedbackOptimizer: FeedbackOptimizer | null = null;
    private strategyHistory: Array<{
        context: ContextFeatures;
        strategy: PlanningStrategy;
        success: boolean;
        performance: number;
    }> = [];

    constructor(config: Partial<LearningConfig> = {}) {
        this.config = {
            enableLearning: true,
            minConfidenceThreshold: 0.7,
            historyWeight: 0.6,
            featureWeight: 0.4,
            enableExperimental: false,
            explorationRate: 0.1,
            ...config,
        };

        logger.info('LearningStrategySelector initialized', {
            config: this.config,
        });
    }

    /**
     * Set feedback optimizer for integration
     */
    setFeedbackOptimizer(optimizer: FeedbackOptimizer): void {
        this.feedbackOptimizer = optimizer;
        logger.debug(
            'FeedbackOptimizer integrated with LearningStrategySelector',
        );
    }

    /**
     * Select strategy based on goal and context
     */
    selectStrategy(
        goal: string,
        context: AgentContext,
    ): StrategySelectionResult {
        const features = this.extractContextFeatures(goal, context);

        logger.debug('Selecting strategy', {
            goal: goal.slice(0, 50),
            features,
        });

        // Check if we should explore (try random strategy)
        if (this.shouldExplore()) {
            return this.exploratorySelection(features);
        }

        // Use learning if enabled and we have enough data
        if (this.config.enableLearning && this.feedbackOptimizer) {
            const insights = this.feedbackOptimizer.getInsights();
            if (insights) {
                return this.learnedSelection(features, insights);
            }
        }

        // Fallback to heuristic selection
        return this.heuristicSelection(features);
    }

    /**
     * Record strategy performance
     */
    recordStrategyPerformance(
        context: ContextFeatures,
        strategy: PlanningStrategy,
        success: boolean,
        executionTime: number,
    ): void {
        if (!this.config.enableLearning) return;

        // Calculate performance score (0-1)
        const performance = this.calculatePerformanceScore(
            success,
            executionTime,
        );

        this.strategyHistory.push({
            context,
            strategy,
            success,
            performance,
        });

        // Maintain history size
        if (this.strategyHistory.length > 1000) {
            this.strategyHistory.shift();
        }

        logger.debug('Strategy performance recorded', {
            strategy,
            success,
            performance,
        });
    }

    /**
     * Extract context features from goal and context
     */
    extractContextFeatures(
        goal: string,
        _context: AgentContext,
    ): ContextFeatures {
        const goalLower = goal.toLowerCase();

        // Detect complexity keywords
        const complexityKeywords: string[] = [];
        const complexPatterns = [
            'complex',
            'multiple',
            'several',
            'many',
            'various',
            'integrate',
            'coordinate',
            'orchestrate',
            'optimize',
            'analyze',
            'evaluate',
            'assess',
            'review',
        ];

        complexPatterns.forEach((pattern) => {
            if (goalLower.includes(pattern)) {
                complexityKeywords.push(pattern);
            }
        });

        // Detect sequential indicators
        const sequentialPatterns = [
            'then',
            'after',
            'before',
            'first',
            'next',
            'finally',
            'step by step',
            'in order',
            'sequentially',
        ];
        const hasSequentialIndicators = sequentialPatterns.some((p) =>
            goalLower.includes(p),
        );

        // Detect parallel indicators
        const parallelPatterns = [
            'simultaneously',
            'parallel',
            'at the same time',
            'concurrently',
            'while',
            'during',
        ];
        const hasParallelIndicators = parallelPatterns.some((p) =>
            goalLower.includes(p),
        );

        // Detect conditional logic
        const conditionalPatterns = [
            'if',
            'when',
            'unless',
            'otherwise',
            'depending on',
            'based on',
            'in case',
            'should',
            'would',
        ];
        const hasConditionalLogic = conditionalPatterns.some((p) =>
            goalLower.includes(p),
        );

        // Count mentioned tools/actions
        const actionWords =
            goalLower.match(
                /\b(create|update|delete|fetch|process|build|deploy|test|run|execute|check|verify|send|receive)\b/g,
            ) || [];
        const mentionedTools = actionWords.length;

        // Estimate steps
        const sentences = goal
            .split(/[.!?]+/)
            .filter((s) => s.trim().length > 0);
        const estimatedSteps = Math.max(sentences.length, mentionedTools);

        // Determine domain type
        const domainType = this.detectDomainType(goalLower);

        return {
            goalLength: goal.length,
            mentionedTools,
            complexityKeywords,
            hasSequentialIndicators,
            hasParallelIndicators,
            hasConditionalLogic,
            estimatedSteps,
            domainType,
        };
    }

    /**
     * Should explore (try random strategy)
     */
    private shouldExplore(): boolean {
        return (
            this.config.enableExperimental &&
            Math.random() < this.config.explorationRate
        );
    }

    /**
     * Exploratory selection (for learning)
     */
    private exploratorySelection(
        _features: ContextFeatures,
    ): StrategySelectionResult {
        const strategies: PlanningStrategy[] = ['cot', 'tot', 'graph'];
        const randomStrategy =
            strategies[Math.floor(Math.random() * strategies.length)]!;

        logger.debug('Exploratory strategy selection', {
            strategy: randomStrategy,
        });

        return {
            strategy: randomStrategy,
            confidence: 0.5,
            reasoning: 'Exploratory selection for learning purposes',
            alternatives: strategies
                .filter((s) => s !== randomStrategy)
                .map((s) => ({
                    strategy: s,
                    score: 0.25,
                    reason: 'Alternative option',
                })),
        };
    }

    /**
     * Learned selection based on insights
     */
    private learnedSelection(
        features: ContextFeatures,
        insights: PerformanceInsights,
    ): StrategySelectionResult {
        const strategyScores = {
            cot: 0,
            tot: 0,
            graph: 0,
            react: 0,
            ooda: 0,
            multi: 0,
        } as Record<PlanningStrategy, number>;
        strategyScores['llm_hybrid'] = 0;

        // Score based on historical performance
        Object.entries(insights.strategyPerformance).forEach(
            ([strategy, perf]) => {
                strategyScores[strategy as PlanningStrategy] =
                    perf.averageSuccessRate * this.config.historyWeight;
            },
        );

        // Score based on context features
        this.scoreByFeatures(features, strategyScores);

        // Find similar contexts in history
        const similarContexts = this.findSimilarContexts(features);
        similarContexts.forEach(({ context, strategy, performance }) => {
            const similarity = this.calculateContextSimilarity(
                features,
                context,
            );
            strategyScores[strategy] += similarity * performance * 0.2;
        });

        // Normalize scores
        const maxScore = Math.max(...Object.values(strategyScores));
        Object.keys(strategyScores).forEach((strategy) => {
            strategyScores[strategy as PlanningStrategy] /= maxScore || 1;
        });

        // Select best strategy
        const sortedStrategies = Object.entries(strategyScores).sort(
            ([, a], [, b]) => b - a,
        );

        if (sortedStrategies.length === 0) {
            return this.heuristicSelection(features);
        }
        const [bestStrategy, bestScore] = sortedStrategies[0]!;
        const confidence = Math.min(bestScore, 0.95);

        // Use learned strategy only if confidence is high enough
        if (confidence < this.config.minConfidenceThreshold) {
            return this.heuristicSelection(features);
        }

        logger.info('Learned strategy selection', {
            strategy: bestStrategy,
            confidence,
            scores: strategyScores,
        });

        return {
            strategy: bestStrategy as PlanningStrategy,
            confidence,
            reasoning: this.generateLearnedReasoning(
                bestStrategy as PlanningStrategy,
                features,
                insights,
            ),
            alternatives: sortedStrategies
                .slice(1, 4)
                .map(([strategy, score]) => ({
                    strategy: strategy as PlanningStrategy,
                    score,
                    reason: this.getStrategyReason(
                        strategy as PlanningStrategy,
                        features,
                    ),
                })),
        };
    }

    /**
     * Heuristic selection (fallback)
     */
    private heuristicSelection(
        features: ContextFeatures,
    ): StrategySelectionResult {
        let strategy: PlanningStrategy = 'cot';
        let reasoning = '';

        // Simple heuristics
        if (features.estimatedSteps <= 3 && !features.hasConditionalLogic) {
            strategy = 'cot';
            reasoning =
                'Simple task with few steps - Chain of Thought is efficient';
        } else if (
            features.hasConditionalLogic ||
            features.complexityKeywords.length > 2
        ) {
            strategy = 'tot';
            reasoning =
                'Complex task with conditional logic - Tree of Thought for exploration';
        } else if (
            features.hasParallelIndicators ||
            features.mentionedTools > 5
        ) {
            strategy = 'graph';
            reasoning =
                'Task has parallel components - Graph planning for optimization';
        } else if (
            features.estimatedSteps > 10 ||
            features.domainType === 'technical'
        ) {
            strategy = 'graph';
            reasoning =
                'Large or technical task - Graph planning for complexity';
        }

        logger.debug('Heuristic strategy selection', { strategy, reasoning });

        return {
            strategy,
            confidence: 0.75,
            reasoning,
            alternatives: this.getAlternativeStrategies(strategy, features),
        };
    }

    /**
     * Score strategies by features
     */
    private scoreByFeatures(
        features: ContextFeatures,
        scores: Record<PlanningStrategy, number>,
    ): void {
        const weight = this.config.featureWeight;

        // CoT scores
        if (features.estimatedSteps <= 5) {
            scores.cot += 0.8 * weight;
        }
        if (features.hasSequentialIndicators) {
            scores.cot += 0.5 * weight;
        }

        // ToT scores
        if (features.hasConditionalLogic) {
            scores.tot += 0.9 * weight;
        }
        if (features.complexityKeywords.length > 1) {
            scores.tot += 0.6 * weight;
        }

        // Graph scores
        if (features.hasParallelIndicators) {
            scores.graph += 0.9 * weight;
        }
        if (features.mentionedTools > 4) {
            scores.graph += 0.7 * weight;
        }

        // Extra graph scores for complex tasks
        if (features.estimatedSteps > 8) {
            scores.graph += 0.4 * weight;
        }
        if (features.domainType === 'technical') {
            scores.graph += 0.3 * weight;
        }
    }

    /**
     * Find similar contexts in history
     */
    private findSimilarContexts(
        features: ContextFeatures,
        limit: number = 10,
    ): typeof this.strategyHistory {
        return this.strategyHistory
            .map((entry) => ({
                ...entry,
                similarity: this.calculateContextSimilarity(
                    features,
                    entry.context,
                ),
            }))
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);
    }

    /**
     * Calculate context similarity
     */
    private calculateContextSimilarity(
        features1: ContextFeatures,
        features2: ContextFeatures,
    ): number {
        let similarity = 0;
        let weights = 0;

        // Goal length similarity
        const lengthDiff = Math.abs(
            features1.goalLength - features2.goalLength,
        );
        similarity += (1 - lengthDiff / 1000) * 0.1;
        weights += 0.1;

        // Tools similarity
        const toolsDiff = Math.abs(
            features1.mentionedTools - features2.mentionedTools,
        );
        similarity += (1 - toolsDiff / 10) * 0.2;
        weights += 0.2;

        // Boolean features
        if (
            features1.hasSequentialIndicators ===
            features2.hasSequentialIndicators
        ) {
            similarity += 0.15;
        }
        if (
            features1.hasParallelIndicators === features2.hasParallelIndicators
        ) {
            similarity += 0.15;
        }
        if (features1.hasConditionalLogic === features2.hasConditionalLogic) {
            similarity += 0.15;
        }
        weights += 0.45;

        // Domain type
        if (features1.domainType === features2.domainType) {
            similarity += 0.25;
        }
        weights += 0.25;

        return similarity / weights;
    }

    /**
     * Calculate performance score
     */
    private calculatePerformanceScore(
        success: boolean,
        executionTime: number,
    ): number {
        if (!success) return 0;

        // Score based on execution time (faster is better)
        // Assume < 1s is perfect, > 30s is poor
        const timeScore = Math.max(0, 1 - executionTime / 30000);

        return 0.5 + 0.5 * timeScore;
    }

    /**
     * Detect domain type
     */
    private detectDomainType(goalLower: string): ContextFeatures['domainType'] {
        const patterns = {
            technical: [
                'deploy',
                'build',
                'compile',
                'debug',
                'api',
                'database',
                'server',
            ],
            business: [
                'report',
                'analyze',
                'metrics',
                'revenue',
                'customer',
                'sales',
            ],
            creative: [
                'design',
                'create',
                'generate',
                'write',
                'compose',
                'draw',
            ],
            analytical: [
                'calculate',
                'compute',
                'measure',
                'evaluate',
                'assess',
                'compare',
            ],
        };

        for (const [domain, keywords] of Object.entries(patterns)) {
            if (keywords.some((k) => goalLower.includes(k))) {
                return domain as ContextFeatures['domainType'];
            }
        }

        return 'unknown';
    }

    /**
     * Generate learned reasoning
     */
    private generateLearnedReasoning(
        strategy: PlanningStrategy,
        features: ContextFeatures,
        insights: PerformanceInsights,
    ): string {
        const perf = insights.strategyPerformance[strategy];
        const successRate = perf
            ? Math.round(perf.averageSuccessRate * 100)
            : 75;

        let reasoning = `Selected ${strategy} based on historical performance (${successRate}% success rate)`;

        if (features.hasParallelIndicators && strategy === 'graph') {
            reasoning += ' and parallel execution requirements';
        } else if (features.hasConditionalLogic && strategy === 'tot') {
            reasoning += ' and conditional logic in the goal';
        } else if (features.estimatedSteps > 10 && strategy === 'graph') {
            reasoning += ' and high task complexity';
        }

        return reasoning;
    }

    /**
     * Get strategy reason
     */
    private getStrategyReason(
        strategy: PlanningStrategy,
        _features: ContextFeatures,
    ): string {
        const reasons = {
            cot: 'Efficient for sequential tasks',
            tot: 'Good for exploring alternatives',
            graph: 'Optimal for parallel execution',
            react: 'Good for reasoning and acting',
            ooda: 'Military-inspired decision making',
            multi: 'Multi-agent coordination',
        } as Record<PlanningStrategy, string>;
        reasons['llm_hybrid'] = 'Hybrid LLM approach';

        return reasons[strategy] || 'Alternative strategy';
    }

    /**
     * Get alternative strategies
     */
    private getAlternativeStrategies(
        selected: PlanningStrategy,
        features: ContextFeatures,
    ): Array<{ strategy: PlanningStrategy; score: number; reason: string }> {
        const alternatives: PlanningStrategy[] = ['cot', 'tot', 'graph'].filter(
            (s) => s !== selected,
        ) as PlanningStrategy[];

        return alternatives.map((strategy) => ({
            strategy,
            score: 0.5,
            reason: this.getStrategyReason(strategy, features),
        }));
    }
}
