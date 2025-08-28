/**
 * 🌉 CONTEXT BRIDGE SERVICE INTERFACE
 *
 * Service interface for the context bridge that solves createFinalResponse
 * This bridges the gap between simple planner context and rich runtime context
 */

import type {
    ContextBridge,
    AgentRuntimeContext,
    ContextValidationResult,
} from '../types/context-types.js';

import type {
    FinalResponseContext,
    EnrichedPlannerContext,
    ExecutionSummary,
    DetailedExecutionSummary,
    PlanExecution,
    StepExecutionRegistry,
    ReplanContext,
    FailureAnalysis,
} from '../types/execution-types.js';

import type { HierarchicalMemoryContext } from '../types/memory-types.js';

import type { ActivePlanState, PlanMetrics } from '../types/state-types.js';

import { PlannerExecutionContext } from '../../types/allTypes.js';

// ===============================================
// 🎯 CONTEXT BRIDGE SERVICE INTERFACE
// ===============================================

/**
 * Service interface for context bridge operations
 * This is the main service that solves the createFinalResponse problem
 */
export interface ContextBridgeService extends ContextBridge {
    // Core bridge operations
    buildFinalResponseContext(
        plannerContext: PlannerExecutionContext,
    ): Promise<FinalResponseContext>;

    enrichPlannerContext(
        context: PlannerExecutionContext,
    ): Promise<EnrichedPlannerContext>;

    // Context aggregation
    aggregateExecutionContext(
        plannerContext: PlannerExecutionContext,
    ): Promise<ExecutionContextAggregate>;

    buildExecutionSummary(
        plannerContext: PlannerExecutionContext,
    ): Promise<DetailedExecutionSummary>;

    // Memory context operations
    buildMemoryContext(
        plannerContext: PlannerExecutionContext,
    ): Promise<RelevantMemoryContext>;

    // State context operations
    buildStateContext(
        plannerContext: PlannerExecutionContext,
    ): Promise<StateContextSummary>;

    // Validation and health
    validateContext(
        context: AgentRuntimeContext,
    ): Promise<ContextValidationResult>;
    syncContextLayers(context: AgentRuntimeContext): Promise<void>;
}

// ===============================================
// 🔄 CONTEXT AGGREGATION INTERFACES
// ===============================================

/**
 * Aggregated execution context for final response generation
 */
export interface ExecutionContextAggregate {
    // Current execution state
    currentExecution: PlanExecution | null;

    // Historical context
    executionHistory: PlanExecution[];
    recentExecutions: PlanExecution[];

    // Step-level details
    stepRegistry: StepExecutionRegistry;
    currentStepStatus: StepExecutionStatus;

    // Plan context
    activePlan: ActivePlanState | null;
    planHistory: PlanHistoryEntry[];

    // Replan context
    replanContext: ReplanContext | null;
    replanHistory: ReplanHistoryEntry[];

    // Success/failure analysis
    successPatterns: SuccessPattern[];
    failureAnalysis: FailureAnalysis | null;

    // Performance metrics
    executionMetrics: ExecutionMetrics;
    planMetrics: PlanMetrics;
}

/**
 * Current step execution status
 */
export interface StepExecutionStatus {
    currentStep: ExecutionStepDetail | null;
    completedSteps: ExecutionStepDetail[];
    failedSteps: ExecutionStepDetail[];
    pendingSteps: ExecutionStepDetail[];

    // Progress information
    totalSteps: number;
    completedCount: number;
    failedCount: number;
    progressPercent: number;
}

/**
 * Detailed execution step information
 */
export interface ExecutionStepDetail {
    stepId: string;
    stepName: string;
    stepType: string;
    status: 'pending' | 'active' | 'completed' | 'failed' | 'skipped';

    // Timing information
    startTime?: number;
    endTime?: number;
    duration?: number;

    // Execution details
    action?: string;
    result?: unknown;
    error?: string;

    // Context
    input?: unknown;
    output?: unknown;
    metadata?: Record<string, unknown>;
}

/**
 * Plan history entry
 */
export interface PlanHistoryEntry {
    planId: string;
    planType: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    status: 'completed' | 'failed' | 'cancelled';

