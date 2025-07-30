/**
 * @fileoverview Testes para Validar LLM Obrigatório
 *
 * OBJETIVO: Garantir que LLM é obrigatório em toda a arquitetura
 * - Nenhum fallback sem LLM
 * - Mensagens claras de erro
 * - Validação em todos os pontos de entrada
 * - Conformidade com princípio "Agent without LLM is just a script"
 */

import { describe, test, expect } from 'vitest';
import { createOrchestration } from '../../src/orchestration/sdk-orchestrator.js';
import { PlannerFactory } from '../../src/engine/planning/planner-factory.js';
import { ReActPlanner } from '../../src/engine/planning/strategies/react-planner.js';
import { ToolEngine } from '../../src/engine/tools/tool-engine.js';
import { createLLMAdapter } from '../../src/core/llm/llm-adapter.js';
import { createMockLLMProvider } from '../../src/adapters/llm/index.js';
import { createGeminiProviderFromEnv } from '../../src/core/llm/providers/gemini-provider.js';
import { AgentEngine } from '../../src/engine/agents/agent-engine.js';

describe('🚨 LLM Mandatory Validation Tests', () => {
    describe('🏗️ SDKOrchestrator LLM Requirements', () => {
        test('deve falhar se LLM for undefined', () => {
            expect(() => {
                createOrchestration({
                    // @ts-expect-error - Testando erro propositalmente
                    llmAdapter: undefined,
                    defaultPlanner: 'react',
                });
            }).toThrow('LLM Adapter is REQUIRED');
        });

        test('deve falhar se LLM for null', () => {
            expect(() => {
                createOrchestration({
                    // @ts-expect-error - Testando erro propositalmente
                    llmAdapter: null,
                    defaultPlanner: 'react',
                });
            }).toThrow('LLM Adapter is REQUIRED');
        });

        test('deve falhar se config for vazio', () => {
            expect(() => {
                // @ts-expect-error - Testando erro propositalmente
                createOrchestration({});
            }).toThrow('LLM Adapter is REQUIRED');
        });

        test('deve incluir mensagem educativa no erro', () => {
            try {
                createOrchestration({
                    // @ts-expect-error - Testando erro propositalmente
                    llmAdapter: undefined,
                });
            } catch (error) {
                const message = (error as Error).message;

                expect(message).toContain('LLM Adapter is REQUIRED');
                expect(message).toContain('Think and reason about problems');
                expect(message).toContain('Make decisions about actions');
                expect(message).toContain(
                    "Without LLM, you can't create agents - only scripts",
                );
                expect(message).toContain('createLLMAdapter');
            }
        });

        test('deve aceitar LLM válido', () => {
            const geminiProvider = createGeminiProviderFromEnv();
            const llmAdapter = createLLMAdapter(geminiProvider);

            expect(() => {
                createOrchestration({
                    llmAdapter,
                    defaultPlanner: 'react',
                });
            }).not.toThrow();
        });
    });

    describe('🏭 PlannerFactory LLM Requirements', () => {
        const plannerTypes = [
            'react',
            'plan-execute',
            'reflexion',
            'tot',
        ] as const;

        plannerTypes.forEach((plannerType) => {
            test(`deve falhar ${plannerType} planner sem LLM`, () => {
                expect(() => {
                    // @ts-expect-error - Testando erro propositalmente
                    PlannerFactory.create(plannerType, undefined);
                }).toThrow(`PLANNER '${plannerType}' REQUIRES LLM!`);
            });

            test(`deve falhar ${plannerType} planner com LLM null`, () => {
                expect(() => {
                    // @ts-expect-error - Testando erro propositalmente
                    PlannerFactory.create(plannerType, null);
                }).toThrow(`PLANNER '${plannerType}' REQUIRES LLM!`);
            });

            test(`deve incluir mensagem educativa para ${plannerType}`, () => {
                try {
                    // @ts-expect-error - Testando erro propositalmente
                    PlannerFactory.create(plannerType, undefined);
                } catch (error) {
                    const message = (error as Error).message;

                    expect(message).toContain(
                        'Agent without LLM is just a script',
                    );
                    expect(message).toContain('Available LLM adapters');
                }
            });

            test(`deve aceitar LLM válido para ${plannerType}`, () => {
                const geminiProvider = createGeminiProviderFromEnv();
                const llmAdapter = createLLMAdapter(geminiProvider);

                expect(() => {
                    PlannerFactory.create(plannerType, llmAdapter);
                }).not.toThrow();
            });
        });
    });

    describe('🤖 ReActPlanner LLM Requirements', () => {
        test('deve falhar construção sem LLM', () => {
            expect(() => {
                // @ts-expect-error - Testando erro propositalmente
                new ReActPlanner(undefined);
            }).toThrow();
        });

        test('deve aceitar LLM válido', () => {
            const geminiProvider = createGeminiProviderFromEnv();
            const llmAdapter = createLLMAdapter(geminiProvider);

            expect(() => {
                new ReActPlanner(llmAdapter);
            }).not.toThrow();
        });

        test('deve usar LLM durante think phase', async () => {
            const mockProvider = createMockLLMProvider();
            const llmAdapter = createLLMAdapter(mockProvider);
            const planner = new ReActPlanner(llmAdapter);

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

            const thought = await planner.think('Test LLM usage', mockContext);

            expect(thought).toBeDefined();
            expect(thought.reasoning).toBeDefined();
            expect(thought.reasoning.length).toBeGreaterThan(5); // Should be real reasoning, not empty
        }, 10000); // 10 segundos de timeout
    });

    describe('🧠 AgentEngine LLM Requirements', () => {
        test('deve falhar se config não incluir LLM adapter', () => {
            const toolEngine = new ToolEngine();

            expect(() => {
                new AgentEngine(
                    {
                        name: 'test-agent',
                        description: 'Test agent',
                        think: async () => ({
                            reasoning: '',
                            action: {
                                type: 'final_answer' as const,
                                content: '',
                            },
                        }),
                        config: {},
                    },
                    toolEngine,
                    {
                        tenantId: 'test',
                        agentName: 'test-agent',
                        planner: 'react',
                        llmAdapter: undefined,
                        maxThinkingIterations: 3,
                    },
                );
            }).toThrow();
        });

        test('deve aceitar configuração com LLM válido', () => {
            const geminiProvider = createGeminiProviderFromEnv();
            const llmAdapter = createLLMAdapter(geminiProvider);
            const toolEngine = new ToolEngine();

            expect(() => {
                new AgentEngine(
                    {
                        name: 'test-agent',
                        description: 'Test agent',
                        think: async () => ({
                            reasoning: '',
                            action: {
                                type: 'final_answer' as const,
                                content: '',
                            },
                        }),
                        config: {},
                    },
                    toolEngine,
                    {
                        tenantId: 'test',
                        agentName: 'test-agent',
                        planner: 'react',
                        llmAdapter,
                        maxThinkingIterations: 3,
                    },
                );
            }).not.toThrow();
        });

        test('deve usar LLM durante execução', async () => {
            const geminiProvider = createGeminiProviderFromEnv();
            const llmAdapter = createLLMAdapter(geminiProvider);
            const toolEngine = new ToolEngine();

            const agentEngine = new AgentEngine(
                {
                    name: 'test-agent',
                    description: 'Test agent',
                    think: async () => ({
                        reasoning: '',
                        action: { type: 'final_answer' as const, content: '' },
                    }),
                    config: {},
                },
                toolEngine,
                {
                    tenantId: 'test',
                    agentName: 'test-agent',
                    planner: 'react',
                    llmAdapter,
                    maxThinkingIterations: 2,
                    enableKernelIntegration: false,
                    debug: false,
                    monitoring: false,
                },
            );

            const result = await agentEngine.execute('Simple test task', {
                correlationId: 'test-corr',
                sessionId: 'test-session',
                thread: { id: 'test-thread', metadata: {} },
            });

            expect(result).toBeDefined();
            expect(result.success).toBeDefined();
        });
    });

    describe('🔒 No Fallback Validation', () => {
        test('não deve existir fallbacks sem LLM em PlannerFactory', () => {
            // Verificar que não há métodos createDefaultPlanner, etc.
            expect(
                (PlannerFactory as unknown as Record<string, unknown>)
                    .createDefault,
            ).toBeUndefined();
            expect(
                (PlannerFactory as unknown as Record<string, unknown>)
                    .createFallback,
            ).toBeUndefined();
            expect(
                (PlannerFactory as unknown as Record<string, unknown>)
                    .createSimple,
            ).toBeUndefined();
        });

        test('não deve existir fallbacks no SDKOrchestrator', () => {
            const geminiProvider = createGeminiProviderFromEnv();
            const llmAdapter = createLLMAdapter(geminiProvider);
            const orchestrator = createOrchestration({ llmAdapter });

            // Verificar que métodos de fallback não existem
            expect(
                (orchestrator as unknown as Record<string, unknown>)
                    .createDefaultThink,
            ).toBeUndefined();
            expect(
                (orchestrator as unknown as Record<string, unknown>)
                    .createSimpleAgent,
            ).toBeUndefined();
            expect(
                (orchestrator as unknown as Record<string, unknown>)
                    .createBasicPlanner,
            ).toBeUndefined();
        });

        test('AgentEngine não deve ter modo de execução sem LLM', () => {
            const geminiProvider = createGeminiProviderFromEnv();
            const llmAdapter = createLLMAdapter(geminiProvider);
            const toolEngine = new ToolEngine();

            const agentEngine = new AgentEngine(
                {
                    name: 'test-agent',
                    description: 'Test agent',
                    think: async () => ({
                        reasoning: '',
                        action: { type: 'final_answer' as const, content: '' },
                    }),
                    config: {},
                },
                toolEngine,
                {
                    tenantId: 'test',
                    agentName: 'test-agent',
                    planner: 'react',
                    llmAdapter,
                    maxThinkingIterations: 3,
                },
            );

            // Verificar que não há métodos de fallback
            expect(
                (agentEngine as unknown as Record<string, unknown>)
                    .executeWithoutLLM,
            ).toBeUndefined();
            expect(
                (agentEngine as unknown as Record<string, unknown>)
                    .fallbackThink,
            ).toBeUndefined();
            expect(
                (agentEngine as unknown as Record<string, unknown>).simpleMode,
            ).toBeUndefined();
        });
    });

    describe('📚 Error Message Quality', () => {
        test('mensagens devem ser educativas e claras', () => {
            const errorMessages: string[] = [];

            try {
                createOrchestration({
                    // @ts-expect-error - Testando erro propositalmente
                    llmAdapter: undefined,
                });
            } catch (error) {
                errorMessages.push((error as Error).message);
            }

            try {
                // @ts-expect-error - Testando erro propositalmente
                PlannerFactory.create('react', undefined);
            } catch (error) {
                errorMessages.push((error as Error).message);
            }

            errorMessages.forEach((message) => {
                // Verificar elementos educativos
                expect(message).toMatch(/LLM|Agent|script/i);
                expect(message).toMatch(/example|create|provide/i);
                expect(message.length).toBeGreaterThan(50); // Should be substantial
            });
        });

        test('mensagens devem incluir exemplos de uso', () => {
            try {
                createOrchestration({
                    // @ts-expect-error - Testando erro propositalmente
                    llmAdapter: null,
                });
            } catch (error) {
                const message = (error as Error).message;

                expect(message).toContain('Example:');
                expect(message).toContain('createLLMAdapter');
                expect(message).toContain('SDKOrchestrator');
            }
        });
    });

    describe('🎯 Consistency Validation', () => {
        test('todas as partes do sistema devem ter validação consistente', () => {
            const llmRequiredErrors: string[] = [];

            // Collect all LLM required errors
            try {
                createOrchestration({
                    // @ts-expect-error - Testando erro propositalmente
                    llmAdapter: undefined,
                });
            } catch (error) {
                llmRequiredErrors.push((error as Error).message);
            }

            try {
                // @ts-expect-error - Testando erro propositalmente
                PlannerFactory.create('react', undefined);
            } catch (error) {
                llmRequiredErrors.push((error as Error).message);
            }

            // All errors should mention the core principle
            llmRequiredErrors.forEach((message) => {
                expect(message).toMatch(/Agent.*LLM|LLM.*Agent|script/i);
            });
        });

        test('validação deve ocorrer imediatamente na construção', () => {
            // Should fail immediately, not during execution
            expect(() => {
                createOrchestration({
                    // @ts-expect-error - Testando erro propositalmente
                    llmAdapter: undefined,
                });
            }).toThrow();

            expect(() => {
                // @ts-expect-error - Testando erro propositalmente
                PlannerFactory.create('react', null);
            }).toThrow();
        });
    });

    describe('✅ Valid LLM Acceptance', () => {
        test('deve aceitar diferentes tipos de LLM adapters válidos', () => {
            const geminiProvider = createGeminiProviderFromEnv();
            const llmAdapter = createLLMAdapter(geminiProvider);

            // Should work with valid LLM
            expect(() => {
                const orchestrator = createOrchestration({ llmAdapter });
                expect(orchestrator).toBeDefined();
            }).not.toThrow();

            expect(() => {
                const planner = PlannerFactory.create('react', llmAdapter);
                expect(planner).toBeDefined();
            }).not.toThrow();
        });

        test('LLM adapter deve ter métodos necessários', () => {
            const geminiProvider = createGeminiProviderFromEnv();
            const llmAdapter = createLLMAdapter(geminiProvider);

            expect(llmAdapter.getProvider).toBeDefined();
            expect(llmAdapter.getAvailableTechniques).toBeDefined();
            expect(typeof llmAdapter.getProvider).toBe('function');
            expect(typeof llmAdapter.getAvailableTechniques).toBe('function');
        });
    });
});
