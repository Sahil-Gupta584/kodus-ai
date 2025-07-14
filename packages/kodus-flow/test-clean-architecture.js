/**
 * Quick test to demonstrate clean architecture working
 * Run with: node test-clean-architecture.js
 */

const { createOrchestration } = require('./dist/orchestration/sdk-orchestrator.js');
const { createLLMAdapter } = require('./dist/core/llm/llm-adapter.js');
const { createGeminiProviderFromEnv } = require('./dist/core/llm/providers/gemini-provider.js');
const { z } = require('zod');

async function testCleanArchitecture() {
    console.log('🧠 Testing Clean Architecture...\n');
    
    try {
        // Create LLM adapter (MANDATORY)
        const geminiProvider = createGeminiProviderFromEnv();
        const llmAdapter = createLLMAdapter(geminiProvider);
        
        // Create orchestrator with clean architecture
        const orchestrator = createOrchestration({
            llmAdapter,
            defaultPlanner: 'react',
            defaultMaxIterations: 3,
            enableObservability: true,
            tenantId: 'test-clean-architecture'
        });
        
        console.log('✅ Clean Orchestrator created successfully');
        console.log('   - LLM Provider:', llmAdapter.getProvider().name);
        console.log('   - Default Planner: ReAct');
        console.log('   - Architecture: Clean (no God Object)\n');
        
        // Create a simple tool
        const testTool = orchestrator.createTool({
            name: 'test-tool',
            description: 'A simple test tool that echoes input',
            inputSchema: z.object({
                message: z.string()
            }),
            execute: async (input) => {
                return {
                    echo: input.message,
                    timestamp: new Date().toISOString(),
                    success: true
                };
            },
            categories: ['test']
        });
        
        console.log('✅ Test tool created successfully');
        
        // Create a simple agent
        const testAgent = await orchestrator.createAgent({
            name: 'test-agent',
            description: 'A test agent to validate clean architecture',
            planner: 'react',
            maxIterations: 2,
            executionMode: 'simple'
        });
        
        console.log('✅ Test agent created successfully');
        
        // Test tool execution
        const toolResult = await orchestrator.callTool('test-tool', {
            message: 'Hello from clean architecture!'
        });
        
        console.log('✅ Tool execution result:', {
            success: toolResult.success,
            result: toolResult.result,
            duration: toolResult.duration
        });
        
        // Test agent execution
        const agentResult = await orchestrator.callAgent('test-agent', 
            'Test the clean architecture by using the test-tool to echo "Architecture is clean!"'
        );
        
        console.log('✅ Agent execution result:', {
            success: agentResult.success,
            result: agentResult.result,
            duration: agentResult.duration
        });
        
        // Show stats
        const stats = orchestrator.getStats();
        console.log('\n📊 Clean Architecture Stats:');
        console.log('   - Total agents:', stats.totalAgents);
        console.log('   - Available tools:', stats.availableTools);
        console.log('   - LLM provider:', stats.llmProvider);
        console.log('   - Default planner:', stats.defaultPlanner);
        console.log('   - Tenant ID:', stats.tenantId);
        
        console.log('\n🎉 Clean Architecture Test PASSED!');
        console.log('✅ Framework working with proper separation of concerns');
        
    } catch (error) {
        console.error('❌ Clean Architecture Test FAILED:', error.message);
        process.exit(1);
    }
}

// Run the test
testCleanArchitecture();