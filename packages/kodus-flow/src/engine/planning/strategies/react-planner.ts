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
    isToolResult,
    isFinalAnswerResult,
} from '../planner-factory.js';
// ReAct schemas removed - now using PlanningResult from DirectLLMAdapter
// import { AgentContext } from '@/core/types/agent-types.js';
import { Thread } from '../../../core/types/common-types.js';
import { ToolMetadataForLLM } from '@/core/types/tool-types.js';
import type { ToolCallAction } from '../planner-factory.js';

export class ReActPlanner implements Planner {
    private logger = createLogger('react-planner');

    /**
     * Confidence Score Guidelines:
     * 0.0-0.2: Critical failure, errors, or system issues
     * 0.3-0.4: Low confidence - missing tools, unclear goals
     * 0.5-0.6: Medium confidence - can proceed but limitations exist
     * 0.7-0.8: High confidence - normal operation with clear path
     * 0.9-1.0: Very high confidence - perfect match of intent and capability
     */

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

    async think(
        input: string,
        context: PlannerExecutionContext,
    ): Promise<AgentThought> {
        this.logger.info('🔍 ReAct thinking started', {
            input: input.substring(0, 100),
            iteration: context.iterations,
            historyLength: context.history.length,
        });

        try {
            // Try LLM-based ReAct (structured, createPlan, or basic call)
            return await this.thinkWithLLMReAct(input, context);
        } catch (error) {
            this.logger.error('ReAct thinking failed', error as Error);

            // ✅ BETTER: Error message with context
            const lastAction =
                context.history[context.history.length - 1]?.action;
            const errorContext = {
                iteration: context.iterations,
                lastTool:
                    lastAction?.type === 'tool_call'
                        ? (lastAction as ToolCallAction).tool
                        : undefined,
                availableTools: this.getAvailableToolsForContext(
                    context.plannerMetadata.thread!,
                ).map((t) => t.name),
            };

            return {
                reasoning: `Planning failed at iteration ${context.iterations}. ${error instanceof Error ? error.message : 'Unknown error'}`,
                action: {
                    type: 'final_answer',
                    content: `I encountered an issue while planning (iteration ${context.iterations}). Available tools: ${errorContext.availableTools.join(', ')}. Please try rephrasing your request or check if the required tools are available.`,
                },
                confidence: 0.1, // Very low - error scenario
                metadata: { error: true, errorContext },
            };
        }
    }

