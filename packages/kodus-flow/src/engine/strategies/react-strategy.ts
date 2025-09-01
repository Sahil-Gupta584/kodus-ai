import { LLMAdapter, AgentInputEnum } from '../../core/types/allTypes.js';
import { createLogger } from '../../observability/index.js';
import { BaseExecutionStrategy } from './strategy-interface.js';
import { SharedStrategyMethods } from './shared-methods.js';
import type {
    StrategyExecutionContext,
    ExecutionResult,
    ExecutionStep,
    AgentAction,
    ActionResult,
    AgentThought,
    ResultAnalysis,
    Tool,
} from './types.js';
import { StrategyPromptFactory } from './prompts/index.js';

/**
 * ReAct Strategy - Reasoning + Acting
 *
 * ✅ REFACTORADO PARA NOVA ARQUITETURA DE PROMPTS
 *
 * Implementação otimizada com foco em:
 * - ✅ Integração com StrategyPromptFactory
 * - ✅ Prompts gerados dinamicamente
 * - ✅ Uso de formatadores da nova arquitetura
 * - ✅ Remoção de métodos simulados
 * - ✅ Baixa complexidade ciclomática
 * - ✅ Métodos pequenos e coesos
 * - ✅ Tratamento robusto de erros
 * - ✅ Logging consistente
 * - ✅ Separação clara de responsabilidades
 */
export class ReActStrategy extends BaseExecutionStrategy {
    private readonly logger = createLogger('react-strategy');
    private readonly promptFactory: StrategyPromptFactory;

    private readonly config: {
        maxIterations: number;
        maxToolCalls: number;
        maxExecutionTime: number;
        stepTimeout: number;
    };

    constructor(
        private llmAdapter: LLMAdapter,
        options: Partial<{
            llmAdapter: LLMAdapter;
            maxIterations: number;
            maxToolCalls: number;
            maxExecutionTime: number;
            stepTimeout: number;
        }> = {},
    ) {
        super(); // Call parent constructor

        // Initialize config with defaults and options
        const defaultConfig = {
            maxIterations: 10,
            maxToolCalls: 20,
            maxExecutionTime: 300000, // 5 minutos
            stepTimeout: 60000, // 1 minuto por step
        };

        // Inicializar prompt factory
        this.promptFactory = new StrategyPromptFactory();

        // console.log('options', this.llmAdapter); // Commented out for production

        this.config = { ...defaultConfig, ...options };

        this.logger.info('🎯 ReAct Strategy initialized', {
            config: this.config,
        });
    }

    /**
     * Método principal - executa o padrão ReAct completo
     */
    async execute(context: StrategyExecutionContext): Promise<ExecutionResult> {
        const startTime = Date.now();
        const steps: ExecutionStep[] = [];
        let iteration = 0;
        let toolCallsCount = 0;

        try {
            this.validateContext(context);

            // Loop principal ReAct: Think → Act → Observe
            while (iteration < this.config.maxIterations) {
                if (
                    this.shouldStop(iteration, toolCallsCount, startTime, steps)
                ) {
                    break;
                }

                const step = await this.executeIteration(
                    context,
                    iteration,
                    steps,
                );
                steps.push(step);

                if (step.action?.type === 'final_answer') {
                    break;
                }

                if (step.action?.type === 'tool_call') {
                    toolCallsCount++;
                }

                iteration++;
            }

            return this.buildSuccessResult(
                steps,
                startTime,
                iteration,
                toolCallsCount,
            );
        } catch (error) {
            return this.buildErrorResult(
                error,
                steps,
                startTime,
                iteration,
                toolCallsCount,
            );
        }
    }

    /**
     * Valida contexto de entrada
     */
    private validateContext(context: StrategyExecutionContext): void {
        if (!context.input?.trim()) {
            throw new Error('Input cannot be empty');
        }

        if (!Array.isArray(context.tools)) {
            throw new Error('Tools must be an array');
        }

        if (!context.agentContext) {
            throw new Error('Agent context is required');
        }
    }

