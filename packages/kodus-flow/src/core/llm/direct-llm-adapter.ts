/**
 * @module core/llm/direct-llm-adapter
 * @description Direct LLM Adapter - Aceita instâncias LangChain diretamente sem conversão
 *
 * FILOSOFIA:
 * ✅ Interface simples que aceita LangChain diretamente
 * ✅ Zero overhead de conversão
 * ✅ Máxima performance
 * ✅ Compatibilidade nativa com LangChain
 * ✅ Mantém todas as técnicas de planning/routing
 */

import { createLogger } from '../../observability/index.js';
import { EngineError } from '../errors.js';

// ──────────────────────────────────────────────────────────────────────────────
// 🎯 GLOBAL LLM SETTINGS - Best Practices
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Standardized LLM settings based on best practices from OpenAI, Anthropic, and Google
 */
export const DEFAULT_LLM_SETTINGS = {
    // Temperature: Lower = more focused/deterministic, Higher = more creative
    temperature: 0.1, // Very focused for agent tasks (0.0-0.2 recommended for tools)

    // Max tokens: Sufficient for reasoning + action without waste
    maxTokens: 2500, // Increased for complex tool metadata and enhanced ReAct prompts

    // Universal stop tokens to prevent hallucination and maintain control
    stop: [
        // ReAct pattern stops
        'Observation:',
        '\nObservation',

        // Conversation boundaries
        'Human:',
        'User:',
        'Assistant:',
        '\nHuman:',
        '\nUser:',

        // Additional safety stops
        'System:',
        '\nSystem:',
        '<|endoftext|>',
        '<|im_end|>',
    ],
} as const;

/**
 * Temperature presets for different use cases
 */
export const TEMPERATURE_PRESETS = {
    DETERMINISTIC: 0.0, // Math, code generation, precise tasks
    FOCUSED: 0.1, // Agent planning, tool selection (DEFAULT)
    BALANCED: 0.3, // General Q&A with some variety
    CREATIVE: 0.7, // Creative writing, brainstorming
    EXPLORATORY: 0.9, // Maximum creativity, idea generation
} as const;

/**
 * Token limit presets
 */
export const TOKEN_PRESETS = {
    QUICK: 500, // Quick responses, tool calls
    STANDARD: 2500, // Standard agent reasoning (INCREASED for enhanced metadata)
    EXTENDED: 3500, // Complex multi-step reasoning
    MAXIMUM: 4500, // Maximum context (use sparingly)
    // ReAct-specific presets
    REACT_SIMPLE: 2000, // Simple ReAct with few tools
    REACT_COMPLEX: 3000, // Complex ReAct with many tools and rich metadata
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// 📋 LANGCHAIN NATIVE TYPES
// ──────────────────────────────────────────────────────────────────────────────

export interface LangChainMessage {
    role: string;
    content: string;
    name?: string;
    toolCallId?: string;
    toolCalls?: Array<{
        id: string;
        type: string;
        function: {
            name: string;
            arguments: string;
        };
    }>;
}

export interface LangChainOptions {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stop?: readonly string[] | string[];
    stream?: boolean;
    tools?: unknown[];
    toolChoice?: string;
}

export interface LangChainResponse {
    content: string;
    toolCalls?: Array<{
        id: string;
        type: string;
        function: {
            name: string;
            arguments: string;
        };
    }>;
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
    };
    additionalKwargs?: Record<string, unknown>;
}

