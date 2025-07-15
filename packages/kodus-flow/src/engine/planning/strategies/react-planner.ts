/**
 * ReAct Planner - Implementação REAL do ReAct com LLM
 *
 * ReAct = Reasoning + Acting
 * Ciclo: Thought → Action → Observation → Thought → Action...
 */

import { createLogger } from '../../../observability/index.js';
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
import {
    reActOutputSchema,
    type ReActOutput,
    convertPlanToReActOutput,
} from '../../../core/schemas/react-output.js';

export class ReActPlanner implements Planner {
    private logger = createLogger('react-planner');

    constructor(private llmAdapter: LLMAdapter) {
        this.logger.info('ReAct Planner initialized', {
            llmProvider: llmAdapter.getProvider?.()?.name || 'unknown',
            supportsStructured:
                llmAdapter.supportsStructuredGeneration?.() || false,
            supportsPlanning: !!llmAdapter.createPlan,
            availableTechniques: llmAdapter.getAvailableTechniques?.() || [],
        });
    }

    async think(
        input: string,
        context: PlannerExecutionContext,
    ): Promise<AgentThought> {
        this.logger.debug('ReAct thinking started', {
            input: input.substring(0, 100),
            iteration: context.iterations,
            historyLength: context.history.length,
        });

        try {
            // Try LLM-based ReAct (structured, createPlan, or basic call)
            return await this.thinkWithLLMReAct(input, context);
        } catch (error) {
            this.logger.error('ReAct thinking failed', error as Error);

            // Emergency fallback - at least provide some response
            return {
                reasoning: `Error in ReAct planning: ${error instanceof Error ? error.message : 'Unknown error'}`,
                action: {
                    type: 'final_answer',
                    content: `I encountered an error while planning: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
                },
            };
        }
    }

    private async thinkWithLLMReAct(
        input: string,
        context: PlannerExecutionContext,
    ): Promise<AgentThought> {
        const prompt = this.buildImprovedReActPrompt(input, context);

        // ✅ OPTION 1: Try structured generation if supported
        if (this.llmAdapter.supportsStructuredGeneration?.()) {
            try {
                const structuredOutput = await this.llmAdapter
                    .generateStructured!<ReActOutput>({
                    messages: [{ role: 'user', content: prompt }],
                    schema: reActOutputSchema,
                    temperature: 0,
                });

                return this.convertReActOutputToThought(
                    structuredOutput,
                    context,
                );
            } catch (error) {
                this.logger.warn(
                    'Structured generation failed, trying next option',
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                );
            }
        }

        // ✅ OPTION 2: Try planning approach if supported
        if (this.llmAdapter.createPlan) {
            try {
                const plan = (await this.llmAdapter.createPlan(input, 'react', {
                    availableTools: context.availableTools.map((t) => t.name),
                    agentIdentity: context.agentIdentity as string,
                    previousPlans: this.extractPreviousPlans(context),
                })) as {
                    reasoning: string;
                    steps: Array<{
                        tool?: string;
                        arguments?: Record<string, unknown>;
                        description?: string;
                    }>;
                };

                const reactOutput = convertPlanToReActOutput({
                    reasoning: plan.reasoning,
                    steps: plan.steps,
                });

                return this.convertReActOutputToThought(reactOutput, context);
            } catch (error) {
                this.logger.warn('Plan creation failed, using basic approach', {
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            }
        }

        // ✅ OPTION 3: Basic LLM call (always works)
        const response = await this.llmAdapter.call({
            messages: [{ role: 'user', content: prompt }],
        });

        // Try to parse as JSON
        try {
            const parsed = JSON.parse(response.content);
            if (parsed.reasoning && parsed.action) {
                return this.convertReActOutputToThought(parsed, context);
            }
        } catch {
            // Not JSON, continue with text parsing
        }

        // Parse text response for ReAct pattern
        return this.parseTextResponse(response.content, context);
    }

    /**
     * Extract previous plans from execution history
     */
    private extractPreviousPlans(context: PlannerExecutionContext): unknown[] {
        return context.history.map((h) => ({
            id: `plan-${Date.now()}`,
            strategy: 'react',
            goal: h.thought.reasoning,
            steps: [
                {
                    id: 'step_1',
                    description: JSON.stringify(h.action),
                    type: h.action.type === 'tool_call' ? 'action' : 'decision',
                },
            ],
            reasoning: h.observation.feedback,
            complexity: 'medium' as const,
        }));
    }

    /**
     * Parse text response into ReAct format
     */
    private parseTextResponse(
        text: string,
        context: PlannerExecutionContext,
    ): AgentThought {
        // Look for common ReAct patterns in text
        const thoughtMatch = text.match(
            /(?:Thought|Reasoning|Think):\s*(.+?)(?=Action:|$)/is,
        );
        const actionMatch = text.match(
            /(?:Action|Act):\s*(.+?)(?=Observation:|$)/is,
        );

        const reasoning = thoughtMatch?.[1]?.trim() || text;

        // Try to extract tool call from action
        if (actionMatch) {
            const actionText = actionMatch[1]?.trim();
            const toolMatch = actionText?.match(/(\w+)\s*\((.*?)\)/);

            if (toolMatch) {
                const [, toolName, argsStr] = toolMatch;
                const availableTools = context.availableTools.map(
                    (t) => t.name,
                );

                if (toolName && availableTools.includes(toolName)) {
                    try {
                        const args = JSON.parse(argsStr || '{}');
                        return {
                            reasoning,
                            action: {
                                type: 'tool_call' as const,
                                tool: toolName,
                                arguments: args,
                            },
                            confidence: 0.7,
                        };
                    } catch {
                        // Failed to parse args
                    }
                }
            }
        }

        // Default to final answer
        return {
            reasoning,
            action: {
                type: 'final_answer' as const,
                content: text,
            },
            confidence: 0.6,
        };
    }

    /**
     * ✅ NEW: Convert ReActOutput to AgentThought with validation
     */
    private convertReActOutputToThought(
        output: ReActOutput,
        context: PlannerExecutionContext,
    ): AgentThought {
        const availableToolNames = context.availableTools.map((t) => t.name);

        // ✅ Tool validation for tool_call actions
        if (output.action.type === 'tool_call') {
            if (!availableToolNames.includes(output.action.tool)) {
                // Convert to final_answer with clear explanation
                return {
                    reasoning: `Tool "${output.action.tool}" is not available. Available tools: ${availableToolNames.join(', ')}`,
                    action: {
                        type: 'final_answer',
                        content: `I don't have access to the "${output.action.tool}" tool. Available tools are: ${availableToolNames.join(', ')}. How can I help you with the available tools or provide guidance instead?`,
                    },
                    confidence: 0.8,
                    metadata: {
                        originalAction: output.action,
                        fallbackReason: 'tool_not_available',
                    },
                };
            }
        }

