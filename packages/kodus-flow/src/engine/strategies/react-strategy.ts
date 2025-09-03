import { LLMAdapter, AgentInputEnum } from '../../core/types/allTypes.js';
import { createLogger } from '../../observability/index.js';
import { BaseExecutionStrategy } from './strategy-interface.js';
import { SharedStrategyMethods } from './shared-methods.js';
import type {
    StrategyExecutionContext,
    ExecutionResult,
    ExecutionStep,
    AgentAction,
    ActionResult,
    AgentThought,
    ResultAnalysis,
    Hypothesis,
    Reflection,
    EarlyStopping,
} from './types.js';
import { StrategyPromptFactory } from './prompts/index.js';
import { ContextService } from '../../core/contextNew/index.js';
import { EnhancedJSONParser } from '../../utils/json-parser.js';

export class ReActStrategy extends BaseExecutionStrategy {
    private readonly logger = createLogger('react-strategy');
    private readonly promptFactory: StrategyPromptFactory;

    private readonly config: {
        maxIterations: number;
        maxToolCalls: number;
        maxExecutionTime: number;
        stepTimeout: number;
    };

    constructor(
        private llmAdapter: LLMAdapter,
        options: Partial<{
            llmAdapter: LLMAdapter;
            maxIterations: number;
            maxToolCalls: number;
            maxExecutionTime: number;
            stepTimeout: number;
        }> = {},
    ) {
        super();

        const defaultConfig = {
            maxIterations: 10,
            maxToolCalls: 20,
            maxExecutionTime: 300000, // 5 minutos
            stepTimeout: 60000, // 1 minuto por step
        };

        this.promptFactory = new StrategyPromptFactory();
        this.config = { ...defaultConfig, ...options };

        this.logger.info('🎯 ReAct Strategy initialized', {
            config: this.config,
        });
    }

    async execute(context: StrategyExecutionContext): Promise<ExecutionResult> {
        const startTime = Date.now();
        const steps: ExecutionStep[] = [];
        let iteration = 0;
        let toolCallsCount = 0;

        const threadId = context.agentContext.thread?.id;
        if (!threadId) {
            throw new Error('ThreadId required for ContextService operations');
        }

        try {
            this.validateContext(context);

            this.logger.debug('🚀 ReAct strategy started', { threadId });

            // 🔥 NOVO: Track repeated actions to prevent loops
            const actionHistory: string[] = [];

            while (iteration < this.config.maxIterations) {
                // 🔥 FORÇA FINAL ANSWER na última iteração se não tiver resposta final
                const isLastIteration =
                    iteration === this.config.maxIterations - 1;
                const hasFinalAnswer = steps.some(
                    (step) => step.action?.type === 'final_answer',
                );

                if (isLastIteration && !hasFinalAnswer) {
                    this.logger.info(
                        '🎯 Last iteration reached, forcing final answer',
                    );
                    const finalStep = await this.forceFinalAnswer(
                        context,
                        iteration,
                        steps,
                        'Maximum iterations reached without final answer',
                    );
                    steps.push(finalStep);
                    break;
                }

                if (
                    this.shouldStop(iteration, toolCallsCount, startTime, steps)
                ) {
                    break;
                }

                // 🔥 NOVO: Check for potential loops
                const potentialLoop = this.detectLoop(steps, actionHistory);
                if (potentialLoop && iteration > 2) {
                    this.logger.warn(
                        '⚠️ Potential loop detected, forcing final answer',
                        {
                            repeatedAction: potentialLoop,
                            iteration,
                        },
                    );
                    const finalStep = await this.forceFinalAnswer(
                        context,
                        iteration,
                        steps,
                        `Detected repeated action: ${potentialLoop}. Preventing infinite loop.`,
                    );
                    steps.push(finalStep);
                    break;
                }

                const step = await this.executeIteration(
                    context,
                    iteration,
                    steps,
                );
                steps.push(step);

                // 🔥 NOVO: Track action for loop detection
                if (step.action?.type === 'tool_call' && step.action.toolName) {
                    actionHistory.push(
                        `${step.action.type}:${step.action.toolName}`,
                    );
                } else if (step.action?.type) {
                    actionHistory.push(step.action.type);
                }

                this.logger.debug('✅ Iteration completed', {
                    threadId,
                    iteration,
                    actionType: step.action?.type,
                });

                if (step.action?.type === 'final_answer') {
                    this.logger.debug(
                        '🎯 Final answer reached, stopping execution',
                        {
                            iteration: iteration + 1,
                            totalSteps: steps.length,
                        },
                    );
                    break;
                }

                if (step.action?.type === 'tool_call') {
                    toolCallsCount++;
                    this.logger.debug('🔧 Tool call executed', {
                        iteration: iteration + 1,
                        toolCalls: toolCallsCount,
                        actionType: step.action.type,
                    });
                }

                iteration++;
            }

            const result = this.buildSuccessResult(
                steps,
                startTime,
                iteration,
                toolCallsCount,
            );

            this.logger.info('✅ ReAct strategy completed successfully', {
                threadId,
                success: result.success,
                steps: result.steps.length,
                executionTime: result.executionTime,
            });

            return result;
        } catch (error) {
            const result = this.buildErrorResult(
                error,
                steps,
                startTime,
                iteration,
                toolCallsCount,
            );

            this.logger.error(
                `❌ ReAct strategy completed with error: ${result.error}`,
            );

            return result;
        }
    }

    /**
     * Valida contexto de entrada com melhor robustez
     */
    private validateContext(context: StrategyExecutionContext): void {
        if (!context.input?.trim()) {
            throw new Error('Input cannot be empty');
        }

        if (!Array.isArray(context.agentContext?.availableTools)) {
            throw new Error('Tools must be an array');
        }

        if (!context.agentContext) {
            throw new Error('Agent context is required');
        }

        // Validações adicionais para melhor robustez
        if (context.input.length > 10000) {
            this.logger.warn('Input is very long, may affect performance', {
                inputLength: context.input.length,
            });
        }

        if (context.agentContext?.availableTools.length === 0) {
            this.logger.warn(
                'No tools provided - React strategy may not be able to perform complex actions',
            );
        }

        if (context.agentContext?.availableTools.length > 50) {
            this.logger.warn(
                'Many tools provided - may impact prompt size and performance',
                {
                    toolsCount: context.agentContext?.availableTools.length,
                },
            );
        }

        this.logger.debug('Context validation passed', {
            inputLength: context.input.length,
            toolsCount: context.agentContext?.availableTools?.length || 0,
            hasAgentContext: !!context.agentContext,
        });
    }

