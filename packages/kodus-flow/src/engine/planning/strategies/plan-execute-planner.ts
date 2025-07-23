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
import type { ExecutionRuntime } from '../../../core/context/execution-runtime.js';
import { RuntimeRegistry } from '../../../core/context/runtime-registry.js';
import type {
    Planner,
    AgentThought,
    ActionResult,
    ResultAnalysis,
    PlannerExecutionContext,
} from '../planner-factory.js';
import {
    isErrorResult,
    getResultError,
    getResultContent,
} from '../planner-factory.js';
import { Thread } from '../../../core/types/common-types.js';
import { ToolMetadataForLLM } from '@/core/types/tool-types.js';
// import { getGlobalPersistor } from '../../../persistor/factory.js';
import {
    createResponseSynthesizer,
    type ResponseSynthesisContext,
} from '../../response/response-synthesizer.js';

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
    // private persistor = getGlobalPersistor();
    private responseSynthesizer: ReturnType<typeof createResponseSynthesizer>;

    constructor(private llmAdapter: LLMAdapter) {
        this.responseSynthesizer = createResponseSynthesizer(this.llmAdapter);
        this.logger.info('Plan-and-Execute Planner initialized', {
            llmProvider: llmAdapter.getProvider?.()?.name || 'unknown',
            supportsStructured:
                llmAdapter.supportsStructuredGeneration?.() || false,
            supportsPlanning: !!llmAdapter.createPlan,
            availableTechniques: llmAdapter.getAvailableTechniques?.() || [],
        });
    }

    /**
     * 💾 CLAUDE CODE FEATURE: Persist execution plan for recovery
     */
    // private async savePlan(
    //     plan: ExecutionPlan,
    //     threadId: string,
    // ): Promise<void> {
    //     try {
    //         const planKey = `plan_${threadId}_${plan.id}`;
    //         await this.persistor.store({
    //             id: planKey,
    //             timestamp: Date.now(),
    //             metadata: {
    //                 threadId,
    //                 planId: plan.id,
    //                 goal: plan.goal,
    //                 status: plan.status,
    //                 currentStepIndex: plan.currentStepIndex,
    //                 totalSteps: plan.steps.length,
    //             },
    //             data: plan,
    //         });

    //         this.logger.info('💾 Plan persisted successfully', {
    //             planId: plan.id,
    //             threadId,
    //             status: plan.status,
    //             progress: `${plan.currentStepIndex}/${plan.steps.length}`,
    //         });
    //     } catch (error) {
    //         this.logger.warn('Failed to persist plan', {
    //             planId: plan.id,
    //             error: (error as Error).message,
    //         });
    //     }
    // }

    // /**
    //  * 🔄 CLAUDE CODE FEATURE: Restore execution plan for continuity
    //  */
    // private async loadPlan(threadId: string): Promise<ExecutionPlan | null> {
    //     try {
    //         // Look for the most recent plan for this thread
    //         const stats = await this.persistor.getStats();
    //         this.logger.debug('Searching for persisted plans', {
    //             threadId,
    //             storageStats: stats,
    //         });

    //         // In a real implementation, we'd search by threadId
    //         // For now, we'll return null and let the system create new plans
    //         return null;
    //     } catch (error) {
    //         this.logger.warn('Failed to load persisted plan', {
    //             threadId,
    //             error: (error as Error).message,
    //         });
    //         return null;
    //     }
    // }

    // /**
    //  * 📊 CLAUDE CODE FEATURE: Update plan progress and persist
    //  */
    // private async updatePlanProgress(threadId: string): Promise<void> {
    //     if (!this.currentPlan) return;

    //     this.currentPlan.metadata = {
    //         ...this.currentPlan.metadata,
    //         lastUpdated: Date.now(),
    //         progress: `${this.currentPlan.currentStepIndex}/${this.currentPlan.steps.length}`,
    //         completedSteps: this.currentPlan.steps.filter(
    //             (s) => s.status === 'completed',
    //         ).length,
    //         failedSteps: this.currentPlan.steps.filter(
    //             (s) => s.status === 'failed',
    //         ).length,
    //     };

    //     await this.savePlan(this.currentPlan, threadId);
    // }

    /**
     * 🎯 RESPONSE SYNTHESIS: Criar resposta final conversacional
     */
    private async createFinalResponse(
        context: PlannerExecutionContext,
    ): Promise<string> {
        if (!this.currentPlan) {
            return 'Tarefa completada com sucesso!';
        }

        try {
            // Coletar todos os resultados da execução
            const executionResults = context.history.map((h) => h.result);

            // Preparar contexto para synthesis
            const synthesisContext: ResponseSynthesisContext = {
                originalQuery: context.input,
                plannerType: 'plan-execute',
                executionResults,
                planSteps: this.currentPlan.steps
                    .filter(
                        (step) =>
                            step.status === 'completed' ||
                            step.status === 'failed' ||
                            step.status === 'skipped',
                    )
                    .map((step) => ({
                        id: step.id,
                        description: step.description,
                        status: step.status as
                            | 'completed'
                            | 'failed'
                            | 'skipped',
                        result: step.result,
                    })),
                metadata: {
                    totalSteps: this.currentPlan.steps.length,
                    completedSteps: this.currentPlan.steps.filter(
                        (s) => s.status === 'completed',
                    ).length,
                    failedSteps: this.currentPlan.steps.filter(
                        (s) => s.status === 'failed',
                    ).length,
                    executionTime:
                        Date.now() -
                        ((this.currentPlan.metadata?.startTime as number) ||
                            Date.now()),
                    iterationCount: context.iterations,
                    planId: this.currentPlan.id,
                    strategy: this.currentPlan.strategy,
                },
            };

            // Usar Response Synthesizer para criar resposta conversacional
            const synthesizedResponse =
                await this.responseSynthesizer.synthesize(
                    synthesisContext,
                    'conversational',
                );

            this.logger.info('🎯 Final response synthesized', {
                planId: this.currentPlan.id,
                confidence: synthesizedResponse.confidence,
                followUpsCount: synthesizedResponse.followUpSuggestions.length,
                includesError: synthesizedResponse.includesError,
            });

            // Adicionar follow-up suggestions se disponíveis
            let finalResponse = synthesizedResponse.content;

            if (synthesizedResponse.followUpSuggestions.length > 0) {
                finalResponse += '\n\n💡 **Posso ajudar mais:**\n';
                synthesizedResponse.followUpSuggestions.forEach(
                    (suggestion) => {
                        finalResponse += `• ${suggestion}\n`;
                    },
                );
            }

            return finalResponse;
        } catch (error) {
            this.logger.error(
                'Failed to synthesize final response',
                error as Error,
                {
                    planId: this.currentPlan.id,
                },
            );

            // Fallback: resposta básica mas útil
            const completedSteps = this.currentPlan.steps.filter(
                (s) => s.status === 'completed',
            ).length;
            const failedSteps = this.currentPlan.steps.filter(
                (s) => s.status === 'failed',
            ).length;

            let fallbackResponse = `Sobre "${context.input}":\n\n`;
            fallbackResponse += `✅ Executei ${completedSteps} steps com sucesso`;

            if (failedSteps > 0) {
                fallbackResponse += ` (${failedSteps} falharam)`;
            }

            fallbackResponse +=
                '.\n\nPosso explicar melhor algum resultado específico se precisar!';

            return fallbackResponse;
        }
    }

    /**
     * Get ExecutionRuntime for the current thread
     */
    private getExecutionRuntime(thread: Thread): ExecutionRuntime | null {
        const threadId = thread.id;
        if (!threadId) {
            this.logger.warn('No threadId found in planner metadata');
            return null;
        }
        return RuntimeRegistry.getByThread(threadId);
    }

    /**
     * Get available tools for the current context
     */
    private getAvailableToolsForContext(thread: Thread): ToolMetadataForLLM[] {
        const executionRuntime = this.getExecutionRuntime(thread);
        return executionRuntime?.getAvailableToolsForLLM() || [];
    }

    async think(
        input: string,
        context: PlannerExecutionContext,
    ): Promise<AgentThought> {
        debugger; // 🔍 DEBUG: Monitor thinking process
        this.logger.debug('Plan-and-Execute thinking started', {
            input: input.substring(0, 100),
            iteration: context.iterations,
            hasCurrentPlan: !!this.currentPlan,
        });

        try {
            // const thread = context.plannerMetadata.thread!;
            // const threadId = thread.id!;

            // 🔄 CLAUDE CODE FEATURE: Persistence temporarily disabled
            // const thread = context.plannerMetadata.thread!;
            // const threadId = thread.id!;

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
        debugger; // 🔍 DEBUG: Monitor plan creation
        const thread = context.plannerMetadata.thread!;
        const availableTools = this.getAvailableToolsForContext(thread);

        // ✅ SMART: Handle no tools available - but can still plan!
        if (availableTools.length === 0) {
            this.logger.info('No tools available, creating simple plan', {
                input: input.substring(0, 100),
                iteration: context.iterations,
            });

            const fallbackPlan = this.createFallbackPlan(input);
            this.currentPlan = fallbackPlan;
            return this.executeNextStep(context);
        }

        const executionRuntime = this.getExecutionRuntime(thread);
        const agentIdentity = executionRuntime?.getAgentIdentity();
        const userContext = executionRuntime?.getUserContext();

        // ✅ GET MEMORY CONTEXT for better planning
        const memoryContext = await this.getMemoryContext(
            executionRuntime,
            input,
        );

        // ✅ Build enhanced tools context for Plan-Execute
        const toolsContext =
            this.buildToolsContextForPlanExecute(availableTools);

        // ✅ Build planning history context
        const planningHistory = this.buildPlanningHistory(context);

        const identityContext = agentIdentity
            ? `\nYour identity:
- Role: ${agentIdentity?.role || 'Planning Assistant'}
- Goal: ${agentIdentity?.goal || 'Create effective execution plans'}
- Expertise: ${agentIdentity?.expertise?.join(', ') || 'Strategic planning'}`
            : '';

        this.logger.info('Creating execution plan with enhanced context', {
            goal: input.substring(0, 100),
            availableTools: availableTools.length,
            hasMemoryContext: !!memoryContext,
            hasIdentity: !!agentIdentity,
            hasHistory: planningHistory.length > 0,
        });

        // Use LLM to create detailed plan with full context engineering
        const plan = await this.llmAdapter.createPlan?.(input, 'plan-execute', {
            availableTools: availableTools,
            // ✅ Enhanced context engineering for Plan-Execute
            toolsContext,
            planningHistory,
            identityContext,
            userContext,
            memoryContext,
            planningInstructions: this.buildPlanningInstructions(
                input,
                context,
                availableTools,
            ),
        });

        // Convert LLM plan to execution plan
        const steps = this.convertLLMResponseToSteps(plan);

        this.currentPlan = {
            id: `plan-${Date.now()}`,
            goal: input,
            strategy: 'plan-execute',
            steps: steps,
            currentStepIndex: 0,
            status: 'executing',
            reasoning:
                ((plan as Record<string, unknown>)?.reasoning as string) ||
                `Plan created for: ${input}`,
            metadata: {
                startTime: Date.now(),
                createdBy: 'plan-execute-planner',
                thread: thread.id,
            },
        };

        this.logger.info('LLM execution plan created', {
            planId: this.currentPlan.id,
            totalSteps: this.currentPlan.steps.length,
            firstStep: this.currentPlan.steps[0]?.description,
        });

        // 💾 CLAUDE CODE FEATURE: Persist the new plan (temporarily disabled)
        // await this.savePlan(this.currentPlan, thread.id!);

        // Start executing first step
        return this.executeNextStep(context);
    }

    private async executeNextStep(
        context: PlannerExecutionContext,
    ): Promise<AgentThought> {
        debugger; // 🔍 DEBUG: Monitor step execution
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

        // 🔄 RESOLVE DYNAMIC ARGUMENTS: Replace references to previous step results
        if (currentStep.arguments) {
            currentStep.arguments = this.resolveStepArguments(
                currentStep.arguments,
                this.currentPlan.steps,
            );
        }

        // 🚀 DYNAMIC PARALLEL EXPANSION: Check if step needs to be expanded for arrays
        if (this.shouldExpandToParallel(currentStep, this.currentPlan.steps)) {
            return this.expandToParallelExecution(currentStep, context);
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
        const availableTools = this.getAvailableToolsForContext(
            context.plannerMetadata.thread!,
        );
        const availableToolNames = availableTools.map((t) => t.name);

        let action: any; // eslint-disable-line @typescript-eslint/no-explicit-any

        // ✅ ENHANCED: Check if we can execute multiple steps in parallel
        const parallelOpportunity = this.detectParallelExecution(
            currentStep,
            context,
        );

        if (
            parallelOpportunity.canExecuteInParallel &&
            parallelOpportunity.steps.length > 1
        ) {
            // Create parallel tools action for multiple independent steps
            const parallelTools = parallelOpportunity.steps
                .filter(
                    (step) =>
                        step.tool && availableToolNames.includes(step.tool),
                )
                .map((step) => ({
                    toolName: step.tool!,
                    input: step.arguments || {},
                    reasoning: step.description,
                }));

            if (parallelTools.length > 1) {
                action = {
                    type: 'parallel_tools',
                    tools: parallelTools,
                    reasoning: `Executing ${parallelTools.length} independent tools in parallel: ${parallelTools.map((t) => t.toolName).join(', ')}`,
                    concurrency: Math.min(parallelTools.length, 3), // Reasonable concurrency limit
                    failFast: false, // Continue even if one tool fails
                    aggregateResults: true,
                };

                // Mark all parallel steps as executing
                parallelOpportunity.steps.forEach((step) => {
                    step.status = 'executing';
                });

                this.logger.info('Creating parallel tools action', {
                    toolCount: parallelTools.length,
                    tools: parallelTools.map((t) => t.toolName),
                });
            } else {
                // Fallback to single tool execution
                action = this.createSingleToolAction(
                    currentStep,
                    availableToolNames,
                );
            }
        } else {
            // Single step execution
            action = this.createSingleToolAction(
                currentStep,
                availableToolNames,
            );
        }

        return {
            reasoning: `Executing step ${this.currentPlan.currentStepIndex + 1}/${this.currentPlan.steps.length}: ${currentStep.description}. Context: ${context.history.length} previous actions, iteration ${context.iterations}`,
            action,
            confidence: this.calculateStepConfidence(currentStep, context),
            metadata: {
                planId: this.currentPlan.id,
                stepId: currentStep.id,
                stepIndex: this.currentPlan.currentStepIndex,
                totalSteps: this.currentPlan.steps.length,
                stepType: currentStep.type,
                contextHistory: context.history.length,
                currentIteration: context.iterations,
                availableTools: availableToolNames,
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

                // 🎯 RESPONSE SYNTHESIS: Criar resposta conversacional para erros também
                const synthesizedErrorResponse =
                    await this.createFinalResponse(context);

                return {
                    isComplete: true,
                    isSuccessful: false,
                    feedback: synthesizedErrorResponse,
                    shouldContinue: false,
                };
            }
        }

        // Step succeeded - handle both single and parallel execution
        if (result.type === 'tool_results') {
            // Handle parallel tools results
            const parallelResults = result.content as Array<{
                toolName: string;
                result?: unknown;
                error?: string;
            }>;

            // Mark all steps that were executed in parallel as completed
            let stepsCompleted = 0;
            const startIndex = this.currentPlan.currentStepIndex;

            for (
                let i = startIndex;
                i < this.currentPlan.steps.length &&
                stepsCompleted < parallelResults.length;
                i++
            ) {
                const step = this.currentPlan.steps[i];
                if (step && step.status === 'executing') {
                    const stepResult = parallelResults.find(
                        (r) => r.toolName === step.tool,
                    );
                    if (stepResult) {
                        step.status = stepResult.error ? 'failed' : 'completed';
                        step.result = stepResult.error
                            ? { error: stepResult.error }
                            : stepResult.result;
                        stepsCompleted++;
                    }
                }
            }

            this.currentPlan.currentStepIndex = startIndex + stepsCompleted;

            this.logger.info('Parallel execution completed', {
                stepsCompleted,
                newIndex: this.currentPlan.currentStepIndex,
                totalSteps: this.currentPlan.steps.length,
            });
        } else {
            // Handle single step execution
            currentStep.status = 'completed';
            currentStep.result = getResultContent(result);
            this.currentPlan.currentStepIndex++;
        }

        // Check if plan is complete
        const isLastStep =
            this.currentPlan.currentStepIndex >= this.currentPlan.steps.length;

        // 💾 CLAUDE CODE FEATURE: Update progress after each step (temporarily disabled)
        // const threadId = context.plannerMetadata.thread?.id;
        // if (threadId) {
        //     await this.updatePlanProgress(threadId);
        // }

        if (isLastStep) {
            this.currentPlan.status = 'completed';

            // 🎉 CLAUDE CODE FEATURE: Final persistence with completion (temporarily disabled)
            // if (threadId) {
            //     await this.savePlan(this.currentPlan, threadId);
            // }

            // 🎯 RESPONSE SYNTHESIS: Criar resposta conversacional final
            const synthesizedResponse = await this.createFinalResponse(context);

            return {
                isComplete: true,
                isSuccessful: true,
                feedback: synthesizedResponse,
                shouldContinue: false,
            };
        }

        // Continue to next step
        return {
            isComplete: false,
            isSuccessful: true,
            feedback: `✅ Step completed: ${currentStep.description}. Progress: ${this.currentPlan.currentStepIndex}/${this.currentPlan.steps.length}`,
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
    //                 input: step.arguments,
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

        // Consider available tools
        const availableTools = this.getAvailableToolsForContext(
            context.plannerMetadata.thread!,
        );
        if (
            step.tool &&
            availableTools.some((tool) => tool.name === step.tool)
        ) {
            confidence += 0.1; // Tool is available
        } else if (
            step.tool &&
            !availableTools.some((tool) => tool.name === step.tool)
        ) {
            confidence -= 0.2; // Tool not available
        }

        // Consider iteration count (higher iterations = lower confidence)
        if (context.iterations > 5) {
            confidence -= 0.1;
        }

        return Math.min(confidence, 1.0);
    }

    /**
     * Convert LLM response to execution steps
     */
    private convertLLMResponseToSteps(llmResponse: unknown): PlanStep[] {
        const response = llmResponse as Record<string, unknown>;

        // Try to extract steps from LLM response
        let rawSteps: Record<string, unknown>[] = [];

        if (response?.steps && Array.isArray(response.steps)) {
            rawSteps = response.steps;
        } else if (response?.plan && Array.isArray(response.plan)) {
            rawSteps = response.plan;
        } else if (Array.isArray(response)) {
            rawSteps = response;
        } else {
            // Fallback: create a single step with the response content
            rawSteps = [
                {
                    description:
                        typeof response === 'string'
                            ? response
                            : 'Execute plan',
                    type: 'action',
                },
            ];
        }

        // Convert to PlanStep format with placeholder validation
        const convertedSteps = rawSteps.map((step, index) => ({
            id: `step-${index + 1}`,
            description:
                (step.description as string) ||
                (step.content as string) ||
                `Step ${index + 1}`,
            type: ((step.type as string) ||
                ((step.tool as string) ? 'action' : 'decision')) as
                | 'action'
                | 'decision'
                | 'verification',
            tool: (step.tool as string) || (step.tool as string),
            arguments: (step.arguments ||
                step.args ||
                step.parameters) as Record<string, unknown>,
            dependencies: index > 0 ? [`step-${index}`] : [],
            status: 'pending' as const,
            retry: 0,
        }));

        // 🚨 VALIDATE: Check for placeholders in arguments
        const invalidSteps = this.validateStepsForPlaceholders(convertedSteps);
        if (invalidSteps.length > 0) {
            this.logger.warn('🚨 Plan contains invalid placeholders', {
                invalidSteps: invalidSteps.map((s) => ({
                    id: s.id,
                    tool: s.tool,
                    placeholders: s.placeholders,
                })),
            });

            // Return a fallback plan explaining the issue
            return [
                {
                    id: 'step-1',
                    description: `Não consegui criar um plano executável. Encontrei placeholders nos parâmetros: ${invalidSteps.map((s) => s.placeholders.join(', ')).join('; ')}. Preciso de valores concretos para executar as ferramentas.`,
                    type: 'decision' as const,
                    status: 'pending' as const,
                    retry: 0,
                    dependencies: [],
                },
            ];
        }

        return convertedSteps;
    }

    /**
     * 🚨 VALIDATE: Check steps for placeholder values that cannot be executed
     */
    private validateStepsForPlaceholders(steps: PlanStep[]): Array<{
        id: string;
        tool?: string;
        placeholders: string[];
    }> {
        const placeholderPatterns = [
            /REPOSITORY_ID(_AQUI|_HERE)?/i,
            /USER_ID(_AQUI|_HERE)?/i,
            /TEAM_ID(_AQUI|_HERE)?/i,
            /ORG_ID(_AQUI|_HERE)?/i,
            /PLACEHOLDER/i,
            /TODO/i,
            /FILL_IN/i,
            /REPLACE_WITH/i,
            /YOUR_.*_HERE/i,
            /\$\{(?!step-\d+\.result).*\}/, // ${variable} patterns EXCEPT {{step-X.result}}
            /<(?!step-\d+\.result).*>/, // <variable> patterns EXCEPT step references
        ];

        const invalidSteps: Array<{
            id: string;
            tool?: string;
            placeholders: string[];
        }> = [];

        for (const step of steps) {
            if (!step.arguments || !step.tool) continue;

            const foundPlaceholders: string[] = [];
            const argsStr = JSON.stringify(step.arguments);

            for (const pattern of placeholderPatterns) {
                const matches = argsStr.match(pattern);
                if (matches) {
                    foundPlaceholders.push(...matches);
                }
            }

            if (foundPlaceholders.length > 0) {
                invalidSteps.push({
                    id: step.id,
                    tool: step.tool,
                    placeholders: foundPlaceholders,
                });
            }
        }

        return invalidSteps;
    }

    /**
     * Create fallback plan when no LLM or tools available
     */
    private createFallbackPlan(input: string): ExecutionPlan {
        return {
            id: `fallback-plan-${Date.now()}`,
            goal: input,
            strategy: 'plan-execute-fallback',
            steps: [
                {
                    id: 'step-1',
                    description: `Provide response for: ${input}`,
                    type: 'decision',
                    status: 'pending',
                },
            ],
            currentStepIndex: 0,
            status: 'executing',
            reasoning: 'Simple fallback plan - no tools available',
        };
    }

    /**
     * Get memory context for better planning
     */
    private async getMemoryContext(
        executionRuntime: any, // eslint-disable-line @typescript-eslint/no-explicit-any
        _currentInput: string,
    ): Promise<string> {
        if (!executionRuntime) {
            return '';
        }

        try {
            const memoryManager = executionRuntime.getMemoryManager?.();
            if (!memoryManager) {
                return '';
            }

            const memories = await memoryManager.getRecentMemories?.(5);
            if (!memories || memories.length === 0) {
                return '';
            }

            return `\nRecent memory context:
${memories.map((m: any) => `- ${m.content || m.summary || 'Memory entry'}`).join('\n')}`; // eslint-disable-line @typescript-eslint/no-explicit-any
        } catch (error) {
            this.logger.debug('Could not retrieve memory context', { error });
            return '';
        }
    }

    /**
     * Build enhanced tools context for Plan-Execute
     */
    private buildToolsContextForPlanExecute(
        tools: ToolMetadataForLLM[],
    ): string {
        if (tools.length === 0) return 'No tools available.';

        // Group tools by capability for better planning
        const toolsByType = this.groupToolsByCapability(tools);

        let context = '\nAvailable tools for planning:\n';

        for (const [category, categoryTools] of Object.entries(toolsByType)) {
            context += `\n${category.toUpperCase()} TOOLS:\n`;
            categoryTools.forEach((tool) => {
                context += `- ${tool.name}: ${tool.description}\n`;

                // ✅ IMPROVED: Include parameter information for better planning
                if (tool.parameters && typeof tool.parameters === 'object') {
                    const params = tool.parameters as Record<string, unknown>;
                    const properties = params.properties as Record<
                        string,
                        unknown
                    >;
                    const required = params.required as string[];

                    if (properties && Object.keys(properties).length > 0) {
                        context += `  Parameters:\n`;
                        Object.entries(properties).forEach(
                            ([paramName, paramInfo]) => {
                                const info = paramInfo as Record<
                                    string,
                                    unknown
                                >;
                                const isRequired =
                                    required?.includes(paramName);
                                const type = info.type || 'string';
                                const description = info.description || '';

                                context += `    - ${paramName} (${type})${isRequired ? ' [REQUIRED]' : ' [optional]'}: ${description}\n`;
                            },
                        );
                    }
                }
            });
        }

        return context;
    }

    /**
     * Group tools by their capability for better planning
     */
    private groupToolsByCapability(
        tools: ToolMetadataForLLM[],
    ): Record<string, ToolMetadataForLLM[]> {
        const groups: Record<string, ToolMetadataForLLM[]> = {
            DATA_INFORMATION: [],
            COMMUNICATION: [],
            FILE_CONTENT: [],
            ANALYSIS: [],
            OTHER: [],
        };

        tools.forEach((tool) => {
            const name = tool.name.toLowerCase();
            const desc = tool.description.toLowerCase();

            if (
                name.includes('search') ||
                name.includes('get') ||
                name.includes('fetch') ||
                desc.includes('retrieve')
            ) {
                groups.DATA_INFORMATION?.push(tool);
            } else if (
                name.includes('send') ||
                name.includes('notify') ||
                desc.includes('message')
            ) {
                groups.COMMUNICATION?.push(tool);
            } else if (
                name.includes('file') ||
                name.includes('write') ||
                name.includes('read') ||
                desc.includes('document')
            ) {
                groups.FILE_CONTENT?.push(tool);
            } else if (
                name.includes('analyze') ||
                name.includes('process') ||
                desc.includes('analysis')
            ) {
                groups.ANALYSIS?.push(tool);
            } else {
                groups.OTHER?.push(tool);
            }
        });

        // Remove empty groups
        return Object.fromEntries(
            Object.entries(groups).filter(([_, tools]) => tools.length > 0),
        );
    }

    /**
     * Build planning history context
     */
    private buildPlanningHistory(context: PlannerExecutionContext): string {
        if (context.history.length === 0) {
            return '';
        }

        const recentActions = context.history.slice(-3);
        let history = '\nRecent execution history:\n';

        recentActions.forEach((entry, index) => {
            const actionType = entry.action?.type || 'unknown';
            const success = !entry.result || entry.result.type !== 'error';
            history += `${index + 1}. ${actionType} - ${success ? '✅ Success' : '❌ Failed'}\n`;
            if (entry.observation?.feedback) {
                history += `   Result: ${entry.observation.feedback}\n`;
            }
        });

        return history;
    }

    /**
     * Detect if multiple steps can be executed in parallel
     */
    private detectParallelExecution(
        currentStep: PlanStep,
        _context: PlannerExecutionContext,
    ): {
        canExecuteInParallel: boolean;
        steps: PlanStep[];
        reason?: string;
    } {
        if (!this.currentPlan) {
            return { canExecuteInParallel: false, steps: [currentStep] };
        }

        // Get remaining pending steps
        const remainingSteps = this.currentPlan.steps
            .slice(this.currentPlan.currentStepIndex)
            .filter((step) => step.status === 'pending');

        if (remainingSteps.length <= 1) {
            return { canExecuteInParallel: false, steps: [currentStep] };
        }

        // Check if next few steps are independent and can run in parallel
        const candidateSteps = remainingSteps.slice(0, 4); // Consider up to 4 steps
        const independentSteps: PlanStep[] = [];

        for (const step of candidateSteps) {
            // Check if step has dependencies that haven't been completed yet
            const hasPendingDependencies = step.dependencies?.some((depId) => {
                const depStep = this.currentPlan!.steps.find(
                    (s) => s.id === depId,
                );
                return depStep && depStep.status !== 'completed';
            });

            if (!hasPendingDependencies && step.tool && step.tool !== 'none') {
                // Check if this step is truly independent (no data dependencies)
                const hasDataDependency = this.checkDataDependency(
                    step,
                    independentSteps,
                );
                if (!hasDataDependency) {
                    independentSteps.push(step);
                }
            }
        }

        return {
            canExecuteInParallel: independentSteps.length > 1,
            steps:
                independentSteps.length > 1 ? independentSteps : [currentStep],
            reason:
                independentSteps.length > 1
                    ? `Found ${independentSteps.length} independent steps that can run in parallel`
                    : 'No parallel execution opportunity detected',
        };
    }

    /**
     * Check if a step has data dependencies on other steps
     */
    private checkDataDependency(
        step: PlanStep,
        otherSteps: PlanStep[],
    ): boolean {
        // Simple heuristic: check if step arguments reference outputs from other steps
        if (!step.arguments || !otherSteps.length) return false;

        const stepArgsText = JSON.stringify(step.arguments).toLowerCase();

        return otherSteps.some((otherStep) => {
            // Check if current step references the other step's tool or expected output
            return (
                stepArgsText.includes(otherStep.tool?.toLowerCase() || '') ||
                stepArgsText.includes(otherStep.id.toLowerCase())
            );
        });
    }

    /**
     * Create single tool action (fallback)
     */
    private createSingleToolAction(
        step: PlanStep,
        availableToolNames: string[],
    ): { type: string; [key: string]: unknown } {
        if (step.tool && step.tool !== 'none') {
            if (!availableToolNames.includes(step.tool)) {
                // ✅ FALLBACK - Tool não existe, converter para resposta conversacional
                return {
                    type: 'final_answer',
                    content: `Não tenho acesso à ferramenta "${step.tool}" necessária para: ${step.description}. Como posso ajudar de outra forma?`,
                };
            } else {
                return {
                    type: 'tool_call',
                    toolName: step.tool,
                    input: step.arguments || {},
                };
            }
        } else {
            return {
                type: 'final_answer',
                content: step.description,
            };
        }
    }

    /**
     * 🔄 RESOLVE STEP ARGUMENTS: Replace template references with actual values
     * Supports patterns like:
     * - {{step-1.result}} - entire result from step-1
     * - {{step-1.result[0].id}} - specific path in result
     * - {{step-1.result.repositories[0].id}} - nested path
     */
    private resolveStepArguments(
        args: Record<string, unknown>,
        allSteps: PlanStep[],
    ): Record<string, unknown> {
        const argsStr = JSON.stringify(args);

        // Pattern to match {{step-X.result...}} references
        const resolvedStr = argsStr.replace(
            /\{\{step-(\d+)\.result([\w\[\]\.]*)\}\}/g,
            (match, stepNum, path) => {
                const stepIndex = parseInt(stepNum) - 1;
                const step = allSteps[stepIndex];

                if (!step || !step.result) {
                    this.logger.warn('Step reference not found or no result', {
                        reference: match,
                        stepIndex,
                        hasResult: !!step?.result,
                    });
                    return match; // Keep original if can't resolve
                }

                try {
                    // Evaluate the path to get the value
                    const result = this.evaluatePath(step.result, path);
                    return JSON.stringify(result);
                } catch (error) {
                    this.logger.warn('Failed to resolve step reference', {
                        reference: match,
                        error: (error as Error).message,
                    });
                    return match;
                }
            },
        );

        try {
            return JSON.parse(resolvedStr);
        } catch (error) {
            this.logger.error(
                'Failed to parse resolved arguments',
                error as Error,
            );
            return args; // Return original if parsing fails
        }
    }

    /**
     * Evaluate a path like "[0].id" or ".repositories[0].name" on an object
     */
    private evaluatePath(obj: unknown, path: string): unknown {
        if (!path || path === '') return obj;

        // Remove leading dot if present
        const cleanPath = path.startsWith('.') ? path.slice(1) : path;

        // Split path into segments, handling array notation
        const segments = cleanPath.match(/\w+|\[\d+\]/g) || [];

        let current = obj;
        for (const segment of segments) {
            if (segment.startsWith('[') && segment.endsWith(']')) {
                // Array index
                const index = parseInt(segment.slice(1, -1));
                current = (current as unknown[])[index];
            } else {
                // Object property
                current = (current as Record<string, unknown>)[segment];
            }

            if (current === undefined) {
                throw new Error(`Path segment "${segment}" not found`);
            }
        }

        return current;
    }

    /**
     * 🚀 Check if step should be expanded to parallel execution
     * This happens when step references an array result from previous step
     */
    private shouldExpandToParallel(
        currentStep: PlanStep,
        allSteps: PlanStep[],
    ): boolean {
        if (!currentStep.arguments || !currentStep.tool) {
            return false;
        }

        const argsStr = JSON.stringify(currentStep.arguments);

        // Check if arguments contain array references like {{step-1.result}}
        const arrayRefPattern = /\{\{step-(\d+)\.result\}\}/;
        const match = argsStr.match(arrayRefPattern);

        if (!match) {
            return false;
        }

        // Check if the referenced step result is an array
        const stepNum = parseInt(match[1] || '0');
        const referencedStep = allSteps[stepNum - 1];

        if (!referencedStep?.result) return false;

        return (
            Array.isArray(referencedStep.result) &&
            referencedStep.result.length > 1
        );
    }

    /**
     * 🔥 Expand a single step into parallel execution for array results
     */
    private expandToParallelExecution(
        currentStep: PlanStep,
        _context: PlannerExecutionContext,
    ): AgentThought {
        const argsStr = JSON.stringify(currentStep.arguments);
        const match = argsStr.match(/\{\{step-(\d+)\.result\}\}/);

        if (!match || !this.currentPlan) {
            throw new Error('Invalid state for parallel expansion');
        }

        const stepNum = parseInt(match[1] || '0');
        const referencedStep = this.currentPlan.steps[stepNum - 1];
        if (!referencedStep?.result) {
            throw new Error('Referenced step not found or has no result');
        }
        const arrayResult = referencedStep.result as unknown[];

        this.logger.info('🚀 Expanding to parallel execution', {
            stepId: currentStep.id,
            tool: currentStep.tool,
            arraySize: arrayResult.length,
        });

        // Create parallel tools action for each item in array
        const parallelTools = arrayResult.map((item, index) => {
            // Replace {{step-X.result}} with the actual item
            const itemArgs = JSON.parse(
                argsStr.replace(
                    /\{\{step-\d+\.result\}\}/,
                    JSON.stringify(item),
                ),
            );

            return {
                toolName: currentStep.tool!,
                input: itemArgs,
                reasoning: `${currentStep.description} (item ${index + 1}/${arrayResult.length})`,
            };
        });

        // Mark current step as executing
        currentStep.status = 'executing';

        return {
            reasoning: `Executing ${currentStep.tool} for ${arrayResult.length} items in parallel`,
            action: {
                type: 'parallel_tools' as const,
                tools: parallelTools,
                reasoning: `Processing ${arrayResult.length} items from previous step in parallel`,
                concurrency: Math.min(arrayResult.length, 5), // Limit concurrency
                failFast: false,
                aggregateResults: true,
            } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
            confidence: 0.9,
            metadata: {
                planId: this.currentPlan.id,
                stepId: currentStep.id,
                expandedToParallel: true,
                itemCount: arrayResult.length,
            },
        };
    }

    /**
     * Build comprehensive planning instructions
     */
    private buildPlanningInstructions(
        input: string,
        context: PlannerExecutionContext,
        availableTools: ToolMetadataForLLM[],
    ): string {
        return `🎯 CLAUDE CODE CLI STYLE PLANNING FOR: "${input}"

You are an intelligent planning agent similar to Claude Code CLI. Create a comprehensive execution plan that demonstrates expert-level software engineering thinking.

🎯 GOAL: ${input}
📊 CONTEXT: Iteration ${context.iterations} | Tools Available: ${availableTools.length} | Previous Attempts: ${context.history.length}

📋 CORE PLANNING PHILOSOPHY (CLAUDE CODE STYLE):
1. 🔍 ANALYSIS FIRST: Always start by understanding the current state and context
2. 🎯 GOAL DECOMPOSITION: Break complex goals into clear, measurable steps
3. 🚀 EXECUTION OPTIMIZATION: Plan for maximum efficiency and parallel execution
4. 🔄 ADAPTIVE STRATEGY: Include decision points and error recovery paths
5. ✅ VERIFICATION BUILT-IN: Each step should have clear success criteria

🧠 CLAUDE CODE INTELLIGENCE PATTERNS:
-- Think like a senior developer with deep contextual understanding
-- Consider edge cases and alternative approaches upfront
-- Plan for incremental progress with meaningful checkpoints
-- Optimize for user experience and clear progress communication
-- Integrate exploration, execution, and validation seamlessly

⚡ PARALLEL EXECUTION MASTERY:
IDENTIFY PARALLEL OPPORTUNITIES:
• File operations that don't conflict (read multiple files simultaneously)
• API calls to different services (fetch data from multiple sources)
• Independent validation and processing steps
• Search operations across different domains/scopes
• Batch operations on similar resources that can run concurrently

🚨 CRITICAL PARAMETER REQUIREMENTS:
- ALWAYS provide ALL required parameters for tools with CONCRETE VALUES
- Required parameters are marked with [REQUIRED] in tool descriptions
- NEVER use placeholders like "REPOSITORY_ID_AQUI", "USER_ID_HERE", "\${variable}", "<value>"
- NEVER use template strings or variables that need to be replaced later
- If a tool requires parameters you don't have from user input, you can:
  a) Reference previous step results using: {{step-X.result}} pattern
  b) Use a different tool that doesn't require those parameters
  c) Ask the user for the missing information
- NEVER call a tool without providing its required parameters
- Examples of FORBIDDEN placeholders: "REPOSITORY_ID_AQUI", "TODO", "FILL_IN", "\${id}", "<repositoryId>"

📋 REFERENCING PREVIOUS STEP RESULTS:
When you need to use data from a previous step, use the {{step-X.result}} pattern:
- {{step-1.result}} - Use the entire result from step-1
- {{step-1.result[0].id}} - Access first item's id from an array result
- {{step-2.result.repositories[0].name}} - Access nested properties

🚀 AUTOMATIC PARALLEL EXPANSION:
When a step references an ARRAY result, the system AUTOMATICALLY expands to parallel execution!
Instead of manually creating multiple steps, just reference the array:

Example:
Step 1: List repositories → returns [{id: "123", name: "repo1"}, {id: "456", name: "repo2"}]
Step 2: Get rules for ALL repos → use repositoryId: "{{step-1.result}}"
        → System will AUTOMATICALLY execute in parallel for each repository!

Benefits:
- No need to know array size in advance
- Automatic parallel execution for better performance
- Works with any array result from previous steps
- Smart concurrency limits to avoid overload

💡 COMPLETE WORKING EXAMPLE:
Input: "List all repositories and get Kody rules for each one"

Step 1:
{
  "id": "list_repos",
  "description": "List all available repositories",
  "tool": "listRepositories", 
  "arguments": {},
  "dependencies": []
}

Step 2:
{
  "id": "get_rules",
  "description": "Get Kody rules for each repository",
  "tool": "getKodyRules",
  "arguments": {
    "repositoryId": "{{step-1.result}}"
  },
  "dependencies": ["list_repos"]
}

The system will automatically:
1. Execute step 1 to get repositories array
2. Expand step 2 to run in parallel for each repository ID
3. Combine all results efficiently

EXECUTION CONTEXT:
- Iteration: ${context.iterations}
- Available tools: ${availableTools.length}
- Previous attempts: ${context.history.length}

TOOL EFFICIENCY GUIDELINES:
- Prefer tools that can handle multiple items at once
- Look for tools with "all", "bulk", "list" capabilities
- Avoid iterating through items individually when possible
- Use comprehensive queries over multiple specific ones
- PARALLEL EXECUTION OPPORTUNITIES:
  * When you need data from multiple independent sources
  * When performing similar operations on different resources
  * When validation and processing can happen simultaneously
  * When different aspects of a problem can be explored concurrently

PLAN FORMAT:
Each step should specify:
- Clear description of what to do
- Which tool to use (if any)
- ALL required parameters with concrete values
- Optional parameters when helpful
- Success criteria
- What to do if it fails

Create a robust plan that can handle errors and adapt as needed.`;
    }
}
