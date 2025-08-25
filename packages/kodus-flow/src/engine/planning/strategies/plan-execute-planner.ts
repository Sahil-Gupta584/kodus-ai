import {
    createLogger,
    getObservability,
} from '../../../observability/index.js';
import { createEvent, EVENT_TYPES } from '../../../core/types/events.js';
import { IdGenerator } from '../../../utils/id-generator.js';
import { getGlobalMemoryManager } from '../../../core/memory/memory-manager.js';
import type { LLMAdapter } from '../../../adapters/llm/index.js';
import type {
    Planner,
    AgentThought,
    AgentAction,
    ActionResult,
    ResultAnalysis,
    PlannerExecutionContext,
} from '../planner-factory.js';

import {
    isErrorResult,
    getResultError,
    getResultContent,
} from '../planner-factory.js';
import { ToolMetadataForLLM } from '../../../core/types/tool-types.js';
import {
    createResponseSynthesizer,
    type ResponseSynthesisContext,
} from '../../response/response-synthesizer.js';
import { PlannerPromptComposer } from './prompts/planner-prompt-composer.js';
import { createPlannerPromptComposer } from './prompts/factory.js';
import type { PlannerPromptConfig } from '../types/prompt-types.js';
import type {
    ReplanPolicyConfig,
    PlanStep,
    ExecutionPlan,
    ReplanContext,
    ReplanContextData,
} from '../../../core/types/planning-shared.js';
import { UNIFIED_STATUS } from '../../../core/types/planning-shared.js';

// Re-export for compatibility
export type {
    ReplanPolicyConfig,
    PlanStep,
    ExecutionPlan,
} from '../../../core/types/planning-shared.js';

/**
 * Helper to create a proper Event for telemetry
 */
function createTelemetryEvent(
    type: string,
    data: Record<string, unknown> = {},
) {
    return createEvent(
        EVENT_TYPES.SYSTEM_INFO,
        { message: type, ...data },
        {
            threadId: IdGenerator.callId(),
        },
    );
}

export class PlanAndExecutePlanner implements Planner {
    readonly name = 'Plan-and-Execute';
    private logger = createLogger('plan-execute-planner');
    private plansByThread = new Map<string, ExecutionPlan>();
    private responseSynthesizer: ReturnType<typeof createResponseSynthesizer>;
    private promptComposer: PlannerPromptComposer;

    // Replan policy configuration (from agent config)
    private replanPolicy: ReplanPolicyConfig;

    constructor(
        private llmAdapter: LLMAdapter,
        promptConfig?: PlannerPromptConfig,
        replanPolicy?: ReplanPolicyConfig,
    ) {
        this.responseSynthesizer = createResponseSynthesizer(this.llmAdapter);
        this.promptComposer = createPlannerPromptComposer(promptConfig);
        this.replanPolicy = replanPolicy ?? {
            maxReplans: 5, // ✅ DEFAULT: Fallback configuration
            toolUnavailable: 'replan',
        };
    }

    // ✅ REMOVED: Configuration now comes from constructor

    private getThreadId(context: PlannerExecutionContext): string {
        const threadId =
            context.plannerMetadata?.thread?.id ||
            context.plannerMetadata?.correlationId ||
            'default-thread';

        return threadId;
    }

    private getCurrentPlan(
        context: PlannerExecutionContext,
    ): ExecutionPlan | null {
        const threadId = this.getThreadId(context);

        return this.plansByThread.get(threadId) || null;
    }

    // Public accessor for current plan (for external executor)
    public getPlanForContext(
        context: PlannerExecutionContext,
    ): ExecutionPlan | null {
        return this.getCurrentPlan(context);
    }

    private setCurrentPlan(
        context: PlannerExecutionContext,
        plan: ExecutionPlan | null,
    ): void {
        const threadId = this.getThreadId(context);

        if (!plan) {
            this.plansByThread.delete(threadId);
        } else {
            this.plansByThread.set(threadId, plan);
        }
    }

