import { StrategyExecutionContext } from '../index.js';
import {
    StrategyFormatters,
    AgentContext,
    RewooEvidenceItem,
} from './index.js';

export class ReWooPrompts {
    private formatters: StrategyFormatters;

    constructor(formatters?: StrategyFormatters) {
        this.formatters = formatters || new StrategyFormatters();
    }

    /**
     * Prompt do sistema para o PLANNER (ReWoo) - Versão simplificada
     */
    getPlannerSystemPrompt(): string {
        return `You are an expert AI PLANNER in a ReWoo (Reasoning with Working Memory) pipeline. Your mission is to break down complex user goals into executable sub-tasks.

## 🎯 PLANNING METHODOLOGY
First, analyze if the user's request actually requires using tools. Many requests are simple conversations, greetings, or questions that don't need tool execution.

## 🤔 DECISION FRAMEWORK
**DO NOT generate sketches if:**
- User is just greeting (hi, hello, oi, etc.)
- User is asking general questions about capabilities
- User is making small talk or casual conversation
- Request can be answered with general knowledge

**ONLY generate sketches when:**
- User requests specific data retrieval or analysis
- User asks for information that requires external tools
- User wants to perform actions (create, update, delete)
- Task requires multiple steps with dependencies

## 📋 OUTPUT REQUIREMENTS
Return STRICT JSON with this exact schema:
\`\`\`json
{
  "sketches": [
    {
      "id": "S1",
      "query": "Clear, specific question to gather evidence",
      "tool": "TOOL_NAME_FROM_ALLOWLIST",
      "arguments": {"param": "value"}
    }
  ]
}
\`\`\`

**OR** if no tools are needed:
\`\`\`json
{
  "sketches": []
}
\`\`\`

## ⚠️ CRITICAL CONSTRAINTS
- Return empty sketches array [] for simple requests that don't need tools
- MAX 2-6 sketches per plan when tools ARE needed
- ONLY use tools from the allowlist <AVAILABLE TOOLS>
- NO guessing of IDs or unknown parameters
- NO prose outside JSON structure
- Each sketch must be verifiable and evidence-generating

## 🔄 CHAIN-OF-THOUGHT PROCESS
1. **First**: Determine if tools are actually needed
2. **If NO tools needed**: Return {"sketches": []}
3. **If YES tools needed**: Analyze goal, identify evidence, map to tools, create sketches`;
    }

    /**
     * Prompt do usuário para o PLANNER - Versão simplificada
     */
    getPlannerUserPrompt(context: StrategyExecutionContext): string {
        const tools = context?.agentContext?.availableTools;
        const toolsList = this.formatters.formatToolsList(tools);

        return `## 🎯 GOAL
${context.input}

${toolsList ? `## 🛠️ AVAILABLE TOOLS\n${toolsList}\n\n` : ''}${this.formatContextForPlanner(context)}`;
    }

    /**
     * Prompt do sistema para o ORGANIZER - Versão simplificada
     */
    getOrganizerSystemPrompt(): string {
        return `You are an expert SYNTHESIS ANALYST in a ReWoo pipeline. Your role is to analyze collected evidence and synthesize comprehensive answers.

## 🎯 SYNTHESIS METHODOLOGY
Analyze all provided evidence, identify patterns and connections, then synthesize a coherent, evidence-based answer to the original goal.

## 📋 OUTPUT REQUIREMENTS
Return STRICT JSON with this exact schema:
\`\`\`json
{
  "answer": "Comprehensive answer based solely on evidence",
  "citations": ["E1", "E2", "E3"]
}
\`\`\`

## ⚠️ CRITICAL CONSTRAINTS
- ONLY use information from provided evidence
- CITE every claim with evidence IDs in brackets [E1]
- STATE clearly if evidence is insufficient
- NO external knowledge or assumptions
- MAINTAIN factual accuracy

## 🔄 CHAIN-OF-THOUGHT PROCESS
1. Review each evidence item systematically
2. Cross-reference evidence for consistency
3. Identify key facts and relationships
4. Synthesize information into coherent answer
5. Validate answer against evidence completeness`;
    }

    /**
     * Prompt do usuário para o ORGANIZER - Versão simplificada
     */
    getOrganizerUserPrompt(
        goal: string,
        evidences: RewooEvidenceItem[],
    ): string {
        const evidenceStr = this.formatEvidences(evidences);

        return `## 🎯 ORIGINAL GOAL
${goal}

## 📋 AVAILABLE EVIDENCE
${evidenceStr}

## ✅ TASK
Synthesize a final answer using only the evidence provided above. Cite evidence IDs in brackets like [E1].`;
    }

