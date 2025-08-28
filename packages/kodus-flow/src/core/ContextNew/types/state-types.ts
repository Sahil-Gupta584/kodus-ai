/**
 * 🔄 STATE MANAGEMENT TYPES
 *
 * State management interfaces for agent runtime execution
 * Based on 2024 state-of-the-art checkpointing and persistence patterns
 */

import {
    ExecutionPhase,
    StopReason,
    AgentAction,
} from '../../types/allTypes.js';

import type {
    ExecutionEvent,
    PlanExecution,
    StepExecutionRegistry,
    ReplanContext,
} from './execution-types.js';

import type {
    ShortTermMemory,
    LongTermMemory,
    EpisodicMemory,
} from './memory-types.js';

// ===============================================
// 🎛️ STATE MANAGEMENT CORE INTERFACES
// ===============================================

/**
 * Master state manager that coordinates all state operations
 */
export interface ExecutionStateManager {
    // State lifecycle
    initialize(sessionId: string, agentId: string): Promise<void>;
    reset(): Promise<void>;
    cleanup(): Promise<void>;

    // Phase management
    getCurrentPhase(): ExecutionPhase;
    transitionTo(
        phase: ExecutionPhase,
        metadata?: StateTransitionMetadata,
    ): Promise<void>;
    canTransitionTo(phase: ExecutionPhase): boolean;

    // State persistence
    saveState(): Promise<StateSnapshot>;
    loadState(snapshotId: string): Promise<void>;

    // State validation
    validateState(): Promise<StateValidationResult>;
    getStateHealth(): Promise<StateHealthReport>;
}

/**
 * Plan-specific state management
 */
export interface PlanStateManager {
    // Plan lifecycle
    startPlan(planId: string, planData: PlanData): Promise<void>;
    completePlan(planId: string, result: PlanResult): Promise<void>;
    failPlan(planId: string, error: PlanError): Promise<void>;

    // Plan state queries
    getCurrentPlan(): Promise<ActivePlanState | null>;
    getPlanHistory(): Promise<PlanHistoryEntry[]>;
    getPlanMetrics(): Promise<PlanMetrics>;

    // Plan state modifications
    updatePlanProgress(planId: string, progress: PlanProgress): Promise<void>;
    addPlanStep(planId: string, step: PlanStep): Promise<void>;
    markStepCompleted(
        planId: string,
        stepId: string,
        result: StepResult,
    ): Promise<void>;

    // Replan management
    initiatReplan(context: ReplanContext): Promise<string>;
    trackReplanAttempt(replanId: string, attempt: ReplanAttempt): Promise<void>;
}

/**
 * Checkpoint management for state recovery
 */
export interface CheckpointManager {
    // Checkpoint operations
    createCheckpoint(
        name?: string,
        metadata?: CheckpointMetadata,
    ): Promise<Checkpoint>;
    restoreCheckpoint(checkpointId: string): Promise<void>;
    deleteCheckpoint(checkpointId: string): Promise<void>;

    // Checkpoint queries
    listCheckpoints(): Promise<CheckpointSummary[]>;
    getCheckpoint(checkpointId: string): Promise<Checkpoint | null>;
    findCheckpointsByPhase(phase: ExecutionPhase): Promise<CheckpointSummary[]>;

    // Automatic checkpointing
    enableAutoCheckpoint(config: AutoCheckpointConfig): Promise<void>;
    disableAutoCheckpoint(): Promise<void>;

    // Checkpoint validation
    validateCheckpoint(
        checkpointId: string,
    ): Promise<CheckpointValidationResult>;
}

/**
 * State transition management with validation and hooks
 */
export interface StateTransitionManager {
    // Transition registration
    registerTransition(
        from: ExecutionPhase,
        to: ExecutionPhase,
        validator: TransitionValidator,
    ): void;
    registerPreTransitionHook(
        phase: ExecutionPhase,
        hook: PreTransitionHook,
    ): void;
    registerPostTransitionHook(
        phase: ExecutionPhase,
        hook: PostTransitionHook,
    ): void;