    public async createFinalResponse(
        context: PlannerExecutionContext,
    ): Promise<string> {
        const currentPlan = this.getCurrentPlan(context);

        try {
            const { agentContext } = context;

            // Guard clause for missing agentContext
            if (!agentContext) {
                throw new Error(
                    'AgentContext is required for final response generation',
                );
            }

            const blocks: string[] = [];

            // 1) Observations from memory (relevant knowledge)
            const memoryManager = getGlobalMemoryManager();
            const searchResults = await memoryManager.search(context.input, {
                topK: 3,
                filter: {
                    tenantId: agentContext.tenantId,
                    sessionId: agentContext.sessionId,
                },
            });
            if (searchResults && searchResults.length > 0) {
                for (const result of searchResults) {
                    const content =
                        result.metadata?.content || result.text || 'No content';
                    blocks.push(`<observation>\n${content}\n</observation>`);
                }
            }

            // 2) Recent session entries (tool calls/results, messages, errors, planning events)
            const sessionHistory = await agentContext.conversation.getHistory();
            if (sessionHistory && sessionHistory.length > 0) {
                const recent = sessionHistory.slice(-3);
                for (const entry of recent) {
                    const entryObj = entry as Record<string, unknown>;
                    const input = entryObj.input as
                        | Record<string, unknown>
                        | undefined;
                    const output = entryObj.output as
                        | Record<string, unknown>
                        | undefined;

                    // Tool call + result
                    if (input?.type === 'tool_call') {
                        const toolName =
                            (input.toolName as string) || 'unknown_tool';
                        const params = input.params ?? {};
                        blocks.push(
                            `<action name="${toolName}">\n${JSON.stringify(
                                params,
                                null,
                                2,
                            )}\n</action>`,
                        );

                        if (output?.type === 'tool_result') {
                            const result = output.result ?? {};
                            blocks.push(
                                `<result name="${toolName}">\n${JSON.stringify(
                                    result,
                                    null,
                                    2,
                                )}\n</result>`,
                            );
                        }
                    }

                    // Human/assistant messages
                    if (input?.type === 'message') {
                        const role = (input.role as string) || 'user';
                        const contentVal = input.content;
                        const content =
                            typeof contentVal === 'string'
                                ? contentVal
                                : JSON.stringify(contentVal ?? {}, null, 2);
                        blocks.push(
                            role === 'user'
                                ? `<human>\n${content}\n</human>`
                                : `<assistant>\n${content}\n</assistant>`,
                        );
                    }

                    // Errors
                    if (
                        input?.type === 'error' ||
                        output?.type === 'error_details'
                    ) {
                        const message =
                            (output?.message as string) ||
                            (input?.['message'] as string) ||
                            'Unknown error';
                        const stack = (output?.stack as string) || undefined;
                        const payload = stack
                            ? { message, stack }
                            : { message };
                        blocks.push(
                            `<error>\n${JSON.stringify(payload, null, 2)}\n</error>`,
                        );
                    }

                    // Planning events as observations
                    if (input?.type === 'plan_created') {
                        const goal = input.goal as string | undefined;
                        const payload = goal
                            ? { event: 'plan_created', goal }
                            : { event: 'plan_created' };
                        blocks.push(
                            `<observation>\n${JSON.stringify(payload, null, 2)}\n</observation>`,
                        );
                    }

                    if (output?.type === 'plan_completed') {
                        blocks.push(
                            `<observation>\n${JSON.stringify(
                                { event: 'plan_completed' },
                                null,
                                2,
                            )}\n</observation>`,
                        );
                    }
                }
            }

            const executionResults = context.history.map((h) => h.result);
            if (blocks.length > 0) {
                executionResults.push({
                    type: 'final_answer',
                    content: blocks.join('\n\n'),
                });
            }

            const synthesisContext: ResponseSynthesisContext = {
                originalQuery: context.input,
                plannerType: 'plan-execute',
                executionResults,
                planSteps: currentPlan?.steps
                    .filter(
                        (step) =>
                            step.status === UNIFIED_STATUS.COMPLETED ||
                            step.status === UNIFIED_STATUS.FAILED ||
                            step.status === UNIFIED_STATUS.SKIPPED,
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
                    totalSteps: currentPlan?.steps.length || 0,
                    completedSteps:
                        currentPlan?.steps.filter(
                            (s) => s.status === UNIFIED_STATUS.COMPLETED,
                        ).length || 0,
                    failedSteps:
                        currentPlan?.steps.filter(
                            (s) => s.status === UNIFIED_STATUS.FAILED,
                        ).length || 0,
                    executionTime:
                        Date.now() -
                        ((currentPlan?.metadata?.startTime as number) ||
                            Date.now()),
                    iterationCount: context.iterations,
                    planId: currentPlan?.id,
                    strategy: currentPlan?.strategy,
                },
            };

            // ✅ FALLBACK COM ATÉ 2 TENTATIVAS
            let synthesizedResponse;
            let lastError: Error | null = null;

            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    synthesizedResponse =
                        await this.responseSynthesizer.synthesize(
                            synthesisContext,
                            'conversational',
                        );

                    const finalText = this.extractFinalText(
                        synthesizedResponse.content,
                    );

                    if (finalText && finalText.trim()) {
                        // ✅ SETAR STATUS FINAL_ANSWER_RESULT
                        if (currentPlan) {
                            currentPlan.status =
                                UNIFIED_STATUS.FINAL_ANSWER_RESULT;
                            this.setCurrentPlan(context, currentPlan);
                        }

                        return finalText;
                    }

                    this.logger.warn('Empty response from LLM, retrying...', {
                        attempt,
                        planId: currentPlan?.id,
                    });
                } catch (error) {
                    lastError = error as Error;

                    this.logger.warn('LLM synthesis failed, retrying...', {
                        attempt,
                        error: lastError.message,
                        planId: currentPlan?.id,
                    });

                    if (attempt === 3) {
                        break;
                    }

                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }

            this.logger.error(
                'All LLM synthesis attempts failed',
                lastError as Error,
                {
                    planId: currentPlan?.id,
                    attempts: 3,
                },
            );

            throw new Error(
                `LLM synthesis failed after 3 attempts: ${
                    lastError?.message || 'Unknown error'
                }`,
            );
        } catch (error) {
            this.logger.error(
                'Failed to synthesize final response',
                error as Error,
                {
                    planId: currentPlan?.id,
                },
            );

            throw error;
        }
    }

    private extractFinalText(content: unknown): string {
        if (typeof content === 'string') {
            return content;
        }

        if (Array.isArray(content)) {
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

            return content
                .filter((item) => item && typeof item === 'object')
                .map((item) => {
                    if ('text' in item) {
                        return item.text;
                    }
                    if ('content' in item) {
                        return item.content;
                    }

                    return 'No content available';
                })
                .filter(Boolean)
                .join(' ');
        }

        if (typeof content === 'object' && content !== null) {
            const obj = content as Record<string, unknown>;

            if ('text' in obj && typeof obj.text === 'string') {
                return obj.text;
            }

            if ('content' in obj && typeof obj.content === 'string') {
                return obj.content;
            }
        }

        if (!content) {
            throw new Error('LLM response content is empty or null');
        }

        return String(content);
    }

    private getAvailableToolsForContext(
        context: PlannerExecutionContext,
    ): ToolMetadataForLLM[] {
        if (!context.agentContext?.allTools) {
            return [];
        }

        return context.agentContext.allTools.map((tool) => ({
            name: tool.name,
            description: tool.description || `Tool: ${tool.name}`,
            parameters: tool.inputJsonSchema?.parameters || {
                type: 'object',
                properties: {},
                required: [],
            },
        }));
    }

    private getAvailableToolsForPlanning(
        context: PlannerExecutionContext,
    ): Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
    }> {
        if (!context.agentContext?.allTools) {
            return [];
        }

        return context.agentContext.allTools.map((tool) => ({
            name: tool.name,
            description: tool.description || `Tool: ${tool.name}`,
            parameters: tool.inputJsonSchema?.parameters || {
                type: 'object',
                properties: {},
                required: [],
            },
            outputSchema: tool.outputJsonSchema?.parameters || {
                type: 'object',
                properties: {},
                required: [],
            },
        }));
    }

    private async getMemoryContext(
        context: PlannerExecutionContext,
        currentInput: string,
    ): Promise<string> {
        if (!context.agentContext) {
            this.logger.debug('No AgentContext available for memory access');
            return 'No memory context available';
        }

        try {
            if (context.agentContext.messageContext) {
                const enhancedContext =
                    await context.agentContext.messageContext.getContextForModel(
                        context.agentContext,
                        currentInput,
                    );

                if (enhancedContext) {
                    return enhancedContext;
                }
            }

            const contextParts: string[] = [];

            const memoryManager = getGlobalMemoryManager();
            const searchResults = await memoryManager.search(currentInput, {
                topK: 3,
                filter: {
                    tenantId: context.agentContext.tenantId,
                    sessionId: context.agentContext.sessionId,
                },
            });
            if (searchResults && searchResults.length > 0) {
                contextParts.push('\n📚 Relevant knowledge:');
                searchResults.forEach((result, i) => {
                    const memoryStr =
                        result.metadata?.content || result.text || 'No content';
                    contextParts.push(`${i + 1}. ${memoryStr}`);
                });
            }

            const sessionHistory =
                await context.agentContext.conversation.getHistory();
            if (sessionHistory && sessionHistory.length > 0) {
                const relevantEntries = sessionHistory
                    .filter((entry) => {
                        const entryObj = entry as Record<string, unknown>;
                        const input = entryObj.input as Record<string, unknown>;

                        // Only include user inputs and final responses
                        return (
                            input?.type === 'memory_context_request' ||
                            input?.type === 'plan_completed'
                        );
                    })
                    .slice(-3); // Get last 3 relevant entries

                if (relevantEntries.length > 0) {
                    contextParts.push('\n💬 Recent conversation:');
                    relevantEntries.forEach((entry, i) => {
                        const formattedEntry = this.formatSessionEntry(entry);
                        if (formattedEntry) {
                            contextParts.push(`${i + 1}. ${formattedEntry}`);
                        }
                    });
                }
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
                    contextParts.push(`- ${key}: ${valueStr}`);
                    count++;
                }
            }

            // ✅ ENHANCED: Use ContextManager for unified operations
            if (context.agentContext.contextManager) {
                await context.agentContext.contextManager.addToContext(
                    'state',
                    'planner_lastInput',
                    currentInput,
                    context.agentContext,
                );

                await context.agentContext.contextManager.addToContext(
                    'session',
                    'memory_context_request',
                    { input: currentInput, timestamp: Date.now() },
                    context.agentContext,
                );
            } else {
                // ✅ FALLBACK: Use traditional APIs
                await context.agentContext.state.set(
                    'planner',
                    'lastInput',
                    currentInput,
                );

                // ✅ CLEAN ARCHITECTURE: Use telemetry for runtime debug data instead of polluting conversation
                if (context.agentContext) {
                    const observability = getObservability();
                    void observability.telemetry.traceEvent(
                        createTelemetryEvent('memory_context_request', {
                            input: currentInput,
                            context: contextParts.join('\n'),
                            sessionId: context.agentContext.sessionId,
                            agentName: context.agentContext.agentName,
                            correlationId: context.agentContext.correlationId,
                        }),
                        async () => {
                            return {};
                        },
                    );
                }
            }

            return contextParts.join('\n');
        } catch (error) {
            this.logger.error('Failed to get memory context', error as Error, {
                input: currentInput,
            });
            return 'Memory context unavailable due to error';
        }
    }

    private formatSessionEntry(entry: unknown): string | null {
        if (!entry || typeof entry !== 'object') {
            return null;
        }

        const entryObj = entry as Record<string, unknown>;

        const input = entryObj.input;
        const output = entryObj.output;

        if (input && typeof input === 'object') {
            const inputObj = input as Record<string, unknown>;

            if (inputObj.type === 'memory_context_request') {
                const userInput = inputObj.input as string;
                return `User: "${userInput}"`;
            }

            if (inputObj.type === 'execution_step') {
                const thought = inputObj.thought as string;
                return `Agent: ${thought}`;
            }

            if (inputObj.type === 'plan_created') {
                const goal = inputObj.goal as string;
                return `Planning: "${goal}"`;
            }

            if (inputObj.type === 'plan_completed') {
                const synthesized =
                    output && typeof output === 'object'
                        ? ((output as Record<string, unknown>)
                              .synthesized as string)
                        : 'Completed';
                return `Response: "${synthesized}"`;
            }

            if (inputObj.type === 'step_execution_start') {
                const tool = inputObj.tool as string;
                return `Tool: ${tool}`;
            }
        }

        if (output && typeof output === 'object') {
            const outputObj = output as Record<string, unknown>;
            if (outputObj.synthesized) {
                return `Response: "${outputObj.synthesized as string}"`;
            }
            if (outputObj.observation) {
                return `Result: "${outputObj.observation as string}"`;
            }
        }

        if (typeof input === 'string' && input.length > 0) {
            return `User: "${input.substring(0, 50)}..."`;
        }

        return null;
    }

    async think(context: PlannerExecutionContext): Promise<AgentThought> {
        let stepId: string | undefined;
        if (context.agentContext?.stepExecution) {
            stepId = context.agentContext.stepExecution.startStep(
                context.iterations || 0,
            );
        }

        try {
            const currentPlan = this.getCurrentPlan(context);
            const shouldReplan = this.shouldReplan(context);

            if (!currentPlan || shouldReplan) {
                const result = await this.createPlan(context);

                // ✅ NEW: Update step execution with result
                if (stepId && context.agentContext?.stepExecution) {
                    context.agentContext.stepExecution.updateStep(stepId, {
                        thought: result,
                        action: result.action,
                        result: {
                            type: 'final_answer',
                            content: 'Plan created successfully',
                        },
                        observation: {
                            isComplete: false,
                            isSuccessful: true,
                            feedback: 'Plan created',
                            shouldContinue: true,
                        },
                        duration: 0,
                    });
                }

                const current = this.getCurrentPlan(context);

                if (current) {
                    if (
                        current.status === UNIFIED_STATUS.FAILED &&
                        (current.metadata as Record<string, unknown>)
                            ?.replanCause === 'max_replans_exceeded'
                    ) {
                        return {
                            reasoning:
                                'Plan failed due to max replans exceeded. Cannot continue with missing inputs.',
                            action: {
                                type: 'final_answer',
                                content:
                                    'I cannot complete this task because I need additional information that is not available. Please provide the missing details and try again.',
                            },
                            metadata: {
                                planId: current.id,
                                replansCount: (
                                    current.metadata as Record<string, unknown>
                                )?.replansCount,
                                maxReplans: this.replanPolicy.maxReplans,
                                correlationId:
                                    context.agentContext?.correlationId,
                            },
                        };
                    }

                    return {
                        reasoning: 'Plan created. Executing…',
                        action: {
                            type: 'execute_plan' as const,
                            planId: current.id,
                        } as AgentAction,
                    };
                }

                return result;
            }

            const current = this.getCurrentPlan(context);

            if (current) {
                return {
                    reasoning: 'Executing current plan',
                    action: {
                        type: !shouldReplan
                            ? ('final_answer' as const)
                            : ('execute_plan' as const),
                        planId: current.id,
                    } as AgentAction,
                };
            }

            return {
                reasoning: 'No plan available; please replan',
                action: { type: 'final_answer', content: 'Replanning…' },
            };
        } catch (error) {
            this.logger.error(
                'Plan-and-Execute thinking failed',
                error as Error,
            );

            // ✅ CASO 7: ERRO NO PLANNING - Atualizar step execution
            if (stepId && context.agentContext?.stepExecution) {
                context.agentContext.stepExecution.updateStep(stepId, {
                    result: {
                        type: 'error',
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Unknown error',
                    },
                    observation: {
                        isComplete: true,
                        isSuccessful: false,
                        feedback: 'Planning failed',
                        shouldContinue: false,
                    },
                });
            }

            // ✅ CASO 7: ERRO NO PLANNING - Retornar final_answer
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
        const input = context.input;

        const memoryContext = await this.getMemoryContext(context, input);

        const planningHistory = this.buildPlanningHistory(context);

        const agentIdentity = context.agentContext?.agentIdentity;

        if (!this.llmAdapter.createPlan) {
            throw new Error('LLM adapter must support createPlan method');
        }

        // ✅ CORREÇÃO: Usar replanContext se disponível
        const replanContext =
            context.replanContext ||
            (this.findLatestReplanContext(context) as
                | Record<string, unknown>
                | undefined);

        const composedPrompt = await this.promptComposer.composePrompt({
            goal: input,
            availableTools: this.getAvailableToolsForPlanning(context),
            memoryContext,
            planningHistory,
            // 🎯 SEPARATED: User context only
            additionalContext: {
                ...context.plannerMetadata,
                agentIdentity,
                userContext:
                    context.agentContext?.agentExecutionOptions?.userContext,
            },
            replanContext: replanContext as ReplanContext | undefined,
            iteration: 1,
            maxIterations: 5,
        });

        const planResult = await this.llmAdapter.createPlan(
            input,
            'plan-execute',
            {
                systemPrompt: composedPrompt.systemPrompt,
                userPrompt: composedPrompt.userPrompt,
                tools: this.getAvailableToolsForContext(context),
            },
        );

        const plan = planResult;

        const steps = this.convertLLMResponseToSteps(plan);

        const now = Date.now();
        const newPlan: ExecutionPlan = {
            id: `plan-${now}`,
            goal: input,
            strategy: 'plan-execute',
            steps: steps,
            currentStepIndex: 0,
            status: UNIFIED_STATUS.EXECUTING,
            reasoning:
                ((plan as Record<string, unknown>)?.reasoning as string) ||
                `Plan created for: ${input}`,
            createdAt: now,
            updatedAt: now,
            metadata: {
                startTime: now,
                createdBy: 'plan-execute-planner',
                thread: context.plannerMetadata.thread?.id,
                signals: (plan as Record<string, unknown>)?.signals,
            },
        };

        // Use planner signals (if provided) to gate execution
        const rawSignals = (plan as Record<string, unknown>)?.signals as
            | {
                  needs?: unknown;
                  noDiscoveryPath?: unknown;
                  errors?: unknown;
                  suggestedNextStep?: unknown;
              }
            | undefined;
        const needs: string[] = Array.isArray(rawSignals?.needs)
            ? (rawSignals!.needs as unknown[])
                  .filter((x) => typeof x === 'string')
                  .map((x) => String(x))
            : [];
        const noDiscoveryPath: string[] | undefined = Array.isArray(
            rawSignals?.noDiscoveryPath,
        )
            ? (rawSignals!.noDiscoveryPath as unknown[])
                  .filter((x) => typeof x === 'string')
                  .map((x) => String(x))
            : undefined;
        const errorsFromSignals: string[] | undefined = Array.isArray(
            rawSignals?.errors,
        )
            ? (rawSignals!.errors as unknown[])
                  .filter((x) => typeof x === 'string')
                  .map((x) => String(x))
            : undefined;
        const suggestedNextStep: string | undefined =
            typeof rawSignals?.suggestedNextStep === 'string'
                ? (rawSignals!.suggestedNextStep as string)
                : undefined;
        if (noDiscoveryPath && newPlan.metadata) {
            (newPlan.metadata as Record<string, unknown>).noDiscoveryPath =
                noDiscoveryPath;
        }
        if (errorsFromSignals && newPlan.metadata) {
            (newPlan.metadata as Record<string, unknown>).errors =
                errorsFromSignals;
        }
        if (suggestedNextStep && newPlan.metadata) {
            (newPlan.metadata as Record<string, unknown>).suggestedNextStep =
                suggestedNextStep;
        }

        if (needs.length > 0) {
            const currentPlan = this.getCurrentPlan(context);
            const prevReplans = Number(
                (currentPlan?.metadata as Record<string, unknown> | undefined)
                    ?.replansCount ?? 0,
            );

            // ✅ SÓ REPLAN SE NÃO EXCEDEU LIMITE
            const maxReplans = this.replanPolicy.maxReplans;
            if (!maxReplans || prevReplans < maxReplans) {
                newPlan.status = UNIFIED_STATUS.REPLANNING;
                (newPlan.metadata as Record<string, unknown>) = {
                    ...(newPlan.metadata || {}),
                    replanCause: 'missing_inputs',
                    replansCount: prevReplans + 1,
                };

                this.logger.info(
                    'Plan marked for replanning due to missing inputs',
                    {
                        planId: newPlan.id,
                        needs,
                        replansCount: prevReplans + 1,
                        maxReplans: maxReplans,
                    },
                );
            } else {
                // ✅ PARAR LOOP - LIMITE ATINGIDO
                newPlan.status = UNIFIED_STATUS.FAILED;
                (newPlan.metadata as Record<string, unknown>) = {
                    ...(newPlan.metadata || {}),
                    replanCause: 'max_replans_exceeded',
                    replansCount: prevReplans,
                };

                this.logger.warn(
                    'Max replans exceeded - stopping replan loop',
                    {
                        planId: newPlan.id,
                        needs,
                        replansCount: prevReplans,
                        maxReplans: maxReplans,
                    },
                );
            }
        }

        const previousPlan = this.getCurrentPlan(context);
        this.setCurrentPlan(context, newPlan);

        if (
            previousPlan?.status === UNIFIED_STATUS.REPLANNING &&
            context.agentContext
        ) {
            try {
                const elapsed = previousPlan.metadata?.startTime
                    ? Date.now() - (previousPlan.metadata.startTime as number)
                    : undefined;
                const replansCount = (
                    previousPlan.metadata as Record<string, unknown> | undefined
                )?.replansCount;
                // ✅ CLEAN ARCHITECTURE: Use telemetry for runtime debug data instead of polluting conversation
                const observability = getObservability();
                void observability.telemetry.traceEvent(
                    createTelemetryEvent('planner.replan.completed', {
                        previousPlanId: previousPlan.id,
                        newPlanId: newPlan.id,
                        replansCount,
                        elapsedMs: elapsed,
                        cause: (
                            previousPlan.metadata as
                                | Record<string, unknown>
                                | undefined
                        )?.replanCause,
                        sessionId: context.agentContext.sessionId,
                        agentName: context.agentContext.agentName,
                        correlationId: context.agentContext.correlationId,
                    }),
                    async () => {
                        return {};
                    },
                );
            } catch {}
        }

        // TODO: MOVER PARA CAMADA DE KERNEL/STATE - Persistir dados do plano no state e session
        if (context.agentContext) {
            try {
                // TODO: MOVER PARA CAMADA DE KERNEL/STATE - Salvar plano no state
                await context.agentContext.state.set('planner', 'currentPlan', {
                    id: newPlan.id,
                    goal: newPlan.goal,
                    stepsCount: newPlan.steps.length,
                    status: newPlan.status,
                    createdAt: Date.now(),
                    signals: newPlan.metadata?.signals,
                    needs: needs,
                    noDiscoveryPath,
                    errors: errorsFromSignals,
                    suggestedNextStep,
                });

                // ✅ CLEAN ARCHITECTURE: Use telemetry for runtime debug data instead of polluting conversation
                if (context.agentContext) {
                    const observability = getObservability();
                    void observability.telemetry.traceEvent(
                        createTelemetryEvent('plan_created', {
                            goal: input,
                            stepsCount: newPlan.steps.length,
                            planId: newPlan.id,
                            strategy: newPlan.strategy,
                            signals: newPlan.metadata?.signals,
                            needs: needs,
                            noDiscoveryPath,
                            errors: errorsFromSignals,
                            suggestedNextStep,
                            sessionId: context.agentContext.sessionId,
                            agentName: context.agentContext.agentName,
                            correlationId: context.agentContext.correlationId,
                        }),
                        async () => {
                            return {};
                        },
                    );
                }
            } catch (error) {
                this.logger.warn('Failed to persist plan data', {
                    error: error as Error,
                });
            }
        }

        if (
            newPlan.status === UNIFIED_STATUS.FAILED &&
            (newPlan.metadata as Record<string, unknown>)?.replanCause ===
                'max_replans_exceeded'
        ) {
            const maxReplans = this.replanPolicy.maxReplans;
            return {
                reasoning:
                    'Max replans exceeded - cannot create valid plan due to missing inputs',
                action: {
                    type: 'final_answer',
                    content:
                        'I cannot complete this task because I need more information. Please provide the missing details or rephrase your request.',
                },
                metadata: {
                    planId: newPlan.id,
                    totalSteps: newPlan.steps.length,
                    replansCount: (newPlan.metadata as Record<string, unknown>)
                        ?.replansCount,
                    maxReplans: maxReplans,
                    needs: needs,
                },
            };
        }

        return {
            reasoning: 'Plan created. Ready to execute.',
            action: {
                type: 'execute_plan' as const,
                planId: newPlan.id,
            } as AgentAction,
            metadata: {
                planId: newPlan.id,
                totalSteps: newPlan.steps.length,
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
                isComplete: false,
                isSuccessful: false,
                feedback: 'No plan available, need to create one',
                shouldContinue: true,
            };
        }

        if (currentPlan.status === UNIFIED_STATUS.WAITING_INPUT) {
            return {
                isComplete: true,
                isSuccessful: true,
                feedback: 'Awaiting user input to proceed',
                shouldContinue: false,
                suggestedNextAction: 'Awaiting user input',
            };
        }

        if (result.type === 'final_answer') {
            currentPlan.status = UNIFIED_STATUS.COMPLETED;
            this.setCurrentPlan(context, currentPlan);

            // TODO: MOVER PARA CAMADA DE OBSERVABILIDADE - Emit replan.completed for final answer path
            if (context.agentContext) {
                try {
                    const elapsed = currentPlan.metadata?.startTime
                        ? Date.now() -
                          (currentPlan.metadata.startTime as number)
                        : undefined;
                    // ✅ CLEAN ARCHITECTURE: Use telemetry for runtime debug data instead of polluting conversation
                    const observability = getObservability();
                    void observability.telemetry.traceEvent(
                        createTelemetryEvent('planner.replan.completed', {
                            planId: currentPlan.id,
                            completedAt: Date.now(),
                            elapsedMs: elapsed,
                            cause: currentPlan.metadata?.replanCause,
                            sessionId: context.agentContext.sessionId,
                            agentName: context.agentContext.agentName,
                            correlationId: context.agentContext.correlationId,
                        }),
                        async () => {
                            return {};
                        },
                    );
                } catch {}
            }

            // TODO: MOVER PARA CAMADA DE OBSERVABILIDADE - Step execution tracking
            if (context.agentContext?.stepExecution) {
                const stepId = `step-final-${Date.now()}`;
                const endTime = Date.now();

                // TODO: MOVER PARA CAMADA DE OBSERVABILIDADE - Track context operations
                context.agentContext.stepExecution.addContextOperation(
                    stepId,
                    'session',
                    'final_answer',
                    { content: result.content, timestamp: endTime },
                );

                // TODO: MOVER PARA CAMADA DE OBSERVABILIDADE - Track context operations
                context.agentContext.stepExecution.addContextOperation(
                    stepId,
                    'session',
                    'final_answer',
                    { content: result.content, timestamp: endTime },
                );

                // TODO: MOVER PARA CAMADA DE OBSERVABILIDADE - Update step with real duration
                context.agentContext.stepExecution.updateStep(stepId, {
                    thought: {
                        reasoning: currentPlan.reasoning,
                        action: {
                            type: 'final_answer' as const,
                            content: result.content,
                        },
                    },
                    action: {
                        type: 'final_answer' as const,
                        content: result.content,
                    },
                    result: result,
                    observation: {
                        isComplete: true,
                        isSuccessful: true,
                        feedback: result.content || 'Task completed',
                        shouldContinue: false,
                    },
                    duration:
                        endTime -
                        (context.agentContext.stepExecution.getCurrentStep()
                            ?.duration || 0),
                });
            } else {
                // TODO: MOVER PARA CAMADA DE OBSERVABILIDADE - Use traditional approach
                const stepExecution = {
                    stepId: `step-final-${Date.now()}`,
                    stepNumber: context.history.length + 1,
                    iteration: context.history.length + 1,
                    status: 'final_answer',
                    thought: {
                        reasoning: currentPlan.reasoning,
                        action: {
                            type: 'final_answer' as const,
                            content: result.content,
                        },
                    },
                    action: {
                        type: 'final_answer' as const,
                        content: result.content,
                    },
                    result: result,
                    observation: {
                        isComplete: true,
                        isSuccessful: true,
                        feedback: result.content || 'Task completed',
                        shouldContinue: false,
                    },
                    duration: 0,
                    metadata: {
                        contextOperations: [],
                        toolCalls: [],
                        performance: {
                            thinkDuration: 0,
                            actDuration: 0,
                            observeDuration: 0,
                        },
                    },
                };
                context.history.push(stepExecution);
            }

            // TODO: MOVER PARA CAMADA DE KERNEL/STATE - Persist final result
            if (context.agentContext) {
                try {
                    // TODO: MOVER PARA CAMADA DE KERNEL/STATE - Set state
                    await context.agentContext.state.set(
                        'planner',
                        'finalResult',
                        {
                            planId: currentPlan.id,
                            result: result.content,
                            completedAt: Date.now(),
                        },
                    );

                    // ✅ CLEAN ARCHITECTURE: Use telemetry for runtime debug data instead of polluting conversation
                    const observability = getObservability();
                    void observability.telemetry.traceEvent(
                        createTelemetryEvent('plan_completed', {
                            planId: currentPlan.id,
                            content: result.content,
                            synthesized: result.content,
                            sessionId: context.agentContext.sessionId,
                            agentName: context.agentContext.agentName,
                            correlationId: context.agentContext.correlationId,
                        }),
                        async () => {
                            return {};
                        },
                    );
                } catch (error) {
                    this.logger.warn('Failed to persist final result', {
                        error: error as Error,
                    });
                }
            }

            return {
                isComplete: true,
                isSuccessful: true,
                feedback: result.content || 'Task completed successfully',
                shouldContinue: false,
            };
        }

        const currentStep = currentPlan.steps[currentPlan.currentStepIndex];

        if (!currentStep) {
            // ✅ VERIFICAR SE PRECISA REPLAN
            const shouldReplan = await this.shouldReplan(context);

            if (shouldReplan) {
                // ✅ PRECISA REPLAN - Continua execução
                return {
                    isComplete: false,
                    isSuccessful: false,
                    feedback: 'No steps available, need to replan',
                    shouldContinue: true,
                    suggestedNextAction: 'Create new execution plan',
                };
            } else {
                // ✅ PLANO EXECUTADO COM SUCESSO
                return {
                    isComplete: true,
                    isSuccessful: true,
                    feedback: 'Plan execution completed',
                    shouldContinue: false,
                };
            }
        }

        if (isErrorResult(result)) {
            currentStep.status = UNIFIED_STATUS.FAILED;
            currentStep.result = { error: getResultError(result) };

            const shouldReplan = await this.shouldReplanOnFailure(
                result,
                context,
            );

            if (shouldReplan) {
                currentPlan.status = UNIFIED_STATUS.REPLANNING;
                this.setCurrentPlan(context, currentPlan);
                return {
                    isComplete: false,
                    isSuccessful: false,
                    feedback: `Step failed: ${getResultError(result)}. Will replan.`,
                    shouldContinue: true,
                    suggestedNextAction: 'Replan execution strategy',
                };
            } else {
                currentPlan.status = UNIFIED_STATUS.FAILED;
                this.setCurrentPlan(context, currentPlan);

                if (this.isDefinitiveFailure(currentPlan)) {
                    return {
                        isComplete: true,
                        isSuccessful: false,
                        feedback: `Task failed definitively: ${getResultError(result)}`,
                        shouldContinue: false,
                    };
                } else if (this.shouldStopForMaxReplans(currentPlan)) {
                    // ✅ MAX REPLANS - Para com resposta ao usuário
                    return {
                        isComplete: true,
                        isSuccessful: true, // ← NÃO É FALHA!
                        feedback: 'Need more information to proceed',
                        shouldContinue: false,
                    };
                } else {
                    // ✅ FALHA TEMPORÁRIA - Continua
                    return {
                        isComplete: false,
                        isSuccessful: false,
                        feedback: `Step failed temporarily: ${getResultError(result)}. Will replan.`,
                        shouldContinue: true,
                        suggestedNextAction: 'Replan execution strategy',
                    };
                }
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
                if (step && step.status === UNIFIED_STATUS.EXECUTING) {
                    const stepResult = parallelResults.find(
                        (r) => r.toolName === step.tool,
                    );
                    if (stepResult) {
                        step.status = stepResult.error
                            ? UNIFIED_STATUS.FAILED
                            : UNIFIED_STATUS.COMPLETED;
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
            currentStep.status = UNIFIED_STATUS.COMPLETED;
            currentStep.result = stepResult;

            currentPlan.currentStepIndex++;
        }

        const isLastStep =
            currentPlan.currentStepIndex >= currentPlan.steps.length;

        if (isLastStep) {
            currentPlan.status = UNIFIED_STATUS.COMPLETED;

            return {
                isComplete: true,
                isSuccessful: true,
                feedback: 'Task completed successfully',
                shouldContinue: false,
            };
        }

        // ❌ STEP EM ANDAMENTO = Comunicação interna, não resposta final
        return {
            isComplete: false,
            isSuccessful: true,
            feedback: `✅ Step completed: ${currentStep.description}. Progress: ${currentPlan.currentStepIndex}/${currentPlan.steps.length}`,
            shouldContinue: true,
            suggestedNextAction: `Next: ${currentPlan.steps[currentPlan.currentStepIndex]?.description}`,
        };
    }

    private isDefinitiveFailure(plan: ExecutionPlan): boolean {
        const replanCause = (plan.metadata as Record<string, unknown>)
            ?.replanCause as string;

        // ✅ APENAS FALHAS REAIS
        const definitiveCauses = [
            'permission_denied',
            'not_found',
            'invalid_credentials',
            'unauthorized',
        ];

        return definitiveCauses.includes(replanCause);
    }

    private shouldStopForMaxReplans(plan: ExecutionPlan): boolean {
        const replanCause = (plan.metadata as Record<string, unknown>)
            ?.replanCause as string;

        return replanCause === 'max_replans_exceeded';
    }

    private shouldReplan(context: PlannerExecutionContext): boolean {
        const currentPlan = this.getCurrentPlan(context);

        if (!currentPlan) {
            return true;
        }

        if (currentPlan.status === UNIFIED_STATUS.REPLANNING) {
            const replansCount = Number(
                (currentPlan.metadata as Record<string, unknown>)
                    ?.replansCount ?? 0,
            );

            if (
                this.replanPolicy.maxReplans &&
                replansCount >= this.replanPolicy.maxReplans
            ) {
                return false;
            }
            return true;
        }

        if (
            currentPlan.status === UNIFIED_STATUS.FAILED &&
            (currentPlan.metadata as Record<string, unknown>)?.replanCause ===
                'max_replans_exceeded'
        ) {
            return false;
        }

        return false;
    }

    private async shouldReplanOnFailure(
        result: ActionResult,
        context: PlannerExecutionContext,
    ): Promise<boolean> {
        const errorMessage = getResultError(result)?.toLowerCase() || '';

        // Tool unavailable
        if (
            errorMessage.includes('tool not found') ||
            errorMessage.includes('unknown tool')
        ) {
            const currentPlan = this.getCurrentPlan(context);
            if (currentPlan) {
                currentPlan.metadata = {
                    ...(currentPlan.metadata || {}),
                    replanCause: 'tool_missing',
                } as Record<string, unknown>;
                this.setCurrentPlan(context, currentPlan);
            }
            return this.replanPolicy.toolUnavailable === 'replan';
        }

        // Unrecoverable errors → prefer not to replan
        const unrecoverableErrors = [
            'permission denied',
            'not found',
            'invalid credentials',
            'unauthorized',
        ];
        if (unrecoverableErrors.some((err) => errorMessage.includes(err))) {
            // ✅ SETAR REPLAN_CAUSE para falha definitiva
            const currentPlan = this.getCurrentPlan(context);
            if (currentPlan) {
                const matchedError = unrecoverableErrors.find((err) =>
                    errorMessage.includes(err),
                );
                currentPlan.metadata = {
                    ...(currentPlan.metadata || {}),
                    replanCause:
                        matchedError?.replace(' ', '_') ||
                        'unrecoverable_error',
                } as Record<string, unknown>;
                this.setCurrentPlan(context, currentPlan);
            }
            return false;
        }

        // Simple early-iteration replan
        return context.iterations < 3;
    }

    // Confidence heuristic removed

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

        // ✅ ENHANCED: Validate both placeholders and dependencies
        const invalidSteps = this.validateStepsForPlaceholders(convertedSteps);

        // ✅ NEW: Validate step dependencies
        const tempPlan: ExecutionPlan = {
            id: 'temp-validation',
            goal: '',
            strategy: '',
            steps: convertedSteps,
            currentStepIndex: 0,
            status: UNIFIED_STATUS.PENDING,
            reasoning: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        const dependencyValidation = this.validatePlanDependencies(tempPlan);

        if (invalidSteps.length > 0 || !dependencyValidation.isValid) {
            // ✅ DEBUG: Log validation errors
            this.logger.warn('Plan validation failed', {
                invalidSteps: invalidSteps.length,
                dependencyValid: dependencyValidation.isValid,
                dependencyErrors: dependencyValidation.errors,
                convertedSteps: convertedSteps.length,
            });

            let errorMessage =
                'I could not create an executable plan. I found the following problems:\n\n';

            // Add placeholder errors
            for (const invalidStep of invalidSteps) {
                errorMessage += `Step "${invalidStep.id}" (${invalidStep.tool || 'unknown tool'}):\n`;
                errorMessage += `  - Problemas encontrados: ${invalidStep.placeholders.join(', ')}\n\n`;
            }

            // Add dependency errors
            if (!dependencyValidation.isValid) {
                errorMessage += '**Problemas de Dependências:**\n';
                for (const error of dependencyValidation.errors) {
                    errorMessage += `  - ${error}\n`;
                }
                errorMessage += '\n';
            }

            errorMessage +=
                'I need concrete values to execute the tools. Please provide the specific values required.';

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

    private buildPlanningHistory(context: PlannerExecutionContext): string {
        if (context.history.length === 0) {
            return 'No execution history available';
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
     * Find the latest replan context from execution history
     * Returns structured replan context only if replanContext exists
     */
    private findLatestReplanContext(
        context: PlannerExecutionContext,
    ): ReplanContext | undefined {
        if (context.history.length === 0) {
            return undefined;
        }

        // Find most recent error entry that needs replanning
        const latestReplanEntry = [...context.history]
            .reverse()
            .find(
                (entry) =>
                    entry.status === 'error' &&
                    entry.result?.type === 'error' &&
                    this.isReplanRequired(entry.result),
            );

        if (!latestReplanEntry) {
            return undefined;
        }

        // Check if replanContext exists in result
        const result = latestReplanEntry.result as unknown as Record<
            string,
            unknown
        >;
        const replanContext = result?.replanContext as
            | ReplanContextData
            | undefined;

        if (!replanContext) {
            return undefined;
        }

        // Build structured template only if replanContext exists
        const contextForReplan = replanContext.contextForReplan as Record<
            string,
            unknown
        >;
        const successfulSteps =
            (contextForReplan?.successfulSteps as unknown[]) || [];
        const failedSteps = (contextForReplan?.failedSteps as unknown[]) || [];

        return {
            isReplan: true,
            previousPlan: {
                id: latestReplanEntry.stepId || 'unknown',
                goal: context.input,
                strategy: 'plan-execute',
                totalSteps: successfulSteps.length + failedSteps.length,
            },
            executionSummary: {
                type: latestReplanEntry.result?.type || 'error',
                executionTime: latestReplanEntry.duration || 0,
                successfulSteps: successfulSteps.length,
                failedSteps: failedSteps.length,
                feedback: replanContext.primaryCause || 'Execution failed',
            },
            preservedSteps: replanContext.preservedSteps || [],
            failureAnalysis: {
                primaryCause: replanContext.primaryCause || 'Execution failed',
                failurePatterns: replanContext.failurePatterns || [],
            },
            suggestions: replanContext.suggestedStrategy,
        };
    }

    /**
     * Check if result indicates replanning is required
     */
    private isReplanRequired(result: unknown): boolean {
        return (
            typeof result === 'object' &&
            result !== null &&
            'status' in result &&
            result.status === 'needs_replan'
        );
    }

    /**
     * Detect if multiple steps can be executed in parallel
     */
    // private detectParallelExecution(
    //     currentStep: PlanStep,
    //     context: PlannerExecutionContext,
    // ): {
    //     canExecuteInParallel: boolean;
    //     steps: PlanStep[];
    //     reason?: string;
    // } {
    //     const currentPlan = this.getCurrentPlan(context);
    //     if (!currentPlan) {
    //         return { canExecuteInParallel: false, steps: [currentStep] };
    //     }

    //     // Get remaining pending steps
    //     const remainingSteps = currentPlan.steps
    //         .slice(currentPlan.currentStepIndex)
    //         .filter((step) => step.status === 'pending');

    //     if (remainingSteps.length <= 1) {
    //         return { canExecuteInParallel: false, steps: [currentStep] };
    //     }

    //     // Check if next few steps are independent and can run in parallel
    //     const candidateSteps = remainingSteps.slice(0, 4); // Consider up to 4 steps
    //     const independentSteps: PlanStep[] = [];

    //     for (const step of candidateSteps) {
    //         // Check if step has dependencies that haven't been completed yet
    //         const hasPendingDependencies = step.dependencies?.some((depId) => {
    //             const depStep = currentPlan.steps.find((s) => s.id === depId);
    //             return depStep && depStep.status !== 'completed';
    //         });

    //         if (!hasPendingDependencies && step.tool && step.tool !== 'none') {
    //             // Check if this step is truly independent (no data dependencies)
    //             const hasDataDependency = this.checkDataDependency(
    //                 step,
    //                 independentSteps,
    //             );
    //             if (!hasDataDependency) {
    //                 independentSteps.push(step);
    //             }
    //         }
    //     }

    //     return {
    //         canExecuteInParallel: independentSteps.length > 1,
    //         steps:
    //             independentSteps.length > 1 ? independentSteps : [currentStep],
    //         reason:
    //             independentSteps.length > 1
    //                 ? `Found ${independentSteps.length} independent steps that can run in parallel`
    //                 : 'No parallel execution opportunity detected',
    //     };
    // }

    /**
     * Check if a step has data dependencies on other steps
     */
    // private checkDataDependency(
    //     step: PlanStep,
    //     otherSteps: PlanStep[],
    // ): boolean {
    //     // ✅ IMPROVED: Check for actual template references instead of simple string matching
    //     if (!step.arguments || !otherSteps.length) return false;

    //     const argsStr = JSON.stringify(step.arguments);
    //     const stepRefPattern = /\{\{([^.}]+)\.result/;
    //     const matches = argsStr.match(stepRefPattern);

    //     if (!matches) return false;

    //     const referencedStepId = matches[1];
    //     return otherSteps.some(
    //         (otherStep) => otherStep.id === referencedStepId,
    //     );
    // }

    /**
     * ✅ NEW: Validate step dependencies for circular references
     */
    private validateDependencies(steps: PlanStep[]): {
        isValid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        // Check for circular dependencies
        for (const step of steps) {
            const visited = new Set<string>();
            const recursionStack = new Set<string>();

            if (
                this.hasCircularDependency(step, steps, visited, recursionStack)
            ) {
                errors.push(
                    `Circular dependency detected involving step "${step.id}"`,
                );
                break; // Only report the first circular dependency found
            }
        }

        return { isValid: errors.length === 0, errors };
    }

    /**
     * ✅ NEW: Check for circular dependencies using DFS
     */
    private hasCircularDependency(
        step: PlanStep,
        allSteps: PlanStep[],
        visited: Set<string>,
        recursionStack: Set<string>,
    ): boolean {
        if (recursionStack.has(step.id)) {
            return true; // Circular dependency found
        }

        if (visited.has(step.id)) {
            return false; // Already processed
        }

        visited.add(step.id);
        recursionStack.add(step.id);

        // Check dependencies of this step
        if (step.dependencies) {
            for (const depId of step.dependencies) {
                const depStep = allSteps.find((s) => s.id === depId);
                if (
                    depStep &&
                    this.hasCircularDependency(
                        depStep,
                        allSteps,
                        visited,
                        recursionStack,
                    )
                ) {
                    return true;
                }
            }
        }

        // Check data dependencies (template references)
        if (step.arguments) {
            const argsStr = JSON.stringify(step.arguments);
            const stepRefPattern = /\{\{([^.}]+)\.result/g;
            const matches = argsStr.match(stepRefPattern);

            if (matches) {
                for (const match of matches) {
                    const referencedStepId =
                        match.match(/\{\{([^.}]+)\.result/)?.[1];
                    if (referencedStepId) {
                        const referencedStep = allSteps.find(
                            (s) => s.id === referencedStepId,
                        );
                        if (
                            referencedStep &&
                            this.hasCircularDependency(
                                referencedStep,
                                allSteps,
                                visited,
                                recursionStack,
                            )
                        ) {
                            return true;
                        }
                    }
                }
            }
        }

        recursionStack.delete(step.id);
        return false;
    }

    /**
     * ✅ NEW: Validate that all referenced steps exist
     */
    private validateStepReferences(steps: PlanStep[]): {
        isValid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];
        const stepIds = new Set(steps.map((s) => s.id));

        for (const step of steps) {
            // Check template references in arguments
            if (step.arguments) {
                const argsStr = JSON.stringify(step.arguments);
                const matches = argsStr.match(/\{\{([^.}]+)\.result/g);

                if (matches) {
                    for (const match of matches) {
                        const stepId = match.match(/\{\{([^.}]+)\.result/)?.[1];
                        if (stepId && !stepIds.has(stepId)) {
                            errors.push(
                                `Step "${step.id}" references non-existent step "${stepId}"`,
                            );
                        }
                    }
                }
            }

            // Check explicit dependencies
            if (step.dependencies) {
                for (const depId of step.dependencies) {
                    if (!stepIds.has(depId)) {
                        errors.push(
                            `Step "${step.id}" has dependency on non-existent step "${depId}"`,
                        );
                    }
                }
            }
        }

        return { isValid: errors.length === 0, errors };
    }

    /**
     * ✅ NEW: Comprehensive validation of plan dependencies
     */
    private validatePlanDependencies(plan: ExecutionPlan): {
        isValid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        // Validate step references
        const refValidation = this.validateStepReferences(plan.steps);
        if (!refValidation.isValid) {
            errors.push(...refValidation.errors);
        }

        // Validate circular dependencies
        const depValidation = this.validateDependencies(plan.steps);
        if (!depValidation.isValid) {
            errors.push(...depValidation.errors);
        }

        return { isValid: errors.length === 0, errors };
    }

    private async resolveStepArguments(
        args: Record<string, unknown>,
        allSteps: PlanStep[],
        context?: PlannerExecutionContext,
    ): Promise<{ args: Record<string, unknown>; missing: string[] }> {
        // ✅ NEW: Runtime validation to prevent infinite loops
        const visitedReferences = new Set<string>();

        const validateCircularReference = (
            stepId: string,
            currentPath: string,
        ): boolean => {
            const referenceKey = `${stepId}:${currentPath}`;
            if (visitedReferences.has(referenceKey)) {
                this.logger.warn('❌ CIRCULAR REFERENCE DETECTED', {
                    stepId,
                    currentPath,
                    visitedReferences: Array.from(visitedReferences),
                });
                return true;
            }
            visitedReferences.add(referenceKey);
            return false;
        };

        this.logger.info('🔧 RESOLVING STEP ARGUMENTS', {
            originalArgs: args,
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

        // ✅ NEW: Recursive function to resolve templates in any value
        const missingInputs = new Set<string>();

        const resolveContextPath = (fullPath: string): unknown => {
            const segments = fullPath.split('.');
            if (segments.length === 0) return undefined;
            const root = segments.shift();
            let base: unknown;
            switch (root) {
                case 'userContext':
                    base =
                        context?.agentContext?.agentExecutionOptions
                            ?.userContext || undefined;
                    break;
                case 'plannerMetadata':
                    base = context?.plannerMetadata || undefined;
                    break;
                case 'agentIdentity':
                    base = context?.agentContext?.agentIdentity || undefined;
                    break;
                default:
                    return undefined;
            }
            try {
                let current: unknown = base as Record<string, unknown>;
                for (const seg of segments) {
                    if (
                        current &&
                        typeof current === 'object' &&
                        seg in (current as Record<string, unknown>)
                    ) {
                        current = (current as Record<string, unknown>)[seg];
                    } else {
                        return undefined;
                    }
                }
                return current;
            } catch {
                return undefined;
            }
        };

        const resolveValue = async (value: unknown): Promise<unknown> => {
            if (typeof value === 'string') {
                // ✅ NEW: Detect invalid values that should be treated as missing
                const invalidValues = [
                    'NOT_FOUND',
                    'NOT_FOUND:',
                    'MISSING',
                    'MISSING:',
                    'INVALID',
                    'INVALID:',
                    'ERROR',
                    'ERROR:',
                    'NULL',
                    'UNDEFINED',
                ];

                for (const invalidValue of invalidValues) {
                    if (
                        value === invalidValue ||
                        value.startsWith(invalidValue + ':')
                    ) {
                        const param = value.includes(':')
                            ? value.split(':')[1]?.trim()
                            : value;
                        missingInputs.add(param || 'invalid_value');
                        this.logger.warn('❌ INVALID VALUE DETECTED', {
                            value,
                            param,
                            missingInputs: Array.from(missingInputs),
                        });
                        return value;
                    }
                }

                // Explicit tokens
                if (value === 'NEEDS-INPUT') {
                    missingInputs.add('input');
                    return value;
                }
                if (value.startsWith('NEEDS-INPUT:')) {
                    const param = value.slice('NEEDS-INPUT:'.length).trim();
                    missingInputs.add(param || 'input');
                    return value;
                }
                if (value.startsWith('NO-DISCOVERY-PATH:')) {
                    const id = value.slice('NO-DISCOVERY-PATH:'.length).trim();
                    missingInputs.add(id || 'no_discovery_path');
                    return value;
                }

                // CONTEXT.<path>
                if (value.startsWith('CONTEXT.')) {
                    const ctxPath = value.slice('CONTEXT.'.length);
                    const resolved = resolveContextPath(ctxPath);
                    if (resolved === undefined || resolved === null) {
                        missingInputs.add(`CONTEXT.${ctxPath}`);
                        return value;
                    }
                    return resolved;
                }
                // Check if this string contains template references
                const templatePattern =
                    /\{\{([^.}]+)\.result([\w\[\]\.]*)\}\}/g;
                let match;
                let resolvedValue = value;

                while ((match = templatePattern.exec(value)) !== null) {
                    const [fullMatch, stepIdentifier, path] = match;

                    this.logger.info('🔍 TEMPLATE MATCH FOUND', {
                        match: fullMatch,
                        stepIdentifier,
                        path,
                    });

                    let step: PlanStep | undefined;

                    // Try to find step by number (step-1, step-2, etc.)
                    if (stepIdentifier && stepIdentifier.startsWith('step-')) {
                        const stepNum = parseInt(stepIdentifier.substring(5));
                        const stepIndex = stepNum - 1;
                        step = allSteps[stepIndex];
                        this.logger.info('🔢 STEP BY NUMBER', {
                            stepNum,
                            stepIndex,
                            found: !!step,
                        });
                    } else if (stepIdentifier) {
                        // Try to find step by ID
                        step = allSteps.find((s) => s.id === stepIdentifier);
                        this.logger.info('🆔 STEP BY ID', {
                            stepIdentifier,
                            found: !!step,
                        });
                    }

                    // ✅ NEW: Validate circular reference at runtime
                    if (
                        step &&
                        path &&
                        validateCircularReference(step.id, path)
                    ) {
                        continue; // Skip this reference if circular
                    }

                    if (!step) {
                        this.logger.warn('❌ STEP NOT FOUND', {
                            reference: fullMatch,
                            stepIdentifier,
                            availableSteps: allSteps.map((s) => ({
                                id: s.id,
                                status: s.status,
                            })),
                        });
                        missingInputs.add(fullMatch);
                        continue; // Keep original if step doesn't exist
                    }

                    if (!step.result) {
                        this.logger.warn('❌ STEP HAS NO RESULT', {
                            reference: fullMatch,
                            stepIdentifier,
                            stepStatus: step.status,
                            stepId: step.id,
                        });
                        missingInputs.add(fullMatch);
                        continue; // Keep original if step has no result
                    }

                    if (step.status !== UNIFIED_STATUS.COMPLETED) {
                        this.logger.warn('❌ STEP NOT COMPLETED', {
                            reference: fullMatch,
                            stepIdentifier,
                            stepStatus: step.status,
                            stepId: step.id,
                        });
                        continue; // Keep original if step not completed
                    }

                    try {
                        // ✅ ENHANCED: Handle complex result structures
                        let actualResult = step.result;

                        // Check if result has nested structure (common in tool results)
                        if (actualResult && typeof actualResult === 'object') {
                            const resultObj = actualResult as Record<
                                string,
                                unknown
                            >;

                            // Handle tool result structure: { result: { content: [{ text: "JSON" }] } }
                            if (
                                resultObj.result &&
                                typeof resultObj.result === 'object'
                            ) {
                                const nestedResult = resultObj.result as Record<
                                    string,
                                    unknown
                                >;

                                if (
                                    nestedResult.content &&
                                    Array.isArray(nestedResult.content)
                                ) {
                                    const contentArray =
                                        nestedResult.content as unknown[];
                                    if (
                                        contentArray.length > 0 &&
                                        contentArray[0] &&
                                        typeof contentArray[0] === 'object'
                                    ) {
                                        const firstContent =
                                            contentArray[0] as Record<
                                                string,
                                                unknown
                                            >;
                                        if (
                                            firstContent.text &&
                                            typeof firstContent.text ===
                                                'string'
                                        ) {
                                            try {
                                                // Parse the JSON string to get the actual data
                                                actualResult = JSON.parse(
                                                    firstContent.text as string,
                                                );
                                                this.logger.info(
                                                    '🔧 PARSED JSON FROM TOOL RESULT',
                                                    {
                                                        originalType:
                                                            typeof step.result,
                                                        parsedType:
                                                            typeof actualResult,
                                                    },
                                                );
                                            } catch (parseError) {
                                                this.logger.warn(
                                                    '❌ FAILED TO PARSE JSON FROM TOOL RESULT',
                                                    {
                                                        error: (
                                                            parseError as Error
                                                        ).message,
                                                        text: firstContent.text,
                                                    },
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // ✅ ENHANCED: Try multiple patterns to resolve the template
                        let result = this.evaluatePath(
                            actualResult,
                            path || '',
                        );

                        // If not found, try common array field patterns
                        if (result === undefined && path) {
                            const arrayFields = [
                                'data',
                                'items',
                                'list',
                                'values',
                                'results',
                            ];
                            for (const field of arrayFields) {
                                const newPath = path.replace(
                                    'result',
                                    `result.${field}`,
                                );
                                result = this.evaluatePath(
                                    actualResult,
                                    newPath,
                                );
                                if (result !== undefined) {
                                    this.logger.info(
                                        '🔍 FOUND WITH ARRAY FIELD PATTERN',
                                        {
                                            field,
                                            newPath,
                                            result: typeof result,
                                        },
                                    );
                                    break;
                                }
                            }
                        }

                        // If still not found, try nested result patterns
                        if (result === undefined && path) {
                            const nestedFields = [
                                'result',
                                'response',
                                'value',
                                'data',
                            ];
                            for (const field of nestedFields) {
                                const newPath = path.replace(
                                    'result',
                                    `result.${field}`,
                                );
                                result = this.evaluatePath(
                                    actualResult,
                                    newPath,
                                );
                                if (result !== undefined) {
                                    this.logger.info(
                                        '🔍 FOUND WITH NESTED FIELD PATTERN',
                                        {
                                            field,
                                            newPath,
                                            result: typeof result,
                                        },
                                    );
                                    break;
                                }
                            }
                        }

                        // If still not found, try to find any array and access [0].id
                        if (result === undefined) {
                            const anyArray = this.findAnyArray(actualResult);
                            if (anyArray && anyArray.length > 0) {
                                const firstItem = anyArray[0];
                                if (
                                    firstItem &&
                                    typeof firstItem === 'object' &&
                                    'id' in firstItem
                                ) {
                                    result = (
                                        firstItem as Record<string, unknown>
                                    ).id;
                                    this.logger.info(
                                        '🔍 FOUND WITH ARRAY FALLBACK',
                                        {
                                            arrayLength: anyArray.length,
                                            result: typeof result,
                                        },
                                    );
                                }
                            }
                        }

                        // If still not found, try recursive ID search
                        if (result === undefined) {
                            result = this.findIdRecursively(actualResult);
                            if (result !== undefined) {
                                this.logger.info(
                                    '🔍 FOUND WITH RECURSIVE ID SEARCH',
                                    {
                                        result: typeof result,
                                    },
                                );
                            }
                        }

                        // ✅ NEW: LLM Fallback if all patterns fail
                        if (result === undefined) {
                            this.logger.warn(
                                '❌ TEMPLATE RESOLUTION FAILED - USING LLM FALLBACK',
                                {
                                    reference: fullMatch,
                                    stepIdentifier,
                                    path,
                                    stepResult: JSON.stringify(
                                        step.result,
                                    ).substring(0, 200),
                                },
                            );

                            // Use LLM to resolve the template
                            const llmResolvedValue =
                                await this.resolveTemplateWithLLM(
                                    fullMatch,
                                    stepIdentifier || 'unknown',
                                    step.result,
                                    path || '',
                                );

                            // Replace template with LLM resolved value
                            resolvedValue = resolvedValue.replace(
                                fullMatch,
                                llmResolvedValue,
                            );
                        } else {
                            this.logger.info('✅ STEP REFERENCE RESOLVED', {
                                reference: fullMatch,
                                stepIdentifier,
                                path,
                                resultType: typeof result,
                                resultValue:
                                    result !== undefined
                                        ? JSON.stringify(result).substring(
                                              0,
                                              500,
                                          )
                                        : 'undefined',
                            });

                            // Replace the template with the resolved value
                            if (typeof result === 'string') {
                                resolvedValue = resolvedValue.replace(
                                    fullMatch,
                                    result,
                                );
                            } else {
                                // For non-string values, replace with JSON string
                                resolvedValue = resolvedValue.replace(
                                    fullMatch,
                                    JSON.stringify(result),
                                );
                            }
                        }
                    } catch (error) {
                        this.logger.warn(
                            '❌ FAILED TO RESOLVE STEP REFERENCE',
                            {
                                reference: fullMatch,
                                stepIdentifier,
                                path,
                                stepResult: step.result,
                                error: (error as Error).message,
                            },
                        );
                        // Keep original if resolution fails
                    }
                }

                return resolvedValue;
            } else if (Array.isArray(value)) {
                const resolvedArray = [];
                for (const item of value) {
                    resolvedArray.push(await resolveValue(item));
                }
                return resolvedArray;
            } else if (value !== null && typeof value === 'object') {
                const resolved: Record<string, unknown> = {};
                for (const [key, val] of Object.entries(value)) {
                    resolved[key] = await resolveValue(val);
                }
                return resolved;
            } else {
                return value;
            }
        };

        const resolvedArgs = (await resolveValue(args)) as Record<
            string,
            unknown
        >;

        return { args: resolvedArgs, missing: Array.from(missingInputs) };
    }

    // Public wrapper for argument resolution (executor-friendly)
    public async resolveArgs(
        args: Record<string, unknown>,
        steps: PlanStep[],
        context?: PlannerExecutionContext,
    ): Promise<{ args: Record<string, unknown>; missing: string[] }> {
        return this.resolveStepArguments(args, steps, context);
    }

    /**
     * Evaluate a path like "[0].id" or ".repositories[0].name" on an object
     */
    private evaluatePath(obj: unknown, path: string): unknown {
        if (!path || path === '') return obj;

        this.logger.debug('🚀 SMART TEMPLATE RESOLUTION', { path });

        // Remove leading dot
        const cleanPath = path.startsWith('.') ? path.slice(1) : path;

        // STEP 1: Parse JSON strings in content.text fields
        const parsedObj = this.parseJsonStrings(obj);

        // STRATEGY 1: Try direct recursive search first (fastest)
        const directResult = this.recursiveSearch(parsedObj, cleanPath);
        if (directResult !== undefined) {
            this.logger.debug('✅ Direct recursive search succeeded', {
                path,
                resultType: typeof directResult,
            });
            return directResult;
        }

        // STRATEGY 2: Smart field search for array paths like .modified_files[0].filename
        const fieldMatch = cleanPath.match(/([^[]+)(?:\[(\d+)\])?\.([\w.]+)$/);
        if (fieldMatch) {
            const [, arrayField, arrayIndex, finalField] = fieldMatch;
            this.logger.debug('🔍 Trying smart field search', {
                arrayField,
                arrayIndex,
                finalField,
            });

            if (!finalField) return undefined;
            const fieldValue = this.findFieldRecursively(parsedObj, finalField);
            if (fieldValue !== undefined) {
                if (arrayIndex && Array.isArray(fieldValue)) {
                    const index = parseInt(arrayIndex);
                    if (index < fieldValue.length) {
                        this.logger.debug(
                            `✅ Smart field search succeeded with array access [${index}]`,
                            {
                                fieldName: finalField,
                                resultType: typeof fieldValue[index],
                            },
                        );
                        return fieldValue[index];
                    }
                }
                this.logger.debug(`✅ Smart field search succeeded`, {
                    fieldName: finalField,
                    resultType: typeof fieldValue,
                });
                return fieldValue;
            }
        }

        // STRATEGY 3: Pattern discovery + smart path building
        this.logger.debug(
            '🔄 Field search failed, trying pattern discovery...',
        );
        const smartPath = this.discoverSmartPath(obj, path);
        if (smartPath) {
            const smartResult = this.evaluatePathOriginal(obj, smartPath);
            if (smartResult !== undefined) {
                this.logger.debug('✅ Pattern discovery succeeded', {
                    originalPath: path,
                    smartPath,
                    resultType: typeof smartResult,
                });
                return smartResult;
            }
        }

        this.logger.debug('❌ All smart strategies failed', { path });
        return undefined;
    }

    /**
     * Original path evaluation logic (now used as helper)
     */
    private evaluatePathOriginal(obj: unknown, path: string): unknown {
        if (!path || path === '') return obj;

        const cleanPath = path.startsWith('.') ? path.slice(1) : path;
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
                return undefined; // Return undefined instead of throwing error
            }
        }

        return current;
    }

    /**
     * Find any array in the object recursively
     */
    private findAnyArray(obj: unknown): unknown[] | undefined {
        if (Array.isArray(obj)) {
            return obj;
        }

        if (obj && typeof obj === 'object') {
            const objRecord = obj as Record<string, unknown>;
            for (const [, value] of Object.entries(objRecord)) {
                if (Array.isArray(value)) {
                    return value;
                }
                const nestedArray = this.findAnyArray(value);
                if (nestedArray) {
                    return nestedArray;
                }
            }
        }

        return undefined;
    }

    /**
     * Find any ID field recursively in the object
     */
    private findIdRecursively(obj: unknown): unknown {
        if (obj && typeof obj === 'object') {
            const objRecord = obj as Record<string, unknown>;

            // Check if this object has an 'id' field
            if ('id' in objRecord) {
                return objRecord.id;
            }

            // Recursively search in all properties
            for (const [, value] of Object.entries(objRecord)) {
                const foundId = this.findIdRecursively(value);
                if (foundId !== undefined) {
                    return foundId;
                }
            }
        }

        return undefined;
    }

    /**
     * 🔍 STRATEGY 1: Recursive Search
     * Busca o path exato em qualquer lugar da estrutura
     */
    private recursiveSearch(obj: unknown, targetPath: string): unknown {
        const pathSegments = targetPath.split(/[\.\[\]]+/).filter(Boolean);

        const searchRecursively = (
            current: unknown,
            depth: number = 0,
        ): unknown[] => {
            if (depth > 10) return [];

            // Try direct path match
            const directMatch = this.tryDirectPath(current, pathSegments);
            if (directMatch !== undefined) {
                return [directMatch];
            }

            // Recurse into objects
            if (
                current &&
                typeof current === 'object' &&
                !Array.isArray(current)
            ) {
                const results: unknown[] = [];
                for (const value of Object.values(
                    current as Record<string, unknown>,
                )) {
                    results.push(...searchRecursively(value, depth + 1));
                }
                return results;
            }

            return [];
        };

        const matches = searchRecursively(obj);
        return matches.length > 0 ? matches[0] : undefined;
    }

    /**
     * 🗺️ STRATEGY 2: Pattern Discovery + Smart Path
     * Mapeia onde estão os dados e constrói path inteligente
     */
    private discoverSmartPath(
        obj: unknown,
        templatePath: string,
    ): string | undefined {
        // Parse template: .modified_files[0].filename
        const pathMatch = templatePath.match(/^\.([^[]+)(\[(\d+)\])?\.(.+)$/);
        if (!pathMatch) return undefined;

        const [, arrayField, , arrayIndex, finalField] = pathMatch;

        // Find all arrays containing the final field
        if (!finalField) return undefined;
        const arrayPaths = this.findArraysWithField(obj, finalField);

        // Look for arrays that match our target field name
        for (const arrayPath of arrayPaths) {
            if (arrayField && arrayPath.includes(arrayField)) {
                return `${arrayPath}[${arrayIndex || '0'}].${finalField}`;
            }
        }

        // If no exact match, try the first array with the field
        if (arrayPaths.length > 0) {
            return `${arrayPaths[0]}[${arrayIndex || '0'}].${finalField}`;
        }

        return undefined;
    }

    /**
     * Helper: Try direct path on object
     */
    private tryDirectPath(obj: unknown, segments: string[]): unknown {
        let current = obj;

        for (const segment of segments) {
            if (current === null || current === undefined) return undefined;

            if (Array.isArray(current) && /^\d+$/.test(segment)) {
                const index = parseInt(segment);
                if (index >= current.length) return undefined;
                current = current[index];
            } else if (current && typeof current === 'object') {
                const objRecord = current as Record<string, unknown>;
                if (!(segment in objRecord)) return undefined;
                current = objRecord[segment];
            } else {
                return undefined;
            }
        }

        return current;
    }

    /**
     * Helper: Find arrays containing specific field
     */
    private findArraysWithField(obj: unknown, targetField: string): string[] {
        const arrayPaths: string[] = [];

        const search = (
            current: unknown,
            currentPath: string = '',
            depth: number = 0,
        ) => {
            if (depth > 8) return;

            if (Array.isArray(current) && current.length > 0) {
                const firstItem = current[0];
                if (
                    firstItem &&
                    typeof firstItem === 'object' &&
                    targetField in firstItem
                ) {
                    arrayPaths.push(currentPath || 'root');
                }
            } else if (current && typeof current === 'object') {
                for (const [key, value] of Object.entries(
                    current as Record<string, unknown>,
                )) {
                    const newPath = currentPath ? `${currentPath}.${key}` : key;
                    search(value, newPath, depth + 1);
                }
            }
        };

        search(obj);
        return arrayPaths;
    }

    /**
     * 🎯 Find ANY field with specific name recursively
     */
    private findFieldRecursively(obj: unknown, fieldName: string): unknown {
        const results: unknown[] = [];

        const search = (current: unknown, depth: number = 0): void => {
            if (depth > 10) return; // Prevent infinite recursion

            if (Array.isArray(current)) {
                current.forEach((item) => search(item, depth + 1));
            } else if (current && typeof current === 'object') {
                const record = current as Record<string, unknown>;

                // Check if field exists at this level
                if (fieldName in record) {
                    results.push(record[fieldName]);
                }

                // Recurse into nested objects
                for (const value of Object.values(record)) {
                    search(value, depth + 1);
                }
            }
        };

        search(obj);

        this.logger.debug(
            `Found ${results.length} instances of field "${fieldName}"`,
        );
        return results.length > 0 ? results[0] : undefined; // Return first match
    }

    /**
     * 🔍 Parse structured strings agnostically - try all formats
     */
    private parseJsonStrings(obj: unknown): unknown {
        if (Array.isArray(obj)) {
            return obj.map((item) => this.parseJsonStrings(item));
        }

        if (obj && typeof obj === 'object') {
            const record = obj as Record<string, unknown>;
            const result: Record<string, unknown> = {};

            for (const [key, value] of Object.entries(record)) {
                if (typeof value === 'string') {
                    // 🚀 TRULY AGNOSTIC: Try to parse ANY string
                    const parsed = this.tryParseAnyFormat(value);
                    if (parsed !== value) {
                        // Successfully parsed to something different
                        result[key] = parsed;
                        this.logger.debug(
                            `✅ Parsed structured string in field: ${key}`,
                        );
                    } else {
                        result[key] = value; // Keep original if no parsing worked
                    }
                } else {
                    result[key] = this.parseJsonStrings(value);
                }
            }

            return result;
        }

        return obj;
    }

    /**
     * 🚀 TRULY AGNOSTIC: Try to parse string in any structured format
     */
    private tryParseAnyFormat(str: string): unknown {
        const trimmed = str.trim();

        // Skip obviously non-structured strings (performance optimization)
        if (trimmed.length < 3) return str;

        // Strategy 1: Try JSON parse (most common)
        try {
            return JSON.parse(trimmed);
        } catch {
            // Continue to other formats
        }

        // Strategy 2: Try JSON with relaxed quotes
        try {
            // Handle single quotes or unquoted keys
            const relaxedJson = trimmed
                .replace(/'/g, '"')
                .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
            return JSON.parse(relaxedJson);
        } catch {
            // Continue to other formats
        }

        // Strategy 3: Try to detect and parse other formats
        // (Can be extended for XML, YAML, CSV, etc.)

        // If nothing worked, return original string
        return str;
    }

    /**
     * Use LLM to resolve template when all patterns fail
     */
    private async resolveTemplateWithLLM(
        template: string,
        stepId: string,
        stepResult: unknown,
        attemptedPath: string,
    ): Promise<string> {
        try {
            const prompt = `# JSON Value Extraction Assistant

## 🎯 TASK
Extract a specific value from a JSON structure based on a template pattern.

## 📋 CONTEXT
- **Template**: The pattern to match (e.g., "{{step-1.result.id}}")
- **Step ID**: Identifier of the step that produced the JSON
- **Attempted Path**: The path that was tried but failed (e.g., "result.id")
- **JSON Structure**: The actual data to search within

### 🌐 REAL-WORLD DIVERSITY
JSON responses can have ANY property naming convention:
- **IDs**: id, uuid, guid, identifier, key, objectId, entityId, resourceId
- **Names**: name, title, label, displayName, fullName, userName
- **References**: ref, reference, link, url, href, endpoint
- **Timestamps**: timestamp, createdAt, updatedAt, date, time
- **Status**: status, state, condition, phase, stage
- **Custom**: Any domain-specific property names

**Be flexible and search for ANY property that could contain the requested data!**

## 🔍 EXTRACTION RULES

### ✅ WHAT TO RETURN
- **ONLY** the raw value as a plain string
- **NO** quotes, JSON formatting, or extra characters
- **NO** explanations, reasoning, or markdown
- **NO** code fences or formatting

### 🚫 WHAT NOT TO RETURN
- ❌ Quoted strings: "value" → return value
- ❌ JSON objects: {"key": "value"} → return value
- ❌ Explanations: The value is 42 → return 42
- ❌ Code blocks: \`\`\`42\`\`\` → return 42
- ❌ Markdown: **42** → return 42

### 🔄 FALLBACK BEHAVIOR
- If value cannot be found → return NOT_FOUND
- If value is null/undefined → return NOT_FOUND
- If value is empty string → return NOT_FOUND

## 📊 INPUT DATA

**Template**: ${template}
**Step ID**: ${stepId}
**Attempted Path**: ${attemptedPath}
**JSON Structure**:
\`\`\`json
${JSON.stringify(stepResult, null, 2)}
\`\`\`

## 💡 EXAMPLES

### Common Property Patterns (Agnostic)
- Input: {"id": "abc123"} → Output: abc123
- Input: {"uuid": "550e8400-e29b-41d4-a716-446655440000"} → Output: 550e8400-e29b-41d4-a716-446655440000
- Input: {"project_id": "proj_12345"} → Output: proj_12345
- Input: {"requestId": "req_67890"} → Output: req_67890
- Input: {"userIdentifier": "user_abc"} → Output: user_abc
- Input: {"entityId": "ent_xyz"} → Output: ent_xyz
- Input: {"resourceId": "res_789"} → Output: res_789
- Input: {"objectId": "obj_456"} → Output: obj_456

### Nested Property Patterns
- Input: {"data": {"id": "nested_123"}} → Output: nested_123
- Input: {"result": {"entity": {"identifier": "deep_456"}}} → Output: deep_456
- Input: {"response": {"items": [{"id": "first_item"}]}} → Output: first_item

### Various Data Types
- Input: {"count": 42} → Output: 42
- Input: {"enabled": true} → Output: true
- Input: {"name": "John Doe"} → Output: John Doe
- Input: {"email": "john@example.com"} → Output: john@example.com
- Input: {"url": "https://api.example.com/v1/resource"} → Output: https://api.example.com/v1/resource
- Input: {"timestamp": "2024-01-15T10:30:00Z"} → Output: 2024-01-15T10:30:00Z

### Edge Cases
- Input: {"empty": ""} → Output: NOT_FOUND
- Input: {"null_value": null} → Output: NOT_FOUND
- Input: {"undefined_value": undefined} → Output: NOT_FOUND
- Input: {"array": [1, 2, 3]} → Output: [1, 2, 3]
- Input: {"object": {"nested": "value"}} → Output: {"nested": "value"}

## 🎯 EXTRACTION STRATEGY

1. **Analyze** the template pattern to understand what property to extract
2. **Search** the JSON structure for ANY property that matches the pattern (case-insensitive, flexible naming)
3. **Handle** nested structures, arrays, and complex objects appropriately
4. **Extract** the raw value without any formatting or quotes
5. **Validate** the result is not null, undefined, or empty string
6. **Return** the clean value or NOT_FOUND

### 🔍 SEARCH PATTERNS (Agnostic)
- Look for ANY property that could contain the requested data
- Consider common naming variations: id, uuid, guid, identifier, key, name, etc.
- Handle nested paths: data.id, result.entity.identifier, response.items[0].id
- Be flexible with property naming conventions (camelCase, snake_case, kebab-case)

## ⚡ RESPONSE FORMAT
Return ONLY the extracted value as a plain string. No additional text, formatting, or explanation.

---

**EXTRACT THE VALUE NOW:**`;

            const response = await this.llmAdapter.call({
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            });
            let resolvedValue = response.content?.trim() || 'NOT_FOUND';

            // Clean up the response to ensure it's a valid value
            if (resolvedValue !== 'NOT_FOUND') {
                // Remove quotes if present
                resolvedValue = resolvedValue.replace(/^["']|["']$/g, '');
                // Remove any JSON formatting
                resolvedValue = resolvedValue.replace(
                    /^\{.*?:\s*["']?([^"']+)["']?\s*\}$/,
                    '$1',
                );
            }

            return resolvedValue;
        } catch (error) {
            this.logger.warn('❌ LLM TEMPLATE RESOLUTION FAILED', {
                template,
                stepId,
                error: (error as Error).message,
            });
            return 'NOT_FOUND';
        }
    }

    /**
     * 🆕 Update prompt configuration dynamically
     * Allows runtime customization of prompt behavior
     */
    updatePromptConfig(config: PlannerPromptConfig): void {
        this.promptComposer = createPlannerPromptComposer(config);
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
    }
}
