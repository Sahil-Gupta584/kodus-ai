/**
 * 🚀 EXECUTION CONTEXT TYPES
 *
 * Types for agent execution state, planning, and runtime tracking
 * Covers the complete execution lifecycle from planning to completion
 */

import type { AgentAction } from '../../types/allTypes.js';

// ===============================================
// 🎯 EXECUTION CONTEXT CORE
// ===============================================

/**
 * Complete execution context for current agent run
 */
export interface ExecutionContext {
    // Current execution state
    phase: ExecutionPhase;
    status: ExecutionStatus;

    // Plan management
    currentPlan?: PlanExecution;
    planHistory: PlanExecution[];

    // Step tracking
    stepExecution: StepExecutionRegistry;

    // Execution timeline and events
    executionTimeline: ExecutionEvent[];

    // Analysis and intelligence
    executionSummary: ExecutionSummary;
    failureAnalysis: FailureAnalysis;
    replanContext?: ReplanContext;

    // Metrics and status
    iterationCount: number;
    totalDuration: number;
    lastAction: AgentAction;
    stopReason?: StopReason;

    // Resource utilization
    resourceUsage: ResourceUsage;

    // Performance metrics
    performance: ExecutionPerformance;
}

/**
 * Execution phases during agent runtime
 */
export type ExecutionPhase =
    | 'initializing'
    | 'planning'
    | 'executing'
    | 'replanning'
    | 'waiting_input'
    | 'completing'
    | 'completed'
    | 'failed'
    | 'suspended'
    | 'recovering';

/**
 * Current execution status
 */
export type ExecutionStatus =
    | 'pending'
    | 'running'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'timeout';

/**
 * Reasons why execution stopped
 */
export type StopReason =
    | 'completed_successfully'
    | 'plan_failed'
    | 'tool_unavailable'
    | 'max_iterations_reached'
    | 'timeout'
    | 'user_cancelled'
    | 'error'
    | 'waiting_for_input'
    | 'resource_exhausted'
    | 'external_interrupt';

// ===============================================
// 📋 PLAN EXECUTION TYPES
// ===============================================

/**
 * Complete plan execution information
 */
export interface PlanExecution {
    // Plan identity
    planId: string;
    parentPlanId?: string;
    planVersion: number;

    // Plan details
    goal: string;
    strategy: string;
    steps: PlanStep[];

    // Execution state
    status: PlanExecutionStatus;
    currentStepIndex: number;

    // Execution results
    executedSteps: StepExecutionResult[];
    pendingSteps: PlanStep[];
    failedSteps: FailedStep[];
    skippedSteps: SkippedStep[];

    // Analysis and metadata
    executionAnalysis: PlanExecutionAnalysis;
    signals: PlanSignals;
    metadata: PlanMetadata;

    // Timing
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
    duration?: number;
}

/**
 * Status of plan execution
 */
export type PlanExecutionStatus =
    | 'created'
    | 'executing'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'replanning'
    | 'waiting_input'
    | 'suspended';

/**
 * Individual step in a plan
 */
export interface PlanStep {
    // Step identity
    stepId: string;
    stepNumber: number;

    // Step definition
    description: string;
    tool: string;
    arguments: Record<string, unknown>;

    // Dependencies and flow control
    dependencies: string[];
    parallel: boolean;
    optional: boolean;

    // Execution state
    status: StepStatus;
    attempts: number;
    maxRetries: number;

    // Results
    result?: StepResult;
    error?: StepError;

    // Timing and performance
    startedAt?: number;
    completedAt?: number;
    duration?: number;

    // Metadata
    metadata: Record<string, unknown>;
}

/**
 * Status of individual step
 */
export type StepStatus =
    | 'pending'
    | 'ready'
    | 'executing'
    | 'completed'
    | 'failed'
    | 'skipped'
    | 'retrying'
    | 'cancelled';

/**
 * Result of step execution
 */
export interface StepExecutionResult {
    stepId: string;
    step: PlanStep;

    // Execution outcome
    success: boolean;
    result: StepResult;
    error?: StepExecutionError;

    // Tool interactions
    toolCalls: ToolCall[];
    toolResults: ToolCallResult[];

    // Performance
    duration: number;
    resourceUsage: StepResourceUsage;

    // Analysis
    analysis: StepAnalysis;

    // Timestamps
    executedAt: number;
}

/**
 * Failed step information
 */
export interface FailedStep {
    stepId: string;
    step: PlanStep;
    error: StepExecutionError;
    attempts: number;
    failureReason: string;
    recoverable: boolean;
    suggestedAction?: string;
    timestamp: number;
}

/**
 * Skipped step information
 */
export interface SkippedStep {
    stepId: string;
    step: PlanStep;
    skipReason: string;
    skipCondition?: string;
    timestamp: number;
}

// ===============================================
// 📊 STEP EXECUTION REGISTRY
// ===============================================

/**
 * Registry of all step executions
 */
