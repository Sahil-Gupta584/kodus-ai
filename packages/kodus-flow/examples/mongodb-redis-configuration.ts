/**
 * @file mongodb-redis-configuration.ts
 * @description Exemplos de configuração MongoDB e Redis para Kodus Flow
 *
 * Este arquivo demonstra as 3 opções de configuração:
 * 1. MongoDB para ambos (persistor + memory)
 * 2. MongoDB para persistor + Redis para memory
 * 3. Redis para ambos
 */

import { createOrchestration } from '../src/orchestration/index.js';
import { createMockLLMProvider } from '../src/adapters/llm/index.js';
import { createLogger } from '../src/observability/index.js';

const logger = createLogger('mongodb-redis-configuration');

/**
 * OPÇÃO 1: MongoDB para ambos (Recomendado)
 *
 * Vantagens:
 * - Simplicidade: uma única tecnologia
 * - Consistência: mesmo padrão de dados
 * - Facilidade de backup e restore
 * - Menos infraestrutura para gerenciar
 *
 * Desvantagens:
 * - MongoDB não é otimizado para cache
 * - Latência maior para operações de cache
 * - Menos flexibilidade para diferentes casos de uso
 */
async function mongodbForBothExample() {
    logger.info('=== OPÇÃO 1: MONGODB PARA AMBOS ===');

    const orchestrator = createOrchestration({
        // LLM obrigatório para agents
        llmAdapter: createMockLLMProvider(),

        // Tenant identification
        tenantId: 'tenant-mongodb-both',

        // Configuração de persistor (snapshots do kernel)
        persistorConfig: {
            type: 'mongodb',
            connectionString:
                process.env.MONGODB_URI ||
                'mongodb://localhost:27017/kodus-flow',
            database: 'kodus-flow',
            collection: 'kernel-snapshots', // Snapshots de execução
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 30000,
            ttl: 7 * 24 * 60 * 60 * 1000, // 7 dias
            maxSnapshots: 10000,
            enableCompression: true,
            enableDeltaCompression: true,
            cleanupInterval: 300000, // 5 minutos
        },

        // Configurações padrão
        enableObservability: true,
        defaultTimeout: 30000,
        defaultPlanner: 'react',
        defaultMaxIterations: 10,
    });

    try {
        // Criar agente
        await orchestrator.createAgent({
            name: 'mongodb-agent',
            identity: {
                role: 'Data Processor',
                goal: 'Process data with MongoDB persistence',
                description:
                    'Agent that uses MongoDB for both persistor and memory',
            },
        });

        // Executar agente
        const result = await orchestrator.callAgent(
            'mongodb-agent',
            'Process this data and save to MongoDB',
        );

        logger.info('MongoDB for both result:', {
            success: result.success,
            duration: result.duration,
            metadata: result.metadata,
        });

        // Verificar estatísticas
        const stats = orchestrator.getStats();
        logger.info('Orchestrator stats:', stats);
    } catch (error) {
        logger.error(
            'MongoDB for both example failed:',
            error instanceof Error ? error : new Error('Unknown error'),
        );
    }
}

/**
 * OPÇÃO 2: MongoDB para persistor + Redis para memory
 *
 * Vantagens:
 * - MongoDB para dados persistentes (snapshots)
 * - Redis para cache rápido (memory manager)
 * - Performance otimizada para cada caso de uso
 * - Flexibilidade para diferentes padrões de acesso
 *
 * Desvantagens:
 * - Duas tecnologias para gerenciar
 * - Maior complexidade de infraestrutura
 * - Necessidade de sincronização entre sistemas
 */