    private async executeIteration(
        context: StrategyExecutionContext,
        iteration: number,
        previousSteps: ExecutionStep[],
    ): Promise<ExecutionStep> {
        const stepStartTime = Date.now();

        try {
            const threadId = context.agentContext.thread?.id;

            this.logger.debug('🚀 Starting iteration execution', {
                threadId,
                iteration,
                previousStepsCount: previousSteps.length,
                hasLLMAdapter: !!this.llmAdapter,
            });

            // 🔥 VALIDATION: Check if we have all required components
            if (!this.llmAdapter) {
                throw new Error(
                    'LLM adapter not available for iteration execution',
                );
            }

            let thought: AgentThought;
            try {
                thought = await this.generateThought(
                    context,
                    iteration,
                    previousSteps,
                );

                this.logger.debug('💭 Thought generated', {
                    threadId,
                    iteration,
                    actionType: thought.action.type,
                    hasReasoning: !!thought.reasoning,
                });
            } catch (thoughtError) {
                // 🔥 CORREÇÃO: Se thought generation falhar, ainda criar step com informações básicas
                this.logger.error(
                    '💥 Thought generation failed in iteration',
                    thoughtError instanceof Error ? thoughtError : undefined,
                    {
                        iteration,
                        threadId,
                    },
                );

                thought = {
                    reasoning: `Thought generation failed: ${thoughtError instanceof Error ? thoughtError.message : String(thoughtError)}`,
                    confidence: 0.0,
                    hypotheses: [],
                    reflection: {
                        shouldContinue: false,
                        reasoning: 'Thought generation failed',
                        alternatives: [],
                    },
                    earlyStopping: {
                        shouldStop: true,
                        reason: 'Thought generation error',
                    },
                    action: {
                        type: 'final_answer',
                        content: `I encountered an error while processing your request: ${thoughtError instanceof Error ? thoughtError.message : String(thoughtError)}`,
                    },
                    metadata: {
                        iteration,
                        timestamp: Date.now(),
                        error: true,
                    },
                };
            }

            const actionResult = await this.executeAction(
                thought.action,
                context,
            );

            this.logger.debug('⚡ Action executed', {
                threadId,
                iteration,
                actionType: thought.action.type,
                resultType: actionResult.type,
                hasContent: !!actionResult.content,
            });

            const observation = await this.analyzeResult(actionResult);

            this.logger.debug('👁️ Result analyzed', {
                threadId,
                iteration,
                isComplete: observation.isComplete,
                shouldContinue: observation.shouldContinue,
                isSuccessful: observation.isSuccessful,
            });

            if (threadId) {
                try {
                    await this.updateSessionMinimal(threadId, {
                        iteration: iteration + 1,
                        actionType: thought.action.type,
                        isCompleted: observation.isComplete,
                        stepId: `react-step-${iteration}`,
                        toolName:
                            thought.action.type === 'tool_call'
                                ? thought.action.toolName
                                : undefined,
                    });
                } catch (error) {
                    this.logger.debug('Session update failed (non-critical)', {
                        error,
                    });
                }
            }

            this.logger.debug('🔍 Observe step completed', {
                threadId,
                iteration,
                isComplete: observation.isComplete,
                shouldContinue: observation.shouldContinue,
            });

            const step: ExecutionStep = {
                id: `react-step-${iteration}-${Date.now()}`,
                type: 'think',
                type2: 'think' as any,
                status: 'completed',
                timestamp: stepStartTime,
                duration: Date.now() - stepStartTime,
                thought,
                action: thought.action,
                result: actionResult,
                observation,
                metadata: {
                    iteration,
                    strategy: 'react',
                    stepSequence: 'think-act-observe',
                    completedAt: Date.now(),
                },
            };

            this.logger.debug('✅ Step completed successfully', {
                threadId,
                iteration,
                stepId: step.id,
                actionType: thought.action.type,
                resultType: actionResult.type,
            });

            return step;
        } catch (error) {
            this.logger.error(
                `❌ Iteration ${iteration + 1} failed`,
                error instanceof Error ? error : undefined,
                {
                    iteration,
                },
            );

            // 🔥 CORREÇÃO: Criar step de erro com informações básicas
            // Como thought pode não estar definida aqui, usar fallback
            const errorThought: AgentThought = {
                reasoning: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
                confidence: 0.0,
                hypotheses: [],
                reflection: {
                    shouldContinue: false,
                    reasoning: 'Unexpected error occurred',
                    alternatives: [],
                },
                earlyStopping: {
                    shouldStop: true,
                    reason: 'Unexpected error',
                },
                action: {
                    type: 'final_answer',
                    content: `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`,
                },
                metadata: {
                    iteration,
                    timestamp: Date.now(),
                    error: true,
                },
            };

            const errorAction: AgentAction = {
                type: 'final_answer',
                content: `Error: ${error instanceof Error ? error.message : String(error)}`,
            };

            const errorResult: ActionResult = {
                type: 'error',
                success: false,
                content: error instanceof Error ? error.message : String(error),
                metadata: {
                    timestamp: Date.now(),
                    source: 'react-strategy',
                    executionTime: Date.now() - stepStartTime,
                    error: true,
                },
            };

            // Retorna step de erro com informações completas
            return {
                id: `react-step-error-${iteration}-${Date.now()}`,
                type: 'think',
                type2: 'think' as any,
                status: 'failed',
                timestamp: stepStartTime,
                duration: Date.now() - stepStartTime,
                thought: errorThought,
                action: errorAction,
                result: errorResult,
                observation: await this.analyzeResult(errorResult),
                metadata: {
                    iteration,
                    strategy: 'react',
                    error:
                        error instanceof Error ? error.message : String(error),
                    errorStack:
                        error instanceof Error ? error.stack : undefined,
                    failedAt: Date.now(),
                    originalThought: false,
                    originalAction: false,
                },
            };
        }
    }