export interface StepExecutionRegistry {
    // All step executions
    executions: Map<string, StepExecutionResult>;

    // Execution timeline
    timeline: StepExecutionEvent[];

    // Step relationships
    dependencies: Map<string, string[]>;
    dependents: Map<string, string[]>;

    // Execution statistics
    statistics: StepExecutionStatistics;

    // Current execution context
    currentExecutions: Set<string>;
    completedExecutions: Set<string>;
    failedExecutions: Set<string>;
}

/**
 * Step execution event
 */
export interface StepExecutionEvent {
    eventId: string;
    stepId: string;
    eventType: StepEventType;
    timestamp: number;
    data: Record<string, unknown>;
}

/**
 * Types of step events
 */
export type StepEventType =
    | 'step_created'
    | 'step_started'
    | 'step_tool_call'
    | 'step_tool_result'
    | 'step_completed'
    | 'step_failed'
    | 'step_retried'
    | 'step_skipped'
    | 'step_cancelled';

/**
 * Statistics about step executions
 */
export interface StepExecutionStatistics {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    skippedSteps: number;

    averageStepDuration: number;
    successRate: number;
    retryRate: number;

    toolUsage: Map<string, ToolUsageStats>;
    errorPatterns: Map<string, number>;
}

/**
 * Tool usage statistics
 */
export interface ToolUsageStats {
    toolName: string;
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    averageDuration: number;
    errorTypes: Map<string, number>;
}

// ===============================================
// 📈 EXECUTION EVENTS & TIMELINE
// ===============================================

/**
 * Execution event in timeline
 */
export interface ExecutionEvent {
    eventId: string;
    eventType: ExecutionEventType;
    timestamp: number;

    // Event context
    planId?: string;
    stepId?: string;

    // Event data
    data: Record<string, unknown>;
    metadata: Record<string, unknown>;

    // Event relationships
    parentEventId?: string;
    childEventIds: string[];
}

/**
 * Types of execution events
 */
export type ExecutionEventType =
    | 'execution_started'
    | 'plan_created'
    | 'plan_started'
    | 'plan_completed'
    | 'plan_failed'
    | 'step_executed'
    | 'tool_called'
    | 'replan_initiated'
    | 'execution_paused'
    | 'execution_resumed'
    | 'execution_completed'
    | 'execution_failed'
    | 'user_interaction'
    | 'external_event';

// ===============================================
// 📊 EXECUTION SUMMARY & ANALYSIS
// ===============================================

/**
 * Summary of execution
 */
export interface ExecutionSummary {
    // Basic metrics
    totalPlans: number;
    totalSteps: number;
    successfulSteps: number;
    failedSteps: number;
    skippedSteps: number;

    // Performance metrics
    totalDuration: number;
    averageStepDuration: number;
    planningTime: number;
    executionTime: number;

    // Quality metrics
    successRate: number;
    replanRate: number;
    errorRate: number;

    // Resource metrics
    totalTokensUsed: number;
    totalToolCalls: number;
    uniqueToolsUsed: number;

    // Current state summary
    currentPhase: ExecutionPhase;
    lastAction: string;
    nextSuggestedAction?: string;
}

/**
 * Failure analysis
 */
export interface FailureAnalysis {
    // Failure overview
    totalFailures: number;
    failureRate: number;
    criticalFailures: number;

    // Failure patterns
    commonFailures: FailurePattern[];
    failureDistribution: Map<string, number>;

    // Root cause analysis
    rootCauses: RootCause[];

    // Recovery information
    recoverableFailures: number;
    recoveryStrategies: RecoveryStrategy[];

    // Prevention suggestions
    preventionSuggestions: string[];
}

/**
 * Failure pattern
 */
export interface FailurePattern {
    patternId: string;
    description: string;
    frequency: number;

    // Pattern characteristics
    typicalCauses: string[];
    affectedComponents: string[];

    // Impact assessment
    impact: FailureImpact;
    severity: FailureSeverity;

    // Resolution information
    knownResolutions: Resolution[];
    preventionMeasures: string[];
}

/**
 * Failure impact levels
 */
export type FailureImpact = 'low' | 'medium' | 'high' | 'critical';

/**
 * Failure severity levels
 */
export type FailureSeverity = 'minor' | 'major' | 'critical' | 'blocker';

/**
 * Root cause of failure
 */
export interface RootCause {
    causeId: string;
    description: string;
    category: RootCauseCategory;
    confidence: number;

    // Evidence
    evidence: Evidence[];

    // Impact
    affectedSteps: string[];
    cascadeEffects: string[];

    // Resolution
    suggestedFix: string;
    preventionStrategy: string;
}

/**
 * Categories of root causes
 */
export type RootCauseCategory =
    | 'tool_error'
    | 'parameter_error'
    | 'dependency_failure'
    | 'resource_exhaustion'
    | 'timeout'
    | 'external_service'
    | 'configuration'
    | 'data_quality'
    | 'logic_error'
    | 'unknown';

