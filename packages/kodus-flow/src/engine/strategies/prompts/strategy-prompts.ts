/**
 * 🎯 STRATEGY PROMPTS
 *
 * Prompts otimizados para cada estratégia usando os novos formatadores.
 * Baseado nos prompts originais do ReWoo mas adaptados para a nova arquitetura.
 */

import {
    StrategyFormatters,
    Tool,
    AgentContext,
    RewooEvidenceItem,
} from './index.js';

// =============================================================================
// 🏗️ REWOO STRATEGY PROMPTS
// =============================================================================

/**
 * Sistema de prompts para ReWoo Strategy
 */
export class ReWooPrompts {
    private formatters: StrategyFormatters;

    constructor(formatters?: StrategyFormatters) {
        this.formatters = formatters || new StrategyFormatters();
    }

    /**
     * Prompt do sistema para o PLANNER (ReWoo)
     */
    getPlannerSystemPrompt(): string {
        return `You are the PLANNER in a ReWoo pipeline. Decompose the user's goal into independent sub-questions (sketches).
Return STRICT JSON with the following schema:
{
  "sketches": [
    {"id": "S1", "query": string, "tool": string | null, "arguments": object | null},
    ...
  ]
}

Rules:
- Prefer 2-6 concise sub-questions.
- Use only tools from the allowlist: [${this.getToolNames()}].
- If a tool requires parameters you cannot resolve from context/evidence, FIRST add a sketch with tool "REQUEST_INPUT" and arguments {"fields":[...], "message": string}.
- Do not guess identifiers; keep arguments minimal and resolvable.
- No prose outside JSON.`;
    }

    /**
     * Prompt do usuário para o PLANNER
     */
    getPlannerUserPrompt(
        goal: string,
        tools: Tool[],
        context: Record<string, unknown>,
    ): string {
        const toolsList = this.formatters.formatToolsList(tools);
        const contextStr = this.formatContextForPlanner(context);

        return `Goal: ${goal}

${toolsList}

${contextStr}`;
    }

    /**
     * Prompt do sistema para o ORGANIZER
     */
    getOrganizerSystemPrompt(): string {
        return `You are the ORGANIZER in a ReWoo pipeline. Given evidences, compose the final answer.
Return STRICT JSON: {"answer": string, "citations": ["E1", "E2", ...], "confidence": number}
Rules:
- Base every claim on provided evidences; cite their ids like [E#].
- If the answer depends on an assumption or missing data, state it clearly.
- No extra text outside JSON.`;
    }

    /**
     * Prompt do usuário para o ORGANIZER
     */
    getOrganizerUserPrompt(
        goal: string,
        evidences: RewooEvidenceItem[],
    ): string {
        const evidenceStr = this.formatEvidences(evidences);

        return `Goal: ${goal}

EVIDENCE:
${evidenceStr}`;
    }

    /**
     * Prompt do sistema para o EXECUTOR (opcional)
     */
    getExecutorSystemPrompt(): string {
        return `You are the EXECUTOR in a ReWoo pipeline.

Your task is to EXECUTE individual steps using specific tools.

PROCESS:
1. RECEIVE instructions for a specific step
2. VALIDATE that you have all required parameters
3. EXECUTE the specified tool
4. RETURN only the execution result

Rules:
- Execute only the specified step
- Use exactly the provided parameters
- Return only objective data
- Focus on precise execution`;
    }

    /**
     * Prompt do usuário para o EXECUTOR
     */
    getExecutorUserPrompt(step: any, context: Record<string, unknown>): string {
        const contextStr = this.formatContextForExecutor(context);

        return `EXECUTE STEP:
ID: ${step.id}
Description: ${step.description}
Tool: ${step.tool}
Parameters: ${JSON.stringify(step.parameters, null, 2)}

${contextStr}

Execute this step and return the result.`;
    }

    // === HELPERS ===

    /**
     * Obtém lista de nomes de ferramentas para o prompt
     */
    private getToolNames(): string {
        // Isso seria passado dinamicamente, mas para o prompt fixo usamos placeholder
        return '[TOOL_NAMES_WILL_BE_REPLACED]';
    }

    /**
     * Formata context para o planner
     */
    private formatContextForPlanner(context: Record<string, unknown>): string {
        const parts: string[] = [];

        if (context.agentContext) {
            const agentContext = context.agentContext as AgentContext;
            parts.push(`Agent: ${agentContext.agentName}`);
            parts.push(`Session: ${agentContext.sessionId}`);
        }

        if (context.additionalContext) {
            const additional = this.formatters.formatAdditionalContext(
                context.additionalContext as Record<string, unknown>,
            );
            parts.push(additional);
        }

        return parts.length > 0 ? `Context:\n${parts.join('\n')}` : '';
    }

