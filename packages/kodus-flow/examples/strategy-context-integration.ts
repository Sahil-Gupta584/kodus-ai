/**
 * 🔗 INTEGRAÇÃO COMPLETA: Context Runtime com Strategies
 *
 * Este arquivo demonstra como integrar corretamente a camada Strategies
 * com o sistema de context runtime do Kodus Flow.
 */

import {
    StrategyExecutionContext,
    ExecutionResult,
    StrategyFactory,
} from '../src/engine/strategies/index.js';
import { createLogger } from '../src/observability/index.js';
import {
    AgentContext,
    LLMAdapter,
    Tool,
    AgentExecutionOptions,
    AgentExecutionResult,
} from '../src/core/types/allTypes.js';

// =============================================================================
// 🎯 CONTEXT RUNTIME MANAGER
// =============================================================================

/**
 * 🧠 Gerenciador Centralizado de Context Runtime
 *
 * Centraliza toda a lógica de context para strategies, integrando:
 * - Kernel Handler (estado do kernel)
 * - Memory Manager (contexto histórico)
 * - Session Manager (dados da sessão)
 * - Observability (métricas e tracing)
 */
export class StrategyContextRuntimeManager {
    private logger = createLogger('strategy-context-runtime');

    constructor(
        private kernelHandler?: any, // MultiKernelHandler
        private memoryManager?: any, // MemoryManager
        private sessionManager?: any, // SessionManager
        private observability?: any, // Observability
    ) {}

    /**
     * Cria context de execução completo e enriquecido
     */
    async createEnrichedExecutionContext(
        input: string,
        baseAgentContext: AgentContext,
        tools: Tool[],
        executionOptions: AgentExecutionOptions,
        strategyType: 'react' | 'rewoo' = 'react',
    ): Promise<StrategyExecutionContext> {
        this.logger.info('🔄 Creating enriched execution context', {
            agentName: baseAgentContext.agentName,
            strategyType,
            inputLength: input.length,
            toolsCount: tools.length,
        });

        // 1. Context base do agente
        const agentContext = await this.enrichAgentContext(baseAgentContext);

        // 2. Ferramentas disponíveis (com validação)
        const validatedTools = await this.validateAndEnrichTools(
            tools,
            agentContext,
        );

        // 3. Histórico de execução (da sessão atual)
        const executionHistory = await this.loadExecutionHistory(agentContext);

        // 4. Configuração específica da estratégia
        const strategyConfig = this.createStrategyConfig(
            strategyType,
            executionOptions,
        );

        // 5. Metadados de execução
        const executionMetadata = await this.createExecutionMetadata(
            input,
            agentContext,
            validatedTools,
            executionOptions,
        );

        // 6. Context final
        const executionContext: StrategyExecutionContext = {
            input,
            tools: validatedTools,
            agentContext,
            config: strategyConfig,
            history: executionHistory,
            metadata: executionMetadata,
        };

        // 7. Tracing e observabilidade
        await this.setupTracing(executionContext);

        this.logger.info('✅ Enriched execution context created', {
            contextId: executionMetadata.correlationId,
            complexity: executionMetadata.complexity,
            enrichedFields: this.countEnrichedFields(agentContext),
        });

        return executionContext;
    }

