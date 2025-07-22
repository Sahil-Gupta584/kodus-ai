/**
 * @file run-all-examples.ts
 * @description Executar todos os exemplos de visualização de logs
 */

import { usarTimelineViewer } from './use-timeline-viewer.js';
import { usarDebugSystem } from './use-debug-system.js';
import { usarObservabilidadeIntegrada } from './use-integrated-observability.js';

async function executarTodosExemplos() {
    console.log('🚀 EXECUTANDO TODOS OS EXEMPLOS DE VISUALIZAÇÃO DE LOGS');
    console.log('═'.repeat(80));

    try {
        // 1. Timeline Viewer
        console.log('\n1️⃣ TIMELINE VIEWER');
        console.log('─'.repeat(40));
        await usarTimelineViewer();

        // 2. Debug System
        console.log('\n2️⃣ DEBUG SYSTEM');
        console.log('─'.repeat(40));
        await usarDebugSystem();

        // 3. Observabilidade Integrada
        console.log('\n3️⃣ OBSERVABILIDADE INTEGRADA');
        console.log('─'.repeat(40));
        await usarObservabilidadeIntegrada();

        console.log('\n✅ TODOS OS EXEMPLOS EXECUTADOS COM SUCESSO!');
        console.log('\n📋 RESUMO DO QUE VOCÊ PODE USAR:');
        console.log('• docker logs kodus-orchestrator -f (logs básicos)');
        console.log('• createTimelineViewer() (timeline visual)');
        console.log('• getGlobalDebugSystem() (debug avançado)');
        console.log('• getIntegratedObservability() (sistema completo)');
    } catch (error) {
        console.error('❌ Erro ao executar exemplos:', error);
    }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
    executarTodosExemplos().catch(console.error);
}

export { executarTodosExemplos };
