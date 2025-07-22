/**
 * @file log-visualization-example.ts
 * @description Exemplos práticos de como visualizar logs no Kodus Flow
 */

import { createLogger } from '../src/observability/logger.js';
import { createTimelineViewer } from '../src/observability/timeline-viewer.js';
import { getGlobalDebugSystem } from '../src/observability/debugging.js';
// import { orchestration } from '../src/orchestration/index.js';

// ────────────────────────────────────────────────────────────────────────────────
// 🎯 EXEMPLO 1: LOGS BÁSICOS NO CONSOLE
// ────────────────────────────────────────────────────────────────────────────────

export async function exemploLogsBasicos() {
    console.log('🎯 EXEMPLO 1: LOGS BÁSICOS NO CONSOLE');
    console.log('═'.repeat(80));

    // Configurar logger
    const logger = createLogger('exemplo', 'debug');

    // Simular execução de agente
    logger.info('🤖 Agente iniciado', { agentName: 'conversation-agent' });
    logger.debug('🔍 Processando input', { input: 'Listar repositórios' });
    logger.info('🛠️ Executando ferramenta', { toolName: 'github_repos' });
    logger.info('✅ Ferramenta executada com sucesso', {
        toolName: 'github_repos',
        resultCount: 94,
    });

    console.log('\n📋 LOGS VISUALIZADOS NO CONSOLE:');
    console.log('• Timestamp ISO formatado');
    console.log('• Nível do log (DEBUG, INFO, WARN, ERROR)');
    console.log('• Nome do componente');
    console.log('• Mensagem + contexto estruturado');
}

// ────────────────────────────────────────────────────────────────────────────────
// 🎯 EXEMPLO 2: TIMELINE VISUAL ASCII
// ────────────────────────────────────────────────────────────────────────────────

export async function exemploTimelineVisual() {
    console.log('\n🎯 EXEMPLO 2: TIMELINE VISUAL ASCII');
    console.log('═'.repeat(80));

    // Criar viewer de timeline
    const viewer = createTimelineViewer();

    // Simular correlationId de uma execução
    const correlationId = 'corr_1753195380368_plo8906kn';

    // Mostrar timeline em formato ASCII
    const timeline = viewer.showTimeline(correlationId, {
        format: 'ascii',
        showData: true,
        showPerformance: true,
        maxEvents: 10,
    });

    console.log(timeline);

    console.log('\n📋 TIMELINE VISUAL INCLUI:');
    console.log('• Ícones visuais para cada tipo de evento');
    console.log('• Timestamps relativos');
    console.log('• Estados de execução');
    console.log('• Performance metrics');
    console.log('• Correlation IDs para rastreamento');
}

// ────────────────────────────────────────────────────────────────────────────────
// 🎯 EXEMPLO 3: DEBUG SYSTEM AVANÇADO
// ────────────────────────────────────────────────────────────────────────────────

export async function exemploDebugSistema() {
    console.log('\n🎯 EXEMPLO 3: DEBUG SYSTEM AVANÇADO');
    console.log('═'.repeat(80));

    // Configurar sistema de debug
    const debugSystem = getGlobalDebugSystem({
        enabled: true,
        level: 'debug',
        features: {
            eventTracing: true,
            performanceProfiling: true,
            stateInspection: true,
            errorAnalysis: true,
        },
        outputs: [
            {
                name: 'console',
                write: (entry) => console.log('🐛 DEBUG:', entry),
            },
        ],
        maxEventHistory: 1000,
        autoFlush: true,
        flushInterval: 5000,
    });

    // Simular execução com debug
    debugSystem.setCorrelationId('corr_debug_example');

    debugSystem.log('info', 'agent', '🔄 Iniciando execução de agente', {
        agentName: 'conversation-agent',
        input: 'Listar repositórios',
    });

    // Medir performance
    const measurementId = debugSystem.startMeasurement(
        'tool_execution',
        'performance',
    );

    // Simular execução de ferramenta
    await new Promise((resolve) => setTimeout(resolve, 100));

    debugSystem.endMeasurement(measurementId);

    debugSystem.log('info', 'tool', '✅ Ferramenta executada', {
        toolName: 'github_repos',
        resultCount: 94,
    });

    // Gerar relatório
    const report = debugSystem.generateReport();

    console.log('\n📊 RELATÓRIO DE DEBUG:');
    console.log(JSON.stringify(report, null, 2));
}

// ────────────────────────────────────────────────────────────────────────────────
// 🎯 EXEMPLO 4: LOGS EM ARQUIVO
// ────────────────────────────────────────────────────────────────────────────────

export async function exemploLogsArquivo() {
    console.log('\n🎯 EXEMPLO 4: LOGS EM ARQUIVO');
    console.log('═'.repeat(80));

    // Configurar debug system com output em arquivo
    const debugSystem = getGlobalDebugSystem({
        enabled: true,
        level: 'debug',
        outputs: [
            {
                name: 'file',
                write: async (entry) => {
                    const fs = await import('fs');
                    const logEntry = `${new Date(entry.timestamp).toISOString()} [${entry.level.toUpperCase()}] ${entry.message}\n`;
                    fs.appendFileSync('./logs/kodus-flow.log', logEntry);
                },
            },
        ],
    });

    // Simular logs
    debugSystem.log('info', '📝 Log salvo em arquivo', {
        file: './logs/kodus-flow.log',
        timestamp: Date.now(),
    });

    console.log('✅ Logs salvos em: ./logs/kodus-flow.log');
    console.log('📋 VANTAGENS DO LOG EM ARQUIVO:');
    console.log('• Persistência dos logs');
    console.log('• Análise posterior');
    console.log('• Backup e auditoria');
    console.log('• Análise de tendências');
}