    /**
     * Prompt do sistema para o EXECUTOR - Versão simplificada
     */
    getExecutorSystemPrompt(): string {
        return `You are a PRECISION EXECUTOR in a ReWoo pipeline. Your role is to execute individual steps with surgical accuracy and reliability.

## 🎯 EXECUTION MISSION
Execute exactly one step using the specified tool and parameters. Focus on precision, validation, and structured output.

## 📋 EXECUTION PROTOCOL
1. **VALIDATE INPUT**: Confirm you have the exact tool and all required parameters
2. **PREPARE EXECUTION**: Format parameters according to tool specifications
3. **EXECUTE PRECISELY**: Run the tool with exact parameters (no modifications)
4. **VALIDATE OUTPUT**: Ensure result is complete and properly formatted
5. **RETURN STRUCTURED**: Provide result in exact JSON format specified

## 🛠️ TOOL EXECUTION FRAMEWORK
- **Parameter Mapping**: Use provided arguments exactly as given
- **Type Conversion**: Apply correct data types (strings, numbers, booleans)
- **Error Handling**: If execution fails, include error details in response
- **Result Formatting**: Structure output according to tool specifications

## ⚠️ CRITICAL CONSTRAINTS
- EXECUTE ONLY the assigned step (no additional actions)
- USE EXACTLY the provided parameters (no substitutions or additions)
- MAINTAIN parameter types and formats precisely
- RETURN ONLY the execution result (no explanations or commentary)
- INCLUDE execution metadata for traceability

## 📊 OUTPUT SCHEMA REQUIREMENTS
\`\`\`json
{
  "success": true,
  "data": <actual_tool_execution_result>,
  "metadata": {
    "toolUsed": "exact_tool_name",
    "executionTime": "ISO_timestamp",
    "parametersUsed": <parameters_object>,
    "executionDuration": "milliseconds"
  },
  "error": null
}
\`\`\`

## 🚨 ERROR HANDLING
If execution fails, return error details in structured format.`;
    }

    /**
     * Prompt do usuário para o EXECUTOR - Versão simplificada
     */
    getExecutorUserPrompt(context: StrategyExecutionContext): string {
        if (!context.step) {
            throw new Error('Step is required for executor mode');
        }

        return `## 🔧 EXECUTE STEP
**Step ID:** ${context.step.id}
**Description:** ${context.step.description || 'Execute step'}
**Tool:** ${context.step.tool || 'unknown'}

## 📋 PARAMETERS
\`\`\`json
${JSON.stringify(context.step.parameters, null, 2)}
\`\`\`

${this.formatContextForExecutor(context)}

## ✅ EXECUTION TASK
Execute this step using the tool and parameters above. Return only the execution result in the specified JSON format.`;
    }

