import type {
    AgentAction,
    ActionResult,
    PlannerExecutionContext,
} from '../../planning/planner-factory.js';
import type {
    ExecutionPlan,
    PlanStep,
    StepExecutionResult,
    PlanExecutionResult,
} from '../../../core/types/planning-shared.js';
import { getReadySteps } from '../../../core/types/planning-shared.js';

interface PlanExecutorConfig {
    enableReWOO?: boolean;
    maxRetries?: number;
    maxExecutionRounds?: number;
}

interface WrappedToolResult {
    result: {
        isError?: boolean;
        content: Array<{
            type: string;
            text: string;
        }>;
    };
}

interface InnerToolResult {
    successful?: boolean;
    error?: string;
    data?: Record<string, unknown>;
}

interface PlanSignals {
    needs?: string[];
    noDiscoveryPath?: string[];
    errors?: string[];
    suggestedNextStep?: string;
}

interface StepAnalysis {
    success: boolean;
    shouldReplan: boolean;
}

interface ExecutionSummary {
    successfulSteps: string[];
    failedSteps: string[];
    skippedSteps: string[];
    allStepsProcessed: boolean;
    hasNoMoreExecutableSteps: boolean;
}

export class PlanExecutor {
    private readonly maxExecutionRounds: number;

    constructor(
        private readonly act: (action: AgentAction) => Promise<ActionResult>,
        private readonly resolveArgs: (
            rawArgs: Record<string, unknown>,
            stepList: PlanStep[],
            context: PlannerExecutionContext,
        ) => Promise<{ args: Record<string, unknown>; missing: string[] }>,
        private readonly config: PlanExecutorConfig = {},
    ) {
        this.maxExecutionRounds = config.maxExecutionRounds ?? 10;
    }

    async run(
        plan: ExecutionPlan,
        context: PlannerExecutionContext,
    ): Promise<PlanExecutionResult> {
        const startTime = Date.now();

        this.normalizePlanForExecution(plan);
        await this.resumeIfWaitingInput(plan, context);

        const signals = this.extractSignals(plan);
        const hasSignalsProblems = this.hasSignalsProblems(signals);

        await this.emitSessionEvent(
            context,
            'plan.execution.started',
            { planId: plan.id },
            {
                type: 'plan_started',
                at: Date.now(),
                totalSteps: plan.steps.length,
                hasSignalsProblems,
                signals,
            },
        );

        const executedResults = await this.executeAllPossibleSteps(
            plan,
            context,
        );
        const executionTime = Date.now() - startTime;

        const summary = this.analyzeExecutionResults(plan, executedResults);
        const { resultType, feedback } = this.determineResultType(
            plan,
            summary,
            hasSignalsProblems,
            signals,
        );

        await this.emitCompletionEvent(context, plan.id, {
            executionTime,
            resultType,
            summary,
            hasSignalsProblems,
        });

        const replanContext = this.buildReplanContext(
            resultType,
            executedResults,
            summary,
            hasSignalsProblems,
            signals,
        );

        return {
            type: resultType,
            planId: plan.id,
            strategy: plan.strategy,
            totalSteps: plan.steps.length,
            executedSteps: executedResults,
            successfulSteps: summary.successfulSteps,
            failedSteps: summary.failedSteps,
            skippedSteps: summary.skippedSteps,
            hasSignalsProblems,
            signals,
            executionTime,
            feedback,
            replanContext,
        };
    }

    private normalizePlanForExecution(plan: ExecutionPlan): void {
        let firstPendingIndex = -1;

        for (let stepIndex = 0; stepIndex < plan.steps.length; stepIndex++) {
            const step = plan.steps[stepIndex];
            if (!step) continue;

            if (step.status === 'executing') {
                step.status = 'pending';
            }

            if (firstPendingIndex === -1 && step.status === 'pending') {
                firstPendingIndex = stepIndex;
            }
        }

        if (firstPendingIndex >= 0) {
            plan.currentStepIndex = firstPendingIndex;
        }
    }

    private async emitSessionEvent(
        context: PlannerExecutionContext,
        type: string,
        input: Record<string, unknown>,
        details?: Record<string, unknown>,
    ): Promise<void> {
        try {
            await context.agentContext?.session.addEntry(
                { type, ...input },
                details ?? {},
            );
        } catch {
            // Silent fail for session events
        }
    }

