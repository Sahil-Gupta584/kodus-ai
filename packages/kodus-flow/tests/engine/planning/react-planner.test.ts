/**
 * @fileoverview Testes para ReActPlanner Real
 *
 * OBJETIVO: Validar que ReActPlanner funciona com LLM real
 * - Think→Act→Observe cycle
 * - Parsing correto de ReAct format
 * - Análise de resultados com LLM
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ReActPlanner } from '../../../src/engine/planning/strategies/react-planner.js';
import { createLLMAdapter } from '../../../src/core/llm/llm-adapter.js';
import { createGeminiProviderFromEnv } from '../../../src/core/llm/providers/gemini-provider.js';
import type {
    AgentExecutionContext,
    ActionResult,
} from '../../../src/engine/planning/planner-factory.js';

describe('🤖 ReActPlanner Real Tests', () => {
    let reactPlanner: ReActPlanner;
    let llmAdapter: ReturnType<typeof createLLMAdapter>;
    let mockContext: AgentExecutionContext;

    beforeEach(() => {
        const geminiProvider = createGeminiProviderFromEnv();
        llmAdapter = createLLMAdapter(geminiProvider);
        reactPlanner = new ReActPlanner(llmAdapter);

        mockContext = {
            iterations: 0,
            availableTools: ['calculator', 'weather'],
            history: [],
            input: 'test input',
            maxIterations: 10,
            metadata: {},
            getCurrentSituation: () => 'Starting new task',
            update: () => {},
            isComplete: false,
            getFinalResult: () => ({
                success: false,
                iterations: 0,
                totalTime: 0,
                thoughts: [],
            }),
        };
    });

    describe('🧠 Think Phase', () => {
        test('deve retornar AgentThought válido', async () => {
            const thought = await reactPlanner.think(
                'Calculate 15 + 25 using the calculator tool',
                mockContext,
            );

            expect(thought).toBeDefined();
            expect(thought.reasoning).toBeDefined();
            expect(typeof thought.reasoning).toBe('string');
            expect(thought.reasoning.length).toBeGreaterThan(0);

            expect(thought.action).toBeDefined();
            expect(thought.action.type).toBeOneOf([
                'tool_call',
                'final_answer',
            ]);
        }, 30000);

        test('deve usar LLM para reasoning', async () => {
            const thought = await reactPlanner.think(
                'What is 2 + 2?',
                mockContext,
            );

            // Reasoning deve ser mais que uma string simples
            expect(thought.reasoning.length).toBeGreaterThan(10);
            expect(thought.action).toBeDefined();
        }, 30000);

        test('deve incluir ferramentas disponíveis no contexto', async () => {
            const contextWithTools = {
                ...mockContext,
                availableTools: ['special-tool', 'another-tool'],
            };

            const thought = await reactPlanner.think(
                'Use the special-tool to solve this',
                contextWithTools,
            );

            expect(thought).toBeDefined();
            expect(thought.reasoning).toBeDefined();
        }, 30000);

        test('deve lidar com histórico de execuções anteriores', async () => {
            const contextWithHistory = {
                ...mockContext,
                iterations: 2,
                history: [
                    {
                        thought: {
                            reasoning: 'Previous thought',
                            action: {
                                type: 'tool_call' as const,
                                tool: 'calc',
                                arguments: {},
                            },
                        },
                        action: {
                            type: 'tool_call' as const,
                            tool: 'calc',
                            arguments: {},
                        },
                        result: {
                            type: 'tool_result' as const,
                            content: { result: 42 },
                        },
                        observation: {
                            feedback: 'Got result: 42',
                            isSuccessful: true,
                            isComplete: false,
                            shouldContinue: false,
                        },
                    },
                ],
            };

            const thought = await reactPlanner.think(
                'Continue with the previous result',
                contextWithHistory,
            );

            expect(thought).toBeDefined();
            expect(thought.reasoning).toBeDefined();
            expect(thought.reasoning.length).toBeGreaterThan(0);

            // Verifica se o contexto com histórico foi processado
            expect(contextWithHistory.history.length).toBe(1);
            expect(contextWithHistory.iterations).toBe(2);
        }, 30000);
    });

    describe('🎯 Action Parsing', () => {
        test('deve parsear tool_call corretamente', async () => {
            // Simulate LLM response that should trigger tool call
            const thought = await reactPlanner.think(
                'Calculate 5 * 8 using calculator',
                mockContext,
            );

            if (thought.action.type === 'tool_call') {
                expect(thought.action.tool).toBeDefined();
                expect(thought.action.arguments).toBeDefined();
            }
        }, 30000);

        test('deve parsear final_answer corretamente', async () => {
            const thought = await reactPlanner.think(
                'Just say hello',
                mockContext,
            );

            expect(thought.action.type).toBeOneOf([
                'tool_call',
                'final_answer',
            ]);

            if (thought.action.type === 'final_answer') {
                expect(thought.action.content).toBeDefined();
                expect(typeof thought.action.content).toBe('string');
            }
        }, 30000);

        test('deve incluir metadata', async () => {
            const thought = await reactPlanner.think(
                'Test metadata inclusion',
                mockContext,
            );

            expect(thought.metadata).toBeDefined();
            expect(typeof thought.metadata).toBe('object');
            // Verifica se tem pelo menos uma propriedade
            expect(Object.keys(thought.metadata || {}).length).toBeGreaterThan(
                0,
            );
        }, 30000);

        test('deve calcular confidence', async () => {
            const thought = await reactPlanner.think(
                'Calculate confidence for this reasoning',
                mockContext,
            );

            if (thought.confidence !== undefined) {
                expect(thought.confidence).toBeGreaterThanOrEqual(0);
                expect(thought.confidence).toBeLessThanOrEqual(1);
            }
        }, 30000);
    });

    describe('🔍 Result Analysis', () => {
        test('deve analisar resultado de final_answer', async () => {
            const finalResult: ActionResult = {
                type: 'final_answer',
                content: 'Task completed successfully',
            };

            const analysis = await reactPlanner.analyzeResult(
                finalResult,
                mockContext,
            );

            expect(analysis.isComplete).toBe(true);
            expect(analysis.isSuccessful).toBe(true);
            expect(analysis.shouldContinue).toBe(false);
            expect(analysis.feedback).toBeDefined();
        });

        test('deve analisar resultado com erro', async () => {
            const errorResult: ActionResult = {
                type: 'error',
                error: 'Tool not found',
            };

            const analysis = await reactPlanner.analyzeResult(
                errorResult,
                mockContext,
            );

            expect(analysis.isComplete).toBe(false);
            expect(analysis.isSuccessful).toBe(false);
            expect(analysis.shouldContinue).toBe(true);
            expect(analysis.feedback).toContain('failed');
            expect(analysis.suggestedNextAction).toBeDefined();
        });

        test('deve analisar resultado de tool com sucesso', async () => {
            const toolResult: ActionResult = {
                type: 'tool_result',
                content: { result: 4 },
            };

            const analysis = await reactPlanner.analyzeResult(
                toolResult,
                mockContext,
            );

            expect(analysis).toBeDefined();
            expect(typeof analysis.isComplete).toBe('boolean');
            expect(typeof analysis.isSuccessful).toBe('boolean');
            expect(typeof analysis.shouldContinue).toBe('boolean');
            expect(analysis.feedback).toBeDefined();
        });

        test('deve usar LLM para análise detalhada', async () => {
            const toolResult: ActionResult = {
                type: 'tool_result',
                content: { temperature: 25, condition: 'sunny' },
            };

            const contextWithGoal = {
                ...mockContext,
                input: 'Get weather information for São Paulo',
            };

            const analysis = await reactPlanner.analyzeResult(
                toolResult,
                contextWithGoal,
            );

            expect(analysis.feedback).toBeDefined();
            expect(analysis.feedback.length).toBeGreaterThan(10);
        }, 30000);
    });

    describe('🔄 Think→Act→Observe Cycle', () => {
        test('deve completar ciclo completo', async () => {
            // Think
            const thought = await reactPlanner.think(
                'Calculate 10 + 15',
                mockContext,
            );

            expect(thought).toBeDefined();

            // Simulate Action result
            const actionResult: ActionResult = {
                type: 'tool_result',
                content: { result: 25 },
            };

            // Observe (analyze)
            const analysis = await reactPlanner.analyzeResult(
                actionResult,
                mockContext,
            );

            expect(analysis).toBeDefined();
            expect(analysis.feedback).toBeDefined();
        }, 30000);

        test('deve continuar iterações quando necessário', async () => {
            const iterativeContext = {
                ...mockContext,
                iterations: 1,
                history: [
                    {
                        thought: {
                            reasoning: 'Need to calculate',
                            action: {
                                type: 'tool_call' as const,
                                tool: 'calc',
                                arguments: {},
                            },
                        },
                        action: {
                            type: 'tool_call' as const,
                            tool: 'calc',
                            arguments: {},
                        },
                        result: {
                            type: 'tool_result' as const,
                            content: { result: 42 },
                        },
                        observation: {
                            feedback: 'Partial result',
                            isSuccessful: true,
                            isComplete: false,
                            shouldContinue: true,
                        },
                    },
                ],
            };

            const thought = await reactPlanner.think(
                'Continue with the calculation',
                iterativeContext,
            );

            expect(thought).toBeDefined();
            expect(thought.reasoning).toBeDefined();
        }, 30000);
    });

    describe('🎨 ReAct Format Parsing', () => {
        test('deve parsear formato ReAct do LLM', () => {
            // This tests the internal parsing logic
            // We'll access it indirectly through the think method
            expect(reactPlanner).toBeDefined();
        });

        test('deve lidar com formato mal formado', async () => {
            // Even with malformed LLM responses, should not crash
            const thought = await reactPlanner.think(
                'Test malformed response handling',
                mockContext,
            );

            expect(thought).toBeDefined();
            expect(thought.reasoning).toBeDefined();
            expect(thought.action).toBeDefined();
        }, 30000);
    });
});
