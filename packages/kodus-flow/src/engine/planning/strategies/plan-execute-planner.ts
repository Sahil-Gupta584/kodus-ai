/**
 * Plan-and-Execute Planner
 *
 * Implementa o pattern Plan-and-Execute onde:
 * 1. Cria um plano detalhado primeiro
 * 2. Executa cada step do plano
 * 3. Re-planeja quando necessário
 */

import { createLogger } from '../../../observability/index.js';
import type { LLMAdapter } from '../../../adapters/llm/index.js';
import type {
    Planner,
    AgentThought,
    // AgentAction,
    ActionResult,
    ResultAnalysis,
    PlannerExecutionContext,
} from '../planner-factory.js';
import {
    isErrorResult,
    getResultError,
    getResultContent,
} from '../planner-factory.js';

export interface PlanStep {
    id: string;
    description: string;
    type: 'action' | 'decision' | 'verification';
    tool?: string;
    arguments?: Record<string, unknown>;
    dependencies?: string[];
    status: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';
    result?: unknown;
    reasoning?: string;
    retry?: number;
}

export interface ExecutionPlan {
    id: string;
    goal: string;
    strategy: string;
    steps: PlanStep[];
    currentStepIndex: number;
    status: 'planning' | 'executing' | 'completed' | 'failed' | 'replanning';
    reasoning: string;
    metadata?: Record<string, unknown>;
}

export class PlanAndExecutePlanner implements Planner {
    private logger = createLogger('plan-execute-planner');
    private currentPlan: ExecutionPlan | null = null;

    constructor(private llmAdapter: LLMAdapter) {
        this.logger.info('Plan-and-Execute Planner initialized', {
            llmProvider: this.llmAdapter.getProvider?.()?.name || 'unknown',
            hasCreatePlan: this.llmAdapter.createPlan !== undefined,
        });
    }

