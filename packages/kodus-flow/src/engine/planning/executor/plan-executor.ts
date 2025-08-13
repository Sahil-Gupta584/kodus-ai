import type {
    AgentAction,
    ActionResult,
    ResultAnalysis,
    PlannerExecutionContext,
} from '../../planning/planner-factory.js';
import type {
    ExecutionPlan,
    PlanStep,
    StepExecutionResult,
    PlanExecutionResult,
} from '../../../core/types/planning-shared.js';
import { getReadySteps } from '../../../core/types/planning-shared.js';

export class PlanExecutor {
    constructor(
        private act: (action: AgentAction) => Promise<ActionResult>,
        private resolveArgs: (
            rawArgs: Record<string, unknown>,
            stepList: PlanStep[],
            context: PlannerExecutionContext,
        ) => Promise<{ args: Record<string, unknown>; missing: string[] }>,
        private config?: {
            enableReWOO?: boolean; // Use rule-based analysis instead of LLM
            maxRetries?: number;
        },
    ) {}

    private normalizePlanForExecution(plan: ExecutionPlan): void {
        // Reset orphan "executing" steps to "pending" to avoid deadlocks when delegating to executor
        let firstPendingIndex = -1;
        for (let stepIndex = 0; stepIndex < plan.steps.length; stepIndex++) {
            const stepCandidate = plan.steps[stepIndex];
            if (!stepCandidate) {
                continue;
            }

            if (stepCandidate.status === 'executing') {
                stepCandidate.status = 'pending';
            }

            if (
                firstPendingIndex === -1 &&
                stepCandidate.status === 'pending'
            ) {
                firstPendingIndex = stepIndex;
            }
        }

        if (firstPendingIndex >= 0) {
            plan.currentStepIndex = firstPendingIndex;
        }
    }

