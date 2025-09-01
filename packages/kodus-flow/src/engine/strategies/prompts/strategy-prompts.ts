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

## 📊 PLANNING PRINCIPLES (only apply when tools ARE needed)
1. **Evidence-First**: Each sketch should gather specific evidence needed for the final answer
2. **Independence**: Sketches should be independent and executable in parallel when possible
3. **Minimal Arguments**: Use only parameters you can resolve from context or that are clearly defined
4. **Request Input**: If parameters cannot be resolved, use REQUEST_INPUT tool first

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
     * Prompt do usuário para o PLANNER
     */
    getPlannerUserPrompt(
        goal: string,
        tools: Tool[],
        context: Record<string, unknown>,
    ): string {
        const toolsList = this.formatters.formatToolsList(tools);
        const contextStr = this.formatContextForPlanner(context);

        return `## 🎯 GOAL
${goal}

${toolsList}

${contextStr}`;
    }

    /**
     * Prompt do sistema para o ORGANIZER
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

## 🔍 ANALYSIS FRAMEWORK
1. **Evidence Review**: Examine each evidence item for relevance and reliability
2. **Pattern Recognition**: Identify connections and relationships between evidence
3. **Gap Analysis**: Note any missing information or contradictory evidence
4. **Synthesis**: Combine evidence into coherent answer
5. **Validation**: Ensure answer is supported by citations

## 📊 QUALITY ASSESSMENT
Focus on providing comprehensive answers based on available evidence. When evidence is incomplete or contradictory, clearly state the limitations.

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
5. Validate answer against evidence completeness

## 📚 GENERIC SYNTHESIS EXAMPLES

**Goal:** "What is the current status of the marketing campaign?"
**Evidence:**
- [E1] Marketing campaign is in active phase
- [E2] Campaign reached 75% of target audience
- [E3] Expected completion date is next quarter
- [E4] No major issues reported

**Synthesis:**
\`\`\`json
{
  "answer": "The marketing campaign is currently active and has reached 75% of its target audience. The campaign is on track for completion in the next quarter with no major issues identified.",
  "citations": ["E1", "E2", "E3", "E4"]
}
\`\`\`

**Goal:** "Are there any pending tasks in the current sprint?"
**Evidence:**
- [E1] Current sprint has 5 pending tasks
- [E2] All high-priority tasks are completed
- [E3] Sprint ends in 3 days

**Synthesis:**
\`\`\`json
{
  "answer": "The current sprint has 5 pending tasks remaining. All high-priority tasks have been completed, and the sprint concludes in 3 days.",
  "citations": ["E1", "E2", "E3"]
}
\`\`\`

**Goal:** "How do our sales compare to last month?"
**Evidence:**
- [E1] This month: $45,000 in sales
- [E2] Last month: $38,000 in sales

**Synthesis (with analysis):**
\`\`\`json
{
  "answer": "Sales increased from $38,000 last month to $45,000 this month, representing a 18.4% growth. However, additional context about seasonal factors or team changes would provide more meaningful insights.",
  "citations": ["E1", "E2"]
}
\`\`\`

**Goal:** "What training programs are available?"
**Evidence:**
- [E1] Available programs: Leadership Development, Technical Skills, Communication
- [E2] Leadership program requires 3 months commitment
- [E3] Technical skills program has 15 seats available

**Synthesis (comprehensive):**
\`\`\`json
{
  "answer": "Three training programs are currently available: Leadership Development (3-month commitment), Technical Skills (15 seats available), and Communication training. All programs are open for enrollment.",
  "citations": ["E1", "E2", "E3"]
}
\`\`\``;
    }

    /**
     * Prompt do usuário para o ORGANIZER
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
     * Prompt do sistema para o EXECUTOR (opcional)
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

## 🔍 VALIDATION CHECKLIST
- ✅ Tool exists and is accessible
- ✅ All required parameters provided
- ✅ Parameter types match tool specifications
- ✅ Parameters are properly formatted
- ✅ Execution environment is ready
- ✅ Output format matches schema requirements

## 🚨 ERROR HANDLING
If execution fails, return:
\`\`\`json
{
  "success": false,
  "data": null,
  "metadata": {
    "toolUsed": "tool_name",
    "executionTime": "timestamp",
    "errorType": "VALIDATION|EXECUTION|NETWORK",
    "errorMessage": "Detailed error description"
  },
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": <additional_error_info>
  }
}
\`\`\``;
    }

    /**
     * Prompt do usuário para o EXECUTOR
     */
    getExecutorUserPrompt(step: any, context: Record<string, unknown>): string {
        const contextStr = this.formatContextForExecutor(context);

        return `## 🔧 EXECUTE STEP
**Step ID:** ${step.id}
**Description:** ${step.description}
**Tool:** ${step.tool}

## 📋 PARAMETERS
\`\`\`json
${JSON.stringify(step.parameters, null, 2)}
\`\`\`

${contextStr}

## ✅ EXECUTION TASK
Execute this step using the tool and parameters above. Return only the execution result in the specified JSON format.`;
    }

    /**
     * Formata context para o planner
     */
    private formatContextForPlanner(context: Record<string, unknown>): string {
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
        if (context.additionalContext) {
            const additional = this.formatters.formatAdditionalContext(
                context.additionalContext as Record<string, unknown>,
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
    private formatContextForExecutor(context: Record<string, unknown>): string {
        const parts: string[] = [];

        if (context.agentContext) {
            const agentContext = context.agentContext as AgentContext;
            parts.push(
                `## 🤖 EXECUTION CONTEXT\n**Agent:** ${agentContext.agentName}\n**Session:** ${agentContext.sessionId}`,
            );
        }

        if (context.additionalContext) {
            const additional = this.formatters.formatAdditionalContext(
                context.additionalContext as Record<string, unknown>,
            );
            parts.push(additional);
        }

        if (context.executionHistory) {
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
     * Prompt do sistema para ReAct
     */
    getSystemPrompt(): string {
        return `You are an expert AI assistant using the ReAct (Reasoning + Acting) pattern for complex problem-solving.

## 🎯 ReAct METHODOLOGY
Follow this structured reasoning process:
1. **OBSERVE**: Analyze current situation, user input, and available information
2. **THINK**: Reason step-by-step about the best approach to solve the problem
3. **PLAN**: Determine if you need more information or can proceed to solution
4. **ACT**: Execute the chosen action (tool call or final answer)
5. **EVALUATE**: Assess the action result and decide next steps
6. **ITERATE**: Continue the cycle until goal is achieved

## 🧠 REASONING FRAMEWORK
- **Situational Awareness**: Consider all available context and constraints
- **Goal Decomposition**: Break complex problems into manageable steps
- **Evidence-Based**: Use available tools and information strategically
- **Uncertainty Management**: Admit knowledge gaps and seek clarification when needed
- **Solution Validation**: Verify answers against requirements before concluding

## ⚖️ DECISION-MAKING PRINCIPLES
- **Tool Selection**: Choose most appropriate tool for current information needs
- **Efficiency**: Prefer direct solutions over complex multi-step approaches when possible
- **Completeness**: Gather all necessary information before final conclusions
- **Accuracy**: Cross-verify information from multiple sources when available
- **User-Centric**: Consider user context and preferences in decision-making

## 📋 RESPONSE STRUCTURE
**Thought:** [Detailed reasoning about current situation and next action]
**Action:** [Specific tool name or "final_answer"]
**Parameters:** [JSON object with required parameters for tool execution]

## 🚨 TERMINATION CONDITIONS
- **Success**: When you have sufficient information to provide a complete answer
- **Failure**: When you cannot proceed due to missing critical information
- **Clarification**: When user input is ambiguous or insufficient

## 📚 ADAPTIVE EXAMPLES
Based on available tools and context, adapt your reasoning patterns:

**Data Retrieval Pattern:**
Thought: Need to find specific information. I'll use search/get tools first, then analyze results.
Action: [appropriate_search_tool]
Parameters: [context-appropriate parameters]

**Analysis Pattern:**
Thought: Have data but need insights. Apply analysis tools to extract meaningful patterns.
Action: [appropriate_analysis_tool]
Parameters: [analysis-specific parameters]

**Input Request Pattern:**
Thought: Missing critical information to proceed. Request clarification from user.
Action: request_input
Parameters: [specific fields needed]

**Multi-Step Pattern:**
Thought: Complex task requiring multiple steps. Break down systematically.
Action: [first_step_tool]
Parameters: [first_step_parameters]`;
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
    tools: Tool[];
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
For task "Analyze GitHub repository structure":
\`\`\`json
{
    "goal": "Analyze repository structure and provide summary",
    "reasoning": "Need to gather repository info then analyze structure",
    "steps": [
        {
            "id": "step-1",
            "type": "tool_call",
            "toolName": "LIST_FILES",
            "description": "Get repository file structure",
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
    const { goal, tools, mode } = params;

    if (mode === 'planner') {
        const toolsList =
            tools.length > 0
                ? tools
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