    // Transition execution
    executeTransition(
        to: ExecutionPhase,
        metadata?: StateTransitionMetadata,
    ): Promise<TransitionResult>;
    validateTransition(
        from: ExecutionPhase,
        to: ExecutionPhase,
    ): Promise<TransitionValidationResult>;

    // Transition history
    getTransitionHistory(): Promise<TransitionHistoryEntry[]>;
    getLastTransition(): Promise<TransitionHistoryEntry | null>;

    // Rollback capabilities
    rollbackToPhase(targetPhase: ExecutionPhase): Promise<void>;
    rollbackToCheckpoint(checkpointId: string): Promise<void>;
}

// ===============================================
// 📊 STATE DATA STRUCTURES
// ===============================================

/**
 * Complete state snapshot for persistence
 */
export interface StateSnapshot {
    id: string;
    sessionId: string;
    agentId: string;
    timestamp: number;
    phase: ExecutionPhase;

    // State data layers
    execution: ExecutionStateData;
    planning: PlanningStateData;
    memory: MemoryStateData;

    // Metadata
    version: string;
    checksum: string;
    metadata: Record<string, unknown>;
}

/**
 * Execution state data
 */
export interface ExecutionStateData {
    currentPhase: ExecutionPhase;
    previousPhase: ExecutionPhase | null;
    phaseStartTime: number;
    totalExecutionTime: number;

    // Current execution context
    activeExecution: PlanExecution | null;
    executionHistory: PlanExecution[];

    // Step tracking
    stepRegistry: StepExecutionRegistry;

    // Error state
    lastError: ExecutionError | null;
    errorCount: number;
    recoveryAttempts: number;
}

/**
 * Planning state data
 */
export interface PlanningStateData {
    activePlan: ActivePlanState | null;
    planHistory: PlanHistoryEntry[];

    // Replan tracking
    replanCount: number;
    lastReplanReason: string | null;
    replanContext: ReplanContext | null;

    // Plan performance
    metrics: PlanMetrics;
}

/**
 * Memory state data
 */
export interface MemoryStateData {
    shortTerm: ShortTermMemoryState;
    longTerm: LongTermMemoryState;
    episodic: EpisodicMemoryState;

    // Memory statistics
    totalMemoryItems: number;
    memoryUtilization: number;
    lastCleanupTime: number;
}

/**
 * Active plan state
 */
export interface ActivePlanState {
    planId: string;
    planType: string;
    startTime: number;
    estimatedDuration?: number;

    // Plan structure
    steps: PlanStep[];
    currentStepIndex: number;
    completedSteps: string[];
    failedSteps: string[];

    // Plan context
    originalIntent: string;
    planningContext: Record<string, unknown>;

    // Progress tracking
    progress: PlanProgress;
    status: PlanStatus;
}

/**
 * Plan execution step
 */
export interface PlanStep {
    id: string;
    type: PlanStepType;
    name: string;
    description: string;

    // Step configuration
    action: AgentAction;
    expectedOutput?: string;
    dependencies: string[];

    // Execution state
    status: StepStatus;
    startTime?: number;
    endTime?: number;
    duration?: number;

    // Results
    result?: StepResult;
    error?: StepError;

    // Retry configuration
    maxRetries: number;
    currentRetries: number;
}

/**
 * Plan progress tracking
 */
export interface PlanProgress {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    skippedSteps: number;

    percentComplete: number;
    estimatedTimeRemaining?: number;

    // Progress milestones
    milestones: ProgressMilestone[];
    currentMilestone?: string;
}

// ===============================================
// 🏷️ STATE ENUMS AND TYPES
// ===============================================

export type PlanStatus =
    | 'pending'
    | 'active'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'replanning';

export type StepStatus =
    | 'pending'
    | 'active'
    | 'completed'
    | 'failed'
    | 'skipped'
    | 'retrying';

export type PlanStepType =
    | 'analysis'
    | 'tool_call'
    | 'decision'
    | 'validation'
    | 'synthesis'
    | 'delegation';

