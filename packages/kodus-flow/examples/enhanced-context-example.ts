/**
 * Enhanced Context Example
 * 
 * Demonstrates the new enhanced execution context features:
 * - Enhanced tool information with usage analytics
 * - Execution hints for better LLM performance
 * - Learning context from previous executions
 */

import 'dotenv/config';
import { createOrchestration } from '../src/orchestration/sdk-orchestrator.js';
import { createGeminiProviderFromEnv } from '../src/core/llm/providers/gemini-provider.js';
import { createLLMAdapter } from '../src/core/llm/llm-adapter.js';
import { 
    createEnhancedExecutionContext,
    generateExecutionHints,
    generateLearningContext,
    type EnhancedToolInfo,
    type ExecutionHints,
    type LearningContext
} from '../src/engine/planning/strategies/index.js';

async function demonstrateEnhancedContext() {
    console.log('🚀 Enhanced Context Example - Starting...\n');

    // Create LLM adapter
    const geminiProvider = createGeminiProviderFromEnv();
    const llmAdapter = createLLMAdapter(geminiProvider);

    // Create orchestrator
    const orchestrator = createOrchestration({
        llmAdapter,
        defaultPlanner: 'react',
        defaultMaxIterations: 3,
        enableObservability: true,
        tenantId: 'enhanced-context-demo',
    });

    // Create tools
    const calculatorTool = orchestrator.createTool({
        name: 'calculator',
        description: 'Perform mathematical calculations',
        inputSchema: { type: 'object', properties: { expression: { type: 'string' } } },
        execute: async (input: { expression: string }) => {
            try {
                const result = eval(input.expression);
                return { result, success: true };
            } catch (error) {
                throw new Error(`Invalid expression: ${input.expression}`);
            }
        },
    });

    const weatherTool = orchestrator.createTool({
        name: 'weather',
        description: 'Get weather information',
        inputSchema: { type: 'object', properties: { location: { type: 'string' } } },
        execute: async (input: { location: string }) => {
            // Mock weather - sometimes fails to demonstrate error analytics
            if (Math.random() > 0.7) {
                throw new Error('Weather service temporarily unavailable');
            }
            return {
                location: input.location,
                temperature: Math.round(Math.random() * 30 + 10),
                condition: ['sunny', 'cloudy', 'rainy'][Math.floor(Math.random() * 3)],
                success: true
            };
        },
    });

    // Create an agent with enhanced identity
    const smartAgent = await orchestrator.createAgent({
        name: 'smart-assistant',
        identity: {
            role: 'Intelligent Assistant',
            goal: 'Help users with calculations and weather information efficiently',
            description: 'A smart assistant that learns from interactions',
            expertise: ['mathematics', 'weather', 'analysis'],
            personality: 'helpful, concise, learns from mistakes',
            style: 'professional'
        },
        planner: 'react',
        maxIterations: 5,
    });

    console.log('✅ Agent created with enhanced identity');
    console.log('   - Role:', smartAgent.identity?.role);
    console.log('   - Goal:', smartAgent.identity?.goal);
    console.log('   - Expertise:', smartAgent.identity?.expertise?.join(', '));
    console.log('');

    // Simulate some execution history
    console.log('📊 Simulating execution history for context learning...');
    
    // Run a few operations to build history
    const tasks = [
        'Calculate 15 * 8',
        'What is the weather in London?', 
        'Calculate 100 / 5',
        'What is the weather in Tokyo?',
        'Calculate the square root of 144'
    ];

    for (const task of tasks) {
        try {
            console.log(`   • Processing: ${task}`);
            await orchestrator.callAgent('smart-assistant', task);
        } catch (error) {
            console.log(`   ❌ Failed: ${(error as Error).message}`);
        }
    }

    console.log('\n🧠 Enhanced Context Features:');

    // Demonstrate enhanced tool information
    console.log('\n1. Enhanced Tool Information:');
    const mockHistory: any[] = [
        { action: { type: 'tool_call', tool: 'calculator' }, result: { type: 'tool_result' } },
        { action: { type: 'tool_call', tool: 'calculator' }, result: { type: 'tool_result' } },
        { action: { type: 'tool_call', tool: 'weather' }, result: { type: 'error', error: 'Service unavailable' } },
        { action: { type: 'tool_call', tool: 'calculator' }, result: { type: 'tool_result' } },
    ];

    // Mock enhanced tools (normally this would be generated automatically)
    const enhancedTools: EnhancedToolInfo[] = [
        {
            name: 'calculator',
            description: 'Perform mathematical calculations',
            schema: {},
            usageCount: 3,
            lastSuccess: true,
            avgResponseTime: 120,
            errorRate: 0,
            lastUsed: Date.now()
        },
        {
            name: 'weather',
            description: 'Get weather information',
            schema: {},
            usageCount: 1,
            lastSuccess: false,
            avgResponseTime: 800,
            errorRate: 1.0,
            lastUsed: Date.now() - 1000
        }
    ];

    enhancedTools.forEach(tool => {
        console.log(`   📊 ${tool.name}:`);
        console.log(`      Usage: ${tool.usageCount} times`);
        console.log(`      Success Rate: ${((1 - (tool.errorRate || 0)) * 100).toFixed(1)}%`);
        console.log(`      Avg Response: ${tool.avgResponseTime}ms`);
        console.log('');
    });

    // Demonstrate execution hints generation
    console.log('2. Execution Hints:');
    const executionHints: ExecutionHints = generateExecutionHints(
        mockHistory,
        smartAgent.identity
    );

    console.log(`   💡 Current Goal: ${executionHints.currentGoal}`);
    console.log(`   🎯 Last Successful Action: ${executionHints.lastSuccessfulAction}`);
    console.log(`   ⚡ User Urgency: ${executionHints.userUrgency}`);
    console.log(`   🎨 Preferred Style: ${executionHints.userPreferences?.preferredStyle}`);
    console.log(`   📝 Verbosity: ${executionHints.userPreferences?.verbosity}`);
    console.log('');

    // Demonstrate learning context generation  
    console.log('3. Learning Context:');
    const learningContext: LearningContext = generateLearningContext(mockHistory);

    console.log(`   ❌ Common Mistakes: ${learningContext.commonMistakes.length} patterns identified`);
    learningContext.commonMistakes.forEach((mistake, i) => {
        console.log(`      ${i + 1}. ${mistake}`);
    });

    console.log(`   ✅ Success Patterns: ${learningContext.successPatterns.length} patterns identified`);
    learningContext.successPatterns.forEach((pattern, i) => {
        console.log(`      ${i + 1}. ${pattern}`);
    });

    console.log(`   🛠️  Preferred Tools: ${learningContext.preferredTools.join(', ') || 'None with high success rate yet'}`);
    console.log('');

    // Show how to create an enhanced execution context
    console.log('4. Creating Enhanced Execution Context:');
    console.log('   This would provide the LLM with rich context for better decision making:');
    console.log('   - Tool usage analytics help choose the most reliable tools');
    console.log('   - Execution hints guide the agent toward effective strategies');
    console.log('   - Learning context helps avoid repeated mistakes');
    console.log('   - Agent identity ensures consistent personality and expertise');

    console.log('\n✨ Enhanced Context Benefits:');
    console.log('   🎯 Smarter tool selection based on success rates');
    console.log('   🧠 Learning from previous mistakes and successes');
    console.log('   ⚡ Contextual urgency detection');
    console.log('   🎨 Consistent personality and style');
    console.log('   📊 Performance analytics for continuous improvement');

    console.log('\n🎉 Enhanced Context Example completed!');
    console.log('The agent now has much richer context for intelligent decision making.');
}

// Run the example
demonstrateEnhancedContext().catch((error) => {
    console.error('❌ Example failed:', error);
    process.exit(1);
});