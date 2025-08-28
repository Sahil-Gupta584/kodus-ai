/**
 * ⚡ EXECUTION SERVICE INTERFACES
 *
 * Execution management service interfaces for agent runtime
 * Handles plan execution, step tracking, and execution analytics
 */

import type {
    ExecutionContext,
    PlanExecution,
    StepExecutionRegistry,
    ExecutionEvent,
    ExecutionSummary,
    DetailedExecutionSummary,
    FailureAnalysis,
    ReplanContext,
    ExecutionRecoveryContext,
} from '../types/execution-types.js';

import type {
    ContextExecutionOperations,
    ExecutionResult,
    ExecutionError,
    StepResult,
    StepError,
} from '../types/context-types.js';

import type {
    ActivePlanState,
    PlanStep,
    PlanMetrics,
    ExecutionMetrics,
} from '../types/state-types.js';

import { ExecutionPhase, AgentAction } from '../../types/allTypes.js';

// ===============================================
// 🎯 EXECUTION SERVICE INTERFACES
// ===============================================

/**
 * Master execution service that coordinates all execution operations
 */
export interface ExecutionService extends ContextExecutionOperations {
    // Service lifecycle
    initialize(
        sessionId: string,
        config: ExecutionServiceConfig,
    ): Promise<void>;
    shutdown(): Promise<void>;
    reset(): Promise<void>;

    // Execution management
    startExecution(planId: string): Promise<void>;
    completeExecution(result: ExecutionResult): Promise<void>;
    failExecution(error: ExecutionError): Promise<void>;
    pauseExecution(planId: string): Promise<void>;
    resumeExecution(planId: string): Promise<void>;
    cancelExecution(planId: string, reason: string): Promise<void>;

    // Step management
    startStep(
        stepId: string,
        metadata?: Record<string, unknown>,
    ): Promise<void>;
    completeStep(stepId: string, result: StepResult): Promise<void>;
    failStep(stepId: string, error: StepError): Promise<void>;
    retryStep(stepId: string): Promise<void>;
    skipStep(stepId: string, reason: string): Promise<void>;

    // Execution monitoring
    getCurrentExecution(): Promise<PlanExecution | null>;
    getExecutionHistory(): Promise<PlanExecution[]>;
    getExecutionStatus(planId: string): Promise<ExecutionStatus>;

    // Step monitoring
    getCurrentStep(): Promise<ExecutionStepInfo | null>;
    getStepRegistry(): Promise<StepExecutionRegistry>;
    getStepStatus(stepId: string): Promise<StepStatus>;

    // Replan management
    initiateReplan(
        reason: string,
        context?: Record<string, unknown>,
    ): Promise<void>;
    getReplanContext(): Promise<ReplanContext | null>;

    // Execution analytics
    getExecutionSummary(): Promise<DetailedExecutionSummary>;
    getExecutionMetrics(): Promise<ExecutionMetrics>;
    analyzeFailures(): Promise<FailureAnalysis>;

    // Health and diagnostics
    getExecutionHealth(): Promise<ExecutionHealthReport>;
    diagnoseExecution(planId: string): Promise<ExecutionDiagnosis>;
}

/**
 * Plan execution service
 */
export interface PlanExecutionService {
    // Plan execution lifecycle
    startPlanExecution(plan: ExecutionPlan): Promise<PlanExecutionHandle>;
    stopPlanExecution(planId: string, reason: string): Promise<void>;

    // Plan execution monitoring
    getActivePlan(): Promise<ActivePlanState | null>;
    getPlanProgress(planId: string): Promise<PlanProgress>;
    getPlanExecutionEvents(planId: string): Promise<ExecutionEvent[]>;

    // Plan step management
    executeNextStep(planId: string): Promise<StepExecutionResult>;
    executeStep(planId: string, stepId: string): Promise<StepExecutionResult>;
    validateStepExecution(step: PlanStep): Promise<StepValidationResult>;

    // Plan optimization
    optimizePlanExecution(planId: string): Promise<PlanOptimizationResult>;
    analyzePlanPerformance(planId: string): Promise<PlanPerformanceAnalysis>;