    private async generateThought(
        context: StrategyExecutionContext,
        iteration: number,
        previousSteps: ExecutionStep[],
    ): Promise<AgentThought> {
        const thoughtStartTime = Date.now();

        try {
            this.logger.debug('🧠 Starting thought generation', {
                iteration,
                previousStepsCount: previousSteps.length,
                hasLLMAdapter: !!this.llmAdapter?.call,
            });

            if (!this.llmAdapter?.call) {
                throw new Error('LLM adapter must support call method');
            }

            context.mode = 'executor';
            context.step = previousSteps[previousSteps.length - 1];

            // 🔥 MELHORADO: Histórico detalhado para o LLM entender o progresso
            context.history = previousSteps.map((step, index) => {
                this.logger.debug('📋 Processing step for history', {
                    stepIndex: index,
                    stepId: step.id,
                    stepType: step.type,
                    hasThought: !!step.thought,
                    hasAction: !!step.action,
                    hasResult: !!step.result,
                    thoughtReasoning: step.thought?.reasoning,
                    actionType: step.action?.type,
                    resultType: step.result?.type,
                });

                return {
                    type: step.type || 'unknown',
                    thought: step.thought
                        ? {
                              reasoning: step.thought.reasoning,
                              action: step.action,
                          }
                        : undefined,
                    action: step.action,
                    result: step.result
                        ? {
                              type: step.result.type,
                              content: step.result.content,
                              success: step.result.type !== 'error',
                          }
                        : undefined,
                };
            }) as ExecutionStep[];

            // 🔥 NOVO: Adicionar informações sobre iteração atual
            context.currentIteration = iteration;
            context.maxIterations = this.config.maxIterations;

            this.logger.debug('📝 Context prepared for LLM', {
                iteration,
                historyLength: context.history.length,
                hasCollectedInfo: !!context.collectedInfo,
                currentIteration: context.currentIteration,
                maxIterations: context.maxIterations,
            });

            const prompts = this.promptFactory.createReActPrompt(context);

            this.logger.debug('🤖 Calling LLM', {
                iteration,
                systemPromptLength: prompts.systemPrompt.length,
                userPromptLength: prompts.userPrompt.length,
            });

            let response;
            try {
                response = await this.llmAdapter.call({
                    messages: [
                        {
                            role: AgentInputEnum.SYSTEM,
                            content: prompts.systemPrompt,
                        },
                        {
                            role: AgentInputEnum.USER,
                            content: prompts.userPrompt,
                        },
                    ],
                });

                this.logger.debug('✅ LLM call successful', {
                    iteration,
                    hasResponse: !!response,
                    responseType: typeof response,
                    hasContent: !!response?.content,
                });
            } catch (llmError) {
                const errorMessage =
                    llmError instanceof Error
                        ? llmError.message
                        : String(llmError);

                this.logger.error(
                    '❌ LLM call failed',
                    llmError instanceof Error ? llmError : undefined,
                    {
                        iteration,
                    },
                );

                return {
                    reasoning: `LLM encountered an error: ${errorMessage}`,
                    confidence: 0.0, // Very low confidence due to error
                    hypotheses: [
                        {
                            approach: 'Error fallback',
                            confidence: 0.0,
                            action: {
                                type: 'final_answer',
                                content: `I encountered an error while processing your request: ${errorMessage}. Please try rephrasing your question.`,
                            },
                        },
                    ],
                    reflection: {
                        shouldContinue: false,
                        reasoning: 'LLM error occurred, cannot proceed safely',
                        alternatives: [],
                    },
                    earlyStopping: {
                        shouldStop: true,
                        reason: 'LLM error prevents safe execution',
                    },
                    action: {
                        type: 'final_answer',
                        content: `I encountered an error while processing your request: ${errorMessage}. Please try rephrasing your question.`,
                    },
                    metadata: {
                        iteration,
                        timestamp: Date.now(),
                        fallbackUsed: true,
                        errorReason: 'llm_error',
                        thoughtGenerationTime: Date.now() - thoughtStartTime,
                    },
                };
            }

            let content: string;
            if (typeof response.content === 'string') {
                content = response.content;
            } else if (response.content) {
                content = JSON.stringify(response.content);
            } else {
                throw new Error('LLM returned empty or invalid response');
            }

            this.logger.debug('📄 LLM response content extracted', {
                iteration,
                contentLength: content.length,
                contentPreview: content.substring(0, 200),
            });

            const thought = await this.parseLLMResponse(content, iteration);

            this.logger.debug('💭 Thought successfully generated', {
                iteration,
                actionType: thought.action.type,
                hasReasoning: !!thought.reasoning,
                thoughtGenerationTime: Date.now() - thoughtStartTime,
            });

            return thought;
        } catch (error) {
            this.logger.error(
                '💥 Thought generation failed',
                error instanceof Error ? error : undefined,
                {
                    iteration,
                    thoughtGenerationTime: Date.now() - thoughtStartTime,
                },
            );

            // Fallback thought
            return {
                reasoning: `Thought generation failed: ${error instanceof Error ? error.message : String(error)}`,
                confidence: 0.0, // Very low confidence due to thought generation error
                hypotheses: [
                    {
                        approach: 'Error fallback',
                        confidence: 0.0,
                        action: {
                            type: 'final_answer',
                            content: `I encountered an error while processing your request. Please try rephrasing your question.`,
                        },
                    },
                ],
                reflection: {
                    shouldContinue: false,
                    reasoning:
                        'Thought generation failed, cannot proceed safely',
                    alternatives: [],
                },
                earlyStopping: {
                    shouldStop: true,
                    reason: 'Thought generation error prevents safe execution',
                },
                action: {
                    type: 'final_answer',
                    content: `I encountered an error while processing your request. Please try rephrasing your question.`,
                },
                metadata: {
                    iteration,
                    timestamp: Date.now(),
                    fallbackUsed: true,
                    errorReason: 'thought_generation_error',
                    thoughtGenerationTime: Date.now() - thoughtStartTime,
                },
            };
        }
    }