    /**
     * Enriquece o context base do agente com dados runtime
     */
    private async enrichAgentContext(
        baseContext: AgentContext,
    ): Promise<AgentContext> {
        const enriched = { ...baseContext };

        // 1. Estado do Kernel
        if (this.kernelHandler) {
            try {
                const kernelState = await this.kernelHandler.getKernelState(
                    baseContext.sessionId,
                );
                enriched.kernel = {
                    state: kernelState.status,
                    lastActivity: kernelState.lastActivity,
                    activeProcesses: kernelState.activeProcesses,
                    memoryUsage: kernelState.memoryUsage,
                };
            } catch (error) {
                this.logger.warn('Failed to enrich kernel context', { error });
            }
        }

        // 2. Dados de memória
        if (this.memoryManager) {
            try {
                const memoryContext = await this.memoryManager.getContext(
                    baseContext.sessionId,
                );
                enriched.memory = {
                    totalItems: memoryContext.totalItems,
                    recentItems: memoryContext.recentItems,
                    categories: memoryContext.categories,
                    lastAccess: memoryContext.lastAccess,
                };
            } catch (error) {
                this.logger.warn('Failed to enrich memory context', { error });
            }
        }

        // 3. Estado da sessão
        if (this.sessionManager) {
            try {
                const sessionState = await this.sessionManager.getSessionState(
                    baseContext.sessionId,
                );
                enriched.session = {
                    startTime: sessionState.startTime,
                    duration: Date.now() - sessionState.startTime,
                    interactions: sessionState.interactions,
                    status: sessionState.status,
                    metadata: sessionState.metadata,
                };
            } catch (error) {
                this.logger.warn('Failed to enrich session context', { error });
            }
        }

        // 4. Métricas de performance
        enriched.runtime = {
            timestamp: Date.now(),
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            performance: {
                memoryUsage: process.memoryUsage(),
                uptime: process.uptime(),
                loadAverage:
                    process.platform === 'win32'
                        ? undefined
                        : require('os').loadavg(),
            },
        };

        return enriched;
    }