    // Plan recovery
    recoverFromFailure(
        planId: string,
        recovery: RecoveryStrategy,
    ): Promise<RecoveryResult>;
    identifyRecoveryOptions(
        planId: string,
        error: ExecutionError,
    ): Promise<RecoveryOption[]>;
}

/**
 * Step execution service
 */
export interface StepExecutionService {
    // Step execution
    executeStep(step: ExecutionStep): Promise<StepExecutionResult>;
    validateStep(step: ExecutionStep): Promise<StepValidationResult>;

    // Step lifecycle
    prepareStep(step: ExecutionStep): Promise<PreparedStep>;
    executeAction(
        action: AgentAction,
        context: StepContext,
    ): Promise<ActionResult>;
    finalizeStep(stepId: string, result: StepResult): Promise<void>;

    // Step monitoring
    getStepStatus(stepId: string): Promise<DetailedStepStatus>;
    getStepMetrics(stepId: string): Promise<StepMetrics>;
    getStepDependencies(stepId: string): Promise<StepDependency[]>;

    // Step retry and recovery
    retryStep(
        stepId: string,
        config: RetryConfig,
    ): Promise<StepExecutionResult>;
    recoverStep(
        stepId: string,
        recovery: StepRecovery,
    ): Promise<RecoveryResult>;

    // Step optimization
    optimizeStep(step: ExecutionStep): Promise<OptimizedStep>;
    analyzeStepPerformance(stepId: string): Promise<StepPerformanceAnalysis>;
}

/**
 * Execution tracking service
 */
export interface ExecutionTrackingService {
    // Event tracking
    trackExecutionEvent(event: ExecutionEvent): Promise<void>;
    getExecutionEvents(planId?: string): Promise<ExecutionEvent[]>;
    getRecentEvents(count: number): Promise<ExecutionEvent[]>;

    // Execution timeline
    buildExecutionTimeline(planId: string): Promise<ExecutionTimeline>;
    getExecutionTrace(planId: string): Promise<ExecutionTrace>;

    // Execution metrics
    recordExecutionMetric(metric: ExecutionMetric): Promise<void>;
    getExecutionMetrics(
        timeRange?: TimeRange,
    ): Promise<AggregatedExecutionMetrics>;

    // Performance tracking
    trackPerformance(
        operation: string,
        duration: number,
        metadata?: Record<string, unknown>,
    ): void;
    getPerformanceMetrics(): Promise<ExecutionPerformanceMetrics>;

    // Error tracking
    trackError(
        error: ExecutionError,
        context?: Record<string, unknown>,
    ): Promise<void>;
    getErrorMetrics(): Promise<ExecutionErrorMetrics>;
    analyzeErrorPatterns(): Promise<ErrorPatternAnalysis>;
}

/**
 * Execution analytics service
 */
export interface ExecutionAnalyticsService {
    // Execution analysis
    analyzeExecution(planId: string): Promise<ExecutionAnalysis>;
    compareExecutions(planIds: string[]): Promise<ExecutionComparison>;

    // Performance analysis
    analyzePerformance(): Promise<PerformanceAnalysis>;
    identifyBottlenecks(): Promise<ExecutionBottleneck[]>;

    // Success analysis
    analyzeSuccessPatterns(): Promise<SuccessPatternAnalysis>;
    identifyBestPractices(): Promise<BestPractice[]>;

    // Failure analysis
    analyzeFailures(): Promise<FailureAnalysis>;
    identifyFailurePatterns(): Promise<FailurePattern[]>;

    // Predictive analysis
    predictExecutionOutcome(plan: ExecutionPlan): Promise<OutcomePrediction>;
    recommendOptimizations(): Promise<OptimizationRecommendation[]>;

    // Trend analysis
    analyzeTrends(timeRange: TimeRange): Promise<ExecutionTrendAnalysis>;
    forecastPerformance(): Promise<PerformanceForecast>;
}

// ===============================================
// 🔄 EXECUTION STATE INTERFACES
// ===============================================

/**
 * Execution plan
 */
export interface ExecutionPlan {
    id: string;
    name: string;
    description: string;
    steps: ExecutionStep[];