/**
 * Evidence for root cause
 */
export interface Evidence {
    type: EvidenceType;
    description: string;
    source: string;
    timestamp: number;
    confidence: number;
}

/**
 * Types of evidence
 */
export type EvidenceType =
    | 'error_message'
    | 'log_entry'
    | 'metric_value'
    | 'tool_response'
    | 'timing_data'
    | 'resource_usage'
    | 'user_feedback';

/**
 * Recovery strategy
 */
export interface RecoveryStrategy {
    strategyId: string;
    description: string;
    applicableFailures: string[];

    // Strategy details
    steps: RecoveryStep[];
    successRate: number;
    averageRecoveryTime: number;

    // Requirements
    prerequisites: string[];
    resources: string[];
}

/**
 * Step in recovery strategy
 */
export interface RecoveryStep {
    stepNumber: number;
    action: string;
    description: string;
    automated: boolean;
    estimatedTime: number;
}

/**
 * Resolution for failure pattern
 */
export interface Resolution {
    resolutionId: string;
    description: string;
    successRate: number;

    // Resolution steps
    steps: string[];
    automatable: boolean;

    // Validation
    validationCriteria: string[];
    expectedOutcome: string;
}

// ===============================================
// 🔄 REPLAN CONTEXT
// ===============================================

/**
 * Context for replanning operations
 */
export interface ReplanContext {
    // Replan trigger
    isReplan: boolean;
    replanTrigger: ReplanTrigger;
    replanReason: string;

    // Previous execution data
    executedPlan: PreviousPlanExecution;
    planHistory: PlanHistoryEntry[];

    // Learning and adaptation
    learnedPatterns: LearnedPattern[];
    adaptationSuggestions: AdaptationSuggestion[];

    // Replan constraints
    constraints: ReplanConstraint[];
    preferences: ReplanPreference[];
}

/**
 * What triggered the replan
 */
export type ReplanTrigger =
    | 'plan_failure'
    | 'tool_unavailable'
    | 'missing_parameters'
    | 'user_request'
    | 'performance_issue'
    | 'external_change'
    | 'timeout'
    | 'quality_threshold';

/**
 * Previous plan execution data
 */
export interface PreviousPlanExecution {
    plan: PlanExecution;
    executionData: ExecutionData;
    signals: PlanSignals;
    lessons: ExecutionLesson[];
}

/**
 * Execution data from previous run
 */
export interface ExecutionData {
    toolsThatWorked: SuccessfulTool[];
    toolsThatFailed: FailedTool[];
    toolsNotExecuted: UnexecutedTool[];

    // Timing data
    executionTimeline: TimedEvent[];
    bottlenecks: Bottleneck[];

    // Quality data
    qualityMetrics: QualityMetric[];
    userFeedback: UserFeedback[];
}

/**
 * Tool that worked successfully
 */
export interface SuccessfulTool {
    stepId: string;
    tool: string;
    input: unknown;
    output: unknown;
    duration: number;
    quality: number;
}

/**
 * Tool that failed
 */
export interface FailedTool {
    stepId: string;
    tool: string;
    input: unknown;
    error: string;
    attempts: number;
    recoverable: boolean;
}

/**
 * Tool that was not executed
 */
export interface UnexecutedTool {
    stepId: string;
    tool: string;
    plannedInput: unknown;
    skipReason: string;
}

/**
 * Timed event in execution
 */
export interface TimedEvent {
    timestamp: number;
    event: string;
    duration: number;
    context: Record<string, unknown>;
}

/**
 * Performance bottleneck
 */
export interface Bottleneck {
    component: string;
    severity: number;
    impact: string;
    suggestedFix: string;
}

/**
 * Quality metric
 */
export interface QualityMetric {
    metric: string;
    value: number;
    target: number;
    status: 'good' | 'warning' | 'poor';
}

/**
 * User feedback
 */
export interface UserFeedback {
    timestamp: number;
    type: 'positive' | 'negative' | 'neutral';
    content: string;
    category: string;
}

/**
 * Plan history entry
 */
export interface PlanHistoryEntry {
    planId: string;
    timestamp: number;
    outcome: 'success' | 'failure' | 'partial';
    lessons: string[];
    adaptations: string[];
}

/**
 * Learned pattern from execution
 */
export interface LearnedPattern {
    patternId: string;
    description: string;
    confidence: number;

    // Pattern data
    triggerConditions: string[];
    successFactors: string[];
    failureFactors: string[];

    // Application
    applicableScenarios: string[];
    recommendations: string[];
}

/**
 * Suggestion for adaptation
 */
export interface AdaptationSuggestion {
    suggestionId: string;
    description: string;
    rationale: string;

    // Impact assessment
    expectedImpact: Impact;
    riskAssessment: Risk;

    // Implementation
    implementationSteps: string[];
    validationCriteria: string[];
}

