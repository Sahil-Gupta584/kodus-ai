/**
 * 🎯 SHARED PLANNING TYPES
 *
 * Simple shared types to eliminate conflicts between planning files.
 * Contains only what's needed to fix the current type conflicts.
 */

import type { AgentAction } from './agent-types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 CORE SHARED TYPES (resolves conflicts)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Planning step status
 */
export type StepStatus =
    | 'pending'
    | 'blocked'
    | 'executing'
    | 'completed'
    | 'failed'
    | 'skipped'
    | 'cancelled';

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
    status:
        | 'planning'
        | 'executing'
        | 'completed'
        | 'failed'
        | 'replanning'
        | 'waiting_input';
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
    metrics?: {
        memoryUsage?: number;
        cpuTime?: number;
        ioOperations?: number;
        networkCalls?: number;
    };
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
        if (step.status !== 'pending') return false;
        if (!step.dependencies || step.dependencies.length === 0) return true;

        return step.dependencies.every((depId) => {
            const depStep = plan.steps.find((s) => s.id === depId);
            return depStep?.status === 'completed';
        });
    });
}

/**
 * Check if plan is complete
 */
export function isPlanComplete(plan: ExecutionPlan): boolean {
    return plan.steps.every(
        (step) =>
            step.status === 'completed' ||
            step.status === 'skipped' ||
            (step.optional && step.status === 'failed'),
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
    const completed = plan.steps.filter((s) => s.status === 'completed').length;
    const failed = plan.steps.filter((s) => s.status === 'failed').length;
    const skipped = plan.steps.filter((s) => s.status === 'skipped').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, failed, skipped, percentage };
}