    /**
     * Formata evidências para o organizer
     */
    private formatEvidences(evidences: RewooEvidenceItem[]): string {
        return evidences
            .map(
                (evidence) =>
                    `[${evidence.id}] from ${evidence.toolName} (S:${evidence.sketchId}) -> ${this.formatEvidenceOutput(evidence)}`,
            )
            .join('\n');
    }

    /**
     * Formata output de evidência
     */
    private formatEvidenceOutput(evidence: RewooEvidenceItem): string {
        if (evidence.error) {
            return `ERROR: ${evidence.error}`;
        }

        if (evidence.output) {
            const outputStr =
                typeof evidence.output === 'string'
                    ? evidence.output
                    : JSON.stringify(evidence.output);

            // Trunca se for muito longo
            return outputStr.length > 900
                ? outputStr.substring(0, 900) + '...'
                : outputStr;
        }

        return 'No output';
    }

    /**
     * Formata context para o executor
     */
    private formatContextForExecutor(context: Record<string, unknown>): string {
        const parts: string[] = ['Execution Context:'];

        if (context.agentContext) {
            const agentContext = context.agentContext as AgentContext;
            parts.push(`- Agent: ${agentContext.agentName}`);
            parts.push(`- Session: ${agentContext.sessionId}`);
        }

        if (context.executionHistory) {
            parts.push('- Previous executions available for reference');
        }

        return parts.join('\n');
    }
}

// =============================================================================
// 🔄 REACT STRATEGY PROMPTS
// =============================================================================

/**
 * Sistema de prompts para ReAct Strategy
 */
export class ReActPrompts {
    private formatters: StrategyFormatters;

    constructor(formatters?: StrategyFormatters) {
        this.formatters = formatters || new StrategyFormatters();
    }

    /**
     * Prompt do sistema para ReAct
     */
    getSystemPrompt(): string {
        return `You are an intelligent agent using the ReAct (Reasoning + Acting) pattern.

Your process must be:
1. OBSERVE the current context and user input
2. THINK about the best action to take
3. ACT by executing the chosen action
4. OBSERVE the result of the action
5. REPEAT the cycle until achieving the goal

IMPORTANT RULES:
- Be concise but complete in your reasoning
- Always explain your thought process before acting
- Use tools only when necessary
- Stop when achieving the goal or final answer
- Admit when you don't know something

RESPONSE FORMAT:
Thought: [Your analysis and reasoning]
Action: [Tool name or "final_answer"]
Parameters: [JSON object if tool_call]`;
    }

    /**
     * Prompt do usuário para tarefa específica
     */
    getTaskPrompt(
        input: string,
        tools: Tool[],
        agentContext: AgentContext,
        history?: Array<{
            type: string;
            thought?: { reasoning: string; action: any };
            action?: any;
            result?: any;
        }>,
        additionalContext?: Record<string, unknown>,
    ): string {
        const sections: string[] = [];

        // Contexto da tarefa
        sections.push('## 🎯 TASK CONTEXT');
        sections.push(`**Objective:** ${input}`);
        sections.push(this.formatters.formatAgentContext(agentContext));

        // Ferramentas disponíveis
        if (tools.length > 0) {
            sections.push(this.formatters.formatToolsList(tools));
        }

        // Context adicional
        if (additionalContext) {
            sections.push(
                this.formatters.formatAdditionalContext(additionalContext),
            );
        }

        // Histórico de execução
        if (history && history.length > 0) {
            sections.push(this.formatExecutionHistory(history));
        }

        // Instruções finais
        sections.push(this.getTaskInstructions());

        return sections.join('\n\n');
    }

    /**
     * Instruções para execução de tarefa
     */
    private getTaskInstructions(): string {
        return `## 📋 REACT INSTRUCTIONS

**YOUR TURN:** Analyze the current situation and decide the next best action.

**REASONING PROCESS:**
1. What is the current state?
2. What information do I need?
3. Which tool would help most?
4. What parameters should I use?

**ACTION TYPES:**
- **tool_call**: Use a tool with specific parameters
- **final_answer**: Provide the final response

**WHEN TO STOP:**
- When you have all necessary information
- When the objective is clearly achieved
- When no more productive actions are available

**FORMAT YOUR RESPONSE:**
\`\`\`
Thought: [Your reasoning]
Action: [tool_name or final_answer]
Parameters: [JSON object if tool_call]
\`\`\``;
    }

