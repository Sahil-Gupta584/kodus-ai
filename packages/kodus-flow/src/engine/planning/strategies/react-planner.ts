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
    createToolCallAction,
} from '../planner-factory.js';
// ReAct schemas removed - now using PlanningResult from DirectLLMAdapter
// import { AgentContext } from '@/core/types/agent-types.js';
import { Thread } from '../../../core/types/common-types.js';
import { ToolMetadataForLLM } from '@/core/types/tool-types.js';
import type { ToolCallAction } from '../planner-factory.js';
// import {
//     createParameterExtractor,
//     type ExtractionContext,
//     type ParameterExtractionResult,
// } from '../../../core/utils/parameter-extraction.js';

export class ReActPlanner implements Planner {
    private logger = createLogger('react-planner');
    // private parameterExtractor = createParameterExtractor();

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

    async think(context: PlannerExecutionContext): Promise<AgentThought> {
        try {
            // Try LLM-based ReAct (structured, createPlan, or basic call)
            return await this.thinkWithLLMReAct(context);
        } catch (error) {
            this.logger.error('ReAct thinking failed', error as Error);

            // ✅ BETTER: Error message with context
            const lastAction =
                context.history[context.history.length - 1]?.action;
            const errorContext = {
                iteration: context.iterations,
                lastTool:
                    lastAction?.type === 'tool_call'
                        ? (lastAction as ToolCallAction).toolName
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
        context: PlannerExecutionContext,
    ): Promise<AgentThought> {
        // Cache resources once at the beginning
        const thread = context.plannerMetadata.thread!;
        const availableTools = this.getAvailableToolsForContext(thread);

        const input = context.input;

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

        // 🐛 DEBUG LOG: Tools available and context
        this.logger.info('🔍 [DEBUG] ReAct Tools Available', {
            toolCount: availableTools.length,
            toolNames: availableTools.map((t) => t.name),
            hasBatchTools: availableTools.some(
                (t) =>
                    t.name.includes('get_kody_rules') ||
                    t.name.includes('all') ||
                    t.name.includes('bulk') ||
                    t.name.includes('list'),
            ),
            toolsContextLength: toolsContext.length,
        });

        // ✅ Build proper agent_scratchpad for ReAct format
        const agentScratchpad = this.buildAgentScratchpad(context);

        const identityContext = agentIdentity
            ? `\nYour identity:
- Role: ${agentIdentity?.role || 'AI Assistant'}
- Goal: ${agentIdentity?.goal || 'Help the user'}
- Expertise: ${agentIdentity?.expertise?.join(', ') || 'General knowledge'}`
            : '';

        // ✅ Use createPlan with enhanced context engineering
        if (!this.llmAdapter.createPlan) {
            throw new Error(
                'LLM adapter must support createPlan for ReAct planner',
            );
        }

        // 🐛 DEBUG LOG: Prompt being sent to LLM
        this.logger.info('🔍 [DEBUG] ReAct Sending Plan to LLM', {
            input: input.substring(0, 200),
            availableToolsCount: availableTools.length,
            hasToolsContext: !!toolsContext,
            hasScratchpad: !!agentScratchpad,
            scratchpadLength: agentScratchpad.length,
            promptIncludes: {
                batchInstructions: true,
                efficiencyCheck: true,
                toolValidation: true,
            },
        });

        const plan = await this.llmAdapter.createPlan(input, 'react', {
            availableTools: availableTools,
            // ✅ Enhanced context engineering for ReAct
            toolsContext,
            agentScratchpad,
            identityContext,
            userContext,
            memoryContext, // ✅ ADD MEMORY CONTEXT
            // ✅ ENHANCED: Added parallel execution and efficiency guidance
            sequentialInstructions: this.getSequentialInstructions(),
            systemPrompt: this.getSystemPrompt(identityContext),
            userPromptTemplate: this.getUserPromptTemplate(
                input,
                toolsContext,
                memoryContext || '',
                typeof userContext === 'string'
                    ? userContext
                    : JSON.stringify(userContext || {}),
                this.getSequentialInstructions(),
                agentScratchpad,
            ),
            // Legacy sequential instructions (will be replaced by prompts above)
            legacySequentialInstructions: `
You are an intelligent ReAct agent. Follow this strategic process:

1. ANALYZE the current situation:
   - Review the original question/goal
   - Check what actions have been taken so far
   - Analyze the results from previous actions
   - Determine if the goal has been FULLY achieved

2. 🚨 CRITICAL EFFICIENCY CHECK - BEFORE ANY ACTION:
   Ask yourself:
   - Am I about to iterate through multiple items individually?
   - Is there a tool that can get ALL the data I need in ONE call?
   - Can I achieve the same result with fewer, broader operations?

   EFFICIENCY PATTERNS TO RECOGNIZE:
   - Tools with "all", "list", "bulk", "batch" in the name often handle multiple items
   - Tools with "summary", "overview", "aggregate" provide comprehensive data
   - Tools that mention "multiple", "collection", or "set" in their description
   - If you need data about N items, look for a tool that returns N items at once

3. TOOL SELECTION STRATEGY:
   Evaluate tools in this order:
   a) Comprehensive tools that return complete datasets
   b) Aggregate or summary tools that provide overview information
   c) Batch operations that can process multiple items
   d) Individual item tools ONLY when you need ONE specific thing

4. ITERATION PREVENTION:
   - If you find yourself thinking "for each item", "loop through", or "one by one" - STOP
   - Re-examine available tools for batch alternatives
   - Check tool descriptions for keywords indicating bulk capabilities
   - Consider if the data you need can be obtained in a single comprehensive query

5. SMART EXECUTION:
   - Read tool descriptions carefully - they often indicate bulk capabilities
   - When a tool returns a collection, process it entirely before making another call
   - Avoid making similar calls with different parameters - find the unified approach
   - If a tool can accept multiple IDs or filters, use that instead of individual calls

6. GOAL COMPLETION:
   - Ensure ALL parts of multi-part goals are addressed
   - Don't stop at partial completion
   - Verify that the entire original request has been fulfilled

7. EFFICIENCY PRINCIPLES:
   - ONE comprehensive call is better than N individual calls
   - Broader queries that might return extra data are often more efficient
   - Tools that aggregate or summarize can eliminate the need for detail queries
   - Always optimize for fewer total operations

FINAL VALIDATION before each action:
"Is this the most efficient way to get the information I need, or am I about to make multiple calls when one would suffice?"`,
        });

        // 🐛 DEBUG LOG: LLM Response received
        this.logger.info('🔍 [DEBUG] ReAct LLM Plan Response', {
            planReceived: !!plan,
            planKeys: plan ? Object.keys(plan as Record<string, unknown>) : [],
            reasoning: (plan as Record<string, unknown>)?.reasoning,
            steps: (plan as Record<string, unknown>)?.steps,
            firstStepTool: Array.isArray(
                (plan as Record<string, unknown>)?.steps,
            )
                ? (
                      (plan as Record<string, unknown>)?.steps as Array<
                          Record<string, unknown>
                      >
                  )[0]?.toolName
                : 'no-steps',
        });

        return await this.convertPlanToReActThoughtWithExtraction(
            plan as Record<string, unknown>,
            thread,
            input,
            context,
        );
    }

    /**
     * ✅ Build enhanced tools context for ReAct format with efficiency hints
     */
    private buildToolsContextForReAct(tools: ToolMetadataForLLM[]): string {
        if (tools.length === 0) return 'No tools available.';

        // ✅ ENHANCED: Add efficiency analysis and grouping
        const toolAnalysis = this.analyzeToolEfficiencyPatterns(tools);

        // ✅ BETTER: Clearer formatting with types, examples, and efficiency hints
        const toolDescriptions = tools
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

                // Add efficiency hints for this tool
                const efficiencyHint = toolAnalysis.hints[tool.name] || '';
                const hintSection = efficiencyHint
                    ? `\n  ⚡ Efficiency: ${efficiencyHint}`
                    : '';

                return `${tool.name}: ${tool.description || 'No description'}\n${params}${hintSection}`;
            })
            .join('\n\n');

        // Add general efficiency guidance
        const efficiencySection =
            toolAnalysis.patterns.length > 0
                ? `\n\n⚡ EFFICIENCY PATTERNS DETECTED:\n${toolAnalysis.patterns.join('\n')}`
                : '';

        return toolDescriptions + efficiencySection;
    }