        return {
            reasoning: output.reasoning,
            action: output.action as AgentAction,
            confidence: output.confidence || 0.8,
            metadata: {
                structured: true,
                availableTools: availableToolNames,
            },
        };
    }

    /**
     * ✅ IMPROVED: Better context engineering for ReAct prompts
     */
    private buildImprovedReActPrompt(
        input: string,
        context: PlannerExecutionContext,
    ): string {
        const availableToolNames = context.availableTools.map((t) => t.name);

        // Context-first approach (Augment Code insight)
        const toolsContext =
            availableToolNames.length > 0
                ? `Available tools: ${availableToolNames
                      .map((t) => {
                          const tool = context.availableTools.find(
                              (tool) => tool.name === t,
                          );
                          return `- ${t}: ${tool?.description || 'No description'}`;
                      })
                      .join('\n')}`
                : `No tools available. Provide conversational guidance using your knowledge.`;

        // History context (last 2 steps for relevance)
        const historyContext =
            context.history.length > 0
                ? `\nRecent context:\n${context.history
                      .slice(-2)
                      .map(
                          (h, i) =>
                              `${i + 1}. Action: ${h.action.type} → Result: ${!isErrorResult(h.result) ? 'Success' : 'Failed'}`,
                      )
                      .join('\n')}`
                : '';

        return `
You are a helpful AI assistant that uses ReAct (Reasoning + Acting) methodology.

${toolsContext}

${historyContext}

Task: ${input}

Instructions:
1. Think step by step about what you need to do
2. Choose ONE action: either call a tool OR provide a final answer
3. If calling a tool, use EXACTLY the tool name from the available list
4. If no suitable tool exists, provide a helpful final answer

Respond with this JSON structure:
{
    "reasoning": "Your thought process about the next step",
    "action": {
        "type": "tool_call" | "final_answer",
        "tool": "exact_tool_name_if_calling_tool",
        "arguments": {"key": "value"},
        "content": "your_final_answer_if_not_calling_tool"
    },
    "confidence": 0.8
}

Important: Only use tools from the available list above. If uncertain, provide a final answer.
        `.trim();
    }

    async analyzeResult(
        result: ActionResult,
        context: PlannerExecutionContext,
    ): Promise<ResultAnalysis> {
        this.logger.debug('Analyzing action result', {
            resultType: result.type,
            hasError: isErrorResult(result),
            iteration: context.iterations,
        });

        // Final answer = complete
        if (result.type === 'final_answer') {
            return {
                isComplete: true,
                isSuccessful: true,
                feedback: 'Task completed with final answer',
                shouldContinue: false,
            };
        }

        // Error = need to continue with new approach
        if (isErrorResult(result)) {
            return {
                isComplete: false,
                isSuccessful: false,
                feedback: `Action failed: ${getResultError(result)}. Need to try a different approach.`,
                shouldContinue: true,
                suggestedNextAction:
                    'Analyze the error and try an alternative approach',
            };
        }

        // Tool result = analyze if it helps with the goal
        const analysisPrompt = `
Original goal: ${context.input}
Action taken: ${JSON.stringify(context.history[context.history.length - 1]?.action)}
Result received: ${JSON.stringify(getResultContent(result))}

Questions:
1. Does this result help achieve the goal?
2. Is the goal now complete?
3. What should be the next step?

Respond in this format:
Complete: [yes/no]
Helpful: [yes/no]
Next: [suggestion for next action]
Reasoning: [your analysis]
        `;

        try {
            const analysis = await this.llmAdapter.call({
                messages: [{ role: 'user', content: analysisPrompt }],
            });

            return this.parseAnalysisResponse(analysis.content);
        } catch (error) {
            this.logger.warn('Failed to analyze result with LLM', {
                error: (error as Error).message,
            });

            // Simple fallback analysis
            return {
                isComplete: false,
                isSuccessful: true,
                feedback: 'Received tool result, continuing to next step',
                shouldContinue: true,
            };
        }
    }

    private parseAnalysisResponse(response: string): ResultAnalysis {
        const completeMatch = response.match(/Complete:\s*(yes|no)/i);
        const helpfulMatch = response.match(/Helpful:\s*(yes|no)/i);
        const nextMatch = response.match(/Next:\s*(.+?)(?=Reasoning:|$)/);
        const reasoningMatch = response.match(/Reasoning:\s*(.+)$/);

        const isComplete = completeMatch?.[1]?.toLowerCase() === 'yes';
        const isHelpful = helpfulMatch?.[1]?.toLowerCase() !== 'no';
        const nextAction = nextMatch?.[1]?.trim();
        const reasoning = reasoningMatch?.[1]?.trim() || 'Analysis completed';

        return {
            isComplete,
            isSuccessful: isHelpful,
            feedback: reasoning,
            shouldContinue: !isComplete,
            suggestedNextAction: nextAction,
        };
    }
}