// ────────────────────────────────────────────────────────────────────────────────
// 🎯 EXEMPLO 5: FILTROS E BUSCA
// ────────────────────────────────────────────────────────────────────────────────

export async function exemploFiltrosBusca() {
    console.log('\n🎯 EXEMPLO 5: FILTROS E BUSCA');
    console.log('═'.repeat(80));

    // Configurar debug system com memória
    const debugSystem = getGlobalDebugSystem({
        enabled: true,
        level: 'debug',
        outputs: [
            {
                name: 'memory',
                write: (entry) => {
                    // Entrada salva em memória para busca
                },
            },
        ],
    });

    // Simular múltiplos eventos
    const events = [
        { level: 'info', message: 'Agente iniciado', category: 'event' },
        { level: 'debug', message: 'Processando input', category: 'event' },
        {
            level: 'info',
            message: 'Ferramenta executada',
            category: 'performance',
        },
        { level: 'error', message: 'Erro na execução', category: 'error' },
        {
            level: 'warn',
            message: 'Timeout detectado',
            category: 'performance',
        },
    ];

    events.forEach((event) => {
        debugSystem.log(event.level as any, event.message, {
            category: event.category,
            timestamp: Date.now(),
        });
    });

    console.log('🔍 FILTROS DISPONÍVEIS:');
    console.log('• Por nível: debug, info, warn, error');
    console.log('• Por categoria: event, performance, state, error');
    console.log('• Por tempo: range de timestamps');
    console.log('• Por correlationId: rastreamento específico');
    console.log('• Por componente: agent, tool, kernel, runtime');
}

// ────────────────────────────────────────────────────────────────────────────────
// 🎯 EXEMPLO 6: MONITORAMENTO EM TEMPO REAL
// ────────────────────────────────────────────────────────────────────────────────

export async function exemploMonitoramentoTempoReal() {
    console.log('\n🎯 EXEMPLO 6: MONITORAMENTO EM TEMPO REAL');
    console.log('═'.repeat(80));

    console.log('📊 MÉTRICAS EM TEMPO REAL:');
    console.log('• Eventos por segundo');
    console.log('• Performance de ferramentas');
    console.log('• Taxa de erro');
    console.log('• Uso de memória');
    console.log('• Tempo de resposta');

    console.log('\n🎛️ CONTROLES:');
    console.log('• Pausar/retomar logs');
    console.log('• Mudar nível de log');
    console.log('• Filtrar eventos');
    console.log('• Exportar dados');
    console.log('• Configurar alertas');
}

// ────────────────────────────────────────────────────────────────────────────────
// 🎯 EXEMPLO 7: COMANDOS PRÁTICOS
// ────────────────────────────────────────────────────────────────────────────────

export function comandosPraticos() {
    console.log('\n🎯 EXEMPLO 7: COMANDOS PRÁTICOS');
    console.log('═'.repeat(80));

    console.log('📋 COMANDOS PARA VISUALIZAR LOGS:');
    console.log('');
    console.log('1. LOGS BÁSICOS:');
    console.log('   • Console: logs aparecem automaticamente');
    console.log('   • Arquivo: tail -f logs/kodus-flow.log');
    console.log('   • Docker: docker logs kodus-orchestrator');
    console.log('');
    console.log('2. TIMELINE VISUAL:');
    console.log('   • showTimeline(correlationId)');
    console.log('   • showTimeline(correlationId, { format: "detailed" })');
    console.log('   • showTimeline(correlationId, { showPerformance: true })');
    console.log('');
    console.log('3. DEBUG AVANÇADO:');
    console.log('   • debugSystem.generateReport()');
    console.log('   • debugSystem.getEventTraces()');
    console.log('   • debugSystem.getCompletedMeasurements()');
    console.log('');
    console.log('4. FILTROS:');
    console.log('   • Por correlationId: grep "corr_123" logs/kodus-flow.log');
    console.log('   • Por tipo: grep "tool.execute" logs/kodus-flow.log');
    console.log('   • Por erro: grep "ERROR" logs/kodus-flow.log');
    console.log('');
    console.log('5. ANÁLISE:');
    console.log(
        '   • Performance: debugSystem.getMeasurementsByCategory("performance")',
    );
    console.log('   • Erros: debugSystem.getRecentErrors()');
    console.log('   • Timeline: viewer.generateReport(correlationId)');
}

// ────────────────────────────────────────────────────────────────────────────────
// 🎯 EXECUTAR TODOS OS EXEMPLOS
// ────────────────────────────────────────────────────────────────────────────────

export async function executarTodosExemplos() {
    await exemploLogsBasicos();
    await exemploTimelineVisual();
    await exemploDebugSistema();
    await exemploLogsArquivo();
    await exemploFiltrosBusca();
    await exemploMonitoramentoTempoReal();
    comandosPraticos();
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
    executarTodosExemplos().catch(console.error);
}
