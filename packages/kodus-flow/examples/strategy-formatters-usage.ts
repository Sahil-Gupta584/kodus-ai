/**
 * 🎯 EXEMPLO DE USO: Strategy Formatters
 *
 * Demonstra como usar os novos utilitários de formatação
 * criados especificamente para a arquitetura de strategies.
 */

import {
    StrategyFormatters,
    StrategyUtils,
    Tool,
    AgentContext,
} from '../src/engine/strategies/index.js';

// =============================================================================
// 📝 EXEMPLO BÁSICO DE FORMATAÇÃO
// =============================================================================

/**
 * Exemplo básico de formatação de ferramentas
 */
function exemploBasicoFormatacao() {
    console.log('🎯 Exemplo Básico de Formatação\n');

    const formatters = new StrategyFormatters();

    // Exemplo de ferramenta com parâmetros complexos
    const sampleTool: Tool = {
        name: 'analyze_data',
        description: 'Analisa conjunto de dados com filtros avançados',
        parameters: {
            type: 'object',
            properties: {
                dataset: {
                    type: 'string',
                    description: 'Nome do dataset para análise',
                },
                filters: {
                    type: 'object',
                    properties: {
                        dateRange: {
                            type: 'object',
                            properties: {
                                start: { type: 'string', format: 'date' },
                                end: { type: 'string', format: 'date' },
                            },
                        },
                        categories: {
                            type: 'array',
                            items: { type: 'string' },
                            maxItems: 10,
                        },
                    },
                },
                options: {
                    type: 'object',
                    properties: {
                        includeStats: { type: 'boolean', default: true },
                        format: {
                            type: 'string',
                            enum: ['json', 'csv', 'xml'],
                        },
                    },
                },
            },
            required: ['dataset'],
        },
    };

    // Formatar parâmetros da ferramenta
    const formattedParams = formatters.formatToolParameters(sampleTool);
    console.log('📋 Parâmetros Formatados:');
    console.log(formattedParams);
    console.log();

    // Estimar complexidade
    const complexity = formatters.estimateComplexity(
        'Analise as vendas do último trimestre por categoria',
        [sampleTool],
    );
    console.log(`🎯 Complexidade Estimada: ${complexity}`);
    console.log();
}

// =============================================================================
// 📊 EXEMPLO AVANÇADO COM CONTEXTO
// =============================================================================

/**
 * Exemplo avançado com context e validação
 */
function exemploAvancadoComContexto() {
    console.log('🚀 Exemplo Avançado com Contexto\n');

    const utils = new StrategyUtils();

    // Contexto de exemplo
    const agentContext: AgentContext = {
        agentName: 'analista-inteligente',
        sessionId: 'session-123',
        correlationId: 'corr-456',
        tenantId: 'tenant-demo',
    };

    // Ferramentas de exemplo
    const tools: Tool[] = [
        {
            name: 'search_database',
            description: 'Busca dados no banco de dados',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Consulta SQL ou filtro',
                    },
                    limit: { type: 'number', default: 100, maximum: 1000 },
                },
                required: ['query'],
            },
        },
        {
            name: 'generate_report',
            description: 'Gera relatório baseado em dados',
            parameters: {
                type: 'object',
                properties: {
                    data: { type: 'array', items: { type: 'object' } },
                    format: { type: 'string', enum: ['pdf', 'excel', 'html'] },
                    title: { type: 'string' },
                },
                required: ['data', 'format'],
            },
        },
    ];

    // 1. Validar contexto
    const validation = utils.validateStrategyContext({
        input: 'Gere um relatório das vendas por categoria',
        tools,
        agentContext,
    });

    console.log('✅ Validação do Contexto:');
    console.log(`   Válido: ${validation.valid}`);
    if (validation.errors.length > 0) {
        console.log('   Erros:', validation.errors);
    }
    console.log();

    // 2. Formatar lista completa de ferramentas
    const toolsList = utils.formatToolsList(tools);
    console.log('🛠️ Lista de Ferramentas Formatada:');
    console.log(toolsList);
    console.log();

    // 3. Compor prompt ReAct
    const reactPrompt = utils.composeReActPrompt({
        input: 'Gere um relatório das vendas por categoria',
        tools,
        agentContext,
        history: [
            {
                type: 'think',
                thought: {
                    reasoning: 'Preciso buscar dados de vendas primeiro',
                    action: { type: 'tool_call', toolName: 'search_database' },
                },
            },
        ],
    });

    console.log('📝 Prompt ReAct Composto:');
    console.log(reactPrompt.substring(0, 500) + '...\n');

    // 4. Validar prompt composto
    const promptValidation = utils.validateComposedPrompt(reactPrompt);
    console.log('🔍 Validação do Prompt:');
    console.log(`   Válido: ${promptValidation.valid}`);
    console.log(
        `   Tokens Estimados: ${promptValidation.metrics.estimatedTokens}`,
    );
    console.log(`   Seções: ${promptValidation.metrics.sections}`);
    if (promptValidation.warnings.length > 0) {
        console.log('   Avisos:', promptValidation.warnings);
    }
    console.log();

    // 5. Verificar adequação da estratégia
    const strategyFit = utils.validateStrategyFit(
        'Gere um relatório das vendas por categoria',
        tools,
        'react',
    );

    console.log('🎯 Adequação da Estratégia:');
    console.log(`   Recomendada: ${strategyFit.recommended}`);
    console.log(`   Confiança: ${(strategyFit.confidence * 100).toFixed(1)}%`);
    console.log(`   Justificativa: ${strategyFit.reasoning}`);
    console.log();
}