    private async executeAction(
        action: AgentAction,
        context: StrategyExecutionContext,
    ): Promise<ActionResult> {
        const actionStartTime = Date.now();

        try {
            this.logger.debug('🔧 Starting action execution', {
                actionType: action.type,
                threadId: context.agentContext.thread?.id,
            });

            switch (action.type) {
                case 'tool_call':
                    this.logger.debug('🛠️ Executing tool call', {
                        toolName: action.toolName,
                        hasInput: !!action.input,
                        inputType: typeof action.input,
                        threadId: context.agentContext.thread?.id,
                    });

                    try {
                        const result = await SharedStrategyMethods.executeTool(
                            action,
                            context,
                        );

                        this.logger.debug('✅ Tool executed successfully', {
                            toolName: action.toolName,
                            hasResult: !!result,
                            resultType: typeof result,
                            executionTime: Date.now() - actionStartTime,
                            threadId: context.agentContext.thread?.id,
                        });

                        return {
                            type: 'tool_result',
                            content: result,
                            success: !!result,
                            metadata: {
                                toolName: action.toolName,
                                arguments: action.input,
                                timestamp: Date.now(),
                                source: 'react-strategy',
                                executionTime: Date.now() - actionStartTime,
                            },
                        };
                    } catch (toolError) {
                        this.logger.error(
                            '❌ Tool execution failed',
                            toolError instanceof Error ? toolError : undefined,
                            {
                                toolName: action.toolName,
                                executionTime: Date.now() - actionStartTime,
                                threadId: context.agentContext.thread?.id,
                            },
                        );

                        return {
                            type: 'error',
                            success: false,
                            content:
                                toolError instanceof Error
                                    ? toolError.message
                                    : String(toolError),
                            metadata: {
                                toolName: action.toolName,
                                arguments: action.input,
                                timestamp: Date.now(),
                                source: 'react-strategy',
                                executionTime: Date.now() - actionStartTime,
                                error: true,
                                errorMessage:
                                    toolError instanceof Error
                                        ? toolError.message
                                        : String(toolError),
                            },
                        };
                    }

                case 'final_answer':
                    this.logger.debug('🎯 Providing final answer', {
                        hasContent: !!action.content,
                        contentLength: action.content
                            ? action.content.length
                            : 0,
                        threadId: context.agentContext.thread?.id,
                    });

                    return {
                        type: 'final_answer',
                        content: action.content,
                        success: true,
                        metadata: {
                            timestamp: Date.now(),
                            source: 'react-strategy',
                            executionTime: Date.now() - actionStartTime,
                        },
                    };

                default:
                    this.logger.error('❌ Unknown action type', undefined, {
                        actionType: action.type,
                        threadId: context.agentContext.thread?.id,
                    });
                    return {
                        type: 'error',
                        success: false,
                        content: `Unknown action type: ${action.type}`,
                        metadata: {
                            timestamp: Date.now(),
                            source: 'react-strategy',
                            executionTime: Date.now() - actionStartTime,
                            error: true,
                            errorMessage: `Unknown action type: ${action.type}`,
                        },
                    };
            }
        } catch (error) {
            this.logger.error(
                '💥 Action execution failed',
                error instanceof Error ? error : undefined,
                {
                    actionType: action.type,
                    executionTime: Date.now() - actionStartTime,
                },
            );
            throw error;
        }
    }

