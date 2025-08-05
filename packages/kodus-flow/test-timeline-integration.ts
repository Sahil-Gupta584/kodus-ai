/**
 * Teste de integração do Timeline com Orchestration
 *
 * Este teste verifica se:
 * 1. Timeline é criado durante execução
 * 2. Orchestration pode acessar timeline
 * 3. Visualização funciona corretamente
 */

import { createOrchestration } from './src/orchestration/sdk-orchestrator.js';
import { createMockLLMAdapter } from './src/adapters/llm/mock-adapter.js';

async function testTimelineIntegration() {
    console.log('🧪 TESTE: Timeline Integration');
    console.log('='.repeat(50));

    try {
        // 1. Setup
        console.log('1️⃣ Setup do Orchestration...');
        const mockLLM = createMockLLMAdapter();
        const orchestration = createOrchestration({
            llmAdapter: mockLLM,
            enableObservability: true, // ✅ Importante!
            tenantId: 'test-tenant',
        });

        // 2. Criar agente
        console.log('2️⃣ Criando agente...');
        await orchestration.createAgent({
            name: 'testAgent',
            identity: { name: 'TestAgent', role: 'tester' },
        });

        // 3. Executar agente
        console.log('3️⃣ Executando agente...');
        const result = await orchestration.callAgent(
            'testAgent',
            'Teste de timeline integration',
        );

        // 4. Verificar resultado
        console.log('4️⃣ Verificando resultado...');
        if (!result.success) {
            throw new Error(`Execução falhou: ${result.error}`);
        }

        const correlationId = result.context.correlationId;
        console.log('✅ CorrelationId:', correlationId);

        // 5. Verificar se timeline existe
        console.log('5️⃣ Verificando timeline...');
        const hasTimeline = orchestration.hasTimeline(correlationId);
        console.log('✅ Timeline existe:', hasTimeline);

        if (!hasTimeline) {
            throw new Error('Timeline não foi criado!');
        }

        // 6. Obter timeline
        console.log('6️⃣ Obtendo timeline...');
        const timeline = orchestration.getExecutionTimeline(correlationId);
        console.log('✅ Timeline obtido com sucesso!');
        console.log('\n📊 TIMELINE:');
        console.log(timeline);

        // 7. Obter timeline raw
        console.log('7️⃣ Obtendo timeline raw...');
        const rawTimeline = orchestration.getRawTimeline(correlationId);
        if (rawTimeline) {
            console.log('✅ Timeline raw:');
            console.log('- Entries:', rawTimeline.entries.length);
            console.log('- Estado:', rawTimeline.currentState);
            console.log('- Duração:', rawTimeline.totalDuration, 'ms');
            console.log('- Transições:', rawTimeline.transitions.length);
        }

        // 8. Listar execuções ativas
        console.log('8️⃣ Listando execuções ativas...');
        const activeExecutions = orchestration.getActiveExecutions();
        console.log('✅ Execuções ativas:', activeExecutions.length);
        console.log(activeExecutions);

        // 9. Testar export
        console.log('9️⃣ Testando export...');
        const jsonExport = orchestration.exportTimelineJSON(correlationId);
        console.log('✅ JSON export:', jsonExport.substring(0, 100) + '...');

        // 10. Testar relatório
        console.log('🔟 Testando relatório...');
        const report = orchestration.getExecutionReport(correlationId);
        console.log('✅ Relatório gerado com sucesso!');

        console.log('\n🎉 TESTE CONCLUÍDO COM SUCESSO!');
        console.log('✅ Timeline integration está funcionando perfeitamente!');
    } catch (error) {
        console.error('❌ ERRO NO TESTE:', error);
        throw error;
    }
}

// Executar teste
if (import.meta.url === `file://${process.argv[1]}`) {
    testTimelineIntegration()
        .then(() => {
            console.log('✅ Teste finalizado com sucesso!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Teste falhou:', error);
            process.exit(1);
        });
}

export { testTimelineIntegration };
