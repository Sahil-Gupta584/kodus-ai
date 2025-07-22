/**
 * Script de Debug para React Planner
 *
 * Para usar:
 * 1. Coloque breakpoints neste arquivo
 * 2. Use a configuração "🔧 Debug React Planner" no VSCode
 * 3. Pressione F5 para iniciar o debug
 */

import { createOrchestration } from './src/orchestration/index.js';
import { createGeminiProviderFromEnv } from './src/core/llm/providers/gemini-provider.js';
import { createLLMAdapter } from './src/adapters/llm/index.js';

async function debugReactPlanner() {
    console.log('🚀 Iniciando debug do React Planner...');

    try {
        // 1. Criar LLM Provider
        console.log('📡 Criando LLM Provider...');
        const geminiProvider = createGeminiProviderFromEnv();
        const llmAdapter = createLLMAdapter({ provider: geminiProvider });

        // 2. Criar Orchestrator
        console.log('🎯 Criando Orchestrator...');
        const orchestrator = createOrchestration({
            llmAdapter,
            enableObservability: true,
        });

        // 3. Criar Tool de Teste
        console.log('🔧 Criando tool de teste...');
        const calculatorTool = orchestrator.createTool({
            name: 'calculator',
            description: 'Calculadora simples para debug',
            inputSchema: {
                type: 'object',
                properties: { expression: { type: 'string' } },
            },
            execute: async (input: unknown) => {
                const typedInput = input as { expression: string };
                console.log('🔧 Executando calculator tool:', typedInput);
                const result = eval(typedInput.expression);
                console.log('🔧 Resultado:', result);
                return { result };
            },
        });

        // 4. Criar Agent com React Planner
        console.log('🤖 Criando agent com React Planner...');
        const agent = await orchestrator.createAgent({
            name: 'debug-agent',
            identity: {
                name: 'debug-agent',
                description: 'Agent para debug do React Planner',
                capabilities: ['tool_execution'],
            },
            planner: 'react', // ✅ IMPORTANTE: Usar React Planner
        });

        // 5. Testar Agent
        console.log('🎯 Testando agent...');
        const result = await orchestrator.callAgent(
            'debug-agent',
            'Calcule 2 + 2',
        );

        console.log('✅ Resultado final:', result);
    } catch (error) {
        console.error('❌ Erro durante debug:', error);
        throw error;
    }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
    debugReactPlanner().catch(console.error);
}

export { debugReactPlanner };
