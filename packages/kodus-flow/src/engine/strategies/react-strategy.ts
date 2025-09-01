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
import { ContextService } from '../../core/contextNew/index.js';

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
     * Valida contexto de entrada com melhor robustez
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

        // Validações adicionais para melhor robustez
        if (context.input.length > 10000) {
            this.logger.warn('Input is very long, may affect performance', {
                inputLength: context.input.length,
            });
        }

        if (context.tools.length === 0) {
            this.logger.warn(
                'No tools provided - React strategy may not be able to perform complex actions',
            );
        }

        if (context.tools.length > 50) {
            this.logger.warn(
                'Many tools provided - may impact prompt size and performance',
                {
                    toolsCount: context.tools.length,
                },
            );
        }

        this.logger.debug('Context validation passed', {
            inputLength: context.input.length,
            toolsCount: context.tools?.length || 0,
            hasAgentContext: !!context.agentContext,
        });
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

        // Usar nova arquitetura de prompts - contexto agnóstico
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
            additionalContext: {
                // Framework agnóstico - tudo do usuário fica dentro de userContext
                userContext:
                    context.agentContext?.agentExecutionOptions?.userContext,
                agentIdentity: context.agentContext?.agentIdentity,
                agentExecutionOptions:
                    context.agentContext?.agentExecutionOptions,
            },
        });

        // Log da chamada para debugging
        this.logger.debug('🤖 React iteration - calling LLM', {
            iteration: iteration + 1,
            inputLength: context.input.length,
            toolsCount: context.tools?.length || 0,
        });

        let response;
        try {
            response = await this.llmAdapter.call({
                messages: [
                    {
                        role: AgentInputEnum.SYSTEM,
                        content: prompts.systemPrompt,
                    },
                    { role: AgentInputEnum.USER, content: prompts.userPrompt },
                ],
                temperature: 0.3,
                maxTokens: 1000,
            });
        } catch (llmError) {
            // 🔥 TRATAMENTO ROBUSTO DE ERROS DE LLM
            const errorMessage =
                llmError instanceof Error ? llmError.message : String(llmError);

            this.logger.warn('⚠️ LLM call failed - attempting recovery', {
                iteration: iteration + 1,
                error: errorMessage,
                errorType:
                    llmError instanceof Error
                        ? llmError.constructor.name
                        : 'Unknown',
            });

            // Se for erro de rede/tempo, tentar fallback
            if (this.isNetworkError(llmError)) {
                this.logger.info(
                    '🔄 Network error detected - trying fallback response',
                    {
                        iteration: iteration + 1,
                    },
                );

                // Fallback: responder com final_answer simples
                return {
                    reasoning: `LLM temporarily unavailable due to network issues. Error: ${errorMessage}`,
                    action: {
                        type: 'final_answer',
                        content: `I encountered a temporary connectivity issue while processing your request. Please try again in a moment. Error details: ${errorMessage}`,
                    },
                    metadata: {
                        iteration,
                        timestamp: Date.now(),
                        fallbackUsed: true,
                        errorReason: 'network_error',
                    },
                };
            }

            // Para outros tipos de erro, ainda tentar fallback
            this.logger.warn('🔄 Other LLM error - using generic fallback', {
                iteration: iteration + 1,
                errorType:
                    llmError instanceof Error
                        ? llmError.constructor.name
                        : 'Unknown',
            });

            return {
                reasoning: `LLM encountered an error: ${errorMessage}`,
                action: {
                    type: 'final_answer',
                    content: `I encountered an error while processing your request: ${errorMessage}. Please try rephrasing your question.`,
                },
                metadata: {
                    iteration,
                    timestamp: Date.now(),
                    fallbackUsed: true,
                    errorReason: 'llm_error',
                },
            };
        }

        // Melhor tratamento de resposta
        let content: string;
        if (typeof response.content === 'string') {
            content = response.content;
        } else if (response.content) {
            content = JSON.stringify(response.content);
        } else {
            throw new Error('LLM returned empty or invalid response');
        }

        // Log da resposta para debugging
        this.logger.debug('📥 React LLM response received', {
            iteration: iteration + 1,
            responseLength: content.length,
            hasReasoning:
                content.includes('reasoning') || content.includes('Reasoning'),
            hasAction: content.includes('action') || content.includes('Action'),
        });

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
        } catch (jsonError) {
            this.logger.debug('JSON parse failed, trying text parse', {
                error:
                    jsonError instanceof Error
                        ? jsonError.message
                        : String(jsonError),
                contentPreview: content.substring(0, 100),
            });
        }

        // Parse de texto simples com melhor robustez
        const lines = content
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        let reasoning = '';
        let action: AgentAction = {
            type: 'final_answer',
            content: 'Unable to parse response',
        };

        // Procurar por diferentes formatos de reasoning
        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            if (
                lowerLine.startsWith('reasoning:') ||
                lowerLine.startsWith('analysis:') ||
                lowerLine.startsWith('thought:')
            ) {
                const colonIndex = line.indexOf(':');
                if (colonIndex !== -1) {
                    reasoning = line.substring(colonIndex + 1).trim();
                }
                break;
            }
        }

        // Procurar por diferentes formatos de action
        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            if (
                lowerLine.startsWith('action:') ||
                lowerLine.startsWith('decision:') ||
                lowerLine.startsWith('next:')
            ) {
                const actionText = line
                    .substring(line.indexOf(':') + 1)
                    .trim()
                    .toLowerCase();

                if (
                    actionText.includes('final') ||
                    actionText.includes('answer') ||
                    actionText.includes('done')
                ) {
                    action = {
                        type: 'final_answer',
                        content: reasoning || content,
                    };
                } else if (
                    actionText.includes('tool') ||
                    actionText.includes('call') ||
                    actionText.includes('execute')
                ) {
                    // Tentar extrair nome da ferramenta
                    const toolMatch = content.match(
                        /tool[_:\s]*([a-zA-Z_][a-zA-Z0-9_]*)/i,
                    );
                    action = {
                        type: 'tool_call',
                        toolName: toolMatch ? toolMatch[1] : 'unknown',
                        input: {},
                    };
                }
                break;
            }
        }

        // Se não encontrou reasoning específico, usar o conteúdo todo como reasoning
        if (!reasoning && content.length > 0) {
            reasoning =
                content.length > 200
                    ? content.substring(0, 200) + '...'
                    : content;
        }

        const result = {
            reasoning: reasoning || 'Analysis completed',
            action,
            metadata: {
                iteration,
                timestamp: Date.now(),
                parseMethod: 'text',
                originalContentLength: content.length,
            },
        };

        this.logger.debug('Parsed React LLM response', {
            iteration,
            reasoningLength: reasoning.length,
            actionType: action.type,
            toolName: action.type === 'tool_call' ? action.toolName : undefined,
        });

        return result;
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
     * Executa ferramenta real com melhor tratamento de erro
     */
    private async executeRealTool(
        action: AgentAction,
        tool: Tool,
        context: StrategyExecutionContext,
    ): Promise<unknown> {
        const startTime = Date.now();

        this.logger.debug('🔧 Tool execution via SharedStrategyMethods', {
            toolName: tool.name,
            actionInput: action.input,
            hasInput: action.input && Object.keys(action.input).length > 0,
        });

        try {
            // 🔥 USAR SHARED METHODS PARA EXECUÇÃO REAL DE TOOLS
            const result = await SharedStrategyMethods.executeTool(
                action,
                context,
            );

            this.logger.debug('✅ Tool execution completed', {
                toolName: tool.name,
                executionTime: Date.now() - startTime,
                hasResult: result !== undefined,
            });

            return result;
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);

            this.logger.warn('❌ Tool execution failed', {
                toolName: tool.name,
                error: errorMessage,
                executionTime: Date.now() - startTime,
            });

            throw error; // Re-throw para que seja tratado pelo nível superior
        }
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

    /**
     * 🔥 CREATE FINAL RESPONSE - Uses ContextBridge for complete context
     *
     * This method solves the original problem: "When I get to createFinalResponse,
     * I don't have all the necessary context to work with"
     */
    async createFinalResponse(
        context: StrategyExecutionContext,
    ): Promise<string> {
        this.logger.info(
            '🌉 ReAct: Creating final response with ContextBridge',
        );

        try {
            // Build PlannerExecutionContext for ContextBridge compatibility
            const plannerContext = {
                input: context.input,
                history: context.history.map((step, index) => ({
                    ...step,
                    stepId: step.id,
                    executionId: `exec-${Date.now()}-${index}`,
                })) as any[],
                iterations: 1,
                maxIterations: this.config.maxIterations,
                plannerMetadata: {
                    agentName: context.agentContext.agentName,
                    correlationId:
                        context.agentContext.correlationId ||
                        'react-final-response',
                    tenantId: context.agentContext.tenantId || 'default',
                    thread: context.agentContext.thread || {
                        id: context.agentContext.sessionId || 'unknown',
                    },
                    startTime: context.metadata.startTime,
                    enhancedContext: (context.agentContext as any)
                        .enhancedRuntimeContext,
                },
                agentContext: context.agentContext,
                isComplete: true,
                update: () => {},
                getCurrentSituation: () =>
                    `ReAct strategy completed for: ${context.input}`,
                getFinalResult: () => ({
                    success: true,
                    result: { content: 'ReAct execution completed' },
                    iterations: 1,
                    totalTime:
                        new Date().getTime() - context.metadata.startTime,
                    thoughts: [],
                    metadata: {
                        ...context.metadata,
                        agentName: context.agentContext.agentName,
                        iterations: 1,
                        toolsUsed: context.metadata.complexity || 0,
                        thinkingTime: Date.now() - context.metadata.startTime,
                    } as any,
                }),
                getCurrentPlan: () => null,
            };

            // 🔥 THE CORE: Use ContextBridge to build complete context
            const finalContext =
                await ContextService.buildFinalResponseContext(plannerContext);

            this.logger.info(
                '✅ ContextBridge: Complete context retrieved for ReAct',
                {
                    sessionId: finalContext.runtime.sessionId,
                    messagesCount: finalContext.runtime.messages.length,
                    entitiesCount: Object.keys(finalContext.runtime.entities)
                        .length,
                    executionSummary: {
                        totalExecutions:
                            finalContext.executionSummary.totalExecutions,
                        successRate: finalContext.executionSummary.successRate,
                        replanCount: finalContext.executionSummary.replanCount,
                    },
                    wasRecovered: finalContext.recovery?.wasRecovered,
                    inferencesCount: Object.keys(finalContext.inferences || {})
                        .length,
                },
            );

            // Build context-aware response using complete context
            const response = this.buildContextualResponse(
                finalContext,
                context.input,
            );

            this.logger.info(
                '🎯 ReAct: Final response created with full context',
                {
                    responseLength: response.length,
                    contextSource: 'ContextBridge',
                },
            );

            return response;
        } catch (error) {
            this.logger.error(
                '❌ ReAct: ContextBridge failed, using fallback response',
                error instanceof Error ? error : undefined,
                {
                    input: context.input,
                    agentName: context.agentContext.agentName,
                },
            );

            // Fallback: Simple response without ContextBridge
            return this.buildFallbackResponse(context);
        }
    }

    /**
     * Build contextual response using complete FinalResponseContext from ContextBridge
     */
    private buildContextualResponse(
        finalContext: any,
        originalInput: string,
    ): string {
        const { runtime, executionSummary, recovery } = finalContext;

        let response = `Through reasoning and action`;

        // Add context about what was accomplished
        if (executionSummary.totalExecutions > 0) {
            response += `, I've completed ${executionSummary.totalExecutions} executions`;

            if (executionSummary.successRate < 100) {
                response += ` with ${executionSummary.successRate}% success rate`;
            }
        }

        // Reference entities if available
        const entityTypes = Object.keys(runtime.entities).filter(
            (key: string) => {
                const entities = runtime.entities[key];
                return Array.isArray(entities) && entities.length > 0;
            },
        );

        if (entityTypes.length > 0) {
            response += `, working with ${entityTypes.join(', ')}`;
        }

        // Mention recovery if it happened
        if (recovery?.wasRecovered) {
            const gapMinutes = Math.round(recovery.gapDuration / 60000);
            response += ` (session recovered after ${gapMinutes}min gap)`;
        }

        // Add conversation context
        if (runtime.messages.length > 2) {
            response += ` based on our ${runtime.messages.length} message conversation`;
        }

        // Add specific response to the original input
        response += `. For your request: "${originalInput}"`;

        // Add completion message
        response += ` - I've applied the ReAct approach of systematic thinking, targeted action, and careful observation to provide you with a comprehensive response.`;

        return response;
    }

    /**
     * Fallback response when ContextBridge is not available
     */
    private buildFallbackResponse(context: StrategyExecutionContext): string {
        return (
            `I've processed your request: "${context.input}" using the ReAct strategy. ` +
            `Through systematic reasoning, targeted actions, and careful observation, I've completed the task.`
        );
    }

    /**
     * Verifica se o erro é relacionado à rede/conectividade
     */
    private isNetworkError(error: unknown): boolean {
        if (!(error instanceof Error)) return false;

        const errorMessage = error.message.toLowerCase();
        const errorName = error.constructor.name.toLowerCase();

        // Padrões comuns de erro de rede
        const networkPatterns = [
            'fetch failed',
            'network error',
            'connection refused',
            'timeout',
            'econnrefused',
            'enotfound',
            'econnreset',
            'etimedout',
            'request timeout',
            'service unavailable',
            'bad gateway',
            'gateway timeout',
            'internal server error',
        ];

        // Verificar se a mensagem contém algum padrão de erro de rede
        const hasNetworkPattern = networkPatterns.some((pattern) =>
            errorMessage.includes(pattern),
        );

        // Verificar se é um erro de tipo de rede
        const isNetworkErrorType = [
            'typeerror',
            'fetcherror',
            'connectionerror',
            'timeoutError',
        ].some((type) => errorName.includes(type));

        return hasNetworkPattern || isNetworkErrorType;
    }
}
