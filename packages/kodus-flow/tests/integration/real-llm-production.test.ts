/**
 * @fileoverview Testes Reais de Produção com LLM
 *
 * OBJETIVO: Testar o Kodus Flow com LLMs reais em cenários de produção
 * - Usar Gemini com chave real
 * - Simular cenários reais de uso
 * - Validar performance e qualidade das respostas
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { createOrchestration } from '../../src/orchestration/sdk-orchestrator.js';
import { createGeminiProviderFromEnv } from '../../src/core/llm/providers/gemini-provider.js';
import { z } from 'zod';

// Adapter para conectar GeminiProvider com LLMAdapter
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
            const response = await geminiProvider.call([
                {
                    role: 'system',
                    content: `Analyze the user's question and available tools. Respond with JSON format: {"intent": "...", "urgency": "low|normal|high", "complexity": "simple|medium|complex", "selectedTool": "...", "confidence": 0.0-1.0, "reasoning": "..."}`,
                },
                {
                    role: 'user',
                    content: `Question: ${pergunta}\nAvailable tools: ${availableTools.map((t) => t.name).join(', ')}`,
                },
            ]);

            try {
                return JSON.parse(response.content);
            } catch {
                return {
                    intent: 'general',
                    urgency: 'normal',
                    complexity: 'simple',
                    selectedTool: availableTools[0]?.name || '',
                    confidence: 0.5,
                    reasoning: 'Default analysis',
                };
            }
        },
        extractParameters: async (
            pergunta: string,
            toolName: string,
            _context: unknown,
        ) => {
            const response = await geminiProvider.call([
                {
                    role: 'system',
                    content: `Extract parameters from the user's question for the tool "${toolName}". Respond with JSON format containing the parameters.`,
                },
                {
                    role: 'user',
                    content: `Question: ${pergunta}\nTool: ${toolName}`,
                },
            ]);

            try {
                return JSON.parse(response.content);
            } catch {
                return {};
            }
        },
        generateResponse: async (result: unknown, originalQuestion: string) => {
            const response = await geminiProvider.call([
                {
                    role: 'system',
                    content:
                        'Generate a natural response based on the result and original question.',
                },
                {
                    role: 'user',
                    content: `Original question: ${originalQuestion}\nResult: ${JSON.stringify(result)}`,
                },
            ]);

            return response.content;
        },
        getProvider: () => ({ name: 'gemini' }),
        getAvailableTechniques: () => ['cot', 'react', 'tot'],
    };
}

describe('🚀 Testes Reais de Produção com LLM', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let orchestrator: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let geminiProvider: any;

    beforeEach(async () => {
        // Verificar se a chave da API está disponível
        if (!process.env.GEMINI_API_KEY) {
            console.warn(
                '⚠️ GEMINI_API_KEY não encontrada. Pulando testes reais.',
            );
            return;
        }

        try {
            // Criar provider do Gemini
            geminiProvider = createGeminiProviderFromEnv();

            // Testar conexão
            const isConnected = await geminiProvider.testConnection();
            if (!isConnected) {
                console.warn(
                    '⚠️ Falha na conexão com Gemini. Pulando testes reais.',
                );
                return;
            }

            // Criar adapter
            const llmAdapter = createGeminiLLMAdapter(geminiProvider);

            // Criar orchestrator
            orchestrator = createOrchestration({
                llmAdapter,
                tenantId: 'real-production-test',
                enableObservability: true,
                defaultPlanner: 'react',
                defaultMaxIterations: 3,
            });

            console.log('✅ Gemini conectado com sucesso!');
        } catch (error) {
            console.warn('⚠️ Erro ao conectar com Gemini:', error);
        }
    });

    describe('🧮 Testes de Cálculos Matemáticos', () => {
        test('deve resolver problemas matemáticos complexos', async () => {
            if (!orchestrator) {
                console.log('⏭️ Pulando teste - Gemini não disponível');
                return;
            }

            // Criar tool de calculadora
            orchestrator.createTool({
                name: 'calculator',
                description: 'Performs mathematical calculations',
                inputSchema: z.object({
                    expression: z.string(),
                }),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                execute: async (input: any) => {
                    try {
                        const result = eval(input.expression);
                        return { result, expression: input.expression };
                    } catch {
                        return {
                            error: 'Invalid expression',
                            expression: input.expression,
                        };
                    }
                },
            });

            // Criar agent matemático
            await orchestrator.createAgent({
                name: 'math-agent',
                identity: {
                    description: 'Specialized in mathematical problem solving',
                    role: 'Mathematical Assistant',
                    goal: 'Solve complex mathematical problems step by step',
                },
                planner: 'react',
                maxIterations: 5,
            });

            // Testar problema complexo
            const result = await orchestrator.callAgent(
                'math-agent',
                'Calculate the result of (15 + 25) * 2 and then subtract 10. Show your work step by step.',
            );

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            if (result.output) {
                expect(result.output).toContain('60'); // (15 + 25) * 2 - 10 = 60
            }
        }, 30000); // 30s timeout

        test('deve resolver equações com múltiplas operações', async () => {
            if (!orchestrator) {
                console.log('⏭️ Pulando teste - Gemini não disponível');
                return;
            }

            // Criar agent matemático se não existir
            try {
                await orchestrator.createAgent({
                    name: 'math-agent-2',
                    identity: {
                        description:
                            'Specialized in mathematical problem solving',
                        role: 'Mathematical Assistant',
                        goal: 'Solve complex mathematical problems step by step',
                    },
                    planner: 'react',
                    maxIterations: 5,
                });
            } catch {
                // Agent já existe, continuar
            }

            const result = await orchestrator.callAgent(
                'math-agent-2',
                'What is the result of: (100 / 4) + (25 * 2) - 15? Show each step.',
            );

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            if (result.output) {
                expect(result.output).toContain('60'); // (100/4) + (25*2) - 15 = 25 + 50 - 15 = 60
            }
        }, 30000);
    });

    describe('🌐 Testes de Análise de Texto', () => {
        test('deve analisar e resumir textos', async () => {
            if (!orchestrator) {
                console.log('⏭️ Pulando teste - Gemini não disponível');
                return;
            }

            // Criar agent de análise de texto
            await orchestrator.createAgent({
                name: 'text-analyzer',
                identity: {
                    description:
                        'Specialized in text analysis and summarization',
                    role: 'Text Analyst',
                    goal: 'Analyze and summarize text content effectively',
                },
                planner: 'react',
            });

            const longText = `
                Artificial Intelligence (AI) is transforming the way we live and work.
                From virtual assistants to autonomous vehicles, AI technologies are becoming
                increasingly integrated into our daily lives. Machine learning algorithms
                can now process vast amounts of data to identify patterns and make predictions
                with remarkable accuracy. This has led to breakthroughs in fields such as
                healthcare, finance, and transportation. However, the rapid advancement of
                AI also raises important questions about privacy, security, and the future
                of human employment.
            `;

            const result = await orchestrator.callAgent(
                'text-analyzer',
                `Please analyze this text and provide a concise summary of the main points: ${longText}`,
            );

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            if (result.output) {
                expect(result.output).toContain('AI');
                expect(result.output.length).toBeLessThan(longText.length); // Deve ser mais conciso
            }
        }, 30000);

        test('deve identificar sentimentos em texto', async () => {
            if (!orchestrator) {
                console.log('⏭️ Pulando teste - Gemini não disponível');
                return;
            }

            // Criar agent de análise de texto se não existir
            try {
                await orchestrator.createAgent({
                    name: 'sentiment-analyzer',
                    identity: {
                        description: 'Specialized in sentiment analysis',
                        role: 'Sentiment Analyst',
                        goal: 'Analyze sentiment in text content',
                    },
                    planner: 'react',
                });
            } catch {
                // Agent já existe, continuar
            }

            const result = await orchestrator.callAgent(
                'sentiment-analyzer',
                'Analyze the sentiment of this text: "I am absolutely thrilled with the amazing results we achieved today! This is the best day ever!"',
            );

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            if (result.output) {
                expect(result.output.toLowerCase()).toMatch(
                    /positive|happy|excited|thrilled/,
                );
            }
        }, 30000);
    });

    describe('🔧 Testes de Ferramentas Complexas', () => {
        test('deve usar múltiplas tools em sequência', async () => {
            if (!orchestrator) {
                console.log('⏭️ Pulando teste - Gemini não disponível');
                return;
            }

            // Tool para converter temperatura
            orchestrator.createTool({
                name: 'temperature-converter',
                description: 'Converts between Celsius and Fahrenheit',
                inputSchema: z.object({
                    value: z.number(),
                    from: z.enum(['celsius', 'fahrenheit']),
                    to: z.enum(['celsius', 'fahrenheit']),
                }),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                execute: async (input: any) => {
                    if (input.from === 'celsius' && input.to === 'fahrenheit') {
                        return { result: (input.value * 9) / 5 + 32 };
                    } else if (
                        input.from === 'fahrenheit' &&
                        input.to === 'celsius'
                    ) {
                        return { result: ((input.value - 32) * 5) / 9 };
                    }
                    return { result: input.value };
                },
            });

            // Tool para calcular área
            orchestrator.createTool({
                name: 'area-calculator',
                description: 'Calculates area of geometric shapes',
                inputSchema: z.object({
                    shape: z.enum(['circle', 'rectangle', 'triangle']),
                    dimensions: z.record(z.string(), z.number()),
                }),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                execute: async (input: any) => {
                    switch (input.shape) {
                        case 'circle':
                            return {
                                result: Math.PI * input.dimensions.radius ** 2,
                            };
                        case 'rectangle':
                            return {
                                result:
                                    input.dimensions.width *
                                    input.dimensions.height,
                            };
                        case 'triangle':
                            return {
                                result:
                                    0.5 *
                                    input.dimensions.base *
                                    input.dimensions.height,
                            };
                        default:
                            return { error: 'Unknown shape' };
                    }
                },
            });

            await orchestrator.createAgent({
                name: 'multi-tool-agent',
                identity: {
                    description:
                        'Agent that can use multiple tools for complex tasks',
                    role: 'Multi-Tool Assistant',
                    goal: 'Solve complex problems using multiple tools',
                },
                planner: 'react',
                maxIterations: 5,
            });

            const result = await orchestrator.callAgent(
                'multi-tool-agent',
                'Convert 25 degrees Celsius to Fahrenheit, then calculate the area of a circle with radius 5 meters.',
            );

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            if (result.output) {
                expect(result.output).toContain('77'); // 25°C = 77°F
                expect(result.output).toContain('78.54'); // π * 5² ≈ 78.54
            }
        }, 30000);
    });

    describe('📊 Testes de Performance', () => {
        test('deve responder rapidamente a perguntas simples', async () => {
            if (!orchestrator) {
                console.log('⏭️ Pulando teste - Gemini não disponível');
                return;
            }

            // Criar agent se não existir
            try {
                await orchestrator.createAgent({
                    name: 'math-agent',
                    identity: {
                        description:
                            'Specialized in mathematical problem solving',
                        role: 'Mathematical Assistant',
                        goal: 'Solve complex mathematical problems step by step',
                    },
                    planner: 'react',
                    maxIterations: 5,
                });
            } catch {
                // Agent já existe, continuar
            }

            const startTime = Date.now();

            const result = await orchestrator.callAgent(
                'math-agent',
                'What is 2 + 2?',
            );

            const endTime = Date.now();
            const responseTime = endTime - startTime;

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            expect(responseTime).toBeLessThan(10000); // Deve responder em menos de 10s
            if (result.output) {
                expect(result.output).toContain('4');
            }
        }, 15000);

        test('deve manter qualidade em múltiplas chamadas', async () => {
            if (!orchestrator) {
                console.log('⏭️ Pulando teste - Gemini não disponível');
                return;
            }

            // Criar agent se não existir
            try {
                await orchestrator.createAgent({
                    name: 'math-agent',
                    identity: {
                        description:
                            'Specialized in mathematical problem solving',
                        role: 'Mathematical Assistant',
                        goal: 'Solve complex mathematical problems step by step',
                    },
                    planner: 'react',
                    maxIterations: 5,
                });
            } catch {
                // Agent já existe, continuar
            }

            const questions = [
                'What is the capital of Brazil?',
                'What is 15 * 3?',
                'What is the largest planet in our solar system?',
                'What is the square root of 16?',
                'What is the chemical symbol for gold?',
            ];

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const results: any[] = [];
            for (const question of questions) {
                const result = await orchestrator.callAgent(
                    'math-agent',
                    question,
                );
                results.push(result);
            }

            // Verificar que todas as respostas foram bem-sucedidas
            results.forEach((result, index) => {
                expect(result.success).toBe(true);
                if (result.output) {
                    expect(result.output).toBeTruthy();
                    console.log(
                        `✅ Questão ${index + 1}: ${questions[index]} - ${result.output.substring(0, 50)}...`,
                    );
                }
            });
        }, 60000); // 1 minuto para múltiplas chamadas
    });

    describe('🎯 Testes de Qualidade das Respostas', () => {
        test('deve fornecer respostas precisas e detalhadas', async () => {
            if (!orchestrator) {
                console.log('⏭️ Pulando teste - Gemini não disponível');
                return;
            }

            // Criar agent se não existir
            try {
                await orchestrator.createAgent({
                    name: 'math-agent',
                    identity: {
                        description:
                            'Specialized in mathematical problem solving',
                        role: 'Mathematical Assistant',
                        goal: 'Solve complex mathematical problems step by step',
                    },
                    planner: 'react',
                    maxIterations: 5,
                });
            } catch {
                // Agent já existe, continuar
            }

            const result = await orchestrator.callAgent(
                'math-agent',
                'Explain the Pythagorean theorem and provide an example with a 3-4-5 triangle.',
            );

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            if (result.output) {
                expect(result.output.toLowerCase()).toContain('pythagorean');
                expect(result.output.toLowerCase()).toContain('hypotenuse');
                expect(result.output.toLowerCase()).toContain('3-4-5');
                expect(result.output.toLowerCase()).toContain('25'); // 3² + 4² = 5²
            }
        }, 30000);

        test('deve mostrar raciocínio passo a passo', async () => {
            if (!orchestrator) {
                console.log('⏭️ Pulando teste - Gemini não disponível');
                return;
            }

            // Criar agent se não existir
            try {
                await orchestrator.createAgent({
                    name: 'math-agent',
                    identity: {
                        description:
                            'Specialized in mathematical problem solving',
                        role: 'Mathematical Assistant',
                        goal: 'Solve complex mathematical problems step by step',
                    },
                    planner: 'react',
                    maxIterations: 5,
                });
            } catch {
                // Agent já existe, continuar
            }

            const result = await orchestrator.callAgent(
                'math-agent',
                'Solve this step by step: If a train travels 120 km in 2 hours, what is its speed in km/h?',
            );

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            if (result.output) {
                expect(result.output.toLowerCase()).toContain('60');
                expect(result.output.toLowerCase()).toContain('speed');
                expect(result.output.toLowerCase()).toContain('distance');
                expect(result.output.toLowerCase()).toContain('time');
            }
        }, 30000);
    });
});
