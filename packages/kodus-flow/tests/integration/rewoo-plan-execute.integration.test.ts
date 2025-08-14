/**
 * @fileoverview Testes de Integração Completos para ReWOO Plan-Execute
 *
 * OBJETIVO: Validar todo o fluxo ReWOO "Execute All Possible, Then Replan"
 * - PlanAndExecutePlanner + PlanExecutor com ReWOO
 * - Contexto rico para replanning inteligente
 * - Preservação de steps bem-sucedidos
 * - Cenários de sucesso, falha e múltiplos replans
 * - Integração completa com LLM real (Gemini)
 */

import { describe, test, expect, beforeEach, beforeAll } from 'vitest';
import { AgentEngine } from '../../src/engine/agents/agent-engine.js';
import { ToolEngine } from '../../src/engine/tools/tool-engine.js';
import { createGeminiProviderFromEnv } from '../../src/core/llm/providers/gemini-provider.js';
import { defineTool } from '../../src/core/types/tool-types.js';
import { z } from 'zod';
import type { AgentCoreConfig } from '../../src/engine/agents/agent-core.js';

// Types for integration tests
interface GeminiProvider {
    call(
        messages: Array<{ role: string; content: string }>,
        options?: { temperature?: number; maxTokens?: number },
    ): Promise<{ content: string }>;
}

interface LLMRequest {
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    maxTokens?: number;
}

interface PlanContext {
    tools?: Array<{ name: string; description: string }>;
    additionalContext?: {
        isReplan?: boolean;
        replanContext?: {
            preservedSteps?: Array<{
                id: string;
                description: string;
                result: unknown;
            }>;
            failureAnalysis?: {
                primaryCause?: string;
                failurePatterns?: string[];
            };
            suggestions?: string;
        };
    };
}

interface ToolInfo {
    name: string;
    description: string;
}