    // Emit a structured session event if session is available (best-effort)
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
        } catch {}
    }

    // Try to resume a plan paused by user input
    private async resumeIfWaitingInput(
        plan: ExecutionPlan,
        context: PlannerExecutionContext,
    ): Promise<void> {
        if (plan.status !== 'waiting_input') {
            return;
        }

        const nextPendingStep = plan.steps.find(
            (step) => step.status === 'pending',
        );

        if (nextPendingStep && nextPendingStep.arguments) {
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

    // 🚀 ReWOO Rule-based analysis (no LLM calls)
    private analyzeStepResult(result: ActionResult): {
        success: boolean;
        shouldReplan: boolean;
    } {
        // 🚀 NEW: Handle wrapped tool responses properly
        if (this.isWrappedToolResult(result)) {
            return this.analyzeWrappedToolResult(result);
        }

        // Legacy handling for direct ActionResult
        if (result.type === 'error') {
            const errorContent =
                typeof result.error === 'string'
                    ? result.error
                    : JSON.stringify(result.error);

            // Check if error suggests replanning
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
            ];

            const shouldReplan = replanTriggers.some((trigger) =>
                errorContent.toLowerCase().includes(trigger),
            );

            return { success: false, shouldReplan };
        }

        if (result.type === 'tool_result') {
            const hasValidOutput =
                result.content !== null &&
                result.content !== undefined &&
                (typeof result.content === 'string'
                    ? result.content.trim().length > 0
                    : typeof result.content === 'object' &&
                        result.content !== null
                      ? Object.keys(result.content as Record<string, unknown>)
                            .length > 0
                      : true);

            return { success: hasValidOutput, shouldReplan: false };
        }

        if (result.type === 'final_answer') {
            return { success: true, shouldReplan: false };
        }

        // Default: assume success
        return { success: true, shouldReplan: false };
    }

    // 🚀 NEW: Check if result is wrapped tool response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private isWrappedToolResult(result: any): boolean {
        return (
            result &&
            typeof result === 'object' &&
            result.result &&
            Array.isArray(result.result.content) &&
            result.result.content.length > 0 &&
            result.result.content[0].type === 'text' &&
            typeof result.result.content[0].text === 'string'
        );
    }

    // 🚀 NEW: Analyze wrapped tool results properly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private analyzeWrappedToolResult(result: any): {
        success: boolean;
        shouldReplan: boolean;
    } {
        try {
            // Check wrapper-level error flag
            if (result.result?.isError === true) {
                return { success: false, shouldReplan: true };
            }

            // Parse inner JSON from content[0].text
            const innerJsonString = result.result.content[0].text;
            const innerResult = JSON.parse(innerJsonString);

            // Check inner successful flag
            if (innerResult.successful === false) {
                const errorMsg = innerResult.error || 'Tool execution failed';

                const replanTriggers = [
                    'not found',
                    'neither a page nor a database',
                    'invalid',
                    'permission denied',
                    'authentication failed',
                    'quota exceeded',
                    'service unavailable',
                    'timeout',
                    'rate limit',
                ];

                const shouldReplan = replanTriggers.some((trigger) =>
                    errorMsg.toLowerCase().includes(trigger),
                );

                return { success: false, shouldReplan };
            }

            // Check if data is empty/null (might need replan)
            if (
                !innerResult.data ||
                (typeof innerResult.data === 'object' &&
                    Object.keys(innerResult.data).length === 0)
            ) {
                return { success: false, shouldReplan: true };
            }

            return { success: true, shouldReplan: false };
        } catch {
            // If we can't parse the inner JSON, treat as error
            return { success: false, shouldReplan: true };
        }
    }

    // 🚀 Execute single step without stopping execution (ReWOO style)
    private async executeStepSafe(
        plan: ExecutionPlan,
        step: PlanStep,
        context: PlannerExecutionContext,
        _executedResults: StepExecutionResult[],
    ): Promise<StepExecutionResult> {
        const startTime = Date.now();

        try {
            // 1. Resolve arguments from previous step results
            if (step.arguments) {
                const argumentResolution = await this.resolveArgs(
                    step.arguments,
                    plan.steps,
                    context,
                );

                step.arguments = argumentResolution.args;

                if (argumentResolution.missing.length > 0) {
                    return {
                        stepId: step.id,
                        step,
                        success: false,
                        error: `Missing inputs: ${argumentResolution.missing.join(', ')}`,
                        executedAt: Date.now(),
                        duration: Date.now() - startTime,
                    };
                }
            }

            // 2. Mark as executing and emit event
            step.status = 'executing';
            await this.emitSessionEvent(
                context,
                'plan.step.started',
                { planId: plan.id, stepId: step.id },
                {
                    type: 'step_started',
                    at: Date.now(),
                    description: step.description,
                    tool: step.tool,
                    rewooMode: this.config?.enableReWOO || false,
                },
            );

            // 3. Execute tool action
            const result: ActionResult =
                step.tool && step.tool !== 'none'
                    ? await this.act({
                          type: 'tool_call',
                          toolName: step.tool!,
                          input: step.arguments ?? {},
                      } as AgentAction)
                    : { type: 'final_answer', content: step.description };

            // 4. 🚀 Analyze result (ReWOO rule-based OR LLM fallback)
            const analysis = this.config?.enableReWOO
                ? this.analyzeStepResult(result)
                : { success: true, shouldReplan: false }; // Will use LLM later if needed

            // 5. Update step status and store result
            step.status = analysis.success ? 'completed' : 'failed';
            step.result =
                result.type === 'tool_result' ? result.content : result;

            await this.emitSessionEvent(
                context,
                'plan.step.finished',
                { planId: plan.id, stepId: step.id },
                {
                    type: 'step_finished',
                    at: Date.now(),
                    success: analysis.success,
                    rewooMode: this.config?.enableReWOO || false,
                },
            );

            return {
                stepId: step.id,
                step,
                result,
                success: analysis.success,
                error: analysis.success
                    ? undefined
                    : result.type === 'error'
                      ? result.error
                      : 'Step failed',
                executedAt: Date.now(),
                duration: Date.now() - startTime,
            };
        } catch (error) {
            step.status = 'failed';

            const errorMsg =
                error instanceof Error ? error.message : String(error);

            return {
                stepId: step.id,
                step,
                success: false,
                error: errorMsg,
                executedAt: Date.now(),
                duration: Date.now() - startTime,
            };
        }
    }

    // 🚀 NEW: Execute All Possible Steps, Then Replan
    async run(
        plan: ExecutionPlan,
        context: PlannerExecutionContext,
    ): Promise<PlanExecutionResult> {
        const startTime = Date.now();

        this.normalizePlanForExecution(plan);
        await this.resumeIfWaitingInput(plan, context);

        // Extract signals from plan metadata
        const signals = plan.metadata?.signals as
            | {
                  needs?: string[];
                  noDiscoveryPath?: string[];
                  errors?: string[];
                  suggestedNextStep?: string;
              }
            | undefined;

        // Check for immediate replan based on signals
        const hasSignalsProblems =
            (signals?.needs?.length || 0) > 0 ||
            (signals?.noDiscoveryPath?.length || 0) > 0 ||
            (signals?.errors?.length || 0) > 0 ||
            !!signals?.suggestedNextStep;

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

        const executedResults: StepExecutionResult[] = [];
        let executionRounds = 0;
        const maxRounds = 10; // Prevent infinite loops

        // 🚀 Execute ALL possible steps (multiple rounds for dependencies)
        while (executionRounds < maxRounds) {
            const readySteps = getReadySteps(plan);

            if (readySteps.length === 0) {
                // No more steps can be executed
                break;
            }

            // Execute all ready steps in this round
            const roundResults: StepExecutionResult[] = [];

            for (const step of readySteps) {
                const stepResult = await this.executeStepSafe(
                    plan,
                    step,
                    context,
                    executedResults,
                );
                roundResults.push(stepResult);
                executedResults.push(stepResult);
            }

            executionRounds++;
        }

        const executionTime = Date.now() - startTime;

        // Analyze final results
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

        // Check execution completion status
        const allStepsProcessed = plan.steps.every(
            (s) =>
                s.status === 'completed' ||
                s.status === 'failed' ||
                s.status === 'skipped',
        );
        const hasNoMoreExecutableSteps = plan.steps.every(
            (s) => s.status !== 'pending' && s.status !== 'executing',
        );

        // Determine result type
        let resultType: PlanExecutionResult['type'];
        let feedback: string;

        // 🎯 CORRIGIDO: Check signals FIRST, then execution status
        if (hasSignalsProblems) {
            // ✅ VERIFICAR LIMITE DE REPLANS ANTES DE REPLAN
            const replansCount = Number(
                (plan.metadata as Record<string, unknown>)?.replansCount ?? 0,
            );
            const maxReplans = 1; // ✅ PADRÃO DO EXECUTOR (configurável depois)

            if (replansCount >= maxReplans) {
                // ✅ LIMITE ATINGIDO - PARAR LOOP
                resultType = 'execution_complete';
                feedback = `Replan limit reached (${replansCount}/${maxReplans}). Cannot continue with missing inputs: ${JSON.stringify(signals?.needs)}`;
            } else {
                // ✅ AINDA PODE REPLAN
                resultType = 'needs_replan';
                feedback = `Plan needs replanning due to signals. Success: ${successfulSteps.length}, Failed: ${failedSteps.length}, Signals: ${JSON.stringify(signals)}`;
            }
        } else if (
            failedSteps.length === 0 &&
            successfulSteps.length === plan.steps.length
        ) {
            // Perfect execution - all steps completed successfully AND no signals
            resultType = 'execution_complete';
            feedback = `Plan executed successfully. Completed ${successfulSteps.length}/${plan.steps.length} steps.`;
        } else if (
            failedSteps.length > 0 ||
            (allStepsProcessed && skippedSteps.length > 0)
        ) {
            // Need replan due to failures or skipped steps
            resultType = 'needs_replan';
            feedback = `Plan needs replanning. Success: ${successfulSteps.length}, Failed: ${failedSteps.length}, Skipped: ${skippedSteps.length}`;
        } else if (
            hasNoMoreExecutableSteps &&
            successfulSteps.length < plan.steps.length
        ) {
            // Deadlock - no more executable steps but plan not complete
            resultType = 'deadlock';
            feedback = 'Execution deadlock: no more steps can be executed';
        } else {
            // Default case - should not normally reach here
            resultType = 'execution_complete';
            feedback = `Execution finished. Success: ${successfulSteps.length}, Failed: ${failedSteps.length}, Skipped: ${skippedSteps.length}`;
        }

        // Emit completion event
        try {
            await context.agentContext?.session.addEntry(
                {
                    type: 'plan.execution.completed',
                    planId: plan.id,
                },
                {
                    type: 'plan_completed',
                    at: Date.now(),
                    executionTime,
                    resultType,
                    successfulSteps: successfulSteps.length,
                    failedSteps: failedSteps.length,
                    skippedSteps: skippedSteps.length,
                    hasSignalsProblems,
                },
            );
        } catch {}

        // 🚀 Generate rich replan context for ReWOO
        let replanContext: PlanExecutionResult['replanContext'];

        if (
            resultType === 'needs_replan' &&
            (failedSteps.length > 0 || hasSignalsProblems)
        ) {
            const preservedSteps = executedResults.filter(
                (result) => result.success,
            );
            const failurePatterns: string[] = [];
            let primaryCause = 'Unknown failure';

            // Analyze failure patterns
            executedResults
                .filter((result) => !result.success)
                .forEach((result) => {
                    if (result.error) {
                        const errorStr =
                            typeof result.error === 'string'
                                ? result.error
                                : JSON.stringify(result.error);
                        failurePatterns.push(errorStr.toLowerCase());

                        // Determine primary cause from first significant error
                        if (primaryCause === 'Unknown failure') {
                            if (errorStr.toLowerCase().includes('invalid')) {
                                primaryCause = 'Invalid input provided';
                            } else if (
                                errorStr.toLowerCase().includes('not found')
                            ) {
                                primaryCause = 'Resource not found';
                            } else if (
                                errorStr.toLowerCase().includes('permission') ||
                                errorStr.toLowerCase().includes('auth')
                            ) {
                                primaryCause =
                                    'Permission or authentication error';
                            } else if (
                                errorStr.toLowerCase().includes('timeout') ||
                                errorStr.toLowerCase().includes('unavailable')
                            ) {
                                primaryCause = 'Service unavailable or timeout';
                            } else {
                                primaryCause = errorStr;
                            }
                        }
                    }
                });

            // Build replan context
            replanContext = {
                preservedSteps,
                failurePatterns: [...new Set(failurePatterns)], // Remove duplicates
                primaryCause,
                suggestedStrategy: 'plan-execute',
                contextForReplan: {
                    successfulSteps,
                    failedSteps,
                    skippedSteps,
                    hasSignalsProblems,
                    signals: signals || {},
                },
            };
        }

        const finalResult = {
            type: resultType,
            planId: plan.id,
            strategy: plan.strategy,
            totalSteps: plan.steps.length,
            executedSteps: executedResults,
            successfulSteps,
            failedSteps,
            skippedSteps,
            hasSignalsProblems,
            signals,
            executionTime,
            feedback,
            replanContext,
        };

        return finalResult;
    }

    // 🔄 LEGACY: Keep for backward compatibility (transforms new result to old format)
    async runLegacy(
        plan: ExecutionPlan,
        context: PlannerExecutionContext,
    ): Promise<ResultAnalysis> {
        const result = await this.run(plan, context);

        return {
            isComplete: result.type === 'execution_complete',
            isSuccessful: result.type === 'execution_complete',
            feedback: result.feedback,
            shouldContinue: result.type === 'needs_replan',
            suggestedNextAction:
                result.type === 'needs_replan' ? 'Replan' : undefined,
        };
    }
}
