/**
 * @file simple-high-performance-config.ts
 * @description Exemplo simples de configuração de alta performance
 *
 * Demonstra como configurar o Kodus Flow para muitas execuções:
 * - 100+ execuções simultâneas
 * - Alta throughput de eventos
 * - Auto-scaling baseado em recursos
 */

import { createOrchestration } from '../src/orchestration/index.js';
import { createMockLLMProvider } from '../src/adapters/llm/index.js';
import { createLogger } from '../src/observability/index.js';

const logger = createLogger('simple-high-performance');

/**
 * Configuração de Alta Performance para Muitas Execuções
 */
async function configuracaoAltaPerformance() {
    logger.info('🚀 Configurando para Alta Performance');

    try {
        // Criar orchestration otimizado para muitas execuções
        const orchestrator = createOrchestration({
            llmAdapter: createMockLLMProvider(),
            enableObservability: true,
            defaultTimeout: 15000, // Timeout menor para velocidade
            defaultMaxIterations: 5, // Menos iterações para velocidade

            // Configuração de persistência otimizada
            persistorConfig: {
                type: 'memory', // Mais rápido que MongoDB/Redis para testes
                maxSnapshots: 5000, // Mais snapshots
                enableCompression: true, // Compressão para economizar memória
                enableDeltaCompression: true, // Compressão delta
                cleanupInterval: 60000, // Cleanup mais frequente
            },
        });

        // Criar agente otimizado para performance
        await orchestrator.createAgent({
            name: 'performance-agent',
            identity: {
                role: 'High Performance Processor',
                goal: 'Process large volumes efficiently',
                description: 'Agent optimized for high throughput',
            },
            planner: 'react', // Planner mais rápido
            maxIterations: 3, // Menos iterações
        });

        // Simular muitas execuções simultâneas
        logger.info('📊 Iniciando 100 execuções simultâneas...');

        const promises = [];
        for (let i = 0; i < 100; i++) {
            promises.push(
                orchestrator.callAgent('performance-agent', {
                    input: `Data ${i}`,
                    thread: { id: `thread-${i}`, type: 'user' },
                }),
            );
        }

        const results = await Promise.allSettled(promises);

        const successCount = results.filter(
            (r) => r.status === 'fulfilled',
        ).length;
        const errorCount = results.filter(
            (r) => r.status === 'rejected',
        ).length;

        logger.info(`✅ Resultados:`);
        logger.info(`   - Sucessos: ${successCount}/100`);
        logger.info(`   - Erros: ${errorCount}/100`);
        logger.info(
            `   - Taxa de sucesso: ${((successCount / 100) * 100).toFixed(1)}%`,
        );
    } catch (error) {
        logger.error(
            '❌ Erro na configuração:',
            error instanceof Error ? error : new Error('Unknown error'),
        );
    }
}

/**
 * Comparação de Configurações
 */
function compararConfiguracoes() {
    logger.info('📊 Comparação de Configurações de Performance');

    const configs = [
        {
            name: 'Development',
            maxConcurrent: 10,
            queueSize: 1000,
            batchSize: 100,
            autoScaling: false,
        },
        {
            name: 'Production',
            maxConcurrent: 200,
            queueSize: 25000,
            batchSize: 750,
            autoScaling: true,
        },
        {
            name: 'High Performance',
            maxConcurrent: 500,
            queueSize: 50000,
            batchSize: 1000,
            autoScaling: true,
        },
    ];

    for (const config of configs) {
        logger.info(`\n🔧 ${config.name}:`);
        logger.info(
            `   - Concorrência: ${config.maxConcurrent} execuções simultâneas`,
        );
        logger.info(`   - Fila: ${config.queueSize} eventos`);
        logger.info(`   - Batch: ${config.batchSize} eventos por batch`);
        logger.info(
            `   - Auto-scaling: ${config.autoScaling ? 'Habilitado' : 'Desabilitado'}`,
        );
    }
}

/**
 * Executar exemplo
 */
async function executarExemplo() {
    logger.info('🚀 Iniciando Exemplo de Alta Performance');

    try {
        // Mostrar comparação
        compararConfiguracoes();

        // Executar teste de performance
        await configuracaoAltaPerformance();

        logger.info('✅ Exemplo concluído com sucesso!');
    } catch (error) {
        logger.error(
            '❌ Erro ao executar exemplo:',
            error instanceof Error ? error : new Error('Unknown error'),
        );
    }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
    executarExemplo();
}

export { configuracaoAltaPerformance, compararConfiguracoes, executarExemplo };
