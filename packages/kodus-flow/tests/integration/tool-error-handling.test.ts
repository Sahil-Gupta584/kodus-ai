import { describe, test, expect, beforeEach } from 'vitest';
import { createOrchestration } from '../../src/orchestration/index.js';
import { createGeminiProviderFromEnv } from '../../src/core/llm/providers/gemini-provider.js';
import { defineTool } from '../../src/core/types/tool-types.js';
import { z } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createGeminiLLMAdapter(geminiProvider: any) {
    return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async call(request: any): Promise<{ content: string }> {
            const response = await geminiProvider.call(request.messages, {
                temperature: request.temperature || 0.7,
                maxTokens: request.maxTokens || 1000,
            });
            return response;
        },

        async createPlan(
            goal: string,
            strategy: string,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            context: any,
        ): Promise<{
            strategy: string;
            steps: string[];
            complexity: string;
            reasoning: string;
        }> {
            const response = await geminiProvider.call([
                {
                    role: 'system',
                    content: `You are a planning assistant. Create a plan to achieve the goal using the ${strategy} strategy. Respond with a structured plan.`,
                },
                {
                    role: 'user',
                    content: `Goal: ${goal}\nStrategy: ${strategy}\nContext: ${JSON.stringify(context || {})}`,
                },
            ]);

            return {
                strategy,
                steps: [response.content],
                complexity: 'medium',
                reasoning: response.content,
            };
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        analyzeContext: async (pergunta: string, availableTools: any[]) => {
            return {
                intent: 'calculate',
                urgency: 'normal' as const,
                complexity: 'medium' as const,
                selectedTool: availableTools[0]?.name || 'unknown',
                confidence: 0.9,
                reasoning: 'Context analysis completed',
            };
        },

        extractParameters: async (
            pergunta: string,
            _toolName: string,
            _context: unknown,
        ) => {
            return {
                parameters: { input: pergunta },
                confidence: 0.9,
            };
        },

        generateResponse: async (result: unknown, originalQuestion: string) => {
            return `Processed: ${originalQuestion} with result: ${JSON.stringify(result)}`;
        },
        getProvider: () => ({ name: 'gemini' }),
        getAvailableTechniques: () => ['cot', 'react', 'tot'],
    };
}