    // Plan details
    originalIntent: string;
    stepsExecuted: number;
    totalSteps: number;

    // Results
    success: boolean;
    result?: unknown;
    error?: string;

    // Metrics
    successRate: number;
    averageStepDuration: number;
}

/**
 * Replan history entry
 */
export interface ReplanHistoryEntry {
    replanId: string;
    timestamp: number;
    reason: string;
    triggerPhase: string;

    // Replan details
    originalPlanId: string;
    newPlanId: string;
    strategy: string;

    // Results
    success: boolean;
    improvementAchieved: boolean;

    // Context
    contextAtReplan: Record<string, unknown>;
    reasoningUsed: string;
}

/**
 * Success pattern information
 */
export interface SuccessPattern {
    patternId: string;
    description: string;
    frequency: number;

    // Pattern characteristics
    typicalSteps: string[];
    averageDuration: number;
    successRate: number;

    // Context conditions
    commonPreconditions: string[];
    keySuccessFactors: string[];

    // Applicability
    applicableScenarios: string[];
    recommendationScore: number;
}

/**
 * Execution metrics summary
 */
export interface ExecutionMetrics {
    // Overall metrics
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    successRate: number;

    // Timing metrics
    averageExecutionTime: number;
    totalExecutionTime: number;
    fastestExecution: number;
    slowestExecution: number;

    // Step metrics
    totalSteps: number;
    averageStepsPerExecution: number;
    stepSuccessRate: number;
    averageStepDuration: number;

    // Replan metrics
    replanCount: number;
    replanSuccessRate: number;
    averageReplanImprovement: number;
}

// ===============================================
// 🧠 MEMORY CONTEXT INTERFACES
// ===============================================

/**
 * Relevant memory context for response generation
 */
export interface RelevantMemoryContext {
    // Short-term memory
    recentInteractions: MemoryItem[];
    conversationContext: ConversationContext;

    // Long-term memory
    relevantHistoricalContext: MemoryItem[];
    learnedPatterns: LearnedPattern[];

    // Episodic memory
    similarPastExecutions: EpisodicMemoryItem[];
    relevantExperiences: ExperienceMemoryItem[];

    // Context selection metadata
    selectionCriteria: MemorySelectionCriteria;
    relevanceScores: Record<string, number>;
    contextCompression: ContextCompressionInfo;
}

/**
 * Memory item
 */
export interface MemoryItem {
    id: string;
    content: string;
    timestamp: number;
    type: 'interaction' | 'result' | 'insight' | 'pattern';

    // Relevance information
    relevanceScore: number;
    contextTags: string[];

    // Metadata
    source: string;
    importance: 'low' | 'medium' | 'high' | 'critical';
    verified: boolean;
}

/**
 * Conversation context
 */
export interface ConversationContext {
    currentTurn: number;
    conversationHistory: ConversationTurn[];
    mainTopics: string[];
    userIntent: string;
    conversationState: 'starting' | 'ongoing' | 'concluding' | 'clarifying';
}

/**
 * Conversation turn
 */
export interface ConversationTurn {
    turnId: number;
    timestamp: number;
    userMessage: string;
    agentResponse?: string;
    intent: string;
    topics: string[];
    sentiment: 'positive' | 'neutral' | 'negative';
}

/**
 * Learned pattern
 */
export interface LearnedPattern {
    patternId: string;
    description: string;
    category: 'behavioral' | 'preference' | 'context' | 'domain';

    // Pattern details
    evidence: PatternEvidence[];
    confidence: number;
    lastReinforced: number;

    // Applicability
    applicableContexts: string[];
    recommendedActions: string[];
}

/**
 * Pattern evidence
 */
export interface PatternEvidence {
    evidenceId: string;
    timestamp: number;
    description: string;
    strength: number;
    source: string;
}

/**
 * Episodic memory item
 */
export interface EpisodicMemoryItem {
    episodeId: string;
    timestamp: number;
    scenario: string;

    // Episode details
    context: Record<string, unknown>;
    actions: string[];
    outcomes: string[];

    // Similarity metrics
    similarityScore: number;
    applicabilityScore: number;

    // Learning value
    insights: string[];
    lessons: string[];
}

