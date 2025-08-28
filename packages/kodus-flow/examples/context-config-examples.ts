/**
 * 🔥 EXEMPLOS DE CONFIGURAÇÃO DO CONTEXTNEW
 * 
 * Mostra como configurar o storage para diferentes cenários
 */

import { SDKOrchestrator } from '../src/orchestration/sdk-orchestrator.js';

// ========================================================
// 🧠 EXEMPLO 1: InMemory (default - sem configuração)
// ========================================================
const orchestratorInMemory = new SDKOrchestrator({
    llmAdapter: myLLMAdapter,
    tenantId: 'development',
    // SEM storage = InMemory automático
});

// ========================================================
// 🗄️ EXEMPLO 2: MongoDB simples
// ========================================================
const orchestratorMongoDB = new SDKOrchestrator({
    llmAdapter: myLLMAdapter,
    tenantId: 'production',
    storage: {
        connectionString: 'mongodb://localhost:27017/kodus-flow',
        database: 'minha-aplicacao',
        // Collections usam defaults: sessions, snapshots, memories
    }
});

// ========================================================
// 🎯 EXEMPLO 3: MongoDB com collections customizadas
// ========================================================
const orchestratorCustom = new SDKOrchestrator({
    llmAdapter: myLLMAdapter,
    tenantId: 'production',
    storage: {
        connectionString: 'mongodb://cluster.mongodb.net/production',
        database: 'kodus-production',
        collections: {
            sessions: 'agent-sessions-v2',      // default: 'sessions'
            snapshots: 'execution-snapshots',   // default: 'snapshots'
            memory: 'agent-memories',           // default: 'memories'
        }
    }
});

// ========================================================
// ⚙️ EXEMPLO 4: MongoDB com configurações avançadas
// ========================================================
const orchestratorAdvanced = new SDKOrchestrator({
    llmAdapter: myLLMAdapter,
    tenantId: 'enterprise',
    storage: {
        connectionString: process.env.MONGODB_URI,
        database: process.env.DATABASE_NAME || 'kodus-enterprise',
        collections: {
            sessions: 'agent-sessions',
            snapshots: 'execution-snapshots',
            memory: 'memories',
        },
        options: {
            sessionTTL: 48 * 60 * 60 * 1000,      // 48 hours (default: 24h)
            snapshotTTL: 30 * 24 * 60 * 60 * 1000, // 30 days (default: 7 days)
            maxItems: 50000,                       // Max memory items
            enableCompression: true,               // Compress data
            cleanupInterval: 600000,               // Cleanup every 10min
        }
    }
});

// ========================================================
// 🔧 EXEMPLO 5: InMemory explícito (forçar even with connectionString)
// ========================================================
const orchestratorExplicitMemory = new SDKOrchestrator({
    llmAdapter: myLLMAdapter,
    tenantId: 'testing',
    storage: {
        type: 'inmemory', // Força InMemory mesmo se tiver connectionString
        collections: {
            sessions: 'test-sessions',
            snapshots: 'test-snapshots',
            memory: 'test-memories',
        }
    }
});

// ========================================================
// 🌍 EXEMPLO 6: Por ambiente
// ========================================================
function createOrchestrator(environment: 'development' | 'production' | 'test') {
    const baseConfig = {
        llmAdapter: myLLMAdapter,
        tenantId: environment,
    };

    switch (environment) {
        case 'development':
            return new SDKOrchestrator({
                ...baseConfig,
                // Sem storage = InMemory
            });

        case 'test':
            return new SDKOrchestrator({
                ...baseConfig,
                storage: {
                    type: 'inmemory', // Força InMemory para testes
                    collections: {
                        sessions: 'test-sessions',
                        snapshots: 'test-snapshots',
                        memory: 'test-memories',
                    }
                }
            });

        case 'production':
            return new SDKOrchestrator({
                ...baseConfig,
                storage: {
                    connectionString: process.env.MONGODB_URI!,
                    database: process.env.DATABASE_NAME || 'kodus-production',
                    collections: {
                        sessions: 'prod-agent-sessions',
                        snapshots: 'prod-execution-snapshots', 
                        memory: 'prod-memories',
                    },
                    options: {
                        sessionTTL: 72 * 60 * 60 * 1000,      // 3 days
                        snapshotTTL: 30 * 24 * 60 * 60 * 1000, // 30 days
                        enableCompression: true,
                    }
                }
            });
    }
}

// ========================================================
// 🚀 EXEMPLO DE USO
// ========================================================
const orchestrator = createOrchestrator('production');

// ContextNew será configurado automaticamente baseado nas configs acima!
// MongoDB collections: prod-agent-sessions, prod-execution-snapshots, prod-memories
// TTL: 3 days para sessions, 30 days para snapshots