    private async resumeIfWaitingInput(
        plan: ExecutionPlan,
        context: PlannerExecutionContext,
    ): Promise<void> {
        if (plan.status !== 'waiting_input') return;

        const nextPendingStep = plan.steps.find(
            (step) => step.status === 'pending',
        );

        if (nextPendingStep?.arguments) {
            const argumentResolution = await this.resolveArgs(
                nextPendingStep.arguments,
                plan.steps,
                context,
            );

            if (argumentResolution.missing.length === 0) {
                plan.status = 'executing';
            }
        } else {
            plan.status = 'executing';
        }

        await this.emitSessionEvent(
            context,
            'plan.status.changed',
            { planId: plan.id },
            {
                type: 'status_changed',
                from: 'waiting_input',
                to: plan.status,
                at: Date.now(),
            },
        );
    }

    private extractSignals(plan: ExecutionPlan): PlanSignals | undefined {
        return plan.metadata?.signals as PlanSignals | undefined;
    }

    private hasSignalsProblems(signals: PlanSignals | undefined): boolean {
        if (!signals) return false;

        return (
            (signals.needs?.length || 0) > 0 ||
            (signals.noDiscoveryPath?.length || 0) > 0 ||
            (signals.errors?.length || 0) > 0 ||
            !!signals.suggestedNextStep
        );
    }

    private async executeAllPossibleSteps(
        plan: ExecutionPlan,
        context: PlannerExecutionContext,
    ): Promise<StepExecutionResult[]> {
        const executedResults: StepExecutionResult[] = [];
        let executionRounds = 0;

        while (executionRounds < this.maxExecutionRounds) {
            const readySteps = getReadySteps(plan);

            if (readySteps.length === 0) break;

            for (const step of readySteps) {
                const stepResult = await this.executeStepSafe(
                    plan,
                    step,
                    context,
                );
                executedResults.push(stepResult);
            }

            executionRounds++;
        }

        return executedResults;
    }

    private async executeStepSafe(
        plan: ExecutionPlan,
        step: PlanStep,
        context: PlannerExecutionContext,
    ): Promise<StepExecutionResult> {
        const startTime = Date.now();

        try {
            const argumentResolution = await this.resolveStepArguments(
                step,
                plan,
                context,
            );

            if (argumentResolution.missing.length > 0) {
                return this.createStepResult(step, {
                    success: false,
                    error: `Missing inputs: ${argumentResolution.missing.join(', ')}`,
                    startTime,
                });
            }

            step.status = 'executing';
            await this.emitStepStartedEvent(context, plan.id, step);

            const result = await this.executeStepAction(step);
            const analysis = this.analyzeStepResult(result);

            step.status = analysis.success ? 'completed' : 'failed';
            step.result =
                result.type === 'tool_result' ? result.content : result;

            await this.emitStepFinishedEvent(
                context,
                plan.id,
                step,
                analysis.success,
            );

            return this.createStepResult(step, {
                result,
                success: analysis.success,
                error: analysis.success
                    ? undefined
                    : result.type === 'error'
                      ? result.error
                      : 'Step failed',
                startTime,
            });
        } catch (error) {
            step.status = 'failed';
            const errorMsg =
                error instanceof Error ? error.message : String(error);

            return this.createStepResult(step, {
                success: false,
                error: errorMsg,
                startTime,
            });
        }
    }