/**
 * Impact of adaptation
 */
export interface Impact {
    performance: number;
    reliability: number;
    efficiency: number;
    userExperience: number;
}

/**
 * Risk of adaptation
 */
export interface Risk {
    level: 'low' | 'medium' | 'high';
    factors: string[];
    mitigationStrategies: string[];
}

/**
 * Constraint for replanning
 */
export interface ReplanConstraint {
    type: ConstraintType;
    description: string;
    value: unknown;
    enforced: boolean;
}

/**
 * Types of replan constraints
 */
export type ConstraintType =
    | 'time_limit'
    | 'resource_limit'
    | 'tool_restriction'
    | 'quality_threshold'
    | 'cost_limit'
    | 'user_preference';

/**
 * Preference for replanning
 */
export interface ReplanPreference {
    type: PreferenceType;
    description: string;
    weight: number;
    value: unknown;
}

/**
 * Types of replan preferences
 */
export type PreferenceType =
    | 'speed_over_quality'
    | 'quality_over_speed'
    | 'minimize_cost'
    | 'maximize_reliability'
    | 'prefer_simple_solutions'
    | 'prefer_comprehensive_solutions';

// ===============================================
// 📊 RESOURCE USAGE & PERFORMANCE
// ===============================================

/**
 * Resource usage tracking
 */
export interface ResourceUsage {
    // Compute resources
    cpuTime: number;
    memoryUsage: number;

    // API resources
    tokenUsage: TokenUsage;
    apiCalls: ApiCallStats;

    // Time resources
    totalTime: number;
    waitTime: number;
    processingTime: number;

    // Cost tracking
    estimatedCost: number;
    costBreakdown: CostBreakdown;
}

/**
 * Token usage across different operations
 */
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;

    // By operation type
    planningTokens: number;
    executionTokens: number;
    analysisTokens: number;
}

/**
 * API call statistics
 */
export interface ApiCallStats {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;

    // By service
    llmCalls: number;
    toolCalls: number;
    memorySearchCalls: number;

    // Performance
    averageLatency: number;
    totalLatency: number;
}

/**
 * Cost breakdown
 */
export interface CostBreakdown {
    llmCosts: number;
    toolCosts: number;
    memoryCosts: number;
    computeCosts: number;
    otherCosts: number;
}

/**
 * Step-specific resource usage
 */
export interface StepResourceUsage {
    duration: number;
    tokens: number;
    apiCalls: number;
    memoryAccess: number;
    estimatedCost: number;
}

/**
 * Execution performance metrics
 */
export interface ExecutionPerformance {
    // Throughput
    stepsPerSecond: number;
    plansPerHour: number;

    // Latency
    averageStepLatency: number;
    p50StepLatency: number;
    p90StepLatency: number;
    p99StepLatency: number;

    // Quality
    successRate: number;
    errorRate: number;
    retryRate: number;

    // Efficiency
    resourceEfficiency: number;
    costEfficiency: number;
}

// ===============================================
// 📋 PLAN SIGNALS & METADATA
// ===============================================

/**
 * Signals from plan execution
 */
export interface PlanSignals {
    // Input requirements
    needs?: string[];
    noDiscoveryPath?: string[];

    // Error information
    errors?: string[];
    warnings?: string[];

    // Guidance
    suggestedNextStep?: string;
    alternativeApproaches?: string[];

    // Quality indicators
    confidence?: number;
    complexity?: number;
    riskLevel?: number;
}

/**
 * Plan metadata
 */
export interface PlanMetadata {
    // Creation context
    createdBy: string;
    creationType:
        | 'user_request'
        | 'automatic_replan'
        | 'scheduled'
        | 'recovery';

    // Plan characteristics
    planComplexity: number;
    estimatedDuration: number;
    resourceRequirements: ResourceRequirement[];

    // Execution context
    executionEnvironment: ExecutionEnvironment;
    constraints: PlanConstraint[];

    // Quality and validation
    validationResults: ValidationResult[];
    qualityScore: number;

    // Relationships
    parentPlanId?: string;
    childPlanIds: string[];
    relatedPlanIds: string[];
}

/**
 * Resource requirement
 */
export interface ResourceRequirement {
    type: ResourceType;
    amount: number;
    critical: boolean;
    description: string;
}

/**
 * Types of resources
 */
export type ResourceType =
    | 'tokens'
    | 'api_calls'
    | 'memory'
    | 'time'
    | 'cost'
    | 'tool_access';

/**
 * Execution environment
 */
export interface ExecutionEnvironment {
    agentVersion: string;
    frameworkVersion: string;
    availableTools: string[];
    capabilities: string[];
    limitations: string[];
}

/**
 * Plan constraint
 */
export interface PlanConstraint {
    type: string;
    value: unknown;
    enforced: boolean;
    description: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
    validator: string;
    passed: boolean;
    score: number;
    issues: ValidationIssue[];
    suggestions: string[];
}

