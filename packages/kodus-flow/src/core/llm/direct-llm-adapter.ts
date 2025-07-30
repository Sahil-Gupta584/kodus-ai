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
    // 🗑️ REMOVED: Planning techniques and routing strategies (planners handle this now)
    private routingStrategies = new Map<string, RoutingTechnique>(); // 🔄 Keep for legacy fallback

    constructor(langchainLLM: LangChainLLM) {
        this.llm = langchainLLM;
        this.initializeRoutingStrategies(); // 🔄 Keep for legacy fallback

        this.logger.info('Direct LLM adapter initialized (SIMPLIFIED)', {
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
            // 📝 NEW: Simplified interface - planners send READY prompts
            systemPrompt?: string; // ✅ Final system prompt (ready to use)
            userPrompt?: string; // ✅ Final user prompt (ready to use)

            // 🔄 LEGACY: Fallback for old planners (will be deprecated)
            availableTools?:
                | string[]
                | Array<{
                      name: string;
                      description?: string;
                      [key: string]: unknown;
                  }>;
            previousPlans?: PlanningResult[];
            constraints?: string[];
        },
    ): Promise<PlanningResult> {
        const options = {
            ...DEFAULT_LLM_SETTINGS,
            maxTokens: TOKEN_PRESETS.REACT_COMPLEX,
        };

        // ✅ SIMPLE: Log prompt source
        if (context?.systemPrompt && context?.userPrompt) {
            this.logger.debug('Using ready prompts from planner', {
                technique,
                systemPromptLength: context.systemPrompt.length,
                userPromptLength: context.userPrompt.length,
            });
        } else {
            this.logger.warn(
                'Using fallback prompts - planner should provide ready prompts',
                {
                    technique,
                    goal: goal.substring(0, 50),
                },
            );
        }

        // ✅ SIMPLE: Build messages with ready prompts
        const systemPrompt =
            context?.systemPrompt ||
            `You are an AI assistant using the ${technique} planning technique.`;
        const userPrompt = context?.userPrompt || `Goal: ${goal}`;

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

            const response = await this.llm.call(messages, options);

            const content =
                typeof response === 'string' ? response : response.content;

            // ✅ SIMPLE: Parse response as JSON or return simple fallback
            return this.parseFlexiblePlanningResponse(content, goal, technique);
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
        context?: {
            systemPrompt?: string; // ✅ Final system prompt
            userPrompt?: string; // ✅ Final user prompt
            strategy?: string; // Strategy name for fallback
        },
    ): Promise<RoutingResult> {
        // ✅ SIMPLE: Use ready prompts if provided
        let systemPrompt: string;
        let userPrompt: string;

        if (context?.systemPrompt && context?.userPrompt) {
            systemPrompt = context.systemPrompt;
            userPrompt = context.userPrompt;

            this.logger.debug('Using ready routing prompts', {
                systemPromptLength: systemPrompt.length,
                userPromptLength: userPrompt.length,
            });
        } else {
            // 🔄 FALLBACK: Use legacy routing strategy
            const strategy = context?.strategy || 'llm_decision';
            const routingStrategy = this.routingStrategies.get(strategy);

            if (!routingStrategy) {
                throw new EngineError(
                    'LLM_ERROR',
                    `Routing strategy '${strategy}' not found`,
                );
            }

            systemPrompt = routingStrategy.systemPrompt;
            userPrompt = routingStrategy.userPromptTemplate
                .replace('{input}', String(input))
                .replace('{availableTools}', availableTools.join(', '));

            this.logger.warn('Using legacy routing strategy', { strategy });
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
            this.logger.debug('Routing with LangChain LLM', {
                hasReadyPrompts: !!(
                    context?.systemPrompt && context?.userPrompt
                ),
                input:
                    typeof input === 'object' ? JSON.stringify(input) : input,
                availableToolsCount: availableTools.length,
            });

            // ✅ SIMPLE: Direct call to LLM
            const options =
                context?.systemPrompt && context?.userPrompt
                    ? DEFAULT_LLM_SETTINGS
                    : this.routingStrategies.get(
                          context?.strategy || 'llm_decision',
                      )?.options || DEFAULT_LLM_SETTINGS;

            const response = await this.llm.call(messages, options);

            // Handle both string and object responses from LangChain
            const content =
                typeof response === 'string' ? response : response.content;

            // ✅ SIMPLE: Parse routing response directly
            const result = this.parseSimpleRoutingResponse(content);

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
    // 🗑️ REMOVED: Planning techniques (planners handle this now)
    // ──────────────────────────────────────────────────────────────────────────────

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
            responseParser: this.parseSimpleRoutingResponse.bind(this),
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
            responseParser: this.parseSimpleRoutingResponse.bind(this),
            options: {
                ...DEFAULT_LLM_SETTINGS,
                maxTokens: TOKEN_PRESETS.QUICK, // Routing needs less tokens
            },
        });
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🗑️ REMOVED: Template engine methods (planners handle prompts now)
    // ──────────────────────────────────────────────────────────────────────────────

    // 🗑️ REMOVED: All formatting methods - planners handle prompts now

    /**
     * ✅ SIMPLE: Parse planning response - try JSON first, fallback to text
     */
    private parseFlexiblePlanningResponse(
        response: string,
        goal: string,
        technique: string,
    ): PlanningResult {
        try {
            // Try JSON parsing first
            const cleanedResponse = this.cleanJsonResponse(response);
            const parsed = JSON.parse(cleanedResponse);

            return {
                strategy: parsed.strategy || technique,
                goal: parsed.goal || goal,
                steps: parsed.steps || parsed.plan || [],
                reasoning: parsed.reasoning || '',
                complexity: parsed.complexity || 'medium',
            };
        } catch {
            // JSON parsing failed, return simple text response
            return {
                strategy: technique,
                goal: goal,
                steps: [
                    {
                        id: 'step_1',
                        description: response.trim(),
                        type: 'analysis',
                    },
                ],
                reasoning: response.trim(),
                complexity: 'medium',
            };
        }
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
     * ✅ SIMPLE: Parse routing response - try JSON first, fallback to simple
     */
    private parseSimpleRoutingResponse(response: string): RoutingResult {
        try {
            const cleanedResponse = this.cleanJsonResponse(response);
            const parsed = JSON.parse(cleanedResponse);

            return {
                strategy: parsed.strategy || 'llm_decision',
                selectedTool: parsed.selectedTool || 'unknown',
                confidence: parsed.confidence || 0.5,
                reasoning: parsed.reasoning || 'LLM routing response',
                alternatives: parsed.alternatives || [],
            };
        } catch {
            // JSON parsing failed, return simple fallback
            return {
                strategy: 'llm_decision',
                selectedTool: 'unknown',
                confidence: 0.5,
                reasoning: response.trim(),
                alternatives: [],
            };
        }
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
