import type {
    StrategyExecutionContext,
    ExecutionStep,
    AgentAction,
    ActionResult,
    ResultAnalysis,
    AgentThought,
    Tool,
    ExecutionPlan,
} from './types.js';

// Métodos compartilhados entre estratégias
export class SharedStrategyMethods {
    // === LLM METHODS (compartilhados) ===

    /**
     * Chama LLM (placeholder - integrar com agent-core.ts)
     * TODO: Integrar com LLM adapter do agent-core.ts
     */
    static async callLLM(
        prompt: string,
        _context: StrategyExecutionContext,
    ): Promise<any> {
        // TODO: Integrar com LLM adapter do agent-core.ts
        // Por enquanto, retorna resposta simulada baseada no tipo de prompt

        if (prompt.includes('próxima ação') || prompt.includes('next action')) {
            return {
                reasoning:
                    'Analyzing the request and determining next action...',
                action: { type: 'final_answer', content: 'Response generated' },
                confidence: 0.9,
            };
        } else if (prompt.includes('plano estratégico')) {
            return {
                plan: 'Strategic plan for task execution',
                reasoning: 'Breaking down complex task into manageable steps',
            };
        } else if (prompt.includes('Sintetize')) {
            return {
                synthesis: 'Comprehensive response based on executed steps',
            };
        } else {
            return {
                content: 'LLM response generated',
                reasoning: 'Processing request...',
            };
        }
    }

    /**
     * Gera thought baseado no contexto
     */
    static async generateThought(
        context: StrategyExecutionContext,
        stepIndex: number,
    ): Promise<AgentThought> {
        const prompt = `
            Contexto atual:
            - Input: ${context.input}
            - Tools disponíveis: ${context.tools.map((t) => t.name).join(', ')}
            - Step: ${stepIndex + 1}

            Baseado neste contexto, qual é a próxima ação?
        `;

        const response = await this.callLLM(prompt, context);

        return {
            reasoning: response.reasoning || 'Thinking about next action...',
            action: response.action || {
                type: 'final_answer',
                content: 'No action needed',
            },
        };
    }

    // === TOOL EXECUTION METHODS (compartilhados) ===

    /**
     * Executa tool (placeholder - integrar com agent-core.ts)
     * TODO: Integrar com tool engine do agent-core.ts
     */
    static async executeTool(
        action: AgentAction,
        _context: StrategyExecutionContext,
    ): Promise<unknown> {
        // TODO: Integrar com tool engine do agent-core.ts
        if (action.type !== 'tool_call') {
            throw new Error('Action is not a tool call');
        }

        // Simula execução de tool
        return {
            toolName: action.toolName,
            result: `Executed ${action.toolName} with input: ${JSON.stringify(action.input)}`,
        };
    }

    /**
     * Executa ação (think/act/observe comum)
     */
    static async executeAction(
        action: AgentAction,
        context: StrategyExecutionContext,
    ): Promise<ActionResult> {
        if (action.type === 'tool_call') {
            const toolResult = await this.executeTool(action, context);
            return {
                type: 'tool_result',
                content: toolResult,
                metadata: {
                    toolName: action.toolName,
                    arguments: action.input,
                    executionTime: Date.now(),
                },
            };
        } else if (action.type === 'final_answer') {
            return {
                type: 'final_answer',
                content: action.content,
            };
        } else {
            throw new Error(`Unknown action type: ${action.type}`);
        }
    }

    // === OBSERVATION METHODS (compartilhados) ===

    /**
     * Analisa resultado (lógica comum de observe)
     */
    static async analyzeResult(
        result: ActionResult,
        context: StrategyExecutionContext,
    ): Promise<ResultAnalysis> {
        if (result.type === 'final_answer') {
            return {
                isComplete: true,
                isSuccessful: true,
                shouldContinue: false,
                feedback: result.content as string,
                metadata: {
                    reasoning: 'Final answer provided',
                },
            };
        } else if (result.type === 'tool_result') {
            // Analisa se precisa continuar ou parar
            const shouldContinue = this.shouldContinueAfterTool(
                result,
                context,
            );
            return {
                isComplete: !shouldContinue,
                isSuccessful: true,
                shouldContinue,
                feedback: shouldContinue
                    ? 'Tool executed, continuing...'
                    : 'Task completed',
                metadata: {
                    reasoning: shouldContinue
                        ? 'More actions needed'
                        : 'Task complete',
                },
            };
        } else {
            return {
                isComplete: false,
                isSuccessful: false,
                shouldContinue: false,
                feedback: 'Error occurred',
                metadata: {
                    reasoning: 'Error in execution',
                },
            };
        }
    }

    /**
     * Decide se continua após tool
     */
    static shouldContinueAfterTool(
        result: ActionResult,
        _context: StrategyExecutionContext,
    ): boolean {
        // Lógica simples: continua se não é final_answer
        return result.type !== 'final_answer';
    }

    // === OUTPUT EXTRACTION METHODS (compartilhados) ===