/**
 * Validation issue
 */
export interface ValidationIssue {
    severity: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    component: string;
    suggestion?: string;
}

/**
 * Analysis of plan execution
 */
export interface PlanExecutionAnalysis {
    // Overall assessment
    overallSuccess: boolean;
    completionRate: number;
    qualityScore: number;

    // Performance analysis
    performanceAnalysis: PlanPerformanceAnalysis;

    // Efficiency analysis
    efficiencyAnalysis: EfficiencyAnalysis;

    // Quality analysis
    qualityAnalysis: QualityAnalysis;

    // Lessons learned
    lessonsLearned: ExecutionLesson[];

    // Recommendations
    recommendations: Recommendation[];
}

/**
 * Plan performance analysis
 */
export interface PlanPerformanceAnalysis {
    // Timing
    totalExecutionTime: number;
    planningOverhead: number;
    executionEfficiency: number;

    // Resource utilization
    resourceUtilization: ResourceUtilizationAnalysis;

    // Bottleneck analysis
    bottlenecks: PerformanceBottleneck[];

    // Optimization opportunities
    optimizations: OptimizationOpportunity[];
}

/**
 * Resource utilization analysis
 */
export interface ResourceUtilizationAnalysis {
    // Utilization rates
    cpuUtilization: number;
    memoryUtilization: number;
    tokenUtilization: number;

    // Waste analysis
    wastedResources: WastedResource[];

    // Optimization potential
    optimizationPotential: number;
}

/**
 * Performance bottleneck
 */
export interface PerformanceBottleneck {
    component: string;
    impact: number;
    description: string;
    resolution: string;
}

/**
 * Optimization opportunity
 */
export interface OptimizationOpportunity {
    area: string;
    potentialGain: number;
    effort: 'low' | 'medium' | 'high';
    description: string;
    implementation: string[];
}

/**
 * Wasted resource
 */
export interface WastedResource {
    type: ResourceType;
    amount: number;
    reason: string;
    prevention: string;
}

/**
 * Efficiency analysis
 */
export interface EfficiencyAnalysis {
    // Core metrics
    stepEfficiency: number;
    planEfficiency: number;
    resourceEfficiency: number;

    // Inefficiency sources
    inefficiencies: Inefficiency[];

    // Improvement suggestions
    improvements: ImprovementSuggestion[];
}

/**
 * Inefficiency in execution
 */
export interface Inefficiency {
    type: string;
    impact: number;
    description: string;
    suggestion: string;
}

/**
 * Improvement suggestion
 */
export interface ImprovementSuggestion {
    area: string;
    suggestion: string;
    expectedBenefit: string;
    implementation: string[];
}

/**
 * Quality analysis
 */
export interface QualityAnalysis {
    // Quality scores
    outputQuality: number;
    processQuality: number;
    userSatisfaction: number;

    // Quality issues
    qualityIssues: QualityIssue[];

    // Quality improvements
    qualityImprovements: QualityImprovement[];
}

/**
 * Quality issue
 */
export interface QualityIssue {
    category: string;
    severity: number;
    description: string;
    impact: string;
    resolution: string;
}

/**
 * Quality improvement
 */
export interface QualityImprovement {
    aspect: string;
    improvement: string;
    benefit: string;
    implementation: string;
}

/**
 * Lesson learned from execution
 */
export interface ExecutionLesson {
    lessonId: string;
    category: string;
    description: string;

    // Context
    context: string;
    situation: string;

    // Learning
    whatWorked: string[];
    whatDidntWork: string[];
    keyInsight: string;

    // Application
    applicability: string[];
    futureApplication: string;
}

/**
 * Recommendation from analysis
 */
export interface Recommendation {
    recommendationId: string;
    priority: 'low' | 'medium' | 'high' | 'critical';

    // Recommendation details
    title: string;
    description: string;
    rationale: string;

    // Implementation
    actionItems: ActionItem[];
    estimatedEffort: string;
    expectedBenefit: string;

    // Tracking
    implementable: boolean;
    dependencies: string[];
}

/**
 * Action item for recommendation
 */
export interface ActionItem {
    itemId: string;
    description: string;
    owner: string;
    dueDate?: number;
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

// ===============================================
// 🔧 STEP ANALYSIS TYPES
// ===============================================

/**
 * Analysis of individual step
 */
export interface StepAnalysis {
    // Performance
    performanceScore: number;
    executionTime: number;
    resourceUsage: StepResourceUsage;

    // Quality
    qualityScore: number;
    outputRelevance: number;
    errorRate: number;

    // Tool analysis
    toolEffectiveness: number;
    toolReliability: number;

    // Context analysis
    contextUtilization: number;
    inputQuality: number;