    async think(
        input: string,
        context: PlannerExecutionContext,
    ): Promise<AgentThought> {
        this.logger.debug('Plan-and-Execute thinking started', {
            input: input.substring(0, 100),
            iteration: context.iterations,
            hasCurrentPlan: !!this.currentPlan,
        });

        try {
            // Se não temos plano ou precisamos replanejamento
            if (!this.currentPlan || this.shouldReplan(context)) {
                return await this.createPlan(input, context);
            }

            // Executar próximo step do plano
            return await this.executeNextStep(context);
        } catch (error) {
            this.logger.error(
                'Plan-and-Execute thinking failed',
                error as Error,
            );

            return {
                reasoning: `Error in planning: ${error instanceof Error ? error.message : 'Unknown error'}`,
                action: {
                    type: 'final_answer',
                    content: `I encountered an error while planning: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
                },
            };
        }
    }

    private async createPlan(
        input: string,
        context: PlannerExecutionContext,
    ): Promise<AgentThought> {
        console.log(input, context);
        return {
            reasoning: 'Plan-and-Execute thinking started',
            action: {
                type: 'final_answer',
                content: 'Plan-and-Execute thinking started',
            },
        };
        //
        // this.logger.debug('Creating new execution plan');

        // // Use LLM to create detailed plan
        // const llmPlan = await this.llmAdapter.createPlan?.(
        //     this.buildPlanningGoal(input, context),
        //     'plan-execute',
        //     {
        //         availableTools:
        //             context.availableTools?.map((tool) => tool.name) || [],
        //         previousPlans: this.extractPreviousPlans(context),
        //         agentIdentity: context.agentIdentity, // ✅ USE AGENT IDENTITY
        //     },
        // );

        // // Convert LLM plan to execution plan
        // this.currentPlan = {
        //     id: `plan-${Date.now()}`,
        //     goal: input,
        //     strategy: 'plan-execute',
        //     steps: this.convertLLMStepsToExecutionSteps(
        //         (
        //             llmPlan as {
        //                 steps?: Array<{
        //                     tool?: string;
        //                     arguments?: Record<string, unknown>;
        //                     description?: string;
        //                     type?: string;
        //                 }>;
        //             }
        //         )?.steps || [],
        //     ),
        //     currentStepIndex: 0,
        //     status: 'executing',
        //     reasoning:
        //         (llmPlan as { reasoning?: string })?.reasoning ||
        //         'Plan created successfully',
        // };

        // this.logger.info('Execution plan created', {
        //     planId: this.currentPlan.id,
        //     totalSteps: this.currentPlan.steps.length,
        //     firstStep: this.currentPlan.steps[0]?.description,
        // });

        // // Start executing first step
        // return this.executeNextStep(context);
    }

    private async executeNextStep(
        context: PlannerExecutionContext,
    ): Promise<AgentThought> {
        if (!this.currentPlan) {
            throw new Error('No execution plan available');
        }

        const currentStep =
            this.currentPlan.steps[this.currentPlan.currentStepIndex];

        if (!currentStep) {
            // Plan completed
            this.currentPlan.status = 'completed';
            return {
                reasoning: 'All plan steps completed successfully',
                action: {
                    type: 'final_answer',
                    content: 'Task completed according to plan',
                },
                metadata: {
                    planId: this.currentPlan.id,
                    completedSteps: this.currentPlan.steps.length,
                    executionHistory: context.history.length,
                    iterationCount: context.iterations,
                },
            };
        }

        // Use context history to adapt step execution
        const recentFailures = context.history
            .slice(-3)
            .filter((h) => isErrorResult(h.result));
        if (recentFailures.length >= 2) {
            // Adapt step based on recent failures
            currentStep.retry = (currentStep.retry || 0) + 1;
            this.logger.warn('Adapting step due to recent failures', {
                stepId: currentStep.id,
                recentFailures: recentFailures.length,
                newRetryCount: currentStep.retry,
            });
        }

        // Mark step as executing
        currentStep.status = 'executing';

        // ✅ VALIDAÇÃO - Verificar se a tool solicitada existe antes de executar
        // const availableToolNames =
        //     context.availableTools?.map((t) => t.name) || [];

        // let action: AgentAction;

        // if (currentStep.tool && currentStep.tool !== 'none') {
        //     if (!availableToolNames.includes(currentStep.tool)) {
        //         // ✅ FALLBACK - Tool não existe, converter para resposta conversacional
        //         action = {
        //             type: 'final_answer',
        //             content: `Não tenho acesso à ferramenta "${currentStep.tool}" necessária para: ${currentStep.description}. Como posso ajudar de outra forma?`,
        //         };
        //     } else {
        //         action = {
        //             type: 'tool_call',
        //             tool: currentStep.tool,
        //             arguments: currentStep.arguments || {},
        //         };
        //     }
        // } else {
        //     action = {
        //         type: 'final_answer',
        //         content: currentStep.description,
        //     };
        // }

        return {
            reasoning: `Executing step ${this.currentPlan.currentStepIndex + 1}/${this.currentPlan.steps.length}: ${currentStep.description}. Context: ${context.history.length} previous actions, iteration ${context.iterations}`,
            // action,
            confidence: this.calculateStepConfidence(currentStep, context),
            metadata: {
                planId: this.currentPlan.id,
                stepId: currentStep.id,
                stepIndex: this.currentPlan.currentStepIndex,
                totalSteps: this.currentPlan.steps.length,
                stepType: currentStep.type,
                contextHistory: context.history.length,
                currentIteration: context.iterations,
                // availableTools:
                //     context.availableTools?.map((tool) => tool.name) || [],
            },
        };
    }

    async analyzeResult(
        result: ActionResult,
        context: PlannerExecutionContext,
    ): Promise<ResultAnalysis> {
        this.logger.debug('Analyzing step result', {
            resultType: result.type,
            hasError: isErrorResult(result),
            hasCurrentPlan: !!this.currentPlan,
        });

        if (!this.currentPlan) {
            return {
                isComplete: true,
                isSuccessful: true,
                feedback: 'No plan to analyze',
                shouldContinue: false,
            };
        }

        const currentStep =
            this.currentPlan.steps[this.currentPlan.currentStepIndex];

        if (!currentStep) {
            return {
                isComplete: true,
                isSuccessful: true,
                feedback: 'Plan execution completed',
                shouldContinue: false,
            };
        }

        // Handle step result
        if (isErrorResult(result)) {
            currentStep.status = 'failed';
            currentStep.result = { error: getResultError(result) };

            // Determine if we should retry, replan, or fail
            const shouldReplan = await this.shouldReplanOnFailure(
                result,
                context,
            );

            if (shouldReplan) {
                this.currentPlan.status = 'replanning';
                return {
                    isComplete: false,
                    isSuccessful: false,
                    feedback: `Step failed: ${result.error}. Will replan from this point.`,
                    shouldContinue: true,
                    suggestedNextAction: 'Replan execution strategy',
                };
            } else {
                this.currentPlan.status = 'failed';
                return {
                    isComplete: true,
                    isSuccessful: false,
                    feedback: `Plan execution failed at step: ${currentStep.description}. Error: ${result.error}`,
                    shouldContinue: false,
                };
            }
        }

        // Step succeeded
        currentStep.status = 'completed';
        currentStep.result = getResultContent(result);
        this.currentPlan.currentStepIndex++;

        // Check if plan is complete
        const isLastStep =
            this.currentPlan.currentStepIndex >= this.currentPlan.steps.length;

        if (isLastStep) {
            this.currentPlan.status = 'completed';
            return {
                isComplete: true,
                isSuccessful: true,
                feedback: 'Plan execution completed successfully',
                shouldContinue: false,
            };
        }

        // Continue to next step
        return {
            isComplete: false,
            isSuccessful: true,
            feedback: `Step completed: ${currentStep.description}. Proceeding to next step.`,
            shouldContinue: true,
            suggestedNextAction: `Next: ${this.currentPlan.steps[this.currentPlan.currentStepIndex]?.description}`,
        };
    }

    private shouldReplan(context: PlannerExecutionContext): boolean {
        if (!this.currentPlan) return true;

        // Replan if status indicates replanning needed
        if (this.currentPlan.status === 'replanning') return true;

        // Replan if too many consecutive failures
        const recentFailures = context.history
            .slice(-3)
            .filter((h) => isErrorResult(h.result)).length;

        return recentFailures >= 2;
    }

    private async shouldReplanOnFailure(
        result: ActionResult,
        context: PlannerExecutionContext,
    ): Promise<boolean> {
        // Simple heuristic: replan if error seems recoverable
        const errorMessage = getResultError(result)?.toLowerCase() || '';

        // Don't replan for certain types of errors
        const unrecoverableErrors = [
            'permission denied',
            'not found',
            'invalid credentials',
            'unauthorized',
        ];

        if (unrecoverableErrors.some((err) => errorMessage.includes(err))) {
            return false;
        }

        // Replan for other errors if we haven't tried too many times
        return context.iterations < 3;
    }

    //     private buildPlanningGoal(
    //         input: string,
    //         context: PlannerExecutionContext,
    //     ): string {
    //             // const availableToolNames =
    //             //     context.availableTools?.map((tool) => tool.name) || [];

    //         // ✅ CONTEXT ENGINEERING - Informar tools disponíveis de forma simples
    //         const toolsContext =
    //             availableToolNames.length > 0
    //                 ? `Available tools: ${availableToolNames.join(', ')}`
    //                 : `No tools available for this session`;

    //         const historyContext =
    //             context.history.length > 0
    //                 ? `\nPrevious attempts context: ${context.history
    //                       .slice(-2)
    //                       .map(
    //                           (h) =>
    //                               `Action: ${JSON.stringify(h.action)}, Result: ${h.observation.feedback}`,
    //                       )
    //                       .join('; ')}`
    //                 : '';

    //         return `
    // ${toolsContext}

    // Create a detailed step-by-step plan to achieve this goal: ${input}
    // ${historyContext}

    // Requirements:
    // 1. Break down into specific, actionable steps
    // 2. Each step should be clear and measurable
    // 3. Include appropriate actions and tool usage
    // 4. Consider dependencies between steps
    // 5. Plan for verification and error handling

    // Create a structured plan with steps that can be executed sequentially.
    //         `.trim();
    //     }

    //     private convertLLMStepsToExecutionSteps(
    //         llmSteps: Array<{
    //             tool?: string;
    //             arguments?: Record<string, unknown>;
    //             description?: string;
    //             type?: string;
    //         }>,
    //     ): PlanStep[] {
    //         return llmSteps.map((step, index) => {
    //             // ✅ VALIDAÇÃO - Verificar se step usa tool inexistente
    //             const finalTool = step.tool;
    //             const finalDescription = step.description || `Step ${index + 1}`;

    //             if (step.tool && step.tool !== 'none') {
    //                 // Se step menciona uma tool, verificar se ela existe
    //                 // Nota: availableTools não está disponível aqui, mas a validação será feita na execução
    //                 // Por agora, mantemos a tool conforme especificada pelo LLM
    //             }

    //             return {
    //                 id: `step-${index + 1}`,
    //                 description: finalDescription,
    //                 type:
    //                     step.type === 'verification'
    //                         ? 'verification'
    //                         : finalTool
    //                           ? 'action'
    //                           : 'decision',
    //                 tool: finalTool,
    //                 arguments: step.arguments,
    //                 status: 'pending' as const,
    //                 dependencies: index > 0 ? [`step-${index}`] : [],
    //                 retry: 0,
    //             };
    //         });
    //     }

    //     private extractPreviousPlans(context: PlannerExecutionContext) {
    //         // Extract previous planning attempts from history
    //         return context.history
    //             .filter((h) => h.thought.metadata?.planId)
    //             .map((h) => ({
    //                 strategy: 'plan-execute',
    //                 goal: context.input,
    //                 steps: [
    //                     {
    //                         id: 'previous-step',
    //                         description: h.thought.reasoning,
    //                         type: 'action' as const,
    //                     },
    //                 ],
    //                 reasoning: h.observation.feedback,
    //                 complexity: 'medium' as const,
    //             }));
    //     }

    private calculateStepConfidence(
        step: PlanStep,
        context: PlannerExecutionContext,
    ): number {
        let confidence = 0.7; // Base confidence

        // Higher confidence for tool-based actions
        if (step.tool) confidence += 0.2;

        // Higher confidence for steps with clear descriptions
        if (step.description && step.description.length > 20) confidence += 0.1;

        // Lower confidence for verification steps (harder to predict)
        if (step.type === 'verification') confidence -= 0.1;

        // Use context to adjust confidence
        const recentSuccesses = context.history
            .slice(-5)
            .filter((h) => !isErrorResult(h.result));
        if (recentSuccesses.length >= 4) {
            confidence += 0.15; // High recent success rate
        } else if (recentSuccesses.length <= 1) {
            confidence -= 0.15; // Low recent success rate
        }

        // // Consider available tools
        // if (
        //     (step.tool &&
        //         context.availableTools?.some(
        //             (tool) => tool.name === step.tool,
        //         )) ||
        //     false
        // ) {
        //     confidence += 0.1; // Tool is available
        // } else if (
        //     (step.tool &&
        //         !context.availableTools?.some(
        //             (tool) => tool.name === step.tool,
        //         )) ||
        //     false
        // ) {
        //     confidence -= 0.2; // Tool not available
        // }

        // Consider iteration count (higher iterations = lower confidence)
        if (context.iterations > 5) {
            confidence -= 0.1;
        }

        return Math.min(confidence, 1.0);
    }
}
