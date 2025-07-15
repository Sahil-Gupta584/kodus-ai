/**
 * Tests for improved ReAct Planner with structured output
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ReActPlanner } from './react-planner.js';
import type { LLMAdapter } from '../../../adapters/llm/index.js';
import type {
    PlannerExecutionContext,
    EnhancedToolInfo,
} from '../planner-factory.js';

// Mock LLM Adapter
const createMockLLMAdapter = (options: {
    supportsStructured?: boolean;
    structuredResponse?: unknown;
    createPlanResponse?: unknown;
}) => {
    const mockAdapter: Partial<LLMAdapter> = {
        call: vi.fn().mockResolvedValue({
            content: JSON.stringify({
                reasoning: 'Test reasoning',
                action: { type: 'final_answer', content: 'Test response' },
            }),
        }),
        getProvider: () => ({ name: 'test-provider' }),
        supportsStructuredGeneration: () => options.supportsStructured || false,
        generateStructured: vi
            .fn()
            .mockResolvedValue(options.structuredResponse),
        createPlan: vi.fn().mockResolvedValue(
            options.createPlanResponse || {
                id: 'test-plan',
                strategy: 'react',
                goal: 'test goal',
                steps: [
                    {
                        id: 'step_1',
                        description: 'test step',
                        tool: 'test_tool',
                        arguments: { query: 'test' },
                        type: 'action',
                    },
                ],
                reasoning: 'Test reasoning',
                complexity: 'medium',
            },
        ),
        getAvailableTechniques: () => ['react'],
    };
    return mockAdapter as LLMAdapter;
};

// Mock tools
const mockTools: EnhancedToolInfo[] = [
    {
        name: 'search_tool',
        description: 'Search for information',
        schema: {},
    },
    {
        name: 'calculator',
        description: 'Perform calculations',
        schema: {},
    },
];

describe('ReActPlanner with Structured Output', () => {
    let planner: ReActPlanner;
    let context: PlannerExecutionContext;

    beforeEach(() => {
        context = {
            input: 'Test task',
            availableTools: mockTools,
            history: [],
            iterations: 1,
            maxIterations: 10,
            plannerMetadata: {},
            agentIdentity: {
                role: 'test-agent',
            },
            update: vi.fn(),
            getCurrentSituation: vi.fn().mockReturnValue('Test situation'),
            isComplete: false,
            getFinalResult: vi.fn().mockReturnValue({ success: true }),
        };
    });

    test('should use structured output when supported', async () => {
        const structuredResponse = {
            reasoning: 'I need to search for information',
            action: {
                type: 'tool_call',
                tool: 'search_tool',
                arguments: { query: 'test query' },
            },
            confidence: 0.9,
        };

        const mockAdapter = createMockLLMAdapter({
            supportsStructured: true,
            structuredResponse,
        });

        planner = new ReActPlanner(mockAdapter);
        const result = await planner.think(
            'Search for test information',
            context,
        );

        expect(mockAdapter.generateStructured).toHaveBeenCalled();
        expect(result.reasoning).toBe(structuredResponse.reasoning);
        expect(result.action.type).toBe('tool_call');
        expect(result.confidence).toBe(0.9);
    });

    test('should fallback to traditional approach when structured fails', async () => {
        const mockAdapter = createMockLLMAdapter({
            supportsStructured: true,
            structuredResponse: Promise.reject(
                new Error('Structured generation failed'),
            ),
        });

        planner = new ReActPlanner(mockAdapter);
        const result = await planner.think('Test task', context);

        expect(mockAdapter.createPlan).toHaveBeenCalled();
        expect(result.reasoning).toBeDefined();
        expect(result.action).toBeDefined();
    });

    test('should validate tools and convert invalid tool calls to final_answer', async () => {
        const structuredResponse = {
            reasoning: 'I want to use an invalid tool',
            action: {
                type: 'tool_call',
                tool: 'invalid_tool',
                arguments: { query: 'test' },
            },
            confidence: 0.8,
        };

        const mockAdapter = createMockLLMAdapter({
            supportsStructured: true,
            structuredResponse,
        });

        planner = new ReActPlanner(mockAdapter);
        const result = await planner.think('Test task', context);

        expect(result.action.type).toBe('final_answer');
        expect(result.reasoning).toContain('invalid_tool');
        expect(result.reasoning).toContain('Available tools');
        expect(result.metadata?.fallbackReason).toBe('tool_not_available');
    });

    test('should handle no tools available scenario', async () => {
        const emptyToolsContext = {
            ...context,
            availableTools: [],
        };

        const structuredResponse = {
            reasoning: 'No tools available, providing direct answer',
            action: {
                type: 'final_answer',
                content:
                    'I can help you with information from my knowledge base',
            },
            confidence: 0.7,
        };

        const mockAdapter = createMockLLMAdapter({
            supportsStructured: true,
            structuredResponse,
        });

        planner = new ReActPlanner(mockAdapter);
        const result = await planner.think(
            'Help me with something',
            emptyToolsContext,
        );

        expect(result.action.type).toBe('final_answer');
        expect(result.reasoning).toContain('No tools available');
    });

    test('should build improved prompt with context engineering', async () => {
        const mockAdapter = createMockLLMAdapter({
            supportsStructured: true,
            structuredResponse: {
                reasoning: 'Test',
                action: { type: 'final_answer', content: 'Test' },
            },
        });

        planner = new ReActPlanner(mockAdapter);

        // Add some history to test context building
        const contextWithHistory = {
            ...context,
            history: [
                {
                    thought: {
                        reasoning: 'Previous thought',
                        action: {
                            type: 'tool_call' as const,
                            tool: 'search_tool',
                            arguments: {},
                        },
                    },
                    action: {
                        type: 'tool_call' as const,
                        tool: 'search_tool',
                        arguments: {},
                    },
                    result: {
                        type: 'tool_result' as const,
                        content: 'Previous result',
                    },
                    observation: {
                        isComplete: false,
                        isSuccessful: true,
                        feedback: 'Previous observation',
                        shouldContinue: true,
                    },
                },
            ],
        };

        await planner.think('Test with history', contextWithHistory);

        const generateCall = mockAdapter.generateStructured as ReturnType<
            typeof vi.fn
        >;
        expect(generateCall).toHaveBeenCalled();

        const callArgs = generateCall.mock.calls[0][0];
        const prompt = callArgs.messages[0].content;

        expect(prompt).toContain('Available tools:');
        expect(prompt).toContain('Recent context:');
        expect(prompt).toContain('JSON structure');
    });
});