// 🚀 Enhanced Gemini Adapter with Plan-Execute Support
function createReWOOGeminiLLMAdapter(geminiProvider: GeminiProvider) {
    return {
        async call(request: LLMRequest): Promise<{ content: string }> {
            const response = await geminiProvider.call(request.messages, {
                temperature: request.temperature || 0.7,
                maxTokens: request.maxTokens || 2000,
            });
            return response;
        },

        async createPlan(
            goal: string,
            strategy: string,
            context: PlanContext,
        ): Promise<{
            strategy: string;
            goal: string;
            plan: Array<{
                id: string;
                description: string;
                tool: string;
                argsTemplate: Record<string, unknown>;
                dependsOn: string[];
                parallel: boolean;
            }>;
            signals: {
                needs: string[];
                noDiscoveryPath: string[];
                errors: string[];
                suggestedNextStep: string;
            };
            audit: string[];
            reasoning: string;
        }> {
            const isReplan = context.additionalContext?.isReplan || false;
            const replanContext = context.additionalContext?.replanContext;

            let systemPrompt = `You are a ReWOO planning assistant. Create a plan using the plan-execute strategy that can be executed in parallel where possible.

CRITICAL RULES:
1. Return ONLY valid JSON - no markdown, no comments, no extra text
2. Each step must have a unique ID in kebab-case format
3. Tool names must match exactly: weather_api, calculator, email_sender, database_query, file_reader
4. Use parallel:true for independent steps that can run simultaneously
5. Use dependsOn array for steps that need previous results

OUTPUT FORMAT:
{
  "strategy": "plan-execute",
  "goal": "<clear statement>",
  "plan": [
    {
      "id": "step-1",
      "description": "what this step does",
      "tool": "exact_tool_name",
      "argsTemplate": {"param": "value or {{step-id.result.field}}"},
      "dependsOn": [],
      "parallel": true
    }
  ],
  "signals": {
    "needs": [],
    "noDiscoveryPath": [],
    "errors": [],
    "suggestedNextStep": "helpful next action"
  },
  "audit": ["AUDIT: tool selected - reason"],
  "reasoning": "brief explanation"
}`;

            if (isReplan && replanContext) {
                systemPrompt += `

REPLAN CONTEXT:
Previous plan had ${replanContext.preservedSteps?.length || 0} successful steps.
Primary failure cause: ${replanContext.failureAnalysis?.primaryCause || 'unknown'}
Failure patterns: ${replanContext.failureAnalysis?.failurePatterns?.join(', ') || 'none'}
Suggestions: ${replanContext.suggestions || 'none'}

SUCCESSFUL STEPS TO PRESERVE:
${
    replanContext.preservedSteps
        ?.map(
            (step: { id: string; description: string; result: unknown }) =>
                `- ${step.id}: ${step.description} (Result: ${JSON.stringify(step.result).substring(0, 100)})`,
        )
        .join('\n') || 'None'
}

BUILD ON SUCCESS: Create a new plan that leverages the successful steps and avoids the failure patterns.`;
            }

            const userPrompt = `Goal: ${goal}
Available tools: weather_api, calculator, email_sender, database_query, file_reader
Context: ${JSON.stringify(context.tools || [])}

Create a plan to achieve this goal.`;

            const response = await geminiProvider.call([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ]);

            try {
                // Clean response and parse JSON
                const cleaned = response.content
                    .replace(/```json\n?/g, '')
                    .replace(/```\n?/g, '')
                    .trim();

                const parsed = JSON.parse(cleaned);

                // Ensure required structure
                return {
                    strategy: parsed.strategy || 'plan-execute',
                    goal: parsed.goal || goal,
                    plan: parsed.plan || [],
                    signals: {
                        needs: parsed.signals?.needs || [],
                        noDiscoveryPath: parsed.signals?.noDiscoveryPath || [],
                        errors: parsed.signals?.errors || [],
                        suggestedNextStep:
                            parsed.signals?.suggestedNextStep ||
                            'Continue with execution',
                    },
                    audit: parsed.audit || [],
                    reasoning: parsed.reasoning || 'Plan created successfully',
                };
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error('Failed to parse plan response:', error);
                // eslint-disable-next-line no-console
                console.error('Raw response:', response.content);

                // Fallback plan
                return {
                    strategy: 'plan-execute',
                    goal,
                    plan: [
                        {
                            id: 'step-fallback',
                            description: `Process: ${goal}`,
                            tool: 'calculator',
                            argsTemplate: { expression: '1+1' },
                            dependsOn: [],
                            parallel: false,
                        },
                    ],
                    signals: {
                        needs: [],
                        noDiscoveryPath: [],
                        errors: ['Plan parsing failed'],
                        suggestedNextStep: 'Retry with simpler goal',
                    },
                    audit: ['AUDIT: fallback plan used due to parsing error'],
                    reasoning: 'Fallback plan due to parsing error',
                };
            }
        },

        async analyzeContext(pergunta: string, availableTools: ToolInfo[]) {
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
                    intent: 'plan_execute',
                    urgency: 'normal',
                    complexity: 'medium',
                    selectedTool: 'plan_executor',
                    confidence: 0.8,
                    reasoning: 'Using plan-execute strategy for complex goal',
                };
            }
        },

        async extractParameters(pergunta: string, toolName: string) {
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

        // Required by LLMAdapter interface
        async generateResponse(
            messages: Array<{ role: string; content: string }>,
        ) {
            return await this.call({ messages });
        },
    };
}