async function mongodbPersistorRedisMemoryExample() {
    logger.info('=== OPÇÃO 2: MONGODB PERSISTOR + REDIS MEMORY ===');

    const orchestrator = createOrchestration({
        // LLM obrigatório para agents
        llmAdapter: createMockLLMProvider(),

        // Tenant identification
        tenantId: 'tenant-mongodb-redis',

        // Configuração de persistor (MongoDB para snapshots)
        persistorConfig: {
            type: 'mongodb',
            connectionString:
                process.env.MONGODB_URI ||
                'mongodb://localhost:27017/kodus-flow',
            database: 'kodus-flow',
            collection: 'kernel-snapshots',
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 30000,
            ttl: 7 * 24 * 60 * 60 * 1000, // 7 dias
            maxSnapshots: 10000,
            enableCompression: true,
            enableDeltaCompression: true,
            cleanupInterval: 300000, // 5 minutos
        },

        // Configurações padrão
        enableObservability: true,
        defaultTimeout: 30000,
        defaultPlanner: 'react',
        defaultMaxIterations: 10,
    });

    try {
        // Criar agente
        await orchestrator.createAgent({
            name: 'hybrid-agent',
            identity: {
                role: 'Hybrid Data Processor',
                goal: 'Process data with MongoDB persistence and Redis cache',
                description:
                    'Agent that uses MongoDB for snapshots and Redis for memory',
            },
        });

        // Executar agente
        const result = await orchestrator.callAgent(
            'hybrid-agent',
            'Process this data with hybrid storage',
        );

        logger.info('MongoDB + Redis result:', {
            success: result.success,
            duration: result.duration,
            metadata: result.metadata,
        });

        // Verificar estatísticas
        const stats = orchestrator.getStats();
        logger.info('Orchestrator stats:', stats);
    } catch (error) {
        logger.error(
            'MongoDB + Redis example failed:',
            error instanceof Error ? error : new Error('Unknown error'),
        );
    }
}

/**
 * OPÇÃO 3: Redis para ambos
 *
 * Vantagens:
 * - Performance máxima para cache
 * - Baixa latência
 * - Simplicidade de uma tecnologia
 * - Redis é otimizado para cache
 *
 * Desvantagens:
 * - Redis não é ideal para dados persistentes
 * - Risco de perda de dados em caso de falha
 * - Limitações de espaço em memória
 * - Menos robusto para dados críticos
 */
async function redisForBothExample() {
    logger.info('=== OPÇÃO 3: REDIS PARA AMBOS ===');

    const orchestrator = createOrchestration({
        // LLM obrigatório para agents
        llmAdapter: createMockLLMProvider(),

        // Tenant identification
        tenantId: 'tenant-redis-both',

        // Configuração de persistor (Redis para snapshots)
        persistorConfig: {
            type: 'redis',
            connectionString: process.env.REDIS_URI || 'redis://localhost:6379',
            database: '0',
            ttl: 24 * 60 * 60 * 1000, // 24 horas (em millisegundos)
            maxSnapshots: 5000, // Menos que MongoDB devido ao espaço
            enableCompression: true,
            enableDeltaCompression: false, // Redis já é rápido
            cleanupInterval: 60000, // 1 minuto (mais frequente)
        },

        // Configurações padrão
        enableObservability: true,
        defaultTimeout: 30000,
        defaultPlanner: 'react',
        defaultMaxIterations: 10,
    });

    try {
        // Criar agente
        await orchestrator.createAgent({
            name: 'redis-agent',
            identity: {
                role: 'Fast Cache Processor',
                goal: 'Process data with Redis for maximum speed',
                description:
                    'Agent that uses Redis for both persistor and memory',
            },
        });

        // Executar agente
        const result = await orchestrator.callAgent(
            'redis-agent',
            'Process this data with Redis storage',
        );

        logger.info('Redis for both result:', {
            success: result.success,
            duration: result.duration,
            metadata: result.metadata,
        });

        // Verificar estatísticas
        const stats = orchestrator.getStats();
        logger.info('Orchestrator stats:', stats);
    } catch (error) {
        logger.error(
            'Redis for both example failed:',
            error instanceof Error ? error : new Error('Unknown error'),
        );
    }
}