export interface LangChainLLM {
    call(
        messages: LangChainMessage[],
        options?: LangChainOptions,
    ): Promise<LangChainResponse | string>;
    stream?(
        messages: LangChainMessage[],
        options?: LangChainOptions,
    ): AsyncGenerator<LangChainResponse | string>;
    name?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧠 PLANNING & ROUTING TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanningTechnique {
    name: string;
    description: string;
    responseParser: (response: string) => PlanningResult;
    options?: LangChainOptions;
}

export interface RoutingTechnique {
    name: string;
    description: string;
    systemPrompt: string;
    userPromptTemplate: string;
    responseParser: (response: string) => RoutingResult;
    options?: LangChainOptions;
}

export interface PlanningResult {
    strategy: string;
    goal: string;
    steps: Array<{
        id: string;
        description: string;
        tool?: string;
        arguments?: Record<string, unknown>;
        dependencies?: string[];
        type: 'analysis' | 'action' | 'decision' | 'observation';
    }>;
    reasoning: string;
    complexity: 'simple' | 'medium' | 'complex';
    estimatedTime?: number;
}

// Interface for the new DAG format from LLM
interface LLMPlanStep {
    id: string;
    description: string;
    tool?: string;
    arguments?: Record<string, unknown>;
    argsTemplate?: Record<string, unknown>; // New format
    dependencies?: string[];
    dependsOn?: string[]; // New format
    type?: 'analysis' | 'action' | 'decision' | 'observation';
    parallel?: boolean;
    expectedOutcome?: string;
    fallback?: string;
}

export interface RoutingResult {
    strategy: string;
    selectedTool: string;
    confidence: number;
    reasoning: string;
    alternatives?: Array<{
        tool: string;
        confidence: number;
        reason: string;
    }>;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🚀 DIRECT LLM ADAPTER IMPLEMENTATION
// ──────────────────────────────────────────────────────────────────────────────

export class DirectLLMAdapter {
    private llm: LangChainLLM;
    private logger = createLogger('direct-llm-adapter');
    private planningTechniques = new Map<string, PlanningTechnique>();
    private routingStrategies = new Map<string, RoutingTechnique>();