// =============================================================================
// 📈 EXEMPLO COM MÉTRICAS
// =============================================================================

/**
 * Exemplo com métricas e cache
 */
function exemploComMetricas() {
    console.log('📊 Exemplo com Métricas e Cache\n');

    const utils = new StrategyUtils();

    // Simular execução
    utils.recordExecutionMetrics('react', {
        inputLength: 45,
        toolsCount: 2,
        executionTime: 2500,
        steps: 3,
        success: true,
    });

    // Obter estatísticas
    const stats = utils.getAggregatedStats('react');
    console.log('📈 Estatísticas Agregadas:');
    console.log(`   Total de Execuções: ${stats.totalExecutions}`);
    console.log(`   Taxa de Sucesso: ${(stats.successRate * 100).toFixed(1)}%`);
    console.log(`   Tempo Médio: ${stats.avgExecutionTime}ms`);
    console.log(`   Passos Médios: ${stats.avgSteps}`);
    console.log();

    // Estatísticas do cache
    const cacheStats = utils.getCacheStats();
    console.log('💾 Estatísticas do Cache:');
    console.log(`   Itens em Cache: ${cacheStats.size}`);
    console.log(`   Capacidade Máxima: ${cacheStats.maxSize}`);
    console.log(`   TTL: ${cacheStats.ttl / 1000}s`);
    console.log();

    // Análise de tendências
    const trends = utils.analyzeTrends();
    console.log('📊 Análise de Tendências:');
    if (trends.message) {
        console.log(`   ${trends.message}`);
    } else {
        console.log(`   Período: ${trends.period}`);
        console.log(
            `   Taxa de Sucesso Média: ${(trends.avgSuccessRate * 100).toFixed(1)}%`,
        );
        console.log(`   Tempo Médio: ${trends.avgExecutionTime}ms`);
        console.log(`   Tendência: ${trends.trend}`);
    }
    console.log();
}

// =============================================================================
// 🎨 EXEMPLO COM HELPERS DE FORMATAÇÃO
// =============================================================================

/**
 * Exemplo usando os helpers de formatação
 */
