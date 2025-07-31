/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @module tests/orchestration/direct-llm-adapter.test.ts
 * @description Testes para DirectLLMAdapter com SDK Orchestrator
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { createOrchestration } from '../../src/orchestration/index.js';
import { createDirectLLMAdapter } from '../../src/core/llm/direct-llm-adapter.js';
import type { SDKOrchestrator } from '../../src/orchestration/sdk-orchestrator.js';

// ──────────────────────────────────────────────────────────────────────────────
// 📋 MOCK LANGCHAIN LLM
// ──────────────────────────────────────────────────────────────────────────────

const mockLangChainLLM = {
    name: 'test-llm',
    async call(
        messages: Array<{ role: string; content: string }>,
    ): Promise<{ content: string }> {
        const lastMessage = messages[messages.length - 1];
        const content = lastMessage?.content || '';

        // Simula resposta baseada no conteúdo
        if (content.includes('plan') || content.includes('goal')) {
            return {
                content: JSON.stringify({
                    strategy: 'cot',
                    goal: 'test goal',
                    steps: [
                        {
                            id: 'step_1',
                            description: 'Test step',
                            tool: 'test_tool',
                            arguments: {},
                            dependencies: [],
                            type: 'action',
                        },
                    ],
                    reasoning: 'Test reasoning',
                    complexity: 'medium',
                }),
            };
        }

        return {
            content: 'Mock response',
        };
    },
};

// ──────────────────────────────────────────────────────────────────────────────
// 🧪 TESTES
// ──────────────────────────────────────────────────────────────────────────────

describe('DirectLLMAdapter com SDK Orchestrator', () => {
    let llmAdapter: any;
    let orchestration: SDKOrchestrator;

    beforeEach(() => {
        // ✅ CRIAR DIRECT LLM ADAPTER
        llmAdapter = createDirectLLMAdapter(mockLangChainLLM);
    });

    test('✅ DirectLLMAdapter deve ter método getProvider()', () => {
        expect(llmAdapter.getProvider).toBeDefined();
        expect(typeof llmAdapter.getProvider).toBe('function');

        const provider = llmAdapter.getProvider();
        expect(provider).toBeDefined();
        expect(provider.name).toBe('test-llm');
    });

    test('✅ DirectLLMAdapter deve ter métodos de planning', () => {
        expect(llmAdapter.createPlan).toBeDefined();
        expect(llmAdapter.getAvailableTechniques).toBeDefined();
        expect(typeof llmAdapter.createPlan).toBe('function');
        expect(typeof llmAdapter.getAvailableTechniques).toBe('function');
    });

    test('✅ DirectLLMAdapter deve ter métodos de routing', () => {
        expect(llmAdapter.routeToTool).toBeDefined();
        expect(llmAdapter.getAvailableRoutingStrategies).toBeDefined();
        expect(typeof llmAdapter.routeToTool).toBe('function');
        expect(typeof llmAdapter.getAvailableRoutingStrategies).toBe(
            'function',
        );
    });

    test('✅ SDK Orchestrator deve aceitar DirectLLMAdapter', () => {
        expect(() => {
            orchestration = createOrchestration({
                tenantId: 'test-tenant',
                llmAdapter,
            });
        }).not.toThrow();

        expect(orchestration).toBeDefined();
    });

    test('✅ SDK Orchestrator deve criar agentes com DirectLLMAdapter', async () => {
        orchestration = createOrchestration({
            tenantId: 'test-tenant',
            llmAdapter,
        });

        const agent = await orchestration.createAgent({
            name: 'test-agent',
            identity: {
                role: 'Assistant',
                goal: 'Help users',
                description: 'Test assistant',
            },
            planner: 'react',
        });

        expect(agent).toBeDefined();
        expect(agent.name).toBe('test-agent');
    });

    test('✅ SDK Orchestrator deve executar agentes com DirectLLMAdapter', async () => {
        orchestration = createOrchestration({
            tenantId: 'test-tenant',
            llmAdapter,
        });

        await orchestration.createAgent({
            name: 'test-agent',
            identity: {
                role: 'Assistant',
                goal: 'Help users',
                description: 'Test assistant',
            },
            planner: 'react',
        });

        const result = await orchestration.callAgent('test-agent', 'Hello!');

        expect(result).toBeDefined();
        expect(result.success).toBe(true);
    });

    test('✅ DirectLLMAdapter deve funcionar com diferentes técnicas', async () => {
        const plan = await llmAdapter.createPlan('Test goal', 'cot');
        expect(plan).toBeDefined();
        expect(plan.strategy).toBe('cot');
        expect(plan.steps).toBeDefined();
        expect(Array.isArray(plan.steps)).toBe(true);
    });

    test('✅ DirectLLMAdapter deve funcionar com routing', async () => {
        const routing = await llmAdapter.routeToTool('Test input', [
            'tool1',
            'tool2',
        ]);
        expect(routing).toBeDefined();
        expect(routing.strategy).toBeDefined();
        expect(routing.selectedTool).toBeDefined();
    });
});