    constructor(langchainLLM: LangChainLLM) {
        this.llm = langchainLLM;
        this.initializePlanningTechniques();
        this.initializeRoutingStrategies();

        this.logger.info('Direct LLM adapter initialized', {
            llmName: langchainLLM.name || 'unknown-llm',
            hasStreaming: typeof langchainLLM.stream === 'function',
        });
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🎯 PLANNING INTERFACE (DIRETO COM LANGCHAIN)
    // ──────────────────────────────────────────────────────────────────────────────

    async createPlan(
        goal: string,
        technique: string = 'cot',
        context?: {
            availableTools?:
                | string[]
                | Array<{
                      name: string;
                      description?: string;
                      [key: string]: unknown;
                  }>;
            previousPlans?: PlanningResult[];
            constraints?: string[];
            // Context engineering fields for enhanced prompting
            toolsContext?: string;
            agentScratchpad?: string; // ReAct agent_scratchpad
            identityContext?: string;
            userContext?: Record<string, unknown>; // User context for personalization
            memoryContext?: string; // Memory context from conversation and knowledge
            sequentialInstructions?: string; // Custom instructions for sequential planning
            planningInstructions?: string; // Detailed planning instructions from planner
            planningHistory?: string; // History of previous planning attempts
            systemPrompt?: string; // System prompt provided by planner
            userPromptTemplate?: string; // User prompt template provided by planner
        },
    ): Promise<PlanningResult> {
        // ✅ Standard technique-based planning
        const planningTechnique = this.planningTechniques.get(technique);
        if (!planningTechnique) {
            throw new EngineError(
                'LLM_ERROR',
                `Planning technique '${technique}' not found`,
            );
        }

        // Use prompts from planner if provided, otherwise fallback to technique prompts
        let systemPrompt: string;
        let userPrompt: string;

        if (context?.systemPrompt && context?.userPromptTemplate) {
            // Planner provides prompts - use them directly
            systemPrompt = this.formatTemplate(context.systemPrompt, {
                identityContext: this.formatIdentityContext(
                    context?.identityContext,
                ),
                userContext: this.formatUserContext(context?.userContext),
                memoryContext: this.formatMemoryContext(
                    typeof context?.memoryContext === 'string'
                        ? context.memoryContext
                        : '',
                ),
            });
            userPrompt = this.formatUserPrompt(
                context.userPromptTemplate,
                goal,
                context,
            );
        } else {
            // Fallback: create simple prompts when planner doesn't provide them
            systemPrompt = `You are an AI assistant using the ${technique} planning technique.`;
            userPrompt = this.formatUserPrompt('Goal: {goal}', goal, context);
        }

        const messages: LangChainMessage[] = [
            {
                role: 'system',
                content: systemPrompt,
            },
            {
                role: 'user',
                content: userPrompt,
            },
        ];

        try {
            this.logger.debug('Creating plan with LangChain LLM', {
                technique,
                goal,
                contextProvided: !!context,
            });

            // ✅ CHAMADA DIRETA - SEM CONVERSÃO
            const response = await this.llm.call(
                messages,
                planningTechnique.options,
            );

            debugger;

            // Handle both string and object responses from LangChain
            const content =
                typeof response === 'string' ? response : response.content;

            // ✅ Always use the technique's official parser
            const result = planningTechnique.responseParser(content);
            debugger;

            this.logger.debug('Plan created successfully', {
                strategy: result.strategy,
                stepsCount: result.steps.length,
                complexity: result.complexity,
            });

            return result;
        } catch (error) {
            this.logger.error(
                'Planning failed',
                error instanceof Error ? error : new Error('Unknown error'),
            );
            throw new EngineError(
                'LLM_ERROR',
                `Planning failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    async routeToTool(
        input: string | Record<string, unknown>,
        availableTools: string[],
        strategy: string = 'llm_decision',
    ): Promise<RoutingResult> {
        const routingStrategy = this.routingStrategies.get(strategy);
        if (!routingStrategy) {
            throw new EngineError(
                'LLM_ERROR',
                `Routing strategy '${strategy}' not found`,
            );
        }

        const messages: LangChainMessage[] = [
            {
                role: 'system',
                content: routingStrategy.systemPrompt,
            },
            {
                role: 'user',
                content: this.formatUserPrompt(
                    routingStrategy.userPromptTemplate,
                    input,
                    { availableTools },
                ),
            },
        ];

        try {
            this.logger.debug('Routing with LangChain LLM', {
                strategy,
                input:
                    typeof input === 'object' ? JSON.stringify(input) : input,
                availableToolsCount: availableTools.length,
            });

            // ✅ CHAMADA DIRETA - SEM CONVERSÃO
            const response = await this.llm.call(
                messages,
                routingStrategy.options,
            );

            // Handle both string and object responses from LangChain
            const content =
                typeof response === 'string' ? response : response.content;

            const result = routingStrategy.responseParser(content);

            this.logger.debug('Routing completed successfully', {
                selectedTool: result.selectedTool,
                confidence: result.confidence,
                strategy: result.strategy,
            });

            return result;
        } catch (error) {
            this.logger.error(
                'Routing failed',
                error instanceof Error ? error : new Error('Unknown error'),
            );
            throw new EngineError(
                'LLM_ERROR',
                `Routing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🧠 PLANNING TECHNIQUES INITIALIZATION
    // ──────────────────────────────────────────────────────────────────────────────

    private initializePlanningTechniques() {
        // Plan-Execute technique
        this.planningTechniques.set('plan-execute', {
            name: 'Plan-Execute',
            description:
                'Creates a comprehensive plan and then executes it step by step',
            responseParser: this.parseStandardPlanningResponse.bind(this),
            options: {
                ...DEFAULT_LLM_SETTINGS,
                maxTokens: TOKEN_PRESETS.REACT_COMPLEX,
            },
        });

        // ReAct technique
        this.planningTechniques.set('react', {
            name: 'ReAct',
            description:
                'Combines reasoning with acting in an iterative process',
            responseParser: this.parseReActResponse.bind(this),
            options: {
                ...DEFAULT_LLM_SETTINGS,
                maxTokens: TOKEN_PRESETS.REACT_COMPLEX,
            },
        });

        // Chain of Thought technique
        this.planningTechniques.set('cot', {
            name: 'Chain of Thought',
            description: 'Sequential reasoning approach',
            responseParser: this.parseStandardPlanningResponse.bind(this),
            options: DEFAULT_LLM_SETTINGS,
        });
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🔀 ROUTING STRATEGIES IMPLEMENTATION
    // ──────────────────────────────────────────────────────────────────────────────

    private initializeRoutingStrategies() {
        // LLM-based decision routing
        this.routingStrategies.set('llm_decision', {
            name: 'LLM Decision',
            description:
                'Use LLM to intelligently route based on input analysis',
            systemPrompt: `You are an expert routing assistant that analyzes input and selects the most appropriate tool.

Instructions:
1. Analyze the input content and intent
2. Consider the capabilities of available tools
3. Select the best tool for the task
4. Provide confidence score and reasoning
5. Suggest alternatives if applicable

Always respond in JSON format with the following structure:
{
  "strategy": "llm_decision",
  "selectedTool": "tool_name",
  "confidence": 0.95,
  "reasoning": "detailed reasoning for selection",
  "alternatives": [
    {
      "tool": "alternative_tool",
      "confidence": 0.8,
      "reason": "why this could work"
    }
  ]
}`,
            userPromptTemplate: `Input: {input}

Available tools: {availableTools}

Please analyze the input and select the most appropriate tool.`,
            responseParser: this.parseRoutingResponse.bind(this),
            options: DEFAULT_LLM_SETTINGS,
        });

        // Semantic similarity routing
        this.routingStrategies.set('semantic_similarity', {
            name: 'Semantic Similarity',
            description:
                'Route based on semantic similarity between input and tool descriptions',
            systemPrompt: `You are an expert routing assistant that uses semantic similarity to match inputs with tools.

Instructions:
1. Analyze the semantic meaning of the input
2. Compare with tool descriptions and capabilities
3. Calculate similarity scores
4. Select tool with highest semantic match
5. Provide reasoning based on semantic analysis

Always respond in JSON format with the following structure:
{
  "strategy": "semantic_similarity",
  "selectedTool": "tool_name",
  "confidence": 0.95,
  "reasoning": "semantic analysis and similarity reasoning",
  "alternatives": [
    {
      "tool": "alternative_tool",
      "confidence": 0.8,
      "reason": "semantic similarity reason"
    }
  ]
}`,
            userPromptTemplate: `Input: {input}

Available tools: {availableTools}

Please analyze semantic similarity and select the most appropriate tool.`,
            responseParser: this.parseRoutingResponse.bind(this),
            options: {
                ...DEFAULT_LLM_SETTINGS,
                maxTokens: TOKEN_PRESETS.QUICK, // Routing needs less tokens
            },
        });
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🔧 HELPER METHODS
    // ──────────────────────────────────────────────────────────────────────────────

    private formatUserPrompt(
        template: string,
        primary: string | Record<string, unknown>,
        context?: Record<string, unknown>,
    ): string {
        return this.formatTemplate(template, {
            goal: String(primary),
            input: String(primary),
            identityContext: this.formatIdentityContext(
                context?.identityContext,
            ),
            userContext: this.formatUserContext(context?.userContext),
            availableTools: this.formatAvailableTools(context?.availableTools),
            tools: this.formatToolsForTemplate(
                context?.availableTools,
                context,
            ),
            toolNames: this.extractToolNames(context?.availableTools),
            context: this.formatContext(context),
            agentScratchpad: String(context?.agentScratchpad || ''),
            memoryContext: this.formatMemoryContext(
                typeof context?.memoryContext === 'string'
                    ? context.memoryContext
                    : '',
            ),
            sequentialInstructions: String(
                context?.sequentialInstructions || '',
            ),
            planningInstructions: String(context?.planningInstructions || ''),
            planningHistory: String(context?.planningHistory || ''),
            toolsContext: String(context?.toolsContext || ''),
            iteration: String(context?.iteration || '0'),
            maxIterations: String(context?.maxIterations || '15'),
        });
    }

    /**
     * ✅ Simple template engine - replaces {key} with values
     */
    private formatTemplate(
        template: string,
        values: Record<string, string>,
    ): string {
        let result = template.replace(/\{(\w+)\}/g, (_match, key) => {
            const value = values[key];
            return value !== undefined ? value : '';
        });

        // Clean up multiple consecutive newlines left by empty placeholders
        result = result.replace(/\n\s*\n\s*\n/g, '\n\n');

        // Clean up cases where empty placeholders leave awkward spacing
        result = result.replace(/\.\{\w+\}/g, '.');
        result = result.replace(/step by step\.\s*\n\n/g, 'step by step.\n\n');

        return result;
    }

    /**
     * ✅ Format identity context with proper newlines when present
     */
    private formatIdentityContext(identityContext?: unknown): string {
        if (
            !identityContext ||
            (typeof identityContext === 'string' &&
                identityContext.trim() === '')
        ) {
            return '';
        }

        const contextStr = String(identityContext);
        // Add leading newline if content exists, so it formats nicely after the main prompt
        return `\n\n${contextStr}`;
    }

    /**
     * ✅ Format user context in readable way
     */
    private formatUserContext(userContext?: unknown): string {
        return userContext
            ? `User preferences: ${JSON.stringify(userContext, null, 2)}`
            : '';
    }

    /**
     * ✅ Format available tools for simple listing
     */
    private formatAvailableTools(availableTools?: unknown): string {
        if (!Array.isArray(availableTools)) return '';

        return availableTools
            .map((tool) => (typeof tool === 'string' ? tool : tool.name))
            .join(', ');
    }

    /**
     * ✅ Format tools for ReAct template (detailed format)
     */
    private formatToolsForTemplate(
        availableTools?: unknown,
        context?: Record<string, unknown>,
    ): string {
        // Use enhanced toolsContext if available
        if (context?.toolsContext && typeof context.toolsContext === 'string') {
            return context.toolsContext;
        }

        // Fallback to basic formatting
        if (!Array.isArray(availableTools)) return '';

        return availableTools
            .map(
                (tool: string | { name: string; description?: string }) =>
                    `${typeof tool === 'string' ? tool : tool.name}: ${typeof tool === 'string' ? tool : tool.description || 'No description'}`,
            )
            .join('\n');
    }

    /**
     * ✅ Extract tool names for comma-separated list
     */
    private extractToolNames(availableTools?: unknown): string {
        if (!Array.isArray(availableTools)) return '';

        return availableTools
            .map((tool: string | { name: string }) =>
                typeof tool === 'string' ? tool : tool.name,
            )
            .join(', ');
    }

    /**
     * ✅ Format context object with structured or fallback approach
     */
    private formatContext(context?: Record<string, unknown>): string {
        if (!context) return '';

        // Use structured context if available
        if (
            context.toolsContext ||
            context.historyContext ||
            context.identityContext
        ) {
            return [
                context.identityContext,
                context.toolsContext,
                context.historyContext,
            ]
                .filter(Boolean)
                .join('\n');
        }

        // Fallback to JSON
        return JSON.stringify(context);
    }

    /**
     * ✅ Format memory context for prompt
     */
    private formatMemoryContext(memoryContext?: string): string {
        if (!memoryContext || memoryContext.trim() === '') {
            return '';
        }

        return `MEMORY CONTEXT:
${memoryContext}

`;
    }

    /**
     * Clean JSON response from markdown code blocks
     */
    private cleanJsonResponse(response: string): string {
        let cleaned = response.trim();

        // Remove opening code block markers
        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.substring(7);
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.substring(3);
        }

        // Remove closing code block markers
        if (cleaned.endsWith('```')) {
            cleaned = cleaned.substring(0, cleaned.length - 3);
        }

        // ✅ IMPROVED: Remove JSON comments and fix common issues
        cleaned = cleaned
            // Remove single-line comments (// ...)
            .replace(/\/\/.*$/gm, '')
            // Remove multi-line comments (/* ... */)
            .replace(/\/\*[\s\S]*?\*\//g, '')
            // Remove trailing commas before closing braces/brackets
            .replace(/,(\s*[}\]])/g, '$1')
            // Remove trailing commas in objects
            .replace(/,(\s*})/g, '$1')
            // Fix common LLM mistakes: replace "undefined" with null
            .replace(/"undefined"/g, 'null')
            // Fix common LLM mistakes: replace undefined without quotes
            .replace(/:\s*undefined\s*([,}])/g, ': null$1')
            // Remove extra whitespace
            .replace(/\s+/g, ' ')
            .trim();

        return cleaned;
    }

    /**
     * ✅ NEW: Flexible parser that handles both JSON and natural text responses
     */
    // private parseFlexiblePlanningResponse(
    //     response: string,
    //     goal: string,
    //     technique: string,
    // ): PlanningResult {
    //     try {
    //         // First try JSON parsing
    //         const cleanedResponse = this.cleanJsonResponse(response);
    //         const parsed = JSON.parse(cleanedResponse);
    //         return {
    //             strategy: parsed.strategy || technique,
    //             goal: parsed.goal || goal,
    //             steps: parsed.steps || [],
    //             reasoning: parsed.reasoning || '',
    //             complexity: parsed.complexity || 'medium',
    //         };
    //     } catch {
    //         // JSON parsing failed, treat as natural text response
    //         return {
    //             strategy: technique,
    //             goal: goal,
    //             steps: [
    //                 {
    //                     id: 'step_1',
    //                     description: response.trim(),
    //                     type: 'analysis' as const,
    //                 },
    //             ],
    //             reasoning: response.trim(),
    //             complexity: 'medium' as const,
    //         };
    //     }
    // }

    private parseReActResponse(response: string): PlanningResult {
        try {
            // ReAct should return next action, not full plan
            const lines = response
                .trim()
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0);

            let thought = '';
            let action = '';
            let actionInput = '';
            let finalAnswer = '';

            // Extract the latest Thought/Action/Final Answer from response
            for (const line of lines) {
                if (line.startsWith('Thought:')) {
                    thought = line.substring(8).trim();
                } else if (line.startsWith('Action:')) {
                    action = line.substring(7).trim();
                } else if (line.startsWith('Action Input:')) {
                    actionInput = line.substring(13).trim();
                } else if (line.startsWith('Final Answer:')) {
                    finalAnswer = line.substring(13).trim();
                }
            }

            // If we have a final answer, this is the end
            if (finalAnswer) {
                return {
                    strategy: 'react',
                    goal: 'ReAct final answer',
                    steps: [
                        {
                            id: 'final_answer',
                            description: finalAnswer,
                            type: 'decision',
                        },
                    ],
                    reasoning: `Final answer: ${finalAnswer}`,
                    complexity: 'simple',
                };
            }

            // If we have action, return next tool call
            if (action && actionInput) {
                let parsedInput: Record<string, unknown> = {};
                try {
                    parsedInput = JSON.parse(actionInput);
                } catch {
                    parsedInput = { input: actionInput };
                }

                return {
                    strategy: 'react',
                    goal: 'ReAct next action',
                    steps: [
                        {
                            id: 'next_action',
                            description: thought || `Execute ${action}`,
                            tool: action,
                            arguments: parsedInput,
                            type: 'action',
                        },
                    ],
                    reasoning: thought || `Executing ${action}`,
                    complexity: 'simple',
                };
            }

            // If only thought, continue reasoning
            if (thought) {
                return {
                    strategy: 'react',
                    goal: 'ReAct continue thinking',
                    steps: [
                        {
                            id: 'continue_thinking',
                            description: thought,
                            type: 'analysis',
                        },
                    ],
                    reasoning: thought,
                    complexity: 'simple',
                };
            }

            // Fallback: raw response
            return {
                strategy: 'react',
                goal: 'ReAct raw response',
                steps: [
                    {
                        id: 'raw_response',
                        description: response.trim(),
                        type: 'analysis',
                    },
                ],
                reasoning: response.trim(),
                complexity: 'simple',
            };
        } catch (error) {
            this.logger.error(
                'Failed to parse ReAct response',
                error instanceof Error ? error : new Error('Unknown error'),
            );
            return {
                strategy: 'react',
                goal: '',
                steps: [
                    {
                        id: 'fallback',
                        description: response.trim(),
                        type: 'analysis',
                    },
                ],
                reasoning: 'Failed to parse ReAct response',
                complexity: 'medium',
            };
        }
    }

    private parseStandardPlanningResponse(response: string): PlanningResult {
        try {
            // Clean response from markdown code blocks and comments
            const cleanedResponse = this.cleanJsonResponse(response);

            // ✅ IMPROVED: Better error logging
            this.logger.debug('Attempting to parse JSON response', {
                originalLength: response.length,
                cleanedLength: cleanedResponse.length,
                cleanedPreview: cleanedResponse.substring(0, 200),
            });

            const parsed = JSON.parse(cleanedResponse);

            // ✅ IMPROVED: Validate parsed structure
            if (!parsed || typeof parsed !== 'object') {
                throw new Error('Parsed response is not an object');
            }

            // Handle both old format (steps) and new format (plan)
            const steps: LLMPlanStep[] = parsed.steps || parsed.plan || [];

            // Convert new format to old format for backward compatibility
            const convertedSteps = steps.map(
                (step: LLMPlanStep, index: number) => ({
                    id: step.id || `step_${index + 1}`,
                    description: step.description || '',
                    tool: step.tool,
                    arguments: step.arguments || step.argsTemplate || {},
                    dependencies: step.dependencies || step.dependsOn || [],
                    type: step.type || 'action',
                    parallel: step.parallel || false,
                    expectedOutcome: step.expectedOutcome,
                    fallback: step.fallback,
                }),
            );

            return {
                strategy: parsed.strategy || 'plan-execute',
                goal: parsed.goal || '',
                steps: convertedSteps,
                reasoning: parsed.reasoning || '',
                complexity: parsed.complexity || 'medium',
            };
        } catch (error) {
            this.logger.error(
                'Failed to parse planning response',
                error instanceof Error ? error : new Error('Unknown error'),
                {
                    responsePreview: response.substring(0, 500),
                    errorPosition:
                        error instanceof SyntaxError
                            ? error.message
                            : 'unknown',
                },
            );
            return {
                strategy: 'fallback',
                goal: '',
                steps: [],
                reasoning: 'Failed to parse LLM response',
                complexity: 'medium',
            };
        }
    }

    private parseRoutingResponse(response: string): RoutingResult {
        try {
            // Clean response from markdown code blocks
            const cleanedResponse = this.cleanJsonResponse(response);
            const parsed = JSON.parse(cleanedResponse);
            return {
                strategy: parsed.strategy || 'unknown',
                selectedTool: parsed.selectedTool || '',
                confidence: parsed.confidence || 0.5,
                reasoning: parsed.reasoning || '',
                alternatives: parsed.alternatives || [],
            };
        } catch (error) {
            this.logger.error(
                'Failed to parse routing response',
                error instanceof Error ? error : new Error('Unknown error'),
            );
            return {
                strategy: 'fallback',
                selectedTool: '',
                confidence: 0.1,
                reasoning: 'Failed to parse LLM response',
            };
        }
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 📊 PROVIDER MANAGEMENT
    // ──────────────────────────────────────────────────────────────────────────────

    getLLM(): LangChainLLM {
        return this.llm;
    }

    setLLM(llm: LangChainLLM): void {
        this.llm = llm;
        this.logger.info('LangChain LLM updated', { name: llm.name });
    }

    // ✅ COMPATIBILIDADE COM SDKOrchestrator
    getProvider(): { name: string } {
        return {
            name: this.llm.name || 'unknown-llm',
        };
    }

    getAvailableTechniques(): string[] {
        return Array.from(this.planningTechniques.keys());
    }

    getAvailableRoutingStrategies(): string[] {
        return Array.from(this.routingStrategies.keys());
    }

    supportsStreaming(): boolean {
        return typeof this.llm.stream === 'function';
    }

    getName(): string {
        return this.llm.name || 'unknown-llm';
    }

    // ✅ COMPATIBILITY: LLMAdapter interface compliance
    async call(request: {
        messages: Array<{ role: string; content: string }>;
        temperature?: number;
        maxTokens?: number;
    }): Promise<{ content: string }> {
        const messages: LangChainMessage[] = request.messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
        }));

        const options: LangChainOptions = {
            ...DEFAULT_LLM_SETTINGS,
            temperature:
                request.temperature ?? DEFAULT_LLM_SETTINGS.temperature,
            maxTokens: request.maxTokens ?? DEFAULT_LLM_SETTINGS.maxTokens,
        };

        try {
            const response = await this.llm.call(messages, options);
            const content =
                typeof response === 'string' ? response : response.content;

            return { content };
        } catch (error) {
            this.logger.error('Direct call failed', error as Error);
            throw error;
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 🏭 FACTORY FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

export function createDirectLLMAdapter(
    langchainLLM: LangChainLLM,
): DirectLLMAdapter {
    return new DirectLLMAdapter(langchainLLM);
}

/**
 * Helper para migração de código existente
 */
export function createLLMAdapter(langchainLLM: LangChainLLM): DirectLLMAdapter {
    return createDirectLLMAdapter(langchainLLM);
}