/**
 * Experience memory item
 */
export interface ExperienceMemoryItem {
    experienceId: string;
    timestamp: number;
    domain: string;

    // Experience details
    situation: string;
    approach: string;
    result: string;

    // Evaluation
    effectiveness: number;
    reusability: number;

    // Context
    preconditions: string[];
    successFactors: string[];
}

/**
 * Memory selection criteria
 */
export interface MemorySelectionCriteria {
    relevanceThreshold: number;
    maxItems: number;
    timeWindow?: {
        start: number;
        end: number;
    };

    // Selection preferences
    preferRecent: boolean;
    preferHighImportance: boolean;
    diversityFactor: number;

    // Filtering
    excludeTypes: string[];
    requiredTags: string[];
}

/**
 * Context compression information
 */
export interface ContextCompressionInfo {
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;

    // Compression strategy
    method: 'summarization' | 'selection' | 'hierarchical';
    preservedElements: string[];
    lossyCompression: boolean;

    // Quality metrics
    informationRetention: number;
    compressionQuality: number;
}

// ===============================================
// 🔄 STATE CONTEXT INTERFACES
// ===============================================

/**
 * State context summary for response generation
 */
export interface StateContextSummary {
    // Current state
    currentPhase: string;
    phaseStartTime: number;
    timeInCurrentPhase: number;

    // State history
    stateTransitions: StateTransitionSummary[];
    phaseDistribution: Record<string, number>;

    // State health
    stateHealth: StateHealthSummary;
    stateStability: StateStabilityMetrics;

    // Checkpoint information
    lastCheckpoint: CheckpointSummary | null;
    checkpointHistory: CheckpointSummary[];

    // State insights
    statePatterns: StatePattern[];
    stateRecommendations: StateRecommendation[];
}

/**
 * State transition summary
 */
export interface StateTransitionSummary {
    fromPhase: string;
    toPhase: string;
    timestamp: number;
    duration: number;

    // Transition details
    reason: string;
    triggered: boolean;
    successful: boolean;

    // Context
    metadata: Record<string, unknown>;
}

/**
 * State health summary
 */
export interface StateHealthSummary {
    overallHealth: 'healthy' | 'warning' | 'critical';

    // Component health
    executionHealth: ComponentHealthStatus;
    memoryHealth: ComponentHealthStatus;
    planningHealth: ComponentHealthStatus;

    // Health trends
    healthTrend: 'improving' | 'stable' | 'degrading';
    lastHealthCheck: number;
}

/**
 * Component health status
 */
export interface ComponentHealthStatus {
    status: 'healthy' | 'warning' | 'critical';
    score: number;
    issues: string[];
    recommendations: string[];
}

/**
 * State stability metrics
 */
export interface StateStabilityMetrics {
    transitionFrequency: number;
    averagePhaseTime: number;
    phaseStabilityScore: number;

    // Stability indicators
    unexpectedTransitions: number;
    errorInducedTransitions: number;
    stabilityTrend: 'improving' | 'stable' | 'degrading';
}

/**
 * Checkpoint summary
 */
export interface CheckpointSummary {
    checkpointId: string;
    timestamp: number;
    phase: string;

    // Checkpoint details
    name?: string;
    automatic: boolean;
    size: number;

    // Context
    reason: string;
    metadata: Record<string, unknown>;
}

/**
 * State pattern
 */
export interface StatePattern {
    patternId: string;
    description: string;
    frequency: number;

    // Pattern characteristics
    phaseSequence: string[];
    typicalDurations: Record<string, number>;
    successRate: number;

    // Context conditions
    triggers: string[];
    preconditions: string[];

    // Recommendations
    optimizationOpportunities: string[];
    riskFactors: string[];
}

/**
 * State recommendation
 */
export interface StateRecommendation {
    category: 'performance' | 'stability' | 'recovery' | 'optimization';
    priority: 'low' | 'medium' | 'high' | 'critical';

    // Recommendation details
    description: string;
    rationale: string;
    expectedBenefit: string;

    // Implementation
    actionRequired: string;
    complexity: 'low' | 'medium' | 'high';
    estimatedImpact: number;
}