    private async analyzeResult(result: ActionResult): Promise<ResultAnalysis> {
        const analysisStartTime = Date.now();

        try {
            this.logger.debug('🔍 Starting result analysis', {
                resultType: result.type,
                hasContent: !!result.content,
                contentType: typeof result.content,
            });

            const isComplete = result.type === 'final_answer';
            const isSuccessful = result.type !== 'error';
            const shouldContinue = result.type === 'tool_result';
            const feedback = this.generateFeedback(result);

            const analysis = {
                isComplete,
                isSuccessful,
                shouldContinue,
                feedback,
                metadata: {
                    resultType: result.type,
                    timestamp: Date.now(),
                    analysisTime: Date.now() - analysisStartTime,
                },
            };

            this.logger.debug('✅ Result analysis completed', {
                resultType: result.type,
                isComplete,
                isSuccessful,
                shouldContinue,
                hasFeedback: !!feedback,
                feedbackLength: feedback.length,
                analysisTime: Date.now() - analysisStartTime,
            });

            return analysis;
        } catch (error) {
            this.logger.error(
                '💥 Result analysis failed',
                error instanceof Error ? error : undefined,
                {
                    resultType: result.type,
                    analysisTime: Date.now() - analysisStartTime,
                },
            );

            // Fallback analysis
            return {
                isComplete: result.type === 'final_answer',
                isSuccessful: false,
                shouldContinue: false,
                feedback: `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
                metadata: {
                    resultType: result.type,
                    timestamp: Date.now(),
                    analysisTime: Date.now() - analysisStartTime,
                    error: true,
                },
            };
        }
    }

    private shouldStop(
        _iteration: number,
        toolCallsCount: number,
        startTime: number,
        steps: ExecutionStep[],
    ): boolean {
        // Timeout
        if (Date.now() - startTime > this.config.maxExecutionTime) {
            this.logger.info('🛑 Stopping: Max execution time reached');
            return true;
        }

        // Max tool calls
        if (toolCallsCount >= this.config.maxToolCalls) {
            this.logger.info('🛑 Stopping: Max tool calls reached');
            return true;
        }

        // Último step teve resposta final
        const lastStep = steps[steps.length - 1];
        if (lastStep?.action?.type === 'final_answer') {
            this.logger.info('🛑 Stopping: Final answer found');
            return true;
        }

        return false;
    }

    /**
     * 🔥 NOVO: Detecta loops baseados em ações repetidas
     */
    private detectLoop(
        steps: ExecutionStep[],
        actionHistory: string[],
    ): string | null {
        if (actionHistory.length < 3) {
            return null;
        }

        // Check for repeated tool calls in last 3 actions
        const lastThreeActions = actionHistory.slice(-3);
        const uniqueActions = new Set(lastThreeActions);

        // If all 3 actions are the same, it's likely a loop
        if (uniqueActions.size === 1 && lastThreeActions.length === 3) {
            return lastThreeActions[0] ?? null;
        }

        // Check for pattern: A, B, A (where A is the same action)
        if (
            lastThreeActions.length === 3 &&
            lastThreeActions[0] === lastThreeActions[2] &&
            lastThreeActions[1] !== lastThreeActions[0]
        ) {
            return lastThreeActions[0] ?? null;
        }

        // Check for tool calls with same parameters (more sophisticated)
        const recentToolCalls = steps
            .slice(-3)
            .filter((step) => step.action?.type === 'tool_call')
            .map((step) => ({
                toolName: (step.action as any)?.toolName,
                input: JSON.stringify((step.action as any)?.input),
            }));

        if (recentToolCalls.length >= 2) {
            // Check if last 2 tool calls are identical
            const lastTwo = recentToolCalls.slice(-2);
            if (
                lastTwo.length === 2 &&
                lastTwo[0]?.toolName === lastTwo[1]?.toolName &&
                lastTwo[0]?.input === lastTwo[1]?.input
            ) {
                return `${lastTwo[0]?.toolName} with same parameters`;
            }
        }

        return null;
    }

    private extractFinalResult(steps: ExecutionStep[]): unknown {
        for (let i = steps.length - 1; i >= 0; i--) {
            const step = steps[i];

            if (step?.action?.type === 'final_answer' && step.action.content) {
                return step.action.content;
            }
            if (step?.result?.type === 'final_answer' && step.result.content) {
                return step.result.content;
            }
        }

        for (let i = steps.length - 1; i >= 0; i--) {
            const step = steps[i];
            if (step?.result?.type === 'tool_result' && step.result.content) {
                return step.result.content;
            }
        }

        return 'No final result found';
    }

    private parseLLMResponse(content: string, iteration: number): AgentThought {
        // 🔥 MELHORADO: Tentar parsing múltiplas vezes com diferentes abordagens
        let parseResult = EnhancedJSONParser.parseWithValidation(
            content,
            (
                data: unknown,
            ): data is {
                reasoning: string;
                confidence: number;
                hypotheses: unknown[];
                reflection: unknown;
                earlyStopping: unknown;
                action: unknown;
            } => {
                const d = data as any;
                return (
                    typeof data === 'object' &&
                    data !== null &&
                    'reasoning' in d &&
                    'confidence' in d &&
                    'hypotheses' in d &&
                    'reflection' in d &&
                    'earlyStopping' in d &&
                    'action' in d &&
                    typeof d.reasoning === 'string' &&
                    typeof d.confidence === 'number' &&
                    Array.isArray(d.hypotheses) &&
                    typeof d.reflection === 'object' &&
                    typeof d.earlyStopping === 'object' &&
                    typeof d.action === 'object' &&
                    d.action !== null
                );
            },
        );

        // 🔥 NOVO: Se falhar, tentar extrair JSON de dentro de texto
        if (!parseResult.success) {
            this.logger.debug(
                'Enhanced JSON parse failed, trying fallback extraction',
                {
                    originalContent: content.substring(0, 200),
                },
            );

            // Try to extract JSON from markdown code blocks or text
            const jsonMatch = content.match(
                /```(?:json)?\s*(\{[\s\S]*?\})\s*```/,
            );
            if (jsonMatch?.[1]) {
                try {
                    const extractedJson = jsonMatch[1];
                    parseResult = EnhancedJSONParser.parseWithValidation(
                        extractedJson,
                        (
                            data: unknown,
                        ): data is {
                            reasoning: string;
                            confidence: number;
                            hypotheses: unknown[];
                            reflection: unknown;
                            earlyStopping: unknown;
                            action: unknown;
                        } => {
                            const d = data as any;
                            return (
                                typeof data === 'object' &&
                                data !== null &&
                                'reasoning' in d &&
                                'confidence' in d &&
                                'hypotheses' in d &&
                                'reflection' in d &&
                                'earlyStopping' in d &&
                                'action' in d &&
                                typeof d.reasoning === 'string' &&
                                typeof d.confidence === 'number' &&
                                Array.isArray(d.hypotheses) &&
                                typeof d.reflection === 'object' &&
                                typeof d.earlyStopping === 'object' &&
                                typeof d.action === 'object' &&
                                d.action !== null
                            );
                        },
                    );
                } catch (extractError) {
                    this.logger.debug('JSON extraction failed', {
                        extractError,
                    });
                }
            }
        }

        // 🔥 NOVO: Último fallback - tentar parsing manual se tudo falhar
        if (!parseResult.success) {
            this.logger.warn(
                'All JSON parsing methods failed, using manual fallback',
                {
                    iteration,
                    contentLength: content.length,
                },
            );

            try {
                const manualParsed = this.manualJSONFallback(content);
                if (manualParsed) {
                    return {
                        reasoning: manualParsed.reasoning,
                        confidence: 0.3, // Low confidence for manual fallback
                        hypotheses: [
                            {
                                approach: 'Manual fallback parsing',
                                confidence: 0.3,
                                action: this.parseActionFromJSON(
                                    manualParsed.action,
                                ),
                            },
                        ],
                        reflection: {
                            shouldContinue: true,
                            reasoning:
                                'Manual parsing successful but with low confidence',
                            alternatives: ['Retry with better JSON format'],
                        },
                        earlyStopping: {
                            shouldStop: false,
                            reason: 'Manual parsing successful, can continue',
                        },
                        action: this.parseActionFromJSON(manualParsed.action),
                        metadata: {
                            iteration,
                            timestamp: Date.now(),
                            parseMethod: 'manual-fallback',
                        },
                    };
                }
            } catch (manualError) {
                this.logger.error(
                    'Manual parsing fallback failed',
                    manualError instanceof Error ? manualError : undefined,
                );
            }

            // Final fallback - create a basic response
            return {
                reasoning: `Unable to parse LLM response after multiple attempts. Original content length: ${content.length}`,
                confidence: 0.0, // Zero confidence due to parsing failure
                hypotheses: [
                    {
                        approach: 'Final fallback due to parsing failure',
                        confidence: 0.0,
                        action: {
                            type: 'final_answer',
                            content:
                                'I encountered a parsing error while processing your request. Please try rephrasing your question.',
                        },
                    },
                ],
                reflection: {
                    shouldContinue: false,
                    reasoning:
                        'All parsing methods failed, cannot proceed safely',
                    alternatives: [],
                },
                earlyStopping: {
                    shouldStop: true,
                    reason: 'Parsing failure prevents safe execution',
                },
                action: {
                    type: 'final_answer',
                    content:
                        'I encountered a parsing error while processing your request. Please try rephrasing your question.',
                },
                metadata: {
                    iteration,
                    timestamp: Date.now(),
                    parseMethod: 'final-fallback',
                    error: parseResult.error,
                },
            };
        }

        const parsed = parseResult.data;

        // 🔥 NOVO: Validar e processar os novos campos
        const confidence = this.validateConfidence(parsed.confidence);
        const hypotheses = this.validateHypotheses(parsed.hypotheses);
        const reflection = this.validateReflection(parsed.reflection);
        const earlyStopping = this.validateEarlyStopping(parsed.earlyStopping);

        // 🔥 NOVO: Selecionar a melhor ação baseada em confidence e early stopping
        const selectedAction = this.selectBestAction(hypotheses, earlyStopping);

        return {
            reasoning: parsed.reasoning,
            confidence,
            hypotheses,
            reflection,
            earlyStopping,
            action: selectedAction,
            metadata: {
                iteration,
                timestamp: Date.now(),
                parseMethod: 'enhanced-json',
                confidenceValidated: true,
                hypothesesCount: hypotheses.length,
                earlyStoppingChecked: true,
            },
        };
    }

    /**
     * 🔥 NOVO: Fallback manual para parsing JSON quando tudo falha
     */
    private manualJSONFallback(
        content: string,
    ): { reasoning: string; action: any } | null {
        try {
            // Try to find reasoning
            const reasoningMatch = content.match(
                /"reasoning"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/,
            );
            const reasoning = reasoningMatch?.[1] ?? 'Fallback reasoning';

            // Try to find action type
            let actionType = 'final_answer';
            if (content.includes('"tool_call"')) {
                actionType = 'tool_call';
            }

            // For tool_call, try to extract tool name and input
            if (actionType === 'tool_call') {
                const toolNameMatch = content.match(
                    /"toolName"\s*:\s*"([^"]+)"/,
                );
                const inputMatch = content.match(
                    /"input"\s*:\s*(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})/,
                );

                if (toolNameMatch?.[1]) {
                    try {
                        return {
                            reasoning,
                            action: {
                                type: 'tool_call',
                                toolName: toolNameMatch[1],
                                input: inputMatch?.[1]
                                    ? JSON.parse(inputMatch[1])
                                    : {},
                            },
                        };
                    } catch {
                        return {
                            reasoning,
                            action: {
                                type: 'tool_call',
                                toolName: toolNameMatch[1],
                                input: {},
                            },
                        };
                    }
                }
            }

            // For final_answer, try to extract content
            const contentMatch = content.match(
                /"content"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/,
            );
            const finalContent =
                contentMatch?.[1] ?? 'Unable to extract content from response';

            return {
                reasoning,
                action: {
                    type: 'final_answer',
                    content: finalContent,
                },
            };
        } catch (error) {
            this.logger.debug('Manual JSON fallback failed', { error });
            return null;
        }
    }

    private parseActionFromJSON(actionData: any): AgentAction {
        if (actionData.type === 'final_answer') {
            return {
                type: 'final_answer',
                content: actionData.content || 'Analysis completed',
            };
        }

        if (actionData.type === 'tool_call') {
            return {
                type: 'tool_call',
                toolName: actionData.toolName || actionData.tool_name,
                input: actionData.input || actionData.parameters || {},
            };
        }

        return {
            type: 'final_answer',
            content: 'Unable to determine action type',
        };
    }

    /**
     * 🔥 NOVO: Validar confidence score (0.0-1.0)
     */
    private validateConfidence(confidence: number): number {
        if (typeof confidence !== 'number' || isNaN(confidence)) {
            this.logger.warn('Invalid confidence value, using default 0.5', {
                confidence,
            });
            return 0.5;
        }

        if (confidence < 0) {
            this.logger.warn('Confidence below 0, clamping to 0', {
                confidence,
            });
            return 0.0;
        }

        if (confidence > 1) {
            this.logger.warn('Confidence above 1, clamping to 1', {
                confidence,
            });
            return 1.0;
        }

        return confidence;
    }

    /**
     * 🔥 NOVO: Validar hypotheses array
     */
    private validateHypotheses(hypothesesData: any[]): Hypothesis[] {
        if (!Array.isArray(hypothesesData) || hypothesesData.length === 0) {
            // Fallback: criar hypothesis básica
            return [
                {
                    approach: 'Primary approach',
                    confidence: 0.5,
                    action: {
                        type: 'final_answer',
                        content: 'Fallback response',
                    },
                },
            ];
        }

        return hypothesesData.map((hyp, index) => {
            try {
                const confidence = this.validateConfidence(
                    hyp.confidence || 0.5,
                );
                const action = this.parseActionFromJSON(hyp.action);

                return {
                    approach: hyp.approach || `Hypothesis ${index + 1}`,
                    confidence,
                    action,
                };
            } catch (error) {
                this.logger.warn('Invalid hypothesis, using fallback', {
                    index,
                    error,
                });
                return {
                    approach: `Hypothesis ${index + 1} (fallback)`,
                    confidence: 0.3,
                    action: {
                        type: 'final_answer',
                        content: 'Fallback due to invalid hypothesis',
                    },
                };
            }
        });
    }

    /**
     * 🔥 NOVO: Validar reflection object
     */
    private validateReflection(reflectionData: any): Reflection {
        if (!reflectionData || typeof reflectionData !== 'object') {
            return {
                shouldContinue: true,
                reasoning: 'No reflection provided, continuing',
                alternatives: [],
            };
        }

        return {
            shouldContinue: reflectionData.shouldContinue !== false,
            reasoning: reflectionData.reasoning || 'No reasoning provided',
            alternatives: Array.isArray(reflectionData.alternatives)
                ? reflectionData.alternatives
                : [],
        };
    }

    /**
     * 🔥 NOVO: Validar early stopping decision
     */
    private validateEarlyStopping(earlyStoppingData: any): EarlyStopping {
        if (!earlyStoppingData || typeof earlyStoppingData !== 'object') {
            return {
                shouldStop: false,
                reason: 'No early stopping decision provided',
            };
        }

        return {
            shouldStop: earlyStoppingData.shouldStop === true,
            reason: earlyStoppingData.reason || 'Early stopping triggered',
        };
    }

    /**
     * 🔥 NOVO: Selecionar melhor ação baseada em confidence e early stopping
     */
    private selectBestAction(
        hypotheses: Hypothesis[],
        earlyStopping: EarlyStopping,
    ): AgentAction {
        // 1. Early stopping tem prioridade máxima
        if (earlyStopping.shouldStop) {
            this.logger.info('🚨 Early stopping triggered', {
                reason: earlyStopping.reason,
            });
            return {
                type: 'final_answer',
                content: `Early stopping: ${earlyStopping.reason}`,
            };
        }

        // 2. Selecionar hypothesis com maior confidence
        if (hypotheses.length > 0) {
            const bestHypothesis = hypotheses.reduce((best, current) =>
                current.confidence > best.confidence ? current : best,
            );

            this.logger.debug('Selected best hypothesis', {
                confidence: bestHypothesis.confidence,
                approach: bestHypothesis.approach,
                actionType: bestHypothesis.action.type,
            });

            return bestHypothesis.action;
        }

        // 3. Fallback para resposta final
        this.logger.warn('No valid hypotheses found, using fallback');
        return {
            type: 'final_answer',
            content: 'Unable to determine best action from hypotheses',
        };
    }

    private async updateSessionMinimal(
        threadId: string,
        update: {
            iteration: number;
            actionType: string;
            isCompleted: boolean;
            stepId: string;
            toolName?: string; // 🆕 Track which tool was used
        },
    ): Promise<void> {
        try {
            const executionUpdate: {
                currentStep?: {
                    id: string;
                    status:
                        | 'pending'
                        | 'executing'
                        | 'completed'
                        | 'failed'
                        | 'skipped';
                };
                status?: 'in_progress' | 'success' | 'error' | 'partial';
                currentTool?: string;
                completedSteps?: string[];
            } = {
                currentStep: {
                    id: update.stepId,
                    status: update.isCompleted ? 'completed' : 'executing',
                },
            };

            if (update.actionType === 'tool_call') {
                executionUpdate.currentTool =
                    update.toolName || 'tool_executing';
            }

            if (update.isCompleted) {
                executionUpdate.status = 'success';
                executionUpdate.completedSteps = [update.stepId];
            } else {
                executionUpdate.status = 'in_progress';
            }

            await ContextService.updateExecution(threadId, executionUpdate);

            this.logger.debug('✅ Session updated (minimal)', {
                threadId,
                iteration: update.iteration,
                stepId: update.stepId,
                actionType: update.actionType,
                isCompleted: update.isCompleted,
            });
        } catch (error) {
            // Silent failure - session updates are non-critical
            this.logger.debug('Session update failed', {
                threadId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private generateFeedback(result: ActionResult): string {
        switch (result.type) {
            case 'final_answer':
                return 'Resposta final fornecida com sucesso.';
            case 'tool_result':
                return 'Ferramenta executada, continuando análise.';
            case 'error':
                return `Erro ocorrido: ${result.error}`;
            default:
                return 'Resultado processado.';
        }
    }

    private buildSuccessResult(
        steps: ExecutionStep[],
        startTime: number,
        iterations: number,
        toolCallsCount: number,
    ): ExecutionResult {
        const finalResult = this.extractFinalResult(steps);
        const executionTime = Date.now() - startTime;

        this.logger.info('🎯 ReAct execution completed successfully', {
            steps: steps.length,
            iterations,
            toolCalls: toolCallsCount,
            executionTime,
        });

        return {
            output: finalResult,
            strategy: 'react',
            complexity: steps.length,
            executionTime,
            steps,
            success: true,
            metadata: {
                iterations,
                toolCallsCount,
                finalStepType: steps[steps.length - 1]?.action?.type,
            },
        };
    }

    private buildErrorResult(
        error: unknown,
        steps: ExecutionStep[],
        startTime: number,
        iterations: number,
        toolCallsCount: number,
    ): ExecutionResult {
        const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
        const executionTime = Date.now() - startTime;

        this.logger.error(
            '❌ ReAct execution failed',
            error instanceof Error ? error : undefined,
            {
                stepsCompleted: steps.length,
                iterations,
                toolCalls: toolCallsCount,
                executionTime,
            },
        );

        return {
            output: null,
            strategy: 'react',
            complexity: steps.length,
            executionTime,
            steps,
            success: false,
            error: errorMessage,
            metadata: {
                iterations,
                toolCallsCount,
                failureReason: errorMessage,
            },
        };
    }

    async createFinalResponse(
        context: StrategyExecutionContext,
    ): Promise<string> {
        this.logger.info(
            '🌉 ReAct: Creating final response with ContextBridge',
        );

        try {
            const plannerContext = {
                input: context.input,
                history: context.history.map((step, index) => ({
                    ...step,
                    stepId: step.id,
                    executionId: `exec-${Date.now()}-${index}`,
                })) as any[],
                iterations: 1,
                maxIterations: this.config.maxIterations,
                plannerMetadata: {
                    agentName: context.agentContext.agentName,
                    correlationId:
                        context.agentContext.correlationId ||
                        'react-final-response',
                    tenantId: context.agentContext.tenantId || 'default',
                    thread: context.agentContext.thread || {
                        id: context.agentContext.sessionId || 'unknown',
                    },
                    startTime: context.metadata?.startTime || Date.now(),
                    enhancedContext: (context.agentContext as any)
                        .enhancedRuntimeContext,
                },
                agentContext: context.agentContext,
                isComplete: true,
                update: () => {},
                getCurrentSituation: () =>
                    `ReAct strategy completed for: ${context.input}`,
                getFinalResult: () => {
                    const executionResult = (context as any).originalResult;
                    let content = 'ReAct execution completed';

                    if (executionResult?.output) {
                        content = executionResult.output;
                    }

                    return {
                        success: true,
                        result: { content },
                        iterations: 1,
                        totalTime:
                            new Date().getTime() -
                            (context.metadata?.startTime || Date.now()),
                        thoughts: [],
                        metadata: {
                            ...context.metadata,
                            agentName: context.agentContext.agentName,
                            iterations: 1,
                            toolsUsed: context.metadata?.complexity || 0,
                            thinkingTime:
                                Date.now() -
                                (context.metadata?.startTime || Date.now()),
                        } as any,
                    };
                },
                getCurrentPlan: () => null,
            };

            await ContextService.buildFinalResponseContext(plannerContext);

            return (
                (await plannerContext.getFinalResult().result.content) ?? 'Kody'
            );
        } catch (error) {
            this.logger.error(
                '❌ ReAct: ContextBridge failed, using fallback response',
                error instanceof Error ? error : undefined,
                {
                    input: context.input,
                    agentName: context.agentContext.agentName,
                },
            );
            return 'Kody'; // Fallback response
        }
    }

    /**
     * 🔥 NOVO: Força resposta final quando não há mais iterações disponíveis
     */
    private async forceFinalAnswer(
        context: StrategyExecutionContext,
        iteration: number,
        previousSteps: ExecutionStep[],
        reason: string,
    ): Promise<ExecutionStep> {
        const stepStartTime = Date.now();

        try {
            const threadId = context.agentContext.thread?.id;

            // Modifica contexto para forçar final answer
            const forceFinalContext = {
                ...context,
                mode: 'final_answer_forced' as any,
                step: previousSteps[previousSteps.length - 1],
            };

            // 🔥 MELHORADO: Histórico detalhado para o LLM entender o progresso
            forceFinalContext.history = previousSteps.map((step) => ({
                type: step.type || 'unknown',
                thought: step.thought
                    ? {
                          reasoning: step.thought.reasoning,
                          action: step.action,
                      }
                    : undefined,
                action: step.action,
                result: step.result
                    ? {
                          type: step.result.type,
                          content:
                              step.result.type === 'tool_result'
                                  ? this.summarizeToolResult(step.result)
                                  : step.result.content,
                          success: step.result.type !== 'error',
                      }
                    : undefined,
            })) as ExecutionStep[];

            const prompts =
                this.promptFactory.createReActPrompt(forceFinalContext);

            // Adiciona instrução específica para resposta final
            const finalPrompt = {
                ...prompts,
                userPrompt:
                    prompts.userPrompt +
                    `\n\n🚨 CRITICAL: You MUST provide a final_answer now! ${reason}\n\nBased on the execution history above, provide a comprehensive final answer to the user's question.`,
            };

            let response;
            try {
                response = await this.llmAdapter.call({
                    messages: [
                        {
                            role: AgentInputEnum.SYSTEM,
                            content: prompts.systemPrompt,
                        },
                        {
                            role: AgentInputEnum.USER,
                            content: finalPrompt.userPrompt,
                        },
                    ],
                });
            } catch (llmError) {
                const errorMessage =
                    llmError instanceof Error
                        ? llmError.message
                        : String(llmError);

                return {
                    id: `react-step-force-final-${iteration}-${Date.now()}`,
                    type: 'think',
                    type2: 'think' as any,
                    status: 'pending',
                    timestamp: stepStartTime,
                    duration: Date.now() - stepStartTime,
                    action: {
                        type: 'final_answer',
                        content: `I encountered an error while processing your request: ${errorMessage}. Based on the previous steps, here's what I was able to accomplish.`,
                    },
                    metadata: {
                        iteration,
                        strategy: 'react',
                        forcedFinal: true,
                        errorReason: 'llm_error',
                    },
                };
            }

            let content: string;
            if (typeof response.content === 'string') {
                content = response.content;
            } else if (response.content) {
                content = JSON.stringify(response.content);
            } else {
                throw new Error('LLM returned empty or invalid response');
            }

            const parsedThought = this.parseLLMResponse(content, iteration);

            // Se ainda não for final_answer, força manualmente
            if (parsedThought.action.type !== 'final_answer') {
                this.logger.warn(
                    'LLM did not provide final_answer despite forcing, creating fallback',
                );

                const fallbackContent = this.generateFallbackAnswer(
                    previousSteps,
                    reason,
                );

                parsedThought.action = {
                    type: 'final_answer',
                    content: fallbackContent,
                };
            }

            const actionResult = await this.executeAction(
                parsedThought.action,
                context,
            );

            if (threadId) {
                try {
                    await this.updateSessionMinimal(threadId, {
                        iteration: iteration + 1,
                        actionType: 'final_answer',
                        isCompleted: true,
                        stepId: `react-step-force-final-${iteration}`,
                    });
                } catch (error) {
                    this.logger.debug('Session update failed (non-critical)', {
                        error,
                    });
                }
            }

            this.logger.info('🎯 Forced final answer completed', {
                threadId,
                iteration: iteration + 1,
                forced: true,
                reason,
            });

            return {
                id: `react-step-force-final-${iteration}-${Date.now()}`,
                type: 'think',
                type2: 'think' as any,
                status: 'pending',
                timestamp: stepStartTime,
                duration: Date.now() - stepStartTime,
                thought: parsedThought,
                action: parsedThought.action,
                result: actionResult,
                observation: await this.analyzeResult(actionResult),
                metadata: {
                    iteration,
                    strategy: 'react',
                    stepSequence: 'forced-final',
                    forcedFinal: true,
                    reason,
                },
            };
        } catch (error) {
            this.logger.error(
                '❌ Force final answer failed',
                error instanceof Error ? error : undefined,
                {
                    iteration,
                    reason,
                    errorMessage:
                        error instanceof Error ? error.message : String(error),
                },
            );

            // Fallback final answer
            return {
                id: `react-step-force-final-error-${iteration}-${Date.now()}`,
                type: 'think',
                type2: 'think' as any,
                status: 'pending',
                timestamp: stepStartTime,
                duration: Date.now() - stepStartTime,
                action: {
                    type: 'final_answer',
                    content: this.generateFallbackAnswer(previousSteps, reason),
                },
                metadata: {
                    iteration,
                    strategy: 'react',
                    stepSequence: 'forced-final-error',
                    forcedFinal: true,
                    reason,
                },
            };
        }
    }

