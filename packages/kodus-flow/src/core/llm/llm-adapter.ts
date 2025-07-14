/**
 * @module core/llm/llm-adapter
 * @description LLM Adapter Interface - Integração com providers LLM (LangChain, OpenAI, etc.)
 *
 * OBJETIVOS:
 * ✅ Interface simples mas poderosa para LLM
 * ✅ Compatível com LangChain provider
 * ✅ Suporte a built-in planners/routers
 * ✅ Mantém API createPlanner/createRouter
 * ✅ Técnicas integradas (OODA, ReAct, CoT, ToT)
 */

import { createLogger } from '../../observability/index.js';
import { EngineError } from '../errors.js';
import { generateSystemPromptFromIdentity } from '../types/agent-types.js';
import type { AgentDefinition } from '../types/agent-types.js';

// ──────────────────────────────────────────────────────────────────────────────
// 📋 TYPES & INTERFACES
// ──────────────────────────────────────────────────────────────────────────────

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    name?: string;
    toolCallId?: string;
    toolCalls?: Array<{
        id: string;
        type: 'function';
        function: {
            name: string;
            arguments: string;
        };
    }>;
}

export interface LLMResponse {
    content: string;
    toolCalls?: Array<{
        id: string;
        type: 'function';
        function: {
            name: string;
            arguments: string;
        };
    }>;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface LLMOptions {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stop?: string[];
    stream?: boolean;
    tools?: Array<{
        type: 'function';
        function: {
            name: string;
            description: string;
            parameters: Record<string, unknown>;
        };
    }>;
    toolChoice?:
        | 'auto'
        | 'none'
        | { type: 'function'; function: { name: string } };
}

export interface LLMProvider {
    name: string;
    call(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;
    stream?(
        messages: LLMMessage[],
        options?: LLMOptions,
    ): AsyncGenerator<LLMResponse>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧠 PLANNING TECHNIQUES
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanningTechnique {
    name: string;
    description: string;
    systemPrompt: string;
    systemPromptTemplate?: string; // Template that uses agent identity
    userPromptTemplate: string;
    responseParser: (response: string) => PlanningResult;
    options?: LLMOptions;
}

export interface RoutingTechnique {
    name: string;
    description: string;
    systemPrompt: string;
    systemPromptTemplate?: string; // Template that uses agent identity
    userPromptTemplate: string;
    responseParser: (response: string) => RoutingResult;
    options?: LLMOptions;
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
// 🚀 LLM ADAPTER IMPLEMENTATION
// ──────────────────────────────────────────────────────────────────────────────

export class LLMAdapter {
    private provider: LLMProvider;
    private logger = createLogger('llm-adapter');
    private planningTechniques = new Map<string, PlanningTechnique>();
    private routingStrategies = new Map<string, RoutingTechnique>();

    constructor(provider: LLMProvider) {
        this.provider = provider;
        this.initializePlanningTechniques();
        this.initializeRoutingStrategies();
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🎯 PLANNING INTERFACE
    // ──────────────────────────────────────────────────────────────────────────────

    async createPlan(
        goal: string,
        technique: string = 'cot',
        context?: {
            availableTools?: string[];
            previousPlans?: PlanningResult[];
            constraints?: string[];
            agentIdentity?: AgentDefinition['identity']; // NEW: Agent identity
        },
    ): Promise<PlanningResult> {
        const planningTechnique = this.planningTechniques.get(technique);
        if (!planningTechnique) {
            throw new EngineError(
                'LLM_ERROR',
                `Planning technique '${technique}' not found`,
            );
        }

        const messages: LLMMessage[] = [
            {
                role: 'system',
                content: this.generateSystemPrompt(
                    planningTechnique,
                    context?.agentIdentity,
                ),
            },
            {
                role: 'user',
                content: this.formatUserPrompt(
                    planningTechnique.userPromptTemplate,
                    goal,
                    context,
                ),
            },
        ];

        try {
            const response = await this.provider.call(
                messages,
                planningTechnique.options,
            );
            return planningTechnique.responseParser(response.content);
        } catch (error) {
            this.logger.error('Planning failed', error as Error);
            throw new EngineError(
                'LLM_ERROR',
                `Planning failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    async routeToTool(
        input: string,
        availableTools: string[],
        strategy: string = 'llm_decision',
        agentIdentity?: AgentDefinition['identity'], // NEW: Agent identity
    ): Promise<RoutingResult> {
        const routingStrategy = this.routingStrategies.get(strategy);
        if (!routingStrategy) {
            throw new EngineError(
                'LLM_ERROR',
                `Routing strategy '${strategy}' not found`,
            );
        }

        const messages: LLMMessage[] = [
            {
                role: 'system',
                content: this.generateSystemPrompt(
                    routingStrategy,
                    agentIdentity,
                ),
            },
            {
                role: 'user',
                content: this.formatUserPrompt(
                    routingStrategy.userPromptTemplate,
                    input,
                    {
                        availableTools,
                    },
                ),
            },
        ];

        try {
            const response = await this.provider.call(
                messages,
                routingStrategy.options,
            );
            return routingStrategy.responseParser(response.content);
        } catch (error) {
            this.logger.error('Routing failed', error as Error);
            throw new EngineError(
                'LLM_ERROR',
                `Routing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🧠 AGENT IDENTITY INTEGRATION
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Generate context-aware system prompt using agent identity
     */
    private generateSystemPrompt(
        technique: PlanningTechnique | RoutingTechnique,
        agentIdentity?: AgentDefinition['identity'],
    ): string {
        // If agent identity is provided and technique has template, use it
        if (agentIdentity && technique.systemPromptTemplate) {
            const agentSystemPrompt =
                generateSystemPromptFromIdentity(agentIdentity);
            return technique.systemPromptTemplate.replace(
                '{{AGENT_IDENTITY}}',
                agentSystemPrompt,
            );
        }

        // If agent identity provided but no template, combine prompts
        if (agentIdentity) {
            const agentSystemPrompt =
                generateSystemPromptFromIdentity(agentIdentity);
            return `${agentSystemPrompt}\n\n${technique.systemPrompt}`;
        }

        // Fallback to default system prompt
        return technique.systemPrompt;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🧠 PLANNING TECHNIQUES IMPLEMENTATION
    // ──────────────────────────────────────────────────────────────────────────────

    private initializePlanningTechniques() {
        // Chain of Thought (CoT)
        this.planningTechniques.set('cot', {
            name: 'Chain of Thought',
            description: 'Step-by-step reasoning with explicit thought process',
            systemPrompt: `You are an expert planning assistant that uses Chain of Thought reasoning.
Your job is to break down complex goals into logical, sequential steps.`,
            systemPromptTemplate: `{{AGENT_IDENTITY}}

As this specific agent, you should use Chain of Thought reasoning to break down complex goals into logical, sequential steps that align with your role and expertise.

Instructions:
1. Think through the problem step by step
2. Identify the sequence of actions needed
3. Consider dependencies between steps
4. Provide clear reasoning for each step

Always respond in JSON format with the following structure:
{
  "strategy": "cot",
  "goal": "original goal",
  "steps": [
    {
      "id": "step_1",
      "description": "Step description",
      "tool": "tool_name",
      "arguments": {},
      "dependencies": [],
      "type": "analysis|action|decision|observation"
    }
  ],
  "reasoning": "your step-by-step reasoning",
  "complexity": "simple|medium|complex"
}`,
            userPromptTemplate: `Goal: {goal}

Available tools: {availableTools}
Context: {context}

Please create a step-by-step plan using Chain of Thought reasoning.`,
            responseParser: this.parseStandardPlanningResponse.bind(this),
            options: {
                temperature: 0.3,
                maxTokens: 1000,
            },
        });

        // Tree of Thoughts (ToT)
        this.planningTechniques.set('tot', {
            name: 'Tree of Thoughts',
            description:
                'Explores multiple reasoning paths and selects the best approach',
            systemPrompt: `You are an expert planning assistant that uses Tree of Thoughts reasoning.
Your job is to explore multiple possible approaches and select the best one.

Instructions:
1. Generate multiple possible approaches (branches)
2. Evaluate each approach's merits
3. Select the best approach based on criteria
4. Provide detailed reasoning for your selection

Always respond in JSON format with the following structure:
{
  "strategy": "tot",
  "goal": "original goal",
  "steps": [
    {
      "id": "step_1",
      "description": "Step description",
      "tool": "tool_name",
      "arguments": {},
      "dependencies": [],
      "type": "analysis|action|decision|observation"
    }
  ],
  "reasoning": "your reasoning including alternative approaches considered",
  "complexity": "simple|medium|complex"
}`,
            userPromptTemplate: `Goal: {goal}

Available tools: {availableTools}
Context: {context}

Please create a plan using Tree of Thoughts reasoning. Consider multiple approaches and select the best one.`,
            responseParser: this.parseStandardPlanningResponse.bind(this),
            options: {
                temperature: 0.5,
                maxTokens: 1500,
            },
        });

        // ReAct (Reasoning + Acting)
        this.planningTechniques.set('react', {
            name: 'ReAct',
            description:
                'Combines reasoning with acting in an iterative process',
            systemPrompt: `You are an expert planning assistant that uses ReAct (Reasoning + Acting) methodology.
Your job is to create plans that combine reasoning with actions in an iterative process.

Instructions:
1. Alternate between reasoning and acting
2. Each action should be followed by observation
3. Use observations to inform next reasoning step
4. Continue until goal is achieved

Always respond in JSON format with the following structure:
{
  "strategy": "react",
  "goal": "original goal",
  "steps": [
    {
      "id": "step_1",
      "description": "Step description",
      "tool": "tool_name",
      "arguments": {},
      "dependencies": [],
      "type": "analysis|action|decision|observation"
    }
  ],
  "reasoning": "your reasoning about the iterative process",
  "complexity": "simple|medium|complex"
}`,
            userPromptTemplate: `Goal: {goal}

Available tools: {availableTools}
Context: {context}

Please create a plan using ReAct methodology. Alternate between reasoning and acting.`,
            responseParser: this.parseStandardPlanningResponse.bind(this),
            options: {
                temperature: 0.4,
                maxTokens: 1200,
            },
        });

        // OODA Loop (Observe, Orient, Decide, Act)
        this.planningTechniques.set('ooda', {
            name: 'OODA Loop',
            description: 'Military-inspired decision making process',
            systemPrompt: `You are an expert planning assistant that uses OODA Loop methodology.
Your job is to create plans following the Observe, Orient, Decide, Act cycle.

Instructions:
1. OBSERVE: Gather information about the current situation
2. ORIENT: Analyze and synthesize the information
3. DECIDE: Choose the best course of action
4. ACT: Execute the decision
5. Loop back to OBSERVE for next iteration

Always respond in JSON format with the following structure:
{
  "strategy": "ooda",
  "goal": "original goal",
  "steps": [
    {
      "id": "step_1",
      "description": "Step description",
      "tool": "tool_name",
      "arguments": {},
      "dependencies": [],
      "type": "analysis|action|decision|observation"
    }
  ],
  "reasoning": "your reasoning following OODA methodology",
  "complexity": "simple|medium|complex"
}`,
            userPromptTemplate: `Goal: {goal}

Available tools: {availableTools}
Context: {context}

Please create a plan using OODA Loop methodology. Follow the Observe, Orient, Decide, Act cycle.`,
            responseParser: this.parseStandardPlanningResponse.bind(this),
            options: {
                temperature: 0.3,
                maxTokens: 1000,
            },
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
            options: {
                temperature: 0.2,
                maxTokens: 500,
            },
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
                temperature: 0.1,
                maxTokens: 400,
            },
        });
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🔧 HELPER METHODS
    // ──────────────────────────────────────────────────────────────────────────────

    private formatUserPrompt(
        template: string,
        primary: string,
        context?: Record<string, unknown>,
    ): string {
        let formatted = template.replace('{goal}', String(primary));
        formatted = formatted.replace('{input}', JSON.stringify(primary));

        if (context?.availableTools) {
            formatted = formatted.replace(
                '{availableTools}',
                (context.availableTools as string[]).join(', '),
            );
        }

        formatted = formatted.replace(
            '{context}',
            JSON.stringify(context || {}),
        );

        return formatted;
    }

    private parseStandardPlanningResponse(response: string): PlanningResult {
        try {
            // Extract JSON from code blocks if present
            let jsonString = response.trim();
            if (jsonString.includes('```json')) {
                const match = jsonString.match(/```json\s*([\s\S]*?)\s*```/);
                if (match && match[1]) {
                    jsonString = match[1];
                }
            }

            const parsed = JSON.parse(jsonString);
            return {
                strategy: parsed.strategy || 'unknown',
                goal: parsed.goal || '',
                steps: parsed.steps || [],
                reasoning: parsed.reasoning || '',
                complexity: parsed.complexity || 'medium',
            };
        } catch (error) {
            this.logger.error(
                'Failed to parse planning response',
                error as Error,
            );
            // Fallback parsing
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
            // Extract JSON from code blocks if present
            let jsonString = response.trim();
            if (jsonString.includes('```json')) {
                const match = jsonString.match(/```json\s*([\s\S]*?)\s*```/);
                if (match && match[1]) {
                    jsonString = match[1];
                }
            }

            const parsed = JSON.parse(jsonString);
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
                error as Error,
            );
            // Fallback
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

    getProvider(): LLMProvider {
        return this.provider;
    }

    setProvider(provider: LLMProvider): void {
        this.provider = provider;
    }

    getAvailableTechniques(): string[] {
        return Array.from(this.planningTechniques.keys());
    }

    getAvailableRoutingStrategies(): string[] {
        return Array.from(this.routingStrategies.keys());
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 🏭 FACTORY FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

export function createLLMAdapter(provider: LLMProvider): LLMAdapter {
    return new LLMAdapter(provider);
}
