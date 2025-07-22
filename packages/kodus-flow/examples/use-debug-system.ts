/**
 * @file use-debug-system.ts
 * @description Como usar o Debug System no Kodus Flow
 */

import { getGlobalDebugSystem } from '../src/observability/debugging.js';

async function usarDebugSystem() {
    console.log('🎯 USANDO DEBUG SYSTEM');
    console.log('═'.repeat(80));

    // 1. Configurar debug system
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

    // 2. Simular execução com debug
    debugSystem.setCorrelationId('corr_debug_example');

    debugSystem.log('info', 'agent', '🔄 Iniciando execução de agente', {
        agentName: 'conversation-agent',
        input: 'Listar repositórios',
    });

    // 3. Medir performance
    const measurementId = debugSystem.startMeasurement(
        'tool_execution',
        'performance',
    );

    // Simular execução de ferramenta
    await new Promise((resolve) => setTimeout(resolve, 100));

    const measurement = debugSystem.endMeasurement(measurementId);

    debugSystem.log('info', 'tool', '✅ Ferramenta executada', {
        toolName: 'github_repos',
        duration: measurement?.duration,
        resultCount: 94,
    });

    // 4. Gerar relatório completo
    const report = debugSystem.generateReport();

    console.log('\n📊 RELATÓRIO DE DEBUG:');
    console.log(JSON.stringify(report, null, 2));

    // 5. Ver traces de eventos
    const traces = debugSystem.getEventTraces();
    console.log('\n🔍 EVENT TRACES:', traces.length);

    // 6. Ver métricas de performance
    const measurements = debugSystem.getCompletedMeasurements();
    console.log('\n⏱️ PERFORMANCE MEASUREMENTS:', measurements.length);
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
    usarDebugSystem().catch(console.error);
}

export { usarDebugSystem };