    /**
     * Valida e enriquece ferramentas com metadados runtime
     */
    private async validateAndEnrichTools(
        tools: Tool[],
        agentContext: AgentContext,
    ): Promise<Tool[]> {
        const validated: Tool[] = [];

        for (const tool of tools) {
            try {
                // Validação básica
                if (!tool.name || !tool.description) {
                    this.logger.warn('Invalid tool configuration', {
                        toolName: tool.name,
                    });
                    continue;
                }

                // Enriquecimento com metadados runtime
                const enrichedTool = await this.enrichToolWithRuntimeData(
                    tool,
                    agentContext,
                );
                validated.push(enrichedTool);
            } catch (error) {
                this.logger.error('Failed to validate tool', {
                    toolName: tool.name,
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            }
        }

        this.logger.debug('Tools validated and enriched', {
            originalCount: tools.length,
            validatedCount: validated.length,
        });

        return validated;
    }

    /**
     * Enriquece ferramenta com dados runtime
     */
    private async enrichToolWithRuntimeData(
        tool: Tool,
        agentContext: AgentContext,
    ): Promise<Tool> {
        const enriched = { ...tool };

        // Adicionar metadados de uso
        enriched.metadata = {
            ...enriched.metadata,
            usage: {
                totalCalls: 0, // Carregar do histórico
                successRate: 1.0,
                averageLatency: 0,
                lastUsed: null,
            },
            permissions: {
                // Carregar permissões baseadas no contexto do agente
                allowed: true,
                restrictions: [],
            },
            runtime: {
                version: '1.0.0',
                health: 'healthy',
                lastHealthCheck: Date.now(),
            },
        };

        return enriched;
    }

    /**
     * Carrega histórico de execução da sessão
     */
    private async loadExecutionHistory(
        agentContext: AgentContext,
    ): Promise<any[]> {
        try {
            if (this.memoryManager) {
                const history = await this.memoryManager.getExecutionHistory(
                    agentContext.sessionId,
                );
                return history.map((item) => ({
                    id: item.id,
                    type: item.type,
                    timestamp: item.timestamp,
                    status: item.status,
                    metadata: item.metadata,
                    // Converte para formato da strategy
                    thought: item.thought
                        ? {
                              reasoning: item.thought.reasoning,
                              action: item.thought.action,
                          }
                        : undefined,
                    action: item.action,
                    result: item.result,
                    observation: item.observation,
                }));
            }
        } catch (error) {
            this.logger.warn('Failed to load execution history', { error });
        }

        return []; // Retorna vazio se falhar
    }

    /**
     * Cria configuração específica da estratégia
     */
    private createStrategyConfig(
        strategyType: 'react' | 'rewoo',
        executionOptions: AgentExecutionOptions,
    ) {
        const baseConfig = {
            executionStrategy: strategyType,
            maxIterations: executionOptions.maxIterations || 10,
            maxToolCalls: executionOptions.maxToolCalls || 20,
            maxExecutionTime: executionOptions.timeout || 300000,
            enableReasoning: true,
            enableStreaming: executionOptions.streaming || false,
        };

        // Configurações específicas por estratégia
        if (strategyType === 'react') {
            return {
                ...baseConfig,
                stopConditions: {
                    react: {
                        maxTurns: baseConfig.maxIterations,
                        maxToolCalls: baseConfig.maxToolCalls,
                        customConditions: [],
                    },
                },
            };
        } else {
            // rewoo
            return {
                ...baseConfig,
                stopConditions: {
                    rewoo: {
                        maxPlanSteps: Math.max(baseConfig.maxIterations * 2, 5),
                        maxToolCalls: baseConfig.maxToolCalls,
                        customConditions: [],
                    },
                },
            };
        }
    }

    /**
     * Cria metadados completos de execução
     */
    private async createExecutionMetadata(
        input: string,
        agentContext: AgentContext,
        tools: Tool[],
        executionOptions: AgentExecutionOptions,
    ) {
        const startTime = Date.now();
        const complexity = this.calculateComplexity(input, tools);

        return {
            strategy: executionOptions.strategy || 'react',
            complexity,
            startTime,
            endTime: undefined,
            agentName: agentContext.agentName,
            sessionId: agentContext.sessionId,
            correlationId: executionOptions.correlationId,
            toolCallsCount: 0,
            errorsCount: 0,
            // Métricas adicionais
            estimatedTokens: this.estimateTokenCount(input, tools),
            riskLevel: this.calculateRiskLevel(complexity, tools),
            resourceRequirements:
                this.calculateResourceRequirements(complexity),
        };
    }

    /**
     * Configura tracing e observabilidade
     */
    private async setupTracing(
        context: StrategyExecutionContext,
    ): Promise<void> {
        if (this.observability) {
            try {
                await this.observability.startTrace('strategy-execution', {
                    correlationId: context.metadata.correlationId,
                    agentName: context.agentContext.agentName,
                    strategy: context.metadata.strategy,
                    complexity: context.metadata.complexity,
                    inputLength: context.input.length,
                    toolsCount: context.tools.length,
                });
            } catch (error) {
                this.logger.warn('Failed to setup tracing', { error });
            }
        }
    }

    // === MÉTODOS UTILITÁRIOS ===

    private calculateComplexity(input: string, tools: Tool[]): number {
        let complexity = 0;

        // Base complexity
        complexity += tools.length;

        // Input complexity
        if (input.length > 100) complexity += 1;
        if (input.length > 500) complexity += 2;

        // Keyword complexity
        const complexKeywords =
            /analyze|create|generate|build|integrate|workflow|plan/i;
        if (complexKeywords.test(input)) complexity += 2;

        // Multiple actions
        const actionKeywords = /and|then|after|before|while|until/i;
        if (actionKeywords.test(input)) complexity += 1;

        return complexity;
    }

    private estimateTokenCount(input: string, tools: Tool[]): number {
        const inputTokens = Math.ceil(input.length / 4);
        const toolsTokens = tools.reduce(
            (acc, tool) => acc + Math.ceil((tool.description?.length || 0) / 4),
            0,
        );
        return inputTokens + toolsTokens;
    }

    private calculateRiskLevel(
        complexity: number,
        tools: Tool[],
    ): 'low' | 'medium' | 'high' {
        if (complexity >= 7 || tools.length >= 10) return 'high';
        if (complexity >= 4 || tools.length >= 5) return 'medium';
        return 'low';
    }

    private calculateResourceRequirements(complexity: number) {
        return {
            estimatedMemory: Math.max(complexity * 10, 50), // MB
            estimatedTime: Math.max(complexity * 5, 10), // seconds
            priority: complexity > 5 ? 'high' : 'normal',
        };
    }

    private countEnrichedFields(agentContext: AgentContext): number {
        let count = 0;
        if (agentContext.kernel) count++;
        if (agentContext.memory) count++;
        if (agentContext.session) count++;
        if (agentContext.runtime) count++;
        return count;
    }
}

// =============================================================================
// 🚀 STRATEGY EXECUTOR INTEGRADO
// =============================================================================

/**
 * 🎯 Executor de Estratégias com Context Runtime Completo
 */
export class IntegratedStrategyExecutor {
    private logger = createLogger('integrated-strategy-executor');
    private contextManager: StrategyContextRuntimeManager;

    constructor(
        private llmAdapter: LLMAdapter,
        kernelHandler?: any,
        memoryManager?: any,
        sessionManager?: any,
        observability?: any,
    ) {
        this.contextManager = new StrategyContextRuntimeManager(
            kernelHandler,
            memoryManager,
            sessionManager,
            observability,
        );
    }

    /**
     * Executa estratégia com context runtime completo
     */
    async executeWithFullContext(
        input: string,
        baseAgentContext: AgentContext,
        tools: Tool[],
        executionOptions: AgentExecutionOptions = {},
    ): Promise<AgentExecutionResult> {
        const startTime = Date.now();
        const correlationId =
            executionOptions.correlationId || this.generateCorrelationId();

        try {
            this.logger.info('🚀 Starting integrated strategy execution', {
                agentName: baseAgentContext.agentName,
                inputLength: input.length,
                correlationId,
            });

            // 1. Criar context enriquecido
            const enrichedContext =
                await this.contextManager.createEnrichedExecutionContext(
                    input,
                    baseAgentContext,
                    tools,
                    { ...executionOptions, correlationId },
                );

            // 2. Selecionar estratégia baseada no context
            const strategyType = this.selectStrategy(enrichedContext);
            const strategy = StrategyFactory.create(
                strategyType,
                this.llmAdapter,
            );

            // 3. Executar estratégia
            this.logger.debug('🎯 Executing strategy', {
                strategyType,
                correlationId,
            });

            const result = await strategy.execute(enrichedContext);

            // 4. Processar resultado e enriquecer
            const enrichedResult = await this.enrichExecutionResult(
                result,
                enrichedContext,
            );

            // 5. Salvar no context runtime
            await this.persistExecutionResult(enrichedResult, enrichedContext);

            const executionTime = Date.now() - startTime;

            this.logger.info('✅ Strategy execution completed', {
                success: enrichedResult.success,
                executionTime,
                correlationId,
                outputLength: String(enrichedResult.output).length,
            });

            return enrichedResult;
        } catch (error) {
            const executionTime = Date.now() - startTime;

            this.logger.error('❌ Strategy execution failed', {
                error: error instanceof Error ? error.message : String(error),
                executionTime,
                correlationId,
            });

            // Retornar resultado de erro enriquecido
            return await this.createErrorResult(
                error,
                correlationId,
                executionTime,
            );
        }
    }

    /**
     * Seleção inteligente de estratégia baseada no context
     */
    private selectStrategy(
        context: StrategyExecutionContext,
    ): 'react' | 'rewoo' {
        const complexity = context.metadata.complexity;
        const toolsCount = context.tools.length;
        const hasHistory = context.history.length > 0;

        // ReWoo para tarefas complexas
        if (complexity >= 5 || toolsCount >= 8) {
            return 'rewoo';
        }

        // ReAct para tarefas simples/interativas
        if (complexity <= 2 || hasHistory) {
            return 'react';
        }

        // Default baseado na configuração do agente
        return (
            (context.config.executionStrategy as 'react' | 'rewoo') || 'react'
        );
    }

    /**
     * Enriquece resultado com dados runtime
     */
    private async enrichExecutionResult(
        result: ExecutionResult,
        context: StrategyExecutionContext,
    ): Promise<AgentExecutionResult> {
        const enriched: AgentExecutionResult = {
            success: result.success,
            output: result.output,
            error: result.error,
            metadata: {
                ...result.metadata,
                // Adicionar metadados enriquecidos
                execution: {
                    strategy: result.strategy,
                    complexity: result.complexity,
                    executionTime: result.executionTime,
                    steps: result.steps.length,
                },
                context: {
                    agentName: context.agentContext.agentName,
                    sessionId: context.agentContext.sessionId,
                    correlationId: context.metadata.correlationId,
                },
                performance: {
                    tokenEfficiency: this.calculateTokenEfficiency(result),
                    toolUtilization: this.calculateToolUtilization(result),
                    successRate: result.success ? 1.0 : 0.0,
                },
            },
        };

        return enriched;
    }

    /**
     * Persiste resultado no context runtime
     */
    private async persistExecutionResult(
        result: AgentExecutionResult,
        context: StrategyExecutionContext,
    ): Promise<void> {
        try {
            // Persistir no memory manager
            if (this.contextManager['memoryManager']) {
                await this.contextManager['memoryManager'].storeExecutionResult(
                    context.agentContext.sessionId,
                    {
                        correlationId: context.metadata.correlationId,
                        strategy: result.metadata?.execution?.strategy,
                        success: result.success,
                        output: result.output,
                        error: result.error,
                        timestamp: Date.now(),
                        metadata: result.metadata,
                    },
                );
            }

            // Atualizar métricas no kernel
            if (this.contextManager['kernelHandler']) {
                await this.contextManager[
                    'kernelHandler'
                ].updateExecutionMetrics(context.agentContext.sessionId, {
                    totalExecutions: 1,
                    successfulExecutions: result.success ? 1 : 0,
                    failedExecutions: result.success ? 0 : 1,
                    averageExecutionTime:
                        result.metadata?.execution?.executionTime || 0,
                });
            }
        } catch (error) {
            this.logger.warn('Failed to persist execution result', { error });
        }
    }

    /**
     * Cria resultado de erro enriquecido
     */
    private async createErrorResult(
        error: any,
        correlationId: string,
        executionTime: number,
    ): Promise<AgentExecutionResult> {
        return {
            success: false,
            output: null,
            error: error instanceof Error ? error.message : String(error),
            metadata: {
                execution: {
                    executionTime,
                    error: true,
                },
                context: {
                    correlationId,
                },
                performance: {
                    successRate: 0.0,
                },
            },
        };
    }

    // === UTILITÁRIOS ===

    private generateCorrelationId(): string {
        return `strat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private calculateTokenEfficiency(result: ExecutionResult): number {
        const estimatedTokens = result.metadata?.estimatedTokens || 1;
        const executionTime = result.executionTime || 1;
        return estimatedTokens / executionTime;
    }

    private calculateToolUtilization(result: ExecutionResult): number {
        const toolCalls = result.metadata?.toolCallsCount || 0;
        const steps = result.steps.length || 1;
        return toolCalls / steps;
    }
}

// =============================================================================
// 🎯 EXEMPLO DE USO COMPLETO
// =============================================================================

/**
 * 📚 Exemplos de integração completa
 */
export class StrategyIntegrationExamples {
    private executor: IntegratedStrategyExecutor;

    constructor(llmAdapter: LLMAdapter) {
        this.executor = new IntegratedStrategyExecutor(llmAdapter);
    }

    /**
     * Exemplo 1: Execução simples com context básico
     */
    async exemploBasico() {
        const agentContext: AgentContext = {
            agentName: 'assistente-basico',
            sessionId: 'session-123',
            correlationId: 'corr-456',
            tenantId: 'tenant-789',
        };

        const tools: Tool[] = [
            {
                name: 'search_database',
                description: 'Busca informações no banco de dados',
            },
        ];

        const result = await this.executor.executeWithFullContext(
            'Encontre o usuário João Silva',
            agentContext,
            tools,
        );

        console.log('Resultado básico:', result);
    }

    /**
     * Exemplo 2: Execução avançada com context completo
     */
    async exemploAvancado() {
        const agentContext: AgentContext = {
            agentName: 'analista-avancado',
            sessionId: 'session-456',
            correlationId: 'corr-789',
            tenantId: 'tenant-101',
        };

        const tools: Tool[] = [
            {
                name: 'analyze_data',
                description: 'Analisa conjunto de dados',
            },
            {
                name: 'generate_report',
                description: 'Gera relatório baseado em análise',
            },
            {
                name: 'send_email',
                description: 'Envia email',
            },
        ];

        const executionOptions: AgentExecutionOptions = {
            correlationId: 'exec-2024',
            maxIterations: 15,
            maxToolCalls: 25,
            timeout: 600000, // 10 minutos
            streaming: true,
        };

        const result = await this.executor.executeWithFullContext(
            'Analise os dados de vendas, gere um relatório e envie para o gerente',
            agentContext,
            tools,
            executionOptions,
        );

        console.log('Resultado avançado:', result);
    }

    /**
     * Exemplo 3: Execução com recovery e retry
     */
    async exemploComRecovery() {
        const agentContext: AgentContext = {
            agentName: 'assistente-resiliente',
            sessionId: 'session-recovery',
            correlationId: 'corr-recovery',
            tenantId: 'tenant-recovery',
        };

        const tools: Tool[] = [
            {
                name: 'unstable_tool',
                description: 'Ferramenta que pode falhar',
            },
        ];

        try {
            const result = await this.executor.executeWithFullContext(
                'Execute tarefa que pode falhar',
                agentContext,
                tools,
                {
                    maxIterations: 3,
                    timeout: 30000,
                },
            );

            console.log('Execução com sucesso:', result);
        } catch (error) {
            console.log('Execução falhou, tentando recovery...');

            // Tentar novamente com estratégia diferente
            const recoveryResult = await this.executor.executeWithFullContext(
                'Execute tarefa com abordagem diferente',
                {
                    ...agentContext,
                    correlationId: `${agentContext.correlationId}-recovery`,
                },
                tools,
                {
                    maxIterations: 5,
                    timeout: 60000,
                },
            );

            console.log('Recovery result:', recoveryResult);
        }
    }
}

// =============================================================================
// 🔧 CONFIGURAÇÃO E SETUP
// =============================================================================

/**
 * 🛠️ Factory para criar executor integrado
 */
export function createIntegratedStrategyExecutor(
    llmAdapter: LLMAdapter,
    config: {
        kernelHandler?: any;
        memoryManager?: any;
        sessionManager?: any;
        observability?: any;
    } = {},
) {
    return new IntegratedStrategyExecutor(
        llmAdapter,
        config.kernelHandler,
        config.memoryManager,
        config.sessionManager,
        config.observability,
    );
}

/**
 * ⚙️ Configuração recomendada para diferentes cenários
 */
export const IntegrationConfigs = {
    /**
     * Configuração básica para desenvolvimento
     */
    development: {
        enableTracing: true,
        enableMetrics: true,
        maxRetries: 3,
        defaultTimeout: 30000,
    },

    /**
     * Configuração para produção
     */
    production: {
        enableTracing: true,
        enableMetrics: true,
        maxRetries: 5,
        defaultTimeout: 120000,
        enableCaching: true,
        enableLoadBalancing: true,
    },

    /**
     * Configuração para testes
     */
    testing: {
        enableTracing: false,
        enableMetrics: false,
        maxRetries: 1,
        defaultTimeout: 10000,
        enableMocking: true,
    },
};

// =============================================================================
// 📊 MÉTRICAS E MONITORAMENTO
// =============================================================================

/**
 * 📈 Sistema de métricas para integração
 */
export class StrategyIntegrationMetrics {
    private logger = createLogger('strategy-integration-metrics');

    /**
     * Coleta métricas de execução
     */
    collectExecutionMetrics(
        result: AgentExecutionResult,
        context: StrategyExecutionContext,
    ) {
        return {
            execution: {
                duration: result.metadata?.execution?.executionTime || 0,
                success: result.success,
                strategy: result.metadata?.execution?.strategy,
                steps: result.metadata?.execution?.steps || 0,
            },
            context: {
                agentName: context.agentContext.agentName,
                complexity: context.metadata.complexity,
                toolsCount: context.tools.length,
                historyLength: context.history.length,
            },
            performance: {
                tokenEfficiency:
                    result.metadata?.performance?.tokenEfficiency || 0,
                toolUtilization:
                    result.metadata?.performance?.toolUtilization || 0,
                successRate: result.metadata?.performance?.successRate || 0,
            },
            resources: {
                memoryUsage: process.memoryUsage().heapUsed,
                timestamp: Date.now(),
            },
        };
    }

    /**
     * Gera relatório de saúde da integração
     */
    generateHealthReport() {
        return {
            status: 'healthy',
            components: {
                contextManager: 'operational',
                strategyExecutor: 'operational',
                runtimeIntegration: 'operational',
            },
            metrics: {
                averageExecutionTime: 0,
                successRate: 0,
                errorRate: 0,
            },
            timestamp: Date.now(),
        };
    }
}

export default {
    StrategyContextRuntimeManager,
    IntegratedStrategyExecutor,
    StrategyIntegrationExamples,
    createIntegratedStrategyExecutor,
    IntegrationConfigs,
    StrategyIntegrationMetrics,
};