    /**
     * Gera resposta fallback quando não conseguimos resposta adequada
     */
    private generateFallbackAnswer(
        previousSteps: ExecutionStep[],
        reason: string,
    ): string {
        const toolResults = previousSteps
            .filter((step) => step.result?.type === 'tool_result')
            .map((step) => this.summarizeToolResult(step.result!))
            .join('\n');

        if (toolResults) {
            return `Based on the executed tools:\n\n${toolResults}\n\n${reason}. Here's a summary of what was accomplished.`;
        }

        return `I was unable to complete the full analysis due to: ${reason}. Please try rephrasing your question or providing more specific details.`;
    }

    /**
     * 🔥 NOVO: Resume resultado da ferramenta para o contexto do LLM
     */
    private summarizeToolResult(result: ActionResult): string {
        if (result.type === 'tool_result' && result.content) {
            try {
                const contentStr =
                    typeof result.content === 'string'
                        ? result.content
                        : JSON.stringify(result.content);

                // Resultado completo sem truncamento
                return `Tool executed successfully - ${contentStr}`;
            } catch {
                return 'Tool executed successfully';
            }
        }

        return 'Tool executed successfully';
    }

    // private buildStandardAdditionalContext(
    //     context: StrategyExecutionContext,
    // ): Record<string, unknown> {
    //     let userContext =
    //         context.agentContext?.agentExecutionOptions?.userContext;

    //     if (typeof userContext === 'string') {
    //         try {
    //             userContext = JSON.parse(userContext);
    //         } catch (error) {
    //             this.logger.warn('Failed to parse userContext as JSON', {
    //                 error,
    //             });
    //         }
    //     }

    //     return {
    //         userContext,
    //         agentIdentity: context.agentContext?.agentIdentity,
    //         agentExecutionOptions: context.agentContext?.agentExecutionOptions,
    //         runtimeContext: (context.agentContext as any)
    //             ?.enhancedRuntimeContext,
    //     };
    // }
}