    /**
     * Extrai resultado final dos steps (lógica comum)
     */
    static extractFinalOutput(steps: ExecutionStep[]): unknown {
        // Procura por step de observe com isComplete = true
        const finalObserveStep = steps
            .filter((s) => s.type === 'observe')
            .find((s) => s.observation?.isComplete === true);

        if (finalObserveStep?.observation?.feedback) {
            return finalObserveStep.observation.feedback;
        }

        // Fallback: último resultado de tool ou resposta padrão
        const lastToolResult = steps
            .filter((s) => s.type === 'act' && s.result?.type === 'tool_result')
            .pop();

        if (lastToolResult?.result?.content) {
            return lastToolResult.result.content;
        }

        return 'Task completed';
    }

    /**
     * Extrai resultado de síntese (para ReWoo)
     */
    static async extractSynthesisOutput(
        steps: ExecutionStep[],
        context: StrategyExecutionContext,
    ): Promise<{ output: unknown }> {
        const executionSteps = steps.filter((s) => s.type === 'execute');
        const successfulSteps = executionSteps.filter(
            (s) => !s.metadata?.error,
        );

        const prompt = `
            Input original: ${context.input}
            Steps executados: ${successfulSteps.length}/${executionSteps.length}

            Resultados dos steps:
            ${successfulSteps.map((s) => `- ${(s.metadata?.planStep as any)?.name || 'Unknown step'}: ${JSON.stringify(s.metadata?.result)}`).join('\n')}

            Sintetize uma resposta final inteligente para o usuário.
        `;

        const response = await this.callLLM(prompt, context);

        return {
            output: response.synthesis || 'Task completed successfully',
        };
    }

    // === PLAN METHODS (compartilhados para ReWoo) ===

    /**
     * Cria plano estratégico (placeholder - integrar com planning/)
     */
    static async createPlan(
        context: StrategyExecutionContext,
    ): Promise<ExecutionPlan> {
        // TODO: Integrar com PlannerHandler do planning/
        const prompt = `
            Input: ${context.input}
            Tools: ${context.tools.map((t) => `${t.name}: ${t.description}`).join('\n')}

            Crie um plano estratégico para resolver esta tarefa.
        `;

        const response = await this.callLLM(prompt, context);

        // Cria plano baseado na resposta
        return {
            id: `plan-${Date.now()}`,
            goal: context.input,
            strategy: 'rewoo',
            steps: this.parsePlanSteps(response.plan, context),
            reasoning: response.reasoning,
            status: 'created',
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    /**
     * Parseia steps do plano
     */
    static parsePlanSteps(
        _planResponse: any,
        context: StrategyExecutionContext,
    ): any[] {
        // TODO: Implementar parsing inteligente da resposta do LLM
        // Por enquanto, cria steps básicos
        return [
            {
                id: 'step-1',
                name: 'Analyze input',
                type: 'llm_call',
                prompt: `Analyze the following input: ${context.input}`,
            },
            {
                id: 'step-2',
                name: 'Execute tools',
                type: 'tool_call',
                toolName: context.tools[0]?.name || 'default_tool',
                input: { query: context.input },
            },
            {
                id: 'step-3',
                name: 'Synthesize results',
                type: 'llm_call',
                prompt: 'Synthesize the results into a final response',
            },
        ];
    }

    /**
     * Executa ação do step do plano
     */
    static async executePlanStepAction(
        planStep: any,
        _context: StrategyExecutionContext,
    ): Promise<unknown> {
        // TODO: Integrar com tool engine do agent-core.ts
        if (planStep.type === 'tool_call') {
            return {
                toolName: planStep.toolName,
                result: `Executed ${planStep.toolName} with input: ${JSON.stringify(planStep.input)}`,
            };
        } else if (planStep.type === 'llm_call') {
            return {
                type: 'llm_response',
                content: `Generated response for: ${planStep.prompt}`,
            };
        } else {
            return {
                type: 'unknown',
                content: `Executed step: ${planStep.name}`,
            };
        }
    }

    // === UTILITY METHODS (compartilhados) ===

    /**
     * Cria step com timestamp
     */
    static createStep(
        type: ExecutionStep['type'],
        data: Partial<ExecutionStep> = {},
    ): ExecutionStep {
        return {
            id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type,
            timestamp: Date.now(),
            ...data,
        };
    }

    /**
     * Calcula complexidade (heurísticas comuns)
     */
    static calculateComplexity(input: string, tools: Tool[]): number {
        const toolCount = tools.length;
        const inputLength = input.length;
        const hasComplexKeywords =
            /analyze|create|generate|build|integrate|workflow|plan/i.test(
                input,
            );
        const hasMultipleActions = /and|then|after|before|while|until/i.test(
            input,
        );

        let complexity = 0;

        // Base complexity
        complexity += toolCount;

        // Input complexity
        if (inputLength > 100) complexity += 1;
        if (inputLength > 500) complexity += 2;

        // Keyword complexity
        if (hasComplexKeywords) complexity += 2;
        if (hasMultipleActions) complexity += 1;

        return complexity;
    }
}
