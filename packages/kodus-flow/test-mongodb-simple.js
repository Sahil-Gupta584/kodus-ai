/**
 * Teste simples para verificar MongoDB Exporter
 */

import { getObservability } from './dist/observability/index.js';

async function testMongoDBSimple() {
    console.log('🧪 Testando MongoDB Exporter...\n');

    try {
        // 1. Configurar observabilidade com MongoDB
        console.log('1. Configurando observabilidade...');
        const obs = getObservability({
            environment: 'development',
            logging: { level: 'debug' },
            telemetry: { enabled: true },
            monitoring: { enabled: true },
            debugging: { enabled: true },
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
        });

        // 2. Aguardar um pouco
        console.log('2. Aguardando inicialização...');
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // 3. Verificar health
        console.log('3. Verificando health...');
        const health = obs.getHealthStatus();
        console.log('Health:', health.overall);

        // 4. Gerar alguns logs
        console.log('4. Gerando logs...');
        obs.logger.info('Teste de log para MongoDB');
        obs.logger.error('Teste de erro para MongoDB');

        // 5. Aguardar flush
        console.log('5. Aguardando flush...');
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // 6. Flush manual
        console.log('6. Flush manual...');
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

testMongoDBSimple();
