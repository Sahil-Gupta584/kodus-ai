/**
 * Exemplo: MongoDB Observabilidade - Kodus Flow
 *
 * Este exemplo mostra como configurar a observabilidade para salvar
 * logs, telemetry e métricas no MongoDB.
 */

import { createOrchestration } from '../dist/index.js';
import { getObservability } from '../dist/observability/index.js';

async function exampleMongoDBObservability() {
    console.log('🚀 Iniciando exemplo de MongoDB Observabilidade...\n');

    try {
        // 1. Configurar observabilidade com MongoDB
        console.log('📋 1. Configurando observabilidade com MongoDB...');
        const obs = getObservability({
            environment: 'development',
            logging: { level: 'debug' },
            telemetry: { enabled: true },
            monitoring: { enabled: true },
            debugging: { enabled: true },

            // MongoDB Export Configuration
            mongodb: {
                connectionString: 'mongodb://localhost:27017/kodus',
                database: 'kodus',
                collections: {
                    logs: 'observability_logs',
                    telemetry: 'observability_telemetry',
                    metrics: 'observability_metrics',
                    errors: 'observability_errors',
                },
                batchSize: 50,
                flushIntervalMs: 3000, // 3 segundos
                ttlDays: 30, // 30 dias de retenção
                enableObservability: true,
            },
        });
        console.log('✅ Observabilidade configurada com MongoDB\n');

        // 2. Criar orchestration
        console.log('🎛️ 2. Criando orchestration...');
        const orchestration = createOrchestration({
            enableKernelIntegration: true,
            enableObservability: true,
            observability: {
                mongodb: {
                    connectionString: 'mongodb://localhost:27017/kodus',
                    database: 'kodus',
                    collections: {
                        logs: 'observability_logs',
                        telemetry: 'observability_telemetry',
                        metrics: 'observability_metrics',
                        errors: 'observability_errors',
                    },
                    batchSize: 50,
                    flushIntervalMs: 3000,
                    ttlDays: 30,
                    enableObservability: true,
                },
            },
        });
        console.log('✅ Orchestration criado\n');

        // 3. Criar agente simples
        console.log('🤖 3. Criando agente...');
        await orchestration.createAgent({
            name: 'mongodb-test-agent',
            think: async (input) => {
                console.log('🧠 Agente pensando...');
                return {
                    reasoning: 'Processando input para teste de MongoDB',
                    action: {
                        type: 'final_answer',
                        content: `Processado no MongoDB: ${input}`,
                    },
                };
            },
        });
        console.log('✅ Agente criado\n');

        // 4. Executar agente (isso vai gerar logs, telemetry e métricas)
        console.log('⚡ 4. Executando agente...');
        const result = await orchestration.callAgent(
            'mongodb-test-agent',
            'Teste MongoDB!',
        );
        console.log('✅ Agente executado\n');

        // 5. Verificar resultado
        console.log('📊 5. Resultado da execução:');
        console.log('Success:', result.success);
        console.log('Result:', result.result);
        console.log('Context:', result.context);
        console.log('Metadata:', result.metadata);

        // 6. Aguardar flush para MongoDB
        console.log('\n⏳ 6. Aguardando flush para MongoDB...');
        await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 segundos

        // 7. Flush manual
        console.log('🔄 7. Flush manual...');
        await obs.flush();
        console.log('✅ Flush concluído\n');

        // 8. Verificar health status
        console.log('🏥 8. Verificando health status...');
        const health = obs.getHealthStatus();
        console.log('Health Status:', {
            overall: health.overall,
            components: Object.keys(health.components).map((key) => ({
                component: key,
                status: health.components[key as keyof typeof health.components]
                    .status,
            })),
        });

        // 9. Gerar relatório
        console.log('📊 9. Gerando relatório...');
        const report = obs.generateReport();
        console.log('Observability Report:', {
            timestamp: new Date(report.timestamp).toISOString(),
            environment: report.environment,
            health: report.health.overall,
            insights: {
                warnings: report.insights.warnings.length,
                recommendations: report.insights.recommendations.length,
                criticalIssues: report.insights.criticalIssues.length,
            },
        });

        console.log('\n🎉 Exemplo concluído com sucesso!');
        console.log('\n📋 Dados salvos no MongoDB:');
        console.log('- Collection: observability_logs');
        console.log('- Collection: observability_telemetry');
        console.log('- Collection: observability_metrics');
        console.log('- Collection: observability_errors');
        console.log('\n🔍 Para verificar os dados:');
        console.log('mongo kodus');
        console.log(
            'db.observability_logs.find().sort({timestamp: -1}).limit(5)',
        );
        console.log(
            'db.observability_telemetry.find().sort({timestamp: -1}).limit(5)',
        );
    } catch (error) {
        console.error('❌ Erro no exemplo:', error);
        console.error('Stack:', error.stack);
    } finally {
        // Cleanup
        const obs = getObservability();
        await obs.dispose();
    }
}

// Executar exemplo
exampleMongoDBObservability();