    // Plan configuration
    configuration: PlanConfiguration;
    constraints: PlanConstraints;

    // Execution settings
    timeout?: number;
    retryPolicy: RetryPolicy;
    errorHandling: ErrorHandlingPolicy;

    // Metadata
    createdAt: number;
    createdBy: string;
    version: string;
    tags: string[];
}

/**
 * Execution step
 */
export interface ExecutionStep {
    id: string;
    name: string;
    description: string;
    type: StepType;

    // Step configuration
    action: AgentAction;
    input?: unknown;
    expectedOutput?: unknown;

    // Dependencies and ordering
    dependencies: string[];
    preconditions: Precondition[];
    postconditions: Postcondition[];

    // Execution settings
    timeout?: number;
    retryLimit: number;
    optional: boolean;

    // Metadata
    metadata: Record<string, unknown>;
}

/**
 * Plan execution handle
 */
export interface PlanExecutionHandle {
    planId: string;
    executionId: string;
    startTime: number;

    // Control methods
    pause(): Promise<void>;
    resume(): Promise<void>;
    cancel(): Promise<void>;

    // Monitoring methods
    getStatus(): Promise<ExecutionStatus>;
    getProgress(): Promise<PlanProgress>;
    getEvents(): Promise<ExecutionEvent[]>;

    // Event handling
    onStepStarted(callback: StepEventCallback): void;
    onStepCompleted(callback: StepEventCallback): void;
    onStepFailed(callback: StepEventCallback): void;
    onPlanCompleted(callback: PlanEventCallback): void;
    onPlanFailed(callback: PlanEventCallback): void;
}

/**
 * Execution status
 */
export interface ExecutionStatus {
    planId: string;
    status: ExecutionState;
    currentPhase: ExecutionPhase;

    // Progress information
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    skippedSteps: number;
    progressPercent: number;

    // Timing information
    startTime: number;
    endTime?: number;
    duration?: number;
    estimatedTimeRemaining?: number;

    // Current step
    currentStep?: ExecutionStepInfo;

    // Status details
    message?: string;
    lastError?: ExecutionError;
    lastUpdate: number;
}

/**
 * Execution step info
 */
export interface ExecutionStepInfo {
    stepId: string;
    stepName: string;
    stepType: StepType;
    status: StepExecutionState;

    // Timing
    startTime?: number;
    endTime?: number;
    duration?: number;

    // Results
    result?: StepResult;
    error?: StepError;

    // Context
    input?: unknown;
    output?: unknown;
    metadata: Record<string, unknown>;
}

/**
 * Plan progress
 */
export interface PlanProgress {
    planId: string;

    // Step progress
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    skippedSteps: number;
    pendingSteps: number;

    // Percentage and estimates
    progressPercent: number;
    estimatedTimeRemaining?: number;

    // Current activity
    currentStep?: ExecutionStepInfo;
    recentSteps: ExecutionStepInfo[];

    // Milestones
    milestones: PlanMilestone[];
    nextMilestone?: PlanMilestone;

    // Performance indicators
    averageStepDuration: number;
    successRate: number;

    // Last update
    lastUpdate: number;
}

// ===============================================
// 🎛️ EXECUTION CONFIGURATION
// ===============================================

/**
 * Execution service configuration
 */
export interface ExecutionServiceConfig {
    // Execution settings
    maxConcurrentExecutions: number;
    defaultTimeout: number;
    defaultRetryLimit: number;

    // Performance settings
    enableMetrics: boolean;
    enableTracing: boolean;
    metricsRetentionDays: number;

    // Error handling
    globalErrorHandler?: ErrorHandler;
    enableRecovery: boolean;
    maxRecoveryAttempts: number;

    // Monitoring
    enableHealthCheck: boolean;
    healthCheckInterval: number;
    alertThresholds: AlertThresholds;

    // Resource management
    resourceLimits: ResourceLimits;
    cleanupInterval: number;
}

/**
 * Plan configuration
 */
export interface PlanConfiguration {
    // Execution mode
    executionMode: 'sequential' | 'parallel' | 'mixed';