    private async resolveStepArguments(
        step: PlanStep,
        plan: ExecutionPlan,
        context: PlannerExecutionContext,
    ): Promise<{ args: Record<string, unknown>; missing: string[] }> {
        if (!step.arguments) {
            return { args: {}, missing: [] };
        }

        const resolution = await this.resolveArgs(
            step.arguments,
            plan.steps,
            context,
        );

        // ✅ ADDITIONAL CHECK: Detect invalid values even after resolution
        const invalidValues = [
            'NOT_FOUND',
            'MISSING',
            'INVALID',
            'ERROR',
            'NULL',
            'UNDEFINED',
        ];
        const additionalMissing: string[] = [];

        const checkForInvalidValues = (obj: unknown): void => {
            if (typeof obj === 'string') {
                for (const invalidValue of invalidValues) {
                    if (
                        obj === invalidValue ||
                        obj.startsWith(invalidValue + ':')
                    ) {
                        additionalMissing.push(obj);
                        break;
                    }
                }
            } else if (Array.isArray(obj)) {
                obj.forEach(checkForInvalidValues);
            } else if (obj && typeof obj === 'object') {
                Object.values(obj as Record<string, unknown>).forEach(
                    checkForInvalidValues,
                );
            }
        };

        checkForInvalidValues(resolution.args);

        step.arguments = resolution.args;
        return {
            args: resolution.args,
            missing: [...resolution.missing, ...additionalMissing],
        };
    }

    private async executeStepAction(step: PlanStep): Promise<ActionResult> {
        if (!step.tool || step.tool === 'none') {
            return { type: 'final_answer', content: step.description };
        }

        return await this.act({
            type: 'tool_call',
            toolName: step.tool,
            input: step.arguments ?? {},
        } as AgentAction);
    }

    private createStepResult(
        step: PlanStep,
        options: {
            result?: ActionResult;
            success: boolean;
            error?: string;
            startTime: number;
        },
    ): StepExecutionResult {
        const { result, success, error, startTime } = options;
        const executedAt = Date.now();

        return {
            stepId: step.id,
            step,
            ...(result && { result }),
            success,
            ...(error && { error }),
            executedAt,
            duration: executedAt - startTime,
        };
    }

    private async emitStepStartedEvent(
        context: PlannerExecutionContext,
        planId: string,
        step: PlanStep,
    ): Promise<void> {
        await this.emitSessionEvent(
            context,
            'plan.step.started',
            { planId, stepId: step.id },
            {
                type: 'step_started',
                at: Date.now(),
                description: step.description,
                tool: step.tool,
                rewooMode: this.config.enableReWOO || false,
            },
        );
    }

    private async emitStepFinishedEvent(
        context: PlannerExecutionContext,
        planId: string,
        step: PlanStep,
        success: boolean,
    ): Promise<void> {
        await this.emitSessionEvent(
            context,
            'plan.step.finished',
            { planId, stepId: step.id },
            {
                type: 'step_finished',
                at: Date.now(),
                success,
                rewooMode: this.config.enableReWOO || false,
            },
        );
    }

    private analyzeStepResult(result: ActionResult): StepAnalysis {
        // ✅ DEBUG: Log para entender a estrutura do resultado
        console.log('🔍 [PLAN-EXECUTOR] Analyzing step result:', {
            resultType: result.type,
            isWrapped: this.isWrappedToolResult(result),
            resultStructure: JSON.stringify(result, null, 2).substring(0, 500),
        });

        if (this.isWrappedToolResult(result)) {
            console.log('🔍 [PLAN-EXECUTOR] Using analyzeWrappedToolResult');
            return this.analyzeWrappedToolResult(result);
        }

        if (result.type === 'error') {
            console.log('🔍 [PLAN-EXECUTOR] Using analyzeErrorResult');
            return this.analyzeErrorResult(result);
        }

        if (result.type === 'tool_result') {
            console.log('🔍 [PLAN-EXECUTOR] Using analyzeToolResult');
            return this.analyzeToolResult(result);
        }

        if (result.type === 'final_answer') {
            console.log('🔍 [PLAN-EXECUTOR] Final answer - success: true');
            return { success: true, shouldReplan: false };
        }

        console.log('🔍 [PLAN-EXECUTOR] Default case - success: true');
        return { success: true, shouldReplan: false };
    }

    private isWrappedToolResult(result: unknown): result is WrappedToolResult {
        return (
            result !== null &&
            typeof result === 'object' &&
            'result' in result &&
            result.result !== null &&
            typeof result.result === 'object' &&
            'content' in result.result &&
            Array.isArray(result.result.content) &&
            result.result.content.length > 0 &&
            result.result.content[0]?.type === 'text' &&
            typeof result.result.content[0]?.text === 'string'
        );
    }