/**
 * Exemplo de configuração avançada com múltiplos tenants
 */
async function advancedMultiTenantExample() {
    logger.info('=== CONFIGURAÇÃO AVANÇADA MULTI-TENANT ===');

    // Tenant 1: MongoDB para ambos (produção)
    const productionOrchestrator = createOrchestration({
        llmAdapter: createMockLLMProvider(),
        tenantId: 'production-tenant',
        persistorConfig: {
            type: 'mongodb',
            connectionString:
                process.env.MONGODB_PROD_URI ||
                'mongodb://localhost:27017/kodus-prod',
            database: 'kodus-prod',
            collection: 'kernel-snapshots',
            maxPoolSize: 20,
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 30000,
            ttl: 30 * 24 * 60 * 60 * 1000, // 30 dias
            maxSnapshots: 50000,
            enableCompression: true,
            enableDeltaCompression: true,
            cleanupInterval: 600000, // 10 minutos
        },
        enableObservability: true,
        defaultTimeout: 60000, // 1 minuto
        defaultPlanner: 'react',
        defaultMaxIterations: 15,
    });

    // Tenant 2: Redis para ambos (desenvolvimento)
    const developmentOrchestrator = createOrchestration({
        llmAdapter: createMockLLMProvider(),
        tenantId: 'development-tenant',
        persistorConfig: {
            type: 'redis',
            connectionString:
                process.env.REDIS_DEV_URI || 'redis://localhost:6379',
            database: '1', // Database diferente (string)
            ttl: 2 * 60 * 60 * 1000, // 2 horas (em millisegundos)
            maxSnapshots: 1000,
            enableCompression: true,
            enableDeltaCompression: false,
            cleanupInterval: 30000, // 30 segundos
        },
        enableObservability: true,
        defaultTimeout: 15000, // 15 segundos
        defaultPlanner: 'react',
        defaultMaxIterations: 5,
    });

    try {
        // Criar agentes em diferentes tenants
        await productionOrchestrator.createAgent({
            name: 'prod-agent',
            identity: {
                role: 'Production Data Processor',
                goal: 'Process production data with high reliability',
            },
        });

        await developmentOrchestrator.createAgent({
            name: 'dev-agent',
            identity: {
                role: 'Development Data Processor',
                goal: 'Process development data with fast iteration',
            },
        });

        // Executar agentes
        const prodResult = await productionOrchestrator.callAgent(
            'prod-agent',
            'Process production data',
        );

        const devResult = await developmentOrchestrator.callAgent(
            'dev-agent',
            'Process development data',
        );

        logger.info('Multi-tenant results:', {
            production: {
                success: prodResult.success,
                duration: prodResult.duration,
            },
            development: {
                success: devResult.success,
                duration: devResult.duration,
            },
        });

        // Verificar estatísticas
        const prodStats = productionOrchestrator.getStats();
        const devStats = developmentOrchestrator.getStats();

        logger.info('Multi-tenant stats:', {
            production: prodStats,
            development: devStats,
        });
    } catch (error) {
        logger.error(
            'Multi-tenant example failed:',
            error instanceof Error ? error : new Error('Unknown error'),
        );
    }
}

/**
 * Função principal para executar todos os exemplos
 */
async function main() {
    try {
        logger.info('🚀 Iniciando exemplos de configuração MongoDB/Redis');

        // Executar exemplos
        await mongodbForBothExample();
        await mongodbPersistorRedisMemoryExample();
        await redisForBothExample();
        await advancedMultiTenantExample();

        logger.info('✅ Todos os exemplos executados com sucesso');
    } catch (error) {
        logger.error(
            '❌ Erro ao executar exemplos:',
            error instanceof Error ? error : new Error('Unknown error'),
        );
    }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export {
    mongodbForBothExample,
    mongodbPersistorRedisMemoryExample,
    redisForBothExample,
    advancedMultiTenantExample,
};
