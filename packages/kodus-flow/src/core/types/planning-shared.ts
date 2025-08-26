import { AgentAction } from './agent-definition.js';

export const UNIFIED_STATUS = {
    // Estados básicos
    PENDING: 'pending',
    EXECUTING: 'executing',
    COMPLETED: 'completed',
    FAILED: 'failed',

    // Estados de controle
    REPLANNING: 'replanning',
    WAITING_INPUT: 'waiting_input',
    PAUSED: 'paused',
    CANCELLED: 'cancelled',
    SKIPPED: 'skipped',

    // Estados ReWOO
    REWRITING: 'rewriting',
    OBSERVING: 'observing',
    PARALLEL: 'parallel',

    // Estados de problema
    STAGNATED: 'stagnated',
    TIMEOUT: 'timeout',
    DEADLOCK: 'deadlock',

    // Estados de resposta final
    FINAL_ANSWER_RESULT: 'final_answer_result',
} as const;

export type UnifiedStatus =
    (typeof UNIFIED_STATUS)[keyof typeof UNIFIED_STATUS];

/**
 * Status transitions validation
 */
export const VALID_STATUS_TRANSITIONS: Record<UnifiedStatus, UnifiedStatus[]> =
    {
        [UNIFIED_STATUS.PENDING]: [
            UNIFIED_STATUS.EXECUTING,
            UNIFIED_STATUS.CANCELLED,
            UNIFIED_STATUS.SKIPPED,
        ],
        [UNIFIED_STATUS.EXECUTING]: [
            UNIFIED_STATUS.COMPLETED,
            UNIFIED_STATUS.FAILED,
            UNIFIED_STATUS.REPLANNING,
            UNIFIED_STATUS.WAITING_INPUT,
            UNIFIED_STATUS.PAUSED,
            UNIFIED_STATUS.CANCELLED,
            UNIFIED_STATUS.REWRITING,
            UNIFIED_STATUS.OBSERVING,
            UNIFIED_STATUS.PARALLEL,
            UNIFIED_STATUS.STAGNATED,
            UNIFIED_STATUS.TIMEOUT,
            UNIFIED_STATUS.DEADLOCK,
        ],
        [UNIFIED_STATUS.COMPLETED]: [], // Estado final
        [UNIFIED_STATUS.FAILED]: [
            UNIFIED_STATUS.REPLANNING,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.REPLANNING]: [
            UNIFIED_STATUS.EXECUTING,
            UNIFIED_STATUS.FAILED,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.WAITING_INPUT]: [
            UNIFIED_STATUS.EXECUTING,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.PAUSED]: [
            UNIFIED_STATUS.EXECUTING,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.CANCELLED]: [], // Estado final
        [UNIFIED_STATUS.SKIPPED]: [], // Estado final
        [UNIFIED_STATUS.REWRITING]: [
            UNIFIED_STATUS.EXECUTING,
            UNIFIED_STATUS.FAILED,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.OBSERVING]: [
            UNIFIED_STATUS.EXECUTING,
            UNIFIED_STATUS.FAILED,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.PARALLEL]: [
            UNIFIED_STATUS.EXECUTING,
            UNIFIED_STATUS.FAILED,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.STAGNATED]: [
            UNIFIED_STATUS.EXECUTING,
            UNIFIED_STATUS.FAILED,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.TIMEOUT]: [
            UNIFIED_STATUS.REPLANNING,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.DEADLOCK]: [
            UNIFIED_STATUS.REPLANNING,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.FINAL_ANSWER_RESULT]: [], // Estado final - resposta sintetizada
    };

/**
 * Validate status transition
 */
export function isValidStatusTransition(
    from: UnifiedStatus,
    to: UnifiedStatus,
): boolean {
    return VALID_STATUS_TRANSITIONS[from].includes(to);
}

// ===== EXISTING TYPES (UPDATED) =====

/**
 * Step status - now using unified status
 */
export type StepStatus = UnifiedStatus;

/**
 * Plan status - now using unified status
 */
export type PlanStatus = UnifiedStatus;

/**
 * Unified PlanStep interface (consolidates all conflicting definitions)
 */
export interface PlanStep {
    // Identity
    id: string;
    description: string;
    type?:
        | 'action'
        | 'decision'
        | 'verification'
        | 'delegation'
        | 'aggregation'
        | 'checkpoint';
    // Execution
    tool?: string;
    agent?: string;
    arguments?: Record<string, unknown>;

    // Dependencies
    dependencies?: string[];
    dependents?: string[];

    // Execution control
    status: StepStatus;
    parallel?: boolean;
    optional?: boolean;
    retry?: number;
    retryCount?: number;
    maxRetries?: number;

    // Results & timing
    result?: unknown;
    error?: string;
    startTime?: number;
    endTime?: number;
    duration?: number;

    // Metadata
    reasoning?: string;
    confidence?: number;
    metadata?: Record<string, unknown>;
}

