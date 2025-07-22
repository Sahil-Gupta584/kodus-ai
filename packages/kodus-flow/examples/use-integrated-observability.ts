/**
 * @file use-integrated-observability.ts
 * @description Como usar o Sistema Integrado de Observabilidade no Kodus Flow
 */

import { getIntegratedObservability } from '../src/observability/integrated-observability.js';

async function usarObservabilidadeIntegrada() {
    console.log('🎯 USANDO OBSERVABILIDADE INTEGRADA');
    console.log('═'.repeat(80));

    // 1. Obter sistema integrado
    const obs = getIntegratedObservability();

    // 2. Inicializar (se necessário)
    await obs.initialize();

    // 3. Publicar eventos
    await obs.publishEvent(
        'USER_ACTION',
        {
            userId: 'user-123',
            action: 'list_repositories',
            timestamp: Date.now(),
        },
        'user-service',
    );

    // 4. Simular operação
    console.log('Simulando operação...');
    await new Promise((resolve) => setTimeout(resolve, 50));
    console.log('Operação concluída');

    // 6. Obter timeline viewer
    const viewer = obs.getTimelineViewer();
    const correlationId = 'corr_1753195380368_plo8906kn';

    console.log('\n📊 TIMELINE:');
    const timeline = viewer.showTimeline(correlationId, {
        format: 'ascii',
        showPerformance: true,
    });
    console.log(timeline);

    // 7. Obter debug system
    const debug = obs.getDebugging();
    const report = debug.generateReport();

    console.log('\n📈 RELATÓRIO INTEGRADO:');
    console.log(JSON.stringify(report, null, 2));

    // 8. Obter telemetry
    const telemetry = obs.getTelemetry();
    const metrics = telemetry.getMetrics();

    console.log('\n📊 MÉTRICAS:', Object.keys(metrics).length);

    // 9. Obter monitoring
    const monitoring = obs.getMonitoring();
    if (monitoring) {
        const systemMetrics = monitoring.getSystemMetrics();
        console.log('\n💻 MÉTRICAS DO SISTEMA:', systemMetrics);
    }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
    usarObservabilidadeIntegrada().catch(console.error);
}

export { usarObservabilidadeIntegrada };
