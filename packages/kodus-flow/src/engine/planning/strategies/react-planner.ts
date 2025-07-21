/**
 * ReAct Planner - Implementação REAL do ReAct com LLM
 *
 * ReAct = Reasoning + Acting
 * Ciclo: Thought → Action → Observation → Thought → Action...
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
    isToolResult,
    isFinalAnswerResult,
} from '../planner-factory.js';
// ReAct schemas removed - now using PlanningResult from DirectLLMAdapter
// import { AgentContext } from '@/core/types/agent-types.js';
import { Thread } from '../../../core/types/common-types.js';
import { ToolMetadataForLLM } from '@/core/types/tool-types.js';

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

    /**
     * Get available tools objects for the current context
     */
    // private getAvailableToolsObjects(
    //     thread: Thread,
    //     _context?: PlannerExecutionContext,
    // ): AgentContext['availableTools'] {
    //     const executionRuntime = this.getExecutionRuntime(thread);
    //     return executionRuntime?.getAvailableTools() || [];
    // }

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
        debugger;
        // Cache resources once at the beginning
        const thread = context.plannerMetadata.thread!;
        const availableTools = this.getAvailableToolsForContext(thread);
        const executionRuntime = this.getExecutionRuntime(thread);
        const agentIdentity = executionRuntime?.getAgentIdentity();
        const userContext = executionRuntime?.getUserContext();

        // ✅ Build enhanced tools context for ReAct
        const toolsContext = this.buildToolsContextForReAct(availableTools);

        // ✅ Build proper agent_scratchpad for ReAct format
        const agentScratchpad = this.buildAgentScratchpad(context);

        const identityContext = agentIdentity
            ? `\nYour identity:
- Role: ${agentIdentity?.role || 'AI Assistant'}
- Goal: ${agentIdentity?.goal || 'Help the user'}
- Expertise: ${agentIdentity?.expertise?.join(', ') || 'General knowledge'}`
            : '';

        // ✅ Use createPlan with proper context engineering
        if (!this.llmAdapter.createPlan) {
            throw new Error(
                'LLM adapter must support createPlan for ReAct planner',
            );
        }

        const plan = await this.llmAdapter.createPlan(input, 'react', {
            availableTools: availableTools,
            // ✅ Enhanced context engineering for ReAct
            toolsContext,
            agentScratchpad,
            identityContext,
            userContext,
        });

        return this.convertPlanToReActThought(
            plan as Record<string, unknown>,
            thread,
        );
    }

    /**
     * ✅ Build enhanced tools context for ReAct format
     */
    private buildToolsContextForReAct(tools: ToolMetadataForLLM[]): string {
        if (tools.length === 0) return 'No tools available.';

        return tools
            .map((tool) => {
                const params = tool.parameters?.properties
                    ? Object.entries(tool.parameters.properties)
                          .map(([name, prop]) => {
                              const propObj = prop as Record<string, unknown>;
                              const description =
                                  propObj.description ||
                                  propObj.type ||
                                  'unknown';
                              const required = (
                                  (tool.parameters?.required as string[]) || []
                              ).includes(name)
                                  ? ' (required)'
                                  : '';
                              return `  - ${name}: ${description}${required}`;
                          })
                          .join('\n')
                    : '  No parameters';

                return `${tool.name}: ${tool.description || 'No description'}\nParameters:\n${params}`;
            })
            .join('\n\n');
    }

    /**
     * ✅ Build proper agent_scratchpad for ReAct format
     */
    private buildAgentScratchpad(context: PlannerExecutionContext): string {
        if (context.history.length === 0) return '';

        return (
            context.history
                .map((entry) => {
                    const thought = `Thought: ${entry.thought.reasoning}`;
                    const action =
                        entry.action.type === 'tool_call'
                            ? `Action: ${entry.action.tool}\nAction Input: ${JSON.stringify(entry.action.arguments)}`
                            : `Action: Final Answer\nAction Input: ${entry.action.content}`;
                    const observation = `Observation: ${this.formatObservation(entry.result)}`;
                    return `${thought}\n${action}\n${observation}`;
                })
                .join('\n') + (context.history.length > 0 ? '\nThought: ' : '')
        ); // Always end with Thought: for next iteration
    }

    /**
     * ✅ Format observation from action result
     */
    private formatObservation(result: ActionResult): string {
        if (isErrorResult(result)) {
            const errorMsg = getResultError(result);
            return `Error: ${errorMsg}`;
        }

        // Handle ToolResult specifically
        if (isToolResult(result)) {
            const content = result.content;

            // If content is a string, return it directly
            if (typeof content === 'string') {
                return content;
            }

            // If content is an object with complex structure, try to extract meaningful info
            if (content && typeof content === 'object') {
                // Check if it's an error result from MCP
                if (
                    'result' in content &&
                    content.result &&
                    typeof content.result === 'object'
                ) {
                    const mcpResult = content.result as Record<string, unknown>;

                    // Check if it has content array (like MCP error format)
                    if (
                        'content' in mcpResult &&
                        Array.isArray(mcpResult.content)
                    ) {
                        const contentArray = mcpResult.content as Array<
                            Record<string, unknown>
                        >;
                        const textContent = contentArray
                            .filter((item) => item.type === 'text' && item.text)
                            .map((item) => item.text)
                            .join(' ');

                        if (textContent) {
                            return textContent;
                        }
                    }

                    // Check if it has isError flag
                    if ('isError' in mcpResult && mcpResult.isError) {
                        return `Error: ${JSON.stringify(mcpResult)}`;
                    }
                }

                // Try to extract any meaningful string from the object
                const stringified = JSON.stringify(content, null, 2);
                if (
                    stringified &&
                    stringified !== '{}' &&
                    stringified !== '[]'
                ) {
                    return stringified;
                }
            }

            // Fallback: return the content as string
            return String(content || 'No result');
        }

        // Handle FinalAnswerResult
        if (isFinalAnswerResult(result)) {
            return result.content as string;
        }

        // Handle other types
        if (typeof result === 'string') {
            return result;
        }

        if (result && typeof result === 'object') {
            return JSON.stringify(result, null, 2);
        }

        return String(result || 'No result');
    }

    /**
     * ✅ NEW: Convert PlanningResult to AgentThought for ReAct
     */
    private convertPlanToReActThought(
        plan: Record<string, unknown>,
        thread: Thread,
    ): AgentThought {
        const availableTools = this.getAvailableToolsForContext(thread);
        const availableToolNames = availableTools.map((tool) => tool.name);

        // Extract first step from plan
        const steps = plan.steps as Array<Record<string, unknown>> | undefined;
        const firstStep = steps?.[0];

        if (!firstStep) {
            return {
                reasoning:
                    (plan.reasoning as string) || 'No steps found in plan',
                action: {
                    type: 'final_answer',
                    content: 'Unable to determine next action from the plan',
                },
                confidence: 0.3,
            };
        }

        // Validate tool if it's a tool_call
        const toolName = firstStep.tool as string;

        if (toolName && toolName !== 'none') {
            if (!availableToolNames.includes(toolName)) {
                return {
                    reasoning: `Tool "${toolName}" is not available. Available tools: ${availableToolNames.join(', ')}`,
                    action: {
                        type: 'final_answer',
                        content: `I don't have access to the "${toolName}" tool. Available tools are: ${availableToolNames.join(', ')}. How can I help you with the available tools?`,
                    },
                    confidence: 0.8,
                    metadata: {
                        originalPlan: plan,
                        fallbackReason: 'tool_not_available',
                    },
                };
            }

            return {
                reasoning:
                    (plan.reasoning as string) ||
                    (firstStep.description as string) ||
                    'Planned action',
                action: {
                    type: 'tool_call',
                    tool: toolName,
                    arguments:
                        (firstStep.arguments as Record<string, unknown>) || {},
                },
                confidence: 0.8,
                metadata: {
                    fromPlan: true,
                    planStrategy: plan.strategy as string,
                },
            };
        }

        // Default to final answer
        return {
            reasoning:
                (plan.reasoning as string) ||
                (firstStep.description as string) ||
                'Planned response',
            action: {
                type: 'final_answer',
                content:
                    (firstStep.description as string) ||
                    (plan.reasoning as string) ||
                    'Plan completed',
            },
            confidence: 0.7,
            metadata: {
                fromPlan: true,
                planStrategy: plan.strategy as string,
            },
        };
    }

    // private extractPreviousPlans(context: PlannerExecutionContext): unknown[] {
    //     return context.history.map((h) => ({
    //         id: `plan-${Date.now()}`,
    //         strategy: 'react',
    //         goal: h.thought.reasoning,
    //         steps: [
    //             {
    //                 id: 'step_1',
    //                 description: JSON.stringify(h.action),
    //                 type: h.action.type === 'tool_call' ? 'action' : 'decision',
    //             },
    //         ],
    //         reasoning: h.observation.feedback,
    //         complexity: 'medium' as const,
    //     }));
    // }

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