    // Issues and recommendations
    issues: StepIssue[];
    recommendations: StepRecommendation[];
}

/**
 * Issue with step execution
 */
export interface StepIssue {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    impact: string;
    suggestion: string;
}

/**
 * Recommendation for step improvement
 */
export interface StepRecommendation {
    type: string;
    description: string;
    expectedBenefit: string;
    implementation: string;
}

// ===============================================
// 🎯 CONTEXT FOR FINAL RESPONSE
// ===============================================

/**
 * Complete context for generating final response
 */
export interface FinalResponseContext {
    // Execution overview
    executionSummary: DetailedExecutionSummary;
    planAnalysis: PlanAnalysis;

    // Results and outcomes
    toolResults: ToolExecutionResult[];
    achievements: Achievement[];
    usableResults: UsableResult[];

    // Replan and iteration context
    isReplan: boolean;
    replanCount: number;
    replanReasons: string[];
    iterationHistory: IterationSummary[];

    // Failure and success analysis
    failures: FailureDetail[];
    successes: SuccessDetail[];
    lessonsLearned: string[];

    // Guidance for response generation
    responseGuidance: ResponseGuidance;
    suggestedNextSteps: string[];
    userFeedbackOpportunities: string[];
}

/**
 * Detailed execution summary for response generation
 */
export interface DetailedExecutionSummary {
    // Basic metrics
    totalSteps: number;
    completedSteps: number;
    successfulSteps: number;
    failedSteps: number;
    skippedSteps: number;

    // Quality metrics
    overallSuccessRate: number;
    outputQuality: number;
    userSatisfaction: number;

    // Performance metrics
    totalDuration: number;
    averageStepDuration: number;
    resourceUtilization: number;

    // Context metrics
    contextUtilization: number;
    memoryHits: number;
    learningOpportunities: number;

    // Current state
    currentPhase: ExecutionPhase;
    stopReason: StopReason;
    finalStatus: ExecutionStatus;
}

/**
 * Analysis of plan for response generation
 */
export interface PlanAnalysis {
    // Plan assessment
    planViability: number;
    planComplexity: number;
    planCompletion: number;

    // Execution analysis
    planEffectiveness: number;
    stepSuccessRate: number;
    adaptationNeeded: boolean;

    // Quality indicators
    planQuality: number;
    outputRelevance: number;
    goalAchievement: number;

    // Issues and insights
    criticalIssues: string[];
    keyInsights: string[];
    improvementAreas: string[];
}

/**
 * Tool execution result for response
 */
export interface ToolExecutionResult {
    toolName: string;
    stepId: string;

    // Execution details
    success: boolean;
    duration: number;
    attempts: number;

    // Results
    input: unknown;
    output: unknown;
    error?: string;

    // Analysis
    effectiveness: number;
    relevance: number;
    quality: number;

    // Context
    purpose: string;
    outcome: string;
    contribution: string;
}

/**
 * Achievement during execution
 */
export interface Achievement {
    achievementId: string;
    type: AchievementType;
    description: string;

    // Details
    stepId: string;
    toolUsed: string;
    outcome: string;

    // Impact
    userValue: string;
    goalContribution: number;
    qualityIndicators: string[];
}

/**
 * Types of achievements
 */
export type AchievementType =
    | 'goal_completed'
    | 'problem_solved'
    | 'data_retrieved'
    | 'action_performed'
    | 'insight_generated'
    | 'connection_made'
    | 'optimization_found';

/**
 * Usable result from execution
 */
export interface UsableResult {
    resultId: string;
    type: ResultType;
    content: unknown;

    // Metadata
    source: string;
    quality: number;
    relevance: number;

    // Usage information
    usageSuggestions: string[];
    format: string;
    accessibility: string;
}

/**
 * Types of results
 */
export type ResultType =
    | 'data'
    | 'analysis'
    | 'recommendation'
    | 'action_result'
    | 'insight'
    | 'summary'
    | 'solution';

/**
 * Summary of iteration
 */
export interface IterationSummary {
    iterationNumber: number;
    planId: string;

    // Execution summary
    steps: number;
    successes: number;
    failures: number;

    // Outcomes
    achievements: string[];
    issues: string[];
    lessons: string[];

    // Transitions
    startReason: string;
    endReason: string;
    nextAction: string;
}

/**
 * Detail of failure
 */
export interface FailureDetail {
    failureId: string;
    stepId: string;
    type: string;

    // Failure information
    description: string;
    rootCause: string;
    impact: string;

    // Context
    attemptNumber: number;
    recoveryAttempted: boolean;
    recoverySuccess: boolean;

    // Learning
    lesson: string;
    prevention: string;
}

/**
 * Detail of success
 */
export interface SuccessDetail {
    successId: string;
    stepId: string;
    type: string;

    // Success information
    description: string;
    outcome: string;
    value: string;

    // Quality indicators
    qualityScore: number;
    relevanceScore: number;
    satisfactionScore: number;

    // Replicability
    keyFactors: string[];
    replicationPotential: number;
}

/**
 * Guidance for response generation
 */
export interface ResponseGuidance {
    // Tone and style
    recommendedTone: ResponseTone;
    emphasisAreas: string[];

