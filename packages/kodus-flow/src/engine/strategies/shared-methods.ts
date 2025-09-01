import type {
    StrategyExecutionContext,
    ExecutionStep,
    AgentAction,
    ActionResult,
    ResultAnalysis,
    AgentThought,
    ExecutionPlan,
} from './types.js';
import type { ToolDefinition } from '../../core/types/allTypes.js';

// 🔧 IMPORTS PARA EXECUÇÃO DE TOOLS
import { CircuitBreaker } from '../../runtime/core/circuit-breaker.js';
import {
    createLogger,
    getObservability,
    startToolSpan,
    applyErrorToSpan,
    markSpanOk,
} from '../../observability/index.js';
import { IdGenerator } from '../../utils/id-generator.js';
import { createToolError } from '../../core/error-unified.js';
import { validateWithZod } from '../../core/utils/zod-to-json-schema.js';

// Métodos compartilhados entre estratégias
export class SharedStrategyMethods {
    // 🔧 STATIC PROPERTIES PARA EXECUÇÃO DE TOOLS
    private static readonly logger = createLogger('shared-strategy-methods');
    private static circuitBreaker?: CircuitBreaker;
    private static readonly defaultTimeout = 120000; // 120s para APIs externas

    // 🔧 STATIC METHODS AUXILIARES
    private static initializeCircuitBreaker(): void {
        if (!this.circuitBreaker) {
            const observabilitySystem = {
                logger: this.logger,
                monitoring: {
                    recordMetric: () => {},
                    recordHistogram: () => {},
                    incrementCounter: () => {},
                },
                telemetry: {
                    startSpan: () => ({
                        end: () => {},
                        setAttribute: () => ({ end: () => {} }),
                        setAttributes: () => ({ end: () => {} }),
                        setStatus: () => ({ end: () => {} }),
                        recordException: () => ({ end: () => {} }),
                        addEvent: () => ({ end: () => {} }),
                        updateName: () => ({ end: () => {} }),
                    }),
                    recordException: () => {},
                },
                config: {},
                monitor: {},
                debug: {},
                createContext: () => ({}),
            } as any;

            this.circuitBreaker = new CircuitBreaker(observabilitySystem, {
                name: 'strategy-tool-execution',
                failureThreshold: 3,
                recoveryTimeout: 150000, // 2.5 minutos
                successThreshold: 2,
                operationTimeout: this.defaultTimeout,
                onStateChange: (newState, prevState) => {
                    this.logger.info('Tool circuit breaker state changed', {
                        from: prevState,
                        to: newState,
                    });
                },
                onFailure: (error, context) => {
                    this.logger.warn(
                        'Tool execution failed in circuit breaker',
                        {
                            error: error.message,
                            context,
                        },
                    );
                },
            });
        }
    }

