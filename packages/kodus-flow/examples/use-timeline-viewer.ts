/**
 * @file use-timeline-viewer.ts
 * @description Como usar o Timeline Viewer no Kodus Flow
 */

import { createTimelineViewer } from '../src/observability/timeline-viewer.js';

async function usarTimelineViewer() {
    console.log('🎯 USANDO TIMELINE VIEWER');
    console.log('═'.repeat(80));

    // 1. Criar viewer
    const viewer = createTimelineViewer();

    // 2. Usar correlationId de uma execução real
    const correlationId = 'corr_1753195380368_plo8906kn'; // Do seu log

    // 3. Mostrar timeline ASCII
    console.log('📊 TIMELINE ASCII:');
    const timeline = viewer.showTimeline(correlationId, {
        format: 'ascii',
        showData: true,
        showPerformance: true,
        maxEvents: 10,
    });
    console.log(timeline);

    // 4. Mostrar timeline detalhado
    console.log('\n📋 TIMELINE DETALHADO:');
    const detailed = viewer.showTimeline(correlationId, {
        format: 'detailed',
        showData: true,
        showPerformance: true,
    });
    console.log(detailed);

    // 5. Gerar relatório
    console.log('\n📈 RELATÓRIO:');
    const report = viewer.generateReport(correlationId);
    console.log(report);

    // 6. Export para JSON
    console.log('\n💾 EXPORT JSON:');
    const json = viewer.exportToJSON(correlationId);
    console.log(json);
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
    usarTimelineViewer().catch(console.error);
}

export { usarTimelineViewer };
