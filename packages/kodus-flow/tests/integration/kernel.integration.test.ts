/**
 * @file Kernel Integration Test
 * @description Testes de integração focados exclusivamente no kernel
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createOrchestration } from '../../src/orchestration/index.js';
import { createMockLLMProvider } from '../../src/adapters/llm/index.js';
import { createKernel } from '../../src/kernel/index.js';
import { createRuntime } from '../../src/runtime/index.js';
import {
    ContextStateService,
    createBaseContext,
} from '../../src/core/context/index.js';
import { getObservability } from '../../src/observability/index.js';
import type { ExecutionKernel } from '../../src/kernel/index.js';
import type { WorkflowContext } from '../../src/core/types/workflow-types.js';
import { createDefaultMultiKernelHandler } from '../../src/engine/core/multi-kernel-handler.js';
import type { MultiKernelHandler } from '../../src/engine/core/multi-kernel-handler.js';
import { z } from 'zod';

describe('Kernel Integration Tests', () => {
    let orchestration: ReturnType<typeof createOrchestration>;
    let kernel: ExecutionKernel;
    let runtime: ReturnType<typeof createRuntime>;
    let context: ReturnType<typeof createBaseContext>;
    let observability: ReturnType<typeof getObservability>;

    beforeEach(() => {
        observability = getObservability({ environment: 'test' });
        const stateManager = new ContextStateService({});
        context = createBaseContext({
            tenantId: 'test-tenant',
        });

        const mockProvider = createMockLLMProvider();
        orchestration = createOrchestration({
            llmAdapter: mockProvider,
        });

        kernel = createKernel({
            tenantId: 'test-tenant',
            workflow: {
                name: 'test-workflow',
                on: () => {},
                createContext: () => ({
                    sendEvent: async () => {},
                    workflowName: 'test-workflow',
                    executionId: 'test-execution',
                    stateManager: stateManager as ContextStateService,
                    data: {},
                    currentSteps: [],
                    completedSteps: [],
                    failedSteps: [],
                    metadata: {},
                    tenantId: 'test-tenant',
                    environment: 'test',
                    version: '1.0.0',
                    signal: new AbortController().signal,
                    isPaused: false,
                    isCompleted: false,
                    isFailed: false,
                    cleanup: async () => {},
                    startTime: Date.now(),
                    status: 'RUNNING',
                }),
                emit: () => {},
                pause: async (reason?: string) => reason || 'paused',
                resume: async () => {},
                cleanup: async () => {},
            },
        });
        const workflowContext = {
            ...context,
            workflowName: 'test-workflow',
            stateManager: stateManager as ContextStateService,
            data: {},
            currentSteps: [],
            completedSteps: [],
            failedSteps: [],
            signal: new AbortController().signal,
            isPaused: false,
            isCompleted: false,
            isFailed: false,
            cleanup: async () => {},
            startTime: Date.now(),
            status: 'RUNNING' as const,
        } as WorkflowContext;
        runtime = createRuntime(workflowContext, observability);
    });

    afterEach(() => {
        // Cleanup
        runtime.clear();
    });

    it('should create agent through orchestration', async () => {
        // Create a simple agent using orchestration API
        const agent = await orchestration.createAgent({
            name: 'test-agent',
            description: 'Test agent for integration',
            think: async (input, _context) => {
                return {
                    reasoning: 'Test reasoning',
                    action: {
                        type: 'final_answer' as const,
                        content: { success: true, data: input },
                    },
                };
            },
        });

        expect(agent).toBeDefined();
        expect(agent.name).toBe('test-agent');
    });

    it('should create tool through orchestration', async () => {
        const tool = orchestration.createTool({
            name: 'test-tool',
            description: 'Test tool for integration',
            inputSchema: z.object({
                input: z.string().describe('Input string'),
            }),
            execute: async (input) => {
                return { success: true, result: input };
            },
        });

        expect(tool).toBeDefined();
        expect(tool.name).toBe('test-tool');
    });

    it('should execute agent through orchestration', async () => {
        await orchestration.createAgent({
            name: 'test-execution-agent',
            description: 'Test agent for execution',
            think: async (input, _context) => {
                return {
                    reasoning: 'Processing input',
                    action: {
                        type: 'final_answer' as const,
                        content: { success: true, processed: input },
                    },
                };
            },
        });

        // Criar e inicializar MultiKernelHandler
        const kernelHandler = createDefaultMultiKernelHandler('test-tenant');
        await kernelHandler.initialize();

        // Recuperar o AgentEngine do Orchestrator e injetar o MultiKernelHandler
        // @ts-expect-error acesso interno para teste
        const agentData = orchestration.agents.get('test-execution-agent');
        if (
            agentData &&
            typeof agentData.instance === 'object' &&
            agentData.instance !== null &&
            'setKernelHandler' in agentData.instance
        ) {
            (
                agentData.instance as {
                    setKernelHandler: (kh: MultiKernelHandler) => void;
                }
            ).setKernelHandler(kernelHandler);
        }

        const result = await orchestration.callAgent('test-execution-agent', {
            test: 'data',
        });

        expect(result).toBeDefined();
        expect(result.success).toBe(true);
        expect(result.result).toBeDefined();
    });

    it('should integrate kernel with runtime', async () => {
        // Test kernel context management
        kernel.setContext('test', 'key', 'value');
        const kernelValue = kernel.getContext('test', 'key');
        expect(kernelValue).toBe('value');

        // Test runtime event processing
        let eventProcessed = false;
        runtime.on('test.event', async (event) => {
            eventProcessed = true;
            expect(event.type).toBe('test.event');
        });

        await runtime.emitAsync('test.event', { data: 'test' });
        await runtime.process();

        expect(eventProcessed).toBe(true);
    });
});
