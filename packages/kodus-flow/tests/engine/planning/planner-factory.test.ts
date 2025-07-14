/**
 * @fileoverview Testes para PlannerFactory
 *
 * OBJETIVO: Validar que PlannerFactory exige LLM obrigatório
 * - Sem fallbacks sem LLM
 * - Mensagens claras de erro
 * - Criação correta de planners
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { PlannerFactory } from '../../../src/engine/planning/planner-factory.js';
import { createLLMAdapter } from '../../../src/core/llm/llm-adapter.js';
import { createGeminiProviderFromEnv } from '../../../src/core/llm/providers/gemini-provider.js';

describe('🏭 PlannerFactory Tests', () => {
    let llmAdapter: ReturnType<typeof createLLMAdapter>;

    beforeEach(() => {
        const geminiProvider = createGeminiProviderFromEnv();
        llmAdapter = createLLMAdapter(geminiProvider);
    });

    describe('🚨 LLM Obrigatório', () => {
        test('deve falhar se LLM não for fornecido para ReAct', () => {
            expect(() => {
                // @ts-expect-error - Testando erro propositalmente
                PlannerFactory.create('react', undefined);
            }).toThrow("PLANNER 'react' REQUIRES LLM!");
        });

        test('deve falhar se LLM for null para ReAct', () => {
            expect(() => {
                // @ts-expect-error - Testando erro propositalmente
                PlannerFactory.create('react', null);
            }).toThrow("PLANNER 'react' REQUIRES LLM!");
        });

        test('deve falhar se LLM não for fornecido para Plan-Execute', () => {
            expect(() => {
                // @ts-expect-error - Testando erro propositalmente
                PlannerFactory.create('plan_execute', undefined);
            }).toThrow("PLANNER 'plan_execute' REQUIRES LLM!");
        });

        test('deve falhar se LLM não for fornecido para Reflexion', () => {
            expect(() => {
                // @ts-expect-error - Testando erro propositalmente
                PlannerFactory.create('reflexion', undefined);
            }).toThrow("PLANNER 'reflexion' REQUIRES LLM!");
        });

        test('deve falhar se LLM não for fornecido para Tree of Thoughts', () => {
            expect(() => {
                // @ts-expect-error - Testando erro propositalmente
                PlannerFactory.create('tree_of_thoughts', undefined);
            }).toThrow("PLANNER 'tree_of_thoughts' REQUIRES LLM!");
        });
    });

    describe('✅ Criação Bem-Sucedida de Planners', () => {
        test('deve criar ReActPlanner com LLM', () => {
            const planner = PlannerFactory.create('react', llmAdapter);
            expect(planner).toBeDefined();
            expect(planner.constructor.name).toBe('ReActPlanner');
        });

        test('deve criar PlanAndExecutePlanner com LLM', () => {
            const planner = PlannerFactory.create('plan-execute', llmAdapter);
            expect(planner).toBeDefined();
            expect(planner.constructor.name).toBe('PlanAndExecutePlanner');
        });

        test('deve criar ReflexionPlanner com LLM', () => {
            const planner = PlannerFactory.create('reflexion', llmAdapter);
            expect(planner).toBeDefined();
            expect(planner.constructor.name).toBe('ReflexionPlanner');
        });

        test('deve criar TreeOfThoughtsPlanner com LLM', () => {
            const planner = PlannerFactory.create('tot', llmAdapter);
            expect(planner).toBeDefined();
            expect(planner.constructor.name).toBe('TreeOfThoughtsPlanner');
        });
    });

    describe('🎯 Interface Planner', () => {
        test('ReActPlanner deve implementar interface Planner', () => {
            const planner = PlannerFactory.create('react', llmAdapter);

            expect(planner.think).toBeDefined();
            expect(typeof planner.think).toBe('function');
            expect(planner.analyzeResult).toBeDefined();
            expect(typeof planner.analyzeResult).toBe('function');
        });

        test('todos os planners devem ter método think', () => {
            const plannerTypes = [
                'react',
                'plan-execute',
                'reflexion',
                'tot',
            ] as const;

            plannerTypes.forEach((type) => {
                const planner = PlannerFactory.create(type, llmAdapter);
                expect(planner.think).toBeDefined();
                expect(typeof planner.think).toBe('function');
            });
        });

        test('todos os planners devem ter método analyzeResult', () => {
            const plannerTypes = [
                'react',
                'plan-execute',
                'reflexion',
                'tot',
            ] as const;

            plannerTypes.forEach((type) => {
                const planner = PlannerFactory.create(type, llmAdapter);
                expect(planner.analyzeResult).toBeDefined();
                expect(typeof planner.analyzeResult).toBe('function');
            });
        });
    });

    describe('🔧 Error Handling', () => {
        test('deve falhar com tipo de planner inválido', () => {
            expect(() => {
                // @ts-expect-error - Testando tipo inválido
                PlannerFactory.create('invalid_planner', llmAdapter);
            }).toThrow();
        });

        test('mensagem de erro deve ser clara e educativa', () => {
            try {
                // @ts-expect-error - Testando erro propositalmente
                PlannerFactory.create('react', undefined);
            } catch (error) {
                const message = (error as Error).message;

                expect(message).toContain("PLANNER 'react' REQUIRES LLM!");
                expect(message).toContain('Agent without LLM is just a script');
                expect(message).toContain('Available LLM adapters');
            }
        });

        test('deve incluir exemplo de uso na mensagem de erro', () => {
            try {
                // @ts-expect-error - Testando erro propositalmente
                PlannerFactory.create('react', null);
            } catch (error) {
                const message = (error as Error).message;

                expect(message).toContain('Available LLM adapters');
                expect(message).toContain('LLMAdapter with Gemini');
            }
        });
    });

    describe('🧠 LLM Integration Validation', () => {
        test('planner deve manter referência ao LLM adapter', async () => {
            const planner = PlannerFactory.create('react', llmAdapter);

            // Verificar que o planner tem acesso ao LLM adapter
            // (isso é validado implicitamente quando o planner é usado)
            expect(planner).toBeDefined();

            // Test basic functionality to ensure LLM is properly injected
            const mockContext = {
                iterations: 0,
                availableTools: ['test-tool'],
                history: [],
                input: 'test input',
                maxIterations: 10,
                metadata: {},
                getCurrentSituation: () => 'test situation',
                update: () => {},
                isComplete: false,
                getFinalResult: () => ({
                    success: false,
                    iterations: 0,
                    totalTime: 0,
                    thoughts: [],
                }),
            };

            const thought = await planner.think(
                'Test thinking with LLM',
                mockContext,
            );
            expect(thought).toBeDefined();
            expect(thought.reasoning).toBeDefined();
            expect(thought.action).toBeDefined();
        });
    });

    describe('📦 Factory Pattern Validation', () => {
        test('deve usar padrão Factory corretamente', () => {
            // Factory deve ser estático
            expect(PlannerFactory.create).toBeDefined();
            expect(typeof PlannerFactory.create).toBe('function');

            // Não deve permitir instanciação direta
            expect(
                () => new (PlannerFactory as unknown as { new (): unknown })(),
            ).toThrow();
        });

        test('deve retornar instâncias diferentes para cada chamada', () => {
            const planner1 = PlannerFactory.create('react', llmAdapter);
            const planner2 = PlannerFactory.create('react', llmAdapter);

            expect(planner1).not.toBe(planner2);
            expect(planner1.constructor.name).toBe(planner2.constructor.name);
        });
    });
});
