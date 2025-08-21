/**
 * Teste simples para verificar MongoDB Exporter
 */

import { createOrchestration } from './dist/index.js';
import { getObservability } from './dist/observability/index.js';

async function testMongoDBExport() {
    console.log('🧪 Testando MongoDB Export...\n');

    try {
        // 1. Criar orchestration com configuração completa
        console.log('1. Criando orchestration com MongoDB...');
        const orchestration = createOrchestration({
            tenantId: 'test-tenant',
            llmAdapter: {
                name: 'mock',
                generateText: async () => ({ text: 'Mock response' }),
            },
            observability: {
                logging: { enabled: true, level: 'debug' },
                telemetry: { enabled: true },
                mongodb: {
                    type: 'mongodb',
                    connectionString: 'mongodb://localhost:27017/kodus',
                    database: 'kodus',
                    collections: {
                        logs: 'observability_logs',
                        telemetry: 'observability_telemetry',
                        metrics: 'observability_metrics',
                        errors: 'observability_errors',
                    },
                    batchSize: 10,
                    flushIntervalMs: 1000,
                    ttlDays: 30,
                    enableObservability: true,
                },
            },
        });

        // 2. Usar getObservability global
        console.log('2. Obtendo observability global...');
        const obs = getObservability();

        // 3. Criar agente simples
        console.log('3. Criando agente...');
        await orchestration.createAgent({
            name: 'test-agent',
            identity: {
                name: 'test-agent',
                description: 'Agente de teste para MongoDB',
                capabilities: ['test'],
            },
            think: async (input) => {
                console.log('🤖 Agente pensando...');
                return {
                    reasoning: 'Teste de MongoDB Export',
                    action: {
                        type: 'final_answer',
                        content: `Processado: ${input}`,
                    },
                };
            },
        });

        // 4. Executar agente
        console.log('4. Executando agente...');
        const result = await orchestration.callAgent(
            'test-agent',
            'Teste MongoDB!',
        );
        console.log('✅ Resultado:', result.success);

        // 5. Aguardar flush
        console.log('5. Aguardando flush...');
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // 6. Flush manual
        console.log('6. Flush manual...');
        await obs.flush();

        // 7. Verificar health
        console.log('7. Verificando health...');
        const health = obs.getHealthStatus();
        console.log('Health:', health.overall);

        // 8. Gerar relatório
        console.log('8. Gerando relatório...');
        const report = obs.generateReport();
        console.log('Report insights:', {
            warnings: report.insights.warnings.length,
            recommendations: report.insights.recommendations.length,
            criticalIssues: report.insights.criticalIssues.length,
        });

        console.log('\n🎉 Teste concluído!');
        console.log('📋 Verifique o MongoDB:');
        console.log('mongo kodus');
        console.log(
            'db.observability_logs.find().sort({timestamp: -1}).limit(3)',
        );
        console.log(
            'db.observability_telemetry.find().sort({timestamp: -1}).limit(3)',
        );
    } catch (error) {
        console.error('❌ Erro no teste:', error);
        console.error('Stack:', error.stack);
    } finally {
        const obs = getObservability();
        await obs.dispose();
    }
}

testMongoDBExport();