    private async thinkWithLLMReAct(
        input: string,
        context: PlannerExecutionContext,
    ): Promise<AgentThought> {
        // Cache resources once at the beginning
        const thread = context.plannerMetadata.thread!;
        const availableTools = this.getAvailableToolsForContext(thread);
        const availableToolNames = availableTools.map((tool) => tool.name);

        // ✅ SMART: Handle no tools available - but can still think!
        if (availableTools.length === 0) {
            this.logger.info('No tools available, providing direct reasoning', {
                input: input.substring(0, 100),
                iteration: context.iterations,
            });

            return {
                reasoning:
                    'No external tools available, but I can provide an answer based on reasoning and general knowledge',
                action: {
                    type: 'final_answer',
                    content: `I don't have access to external tools, but I can help answer based on general knowledge and reasoning.

For the question: "${input}"

Let me provide what I can based on available information and logical reasoning.`,
                },
                confidence: 0.5, // Medium - can help but limited without tools
                metadata: {
                    approachType: 'no_tools_reasoning',
                    toolsAvailable: 0,
                },
            };
        }

        const executionRuntime = this.getExecutionRuntime(thread);
        const agentIdentity = executionRuntime?.getAgentIdentity();
        const userContext = executionRuntime?.getUserContext();

        // ✅ GET MEMORY CONTEXT for better reasoning
        const memoryContext = await this.getMemoryContext(
            executionRuntime,
            input,
        );

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
            memoryContext, // ✅ ADD MEMORY CONTEXT
            // ✅ BEST PRACTICE: Analysis happens in think phase
            sequentialInstructions: `
You are a ReAct agent. Follow this intelligent process:

1. ANALYZE the current situation:
   - Review the original question/goal
   - Check what actions have been taken so far
   - Analyze the results from previous actions
   - Determine if the goal has been FULLY achieved

2. DECIDE your approach:
   - If goal is complete → Final Answer with comprehensive response
   - If partial progress → Continue with next logical step
   - If error occurred → Try alternative approach
   - If need more info → Use appropriate tool

3. BE SMART about multi-part goals:
   - "Do X and Y" requires BOTH X and Y to be complete
   - Don't stop at partial completion
   - Track which parts are done vs pending

4. TOOL USAGE:
   - Use tools when you need: external data, search, calculations
   - Answer directly when you have: sufficient knowledge from previous results
   - Don't repeat successful tool calls unnecessarily

Available tools: ${availableToolNames.join(', ')}

CRITICAL: After each tool result, ask yourself:
- Have I achieved ALL parts of the original goal?
- What specific information am I still missing?
- Should I continue with more actions or provide the final answer?`,
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

        // ✅ BETTER: Clearer formatting with types and examples
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
                                  : ' (optional)';
                              const type = propObj.type
                                  ? ` [${propObj.type}]`
                                  : '';
                              const example = propObj.example
                                  ? ` e.g. "${propObj.example}"`
                                  : '';
                              return `  - ${name}${type}: ${description}${required}${example}`;
                          })
                          .join('\n')
                    : '  No parameters';

                return `${tool.name}: ${tool.description || 'No description'}\n${params}`;
            })
            .join('\n\n');
    }

    /**
     * ✅ ENHANCED: Build intelligent agent_scratchpad for ReAct format
     */
    private buildAgentScratchpad(context: PlannerExecutionContext): string {
        // ✅ SMART: Handle first iteration - start clean
        if (context.history.length === 0) {
            return 'Thought:';
        }

        // ✅ ENHANCED: More detailed debug logging
        const lastEntry = context.history[context.history.length - 1];
        this.logger.debug('Building agent scratchpad', {
            historyLength: context.history.length,
            iteration: context.iterations,
            lastActionType: lastEntry?.action.type,
            lastActionSuccess: lastEntry?.result
                ? !isErrorResult(lastEntry.result)
                : undefined,
            hasContaminatedEntries: context.history.some(
                (entry) =>
                    entry.thought.reasoning?.includes('Previous execution:') ||
                    (entry.action.type === 'final_answer' &&
                        String(entry.action.content).includes(
                            'Previous execution completed',
                        )),
            ),
        });

        // ✅ FIXED: Filter out contaminated entries and build clean scratchpad
        const validEntries = context.history.filter((entry) => {
            // Skip entries that look like contaminated previous executions
            const isContaminated =
                entry.thought.reasoning?.includes('Previous execution:') ||
                (entry.action.type === 'final_answer' &&
                    String(entry.action.content).includes(
                        'Previous execution completed',
                    ));

            if (isContaminated) {
                this.logger.warn('Filtering out contaminated history entry', {
                    reasoning: entry.thought.reasoning?.substring(0, 100),
                    actionType: entry.action.type,
                });
            }

            return !isContaminated;
        });

        // ✅ SMART: Handle no valid entries
        if (validEntries.length === 0) {
            this.logger.info('No valid history entries found, starting fresh', {
                totalEntries: context.history.length,
                iteration: context.iterations,
            });
            return 'Previous attempts had issues. Starting fresh approach.\nThought:';
        }

        // ✅ ENHANCED: Build context-aware scratchpad
        const scratchpadEntries = validEntries.map((entry, index) => {
            const thought = `Thought: ${entry.thought.reasoning}`;

            // Better action formatting
            let action: string;
            if (entry.action.type === 'tool_call') {
                const toolAction = entry.action as ToolCallAction;
                action = `Action: ${toolAction.tool}\nAction Input: ${JSON.stringify(toolAction.arguments || {}, null, 2)}`;
            } else {
                action = `Action: Final Answer\nAction Input: ${entry.action.content}`;
            }

            // Enhanced observation formatting
            const observation = `Observation: ${this.formatObservation(entry.result)}`;

            // Add context for failed attempts
            const isLastEntry = index === validEntries.length - 1;
            const hasError = isErrorResult(entry.result);

            let contextNote = '';
            if (isLastEntry && hasError) {
                contextNote =
                    '\n[Note: Previous attempt failed, consider alternative approach]';
            }

            return `${thought}\n${action}\n${observation}${contextNote}`;
        });

        return scratchpadEntries.join('\n') + '\nThought:';
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
     * ✅ ENHANCED: Convert PlanningResult to AgentThought for ReAct with smart validation
     */
    private convertPlanToReActThought(
        plan: Record<string, unknown>,
        thread: Thread,
    ): AgentThought {
        const availableTools = this.getAvailableToolsForContext(thread);
        const availableToolNames = availableTools.map((tool) => tool.name);

        // Extract steps from plan
        const steps = plan.steps as Array<Record<string, unknown>> | undefined;
        const reasoning = plan.reasoning as string;

        // ✅ SMART: Handle direct answers (no tools needed)
        if (!steps || steps.length === 0) {
            // Check if this is a direct answer scenario
            if (
                reasoning &&
                (reasoning.toLowerCase().includes('direct answer') ||
                    reasoning.toLowerCase().includes('no tools needed') ||
                    reasoning.toLowerCase().includes('can answer directly') ||
                    plan.directAnswer)
            ) {
                return {
                    reasoning:
                        reasoning ||
                        'Providing direct answer based on available knowledge',
                    action: {
                        type: 'final_answer',
                        content:
                            (plan.answer as string) ||
                            (plan.directAnswer as string) ||
                            reasoning,
                    },
                    confidence: 0.9, // Very high - direct answer with full context
                    metadata: {
                        fromPlan: true,
                        planStrategy: plan.strategy as string,
                        approachType: 'direct_answer',
                    },
                };
            }

            // Fallback for unclear plans without steps
            return {
                reasoning: reasoning || 'No clear action steps found in plan',
                action: {
                    type: 'final_answer',
                    content:
                        reasoning ||
                        'Unable to determine next action from the plan',
                },
                confidence: 0.3,
                metadata: {
                    fromPlan: true,
                    fallbackReason: 'no_steps_found',
                },
            };
        }

        // Extract first step from plan
        const firstStep = steps[0];

        // Validate tool if it's a tool_call
        const toolName = firstStep?.tool as string;

        if (toolName && toolName !== 'none') {
            if (!availableToolNames.includes(toolName)) {
                return {
                    reasoning: `Tool "${toolName}" is not available. Available tools: ${availableToolNames.join(', ')}`,
                    action: {
                        type: 'final_answer',
                        content: `I don't have access to the "${toolName}" tool. Available tools are: ${availableToolNames.join(', ')}. How can I help you with the available tools?`,
                    },
                    confidence: 0.3, // Low - requested tool not available
                    metadata: {
                        originalPlan: plan,
                        fallbackReason: 'tool_not_available',
                    },
                };
            }

            return {
                reasoning:
                    (plan.reasoning as string) ||
                    (firstStep?.description as string) ||
                    'Planned action',
                action: {
                    type: 'tool_call',
                    tool: toolName,
                    arguments:
                        (firstStep?.arguments as Record<string, unknown>) || {},
                },
                confidence: 0.85, // High - found matching tool with clear plan
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
                (firstStep?.description as string) ||
                'Planned response',
            action: {
                type: 'final_answer',
                content:
                    (firstStep?.description as string) ||
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
        debugger;
        this.logger.debug('Analyzing action result', {
            resultType: result.type,
            hasError: isErrorResult(result),
            iteration: context.iterations,
        });

        // ✅ BEST PRACTICE: Deterministic observation (no LLM)
        // Based on LangChain, AutoGPT, and ReAct paper patterns

        // 1. Final answer = always complete
        if (result.type === 'final_answer') {
            return {
                isComplete: true,
                isSuccessful: true,
                feedback: 'Task completed with final answer',
                shouldContinue: false,
            };
        }

        // 2. Error = continue but note the error
        if (isErrorResult(result)) {
            const errorMsg = getResultError(result);
            return {
                isComplete: false,
                isSuccessful: false,
                feedback: `Error: ${errorMsg}`,
                shouldContinue: true,
                // Let the next think cycle decide how to handle the error
                suggestedNextAction: undefined,
            };
        }

        // 3. Tool result = always continue
        // The next think cycle will analyze if we're done
        return {
            isComplete: false,
            isSuccessful: true,
            feedback: 'Tool executed successfully',
            shouldContinue: true,
            // No suggestion - let think decide based on full context
            suggestedNextAction: undefined,
        };

        // ✅ RATIONALE:
        // - Follows ReAct paper: Observation is just the raw result
        // - Matches LangChain: No LLM in observation phase
        // - Efficient: One LLM call per cycle (in think)
        // - Clear: The planner's think phase handles ALL reasoning
    }

    /**
     * ✅ Get relevant memory context for better ReAct reasoning
     */
    private async getMemoryContext(
        executionRuntime: ExecutionRuntime | null,
        _currentInput: string,
    ): Promise<string> {
        if (!executionRuntime) {
            return '';
        }

        try {
            // For now, we'll use the existing context system
            // Future: Integrate with proper memory and conversation history

            // Get available context via the get method
            const contextParts: string[] = [];

            // Try to get session context (if available)
            try {
                const sessionData = await executionRuntime.get({
                    path: 'session.recent',
                });
                if (sessionData && typeof sessionData === 'object') {
                    contextParts.push('Session context available');
                }
            } catch {
                // Session context not available - that's ok
            }

            // Try to get memory context (if available)
            try {
                const memoryData = await executionRuntime.get({
                    path: 'memory.relevant',
                });
                if (memoryData && typeof memoryData === 'object') {
                    contextParts.push('Memory context available');
                }
            } catch {
                // Memory context not available - that's ok
            }

            // For now, return placeholder that indicates memory integration is ready
            return contextParts.length > 0
                ? `Previous context: ${contextParts.join(', ')}`
                : '';
        } catch (error) {
            this.logger.warn('Failed to get memory context', {
                error: (error as Error).message,
            });
            return '';
        }
    }
}
