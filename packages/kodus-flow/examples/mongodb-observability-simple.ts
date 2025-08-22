/**
 * Exemplo: MongoDB Observabilidade Simples - Kodus Flow
 *
 * Este exemplo mostra a configuração correta para salvar
 * logs, telemetry e métricas no MongoDB.
 */

import { createOrchestration } from '../dist/index.js';

async function exampleMongoDBObservabilitySimple() {
    console.log('🚀 Iniciando exemplo de MongoDB Observabilidade Simples...\n');

    try {
        // Configuração CORRETA: MongoDB no observability, não no storage
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
                },
                correlation: {
                    enabled: true,
                    generateIds: true,
                    propagateContext: true,
                },
                // ✅ CORRETO: MongoDB configurado aqui
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
                // ❌ ERRADO: NÃO coloque observability aqui
                // observability: { ... } // Isso vai dar erro de TypeScript
            },
        });

        console.log('✅ Orchestration criado com configuração correta\n');

        // Criar e executar agente
        await orchestration.createAgent({
            name: 'simple-test-agent',
            think: async (input) => {
                return {
                    reasoning: 'Processando input para teste simples',
                    action: {
                        type: 'final_answer',
                        content: `Processado: ${input}`,
                    },
                };
            },
        });

        const result = await orchestration.callAgent(
            'simple-test-agent',
            'Teste Simples!',
        );
        console.log('✅ Agente executado:', result.success);

        // Aguardar flush
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const obs = orchestration.getObservability();
        await obs.flush();

        console.log('\n🎉 Exemplo concluído!');
        console.log('📋 Configuração correta:');
        console.log('- MongoDB configurado em: observability.mongodb');
        console.log('- Storage separado para: memory, session, snapshot');
        console.log('- NÃO use: storage.observability (vai dar erro)');
    } catch (error) {
        console.error('❌ Erro no exemplo:', error);
    } finally {
        const obs = orchestration.getObservability();
        await obs.dispose();
    }
}

// Executar exemplo
exampleMongoDBObservabilitySimple();