/**
 * Plan execution signals (from planner output)
 */
export interface PlanSignals {
    needs?: string[];
    noDiscoveryPath?: string[];
    errors?: string[];
    suggestedNextStep?: string;
    confidence?: number;
    estimatedDuration?: number;
    riskLevel?: 'low' | 'medium' | 'high';
}

/**
 * Execution plan interface
 */
export interface ExecutionPlan {
    id: string;
    strategy: string;
    version?: string;
    goal: string;
    reasoning: string;
    steps: PlanStep[];
    status: UnifiedStatus;
    currentStepIndex: number;
    signals?: PlanSignals;
    createdAt: number;
    updatedAt: number;
    executionStartTime?: number;
    executionEndTime?: number;
    metadata?: Record<string, unknown>;
}

/**
 * Step execution result
 */
export interface StepExecutionResult {
    stepId: string;
    step: PlanStep;
    success: boolean;
    result?: unknown;
    error?: string;
    executedAt: number;
    duration: number;
    retryCount?: number;
}

/**
 * Plan execution result types
 */
export type PlanExecutionResultType =
    | 'execution_complete'
    | 'needs_replan'
    | 'deadlock'
    | 'cancelled'
    | 'timeout'
    | 'budget_exceeded';

/**
 * Complete plan execution result
 */
export interface PlanExecutionResult {
    type: PlanExecutionResultType;
    planId: string;
    strategy: string;
    totalSteps: number;
    executedSteps: StepExecutionResult[];
    successfulSteps: string[];
    failedSteps: string[];
    skippedSteps: string[];
    hasSignalsProblems: boolean;
    signals?: PlanSignals;
    executionTime: number;
    feedback: string;
    confidence?: number;
    replanContext?: {
        preservedSteps: StepExecutionResult[];
        failurePatterns: string[];
        primaryCause: string;
        suggestedStrategy: string;
        contextForReplan: Record<string, unknown>;
    };
}

/**
 * Replan policy configuration
 */
export interface ReplanPolicyConfig {
    maxReplans?: number; // ✅ SIMPLE: Unified replan limit
    toolUnavailable?: 'replan' | 'ask_user' | 'fail';
}

/**
 * Replan context data structure
 */
export interface ReplanContextData {
    preservedSteps: StepExecutionResult[];
    failurePatterns: string[];
    primaryCause: string;
    suggestedStrategy: string;
    contextForReplan: Record<string, unknown>;
}

/**
 * Structured replan context for planning optimization
 */
export interface ReplanContext {
    isReplan: boolean;
    previousPlan: {
        id: string;
        goal: string;
        strategy: string;
    };
    preservedSteps: unknown[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔧 UTILITY FUNCTIONS (simple, practical)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if action is execute_plan
 */
export function isExecutePlanAction(action: AgentAction | unknown): boolean {
    return (
        typeof action === 'object' &&
        action !== null &&
        'type' in action &&
        action.type === 'execute_plan'
    );
}

/**
 * Create step ID with consistent format
 */
export function createStepId(name: string): string {
    return name.startsWith('step-') ? name : `step-${name}`;
}

/**
 * Create plan ID with consistent format
 */
export function createPlanId(name: string): string {
    return name.startsWith('plan-') ? name : `plan-${name}`;
}

/**
 * Get ready steps (dependencies met)
 */
export function getReadySteps(plan: ExecutionPlan): PlanStep[] {
    return plan.steps.filter((step) => {
        if (step.status !== UNIFIED_STATUS.PENDING) return false;
        if (!step.dependencies || step.dependencies.length === 0) return true;

        // ✅ CORREÇÃO: Verificar se alguma dependência falhou
        return step.dependencies.every((depId) => {
            const depStep = plan.steps.find((s) => s.id === depId);
            // Se a dependência falhou, este step não pode ser executado
            if (depStep?.status === UNIFIED_STATUS.FAILED) {
                return false;
            }
            return depStep?.status === UNIFIED_STATUS.COMPLETED;
        });
    });
}

/**
 * Check if plan is complete
 */
export function isPlanComplete(plan: ExecutionPlan): boolean {
    return plan.steps.every(
        (step) =>
            step.status === UNIFIED_STATUS.COMPLETED ||
            step.status === UNIFIED_STATUS.SKIPPED ||
            (step.optional && step.status === UNIFIED_STATUS.FAILED),
    );
}

/**
 * Get plan progress
 */
export function getPlanProgress(plan: ExecutionPlan): {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    percentage: number;
} {
    const total = plan.steps.length;
    const completed = plan.steps.filter(
        (s) => s.status === UNIFIED_STATUS.COMPLETED,
    ).length;
    const failed = plan.steps.filter(
        (s) => s.status === UNIFIED_STATUS.FAILED,
    ).length;
    const skipped = plan.steps.filter(
        (s) => s.status === UNIFIED_STATUS.SKIPPED,
    ).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, failed, skipped, percentage };
}