    /**
     * ✅ NEW: Analyze tools for efficiency patterns and alternatives
     */
    private analyzeToolEfficiencyPatterns(tools: ToolMetadataForLLM[]): {
        patterns: string[];
        hints: Record<string, string>;
    } {
        const patterns: string[] = [];
        const hints: Record<string, string> = {};
        const toolNames = tools.map((t) => t.name);

        // Pattern 1: Detect bulk vs individual operations
        const bulkPatterns = [
            {
                individual: /get_.*_repository$/i,
                bulk: /get_.*_rules$/i,
                context: 'repository rules',
            },
            {
                individual: /get_.*_info$/i,
                bulk: /get_all_.*$/i,
                context: 'information gathering',
            },
            {
                individual: /search_.*_item$/i,
                bulk: /search_.*$/i,
                context: 'search operations',
            },
            {
                individual: /list_.*_item$/i,
                bulk: /list_.*$/i,
                context: 'listing operations',
            },
        ];

        for (const pattern of bulkPatterns) {
            const individualTools = toolNames.filter((name) =>
                pattern.individual.test(name),
            );
            const bulkTools = toolNames.filter((name) =>
                pattern.bulk.test(name),
            );

            if (individualTools.length > 0 && bulkTools.length > 0) {
                patterns.push(
                    `- For ${pattern.context}: Prefer ${bulkTools.join(', ')} over multiple calls to ${individualTools.join(', ')}`,
                );

                // Add hints to individual tools
                individualTools.forEach((tool) => {
                    hints[tool] =
                        `Consider using ${bulkTools.join(' or ')} instead of multiple calls to this tool`;
                });

                // Add hints to bulk tools
                bulkTools.forEach((tool) => {
                    hints[tool] =
                        `Efficient choice - gets comprehensive data in one call`;
                });
            }
        }

        // Pattern 2: Detect search vs specific lookup
        const hasSearch = toolNames.some((name) => /search/i.test(name));
        const hasSpecificLookup = toolNames.some((name) =>
            /get_.*_by_id|find_.*_by/i.test(name),
        );

        if (hasSearch && hasSpecificLookup) {
            patterns.push(
                '- Use specific lookup tools when you know exact identifiers, search tools for discovery',
            );
        }

        // Pattern 3: Detect aggregate vs detailed operations
        const aggregateTools = toolNames.filter((name) =>
            /summary|aggregate|overview|stats/i.test(name),
        );
        const detailedTools = toolNames.filter((name) =>
            /details?|full|complete/i.test(name),
        );

        if (aggregateTools.length > 0 && detailedTools.length > 0) {
            patterns.push(
                '- Use aggregate/summary tools first, then detailed tools only if needed',
            );

            aggregateTools.forEach((tool) => {
                hints[tool] =
                    'Efficient for overview - use before detailed operations';
            });
        }

        return { patterns, hints };
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
                action = `Action: ${toolAction.toolName}\nAction Input: ${JSON.stringify(toolAction.input || {}, null, 2)}`;
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
     * ✅ ENHANCED: Convert PlanningResult to AgentThought with Parameter Extraction
     */
    private async convertPlanToReActThoughtWithExtraction(
        plan: Record<string, unknown>,
        thread: Thread,
        _input: string,
        _context: PlannerExecutionContext,
    ): Promise<AgentThought> {
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
        const toolName = firstStep?.toolName as string;

        // 🐛 DEBUG LOG: Tool selection in convertPlanToReActThought
        this.logger.info(
            '🔍 [DEBUG] ReAct Tool Selection with Parameter Extraction',
            {
                hasSteps: !!steps && steps.length > 0,
                firstStepTool: toolName,
                toolNameNone: toolName === 'none',
                availableToolNames,
                toolValidation: {
                    toolRequested: toolName,
                    isToolAvailable: toolName
                        ? availableToolNames.includes(toolName)
                        : false,
                    availableCount: availableToolNames.length,
                },
                firstStepArguments: firstStep?.arguments,
            },
        );

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

            // 🧠 USE PARAMETER EXTRACTION for enhanced tool arguments
            // const enhancedArguments =
            //     await this.validateAndFixToolArgumentsWithExtraction(
            //         toolName,
            //         (firstStep?.arguments as Record<string, unknown>) || {},
            //         availableTools,
            //         input,
            //         context,
            //     );

            return {
                reasoning:
                    (plan.reasoning as string) ||
                    (firstStep?.description as string) ||
                    'Planned action with auto-extracted parameters',
                action: createToolCallAction(
                    toolName,
                    //enhancedArguments,
                    (firstStep?.description as string) ||
                        'Planned action with enhanced parameters',
                ),
                confidence: 0.9, // Very high - enhanced with parameter extraction
                metadata: {
                    fromPlan: true,
                    planStrategy: plan.strategy as string,
                    parameterExtractionUsed: true,
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

    /**
     * ✅ LEGACY: Convert PlanningResult to AgentThought for ReAct with smart validation
     */
    // private _convertPlanToReActThought(
    //     plan: Record<string, unknown>,
    //     thread: Thread,
    // ): AgentThought {
    //     debugger;

    //     const availableTools = this.getAvailableToolsForContext(thread);
    //     const availableToolNames = availableTools.map((tool) => tool.name);

    //     // Extract steps from plan
    //     const steps = plan.steps as Array<Record<string, unknown>> | undefined;
    //     const reasoning = plan.reasoning as string;

    //     // ✅ SMART: Handle direct answers (no tools needed)
    //     if (!steps || steps.length === 0) {
    //         // Check if this is a direct answer scenario
    //         if (
    //             reasoning &&
    //             (reasoning.toLowerCase().includes('direct answer') ||
    //                 reasoning.toLowerCase().includes('no tools needed') ||
    //                 reasoning.toLowerCase().includes('can answer directly') ||
    //                 plan.directAnswer)
    //         ) {
    //             return {
    //                 reasoning:
    //                     reasoning ||
    //                     'Providing direct answer based on available knowledge',
    //                 action: {
    //                     type: 'final_answer',
    //                     content:
    //                         (plan.answer as string) ||
    //                         (plan.directAnswer as string) ||
    //                         reasoning,
    //                 },
    //                 confidence: 0.9, // Very high - direct answer with full context
    //                 metadata: {
    //                     fromPlan: true,
    //                     planStrategy: plan.strategy as string,
    //                     approachType: 'direct_answer',
    //                 },
    //             };
    //         }

    //         // Fallback for unclear plans without steps
    //         return {
    //             reasoning: reasoning || 'No clear action steps found in plan',
    //             action: {
    //                 type: 'final_answer',
    //                 content:
    //                     reasoning ||
    //                     'Unable to determine next action from the plan',
    //             },
    //             confidence: 0.3,
    //             metadata: {
    //                 fromPlan: true,
    //                 fallbackReason: 'no_steps_found',
    //             },
    //         };
    //     }

    //     // Extract first step from plan
    //     const firstStep = steps[0];

    //     // Validate tool if it's a tool_call
    //     const toolName = firstStep?.toolName as string;

    //     // 🐛 DEBUG LOG: Tool selection in convertPlanToReActThought
    //     this.logger.info('🔍 [DEBUG] ReAct Tool Selection', {
    //         hasSteps: !!steps && steps.length > 0,
    //         firstStepTool: toolName,
    //         toolNameNone: toolName === 'none',
    //         availableToolNames,
    //         toolValidation: {
    //             toolRequested: toolName,
    //             isToolAvailable: toolName
    //                 ? availableToolNames.includes(toolName)
    //                 : false,
    //             availableCount: availableToolNames.length,
    //         },
    //         firstStepArguments: firstStep?.arguments,
    //     });

    //     if (toolName && toolName !== 'none') {
    //         if (!availableToolNames.includes(toolName)) {
    //             return {
    //                 reasoning: `Tool "${toolName}" is not available. Available tools: ${availableToolNames.join(', ')}`,
    //                 action: {
    //                     type: 'final_answer',
    //                     content: `I don't have access to the "${toolName}" tool. Available tools are: ${availableToolNames.join(', ')}. How can I help you with the available tools?`,
    //                 },
    //                 confidence: 0.3, // Low - requested tool not available
    //                 metadata: {
    //                     originalPlan: plan,
    //                     fallbackReason: 'tool_not_available',
    //                 },
    //             };
    //         }

    //         return {
    //             reasoning:
    //                 (plan.reasoning as string) ||
    //                 (firstStep?.description as string) ||
    //                 'Planned action',
    //             action: createToolCallAction(
    //                 toolName,
    //                 this.validateAndFixToolArguments(
    //                     toolName,
    //                     (firstStep?.arguments as Record<string, unknown>) || {},
    //                     availableTools,
    //                 ),
    //                 (firstStep?.description as string) || 'Planned action',
    //             ),
    //             confidence: 0.85, // High - found matching tool with clear plan
    //             metadata: {
    //                 fromPlan: true,
    //                 planStrategy: plan.strategy as string,
    //             },
    //         };
    //     }

    //     // Default to final answer
    //     return {
    //         reasoning:
    //             (plan.reasoning as string) ||
    //             (firstStep?.description as string) ||
    //             'Planned response',
    //         action: {
    //             type: 'final_answer',
    //             content:
    //                 (firstStep?.description as string) ||
    //                 (plan.reasoning as string) ||
    //                 'Plan completed',
    //         },
    //         confidence: 0.7,
    //         metadata: {
    //             fromPlan: true,
    //             planStrategy: plan.strategy as string,
    //         },
    //     };
    // }

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
     * ✅ ENHANCED: Validate and fix tool arguments using Parameter Extractor
     */
    // private async validateAndFixToolArgumentsWithExtraction(
    //     toolName: string,
    //     providedArgs: Record<string, unknown>,
    //     availableTools: ToolMetadataForLLM[],
    //     input: string,
    //     context: PlannerExecutionContext,
    // ): Promise<Record<string, unknown>> {
    //     const tool = availableTools.find((t) => t.name === toolName);
    //     if (!tool) {
    //         this.logger.warn('Tool not found for argument validation', {
    //             toolName,
    //         });
    //         return providedArgs;
    //     }

    //     // 🧠 AUTO-EXTRACT parameters if needed
    //     // const extraction = await this.autoExtractParameters(
    //     //     input,
    //     //     tool,
    //     //     context,
    //     // );

    //     // Merge extracted parameters with provided ones (provided takes precedence)
    //     const enhancedArgs = {
    //         ...extraction.parameters,
    //         ...providedArgs,
    //     };

    //     this.logger.info(
    //         '🔧 Enhanced tool arguments with parameter extraction',
    //         {
    //             toolName,
    //             originalArgs: Object.keys(providedArgs),
    //             extractedArgs: Object.keys(extraction.parameters),
    //             finalArgs: Object.keys(enhancedArgs),
    //             extractionConfidence: extraction.confidence,
    //         },
    //     );

    //     // Continue with normal validation
    //     return this.validateAndFixToolArguments(
    //         toolName,
    //         enhancedArgs,
    //         availableTools,
    //     );
    // }

    /**
     * ✅ Validate and fix tool arguments to prevent validation errors (legacy method)
     */
    // private validateAndFixToolArguments(
    //     toolName: string,
    //     providedArgs: Record<string, unknown>,
    //     availableTools: ToolMetadataForLLM[],
    // ): Record<string, unknown> {
    //     // 🐛 DEBUG LOG: Tool arguments validation
    //     const tool = availableTools.find((t) => t.name === toolName);
    //     this.logger.info('🔧 [DEBUG] ReAct Tool Arguments Validation', {
    //         toolName,
    //         toolFound: !!tool,
    //         providedArgs,
    //         requiredFields: tool?.parameters?.required || [],
    //         hasRequiredFields: !!(tool?.parameters?.required as string[])
    //             ?.length,
    //     });

    //     if (!tool?.parameters?.required) {
    //         return providedArgs;
    //     }

    //     const fixedArgs = { ...providedArgs };
    //     const requiredFields = tool.parameters.required as string[];

    //     // Add missing required fields with sensible defaults
    //     for (const field of requiredFields) {
    //         if (!(field in fixedArgs) || fixedArgs[field] === undefined) {
    //             const properties = tool.parameters.properties as
    //                 | Record<string, unknown>
    //                 | undefined;
    //             const fieldInfo = properties?.[field] as
    //                 | Record<string, unknown>
    //                 | undefined;

    //             // Try to provide sensible defaults based on field name and type
    //             if (fieldInfo?.default !== undefined) {
    //                 fixedArgs[field] = fieldInfo.default;
    //             } else if (fieldInfo?.type === 'string') {
    //                 // Common field name patterns
    //                 if (field.includes('context') || field.includes('query')) {
    //                     fixedArgs[field] = 'all'; // Get all data
    //                 } else if (field.includes('format')) {
    //                     fixedArgs[field] = 'json';
    //                 } else if (
    //                     field.includes('scope') ||
    //                     field.includes('category')
    //                 ) {
    //                     fixedArgs[field] = 'all';
    //                 } else {
    //                     fixedArgs[field] = '';
    //                 }
    //             } else if (fieldInfo?.type === 'boolean') {
    //                 fixedArgs[field] = true;
    //             } else if (fieldInfo?.type === 'number') {
    //                 fixedArgs[field] = 0;
    //             } else {
    //                 // Generic fallback
    //                 fixedArgs[field] = null;
    //             }

    //             this.logger.warn('Added missing required field for tool', {
    //                 toolName,
    //                 field,
    //                 value: fixedArgs[field],
    //                 fieldType: fieldInfo?.type,
    //             });
    //         }
    //     }

    //     // 🐛 DEBUG LOG: Final arguments after validation
    //     this.logger.info('🔧 [DEBUG] ReAct Final Tool Arguments', {
    //         toolName,
    //         originalArgs: providedArgs,
    //         finalArgs: fixedArgs,
    //         argsModified:
    //             JSON.stringify(providedArgs) !== JSON.stringify(fixedArgs),
    //     });

    //     return fixedArgs;
    // }

    /**
     * ✅ NEW: Create extraction context from planner execution context
     */
    // private createExtractionContext(
    //     context: PlannerExecutionContext,
    // ): ExtractionContext {
    //     return {
    //         conversationHistory: context.history.map((h) => ({
    //             input: context.input,
    //             action: h.action,
    //             result: h.result,
    //         })),
    //         previousParameters:
    //             context.history.length > 0
    //                 ? this.extractPreviousParameters(
    //                       context.history[context.history.length - 1]?.action,
    //                   )
    //                 : undefined,
    //         sessionMetadata: {
    //             iteration: context.iterations,
    //             historyLength: context.history.length,
    //         },
    //     };
    // }

    /**
     * ✅ NEW: Extract parameters from previous action for context
     */
    // private extractPreviousParameters(
    //     action: unknown,
    // ): Record<string, unknown> | undefined {
    //     if (typeof action === 'object' && action !== null && 'type' in action) {
    //         const typedAction = action as {
    //             type: string;
    //             [key: string]: unknown;
    //         };
    //         if (typedAction.type === 'tool_call' && 'input' in typedAction) {
    //             return (typedAction.input as Record<string, unknown>) || {};
    //         }
    //     }
    //     return undefined;
    // }

    /**
     * ✅ NEW: Auto-extract parameters for a tool using Parameter Extractor
     */
    // private async autoExtractParameters(
    //     input: string,
    //     toolMetadata: ToolMetadataForLLM,
    //     context: PlannerExecutionContext,
    // ): Promise<ParameterExtractionResult> {
    //     const extractionContext = this.createExtractionContext(context);

    //     try {
    //         const result = await this.parameterExtractor.extractParameters(
    //             input,
    //             toolMetadata,
    //             extractionContext,
    //         );

    //         this.logger.info('🧠 Parameter extraction completed', {
    //             toolName: toolMetadata.name,
    //             parametersExtracted: Object.keys(result.parameters).length,
    //             confidence: result.confidence,
    //             warnings: result.warnings.length,
    //             sources: result.extractedParams.map(
    //                 (p: { source: string }) => p.source,
    //             ),
    //         });

    //         return result;
    //     } catch (error) {
    //         this.logger.warn('Parameter extraction failed, using fallback', {
    //             toolName: toolMetadata.name,
    //             error: (error as Error).message,
    //         });

    //         // Fallback to empty result
    //         return {
    //             parameters: {},
    //             extractedParams: [],
    //             confidence: 0.1,
    //             warnings: ['Parameter extraction failed'],
    //             metadata: {
    //                 inputAnalysis: 'fallback',
    //                 patternsDetected: [],
    //                 contextUsed: false,
    //                 defaultsApplied: [],
    //             },
    //         };
    //     }
    // }

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

    /**
     * Get system prompt for ReAct planner
     */
    private getSystemPrompt(identityContext: string): string {
        return `You are an expert AI assistant that uses ReAct (Reasoning + Acting) methodology to solve problems step by step.${identityContext}

Your approach:
1. UNDERSTAND: Analyze what is being asked carefully
2. ASSESS: Determine if you need tools or can answer directly
3. PLAN: Think step by step about what you need to do
4. EXECUTE: Use tools when you need external information or actions
5. REASON: Provide clear reasoning for your decisions
6. DELIVER: Give accurate, helpful answers

Remember: Always think before you act, and explain your reasoning clearly.`;
    }

    /**
     * Get user prompt template for ReAct planner
     */
    private getUserPromptTemplate(
        input: string,
        toolsContext: string,
        memoryContext: string,
        userContext: string,
        sequentialInstructions: string,
        agentScratchpad: string,
    ): string {
        return `You solve problems using the ReAct method: Reason → Act → Observe → Answer.

RESOURCES:
Available tools (use ONLY these):
${toolsContext}

${memoryContext}

${userContext}

CONSTRAINTS:
- Use only the listed tools, never make up tools
- JSON outputs must be valid and parseable
- If you lack information, ask the user for clarification
- Maximum iterations to prevent loops

${sequentialInstructions}

REQUIRED FORMAT:

Question: the input question you must answer
Thought: you should always think about what to do
Action: the action to take, only one name of the available tools above, just the name, exactly as it's written
Action Input: the input to the action, just a simple JSON object, enclosed in curly braces, using " to wrap keys and values
Observation: the result of the action
... (this Thought/Action/Action Input/Observation can repeat N times)
Thought: I now know the final answer
Final Answer: the final answer to the original input question

Begin!

Question: ${input}
${agentScratchpad}`;
    }

    /**
     * Get sequential instructions for ReAct
     */
    private getSequentialInstructions(): string {
        return `
You are an intelligent ReAct agent. Follow this strategic process:

1. ANALYZE the current situation:
   - Review the original question/goal
   - Check what actions have been taken so far
   - Analyze the results from previous actions
   - Determine if the goal has been FULLY achieved

2. 🚨 CRITICAL EFFICIENCY CHECK - BEFORE ANY ACTION:
   Ask yourself:
   - Am I about to iterate through multiple items individually?
   - Is there a tool that can get ALL the data I need in ONE call?
   - Can I achieve the same result with fewer, broader operations?

   EFFICIENCY PATTERNS TO RECOGNIZE:
   - Tools with "all", "list", "bulk", "batch" in the name often handle multiple items
   - Tools with "summary", "overview", "aggregate" provide comprehensive data
   - Tools that mention "multiple", "collection", or "set" in their description
   - If you need data about N items, look for a tool that returns N items at once

3. TOOL SELECTION STRATEGY:
   Evaluate tools in this order:
   a) Comprehensive tools that return complete datasets
   b) Aggregate or summary tools that provide overview information
   c) Batch operations that can process multiple items
   d) Individual item tools ONLY when you need ONE specific thing

4. ITERATION PREVENTION:
   - If you find yourself thinking "for each item", "loop through", or "one by one" - STOP
   - Re-examine available tools for batch alternatives

5. IMPLEMENTATION STRATEGY:
   - Broader queries that might return extra data are often more efficient
   - Tools that aggregate or summarize can eliminate the need for detail queries
   - Always optimize for fewer total operations

FINAL VALIDATION before each action:
"Is this the most efficient way to get the information I need, or am I about to make multiple calls when one would suffice?"`;
    }
}