    // Content guidance
    keyPointsToHighlight: string[];
    detailsToInclude: string[];
    detailsToOmit: string[];

    // Structure guidance
    suggestedStructure: ResponseStructure;
    requiredSections: string[];
    optionalSections: string[];

    // User considerations
    userExpectations: string[];
    userContext: Record<string, unknown>;
    communicationPreferences: string[];
}

/**
 * Response tone options
 */
export type ResponseTone =
    | 'informative'
    | 'concise'
    | 'detailed'
    | 'apologetic'
    | 'confident'
    | 'cautious'
    | 'encouraging'
    | 'technical'
    | 'friendly';

/**
 * Structure for response
 */
export interface ResponseStructure {
    introduction: boolean;
    executionSummary: boolean;
    keyResults: boolean;
    achievements: boolean;
    issues: boolean;
    nextSteps: boolean;
    conclusion: boolean;
}

/**
 * Enhanced planner context
 */
export interface EnrichedPlannerContext {
    // Original context
    originalContext: any; // PlannerExecutionContext from allTypes

    // Enhanced execution information
    executionEnrichment: ExecutionEnrichment;

    // Memory enrichment
    memoryEnrichment: MemoryEnrichment;

    // Analysis enrichment
    analysisEnrichment: AnalysisEnrichment;

    // Predictive enrichment
    predictiveEnrichment: PredictiveEnrichment;
}

/**
 * Execution enrichment data
 */
export interface ExecutionEnrichment {
    // Current execution state
    detailedExecutionState: DetailedExecutionSummary;
    realtimeMetrics: RealtimeMetrics;

    // Historical context
    executionHistory: ExecutionHistoryItem[];
    performanceTrends: PerformanceTrend[];

    // Quality indicators
    qualityMetrics: QualityMetrics;
    successPredictors: SuccessPredictor[];
}

/**
 * Memory enrichment data
 */
export interface MemoryEnrichment {
    // Relevant memories
    relevantMemories: RelevantMemory[];
    memoryUtilization: MemoryUtilization;

    // Context patterns
    contextPatterns: ContextPattern[];
    usagePatterns: UsagePattern[];

    // Memory quality
    memoryQuality: MemoryQuality;
    retrievalEfficiency: number;
}

/**
 * Analysis enrichment data
 */
export interface AnalysisEnrichment {
    // Performance analysis
    performanceInsights: PerformanceInsight[];
    bottleneckAnalysis: BottleneckAnalysis;

    // Pattern analysis
    executionPatterns: ExecutionPattern[];
    anomalyDetection: AnomalyDetection;

    // Quality analysis
    outputQualityAnalysis: OutputQualityAnalysis;
    processQualityAnalysis: ProcessQualityAnalysis;
}

/**
 * Predictive enrichment data
 */
export interface PredictiveEnrichment {
    // Success prediction
    successProbability: number;
    successFactors: SuccessFactor[];

    // Risk prediction
    riskAssessment: RiskAssessment;
    riskMitigation: RiskMitigation[];

