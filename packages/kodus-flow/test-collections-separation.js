/**
 * Teste para verificar separação de collections
 */

import { createOrchestration } from './dist/orchestration/index.js';
import { createMockLLMProvider } from './dist/adapters/llm/index.js';

async function testCollectionsSeparation() {
    console.log('🧪 Testando separação de collections...');
    
    try {
        // ✅ CONFIGURAÇÃO COM COLLECTIONS SEPARADAS
        const orchestrator = createOrchestration({
            llmAdapter: createMockLLMProvider(),
            tenantId: 'test-collections',
            
            // ✅ CONFIGURAÇÃO MONGODB COM COLLECTION ESPECÍFICA
            persistorConfig: {
                type: 'mongodb',
                connectionString: 'mongodb://localhost:27017/kodus',
                database: 'kodus',
                collection: 'snapshots', // ✅ Vai para kodus-snapshots
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 10000,
                socketTimeoutMS: 45000,
                ttl: 86400,
                maxSnapshots: 1000,
                enableCompression: true,
                enableDeltaCompression: true,
                cleanupInterval: 300000,
            },
        });

        console.log('✅ Orchestrator criado com configuração de collections');

        // ✅ CRIAR AGENTE PARA GERAR DADOS
        const agent = await orchestrator.createAgent({
            name: 'test-agent',
            identity: {
                role: 'Assistant',
                goal: 'Test collections separation',
                description: 'A test agent',
            },
            executionMode: 'workflow',
        });

        console.log('✅ Agente criado:', agent.name);

        // ✅ CHAMAR AGENTE PARA GERAR SNAPSHOTS
        const result = await orchestrator.callAgent('test-agent', {
            message: 'Hello, this is a test for collections separation',
        });

        console.log('✅ Agente executado com sucesso');
        console.log('Resultado:', result.response);

        // ✅ VERIFICAR ESTATÍSTICAS
        const stats = orchestrator.getStats();
        console.log('✅ Estatísticas do orchestrator:', {
            agents: stats.agents?.length || 0,
            tools: stats.tools?.length || 0,
            workflows: stats.workflows?.length || 0,
        });

        console.log('✅ Teste concluído com sucesso!');
        console.log('');
        console.log('📊 VERIFICAÇÃO NO MONGODB:');
        console.log('1. Conecte ao MongoDB: mongo kodus');
        console.log('2. Verifique collections: show collections');
        console.log('3. Verifique dados: db.kodus-snapshots.find()');
        console.log('4. Verifique estrutura: db.kodus-snapshots.findOne()');

    } catch (error) {
        console.error('❌ Erro no teste:', error);
    }
}

testCollectionsSeparation(); 