/**
 * 🧪 Teste da LÓGICA do ContextNew
 * Verifica se a configuração está funcionando corretamente
 */

import { StorageEnum } from './src/core/types/allTypes.js';

// Simular a lógica do getEnhancedContextConfig
function testGetEnhancedContextConfig(storageConfig: any) {
    console.log('📋 Testando configuração:', JSON.stringify(storageConfig, null, 2));
    
    // Lógica igual ao sdk-orchestrator.ts
    const storage = storageConfig;

    // 🎯 REGRA: Se não tem storage config = InMemory
    if (!storage) {
        console.log('✅ Caso 1: Sem storage config = InMemory');
        return {
            adapterType: StorageEnum.INMEMORY,
            dbName: 'kodus-flow-memory',
            sessionsCollection: 'sessions',
            snapshotsCollection: 'snapshots',
            sessionTTL: 24 * 60 * 60 * 1000, // 24h
            snapshotTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
        };
    }

    // 🎯 REGRA: Se tem connectionString = MongoDB, senão InMemory
    const adapterType = storage.connectionString 
        ? StorageEnum.MONGODB 
        : StorageEnum.INMEMORY;

    // 🎯 Collections com defaults inteligentes
    const collections = storage.collections || {};
    const sessionsCollection = collections.sessions || 'sessions';
    const snapshotsCollection = collections.snapshots || 'snapshots';
    const memoryCollection = collections.memory || 'memories';

    // 🎯 Configurações com defaults
    const options = storage.options || {};
    const sessionTTL = options.sessionTTL || 24 * 60 * 60 * 1000; // 24h
    const snapshotTTL = options.snapshotTTL || 7 * 24 * 60 * 60 * 1000; // 7 days

    const enhancedConfig = {
        connectionString: storage.connectionString,
        adapterType,
        dbName: storage.database || 'kodus-flow',
        sessionsCollection,
        snapshotsCollection,
        sessionTTL,
        snapshotTTL,
        memory: {
            adapterType,
            adapterConfig: {
                connectionString: storage.connectionString,
                options: {
                    database: storage.database || 'kodus-flow',
                    collection: memoryCollection,
                    maxItems: options.maxItems || 10000,
                    enableCompression: options.enableCompression ?? true,
                    cleanupInterval: options.cleanupInterval || 300000,
                },
            },
        },
    };

    console.log('✅ Configuração gerada:', {
        mode: adapterType === StorageEnum.MONGODB ? 'MongoDB' : 'InMemory',
        database: enhancedConfig.dbName,
        collections: {
            sessions: sessionsCollection,
            snapshots: snapshotsCollection,
            memory: memoryCollection,
        },
        ttl: {
            sessions: `${sessionTTL / (60 * 60 * 1000)}h`,
            snapshots: `${snapshotTTL / (24 * 60 * 60 * 1000)}d`,
        },
    });

    return enhancedConfig;
}

// 🧪 TESTES
console.log('🚀 Iniciando testes do ContextNew...\n');

// Test 1: Sem configuração (InMemory default)
console.log('1️⃣ Teste: Sem configuração');
testGetEnhancedContextConfig(undefined);

console.log('\n' + '='.repeat(50) + '\n');

// Test 2: MongoDB básico
console.log('2️⃣ Teste: MongoDB básico');
testGetEnhancedContextConfig({
    connectionString: 'mongodb://localhost:27017/kodus-flow',
    database: 'minha-aplicacao'
});

console.log('\n' + '='.repeat(50) + '\n');

// Test 3: MongoDB com collections customizadas
console.log('3️⃣ Teste: MongoDB customizado');
testGetEnhancedContextConfig({
    connectionString: 'mongodb://cluster.mongodb.net/production',
    database: 'kodus-production',
    collections: {
        sessions: 'agent-sessions-v2',
        snapshots: 'execution-snapshots',
        memory: 'agent-memories',
    },
    options: {
        sessionTTL: 48 * 60 * 60 * 1000,      // 48h
        snapshotTTL: 30 * 24 * 60 * 60 * 1000, // 30 days
    }
});

console.log('\n' + '='.repeat(50) + '\n');

// Test 4: InMemory explícito
console.log('4️⃣ Teste: InMemory explícito');
testGetEnhancedContextConfig({
    type: 'inmemory',
    collections: {
        sessions: 'test-sessions',
        snapshots: 'test-snapshots',
        memory: 'test-memories',
    }
});

console.log('\n🎉 Todos os testes de lógica completados!');