    private static async withTimeout<T>(
        promise: Promise<T>,
        ms: number,
        tag: string,
    ): Promise<T> {
        let timeoutId: any;
        const timeout = new Promise<never>((_, rej) => {
            timeoutId = setTimeout(
                () => rej(new Error(`timeout after ${ms}ms (${tag})`)),
                ms,
            );
        });

        try {
            return await Promise.race([promise, timeout]);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private static createToolContext(
        toolName: string,
        callId: string,
        executionId: string,
        tenantId: string,
        input: Record<string, unknown>,
        options?: { correlationId?: string },
    ) {
        return {
            toolName,
            callId,
            executionId,
            tenantId,
            input,
            correlationId: options?.correlationId,
            timestamp: Date.now(),
            source: 'strategy-layer',
        };
    }

    private static validateToolInput<T>(tool: ToolDefinition, input: T): void {
        if (!tool.inputSchema) {
            return; // Skip validation if no schema
        }

        this.logger.debug('🔍 Validating tool input', {
            toolName: tool.name,
            inputType: typeof input,
            hasInputSchema: !!tool.inputSchema,
        });

        try {
            const validation = validateWithZod(tool.inputSchema, input);
            if (!validation.success) {
                this.logger.error(
                    `Tool input validation failed: ${validation.error}`,
                    new Error(
                        `Tool input validation failed: ${validation.error}`,
                    ),
                    {
                        toolName: tool.name,
                        validationError: validation.error,
                        inputType: typeof input,
                    },
                );

                const missingParams = this.extractMissingParameters(
                    validation.error,
                );
                throw createToolError(validation.error, {
                    severity: 'low',
                    domain: 'business',
                    userImpact: 'degraded',
                    retryable: false,
                    recoverable: true,
                    context: { toolName: tool.name, input, validation },
                    userMessage: `Tool '${tool.name}' requires specific parameters. ${
                        missingParams.length > 0
                            ? `Missing: ${missingParams.join(', ')}`
                            : 'Invalid parameters provided.'
                    }`,
                    recoveryHints: [
                        'Check the tool documentation for correct input format',
                        'Ensure all required parameters are provided',
                    ],
                });
            }

            this.logger.debug('✅ Tool input validation passed', {
                toolName: tool.name,
            });
        } catch (validationError) {
            throw createToolError(
                validationError instanceof Error
                    ? validationError.message
                    : String(validationError),
                {
                    severity: 'medium',
                    domain: 'business',
                    userImpact: 'degraded',
                    retryable: false,
                    recoverable: true,
                    context: {
                        toolName: tool.name,
                        input,
                        validationError,
                    },
                    userMessage:
                        'An unexpected error occurred during input validation.',
                    recoveryHints: [
                        'Check if the tool schema is properly defined',
                        'Verify the input format matches the expected schema',
                    ],
                },
            );
        }
    }

    private static extractMissingParameters(validationError: string): string[] {
        try {
            const errorObj = JSON.parse(validationError);
            if (Array.isArray(errorObj)) {
                return errorObj
                    .filter(
                        (error: unknown) =>
                            typeof error === 'object' &&
                            error !== null &&
                            'code' in error &&
                            'message' in error &&
                            error.code === 'invalid_type' &&
                            typeof error.message === 'string' &&
                            error.message.includes('received undefined'),
                    )
                    .map((error: unknown) => {
                        if (
                            typeof error === 'object' &&
                            error !== null &&
                            'path' in error
                        ) {
                            const path = (error as { path?: unknown }).path;
                            if (
                                Array.isArray(path) &&
                                path.length > 0 &&
                                typeof path[0] === 'string'
                            ) {
                                return path[0];
                            }
                        }
                        return null;
                    })
                    .filter((param): param is string => param !== null);
            }
        } catch {
            const match = validationError.match(/path":\s*\["([^"]+)"\]/);
            return match && match[1] ? [match[1]] : [];
        }
        return [];
    }

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
     * 🔥 EXECUTA TOOL COM FUNCIONALIDADES ENTERPRISE
     * Implementação completa com validação, circuit breaker, observabilidade e timeout
     */
    static async executeTool(
        action: AgentAction,
        context: StrategyExecutionContext,
    ): Promise<unknown> {
        if (action.type !== 'tool_call' || !action.toolName) {
            throw new Error('Invalid tool call action');
        }

        // 🔍 Busca a tool no contexto (precisa ser ToolDefinition)
        const tool = context.tools.find(
            (t) => t.name === action.toolName,
        ) as ToolDefinition;
        if (!tool) {
            throw new Error(`Tool not found: ${action.toolName}`);
        }

        const callId = IdGenerator.callId();
        const executionId = `exec-${Date.now()}`;
        const startTime = Date.now();

        // 🔧 Inicializa circuit breaker se necessário
        this.initializeCircuitBreaker();

        try {
            // 📊 Cria span de observabilidade
            const obs = getObservability();
            const span = startToolSpan(obs.telemetry, {
                toolName: tool.name,
                callId,
                correlationId: context.metadata?.correlationId,
            });

            const result = await obs.telemetry.withSpan(span, async () => {
                try {
                    // 🔍 Valida input da tool
                    this.validateToolInput(tool, action.input);

                    // 🛡️ Circuit breaker protection
                    if (this.circuitBreaker) {
                        const circuitResult = await this.circuitBreaker.execute(
                            () =>
                                this.executeToolInternal(
                                    tool,
                                    action.input as Record<string, unknown>,
                                    callId,
                                    executionId,
                                    context,
                                ),
                            {
                                toolName: tool.name,
                                agentName:
                                    context.agentContext?.agentName ||
                                    'strategy',
                            },
                        );

                        if (circuitResult.error) {
                            throw circuitResult.error;
                        }

                        return circuitResult.result;
                    } else {
                        // Fallback sem circuit breaker
                        return await this.withTimeout(
                            this.executeToolInternal(
                                tool,
                                action.input as Record<string, unknown>,
                                callId,
                                executionId,
                                context,
                            ),
                            this.defaultTimeout,
                            `tool:${tool.name}`,
                        );
                    }
                } catch (innerError) {
                    applyErrorToSpan(span, innerError);
                    throw innerError;
                }
            });

            markSpanOk(span);

            const executionTime = Date.now() - startTime;
            this.logger.debug('✅ Tool executed successfully', {
                toolName: tool.name,
                callId,
                executionTime,
                correlationId: context.metadata?.correlationId,
            });

            return result;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            const lastError = error as Error;

            this.logger.error(
                '❌ TOOL EXECUTION FAILED (Strategy Layer)',
                lastError,
                {
                    toolName: tool.name,
                    callId,
                    correlationId: context.metadata?.correlationId,
                    error: lastError.message,
                    errorType: lastError.constructor.name,
                    executionTime,
                    isTimeout: lastError.message.includes('timeout'),
                    trace: {
                        source: 'shared-strategy-methods',
                        step: 'executeTool-error',
                        timestamp: Date.now(),
                    },
                },
            );

            throw lastError;
        }
    }

    /**
     * 🔥 EXECUÇÃO INTERNA DA TOOL (com contexto completo)
     */
    private static async executeToolInternal(
        tool: ToolDefinition,
        input: Record<string, unknown>,
        callId: string,
        executionId: string,
        context: StrategyExecutionContext,
    ): Promise<unknown> {
        // 🏗️ Cria contexto da tool
        const toolContext = this.createToolContext(
            tool.name,
            callId,
            executionId,
            context.agentContext?.tenantId || 'default',
            input,
            {
                correlationId: context.metadata?.correlationId,
            },
        );

        // 🔥 EXECUTA A TOOL REAL
        try {
            this.logger.debug('🔧 Executing tool with context', {
                toolName: tool.name,
                callId,
                executionId,
                correlationId: context.metadata?.correlationId,
                inputKeys: Object.keys(input),
            });

            // Chama o método execute da tool com contexto
            const result = await tool.execute(input as any, toolContext as any);

            this.logger.debug('🔧 Tool execution completed', {
                toolName: tool.name,
                callId,
                resultType: typeof result,
                hasResult: result !== undefined,
            });

            return result;
        } catch (executionError) {
            this.logger.error(
                '🔧 Tool execution internal error',
                executionError as Error,
                {
                    toolName: tool.name,
                    callId,
                    executionId,
                    error: (executionError as Error).message,
                },
            );
            throw executionError;
        }
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
            type2: 'organize',
            timestamp: Date.now(),
            status: 'pending',
            ...data,
        };
    }

    /**
     * Calcula complexidade (heurísticas comuns)
     */
    static calculateComplexity(input: string, tools: ToolDefinition[]): number {
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