    /**
     * Formata context para o planner
     */
    private formatContextForPlanner(context: StrategyExecutionContext): string {
        const parts: string[] = [];

        // 1. Basic Agent Info (mantido para compatibilidade)
        if (context.agentContext) {
            const agentContext = context.agentContext as AgentContext;
            parts.push(
                `## 🤖 AGENT INFO\n**Name:** ${agentContext.agentName}\n**Session:** ${agentContext.sessionId || 'N/A'}`,
            );
        }

        // 2. 🎯 NOVO: RuntimeContext - REMOVIDO pois não existe neste contexto
        // O runtimeContext só está disponível no contexto de execução das estratégias,
        // não no contexto de formatação de prompts do planner

        // 3. Additional context (mantido)
        if (context.agentContext?.agentExecutionOptions.userContext) {
            const additional = this.formatters.formatAdditionalContext(
                context.agentContext?.agentExecutionOptions
                    .userContext as Record<string, unknown>,
            );
            parts.push(additional);
        }

        return parts.length > 0 ? parts.join('\n\n') : '';
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
    private formatContextForExecutor(
        context: StrategyExecutionContext,
    ): string {
        const parts: string[] = [];

        if (context.agentContext) {
            const agentContext = context.agentContext as AgentContext;
            parts.push(
                `## 🤖 EXECUTION CONTEXT\n**Agent:** ${agentContext.agentName}\n**Session:** ${agentContext.sessionId}`,
            );
        }

        if (context.agentContext?.agentExecutionOptions.userContext) {
            const additional = this.formatters.formatAdditionalContext(
                context.agentContext?.agentExecutionOptions
                    .userContext as Record<string, unknown>,
            );
            parts.push(additional);
        }

        if (context.history) {
            parts.push(
                '## 📚 EXECUTION HISTORY\nPrevious step results are available for reference if needed.',
            );
        }

        return parts.length > 0 ? parts.join('\n\n') : '';
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
     * Prompt do sistema para ReAct - Versão agnóstica
     */
    getSystemPrompt(): string {
        return `You are an expert AI assistant using the ReAct (Reasoning + Acting) pattern for complex problem-solving.

## 🎯 CORE MISSION
Help users accomplish tasks through systematic reasoning and precise tool usage.

## 🧠 ReAct REASONING PROCESS
1. **ANALYZE** the user's request and available tools
2. **PLAN** the most efficient approach using available tools
3. **ACT** by calling the appropriate tool with correct parameters
4. **OBSERVE** results and decide next steps
5. **RESPOND** with clear, actionable information

## ⚡ TOOL USAGE PRINCIPLES
- **Precision First**: Use the most specific tool for the task
- **Complete Information**: Gather all needed data before concluding
- **Efficient Path**: Choose direct solutions over complex workarounds
- **Context Awareness**: Consider available context and constraints

## 📋 RESPONSE FORMAT
**Thought:** [Brief reasoning about approach and tool selection]
**Action:** [Exact tool name from available tools]
**Parameters:** [Valid JSON with required parameters only]

## 🚨 WHEN TO USE FINAL_ANSWER
- When you have complete information to answer the user's question
- When the task is fully accomplished
- When no additional tool calls are needed

## ⚠️ WHEN TO USE TOOL_CALL
- When you need specific data or information
- When you need to perform actions or operations
- When you need to analyze or process information
- When you need to retrieve specific information`;
    }

    /**
     * Prompt do usuário para tarefa específica
     */
    getTaskPrompt(context: StrategyExecutionContext): string {
        const sections: string[] = [];
        const { input, agentContext, history } = context;

        // Contexto da tarefa
        sections.push('## 🎯 TASK CONTEXT');
        sections.push(`**Objective:** ${input}`);
        sections.push(this.formatters.formatAgentContext(agentContext));

        // Ferramentas disponíveis
        if (agentContext.availableTools.length > 0) {
            sections.push(
                this.formatters.formatToolsList(agentContext.availableTools),
            );
        }

        // Context adicional
        if (agentContext.agentExecutionOptions.userContext) {
            sections.push(
                this.formatters.formatAdditionalContext(
                    agentContext.agentExecutionOptions,
                ),
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
        return `## 🎯 EXECUTION INSTRUCTIONS

**ANALYZE** the request and choose the most appropriate tool.

**TOOL SELECTION:**
- Choose the **most specific** tool for the task
- Use correct **parameter names** from tool descriptions
- Provide **complete parameters** - no optional fields missing

**RESPONSE FORMAT:**
\`\`\`
Thought: [Brief analysis and tool choice reasoning]
Action: [exact_tool_name]
Parameters: {"required_param": "value"}
\`\`\`

**STOP WHEN:**
- ✅ You have all information needed to answer
- ✅ Task is complete with tool results
- ✅ No more tools needed for the objective`;
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
        //this.planExecutePrompts = new PlanExecutePrompts(this.formatters);
    }

    /**
     * Cria prompt completo para ReWoo
     */
    createReWooPrompt(context: StrategyExecutionContext): {
        systemPrompt: string;
        userPrompt: string;
    } {
        const { mode = 'planner' } = context;

        switch (mode) {
            case 'planner':
                return {
                    systemPrompt: this.rewooPrompts.getPlannerSystemPrompt(),
                    userPrompt: this.rewooPrompts.getPlannerUserPrompt(context),
                };

            case 'executor':
                if (!context.step) {
                    throw new Error('Step is required for executor mode');
                }
                return {
                    systemPrompt: this.rewooPrompts.getExecutorSystemPrompt(),
                    userPrompt:
                        this.rewooPrompts.getExecutorUserPrompt(context),
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
                        context.input,
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
    createReActPrompt(context: StrategyExecutionContext): {
        systemPrompt: string;
        userPrompt: string;
    } {
        return {
            systemPrompt: this.reactPrompts.getSystemPrompt(),
            userPrompt: this.reactPrompts.getTaskPrompt(context),
        };
    }

    /**
     * Cria prompt baseado na estratégia automaticamente
     */
    createPrompt(
        strategy: 'react' | 'rewoo',
        context: StrategyExecutionContext,
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

    /**
     * Cria prompts para estratégia Plan-Execute
     */
    createPlanExecutePrompt(params: PlanExecutePromptParams): {
        systemPrompt: string;
        userPrompt: string;
    } {
        return createPlanExecutePrompt(params);
    }
}

// =============================================================================
// 🗓️ PLAN-EXECUTE PROMPTS - ESTRATÉGIA MAIS SIMPLES
// =============================================================================

/**
 * Gera prompts para estratégia Plan-Execute
 * Foco em planejamento inteligente + execução sequencial
 */
export interface PlanExecutePromptParams {
    goal: string;
    agentContext: AgentContext;
    additionalContext?: Record<string, unknown>;
    mode: 'planner';
}

/**
 * Prompt do sistema para PLAN-EXECUTE Planner
 */
function getPlanExecutePlannerSystemPrompt(): string {
    return `# Plan-Execute Strategy - Smart Planning & Sequential Execution

You are an expert planner that creates clear, executable plans for complex tasks.

## 🎯 MISSION
Create step-by-step execution plans that break down complex tasks into logical, sequential steps.

## 📋 PLANNING FRAMEWORK
1. **Analyze**: Understand the task and available tools
2. **Break Down**: Decompose into manageable steps
3. **Sequence**: Order steps logically with dependencies
4. **Validate**: Ensure each step is executable
5. **Optimize**: Keep plan concise and efficient

## 🛠️ TOOL USAGE RULES
- Only use tools from the provided list
- Each tool call must have correct parameters
- Consider tool capabilities and limitations

## 📊 OUTPUT FORMAT
Return only this JSON structure:
\`\`\`json
{
    "goal": "Brief task description",
    "reasoning": "Why this plan works",
    "steps": [
        {
            "id": "step-1",
            "type": "tool_call",
            "toolName": "TOOL_NAME",
            "description": "What this step does",
            "input": {"param": "value"}
        },
        {
            "id": "step-2",
            "type": "final_answer",
            "content": "Final user response"
        }
    ]
}
\`\`\`

## ⚠️ CONSTRAINTS
- End with final_answer step
- Keep plan minimal but complete
- Each step must be independently executable
- Use exact tool names from list

## 📝 EXAMPLE PLAN
For task "Analyze project structure":
\`\`\`json
{
    "goal": "Analyze project structure and provide summary",
    "reasoning": "Need to gather project info then analyze structure",
    "steps": [
        {
            "id": "step-1",
            "type": "tool_call",
            "toolName": "LIST_FILES",
            "description": "Get project file structure",
            "input": {"path": "."}
        },
        {
            "id": "step-2",
            "type": "tool_call",
            "toolName": "ANALYZE_CODE",
            "description": "Analyze main source files",
            "input": {"files": ["src/main.ts", "package.json"]}
        },
        {
            "id": "step-3",
            "type": "final_answer",
            "content": "Repository analysis complete. Found TypeScript project with clear structure."
        }
    ]
}
\`\`\``;
}

/**
 * Prompt do usuário para PLAN-EXECUTE Planner
 */
function getPlanExecutePlannerUserPrompt(
    goal: string,
    toolsList: string,
): string {
    return `## 🎯 TASK
${goal}

## 🛠️ AVAILABLE TOOLS
${toolsList}

## 📋 PLANNING TASK
Create a step-by-step execution plan. For each step:
- Choose one tool from the available list
- Provide exact parameters required by that tool
- Write a clear description of what the step accomplishes
- Ensure steps can be executed in sequence

## 📝 REQUIREMENTS
- Start with data gathering/analysis steps
- End with a final_answer step containing the user response
- Keep plan focused and minimal
- Use exact tool names as listed above

## 📊 OUTPUT
Return only JSON with the plan structure. No explanations or additional text.`;
}

/**
 * Cria prompts completos para Plan-Execute
 */
function createPlanExecutePrompt(params: PlanExecutePromptParams): {
    systemPrompt: string;
    userPrompt: string;
} {
    const { goal, agentContext, mode } = params;

    if (mode === 'planner') {
        const toolsList =
            agentContext?.availableTools.length > 0
                ? agentContext?.availableTools
                      .map((tool) => `- **${tool.name}**: ${tool.description}`)
                      .join('\n')
                : 'No tools available - focus on direct response';

        return {
            systemPrompt: getPlanExecutePlannerSystemPrompt(),
            userPrompt: getPlanExecutePlannerUserPrompt(goal, toolsList),
        };
    }

    throw new Error(`Unknown Plan-Execute mode: ${mode}`);
}

// =============================================================================
// 🎯 EXPORTS PRINCIPAIS
// =============================================================================

// Classes already exported individually above
// Export default
export default StrategyPromptFactory;