    /**
     * Formata histórico de execução
     */
    private formatExecutionHistory(
        history: Array<{
            type: string;
            thought?: { reasoning: string; action: any };
            action?: any;
            result?: any;
        }>,
    ): string {
        const sections: string[] = ['## 📋 EXECUTION HISTORY'];

        history.forEach((step, index) => {
            sections.push(`**Step ${index + 1}:** ${step.type.toUpperCase()}`);

            if (step.thought) {
                sections.push(`- **Thought:** ${step.thought.reasoning}`);
                if (step.thought.action) {
                    sections.push(
                        `- **Action:** ${step.thought.action.type || 'Unknown'}`,
                    );
                }
            }

            if (step.action) {
                sections.push(`- **Action:** ${step.action.type || 'Unknown'}`);
            }

            if (step.result) {
                const resultStr =
                    typeof step.result.content === 'string'
                        ? step.result.content
                        : JSON.stringify(step.result.content);
                sections.push(
                    `- **Result:** ${this.truncateText(resultStr, 200)}`,
                );
            }
        });

        return sections.join('\n');
    }

    /**
     * Trunca texto para exibição
     */
    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
}

// =============================================================================
// 🎯 PROMPT FACTORY
// =============================================================================

/**
 * Factory para criar prompts por estratégia
 */
export class StrategyPromptFactory {
    private readonly formatters: StrategyFormatters;
    private readonly rewooPrompts: ReWooPrompts;
    private readonly reactPrompts: ReActPrompts;

    constructor(formatters?: StrategyFormatters) {
        this.formatters = formatters || new StrategyFormatters();
        this.rewooPrompts = new ReWooPrompts(this.formatters);
        this.reactPrompts = new ReActPrompts(this.formatters);
    }

    /**
     * Cria prompt completo para ReWoo
     */
    createReWooPrompt(context: {
        goal: string;
        tools: Tool[];
        agentContext: AgentContext;
        additionalContext?: Record<string, unknown>;
        replanContext?: Record<string, unknown>;
        evidences?: RewooEvidenceItem[];
        mode?: 'planner' | 'executor' | 'organizer';
        step?: any;
    }): { systemPrompt: string; userPrompt: string } {
        const { mode = 'planner' } = context;

        switch (mode) {
            case 'planner':
                return {
                    systemPrompt: this.rewooPrompts.getPlannerSystemPrompt(),
                    userPrompt: this.rewooPrompts.getPlannerUserPrompt(
                        context.goal,
                        context.tools,
                        {
                            agentContext: context.agentContext,
                            additionalContext: context.additionalContext,
                            replanContext: context.replanContext,
                        },
                    ),
                };

            case 'executor':
                if (!context.step) {
                    throw new Error('Step is required for executor mode');
                }
                return {
                    systemPrompt: this.rewooPrompts.getExecutorSystemPrompt(),
                    userPrompt: this.rewooPrompts.getExecutorUserPrompt(
                        context.step,
                        {
                            agentContext: context.agentContext,
                            additionalContext: context.additionalContext,
                        },
                    ),
                };

            case 'organizer':
                if (!context.evidences) {
                    throw new Error(
                        'Evidences are required for organizer mode',
                    );
                }
                return {
                    systemPrompt: this.rewooPrompts.getOrganizerSystemPrompt(),
                    userPrompt: this.rewooPrompts.getOrganizerUserPrompt(
                        context.goal,
                        context.evidences,
                    ),
                };

            default:
                throw new Error(`Unknown ReWoo mode: ${mode}`);
        }
    }

    /**
     * Cria prompt completo para ReAct
     */
    createReActPrompt(context: {
        input: string;
        tools: Tool[];
        agentContext: AgentContext;
        history?: Array<{
            type: string;
            thought?: { reasoning: string; action: any };
            action?: any;
            result?: any;
        }>;
        additionalContext?: Record<string, unknown>;
    }): { systemPrompt: string; userPrompt: string } {
        return {
            systemPrompt: this.reactPrompts.getSystemPrompt(),
            userPrompt: this.reactPrompts.getTaskPrompt(
                context.input,
                context.tools,
                context.agentContext,
                context.history,
                context.additionalContext,
            ),
        };
    }

    /**
     * Cria prompt baseado na estratégia automaticamente
     */
    createPrompt(
        strategy: 'react' | 'rewoo',
        context: any,
    ): { systemPrompt: string; userPrompt: string } {
        if (strategy === 'react') {
            return this.createReActPrompt(context);
        } else if (strategy === 'rewoo') {
            return this.createReWooPrompt(context);
        } else {
            throw new Error(`Unknown strategy: ${strategy}`);
        }
    }

    // === GETTERS ===
    get rewoo(): ReWooPrompts {
        return this.rewooPrompts;
    }

    get react(): ReActPrompts {
        return this.reactPrompts;
    }

    get formatter(): StrategyFormatters {
        return this.formatters;
    }
}

// =============================================================================
// 🎯 EXPORTS PRINCIPAIS
// =============================================================================

// Classes already exported individually above
// Export default
export default StrategyPromptFactory;
