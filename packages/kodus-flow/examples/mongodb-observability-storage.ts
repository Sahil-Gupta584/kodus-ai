/**
 * Exemplo: MongoDB Observabilidade via Storage - Kodus Flow
 *
 * Este exemplo mostra como configurar a observabilidade para salvar
 * logs, telemetry e métricas no MongoDB usando a configuração de storage.
 */

import { createOrchestration } from '../dist/index.js';

async function exampleMongoDBObservabilityStorage() {
    console.log(
        '🚀 Iniciando exemplo de MongoDB Observabilidade via Storage...\n',
    );

    try {
        // 1. Criar orchestration com configuração de storage para observabilidade
        console.log(
            '🎛️ 1. Criando orchestration com storage para observabilidade...',
        );
        const orchestration = createOrchestration({
            tenantId: 'kodus-agent-conversation',
            enableKernelIntegration: true,
            enableObservability: true,
            observability: {
                logging: { enabled: true, level: 'info' },
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
                // MongoDB Export Configuration
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
            },
            storage: {
                memory: {
                    type: 'mongodb',
                    connectionString: 'mongodb://localhost:27017/kodus',
                    database: 'kodus',
                    collection: 'memories',
                },
                session: {
                    type: 'mongodb',
                    connectionString: 'mongodb://localhost:27017/kodus',
                    database: 'kodus',
                    collection: 'sessions',
                },
                snapshot: {
                    type: 'mongodb',
                    connectionString: 'mongodb://localhost:27017/kodus',
                    database: 'kodus',
                    collection: 'snapshots',
                },
            },
        });
        console.log(
            '✅ Orchestration criado com storage para observabilidade\n',
        );

        // 2. Criar agente simples
        console.log('🤖 2. Criando agente...');
        await orchestration.createAgent({
            name: 'storage-test-agent',
            think: async (input) => {
                console.log('🧠 Agente pensando...');
                return {
                    reasoning: 'Processando input para teste de storage',
                    action: {
                        type: 'final_answer',
                        content: `Processado via storage: ${input}`,
                    },
                };
            },
        });
        console.log('✅ Agente criado\n');

        // 3. Executar agente (isso vai gerar logs, telemetry e métricas)
        console.log('⚡ 3. Executando agente...');
        const result = await orchestration.callAgent(
            'storage-test-agent',
            'Teste Storage!',
        );
        console.log('✅ Agente executado\n');

        // 4. Verificar resultado
        console.log('📊 4. Resultado da execução:');
        console.log('Success:', result.success);
        console.log('Result:', result.result);
        console.log('Context:', result.context);
        console.log('Metadata:', result.metadata);

        // 5. Aguardar flush para MongoDB
        console.log('\n⏳ 5. Aguardando flush para MongoDB...');
        await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 segundos

        // 6. Flush manual
        console.log('🔄 6. Flush manual...');
        const obs = orchestration.getObservability();
        await obs.flush();
        console.log('✅ Flush concluído\n');

        // 7. Verificar health status
        console.log('🏥 7. Verificando health status...');
        const health = obs.getHealthStatus();
        console.log('Health Status:', {
            overall: health.overall,
            components: Object.keys(health.components).map((key) => ({
                component: key,
                status: health.components[key as keyof typeof health.components]
                    .status,
            })),
        });

        // 8. Gerar relatório
        console.log('📊 8. Gerando relatório...');
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
        console.log('\n📋 Dados salvos no MongoDB via storage:');
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
        console.log('\n💡 Vantagens da configuração via storage:');
        console.log('- Configuração unificada com outros storages');
        console.log('- Reutilização da mesma conexão MongoDB');
        console.log('- Configuração mais limpa e organizada');
        console.log('- Compatibilidade com padrões existentes');
    } catch (error) {
        console.error('❌ Erro no exemplo:', error);
        console.error('Stack:', error.stack);
    } finally {
        // Cleanup
        const obs = orchestration.getObservability();
        await obs.dispose();
    }
}

// Executar exemplo
exampleMongoDBObservabilityStorage();