    // Optimization prediction
    optimizationOpportunities: PredictedOptimization[];
    improvementPotential: ImprovementPotential;
}

// ===============================================
// 🔧 SUPPORTING ENRICHMENT TYPES
// ===============================================

/**
 * Realtime metrics
 */
export interface RealtimeMetrics {
    currentThroughput: number;
    currentLatency: number;
    currentErrorRate: number;
    resourceUtilization: number;
    trend: 'improving' | 'stable' | 'degrading';
}

/**
 * Execution history item
 */
export interface ExecutionHistoryItem {
    timestamp: number;
    planId: string;
    outcome: string;
    duration: number;
    keyMetrics: Record<string, number>;
    lessons: string[];
}

/**
 * Performance trend
 */
export interface PerformanceTrend {
    metric: string;
    trend: 'up' | 'down' | 'stable';
    change: number;
    timeframe: string;
    significance: number;
}

/**
 * Quality metrics
 */
export interface QualityMetrics {
    outputAccuracy: number;
    processEfficiency: number;
    userSatisfaction: number;
    goalAlignment: number;
    overallQuality: number;
}

/**
 * Success predictor
 */
export interface SuccessPredictor {
    factor: string;
    weight: number;
    currentValue: number;
    contribution: number;
    confidence: number;
}

/**
 * Relevant memory
 */
export interface RelevantMemory {
    content: string;
    relevance: number;
    recency: number;
    usage: number;
    quality: number;
    type: string;
}

/**
 * Memory utilization
 */
export interface MemoryUtilization {
    hitRate: number;
    averageRelevance: number;
    memoryEfficiency: number;
    retrievalSpeed: number;
}

/**
 * Context pattern
 */
export interface ContextPattern {
    pattern: string;
    frequency: number;
    effectiveness: number;
    contexts: string[];
}

/**
 * Usage pattern
 */
export interface UsagePattern {
    pattern: string;
    frequency: number;
    successRate: number;
    conditions: string[];
}

/**
 * Memory quality
 */
export interface MemoryQuality {
    accuracy: number;
    completeness: number;
    freshness: number;
    relevance: number;
    organization: number;
}

/**
 * Performance insight
 */
export interface PerformanceInsight {
    category: string;
    insight: string;
    impact: number;
    actionable: boolean;
    recommendation: string;
}

/**
 * Bottleneck analysis
 */
export interface BottleneckAnalysis {
    primaryBottleneck: string;
    impact: number;
    resolution: string;
    alternativeApproaches: string[];
}

/**
 * Execution pattern
 */
export interface ExecutionPattern {
    pattern: string;
    occurrence: number;
    effectiveness: number;
    applicableContexts: string[];
}

/**
 * Anomaly detection
 */
export interface AnomalyDetection {
    anomaliesDetected: Anomaly[];
    confidenceLevel: number;
    investigationNeeded: boolean;
}

/**
 * Anomaly
 */
export interface Anomaly {
    type: string;
    description: string;
    severity: number;
    timeframe: string;
    possibleCauses: string[];
}

/**
 * Output quality analysis
 */
export interface OutputQualityAnalysis {
    relevance: number;
    accuracy: number;
    completeness: number;
    clarity: number;
    actionability: number;
}

/**
 * Process quality analysis
 */
export interface ProcessQualityAnalysis {
    efficiency: number;
    reliability: number;
    adaptability: number;
    transparency: number;
    maintainability: number;
}

/**
 * Success factor
 */
export interface SuccessFactor {
    factor: string;
    importance: number;
    currentStatus: number;
    trend: string;
    actionable: boolean;
}

/**
 * Risk assessment
 */
export interface RiskAssessment {
    overallRisk: number;
    riskFactors: RiskFactor[];
    criticalRisks: string[];
    mitigationPriority: string[];
}

/**
 * Risk factor
 */
export interface RiskFactor {
    factor: string;
    probability: number;
    impact: number;
    risk: number;
    controllable: boolean;
}

/**
 * Risk mitigation
 */
export interface RiskMitigation {
    risk: string;
    strategy: string;
    effectiveness: number;
    cost: string;
    timeframe: string;
}

/**
 * Predicted optimization
 */
export interface PredictedOptimization {
    area: string;
    potentialImprovement: number;
    confidence: number;
    effort: string;
    timeline: string;
}

/**
 * Improvement potential
 */
export interface ImprovementPotential {
    overallPotential: number;
    keyAreas: string[];
    quickWins: string[];
    longTermOpportunities: string[];
}

// ===============================================
// 🛠️ TOOL AND OPERATION TYPES
// ===============================================

/**
 * Tool call in step
 */
export interface ToolCall {
    callId: string;
    toolName: string;
    input: unknown;
    timestamp: number;
}

/**
 * Result of tool call
 */
export interface ToolCallResult {
    callId: string;
    toolName: string;
    success: boolean;
    output: unknown;
    error?: string;
    duration: number;
    metadata: Record<string, unknown>;
}

/**
 * Result of step
 */
export interface StepResult {
    success: boolean;
    result: unknown;
    metadata: Record<string, unknown>;
}

/**
 * Error in step execution
 */
export interface StepExecutionError {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    recoverable: boolean;
    suggestedAction?: string;
}

/**
 * Error in step
 */
export interface StepError {
    code: string;
    message: string;
    stepId: string;
    recoverable: boolean;
    suggestedAction?: string;
}

/**
 * Runtime metadata
 */
export interface RuntimeMetadata {
    // Framework information
    frameworkVersion: string;
    agentVersion: string;

    // Environment
    environment: string;
    capabilities: string[];
    limitations: string[];

    // Configuration
    configuration: Record<string, unknown>;
    features: string[];

    // Performance settings
    performanceSettings: PerformanceSettings;

    // Monitoring
    monitoringEnabled: boolean;
    debugMode: boolean;

    // Timestamps
    startTime: number;
    lastUpdate: number;
}

/**
 * Performance settings
 */
export interface PerformanceSettings {
    maxConcurrentSteps: number;
    timeoutSettings: TimeoutSettings;
    retrySettings: RetrySettings;
    cacheSettings: CacheSettings;
}

/**
 * Timeout settings
 */
export interface TimeoutSettings {
    stepTimeout: number;
    planTimeout: number;
    toolTimeout: number;
    overallTimeout: number;
}

/**
 * Retry settings
 */
export interface RetrySettings {
    maxRetries: number;
    retryDelay: number;
    backoffMultiplier: number;
    retryableErrors: string[];
}

/**
 * Cache settings
 */
export interface CacheSettings {
    enabled: boolean;
    maxSize: number;
    ttl: number;
    strategy: 'lru' | 'fifo' | 'lfu';
}