    /**
     * Executa uma iteração completa do ReAct (Think → Act → Observe)
     */
    private async executeIteration(
        context: StrategyExecutionContext,
        iteration: number,
        previousSteps: ExecutionStep[],
    ): Promise<ExecutionStep> {
        const stepStartTime = Date.now();

        try {
            // 1. THINK: Gera pensamento baseado no contexto
            const thought = await this.generateThought(
                context,
                iteration,
                previousSteps,
            );

            // 2. ACT: Executa ação baseada no pensamento
            const actionResult = await this.executeAction(
                thought.action,
                context,
            );

            // 3. OBSERVE: Analisa resultado da ação
            const observation = await this.analyzeResult(actionResult);

            // Cria step consolidado
            const step: ExecutionStep = {
                id: `react-step-${iteration}-${Date.now()}`,
                type: 'think',
                type2: 'think' as any,
                status: 'pending',
                timestamp: stepStartTime,
                duration: Date.now() - stepStartTime,
                thought,
                action: thought.action,
                result: actionResult,
                observation,
                metadata: {
                    iteration,
                    strategy: 'react',
                    stepSequence: 'think-act-observe',
                },
            };

            this.logger.debug(`✅ Iteration ${iteration + 1} completed`, {
                actionType: thought.action.type,
                hasFinalAnswer: thought.action.type === 'final_answer',
                duration: step.duration,
            });

            return step;
        } catch (error) {
            this.logger.warn(`⚠️ Iteration ${iteration + 1} failed`, {
                error: error instanceof Error ? error.message : String(error),
            });

            // Retorna step de erro
            return {
                id: `react-step-error-${iteration}-${Date.now()}`,
                type: 'think',
                type2: 'think' as any,
                status: 'pending',
                timestamp: stepStartTime,
                duration: Date.now() - stepStartTime,
                metadata: {
                    iteration,
                    strategy: 'react',
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            };
        }
    }

    /**
     * Gera pensamento para a iteração atual
     */
    private async generateThought(
        context: StrategyExecutionContext,
        iteration: number,
        previousSteps: ExecutionStep[],
    ): Promise<AgentThought> {
        if (!this.llmAdapter.call) {
            throw new Error('LLM adapter must support call method');
        }

        // Usar nova arquitetura de prompts
        const prompts = this.promptFactory.createReActPrompt({
            input: context.input,
            tools: context.tools as any,
            agentContext: context.agentContext,
            history: previousSteps.map((step) => ({
                type: step.type || 'unknown',
                thought: step.thought
                    ? {
                          reasoning: step.thought.reasoning,
                          action: step.action,
                      }
                    : undefined,
                action: step.action,
                result: step.result,
            })),
            additionalContext:
                context.agentContext?.agentExecutionOptions?.userContext,
        });

        const response = await this.llmAdapter.call({
            messages: [
                { role: AgentInputEnum.SYSTEM, content: prompts.systemPrompt },
                { role: AgentInputEnum.USER, content: prompts.userPrompt },
            ],
            temperature: 0.3,
            maxTokens: 1000,
        });

        const content =
            typeof response.content === 'string'
                ? response.content
                : JSON.stringify(response.content);

        return this.parseLLMResponse(content, iteration);
    }

    /**
     * Executa ação baseada no tipo
     */
    private async executeAction(
        action: AgentAction,
        context: StrategyExecutionContext,
    ): Promise<ActionResult> {
        switch (action.type) {
            case 'tool_call':
                return await this.executeToolCall(action, context);

            case 'final_answer':
                return {
                    type: 'final_answer',
                    content: action.content,
                    metadata: {
                        timestamp: Date.now(),
                        source: 'react-strategy',
                    },
                };

            default:
                throw new Error(`Unknown action type: ${action.type}`);
        }
    }

    /**
     * Executa chamada de ferramenta
     */
    private async executeToolCall(
        action: AgentAction,
        context: StrategyExecutionContext,
    ): Promise<ActionResult> {
        if (action.type !== 'tool_call' || !action.toolName) {
            throw new Error('Invalid tool call action');
        }

        const tool = this.findTool(context.tools, action.toolName);
        if (!tool) {
            throw new Error(`Tool not found: ${action.toolName}`);
        }

        const result = await this.executeRealTool(action, tool, context);

        return {
            type: 'tool_result',
            content: result,
            metadata: {
                toolName: action.toolName,
                arguments: action.input,
                executionTime: Date.now(),
            },
        };
    }

    /**
     * Analisa resultado da ação
     */
    private async analyzeResult(result: ActionResult): Promise<ResultAnalysis> {
        return {
            isComplete: result.type === 'final_answer',
            isSuccessful: result.type !== 'error',
            shouldContinue: result.type === 'tool_result',
            feedback: this.generateFeedback(result),
            metadata: {
                resultType: result.type,
                timestamp: Date.now(),
            },
        };
    }

    /**
     * Verifica se deve parar execução
     */
    private shouldStop(
        _iteration: number,
        toolCallsCount: number,
        startTime: number,
        steps: ExecutionStep[],
    ): boolean {
        // Timeout
        if (Date.now() - startTime > this.config.maxExecutionTime) {
            this.logger.info('🛑 Stopping: Max execution time reached');
            return true;
        }

        // Max tool calls
        if (toolCallsCount >= this.config.maxToolCalls) {
            this.logger.info('🛑 Stopping: Max tool calls reached');
            return true;
        }

        // Último step teve resposta final
        const lastStep = steps[steps.length - 1];
        if (lastStep?.action?.type === 'final_answer') {
            this.logger.info('🛑 Stopping: Final answer found');
            return true;
        }

        return false;
    }

    /**
     * Encontra ferramenta por nome
     */
    private findTool(tools: Tool[], toolName: string): Tool | undefined {
        return tools.find((tool) => tool.name === toolName);
    }

    /**
     * Extrai resultado final da execução
     */
    private extractFinalResult(steps: ExecutionStep[]): unknown {
        // Procura pela última resposta final
        for (let i = steps.length - 1; i >= 0; i--) {
            const step = steps[i];
            if (step?.action?.type === 'final_answer' && step.action.content) {
                return step.action.content;
            }
            if (step?.result?.type === 'final_answer' && step.result.content) {
                return step.result.content;
            }
        }

        // Fallback: último resultado de ferramenta
        for (let i = steps.length - 1; i >= 0; i--) {
            const step = steps[i];
            if (step?.result?.type === 'tool_result' && step.result.content) {
                return step.result.content;
            }
        }

        return 'No final result found';
    }

    // REMOVED: buildThinkPrompt - now using StrategyPromptFactory

    /**
     * Parse resposta do LLM com melhor tratamento de erro
     */
    private parseLLMResponse(content: string, iteration: number): AgentThought {
        try {
            // Tentar parse como JSON primeiro
            const parsed = JSON.parse(content);
            if (parsed.action && parsed.reasoning) {
                return {
                    reasoning: parsed.reasoning,
                    action: this.parseActionFromJSON(parsed.action),
                    metadata: {
                        iteration,
                        timestamp: Date.now(),
                    },
                };
            }
        } catch {
            // Fallback para parse de texto
        }

        // Parse de texto simples
        const lines = content.split('\n');
        let reasoning = '';
        let action: AgentAction = {
            type: 'final_answer',
            content: 'Unable to parse response',
        };

        for (const line of lines) {
            if (line.toLowerCase().startsWith('reasoning:')) {
                reasoning = line.substring(10).trim();
            } else if (line.toLowerCase().startsWith('action:')) {
                const actionText = line.substring(7).trim().toLowerCase();
                if (actionText.includes('final_answer')) {
                    action = {
                        type: 'final_answer',
                        content: reasoning,
                    };
                } else if (actionText.includes('tool_call')) {
                    action = {
                        type: 'tool_call',
                        toolName: 'unknown',
                        input: {},
                    };
                }
            }
        }

        return {
            reasoning: reasoning || 'Analysis completed',
            action,
            metadata: {
                iteration,
                timestamp: Date.now(),
            },
        };
    }

    /**
     * Parse ação do JSON da resposta do LLM
     */
    private parseActionFromJSON(actionData: any): AgentAction {
        if (actionData.type === 'final_answer') {
            return {
                type: 'final_answer',
                content: actionData.content || 'Analysis completed',
            };
        }

        if (actionData.type === 'tool_call') {
            return {
                type: 'tool_call',
                toolName: actionData.toolName || actionData.tool_name,
                input: actionData.input || actionData.parameters || {},
            };
        }

        // Fallback
        return {
            type: 'final_answer',
            content: 'Unable to determine action type',
        };
    }

    /**
     * Executa ferramenta real
     */
    private async executeRealTool(
        action: AgentAction,
        tool: Tool,
        context: StrategyExecutionContext,
    ): Promise<unknown> {
        this.logger.debug('🔧 Tool execution via SharedStrategyMethods', {
            toolName: tool.name,
            actionInput: action.input,
        });

        // 🔥 USAR SHARED METHODS PARA EXECUÇÃO REAL DE TOOLS
        return await SharedStrategyMethods.executeTool(action, context);
    }

    /**
     * Gera feedback baseado no resultado
     */
    private generateFeedback(result: ActionResult): string {
        switch (result.type) {
            case 'final_answer':
                return 'Resposta final fornecida com sucesso.';
            case 'tool_result':
                return 'Ferramenta executada, continuando análise.';
            case 'error':
                return `Erro ocorrido: ${result.error}`;
            default:
                return 'Resultado processado.';
        }
    }

    /**
     * Constrói resultado de sucesso
     */
    private buildSuccessResult(
        steps: ExecutionStep[],
        startTime: number,
        iterations: number,
        toolCallsCount: number,
    ): ExecutionResult {
        const finalResult = this.extractFinalResult(steps);
        const executionTime = Date.now() - startTime;

        this.logger.info('🎯 ReAct execution completed successfully', {
            steps: steps.length,
            iterations,
            toolCalls: toolCallsCount,
            executionTime,
        });

        return {
            output: finalResult,
            strategy: 'react',
            complexity: steps.length,
            executionTime,
            steps,
            success: true,
            metadata: {
                iterations,
                toolCallsCount,
                finalStepType: steps[steps.length - 1]?.action?.type,
            },
        };
    }

    /**
     * Constrói resultado de erro
     */
    private buildErrorResult(
        error: unknown,
        steps: ExecutionStep[],
        startTime: number,
        iterations: number,
        toolCallsCount: number,
    ): ExecutionResult {
        const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
        const executionTime = Date.now() - startTime;

        this.logger.error(
            '❌ ReAct execution failed',
            error instanceof Error ? error : undefined,
            {
                stepsCompleted: steps.length,
                iterations,
                toolCalls: toolCallsCount,
                executionTime,
            },
        );

        return {
            output: null,
            strategy: 'react',
            complexity: steps.length,
            executionTime,
            steps,
            success: false,
            error: errorMessage,
            metadata: {
                iterations,
                toolCallsCount,
                failureReason: errorMessage,
            },
        };
    }
}