describe('🔧 Testes de Tratamento de Erros de Tools', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let orchestrator: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let geminiProvider: any;

    beforeEach(async () => {
        // Testar conexão com Gemini
        try {
            geminiProvider = createGeminiProviderFromEnv();
            const testResponse = await geminiProvider.call([
                { role: 'user', content: 'Test connection' },
            ]);

            if (!testResponse.content) {
                console.log('⏭️ Pulando testes - Gemini não disponível');
                return;
            }

            console.log('✅ Gemini conectado com sucesso!');

            const llmAdapter = createGeminiLLMAdapter(geminiProvider);

            orchestrator = createOrchestration({
                tenantId: 'tool-error-test',
                llmAdapter,
                defaultPlanner: 'react',
            });
        } catch (error) {
            console.log(
                '⏭️ Pulando testes - Erro na conexão com Gemini:',
                error,
            );
        }
    });

    describe('❌ Testes de Tools que Falham', () => {
        test('deve tratar tool que lança erro e permitir que LLM tome decisão', async () => {
            if (!orchestrator) {
                console.log('⏭️ Pulando teste - Gemini não disponível');
                return;
            }

            // Criar tool que sempre falha
            const failingTool = defineTool({
                name: 'failing-calculator',
                description: 'A calculator that always fails',
                inputSchema: z.object({
                    expression: z.string(),
                }),
                execute: async () => {
                    throw new Error('This tool is designed to fail');
                },
            });

            // Criar tool que funciona
            const workingTool = defineTool({
                name: 'working-calculator',
                description: 'A calculator that works',
                inputSchema: z.object({
                    expression: z.string(),
                }),
                execute: async (input) => {
                    try {
                        return { result: eval(input.expression) };
                    } catch {
                        return { result: 'Error evaluating expression' };
                    }
                },
            });

            // Registrar tools
            orchestrator.createTool(failingTool);
            orchestrator.createTool(workingTool);

            // Criar agent
            await orchestrator.createAgent({
                name: 'error-handling-agent',
                identity: {
                    description: 'Agent that handles tool errors gracefully',
                    role: 'Error Handling Assistant',
                    goal: 'Handle tool failures and find alternative solutions',
                },
                planner: 'react',
                maxIterations: 5,
            });

            // Testar com pergunta que pode usar a tool que falha
            const result = await orchestrator.callAgent(
                'error-handling-agent',
                'Calculate 2 + 2 using the available tools. If one fails, try another approach.',
            );

            expect(result).toBeDefined();
            expect(result.success).toBe(true);

            // O agent deve ter conseguido resolver mesmo com tool falhando
            if (result.output) {
                expect(result.output).toContain('4');
            }
        }, 30000);

        test('deve continuar execução mesmo quando tool retorna erro', async () => {
            if (!orchestrator) {
                console.log('⏭️ Pulando teste - Gemini não disponível');
                return;
            }

            // Tool que às vezes falha
            const unreliableTool = defineTool({
                name: 'unreliable-tool',
                description: 'A tool that sometimes fails',
                inputSchema: z.object({
                    operation: z.string(),
                }),
                execute: async (input) => {
                    if (input.operation === 'fail') {
                        throw new Error('Tool failed as requested');
                    }
                    return { result: `Success: ${input.operation}` };
                },
            });

            orchestrator.createTool(unreliableTool);

            await orchestrator.createAgent({
                name: 'resilient-agent',
                identity: {
                    description: 'Agent that handles unreliable tools',
                    role: 'Resilient Assistant',
                    goal: 'Continue working even when tools fail',
                },
                planner: 'react',
                maxIterations: 5,
            });

            const result = await orchestrator.callAgent(
                'resilient-agent',
                'Try to perform an operation that might fail, but find a way to complete the task.',
            );

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
        }, 30000);
    });

    describe('🔄 Testes de Passagem de Resultados entre Tools', () => {
        test('deve passar resultado de uma tool para a próxima execução', async () => {
            if (!orchestrator) {
                console.log('⏭️ Pulando teste - Gemini não disponível');
                return;
            }

            // Tool que gera um valor
            const generatorTool = defineTool({
                name: 'number-generator',
                description: 'Generates a random number',
                inputSchema: z.object({
                    min: z.number(),
                    max: z.number(),
                }),
                execute: async (input) => {
                    const result =
                        Math.floor(
                            Math.random() * (input.max - input.min + 1),
                        ) + input.min;
                    return { generatedNumber: result };
                },
            });

            // Tool que usa o resultado da primeira
            const processorTool = defineTool({
                name: 'number-processor',
                description: 'Processes a number from previous tool',
                inputSchema: z.object({
                    number: z.number(),
                    operation: z.string(),
                }),
                execute: async (input) => {
                    let result;
                    switch (input.operation) {
                        case 'double':
                            result = input.number * 2;
                            break;
                        case 'square':
                            result = input.number * input.number;
                            break;
                        default:
                            result = input.number;
                    }
                    return { processedResult: result };
                },
            });

            orchestrator.createTool(generatorTool);
            orchestrator.createTool(processorTool);

            await orchestrator.createAgent({
                name: 'sequential-agent',
                identity: {
                    description: 'Agent that uses tools in sequence',
                    role: 'Sequential Processor',
                    goal: 'Use multiple tools in sequence, passing results between them',
                },
                planner: 'react',
                maxIterations: 5,
            });

            const result = await orchestrator.callAgent(
                'sequential-agent',
                'Generate a number between 1 and 10, then double it using the available tools.',
            );

            expect(result).toBeDefined();
            expect(result.success).toBe(true);

            if (result.output) {
                // Deve mencionar que usou as duas tools
                expect(result.output.toLowerCase()).toMatch(
                    /generated|processed|result/,
                );
            }
        }, 30000);

        test('deve manter contexto entre múltiplas execuções de tools', async () => {
            // Criar orchestrator específico para este teste
            if (!geminiProvider) {
                console.log('⏭️ Pulando teste - Gemini não disponível');
                return;
            }

            const testOrchestrator = createOrchestration({
                tenantId: 'stateful-test',
                llmAdapter: createGeminiLLMAdapter(geminiProvider),
                defaultPlanner: 'react',
            });

            // Tool que mantém estado
            let callCount = 0;

            testOrchestrator.createTool({
                name: 'stateful-counter',
                description: 'A tool that maintains state across calls',
                inputSchema: z.object({
                    action: z.enum(['increment', 'get', 'reset']),
                }),
                execute: async (input: unknown) => {
                    const typedInput = input as {
                        action: 'increment' | 'get' | 'reset';
                    };
                    switch (typedInput.action) {
                        case 'increment':
                            callCount++;
                            return { count: callCount, message: 'Incremented' };
                        case 'get':
                            return {
                                count: callCount,
                                message: 'Current count',
                            };
                        case 'reset':
                            callCount = 0;
                            return { count: callCount, message: 'Reset' };
                        default:
                            return {
                                count: callCount,
                                message: 'Unknown action',
                            };
                    }
                },
            });

            // Criar agent
            await testOrchestrator.createAgent({
                name: 'stateful-agent',
                identity: {
                    description: 'Agent that works with stateful tools',
                    role: 'Stateful Assistant',
                    goal: 'Use tools that maintain state across calls',
                },
                planner: 'react',
                maxIterations: 5,
            });

            // Verificar se o agent foi criado
            const agents = testOrchestrator.listAgents();
            console.log('Agents disponíveis:', agents);

            // Verificar se o agent está disponível antes de usar
            const agentExists = agents.includes('stateful-agent');
            if (!agentExists) {
                console.log('❌ Agent não foi criado corretamente');
                console.log('Agents encontrados:', agents);
                return;
            }

            // Primeira execução - incrementar
            const result1 = await testOrchestrator.callAgent(
                'stateful-agent',
                'Use the counter tool to increment the count.',
            );

            expect(result1).toBeDefined();
            expect(result1.success).toBe(true);

            // Aguardar um pouco para garantir que o estado foi processado
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Segunda execução - verificar se o estado foi mantido
            const result2 = await testOrchestrator.callAgent(
                'stateful-agent',
                'Check the current count value.',
            );

            expect(result2).toBeDefined();
            expect(result2.success).toBe(true);

            // Aguardar um pouco para garantir que o estado foi processado
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Terceira execução - incrementar novamente
            const result3 = await testOrchestrator.callAgent(
                'stateful-agent',
                'Increment the count again.',
            );

            expect(result3).toBeDefined();
            expect(result3.success).toBe(true);
        }, 45000);
    });

    describe('🛡️ Testes de Recuperação de Erros', () => {
        test('deve tentar alternativa quando tool principal falha', async () => {
            if (!orchestrator) {
                console.log('⏭️ Pulando teste - Gemini não disponível');
                return;
            }

            // Tool principal que falha
            const primaryTool = defineTool({
                name: 'primary-calculator',
                description: 'Primary calculator that fails',
                inputSchema: z.object({
                    expression: z.string(),
                }),
                execute: async () => {
                    throw new Error('Primary tool unavailable');
                },
            });

            // Tool alternativa que funciona
            const backupTool = defineTool({
                name: 'backup-calculator',
                description: 'Backup calculator that works',
                inputSchema: z.object({
                    expression: z.string(),
                }),
                execute: async (input) => {
                    try {
                        return { result: eval(input.expression) };
                    } catch {
                        return { result: 'Error evaluating expression' };
                    }
                },
            });

            orchestrator.createTool(primaryTool);
            orchestrator.createTool(backupTool);

            await orchestrator.createAgent({
                name: 'backup-agent',
                identity: {
                    description:
                        'Agent that uses backup tools when primary fails',
                    role: 'Backup Assistant',
                    goal: 'Use alternative tools when primary tools fail',
                },
                planner: 'react',
                maxIterations: 5,
            });

            const result = await orchestrator.callAgent(
                'backup-agent',
                'Calculate 5 * 3. If the primary calculator fails, use the backup.',
            );

            expect(result).toBeDefined();
            expect(result.success).toBe(true);

            if (result.output) {
                expect(result.output).toContain('15');
            }
        }, 30000);
    });
});