    private analyzeWrappedToolResult(result: WrappedToolResult): StepAnalysis {
        try {
            if (result.result.isError === true) {
                return { success: false, shouldReplan: true };
            }

            const innerJsonString = result.result.content[0]?.text;
            if (!innerJsonString) {
                return { success: false, shouldReplan: true };
            }
            const innerResult = JSON.parse(innerJsonString) as InnerToolResult;

            if (innerResult.successful === false) {
                const errorMsg = innerResult.error || 'Tool execution failed';
                const shouldReplan = this.shouldReplanForError(errorMsg);
                return { success: false, shouldReplan };
            }

            if (!innerResult.data || this.isEmptyObject(innerResult.data)) {
                return { success: false, shouldReplan: true };
            }

            return { success: true, shouldReplan: false };
        } catch {
            return { success: false, shouldReplan: true };
        }
    }

    private analyzeErrorResult(
        result: ActionResult & { type: 'error' },
    ): StepAnalysis {
        const errorContent =
            typeof result.error === 'string'
                ? result.error
                : JSON.stringify(result.error);

        const shouldReplan = this.shouldReplanForError(errorContent);
        return { success: false, shouldReplan };
    }

    private analyzeToolResult(
        result: ActionResult & { type: 'tool_result' },
    ): StepAnalysis {
        const hasValidOutput =
            result.content !== null &&
            result.content !== undefined &&
            (typeof result.content === 'string'
                ? result.content.trim().length > 0
                : typeof result.content === 'object' && result.content !== null
                  ? !this.isEmptyObject(
                        result.content as Record<string, unknown>,
                    )
                  : true);

        return { success: hasValidOutput, shouldReplan: false };
    }

    private shouldReplanForError(errorMessage: string): boolean {
        const replanTriggers = [
            'tool not found',
            'tool unavailable',
            'missing required parameter',
            'authentication failed',
            'permission denied',
            'quota exceeded',
            'service unavailable',
            'timeout',
            'rate limit',
            'not found',
            'neither a page nor a database',
            'invalid',
        ];

        return replanTriggers.some((trigger) =>
            errorMessage.toLowerCase().includes(trigger),
        );
    }

    private isEmptyObject(obj: Record<string, unknown>): boolean {
        return Object.keys(obj).length === 0;
    }

    private analyzeExecutionResults(
        plan: ExecutionPlan,
        executedResults: StepExecutionResult[],
    ): ExecutionSummary {
        const successfulSteps = executedResults
            .filter((r) => r.success)
            .map((r) => r.stepId);
        const failedSteps = executedResults
            .filter((r) => !r.success)
            .map((r) => r.stepId);
        const allStepIds = plan.steps.map((s) => s.id);
        const skippedSteps = allStepIds.filter(
            (id) => !successfulSteps.includes(id) && !failedSteps.includes(id),
        );

        const allStepsProcessed = plan.steps.every(
            (s) =>
                s.status === 'completed' ||
                s.status === 'failed' ||
                s.status === 'skipped',
        );

        const hasNoMoreExecutableSteps = plan.steps.every(
            (s) => s.status !== 'pending' && s.status !== 'executing',
        );

        return {
            successfulSteps,
            failedSteps,
            skippedSteps,
            allStepsProcessed,
            hasNoMoreExecutableSteps,
        };
    }

    private determineResultType(
        plan: ExecutionPlan,
        summary: ExecutionSummary,
        hasSignalsProblems: boolean,
        signals: PlanSignals | undefined,
    ): { resultType: PlanExecutionResult['type']; feedback: string } {
        if (hasSignalsProblems) {
            return this.handleSignalsProblems(summary, signals);
        }

        if (
            summary.failedSteps.length === 0 &&
            summary.successfulSteps.length === plan.steps.length
        ) {
            return {
                resultType: 'execution_complete',
                feedback: `Plan executed successfully. Completed ${summary.successfulSteps.length}/${plan.steps.length} steps.`,
            };
        }

        if (
            summary.failedSteps.length > 0 ||
            (summary.allStepsProcessed && summary.skippedSteps.length > 0)
        ) {
            return {
                resultType: 'needs_replan',
                feedback: `Plan needs replanning. Success: ${summary.successfulSteps.length}, Failed: ${summary.failedSteps.length}, Skipped: ${summary.skippedSteps.length}`,
            };
        }

        if (
            summary.hasNoMoreExecutableSteps &&
            summary.successfulSteps.length < plan.steps.length
        ) {
            return {
                resultType: 'deadlock',
                feedback: 'Execution deadlock: no more steps can be executed',
            };
        }

        return {
            resultType: 'execution_complete',
            feedback: `Execution finished. Success: ${summary.successfulSteps.length}, Failed: ${summary.failedSteps.length}, Skipped: ${summary.skippedSteps.length}`,
        };
    }