function exemploHelpersFormatacao() {
    console.log('🎨 Exemplo com Helpers de Formatação\n');

    const {
        FormattingHelpers,
    } = require('../src/engine/strategies/prompts/strategy-utils.js');

    // Formatação de duração
    console.log('⏱️ Durações:');
    console.log(`   500ms: ${FormattingHelpers.formatDuration(500)}`);
    console.log(`   45000ms: ${FormattingHelpers.formatDuration(45000)}`);
    console.log(`   3723000ms: ${FormattingHelpers.formatDuration(3723000)}`);
    console.log();

    // Formatação de números
    console.log('🔢 Números:');
    console.log(`   1234: ${FormattingHelpers.formatNumber(1234)}`);
    console.log(`   567890: ${FormattingHelpers.formatNumber(567890)}`);
    console.log();

    // Formatação de percentuais
    console.log('📊 Percentuais:');
    console.log(`   15/20: ${FormattingHelpers.formatPercentage(15, 20)}`);
    console.log(`   7/10: ${FormattingHelpers.formatPercentage(7, 10)}`);
    console.log();

    // Formatação de tamanho de dados
    console.log('💾 Tamanhos de Dados:');
    console.log(`   1024 bytes: ${FormattingHelpers.formatDataSize(1024)}`);
    console.log(
        `   1048576 bytes: ${FormattingHelpers.formatDataSize(1048576)}`,
    );
    console.log(
        `   2147483648 bytes: ${FormattingHelpers.formatDataSize(2147483648)}`,
    );
    console.log();

    // Formatação de tempo relativo
    console.log('🕐 Tempo Relativo:');
    const now = Date.now();
    console.log(`   Agora: ${FormattingHelpers.formatRelativeTime(now)}`);
    console.log(
        `   5min atrás: ${FormattingHelpers.formatRelativeTime(now - 5 * 60 * 1000)}`,
    );
    console.log(
        `   2h atrás: ${FormattingHelpers.formatRelativeTime(now - 2 * 60 * 60 * 1000)}`,
    );
    console.log(
        `   3d atrás: ${FormattingHelpers.formatRelativeTime(now - 3 * 24 * 60 * 60 * 1000)}`,
    );
    console.log();

    // Sanitização para prompts
    console.log('🧹 Sanitização para Prompts:');
    const unsafeText = 'Texto com *markdown* e `code` e [links](url)';
    console.log(`   Original: ${unsafeText}`);
    console.log(
        `   Sanitizado: ${FormattingHelpers.sanitizeForPrompt(unsafeText)}`,
    );
    console.log();

    // Truncamento inteligente
    console.log('✂️ Truncamento Inteligente:');
    const longText =
        'Esta é uma frase muito longa que precisa ser truncada porque excede o limite de caracteres permitido para exibição';
    console.log(`   Original (${longText.length} chars): ${longText}`);
    console.log(
        `   Truncado: ${FormattingHelpers.smartTruncate(longText, 50)}`,
    );
    console.log();
}

// =============================================================================
// 🚀 EXECUÇÃO DOS EXEMPLOS
// =============================================================================

/**
 * Executa todos os exemplos
 */
export function runAllExamples() {
    console.log('🎯 EXECUTANDO TODOS OS EXEMPLOS DE STRATEGY FORMATTERS\n');
    console.log('='.repeat(70));
    console.log();

    try {
        exemploBasicoFormatacao();
        console.log('='.repeat(70));
        console.log();

        exemploAvancadoComContexto();
        console.log('='.repeat(70));
        console.log();

        exemploComMetricas();
        console.log('='.repeat(70));
        console.log();

        exemploHelpersFormatacao();
        console.log('='.repeat(70));
        console.log();

        console.log('✅ TODOS OS EXEMPLOS EXECUTADOS COM SUCESSO!');
    } catch (error) {
        console.error('❌ ERRO na execução dos exemplos:', error);
    }
}

// =============================================================================
// 🎯 USO INDIVIDUAL
// =============================================================================

// Para executar apenas um exemplo específico:
// exemploBasicoFormatacao();
// exemploAvancadoComContexto();
// exemploComMetricas();
// exemploHelpersFormatacao();

// Para executar todos:
// runAllExamples();

export {
    exemploBasicoFormatacao,
    exemploAvancadoComContexto,
    exemploComMetricas,
    exemploHelpersFormatacao,
    runAllExamples,
};
