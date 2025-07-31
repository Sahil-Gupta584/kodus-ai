/**
 * Test to demonstrate multi-tenancy issues with current architecture
 */

import { PlanAndExecutePlanner } from './src/engine/planning/strategies/plan-execute-planner.js';

// Mock LLM Adapter
class MockLLMAdapter {
    async createPlan(input: string) {
        if (input === "hello") {
            return {
                strategy: "plan-execute",
                goal: input,
                plan: [],
                reasoning: ["Simple greeting - no tools needed"]
            };
        }
        return {
            strategy: "plan-execute", 
            goal: input,
            plan: [
                { id: "step-1", description: "Search data", tool: "search" }
            ],
            reasoning: ["Need to search for data"]
        };
    }
}

// Mock Context
function createMockContext(input: string, clientId: string) {
    return {
        input,
        history: [],
        iterations: 1,
        maxIterations: 10,
        isComplete: false,
        plannerMetadata: { clientId },
        agentContext: {
            availableToolsForLLM: []
        },
        update: () => {},
        getCurrentSituation: () => "Mock situation",
        getFinalResult: () => ({ success: true })
    };
}

async function testMultiTenancy() {
    console.log("🔬 Testing Multi-Tenancy Issues\n");
    
    const llmAdapter = new MockLLMAdapter() as any;
    const planner = new PlanAndExecutePlanner(llmAdapter);
    
    // 🚨 PROBLEMA: Same planner instance for different clients
    console.log("1. Creating contexts for different clients:");
    const clientA_context = createMockContext("hello", "CLIENT_A");
    const clientB_context = createMockContext("search data", "CLIENT_B");
    
    console.log("   Client A: 'hello' (should be empty plan)");
    console.log("   Client B: 'search data' (should have steps)\n");
    
    // 🔄 Simulate concurrent execution
    console.log("2. Simulating concurrent execution:");
    
    try {
        // Client A starts thinking
        console.log("   ⏰ Client A: planner.think() starts...");
        const thoughtA_promise = planner.think(clientA_context as any);
        
        // Client B starts thinking (while A is still processing)
        console.log("   ⏰ Client B: planner.think() starts...");  
        const thoughtB_promise = planner.think(clientB_context as any);
        
        // Wait for both to complete
        const [thoughtA, thoughtB] = await Promise.all([thoughtA_promise, thoughtB_promise]);
        
        console.log("\n3. Results:");
        console.log(`   Client A result: ${thoughtA.action.type} - "${thoughtA.action.content || 'no content'}"`);
        console.log(`   Client B result: ${thoughtB.action.type} - "${thoughtB.action.content || 'no content'}"`);
        
        // 🚨 EXPECTED PROBLEM: Both clients might get mixed results due to shared state
        console.log("\n4. Analysis:");
        if (thoughtA.action.type === "final_answer" && thoughtB.action.type === "tool_call") {
            console.log("   ✅ UNEXPECTED: Results are correct (race condition didn't happen this time)");
        } else {
            console.log("   ❌ PROBLEM: Results are mixed due to shared this.currentPlan state!");
        }
        
    } catch (error) {
        console.error("   ❌ ERROR:", error.message);
    }
    
    console.log("\n5. 🔍 Architecture Issues Identified:");
    console.log("   • Shared state: this.currentPlan is global across all clients");
    console.log("   • No isolation: ExecutionRuntime doesn't isolate by session");
    console.log("   • Race conditions: Concurrent clients overwrite each other's plans");
    console.log("   • No kernel per session: All executions share the same context");
}

// Run the test
testMultiTenancy().catch(console.error);