    // Concurrency settings
    maxParallelSteps: number;

    // Failure handling
    failureStrategy: 'abort' | 'skip' | 'retry' | 'continue';

    // Resource allocation
    resourceAllocation: ResourceAllocation;

    // Monitoring
    enableStepProfiling: boolean;
    enableDetailedLogging: boolean;
}

/**
 * Plan constraints
 */
export interface PlanConstraints {
    // Time constraints
    maxExecutionTime?: number;
    stepTimeouts: Record<string, number>;

    // Resource constraints
    memoryLimit?: number;
    cpuLimit?: number;

    // Dependency constraints
    requiredServices: string[];
    optionalServices: string[];

    // Business constraints
    businessRules: BusinessRule[];
}

// ===============================================
// 🔄 STEP EXECUTION TYPES
// ===============================================

/**
 * Step execution result
 */
export interface StepExecutionResult {
    stepId: string;
    success: boolean;
    duration: number;

    // Results
    result?: StepResult;
    error?: StepError;

    // Execution details
    executionDetails: StepExecutionDetails;

    // Performance metrics
    metrics: StepPerformanceMetrics;

    // Metadata
    metadata: Record<string, unknown>;
}

/**
 * Step execution details
 */
export interface StepExecutionDetails {
    startTime: number;
    endTime: number;
    retryCount: number;

    // Action execution
    actionExecuted: AgentAction;
    inputProvided: unknown;
    outputReceived: unknown;

    // Context information
    executionContext: StepExecutionContext;

    // Resource usage
    resourceUsage: ResourceUsage;
}

/**
 * Step execution context
 */
export interface StepExecutionContext {
    stepId: string;
    planId: string;
    executionId: string;

    // Context data
    stepInput: unknown;
    planContext: Record<string, unknown>;
    sessionContext: Record<string, unknown>;

    // Execution state
    previousStepResults: Record<string, StepResult>;
    availableResources: Record<string, unknown>;

    // Configuration
    stepConfiguration: Record<string, unknown>;
    executionSettings: ExecutionSettings;
}

/**
 * Execution settings
 */
export interface ExecutionSettings {
    timeout: number;
    retryLimit: number;
    retryDelay: number;

    // Resource settings
    memoryLimit?: number;
    cpuLimit?: number;

    // Behavior settings
    strictMode: boolean;
    validateInput: boolean;
    validateOutput: boolean;

    // Debugging
    enableDebugging: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug' | 'trace';
}

// ===============================================
// 📊 METRICS AND ANALYTICS TYPES
// ===============================================

/**
 * Execution health report
 */
export interface ExecutionHealthReport {
    overallHealth: 'healthy' | 'warning' | 'critical';

    // Component health
    planExecutionHealth: ComponentHealth;
    stepExecutionHealth: ComponentHealth;
    resourceHealth: ComponentHealth;

    // Performance indicators
    throughput: PerformanceIndicator;
    latency: PerformanceIndicator;
    errorRate: PerformanceIndicator;
    resourceUtilization: PerformanceIndicator;

    // Issues and recommendations
    issues: ExecutionHealthIssue[];
    recommendations: string[];

    // Trends
    healthTrend: 'improving' | 'stable' | 'degrading';
    lastHealthCheck: number;
}

/**
 * Execution diagnosis
 */
export interface ExecutionDiagnosis {
    planId: string;
    diagnosisTime: number;

    // Status assessment
    currentStatus: ExecutionStatus;
    statusAssessment: StatusAssessment;

    // Performance analysis
    performanceAnalysis: PerformanceAnalysis;
    bottleneckAnalysis: BottleneckAnalysis;

    // Error analysis
    errorAnalysis: ErrorAnalysis;
    failureRiskAssessment: FailureRiskAssessment;

    // Recommendations
    immediateActions: ImmediateAction[];
    optimizationSuggestions: OptimizationSuggestion[];

    // Prognosis
    prognosis: ExecutionPrognosis;
}

/**
 * Execution timeline
 */
export interface ExecutionTimeline {
    planId: string;
    timelineStart: number;
    timelineEnd?: number;

    // Timeline events
    events: TimelineEvent[];

