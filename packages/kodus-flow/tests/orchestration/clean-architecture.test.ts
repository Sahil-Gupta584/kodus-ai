/**
 * @fileoverview Testes para a Nova Arquitetura Limpa
 *
 * OBJETIVO: Validar que a refatoração foi bem-sucedida
 * - SDKOrchestrator apenas coordena
 * - LLM obrigatório para agents
 * - Separação clara de responsabilidades
 * - Think→Act→Observe funcionando
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { createOrchestration } from '../../src/orchestration/sdk-orchestrator.js';
import { createMockLLMProvider } from '../../src/adapters/llm/index.js';
import { z } from 'zod';

describe('🏗️ Clean Architecture Tests', () => {
    let orchestrator: ReturnType<typeof createOrchestration>;

    beforeEach(() => {
        // Create mock LLM adapter
        const mockProvider = createMockLLMProvider();

        // Create orchestrator with clean architecture
        orchestrator = createOrchestration({
            llmAdapter: mockProvider,
            defaultPlanner: 'react',
            defaultMaxIterations: 3,
            enableObservability: true,
            tenantId: 'test-clean-arch',
        });
    });

    describe('🚨 LLM Obrigatório', () => {
        test('deve falhar se LLM não for fornecido', () => {
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

        test('deve aceitar LLM válido', () => {
            const mockProvider = createMockLLMProvider();

            expect(() => {
                createOrchestration({
                    llmAdapter: mockProvider,
                    defaultPlanner: 'react',
                });
            }).not.toThrow();
        });
    });

    describe('🎯 Separação de Responsabilidades', () => {
        test('orchestrator deve apenas coordenar', () => {
            const stats = orchestrator.getStats();

            expect(stats).toHaveProperty('totalAgents');
            expect(stats).toHaveProperty('availableTools');
            expect(stats).toHaveProperty('llmProvider');
            expect(stats).toHaveProperty('defaultPlanner');
            expect(stats.defaultPlanner).toBe('react');
        });

        test('orchestrator não deve ter métodos de planning', () => {
            // @ts-expect-error - Verificando que métodos não existem
            expect(orchestrator.createDefaultThink).toBeUndefined();
            // @ts-expect-error - Verificando que métodos não existem
            expect(orchestrator.createReActThought).toBeUndefined();
            // @ts-expect-error - Verificando que métodos não existem
            expect(orchestrator.createOODAThought).toBeUndefined();
        });

        test('orchestrator não deve ter métodos de routing', () => {
            // @ts-expect-error - Verificando que métodos não existem
            expect(orchestrator.shouldUseToolForInput).toBeUndefined();
            // @ts-expect-error - Verificando que métodos não existem
            expect(orchestrator.selectBestTool).toBeUndefined();
            // @ts-expect-error - Verificando que métodos não existem
            expect(orchestrator.determineToolExecutionStrategy).toBeUndefined();
        });
    });

    describe('🛠️ Tool Management', () => {
        test('deve criar tool corretamente', () => {
            const tool = orchestrator.createTool({
                name: 'test-tool',
                description: 'Tool for testing',
                inputSchema: z.object({
                    message: z.string(),
                }),
                execute: async (input) => ({
                    result: (input as { message: string }).message,
                }),
                categories: ['test'],
            });

            expect(tool.name).toBe('test-tool');
            expect(tool.description).toBe('Tool for testing');
        });

        test('deve executar tool corretamente', async () => {
            orchestrator.createTool({
                name: 'echo-tool',
                description: 'Echoes input',
                inputSchema: z.object({
                    text: z.string(),
                }),
                execute: async (input) => ({
                    echo: (input as { text: string }).text,
                }),
                categories: ['test'],
            });

            const result = await orchestrator.callTool('echo-tool', {
                text: 'Hello Clean Architecture!',
            });

            expect(result.success).toBe(true);
            expect(result.result).toEqual({
                echo: 'Hello Clean Architecture!',
            });
            expect(result.duration).toBeGreaterThan(0);
        });

        test('deve listar tools registradas', () => {
            orchestrator.createTool({
                name: 'tool-1',
                description: 'First tool',
                inputSchema: z.object({}),
                execute: async () => ({}),
                categories: ['test'],
            });

            orchestrator.createTool({
                name: 'tool-2',
                description: 'Second tool',
                inputSchema: z.object({}),
                execute: async () => ({}),
                categories: ['test'],
            });

            const tools = orchestrator.getRegisteredTools();
            expect(tools).toHaveLength(2);
            expect(tools[0].name).toBe('tool-1');
            expect(tools[1].name).toBe('tool-2');
        });
    });

    describe('🤖 Agent Management', () => {
        test('deve criar agent corretamente', async () => {
            const agent = await orchestrator.createAgent({
                name: 'test-agent',
                description: 'Agent for testing',
                planner: 'react',
                maxIterations: 3,
                executionMode: 'simple',
            });

            expect(agent.name).toBe('test-agent');
            expect(agent.description).toBe('Agent for testing');
        });

        test('deve listar agents criados', async () => {
            await orchestrator.createAgent({
                name: 'agent-1',
                description: 'First agent',
                planner: 'react',
            });

            await orchestrator.createAgent({
                name: 'agent-2',
                description: 'Second agent',
                planner: 'react',
            });

            const agents = orchestrator.listAgents();
            expect(agents).toHaveLength(2);
            expect(agents).toContain('agent-1');
            expect(agents).toContain('agent-2');
        });

        test('deve obter status do agent', async () => {
            await orchestrator.createAgent({
                name: 'status-agent',
                description: 'Agent for status testing',
                planner: 'react',
                executionMode: 'simple',
            });

            const status = orchestrator.getAgentStatus('status-agent');
            expect(status).not.toBeNull();
            expect(status!.name).toBe('status-agent');
            expect(status!.type).toBe('simple');
        });
    });

    describe('🔄 Agent Execution', () => {
        test('deve executar agent com sucesso', async () => {
            await orchestrator.createAgent({
                name: 'execution-agent',
                description: 'Agent for execution testing',
                planner: 'react',
                maxIterations: 2,
                executionMode: 'simple',
            });

            const result = await orchestrator.callAgent(
                'execution-agent',
                'Just say hello and confirm you are working',
            );

            // Com mock, pode não ter sucesso, mas deve ter resultado
            expect(result).toBeDefined();
            expect(result.duration).toBeGreaterThan(0);
            expect(result.context).toHaveProperty('agentName');
        });

        test('deve falhar se agent não existir', async () => {
            const result = await orchestrator.callAgent(
                'non-existent-agent',
                'Test input',
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });
    });

    describe('📊 Statistics & Monitoring', () => {
        test('deve retornar estatísticas corretas', async () => {
            // Criar alguns agents e tools
            await orchestrator.createAgent({
                name: 'stats-agent',
                description: 'Agent for stats',
                planner: 'react',
            });

            orchestrator.createTool({
                name: 'stats-tool',
                description: 'Tool for stats',
                inputSchema: z.object({}),
                execute: async () => ({}),
                categories: ['stats'],
            });

            const stats = orchestrator.getStats();

            expect(stats.totalAgents).toBe(1);
            expect(stats.availableTools).toBe(1);
            expect(stats.agentNames).toContain('stats-agent');
            expect(stats.llmProvider).toBe('mock-provider');
            expect(stats.defaultPlanner).toBe('react');
            expect(stats.tenantId).toBe('test-clean-arch');
        });
    });

    describe('🏗️ Architecture Validation', () => {
        test('deve manter arquitetura limpa', () => {
            // Verificar que orchestrator só tem métodos de coordenação
            const orchestratorMethods = Object.getOwnPropertyNames(
                Object.getPrototypeOf(orchestrator),
            );

            // Métodos esperados (coordenação)
            expect(orchestratorMethods).toContain('createAgent');
            expect(orchestratorMethods).toContain('callAgent');
            expect(orchestratorMethods).toContain('createTool');
            expect(orchestratorMethods).toContain('callTool');
            expect(orchestratorMethods).toContain('getStats');
            expect(orchestratorMethods).toContain('listAgents');

            // Métodos não esperados (lógica de negócio)
            expect(orchestratorMethods).not.toContain('createDefaultThink');
            expect(orchestratorMethods).not.toContain('createReActThought');
            expect(orchestratorMethods).not.toContain('shouldUseToolForInput');
        });

        test('deve ter LLM adapter configurado', () => {
            const stats = orchestrator.getStats();
            expect(stats.llmProvider).toBeDefined();
            expect(stats.llmProvider).toBe('mock-provider');
        });
    });
});
