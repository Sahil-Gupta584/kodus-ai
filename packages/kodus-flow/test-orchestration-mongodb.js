/**
 * Teste que simula o comportamento do orchestration
 */

import { createOrchestration } from './dist/index.js';
import { getObservability } from './dist/observability/index.js';

async function testOrchestrationMongoDB() {
    console.log('🧪 Testando orchestration com MongoDB...\n');

    try {
        // 1. Simular a configuração que você está passando
        const config = {
            tenantId: 'kodus-agent-conversation',
            llmAdapter: {
                name: 'mock',
                generateText: async () => ({ text: 'Mock response' }),
            },
            observability: {
                logging: { enabled: true, level: 'debug' },
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
                    batchSize: 100,
                    flushIntervalMs: 5000,
                    ttlDays: 30,
                    enableObservability: true,
                },
                telemetry: { enabled: true },
                correlation: { enabled: true },
            },
        };

        console.log('1. Configuração que será passada:');
        console.log('observability.mongodb:', !!config.observability.mongodb);

        // 2. Criar orchestration
        console.log('\n2. Criando orchestration...');
        const orchestration = createOrchestration(config);

        // 3. Aguardar um pouco
        console.log('\n3. Aguardando inicialização...');
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // 4. Verificar observability
        console.log('\n4. Verificando observability...');
        const obs = getObservability();
        const health = obs.getHealthStatus();
        console.log('Health:', health.overall);

        // 5. Gerar alguns logs
        console.log('\n5. Gerando logs...');
        obs.logger.info('Teste de log via orchestration');
        obs.logger.error('Teste de erro via orchestration');

        // 6. Aguardar flush
        console.log('\n6. Aguardando flush...');
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // 7. Flush manual
        console.log('\n7. Flush manual...');
        await obs.flush();

        console.log('\n🎉 Teste concluído!');
        console.log('📋 Verifique o MongoDB:');
        console.log('mongo kodus');
        console.log(
            'db.observability_logs.find().sort({timestamp: -1}).limit(3)',
        );

    } catch (error) {
        console.error('❌ Erro no teste:', error);
        console.error('Stack:', error.stack);
    } finally {
        const obs = getObservability();
        await obs.dispose();
    }
}

testOrchestrationMongoDB();