export type CheckpointTrigger =
    | 'manual'
    | 'phase_change'
    | 'plan_complete'
    | 'error_recovery'
    | 'time_interval'
    | 'memory_threshold';

// ===============================================
// 🔧 CONFIGURATION INTERFACES
// ===============================================

/**
 * State transition metadata
 */
export interface StateTransitionMetadata {
    reason: string;
    triggeredBy: string;
    timestamp: number;
    previousPhase: ExecutionPhase;
    context?: Record<string, unknown>;
}

/**
 * Auto-checkpoint configuration
 */
export interface AutoCheckpointConfig {
    enabled: boolean;
    triggers: CheckpointTrigger[];
    interval?: number; // milliseconds
    maxCheckpoints: number;
    retentionPolicy: CheckpointRetentionPolicy;
    compression: boolean;
}

/**
 * Checkpoint retention policy
 */
export interface CheckpointRetentionPolicy {
    maxAge: number; // milliseconds
    maxCount: number;
    keepMilestones: boolean;
    keepErrorRecoveryPoints: boolean;
}

/**
 * Checkpoint metadata
 */
export interface CheckpointMetadata {
    name?: string;
    description?: string;
    trigger: CheckpointTrigger;
    milestone: boolean;
    tags: string[];
    userDefined: boolean;
}

// ===============================================
// 📈 METRICS AND ANALYSIS
// ===============================================

/**
 * Plan execution metrics
 */
export interface PlanMetrics {
    totalPlans: number;
    completedPlans: number;
    failedPlans: number;
    averagePlanDuration: number;

    // Step metrics
    totalSteps: number;
    averageStepsPerPlan: number;
    stepSuccessRate: number;

    // Replan metrics
    replanRate: number;
    averageReplanAttempts: number;

    // Performance metrics
    planningTime: number;
    executionTime: number;
    waitingTime: number;
}

/**
 * State health report
 */
export interface StateHealthReport {
    overall: HealthStatus;
    components: StateComponentHealth[];

    // Resource utilization
    memoryUsage: number;
    storageUsage: number;

    // Performance indicators
    stateTransitionLatency: number;
    checkpointLatency: number;

    // Recommendations
    recommendations: string[];
    warnings: string[];
}

/**
 * State component health
 */
export interface StateComponentHealth {
    component: string;
    status: HealthStatus;
    metrics: Record<string, number>;
    lastCheck: number;
    issues: string[];
}

export type HealthStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';

// ===============================================
// 🔄 VALIDATION AND RESULTS
// ===============================================

/**
 * State validation result
 */
export interface StateValidationResult {
    isValid: boolean;
    errors: StateValidationError[];
    warnings: StateValidationWarning[];

    // Component validation
    executionState: ComponentValidationResult;
    planningState: ComponentValidationResult;
    memoryState: ComponentValidationResult;
}

/**
 * Component validation result
 */
export interface ComponentValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    metadata?: Record<string, unknown>;
}

/**
 * State validation error
 */
export interface StateValidationError {
    code: string;
    message: string;
    component: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    details?: Record<string, unknown>;
}

/**
 * State validation warning
 */
export interface StateValidationWarning {
    code: string;
    message: string;
    component: string;
    impact: string;
    suggestion?: string;
}

/**
 * Transition validation result
 */
export interface TransitionValidationResult {
    canTransition: boolean;
    blockers: TransitionBlocker[];
    warnings: TransitionWarning[];
    requiredActions: string[];
}

/**
 * Transition blocker
 */
export interface TransitionBlocker {
    reason: string;
    component: string;
    severity: 'blocking' | 'warning';
    resolution?: string;
}

/**
 * Transition warning
 */
export interface TransitionWarning {
    message: string;
    impact: string;
    recommendation?: string;
}

// ===============================================
// 🎯 SUPPORTING INTERFACES
// ===============================================

/**
 * Memory state snapshots
 */
export interface ShortTermMemoryState {
    items: MemoryItem[];
    capacity: number;
    utilizationPercent: number;
}