    private handleSignalsProblems(
        summary: ExecutionSummary,
        signals: PlanSignals | undefined,
    ): { resultType: PlanExecutionResult['type']; feedback: string } {
        // ✅ SIMPLE: Executor just reports signals, Planner decides what to do
        return {
            resultType: 'needs_replan',
            feedback: `Plan needs replanning due to signals. Success: ${summary.successfulSteps.length}, Failed: ${summary.failedSteps.length}, Signals: ${JSON.stringify(signals)}`,
        };
    }

    private async emitCompletionEvent(
        context: PlannerExecutionContext,
        planId: string,
        details: {
            executionTime: number;
            resultType: PlanExecutionResult['type'];
            summary: ExecutionSummary;
            hasSignalsProblems: boolean;
        },
    ): Promise<void> {
        try {
            await context.agentContext?.session.addEntry(
                {
                    type: 'plan.execution.completed',
                    planId,
                },
                {
                    type: 'plan_completed',
                    at: Date.now(),
                    executionTime: details.executionTime,
                    resultType: details.resultType,
                    successfulSteps: details.summary.successfulSteps.length,
                    failedSteps: details.summary.failedSteps.length,
                    skippedSteps: details.summary.skippedSteps.length,
                    hasSignalsProblems: details.hasSignalsProblems,
                },
            );
        } catch {
            // Silent fail for completion events
        }
    }

    private buildReplanContext(
        resultType: PlanExecutionResult['type'],
        executedResults: StepExecutionResult[],
        summary: ExecutionSummary,
        hasSignalsProblems: boolean,
        signals: PlanSignals | undefined,
    ): PlanExecutionResult['replanContext'] {
        if (
            resultType !== 'needs_replan' ||
            (summary.failedSteps.length === 0 && !hasSignalsProblems)
        ) {
            return undefined;
        }

        const preservedSteps = executedResults.filter(
            (result) => result.success,
        );
        const failurePatterns = this.extractFailurePatterns(executedResults);
        const primaryCause = this.determinePrimaryCause(executedResults);

        return {
            preservedSteps,
            failurePatterns: [...new Set(failurePatterns)],
            primaryCause,
            suggestedStrategy: 'plan-execute',
            contextForReplan: {
                successfulSteps: summary.successfulSteps,
                failedSteps: summary.failedSteps,
                skippedSteps: summary.skippedSteps,
                hasSignalsProblems,
                signals: signals || {},
            },
        };
    }

    private extractFailurePatterns(
        executedResults: StepExecutionResult[],
    ): string[] {
        return executedResults
            .filter((result) => !result.success && result.error)
            .map((result) => {
                const errorStr =
                    typeof result.error === 'string'
                        ? result.error
                        : JSON.stringify(result.error);
                return errorStr.toLowerCase();
            });
    }

    private determinePrimaryCause(
        executedResults: StepExecutionResult[],
    ): string {
        const firstFailure = executedResults.find(
            (result) => !result.success && result.error,
        );
        if (!firstFailure?.error) return 'Unknown failure';

        const errorStr =
            typeof firstFailure.error === 'string'
                ? firstFailure.error
                : JSON.stringify(firstFailure.error);

        const errorLower = errorStr.toLowerCase();

        if (errorLower.includes('invalid')) return 'Invalid input provided';
        if (errorLower.includes('not found')) return 'Resource not found';
        if (errorLower.includes('permission') || errorLower.includes('auth')) {
            return 'Permission or authentication error';
        }
        if (
            errorLower.includes('timeout') ||
            errorLower.includes('unavailable')
        ) {
            return 'Service unavailable or timeout';
        }

        return errorStr;
    }
}
