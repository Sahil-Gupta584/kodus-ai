/**
 * Teste simples para verificar se ContextNew funciona
 */

const { EnhancedContextBuilder } = require('./dist/core/contextNew/index.js');

async function testContextNew() {
    console.log('🧪 Testando ContextNew...');
    
    try {
        // Test 1: InMemory (sem configuração)
        console.log('\n1️⃣ Teste InMemory (padrão):');
        const builder1 = EnhancedContextBuilder.getInstance();
        console.log('✅ EnhancedContextBuilder criado (InMemory)');
        
        // Reset para próximo teste
        EnhancedContextBuilder.resetInstance();
        
        // Test 2: InMemory explícito
        console.log('\n2️⃣ Teste InMemory explícito:');
        const builder2 = EnhancedContextBuilder.configure({
            adapterType: 'INMEMORY',
            dbName: 'test-db',
            sessionsCollection: 'test-sessions',
            snapshotsCollection: 'test-snapshots',
        });
        console.log('✅ EnhancedContextBuilder configurado (InMemory explícito)');
        
        // Test 3: Inicializar sessão
        console.log('\n3️⃣ Teste inicializar sessão:');
        await builder2.initializeAgentSession(
            'test-session-123',
            'test-user',
            'test-tenant',
            {
                availableTools: ['tool1', 'tool2'],
                activeConnections: {}
            }
        );
        console.log('✅ Sessão inicializada');
        
        // Test 4: Obter ContextBridge
        console.log('\n4️⃣ Teste ContextBridge:');
        const contextBridge = builder2.getContextBridge();
        console.log('✅ ContextBridge obtido:', !!contextBridge);
        
        // Test 5: Build final response context
        console.log('\n5️⃣ Teste buildFinalResponseContext:');
        const mockPlannerContext = {
            sessionId: 'test-session-123',
            agentName: 'test-agent',
            correlationId: 'test-corr-123'
        };
        
        const finalContext = await builder2.buildFinalResponseContext(mockPlannerContext);
        console.log('✅ FinalResponseContext criado:', {
            hasContext: !!finalContext,
            hasRuntimeContext: !!finalContext?.runtime,
            hasRecoveryInfo: !!finalContext?.recovery
        });
        
        console.log('\n🎉 Todos os testes passaram! ContextNew está funcionando.');
        
    } catch (error) {
        console.error('❌ Erro no teste:', error.message);
        console.error('Stack:', error.stack);
    }
}

testContextNew();