export interface LongTermMemoryState {
    itemCount: number;
    categories: Record<string, number>;
    lastIndexUpdate: number;
}

export interface EpisodicMemoryState {
    episodes: EpisodeState[];
    currentEpisode?: string;
    totalEvents: number;
}

export interface EpisodeState {
    id: string;
    startTime: number;
    endTime?: number;
    eventCount: number;
    summary: string;
}

export interface MemoryItem {
    id: string;
    content: string;
    timestamp: number;
    type: string;
    metadata: Record<string, unknown>;
}

/**
 * Plan data structures
 */
export interface PlanData {
    id: string;
    type: string;
    intent: string;
    context: Record<string, unknown>;
    steps: PlanStep[];
    estimatedDuration?: number;
}

export interface PlanResult {
    success: boolean;
    result: unknown;
    duration: number;
    stepsExecuted: number;
    metadata: Record<string, unknown>;
}

export interface PlanError {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    recoverable: boolean;
}

export interface PlanHistoryEntry {
    planId: string;
    type: string;
    startTime: number;
    endTime?: number;
    status: PlanStatus;
    result?: PlanResult;
    error?: PlanError;
}

export interface ReplanAttempt {
    attemptId: string;
    replanId: string;
    timestamp: number;
    reason: string;
    strategy: string;
    result: 'success' | 'failure' | 'pending';
}

/**
 * Step execution results
 */
export interface StepResult {
    success: boolean;
    output: unknown;
    duration: number;
    toolCalls?: ToolCall[];
    metadata: Record<string, unknown>;
}

export interface StepError {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    recoverable: boolean;
    suggestedAction?: string;
}

export interface ToolCall {
    toolName: string;
    input: unknown;
    output: unknown;
    success: boolean;
    duration: number;
    error?: string;
}

/**
 * Progress tracking
 */
export interface ProgressMilestone {
    id: string;
    name: string;
    description: string;
    targetStep: number;
    achieved: boolean;
    achievedAt?: number;
}

/**
 * Checkpoint structures
 */
export interface Checkpoint {
    id: string;
    name?: string;
    timestamp: number;
    phase: ExecutionPhase;

    // State data
    stateSnapshot: StateSnapshot;

    // Metadata
    metadata: CheckpointMetadata;
    size: number;
    compressed: boolean;
}

export interface CheckpointSummary {
    id: string;
    name?: string;
    timestamp: number;
    phase: ExecutionPhase;
    size: number;
    metadata: CheckpointMetadata;
}

export interface CheckpointValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    canRestore: boolean;
}

/**
 * Transition management
 */
export interface TransitionResult {
    success: boolean;
    fromPhase: ExecutionPhase;
    toPhase: ExecutionPhase;
    duration: number;
    metadata: StateTransitionMetadata;
}

export interface TransitionHistoryEntry {
    fromPhase: ExecutionPhase;
    toPhase: ExecutionPhase;
    timestamp: number;
    duration: number;
    success: boolean;
    metadata: StateTransitionMetadata;
}

/**
 * Execution errors
 */
export interface ExecutionError {
    code: string;
    message: string;
    phase: ExecutionPhase;
    timestamp: number;
    details?: Record<string, unknown>;
    stackTrace?: string;
    recoverable: boolean;
}

// ===============================================
// 🎪 HOOKS AND VALIDATORS
// ===============================================

/**
 * Transition validation function
 */
export type TransitionValidator = (
    from: ExecutionPhase,
    to: ExecutionPhase,
    metadata?: StateTransitionMetadata,
) => Promise<TransitionValidationResult>;

/**
 * Pre-transition hook
 */
export type PreTransitionHook = (
    from: ExecutionPhase,
    to: ExecutionPhase,
    metadata?: StateTransitionMetadata,
) => Promise<void>;

/**
 * Post-transition hook
 */
export type PostTransitionHook = (
    from: ExecutionPhase,
    to: ExecutionPhase,
    result: TransitionResult,
) => Promise<void>;
