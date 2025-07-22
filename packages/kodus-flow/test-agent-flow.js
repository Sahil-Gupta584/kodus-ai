/**
 * Teste simples para validar o fluxo agnético completo
 * Think→Act→Observe com ReAct planner
 */

import { SDKOrchestrator } from './dist/orchestration/sdk-orchestrator.js';
import { createMockLLMAdapter } from './dist/adapters/llm/mock-provider.js';

async function testAgentFlow() {
    console.log('🧪 Iniciando teste do fluxo agnético...');
    
    try {
        // 1. Setup do LLM adapter mock primeiro
        const llmAdapter = createMockLLMAdapter({
            responses: {
                react: {
                    reasoning: "Vou usar uma tool para buscar informações",
                    steps: [{
                        tool: "mock_tool", 
                        arguments: { query: "test" },
                        description: "Buscando informações de teste"
                    }]
                }
            }
        });

        // 2. Setup do SDK com ReAct planner e LLM adapter
        const orchestrator = new SDKOrchestrator({
            llmAdapter, // ✅ LLM adapter é obrigatório
            agents: {
                'test-agent': {
                    name: 'test-agent',
                    type: 'conversational',
                    planner: 'react',
                    maxThinkingIterations: 3,
                }
            },
            tenant: { id: 'test-tenant' }
        });

        // 3. Configurar uma tool mock simples  
        const { z } = await import('zod');
        orchestrator.createTool({
            name: 'mock_tool',
            description: 'Tool de teste que retorna informações mockadas',
            inputSchema: z.object({
                query: z.string().describe('Query de busca')
            }),
            execute: async (params) => {
                console.log('🔧 Mock tool executada com:', params);
                return { result: `Resultado mock para: ${params.query}` };
            }
        });

        // 4. Executar o agente
        console.log('🚀 Executando agente com Think→Act→Observe...');
        
        const result = await orchestrator.execute('test-agent', 'Busque informações sobre testes', {
            sessionId: 'test-session'
        });

        console.log('✅ Resultado da execução:', result);

        // 5. Verificações básicas
        if (!result) {
            throw new Error('❌ Nenhum resultado retornado');
        }

        if (result.success !== true) {
            throw new Error('❌ Execução não foi bem-sucedida');
        }

        console.log('🎉 Teste do fluxo agnético PASSOU!');
        
        return {
            success: true,
            result,
            message: 'Fluxo Think→Act→Observe funcionando corretamente'
        };

    } catch (error) {
        console.error('❌ Erro no teste do fluxo agnético:', error);
        return {
            success: false,
            error: error.message,
            message: 'Fluxo agnético com problemas'
        };
    }
}

// Executar teste se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
    testAgentFlow()
        .then(result => {
            console.log('\n📊 Resultado final do teste:', result);
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Erro fatal no teste:', error);
            process.exit(1);
        });
}

export { testAgentFlow };