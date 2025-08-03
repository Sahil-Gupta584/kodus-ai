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
    ActionResult,
    ResultAnalysis,
    PlannerExecutionContext,
    StepExecution,
} from '../planner-factory.js';
import {
    isErrorResult,
    getResultError,
    getResultContent,
} from '../planner-factory.js';
import { ToolMetadataForLLM } from '../../../core/types/tool-types.js';
// import { getGlobalPersistor } from '../../../persistor/factory.js';
import {
    createResponseSynthesizer,
    type ResponseSynthesisContext,
} from '../../response/response-synthesizer.js';
// 🆕 NEW: Import do novo sistema de prompts domain-agnostic
import { PlannerPromptComposer } from './prompts/planner-prompt-composer.js';
import { createPlannerPromptComposer } from './prompts/factory.js';
import type { PlannerPromptConfig } from '../types/prompt-types.js';

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
    parallel?: boolean; // 🆕 NEW: Explicit parallel execution flag from LLM
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
    readonly name = 'Plan-and-Execute';
    private logger = createLogger('plan-execute-planner');
    // ✅ MULTI-TENANCY FIX: Store plans per thread/session instead of shared state
    private plansByThread = new Map<string, ExecutionPlan>();
    // private persistor = getGlobalPersistor();
    private responseSynthesizer: ReturnType<typeof createResponseSynthesizer>;
    // 🆕 NEW: Sistema de prompts domain-agnostic inteligente
    private promptComposer: PlannerPromptComposer;

    constructor(
        private llmAdapter: LLMAdapter,
        promptConfig?: PlannerPromptConfig,
    ) {
        this.responseSynthesizer = createResponseSynthesizer(this.llmAdapter);
        // 🆕 NEW: Inicializa o compositor de prompts com configuração opcional
        this.promptComposer = createPlannerPromptComposer(promptConfig);

        this.logger.info('Plan-and-Execute Planner initialized', {
            llmProvider: llmAdapter.getProvider?.()?.name || 'unknown',
            supportsStructured:
                llmAdapter.supportsStructuredGeneration?.() || false,
            supportsPlanning: !!llmAdapter.createPlan,
            availableTechniques: llmAdapter.getAvailableTechniques?.() || [],
            promptSystem: 'domain-agnostic-v1.0.0',
        });
    }

    /**
     * ✅ MULTI-TENANCY: Get unique thread identifier from context
     */
    private getThreadId(context: PlannerExecutionContext): string {
        const threadId =
            context.plannerMetadata?.thread?.id ||
            context.plannerMetadata?.correlationId ||
            'default-thread';

        return threadId;
    }

    /**
     * ✅ MULTI-TENANCY: Get plan for specific thread
     */
    private getCurrentPlan(
        context: PlannerExecutionContext,
    ): ExecutionPlan | null {
        const threadId = this.getThreadId(context);

        return this.plansByThread.get(threadId) || null;
    }

    /**
     * ✅ MULTI-TENANCY: Set plan for specific thread
     */
    private setCurrentPlan(
        context: PlannerExecutionContext,
        plan: ExecutionPlan | null,
    ): void {
        const threadId = this.getThreadId(context);
        if (plan === null) {
            this.plansByThread.delete(threadId);
        } else {
            this.plansByThread.set(threadId, plan);
        }

        this.logger.debug('Plan set for thread', {
            threadId,
            planId: plan?.id,
            status: plan?.status,
            totalPlans: this.plansByThread.size,
        });
    }

    /**
     * 🎯 RESPONSE SYNTHESIS: Criar resposta final conversacional
     */
    private async createFinalResponse(
        context: PlannerExecutionContext,
    ): Promise<string> {
        const currentPlan = this.getCurrentPlan(context);
        if (!currentPlan) {
            // ✅ FRAMEWORK BEST PRACTICE: Return empty response if no plan
            return '';
        }

        try {
            // Coletar todos os resultados da execução
            const executionResults = context.history.map((h) => h.result);

            // Preparar contexto para synthesis
            const synthesisContext: ResponseSynthesisContext = {
                originalQuery: context.input,
                plannerType: 'plan-execute',
                executionResults,
                planSteps: currentPlan.steps
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
                // ✅ FRAMEWORK PATTERN: Include dynamic planner reasoning
                plannerReasoning: this.buildDynamicReasoning(
                    context,
                    currentPlan,
                ),
                metadata: {
                    totalSteps: currentPlan.steps.length,
                    completedSteps: currentPlan.steps.filter(
                        (s) => s.status === 'completed',
                    ).length,
                    failedSteps: currentPlan.steps.filter(
                        (s) => s.status === 'failed',
                    ).length,
                    executionTime:
                        Date.now() -
                        ((currentPlan.metadata?.startTime as number) ||
                            Date.now()),
                    iterationCount: context.iterations,
                    planId: currentPlan.id,
                    strategy: currentPlan.strategy,
                },
            };

            // Usar Response Synthesizer para criar resposta conversacional
            const synthesizedResponse =
                await this.responseSynthesizer.synthesize(
                    synthesisContext,
                    'conversational',
                );

            // ✅ FRAMEWORK PATTERN: Extract final text from synthesized response
            // Filter out reasoning to return only user-facing content
            return this.extractFinalText(synthesizedResponse.content);
        } catch (error) {
            this.logger.error(
                'Failed to synthesize final response',
                error as Error,
                {
                    planId: currentPlan.id,
                },
            );

            // Fallback: resposta básica mas útil
            const completedSteps = currentPlan.steps.filter(
                (s) => s.status === 'completed',
            ).length;
            const failedSteps = currentPlan.steps.filter(
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
     * Extract final text from synthesized response, filtering out reasoning
     */
    private extractFinalText(content: unknown): string {
        // Handle different response formats from LLM
        if (typeof content === 'string') {
            return content;
        }

        if (Array.isArray(content)) {
            // Format: [{type: "reasoning", reasoning: "..."}, {type: "text", text: "..."}]
            const textEntry = content.find(
                (item) =>
                    item &&
                    typeof item === 'object' &&
                    'type' in item &&
                    item.type === 'text',
            );

            if (
                textEntry &&
                'text' in textEntry &&
                typeof textEntry.text === 'string'
            ) {
                return textEntry.text;
            }

            // Fallback: join all text content
            return content
                .filter((item) => item && typeof item === 'object')
                .map((item) => {
                    if ('text' in item) return item.text;
                    if ('content' in item) return item.content;
                    return '';
                })
                .filter(Boolean)
                .join(' ');
        }

        if (typeof content === 'object' && content !== null) {
            // Handle object format
            const obj = content as Record<string, unknown>;

            if ('text' in obj && typeof obj.text === 'string') {
                return obj.text;
            }

            if ('content' in obj && typeof obj.content === 'string') {
                return obj.content;
            }
        }

        // Fallback: convert to string
        return String(content || 'Response generated successfully');
    }

    /**
     * Build dynamic reasoning based on plan type and execution state
     */
    private buildDynamicReasoning(
        context: PlannerExecutionContext,
        plan: ExecutionPlan,
    ): string {
        if (plan.steps.length === 0) {
            // Empty plan - use original reasoning from LLM (e.g., "Simple greeting - no tools needed")
            return Array.isArray(plan.reasoning)
                ? plan.reasoning.join(' ')
                : plan.reasoning;
        } else {
            // Plan with steps - create reasoning based on execution results
            const completedSteps = plan.steps.filter(
                (s) => s.status === 'completed',
            ).length;
            const failedSteps = plan.steps.filter(
                (s) => s.status === 'failed',
            ).length;

            let dynamicReasoning = `Executed plan with ${plan.steps.length} steps: `;

            if (completedSteps > 0) {
                dynamicReasoning += `${completedSteps} completed successfully`;
            }

            if (failedSteps > 0) {
                dynamicReasoning += `${completedSteps > 0 ? ', ' : ''}${failedSteps} failed`;
            }

            // Include brief summary of execution results if available
            if (context.history.length > 0) {
                const recentResults = context.history
                    .slice(-2)
                    .map((h) => {
                        const content = getResultContent(h.result);
                        return typeof content === 'string'
                            ? content.substring(0, 100)
                            : 'result obtained';
                    })
                    .join('; ');

                dynamicReasoning += `. Recent results: ${recentResults}`;
            }

            return dynamicReasoning;
        }
    }

    /**
     * Get available tools for the current context from AgentContext
     */
    private getAvailableToolsForContext(
        context: PlannerExecutionContext,
    ): ToolMetadataForLLM[] {
        if (!context.agentContext?.availableToolsForLLM) {
            this.logger.debug('No tools available in AgentContext');
            return [];
        }

        this.logger.debug('Retrieved tools from AgentContext', {
            toolCount: context.agentContext.availableToolsForLLM.length,
            tools: context.agentContext.availableToolsForLLM.map((t) => t.name),
        });

        return context.agentContext.availableToolsForLLM;
    }

    /**
     * Get memory context for better planning using ContextBuilder APIs
     */
    private async getMemoryContext(
        context: PlannerExecutionContext,
        currentInput: string,
    ): Promise<string> {
        if (!context.agentContext) {
            this.logger.debug('No AgentContext available for memory access');
            return '';
        }

        const contextParts: string[] = [];

        try {
            // 1. MEMORY SEARCH: Get relevant memories for current input
            const memories = await context.agentContext.memory.search(
                currentInput,
                3,
            );
            if (memories && memories.length > 0) {
                contextParts.push('\n📚 Relevant knowledge:');
                memories.forEach((memory, i) => {
                    const memoryStr =
                        typeof memory === 'string'
                            ? memory
                            : JSON.stringify(memory);
                    contextParts.push(
                        `${i + 1}. ${memoryStr.substring(0, 100)}...`,
                    );
                });
            }

            // 2. SESSION HISTORY: Get recent conversation context
            const sessionHistory =
                await context.agentContext.session.getHistory();
            if (sessionHistory && sessionHistory.length > 0) {
                contextParts.push('\n💬 Recent conversation:');
                sessionHistory.slice(-2).forEach((entry, i) => {
                    const entryStr =
                        typeof entry === 'string'
                            ? entry
                            : JSON.stringify(entry);
                    contextParts.push(
                        `${i + 1}. ${entryStr.substring(0, 50)}...`,
                    );
                });
            }

            // 3. WORKING STATE: Get relevant planner state
            const plannerState =
                await context.agentContext.state.getNamespace('planner');
            if (plannerState && plannerState.size > 0) {
                contextParts.push('\n⚡ Current context:');
                let count = 0;
                for (const [key, value] of plannerState) {
                    if (count >= 3) break; // Limit to 3 items
                    const valueStr =
                        typeof value === 'string'
                            ? value
                            : JSON.stringify(value);
                    contextParts.push(
                        `- ${key}: ${valueStr.substring(0, 50)}...`,
                    );
                    count++;
                }
            }
        } catch (error) {
            this.logger.debug('Could not retrieve memory context', {
                error: error instanceof Error ? error.message : 'Unknown error',
                currentInput: currentInput.substring(0, 50),
            });
        }

        return contextParts.length > 0 ? contextParts.join('\n') : '';
    }

    async think(context: PlannerExecutionContext): Promise<AgentThought> {
        try {
            const currentPlan = this.getCurrentPlan(context);
            if (!currentPlan || this.shouldReplan(context)) {
                return await this.createPlan(context);
            }

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
        context: PlannerExecutionContext,
    ): Promise<AgentThought> {
        // 🔍 DEBUG: Monitor plan creation
        const availableTools = this.getAvailableToolsForContext(context);
        const input = context.input;

        // ✅ GET MEMORY CONTEXT using ContextBuilder APIs
        const memoryContext = await this.getMemoryContext(context, input);

        // ✅ Build planning history context
        const planningHistory = this.buildPlanningHistory(context);

        // ✅ Build identity context from AgentContext
        const agentIdentity = context.agentContext?.agentIdentity;

        // Use createPlan method with prompts from this planner
        if (!this.llmAdapter.createPlan) {
            throw new Error('LLM adapter must support createPlan method');
        }

        const composedPrompt = await this.promptComposer.composePrompt({
            goal: input,
            availableTools: availableTools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
            })),
            memoryContext,
            planningHistory,
            additionalContext: {
                ...context.plannerMetadata,
                agentIdentity,
                userContext:
                    context.agentContext?.agentExecutionOptions?.userContext,
            },
            iteration: 1,
            maxIterations: 5,
        });

        this.logger.debug('Composed intelligent prompt', {
            systemPromptLength: composedPrompt.systemPrompt.length,
            userPromptLength: composedPrompt.userPrompt.length,
            estimatedTokens: composedPrompt.metadata.estimatedTokens,
            includesSmartAnalysis:
                composedPrompt.metadata.includesSmartAnalysis,
            exampleCount: composedPrompt.metadata.exampleCount,
        });

        const planResult = await this.llmAdapter.createPlan(
            input,
            'plan-execute',
            {
                systemPrompt: composedPrompt.systemPrompt,
                userPrompt: composedPrompt.userPrompt,
            },
        );

        const plan = planResult;

        const steps = this.convertLLMResponseToSteps(plan);

        const newPlan: ExecutionPlan = {
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
                thread: context.plannerMetadata.thread?.id,
            },
        };

        // ✅ MULTI-TENANCY: Store plan per thread
        this.setCurrentPlan(context, newPlan);

        // Start executing first step
        return this.executeNextStep(context);
    }

    private async executeNextStep(
        context: PlannerExecutionContext,
    ): Promise<AgentThought> {
        const currentPlan = this.getCurrentPlan(context);

        if (!currentPlan) {
            throw new Error('No execution plan available');
        }

        const currentStep = currentPlan.steps[currentPlan.currentStepIndex];

        if (!currentStep) {
            // Plan completed or no steps were created
            currentPlan.status = 'completed';
            this.setCurrentPlan(context, currentPlan);

            // ✅ FRAMEWORK APPROACH: Use LLM's reasoning as response when no steps exist
            const hasSteps = currentPlan.steps.length > 0;

            let responseContent: string;

            if (hasSteps) {
                // Actual plan was executed - provide generic completion message
                responseContent = 'Plan execution completed successfully';
            } else {
                // No steps were created - use the LLM's reasoning as the direct response
                responseContent = Array.isArray(currentPlan.reasoning)
                    ? currentPlan.reasoning.join(' ')
                    : currentPlan.reasoning || 'Ready to respond';
            }

            return {
                reasoning: hasSteps
                    ? 'All plan steps completed successfully'
                    : 'No executable steps required - LLM provided direct response',
                action: {
                    type: 'final_answer',
                    content: responseContent,
                },
                metadata: {
                    planId: currentPlan.id,
                    completedSteps: currentPlan.steps.length,
                    executionHistory: context.history.length,
                    iterationCount: context.iterations,
                    responseSource: hasSteps
                        ? 'step_execution'
                        : 'llm_reasoning',
                },
            };
        }

        if (currentStep.arguments) {
            currentStep.arguments = this.resolveStepArguments(
                currentStep.arguments,
                currentPlan.steps,
            );
        }

        // 🚀 DYNAMIC PARALLEL EXPANSION: Check if step needs to be expanded for arrays
        if (this.shouldExpandToParallel(currentStep, currentPlan.steps)) {
            return this.expandToParallelExecution(currentStep, context);
        }

        // Use context history to adapt step execution
        const recentFailures = context.history
            .slice(-3)
            .filter((h) => isErrorResult(h.result));
        if (recentFailures.length >= 2) {
            currentStep.retry = (currentStep.retry || 0) + 1;
        }

        // Mark step as executing
        currentStep.status = 'executing';

        // ✅ VALIDAÇÃO - Verificar se a tool solicitada existe antes de executar
        const availableTools = this.getAvailableToolsForContext(context);
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

                parallelOpportunity.steps.forEach((step) => {
                    step.status = 'executing';
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
            reasoning: `Executing step ${currentPlan.currentStepIndex + 1}/${currentPlan.steps.length}: ${currentStep.description}. Context: ${context.history.length} previous actions, iteration ${context.iterations}`,
            action,
            confidence: this.calculateStepConfidence(currentStep, context),
            metadata: {
                planId: currentPlan.id,
                stepId: currentStep.id,
                stepIndex: currentPlan.currentStepIndex,
                totalSteps: currentPlan.steps.length,
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
        const currentPlan = this.getCurrentPlan(context);
        if (!currentPlan) {
            return {
                isComplete: true,
                isSuccessful: true,
                feedback: 'No plan to analyze',
                shouldContinue: false,
            };
        }

        if (result.type === 'final_answer') {
            currentPlan.status = 'completed';
            this.setCurrentPlan(context, currentPlan);

            // ✅ FRAMEWORK PATTERN: Add final_answer to history to maintain consistency
            // This ensures Response Synthesizer has access to the reasoning from empty plans
            const stepExecution: StepExecution = {
                stepId: `step-final-${Date.now()}`,
                stepNumber: context.history.length + 1,
                thought: {
                    reasoning: currentPlan.reasoning,
                    action: {
                        type: 'final_answer',
                        content: result.content,
                    },
                },
                action: {
                    type: 'final_answer',
                    content: result.content,
                },
                result: result,
                observation: {
                    isComplete: true,
                    isSuccessful: true,
                    feedback: result.content || 'Task completed',
                    shouldContinue: false,
                },
                metadata: {
                    startTime: Date.now(),
                    duration: 0, // Instant response for empty plan

                    toolCalls: 0,
                    success: true,
                    toolsUsed: [],
                    contextSnapshot: {
                        iteration: context.iterations,
                        totalSteps: context.history.length + 1,
                        remainingIterations:
                            context.maxIterations - context.iterations,
                    },
                },
            };
            context.history.push(stepExecution);

            const synthesizedResponse = await this.createFinalResponse(context);

            return {
                isComplete: true,
                isSuccessful: true,
                feedback: synthesizedResponse,
                shouldContinue: false,
            };
        }

        const currentStep = currentPlan.steps[currentPlan.currentStepIndex];

        if (!currentStep) {
            return {
                isComplete: true,
                isSuccessful: true,
                feedback: 'Plan execution completed',
                shouldContinue: false,
            };
        }

        if (isErrorResult(result)) {
            currentStep.status = 'failed';
            currentStep.result = { error: getResultError(result) };

            const shouldReplan = await this.shouldReplanOnFailure(
                result,
                context,
            );

            if (shouldReplan) {
                currentPlan.status = 'replanning';
                this.setCurrentPlan(context, currentPlan);
                return {
                    isComplete: false,
                    isSuccessful: false,
                    feedback: `Step failed: ${result.error}. Will replan from this point.`,
                    shouldContinue: true,
                    suggestedNextAction: 'Replan execution strategy',
                };
            } else {
                currentPlan.status = 'failed';
                this.setCurrentPlan(context, currentPlan);

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

        if (result.type === 'tool_results') {
            const parallelResults = result.content as Array<{
                toolName: string;
                result?: unknown;
                error?: string;
            }>;

            let stepsCompleted = 0;
            const startIndex = currentPlan.currentStepIndex;

            for (
                let i = startIndex;
                i < currentPlan.steps.length &&
                stepsCompleted < parallelResults.length;
                i++
            ) {
                const step = currentPlan.steps[i];
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

            currentPlan.currentStepIndex = startIndex + stepsCompleted;
        } else {
            const stepResult = getResultContent(result);
            currentStep.status = 'completed';
            currentStep.result = stepResult;

            currentPlan.currentStepIndex++;
        }

        const isLastStep =
            currentPlan.currentStepIndex >= currentPlan.steps.length;

        if (isLastStep) {
            currentPlan.status = 'completed';

            const synthesizedResponse = await this.createFinalResponse(context);

            return {
                isComplete: true,
                isSuccessful: true,
                feedback: synthesizedResponse,
                shouldContinue: false,
            };
        }

        return {
            isComplete: false,
            isSuccessful: true,
            feedback: `✅ Step completed: ${currentStep.description}. Progress: ${currentPlan.currentStepIndex}/${currentPlan.steps.length}`,
            shouldContinue: true,
            suggestedNextAction: `Next: ${currentPlan.steps[currentPlan.currentStepIndex]?.description}`,
        };
    }

    private shouldReplan(context: PlannerExecutionContext): boolean {
        const currentPlan = this.getCurrentPlan(context);
        if (!currentPlan) {
            return true;
        }

        // Replan if status indicates replanning needed
        if (currentPlan.status === 'replanning') {
            return true;
        }

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
        const errorMessage = getResultError(result)?.toLowerCase() || '';

        const unrecoverableErrors = [
            'permission denied',
            'not found',
            'invalid credentials',
            'unauthorized',
        ];

        if (unrecoverableErrors.some((err) => errorMessage.includes(err))) {
            return false;
        }

        return context.iterations < 3;
    }

    private calculateStepConfidence(
        step: PlanStep,
        context: PlannerExecutionContext,
    ): number {
        let confidence = 0.7; // Base confidence

        // Higher confidence for tool-based actions
        if (step.tool) {
            confidence += 0.2;
        }

        // Higher confidence for steps with clear descriptions
        if (step.description && step.description.length > 20) {
            confidence += 0.1;
        }

        // Lower confidence for verification steps (harder to predict)
        if (step.type === 'verification') {
            confidence -= 0.1;
        }

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
        const availableTools = this.getAvailableToolsForContext(context);
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
            id: (step.id as string) || `step-${index + 1}`,
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
                step.parameters ||
                step.argsTemplate) as Record<string, unknown>,
            dependencies:
                (step.dependsOn as string[]) ||
                (index > 0 ? [`step-${index}`] : []),
            status: 'pending' as const,
            retry: 0,
            parallel: (step.parallel as boolean) || false,
        }));

        const invalidSteps = this.validateStepsForPlaceholders(convertedSteps);
        if (invalidSteps.length > 0) {
            this.logger.warn(
                '🚨 Plan contains invalid placeholders or validation errors',
                {
                    invalidSteps: invalidSteps.map((s) => ({
                        id: s.id,
                        tool: s.tool,
                        placeholders: s.placeholders,
                    })),
                },
            );

            let errorMessage =
                'Não consegui criar um plano executável. Encontrei os seguintes problemas:\n\n';

            for (const invalidStep of invalidSteps) {
                errorMessage += `Step "${invalidStep.id}" (${invalidStep.tool || 'unknown tool'}):\n`;
                errorMessage += `  - Problemas encontrados: ${invalidStep.placeholders.join(', ')}\n\n`;
            }

            errorMessage +=
                'Preciso de valores concretos para executar as ferramentas. Por favor, forneça os valores específicos necessários.';

            return [
                {
                    id: 'step-1',
                    description: errorMessage,
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
     * ✅ SIMPLE: Check steps for obviously bad placeholder values
     * Focused validation - only catch real problems, not valid template usage
     */
    private validateStepsForPlaceholders(steps: PlanStep[]): Array<{
        id: string;
        tool?: string;
        placeholders: string[];
    }> {
        const invalidSteps: Array<{
            id: string;
            tool?: string;
            placeholders: string[];
        }> = [];

        // Only check for obviously problematic placeholders
        const badPlaceholders = [
            'REPOSITORY_ID',
            'USER_ID',
            'TEAM_ID',
            'ORG_ID',
            'TODO',
            'PLACEHOLDER',
            'FILL_IN',
            'REPLACE_WITH',
            'YOUR_*_HERE',
            'INSERT_*_HERE',
            'CHANGE_THIS',
            'UPDATE_ME',
        ];

        for (const step of steps) {
            // ✅ SKIP steps without arguments or tools
            if (!step.arguments || !step.tool) continue;

            const argsStr = JSON.stringify(step.arguments).toUpperCase();
            const foundPlaceholders: string[] = [];

            // Check for obviously bad placeholders
            for (const placeholder of badPlaceholders) {
                if (argsStr.includes(placeholder)) {
                    foundPlaceholders.push(placeholder);
                }
            }

            // Check for suspicious empty required fields (simple check)
            if (typeof step.arguments === 'object') {
                for (const [key, value] of Object.entries(step.arguments)) {
                    if (typeof value === 'string' && value.trim() === '') {
                        foundPlaceholders.push(`Empty ${key}`);
                    }
                }
            }

            if (foundPlaceholders.length > 0) {
                invalidSteps.push({
                    id: step.id,
                    tool: step.tool,
                    placeholders: [...new Set(foundPlaceholders)], // Remove duplicates
                });
            }
        }

        return invalidSteps;
    }

    /**
     * Build enhanced tools context for Plan-Execute
     */
    //     private buildToolsContextForPlanExecute(
    //         tools: ToolMetadataForLLM[],
    //     ): string {
    //         if (tools.length === 0) {
    //             return `No external tools available. The system will handle responses automatically.
    // IMPORTANT: Since no tools are available, you should return an empty plan [] and let the Response Synthesizer handle the user query.`;
    //         }

    //         // Group tools by MCP prefix for clean organization
    //         const toolsByPrefix = new Map<string, ToolMetadataForLLM[]>();

    //         tools.forEach((tool) => {
    //             const prefix = tool.name.split('.')[0] || 'other';
    //             if (!toolsByPrefix.has(prefix)) {
    //                 toolsByPrefix.set(prefix, []);
    //             }
    //             toolsByPrefix.get(prefix)!.push(tool);
    //         });

    //         let context = '';
    //         const sortedPrefixes = Array.from(toolsByPrefix.keys()).sort();

    //         sortedPrefixes.forEach((prefix, index) => {
    //             if (index > 0) {
    //                 context += '\n---\n\n'; // Separator between MCP groups
    //             }

    //             const prefixTools = toolsByPrefix.get(prefix)!;
    //             prefixTools.forEach((tool) => {
    //                 context += `- ${tool.name}: ${tool.description}\n`;

    //                 // Include parameter information
    //                 if (tool.parameters && typeof tool.parameters === 'object') {
    //                     const params = tool.parameters as Record<string, unknown>;
    //                     const properties = params.properties as Record<
    //                         string,
    //                         unknown
    //                     >;
    //                     const required = params.required as string[];

    //                     if (properties && Object.keys(properties).length > 0) {
    //                         context += `  Parameters:\n`;
    //                         Object.entries(properties).forEach(
    //                             ([paramName, paramInfo]) => {
    //                                 const info = paramInfo as Record<
    //                                     string,
    //                                     unknown
    //                                 >;
    //                                 const isRequired =
    //                                     required?.includes(paramName);
    //                                 const type = info.type || 'string';
    //                                 const description = info.description || '';

    //                                 context += `    - ${paramName} (${type})${isRequired ? ' [REQUIRED]' : ' [optional]'}: ${description}\n`;
    //                             },
    //                         );
    //                     }
    //                 }
    //             });
    //         });

    //         context += `\nIMPORTANT: Only use tools that are listed above. If you need functionality that's not available, return an empty plan [] to let the Response Synthesizer handle the user query directly.`;

    //         return context;
    //     }

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
        context: PlannerExecutionContext,
    ): {
        canExecuteInParallel: boolean;
        steps: PlanStep[];
        reason?: string;
    } {
        const currentPlan = this.getCurrentPlan(context);
        if (!currentPlan) {
            return { canExecuteInParallel: false, steps: [currentStep] };
        }

        // Get remaining pending steps
        const remainingSteps = currentPlan.steps
            .slice(currentPlan.currentStepIndex)
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
                const depStep = currentPlan.steps.find((s) => s.id === depId);
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
     * Create single tool action with intelligent fallback
     * Never exposes internal architecture details to users
     */
    private createSingleToolAction(
        step: PlanStep,
        availableToolNames: string[],
    ): { type: string; [key: string]: unknown } {
        if (step.tool && step.tool !== 'none') {
            if (!availableToolNames.includes(step.tool)) {
                // ✅ INTELLIGENT FALLBACK - Use step description instead of exposing technical details
                // The planner should have created a meaningful description for this scenario
                return {
                    type: 'final_answer',
                    content: step.description, // Trust the planner's description, don't mention "tools"
                };
            } else {
                // Tool exists and is available - execute it
                return {
                    type: 'tool_call',
                    toolName: step.tool,
                    input: step.arguments || {},
                };
            }
        } else {
            // No tool needed - this is a conversational response
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

        this.logger.info('🔧 RESOLVING STEP ARGUMENTS', {
            originalArgs: args,
            argsStr,
            availableSteps: allSteps.map((s) => ({
                id: s.id,
                status: s.status,
                hasResult: !!s.result,
                resultType: typeof s.result,
                resultPreview: s.result
                    ? JSON.stringify(s.result).substring(0, 200)
                    : 'no result',
            })),
        });

        // Pattern to match {{step-X.result...}} references (supports both numbers and IDs)
        const resolvedStr = argsStr.replace(
            /\{\{([^.}]+)\.result([\w\[\]\.]*)\}\}/g,
            (match, stepIdentifier, path) => {
                this.logger.info('🔍 TEMPLATE MATCH FOUND', {
                    match,
                    stepIdentifier,
                    path,
                });

                let step: PlanStep | undefined;

                // Try to find step by number (step-1, step-2, etc.)
                if (stepIdentifier.startsWith('step-')) {
                    const stepNum = parseInt(stepIdentifier.substring(5));
                    const stepIndex = stepNum - 1;
                    step = allSteps[stepIndex];
                    this.logger.info('🔢 STEP BY NUMBER', {
                        stepNum,
                        stepIndex,
                        found: !!step,
                    });
                } else {
                    // Try to find step by ID
                    step = allSteps.find((s) => s.id === stepIdentifier);
                    this.logger.info('🆔 STEP BY ID', {
                        stepIdentifier,
                        found: !!step,
                    });
                }

                if (!step || !step.result) {
                    this.logger.warn('❌ STEP REFERENCE NOT RESOLVED', {
                        reference: match,
                        stepIdentifier,
                        stepFound: !!step,
                        hasResult: !!step?.result,
                        stepResult: step?.result,
                        availableSteps: allSteps.map((s) => ({
                            id: s.id,
                            status: s.status,
                            hasResult: !!s.result,
                        })),
                    });
                    return match; // Keep original if can't resolve
                }

                try {
                    // Evaluate the path to get the value
                    const result = this.evaluatePath(step.result, path);
                    this.logger.info('✅ STEP REFERENCE RESOLVED', {
                        reference: match,
                        stepIdentifier,
                        path,
                        resultType: typeof result,
                        resultValue: JSON.stringify(result).substring(0, 500),
                    });
                    return JSON.stringify(result);
                } catch (error) {
                    this.logger.warn('❌ FAILED TO RESOLVE STEP REFERENCE', {
                        reference: match,
                        stepIdentifier,
                        path,
                        stepResult: step.result,
                        error: (error as Error).message,
                    });
                    return match;
                }
            },
        );

        try {
            const resolvedArgs = JSON.parse(resolvedStr);
            this.logger.info('🎯 STEP ARGUMENTS RESOLVED SUCCESSFULLY', {
                originalArgs: args,
                resolvedArgs,
                resolvedStr,
            });
            return resolvedArgs;
        } catch (error) {
            this.logger.error(
                'Failed to parse resolved arguments',
                error as Error,
            );
            this.logger.warn('❌ FAILED TO PARSE RESOLVED ARGUMENTS', {
                originalArgs: args,
                resolvedStr,
            });
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

        // 🆕 NEW: Check if step explicitly marked as parallel by LLM
        if ('parallel' in currentStep && currentStep.parallel === true) {
            this.logger.info('🚀 STEP MARKED FOR PARALLEL EXECUTION', {
                stepId: currentStep.id,
                explicitParallel: true,
            });
        }

        const argsStr = JSON.stringify(currentStep.arguments);

        // Check if arguments contain array references like {{step-1.result}} or {{stepId.result}}
        const arrayRefPattern = /\{\{([^.}]+)\.result\}\}/;
        const match = argsStr.match(arrayRefPattern);

        if (!match) {
            return false;
        }

        // Check if the referenced step result is an array
        const stepIdentifier = match[1];
        if (!stepIdentifier) {
            return false;
        }

        let referencedStep: PlanStep | undefined;

        // Try to find step by number (step-1, step-2, etc.)
        if (stepIdentifier.startsWith('step-')) {
            const stepNum = parseInt(stepIdentifier.substring(5));
            const stepIndex = stepNum - 1;
            referencedStep = allSteps[stepIndex];
        } else {
            // Try to find step by ID
            referencedStep = allSteps.find((s) => s.id === stepIdentifier);
        }

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
        context: PlannerExecutionContext,
    ): AgentThought {
        const argsStr = JSON.stringify(currentStep.arguments);
        const match = argsStr.match(/\{\{([^.}]+)\.result\}\}/);

        const currentPlan = this.getCurrentPlan(context);
        if (!match || !currentPlan) {
            throw new Error('Invalid state for parallel expansion');
        }

        const stepIdentifier = match[1];
        if (!stepIdentifier) {
            throw new Error('Step identifier not found in reference');
        }

        let referencedStep: PlanStep | undefined;

        // Try to find step by number (step-1, step-2, etc.)
        if (stepIdentifier.startsWith('step-')) {
            const stepNum = parseInt(stepIdentifier.substring(5));
            const stepIndex = stepNum - 1;
            referencedStep = currentPlan.steps[stepIndex];
        } else {
            // Try to find step by ID
            referencedStep = currentPlan.steps.find(
                (s) => s.id === stepIdentifier,
            );
        }

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
            // Replace {{step-X.result}} or {{stepId.result}} with the actual item
            const itemArgs = JSON.parse(
                argsStr.replace(/\{\{[^.}]+\.result\}\}/, JSON.stringify(item)),
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
                planId: currentPlan.id,
                stepId: currentStep.id,
                expandedToParallel: true,
                itemCount: arrayResult.length,
            },
        };
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🆕 NEW: Prompt system management
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * 🆕 Update prompt configuration dynamically
     * Allows runtime customization of prompt behavior
     */
    updatePromptConfig(config: PlannerPromptConfig): void {
        this.promptComposer = createPlannerPromptComposer(config);
        this.logger.info('Prompt configuration updated', {
            hasCustomExamples: !!config.customExamples?.length,
            hasExamplesProvider: !!config.examplesProvider,
            hasPatternsProvider: !!config.patternsProvider,
            additionalPatterns: config.additionalPatterns?.length || 0,
            behavior: config.behavior || {},
        });
    }

    /**
     * 🆕 Get current prompt composition statistics
     */
    getPromptStats(): {
        cacheSize: number;
        version: string;
    } {
        const cacheStats = this.promptComposer.getCacheStats();
        return {
            cacheSize: cacheStats.size,
            version: '1.0.0',
        };
    }

    /**
     * 🆕 Clear prompt cache (useful for testing or memory management)
     */
    clearPromptCache(): void {
        this.promptComposer.clearCache();
        this.logger.debug('Prompt cache cleared');
    }
}
