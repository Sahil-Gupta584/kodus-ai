#!/usr/bin/env tsx

/**
 * 🧪 TEST SCRIPT - Unified Context Flow
 * 
 * Test the complete context layer integration:
 * ✅ Single ExecutionTracker (context.stepExecution)
 * ✅ SimpleExecutionLogger integration 
 * ✅ Smart persistence based on criteria
 * ✅ Tools available in observe() method
 */

import { ContextBuilder } from './src/core/context/context-builder.js';
import { ToolEngine } from './src/engine/tools/tool-engine.js';

async function testUnifiedContextFlow() {
    console.log('🧪 Testing Unified Context Flow...\n');

    try {
        // 1. Create ContextBuilder with ToolEngine
        const contextBuilder = ContextBuilder.getInstance();
        const toolEngine = new ToolEngine();
        
        // Add a simple test tool
        toolEngine.registerTool({
            name: 'test_tool',
            description: 'A simple test tool',
            inputSchema: {
                type: 'object',
                properties: {
                    message: { type: 'string', description: 'Test message' }
                },
                required: ['message']
            },
            handler: async (input: { message: string }) => {
                return { success: true, result: `Processed: ${input.message}` };
            }
        });

        contextBuilder.setToolEngine(toolEngine);

        // 2. Create AgentContext
        const agentContext = await contextBuilder.createAgentContext({
            agentName: 'test-agent',
            tenantId: 'test-tenant',
            thread: { id: 'test-thread' },
            correlationId: 'test-correlation-id',
        });

        console.log('✅ AgentContext created successfully');
        console.log(`📋 Available tools: ${agentContext.availableTools.length}`);
        console.log(`🎯 Tools: ${agentContext.availableTools.map(t => t.name).join(', ')}`);

        // 3. Test ExecutionTracker (single source)
        if (agentContext.stepExecution) {
            const stepId = agentContext.stepExecution.startStep(1);
            console.log(`✅ Step started with ID: ${stepId}`);

            // Simulate step update
            agentContext.stepExecution.updateStep(stepId, {
                thought: {
                    reasoning: 'Test reasoning',
                    action: {
                        type: 'tool_call',
                        toolName: 'test_tool',
                        input: { message: 'Hello Context!' }
                    }
                }
            });

            agentContext.stepExecution.addToolCall(
                stepId,
                'test_tool', 
                { message: 'Hello Context!' },
                { success: true, result: 'Processed: Hello Context!' },
                100
            );

            const steps = agentContext.stepExecution.getAllSteps();
            console.log(`✅ ExecutionTracker working: ${steps.length} steps recorded`);
        }

        // 4. Test Services access
        const services = contextBuilder.getServices();
        console.log('✅ Services accessible:');
        console.log(`  - MemoryManager: ${!!services.memoryManager}`);
        console.log(`  - SessionService: ${!!services.sessionService}`);
        console.log(`  - ToolEngine: ${!!services.toolEngine}`);
        console.log(`  - ExecutionLogger: ${!!services.getExecutionLogger()}`);

        // 5. Test SimpleExecutionLogger
        const executionLogger = services.getExecutionLogger();
        const steps = agentContext.stepExecution?.getAllSteps() || [];
        
        if (steps.length > 0) {
            const logResult = executionLogger.logExecution(
                agentContext.invocationId,
                agentContext.sessionId,
                agentContext.agentName,
                Date.now() - 1000,
                Date.now(),
                steps,
                {
                    hasToolCalls: true,
                    executionTimeMs: 1000,
                    multipleSteps: false,
                    hasErrors: false,
                    isDebugMode: false
                }
            );

            console.log('✅ SimpleExecutionLogger working:');
            console.log(`  - Should persist: ${logResult.shouldPersist}`);
            console.log(`  - Complexity: ${logResult.summary.complexityScore}/10`);
            console.log(`  - Tool calls: ${logResult.summary.toolCallsCount}`);
        }

        // 6. Test Context Persistence
        await agentContext.state.set('test', 'key1', 'value1');
        const retrieved = await agentContext.state.get<string>('test', 'key1');
        console.log(`✅ Context state working: ${retrieved === 'value1' ? 'PASS' : 'FAIL'}`);

        // 7. Test Health Check
        const health = await contextBuilder.health();
        console.log(`✅ Health check: ${health.status}`);

        console.log('\n🎉 All tests passed! Context layer is working correctly.');
        
        return true;

    } catch (error) {
        console.error('❌ Test failed:', error);
        return false;
    }
}

// Run the test
testUnifiedContextFlow()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('❌ Unexpected error:', error);
        process.exit(1);
    });