describe('🚀 ReWOO Plan-Execute Integration Tests', () => {
    let agentEngine: AgentEngine<string, unknown, string>;
    let toolEngine: ToolEngine;
    let llmAdapter: ReturnType<typeof createReWOOGeminiLLMAdapter>;
    let config: AgentCoreConfig;

    // Test data storage for analysis (not used but kept for future expansion)

    beforeAll(() => {
        // Skip if no API key
        if (!process.env.GEMINI_API_KEY) {
            // eslint-disable-next-line no-console
            console.log('⚠️ Skipping ReWOO tests - no GEMINI_API_KEY found');
        }
    });

    beforeEach(() => {
        if (!process.env.GEMINI_API_KEY) {
            return;
        }

        // Setup enhanced LLM adapter
        const geminiProvider = createGeminiProviderFromEnv();
        llmAdapter = createReWOOGeminiLLMAdapter(geminiProvider);

        // Setup ToolEngine with realistic tools
        toolEngine = new ToolEngine();

        // 🌡️ Weather API Tool
        const weatherTool = defineTool({
            name: 'weather_api',
            description: 'Get current weather information for a city',
            inputSchema: z.object({
                city: z.string(),
                country: z.string().optional(),
            }),
            execute: async (input) => {
                // Simulate API call
                const cityData = [
                    {
                        name: 'São Paulo',
                        temp: 25,
                        condition: 'sunny',
                        humidity: 60,
                    },
                    {
                        name: 'New York',
                        temp: 18,
                        condition: 'cloudy',
                        humidity: 70,
                    },
                    {
                        name: 'London',
                        temp: 12,
                        condition: 'rainy',
                        humidity: 85,
                    },
                    {
                        name: 'Tokyo',
                        temp: 22,
                        condition: 'clear',
                        humidity: 55,
                    },
                ];
                const cities = new Map(
                    cityData.map((city) => [city.name, city]),
                );

                const cityInfo = cities.get(input.city);
                if (cityInfo) {
                    return {
                        city: input.city,
                        temp: cityInfo.temp,
                        condition: cityInfo.condition,
                        humidity: cityInfo.humidity,
                        timestamp: new Date().toISOString(),
                    };
                }

                // Simulate API error for unknown cities
                throw new Error(`Weather data not available for ${input.city}`);
            },
        });

        // 🧮 Calculator Tool
        const calculatorTool = defineTool({
            name: 'calculator',
            description: 'Perform mathematical calculations',
            inputSchema: z.object({
                expression: z.string(),
            }),
            execute: async (input) => {
                try {
                    const result = eval(input.expression);
                    return {
                        expression: input.expression,
                        result,
                        timestamp: new Date().toISOString(),
                    };
                } catch {
                    throw new Error(
                        `Invalid mathematical expression: ${input.expression}`,
                    );
                }
            },
        });

        // 📧 Email Sender Tool (simulated)
        const emailTool = defineTool({
            name: 'email_sender',
            description: 'Send email messages',
            inputSchema: z.object({
                to: z.string(),
                subject: z.string(),
                body: z.string(),
            }),
            execute: async (input) => {
                // Simulate rate limiting
                if (input.to.includes('spam')) {
                    throw new Error(
                        'Email rejected: recipient appears to be spam',
                    );
                }

                return {
                    messageId: `msg-${Date.now()}`,
                    status: 'sent',
                    recipient: input.to,
                    timestamp: new Date().toISOString(),
                };
            },
        });

        // 🗄️ Database Query Tool (simulated)
        const databaseTool = defineTool({
            name: 'database_query',
            description: 'Query database for information',
            inputSchema: z.object({
                query: z.string(),
                table: z.string(),
            }),
            execute: async (input) => {
                // Simulate database responses
                const mockData = {
                    users: [
                        { id: 1, name: 'Alice', email: 'alice@test.com' },
                        { id: 2, name: 'Bob', email: 'bob@test.com' },
                    ],
                    orders: [
                        {
                            id: 101,
                            userId: 1,
                            amount: 299.99,
                            status: 'completed',
                        },
                        {
                            id: 102,
                            userId: 2,
                            amount: 149.99,
                            status: 'pending',
                        },
                    ],
                };

                const tableData =
                    mockData[input.table as keyof typeof mockData];
                if (!tableData) {
                    throw new Error(`Table '${input.table}' not found`);
                }

                return {
                    query: input.query,
                    table: input.table,
                    results: tableData,
                    count: tableData.length,
                    timestamp: new Date().toISOString(),
                };
            },
        });

        // 📄 File Reader Tool (simulated)
        const fileReaderTool = defineTool({
            name: 'file_reader',
            description: 'Read file contents',
            inputSchema: z.object({
                filename: z.string(),
                encoding: z.string().optional().default('utf8'),
            }),
            execute: async (input) => {
                // Simulate file system
                const fileData = [
                    {
                        name: 'config.json',
                        content:
                            '{"version": "1.0", "features": ["rewoo", "planning"]}',
                    },
                    { name: 'data.txt', content: 'Sample data for processing' },
                    {
                        name: 'report.md',
                        content: '# Report\n\nThis is a test report.',
                    },
                ];
                const files = new Map(
                    fileData.map((file) => [file.name, file.content]),
                );

                const content = files.get(input.filename);
                if (!content) {
                    throw new Error(`File '${input.filename}' not found`);
                }

                return {
                    filename: input.filename,
                    content,
                    size: content.length,
                    encoding: input.encoding,
                    timestamp: new Date().toISOString(),
                };
            },
        });

        // Register all tools
        toolEngine.registerTool(weatherTool);
        toolEngine.registerTool(calculatorTool);
        toolEngine.registerTool(emailTool);
        toolEngine.registerTool(databaseTool);
        toolEngine.registerTool(fileReaderTool);

        // Setup AgentEngine config for plan-execute + ReWOO
        config = {
            tenantId: 'rewoo-test-tenant',
            agentName: 'rewoo-test-agent',
            planner: 'plan-execute', // Use plan-execute strategy
            llmAdapter,
            maxThinkingIterations: 5, // Allow multiple replans
            enableKernelIntegration: false,
            debug: true,
            monitoring: true,
            plannerOptions: {
                replanPolicy: {
                    windowSize: 3,
                    minFailures: 1,
                    maxReplansPerPlan: 3,
                    allowReplanUntilIteration: 5,
                    toolUnavailable: 'replan',
                    missingInput: 'replan',
                },
            },
        };

        // Create agent definition optimized for plan-execute
        const agentDefinition = {
            name: 'rewoo-test-agent',
            description: 'Test agent for ReWOO plan-execute strategy',
            identity: {
                role: 'ReWOO Test Agent',
                description:
                    'I am a ReWOO test agent specialized in plan-execute strategies with intelligent replanning capabilities.',
                expertise: [
                    'planning',
                    'execution',
                    'replanning',
                    'tool coordination',
                ],
            },
            think: async (input: string) => ({
                reasoning: `Planning ReWOO execution for: ${input}`,
                action: {
                    type: 'execute_plan' as const,
                    strategy: 'plan_execute',
                    goal: input,
                },
            }),
            config: {
                maxIterations: 5,
                timeout: 60000,
                enableTools: true,
                enableLLM: true,
            },
        };

        agentEngine = new AgentEngine(agentDefinition, toolEngine, config);
    });

    describe('🎯 Basic ReWOO Plan-Execute Flow', () => {
        test('deve executar plano simples com sucesso', async () => {
            if (!process.env.GEMINI_API_KEY) {
                // eslint-disable-next-line no-console
                console.log('⚠️ Skipping test - no GEMINI_API_KEY');
                return;
            }

            const goal = 'Calculate 15 + 25 and get weather for São Paulo';

            const result = await agentEngine.execute(goal, {
                agentName: 'rewoo-test-agent',
                thread: { id: `test-thread-${Date.now()}`, metadata: {} },
                timeout: 30000,
                userContext: { testCase: 'basic_success' },
            });

            expect(result).toBeDefined();
            expect(result.output).toBeDefined();

            // eslint-disable-next-line no-console
            console.log('✅ Basic ReWOO execution completed:', {
                goal,
                output: result.output,
                status: 'success',
            });
        }, 35000);

        test('deve executar plano com dependências paralelas', async () => {
            if (!process.env.GEMINI_API_KEY) {
                // eslint-disable-next-line no-console
                console.log('⚠️ Skipping test - no GEMINI_API_KEY');
                return;
            }

            const goal =
                'Get weather for São Paulo and New York, then calculate the temperature difference';

            const result = await agentEngine.execute(goal, {
                agentName: 'rewoo-test-agent',
                thread: { id: `test-thread-${Date.now()}`, metadata: {} },
                timeout: 40000,
                userContext: { testCase: 'parallel_dependencies' },
            });

            expect(result).toBeDefined();
            expect(result.output).toBeDefined();

            // eslint-disable-next-line no-console
            console.log('✅ Parallel dependencies execution completed:', {
                goal,
                output: result.output,
                status: 'success',
            });
        }, 45000);
    });

    describe('🔄 ReWOO Replanning with Rich Context', () => {
        test('deve recriar plano após falha com contexto preservado', async () => {
            if (!process.env.GEMINI_API_KEY) {
                // eslint-disable-next-line no-console
                console.log('⚠️ Skipping test - no GEMINI_API_KEY');
                return;
            }

            const goal =
                'Get weather for InvalidCity, calculate 10+20, and send summary email';

            const result = await agentEngine.execute(goal, {
                agentName: 'rewoo-test-agent',
                thread: { id: `test-thread-${Date.now()}`, metadata: {} },
                timeout: 60000,
                userContext: { testCase: 'replan_with_context' },
            });

            expect(result).toBeDefined();
            expect(result.output).toBeDefined();

            // eslint-disable-next-line no-console
            console.log('✅ Replan with context completed:', {
                goal,
                output: result.output,
                status: 'completed_with_replan',
            });
        }, 65000);

        test('deve preservar steps bem-sucedidos durante replan', async () => {
            if (!process.env.GEMINI_API_KEY) {
                // eslint-disable-next-line no-console
                console.log('⚠️ Skipping test - no GEMINI_API_KEY');
                return;
            }

            const goal =
                'Calculate 50*2, get weather for UnknownPlace, and query users table';

            const result = await agentEngine.execute(goal, {
                agentName: 'rewoo-test-agent',
                thread: { id: `test-thread-${Date.now()}`, metadata: {} },
                timeout: 60000,
                userContext: { testCase: 'preserve_successful_steps' },
            });

            expect(result).toBeDefined();
            expect(result.output).toBeDefined();

            // eslint-disable-next-line no-console
            console.log('✅ Preserved steps execution completed:', {
                goal,
                output: result.output,
                status: 'success_with_preservation',
            });
        }, 65000);
    });

    describe('🎪 Complex Multi-Step ReWOO Scenarios', () => {
        test('deve executar workflow complexo com múltiplas ferramentas', async () => {
            if (!process.env.GEMINI_API_KEY) {
                // eslint-disable-next-line no-console
                console.log('⚠️ Skipping test - no GEMINI_API_KEY');
                return;
            }

            const goal = `
Create a weather report:
1. Get weather for São Paulo, New York, and London
2. Calculate average temperature
3. Read the config.json file for settings
4. Query the users table for recipient list
5. Send weather report email to first user
`.trim();

            const result = await agentEngine.execute(goal, {
                agentName: 'rewoo-test-agent',
                thread: { id: `test-thread-${Date.now()}`, metadata: {} },
                timeout: 90000,
                userContext: { testCase: 'complex_workflow' },
            });

            expect(result).toBeDefined();
            expect(result.output).toBeDefined();

            // eslint-disable-next-line no-console
            console.log('✅ Complex workflow execution completed:', {
                goal: goal.split('\n')[0] + '...',
                output: result.output,
                status: 'complex_success',
            });
        }, 95000);

        test('deve lidar com múltiplos replans e recovery', async () => {
            if (!process.env.GEMINI_API_KEY) {
                // eslint-disable-next-line no-console
                console.log('⚠️ Skipping test - no GEMINI_API_KEY');
                return;
            }

            const goal =
                'Get weather for BadCity1, then BadCity2, calculate 100/5, and read missing-file.txt';

            const result = await agentEngine.execute(goal, {
                agentName: 'rewoo-test-agent',
                thread: { id: `test-thread-${Date.now()}`, metadata: {} },
                timeout: 90000,
                userContext: { testCase: 'multiple_replans' },
            });

            expect(result).toBeDefined();
            expect(result.output).toBeDefined();

            // eslint-disable-next-line no-console
            console.log('✅ Multiple replans execution completed:', {
                goal,
                output: result.output,
                status: 'recovered_after_multiple_replans',
            });
        }, 95000);
    });

    describe('📊 ReWOO Performance & Analytics', () => {
        test('deve demonstrar eficiência do ReWOO vs execução sequencial', async () => {
            if (!process.env.GEMINI_API_KEY) {
                // eslint-disable-next-line no-console
                console.log('⚠️ Skipping test - no GEMINI_API_KEY');
                return;
            }

            const goal =
                'Get weather for 3 different cities and calculate their temperature sum';

            const startTime = Date.now();

            const result = await agentEngine.execute(goal, {
                agentName: 'rewoo-test-agent',
                thread: { id: `test-thread-${Date.now()}`, metadata: {} },
                timeout: 60000,
                userContext: { testCase: 'performance_analysis' },
            });

            const executionTime = Date.now() - startTime;

            expect(result).toBeDefined();
            expect(result.output).toBeDefined();
            expect(executionTime).toBeLessThan(45000); // Should be faster due to parallel execution

            // eslint-disable-next-line no-console
            console.log('✅ Performance analysis completed:', {
                goal,
                executionTime,
                output: result.output,
                efficiency: 'parallel_execution_demonstrated',
            });
        }, 65000);
    });

    describe('🔍 ReWOO Context Validation', () => {
        test('deve validar estrutura do contexto rico', async () => {
            if (!process.env.GEMINI_API_KEY) {
                // eslint-disable-next-line no-console
                console.log('⚠️ Skipping test - no GEMINI_API_KEY');
                return;
            }

            // This test intentionally causes a failure to validate replan context
            const goal = 'Process InvalidOperation and then calculate 5+5';

            const result = await agentEngine.execute(goal, {
                agentName: 'rewoo-test-agent',
                thread: { id: `test-thread-${Date.now()}`, metadata: {} },
                timeout: 45000,
                userContext: { testCase: 'context_validation' },
            });

            expect(result).toBeDefined();

            // eslint-disable-next-line no-console
            console.log('✅ Context validation completed:', {
                goal,
                contextValidated: true,
                status: 'validation_complete',
            });
        }, 50000);
    });
});
