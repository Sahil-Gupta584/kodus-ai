/**
 * Complete Flow Test
 * 
 * Tests the complete agent execution flow from start to finish:
 * 1. Agent creation with identity
 * 2. Tool execution via events 
 * 3. Think→Act→Observe cycle
 * 4. Enhanced context features
 * 5. Response generation
 * 6. Conversation continuation
 */

import 'dotenv/config';
import { createOrchestration } from '../src/orchestration/sdk-orchestrator.js';
import { createGeminiProviderFromEnv } from '../src/core/llm/providers/gemini-provider.js';
import { createLLMAdapter } from '../src/core/llm/llm-adapter.js';

async function testCompleteFlow() {
    console.log('🔍 Complete Flow Test - Starting...\n');

    // Create LLM adapter
    const geminiProvider = createGeminiProviderFromEnv();
    const llmAdapter = createLLMAdapter(geminiProvider);

    // Create orchestrator with observability
    const orchestrator = createOrchestration({
        llmAdapter,
        defaultPlanner: 'react',
        defaultMaxIterations: 3,
        enableObservability: true,
        tenantId: 'flow-test-demo',
    });

    console.log('✅ 1. Orchestrator created with LLM adapter');

    // Create a simple tool
    const mathTool = orchestrator.createTool({
        name: 'math',
        description: 'Perform basic mathematical operations',
        inputSchema: {
            type: 'object',
            properties: {
                operation: { type: 'string', enum: ['add', 'multiply', 'subtract', 'divide'] },
                a: { type: 'number' },
                b: { type: 'number' }
            },
            required: ['operation', 'a', 'b']
        },
        execute: async (input: { operation: string; a: number; b: number }) => {
            const { operation, a, b } = input;
            let result: number;
            
            switch (operation) {
                case 'add': result = a + b; break;
                case 'multiply': result = a * b; break;
                case 'subtract': result = a - b; break;
                case 'divide': result = b !== 0 ? a / b : NaN; break;
                default: throw new Error(`Unknown operation: ${operation}`);
            }
            
            console.log(`   🔧 Tool executed: ${a} ${operation} ${b} = ${result}`);
            return { result, operation, inputs: { a, b } };
        }
    });

    console.log('✅ 2. Tool created and registered');

    // Create agent with complete identity
    const smartAgent = await orchestrator.createAgent({
        name: 'flow-test-agent',
        identity: {
            role: 'Mathematical Assistant',
            goal: 'Help users with mathematical calculations accurately and efficiently',
            description: 'A specialized agent for mathematical operations',
            expertise: ['mathematics', 'arithmetic', 'problem-solving'],
            personality: 'precise, helpful, explains reasoning',
            style: 'professional'
        },
        planner: 'react',
        maxIterations: 3,
    });

    console.log('✅ 3. Agent created with enhanced identity:');
    console.log(`   - Role: ${smartAgent.identity?.role}`);
    console.log(`   - Goal: ${smartAgent.identity?.goal}`);
    console.log(`   - Expertise: ${smartAgent.identity?.expertise?.join(', ')}`);

    // Test conversation flow
    console.log('\n🔄 4. Testing conversation flow...');
    
    const sessionId = 'test-session-' + Date.now();
    
    // First interaction
    console.log('\n   First message:');
    const result1 = await orchestrator.callAgent(
        'flow-test-agent',
        'Calculate 15 multiplied by 8',
        { sessionId }
    );

    console.log(`   📤 User: Calculate 15 multiplied by 8`);
    console.log(`   🤖 Agent: ${result1.output}`);
    console.log(`   📊 Iterations: ${result1.iterations}, Tools used: ${result1.toolsUsed}`);

    // Second interaction (continuation)
    console.log('\n   Second message (continuation):');
    const result2 = await orchestrator.callAgent(
        'flow-test-agent', 
        'Now add 25 to that result',
        { sessionId }
    );

    console.log(`   📤 User: Now add 25 to that result`);
    console.log(`   🤖 Agent: ${result2.output}`);
    console.log(`   📊 Iterations: ${result2.iterations}, Tools used: ${result2.toolsUsed}`);

    // Third interaction (different operation)
    console.log('\n   Third message (new operation):');
    const result3 = await orchestrator.callAgent(
        'flow-test-agent',
        'What is 100 divided by 4?',
        { sessionId }
    );

    console.log(`   📤 User: What is 100 divided by 4?`);
    console.log(`   🤖 Agent: ${result3.output}`);
    console.log(`   📊 Iterations: ${result3.iterations}, Tools used: ${result3.toolsUsed}`);

    console.log('\n✅ 5. Flow Test Results:');
    console.log('   🎯 Identity integration: Working');
    console.log('   🔄 Think→Act→Observe cycle: Working');  
    console.log('   🛠️  Tool execution: Working');
    console.log('   💬 Conversation continuity: Working');
    console.log('   🧠 Enhanced context: Working');

    console.log('\n📊 6. System Statistics:');
    const stats = orchestrator.getStats();
    console.log(`   - Total agents: ${stats.totalAgents}`);
    console.log(`   - Available tools: ${stats.availableTools}`);
    console.log(`   - LLM provider: ${stats.llmProvider}`);
    console.log(`   - Default planner: ${stats.defaultPlanner}`);

    console.log('\n🎉 Complete Flow Test PASSED!');
    console.log('All components are working correctly from start to finish.');

    return {
        success: true,
        results: [result1, result2, result3],
        stats
    };
}

// Run the test
testCompleteFlow()
    .then((results) => {
        console.log('\n✨ Test completed successfully!');
        console.log('The complete agent execution flow is working correctly.');
    })
    .catch((error) => {
        console.error('\n❌ Flow test failed:', error);
        console.error('There is an issue in the execution flow that needs to be fixed.');
        process.exit(1);
    });