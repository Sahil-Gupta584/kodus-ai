/**
 * Teste para debugar a configuração
 */

import { getObservability } from './dist/observability/index.js';

async function testConfigDebug() {
    console.log('🧪 Testando configuração...\n');

    try {
        // Simular a configuração que você está passando
        const config = {
            environment: 'development',
            logging: { enabled: true, level: 'info' },
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
            telemetry: {
                enabled: true,
                serviceName: 'kodus-flow',
                sampling: { rate: 1, strategy: 'probabilistic' },
                privacy: { includeSensitiveData: false },
                spanTimeouts: {
                    enabled: true,
                    maxDurationMs: 5 * 60 * 1000,
                },
            },
            correlation: {
                enabled: true,
                generateIds: true,
                propagateContext: true,
            },
        };

        console.log('1. Configuração que será passada:');
        console.log(JSON.stringify(config, null, 2));

        console.log('\n2. Verificando se mongodb existe:');
        console.log('config.mongodb:', !!config.mongodb);
        console.log('typeof config.mongodb:', typeof config.mongodb);
        console.log('config.mongodb keys:', Object.keys(config.mongodb || {}));

        // 3. Passar a configuração
        console.log('\n3. Passando configuração...');
        const obs = getObservability(config);

        // 4. Aguardar um pouco
        console.log('\n4. Aguardando inicialização...');
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // 5. Verificar health
        console.log('\n5. Verificando health...');
        const health = obs.getHealthStatus();
        console.log('Health:', health.overall);

    } catch (error) {
        console.error('❌ Erro no teste:', error);
        console.error('Stack:', error.stack);
    } finally {
        const obs = getObservability();
        await obs.dispose();
    }
}

testConfigDebug();