    // Timeline analysis
    phases: ExecutionPhaseInfo[];
    criticalPath: CriticalPathInfo;

    // Performance insights
    performanceInsights: PerformanceInsight[];
    optimizationOpportunities: OptimizationOpportunity[];
}

/**
 * Timeline event
 */
export interface TimelineEvent {
    timestamp: number;
    eventType: 'step_start' | 'step_end' | 'error' | 'retry' | 'milestone';
    eventId: string;
    description: string;

    // Event context
    stepId?: string;
    planId: string;
    metadata: Record<string, unknown>;

    // Impact assessment
    impactLevel: 'low' | 'medium' | 'high' | 'critical';
    duration?: number;
}

// ===============================================
// 🏷️ SUPPORTING ENUMS AND TYPES
// ===============================================

export type ExecutionState =
    | 'pending'
    | 'running'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'timeout';

export type StepExecutionState =
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'skipped'
    | 'retrying';

export type StepType =
    | 'action'
    | 'condition'
    | 'loop'
    | 'parallel'
    | 'decision'
    | 'validation'
    | 'transformation';

export type StepEventCallback = (step: ExecutionStepInfo) => void;
export type PlanEventCallback = (execution: PlanExecutionHandle) => void;

// ===============================================
// 🎯 DETAILED SUPPORTING INTERFACES
// ===============================================

/**
 * Step context
 */
export interface StepContext {
    stepId: string;
    planId: string;
    executionId: string;

    // Input/Output
    input: unknown;
    expectedOutput?: unknown;

    // Dependencies
    dependencyResults: Record<string, StepResult>;

    // Configuration
    configuration: Record<string, unknown>;

    // Runtime context
    sessionContext: Record<string, unknown>;
    executionContext: Record<string, unknown>;
}

/**
 * Action result
 */
export interface ActionResult {
    success: boolean;
    output: unknown;
    duration: number;

    // Action details
    actionExecuted: AgentAction;
    executionTrace: ExecutionTrace;

    // Metadata
    metadata: Record<string, unknown>;
    resourceUsage: ResourceUsage;
}

/**
 * Execution trace
 */
export interface ExecutionTrace {
    traceId: string;
    startTime: number;
    endTime: number;

    // Trace segments
    segments: TraceSegment[];

    // Performance data
    totalDuration: number;
    breakdown: Record<string, number>;

    // Context
    context: Record<string, unknown>;
}

/**
 * Trace segment
 */
export interface TraceSegment {
    id: string;
    name: string;
    startTime: number;
    endTime: number;
    duration: number;

    // Segment details
    operation: string;
    parameters: Record<string, unknown>;
    result: unknown;

    // Performance
    resourceUsage: ResourceUsage;

    // Relationships
    parentSegment?: string;
    childSegments: string[];
}

/**
 * Resource usage
 */
export interface ResourceUsage {
    memoryUsed: number;
    cpuUsed: number;
    networkRequests: number;
    storageOperations: number;

    // Detailed metrics
    peakMemory: number;
    averageCpu: number;
    totalNetworkBytes: number;
    totalStorageBytes: number;

    // Timestamps
    measurementStart: number;
    measurementEnd: number;
}

/**
 * Component health
 */
export interface ComponentHealth {
    status: 'healthy' | 'warning' | 'critical';
    score: number;

    // Metrics
    metrics: Record<string, number>;

    // Issues
    issues: string[];
    warnings: string[];

    // Last check
    lastCheck: number;
    checkInterval: number;
}

/**
 * Performance indicator
 */
export interface PerformanceIndicator {
    name: string;
    currentValue: number;
    targetValue: number;
    thresholdWarning: number;
    thresholdCritical: number;

    // Status
    status: 'good' | 'warning' | 'critical';
    trend: 'improving' | 'stable' | 'degrading';

    // Historical data
    history: PerformanceDataPoint[];

    // Analysis
    analysis: string;
    recommendation?: string;
}

/**
 * Performance data point
 */
export interface PerformanceDataPoint {
    timestamp: number;
    value: number;
    metadata?: Record<string, unknown>;
}
