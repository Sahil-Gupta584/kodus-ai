/**
 * Clean Architecture Example
 *
 * Demonstrates the new clean architecture with:
 * - LLM mandatory for agents
 * - Proper separation of concerns
 * - Think→Act→Observe loop
 * - ReAct planner with real LLM
 */

import 'dotenv/config';
import { z } from 'zod';
import { createOrchestration } from '../src/orchestration/sdk-orchestrator.js';
import { createGeminiProviderFromEnv } from '../src/core/llm/providers/gemini-provider.js';
import { createLLMAdapter } from '../src/core/llm/llm-adapter.js';

// ──────────────────────────────────────────────────────────────────────────────
// 🚀 SETUP & CONFIGURATION
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
    console.log('🧠 Clean Architecture Example - Starting...\n');

    // Create LLM adapter (MANDATORY for agents)
    const geminiProvider = createGeminiProviderFromEnv();
    const llmAdapter = createLLMAdapter(geminiProvider);

    // Create orchestrator with clean architecture
    const orchestrator = createOrchestration({
        llmAdapter,
        defaultPlanner: 'react', // Use ReAct planner with real LLM
        defaultMaxIterations: 5,
        enableObservability: true,
        tenantId: 'clean-architecture-demo',
    });

    console.log('✅ Orchestrator created with clean architecture');
    console.log('   - LLM:', llmAdapter.getProvider().name);
    console.log('   - Default planner: ReAct');
    console.log('   - Architecture: Clean (no God Object)\n');

    // ──────────────────────────────────────────────────────────────────────────────
    // 🛠️ CREATE TOOLS
    // ──────────────────────────────────────────────────────────────────────────────

    // Simple calculator tool
    const calculatorTool = orchestrator.createTool({
        name: 'calculator',
        description: 'Perform basic mathematical calculations',
        inputSchema: z.object({
            expression: z
                .string()
                .describe('Mathematical expression like "2 + 3" or "10 * 5"'),
        }),
        execute: async (input) => {
            try {
                // Basic eval for demo - in production use a safer math parser
                const result = eval(input.expression);
                return {
                    result,
                    expression: input.expression,
                    success: true,
                };
            } catch (error) {
                return {
                    error: `Invalid expression: ${input.expression}`,
                    success: false,
                };
            }
        },
        categories: ['math', 'utility'],
    });

    // Weather tool (mock)
    const weatherTool = orchestrator.createTool({
        name: 'weather',
        description: 'Get current weather information for a location',
        inputSchema: z.object({
            location: z.string().describe('City name or location'),
        }),
        execute: async (input) => {
            // Mock weather data
            const weatherData = {
                'São Paulo': { temp: 22, condition: 'Cloudy', humidity: 65 },
                'Rio de Janeiro': {
                    temp: 28,
                    condition: 'Sunny',
                    humidity: 70,
                },
                'New York': { temp: 15, condition: 'Rainy', humidity: 80 },
            };

            const weather = weatherData[
                input.location as keyof typeof weatherData
            ] || {
                temp: 20,
                condition: 'Unknown',
                humidity: 50,
            };

            return {
                location: input.location,
                temperature: weather.temp,
                condition: weather.condition,
                humidity: weather.humidity,
                success: true,
            };
        },
        categories: ['weather', 'information'],
    });

    console.log('✅ Tools created:');
    console.log('   - Calculator: Basic math operations');
    console.log('   - Weather: Mock weather information\n');

    // ──────────────────────────────────────────────────────────────────────────────
    // 🤖 CREATE AGENTS
    // ──────────────────────────────────────────────────────────────────────────────

    // Math assistant agent
    const mathAgent = await orchestrator.createAgent({
        name: 'math-assistant',
        description:
            'Helpful assistant for mathematical calculations and problem solving',
        planner: 'react', // Explicit ReAct planner
        maxIterations: 3,
        executionMode: 'simple',
    });

    // General assistant agent
    const generalAgent = await orchestrator.createAgent({
        name: 'general-assistant',
        description:
            'General purpose assistant that can help with various tasks',
        planner: 'react',
        maxIterations: 5,
        executionMode: 'simple',
    });

    console.log('✅ Agents created:');
    console.log('   - Math Assistant: Specialized in calculations');
    console.log('   - General Assistant: Multi-purpose helper\n');

    // ──────────────────────────────────────────────────────────────────────────────
    // 🧪 TEST THE CLEAN ARCHITECTURE
    // ──────────────────────────────────────────────────────────────────────────────

    console.log('🧪 Testing Clean Architecture...\n');

    // Test 1: Math calculation
    console.log('📊 Test 1: Math calculation');
    const mathResult = await orchestrator.callAgent(
        'math-assistant',
        'What is 15 multiplied by 8, and then add 23?',
    );

    console.log('Math Result:', {
        success: mathResult.success,
        result: mathResult.result,
        duration: mathResult.duration,
    });
    console.log('');

    // Test 2: Weather query
    console.log('🌤️  Test 2: Weather query');
    const weatherResult = await orchestrator.callAgent(
        'general-assistant',
        'What is the weather like in São Paulo?',
    );

    console.log('Weather Result:', {
        success: weatherResult.success,
        result: weatherResult.result,
        duration: weatherResult.duration,
    });
    console.log('');

    // Test 3: Complex reasoning
    console.log('🧠 Test 3: Complex reasoning');
    const complexResult = await orchestrator.callAgent(
        'general-assistant',
        'If the weather in Rio de Janeiro is sunny and the temperature is above 25°C, calculate how many degrees warmer it is than São Paulo. Show your reasoning.',
    );

    console.log('Complex Result:', {
        success: complexResult.success,
        result: complexResult.result,
        duration: complexResult.duration,
    });
    console.log('');

    // ──────────────────────────────────────────────────────────────────────────────
    // 📊 SHOW ORCHESTRATOR STATS
    // ──────────────────────────────────────────────────────────────────────────────

    console.log('📊 Orchestrator Statistics:');
    const stats = orchestrator.getStats();
    console.log('   - Total agents:', stats.totalAgents);
    console.log('   - Agent names:', stats.agentNames);
    console.log('   - Available tools:', stats.availableTools);
    console.log('   - LLM provider:', stats.llmProvider);
    console.log('   - Default planner:', stats.defaultPlanner);
    console.log('   - Tenant ID:', stats.tenantId);
    console.log('');

    // Show registered tools
    console.log('🛠️  Registered Tools:');
    const tools = orchestrator.getRegisteredTools();
    tools.forEach((tool) => {
        console.log(`   - ${tool.name}: ${tool.description}`);
    });
    console.log('');

    // Show agent status
    console.log('🤖 Agent Status:');
    orchestrator.listAgents().forEach((agentName) => {
        const status = orchestrator.getAgentStatus(agentName);
        console.log(`   - ${agentName}: ${status?.type} mode`);
    });

    console.log('\n✅ Clean Architecture Example completed successfully!');
    console.log('🎉 Framework working with proper separation of concerns!');
}

// ──────────────────────────────────────────────────────────────────────────────
// 🚀 RUN EXAMPLE
// ──────────────────────────────────────────────────────────────────────────────

main().catch((error) => {
    console.error('❌ Example failed:', error);
    process.exit(1);
});
