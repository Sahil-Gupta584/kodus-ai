/**
 * 🎯 LLM INTEGRATION EXAMPLE - Perfect Schema Compatibility
 *
 * Demonstrates how ContextNew integrates 100% with your existing:
 * - planStepSchema
 * - planningResultSchema
 * - LLM planning results
 */

import {
    PlanStep,
    PlanningResult,
    AgentRuntimeContext,
    createContextRuntime,
} from '../index.js';

// ===============================================
// 🔄 REAL INTEGRATION EXAMPLE
// ===============================================

/**
 * This is exactly how it works with your actual LLM results
 */
export class LLMIntegrationExample {
    private contextRuntime = createContextRuntime('mongodb://localhost:27017');

    /**
     * 1. LLM returns a planning result (your existing schema)
     */
    async handleLLMPlanningResult(
        sessionId: string,
        llmResult: PlanningResult,
    ) {
        console.log('🤖 LLM Planning Result received:');
        console.log(`   Goal: ${llmResult.goal}`);
        console.log(`   Steps: ${llmResult.plan.length}`);

        // Get current context
        const context = await this.contextRuntime.getContext(sessionId);

        // Apply the plan to context (perfect compatibility!)
        const updatedContext = this.applyPlanToContext(context, llmResult);

        // Update in MongoDB
        await this.updateContextWithPlan(sessionId, updatedContext, llmResult);
    }

    /**
     * 2. Execute plan steps and update context
     */
    async executeNextStep(sessionId: string): Promise<PlanStep | null> {
        const context = await this.contextRuntime.getContext(sessionId);

        // Find next pending step
        const nextStep = this.findNextPendingStep(context);
        if (!nextStep) return null;

        console.log(`🚀 Executing step: ${nextStep.description}`);

        // Update step status to 'executing'
        await this.updateStepStatus(sessionId, nextStep.id, 'executing');

        try {
            // Execute the tool call
            const result = await this.executeToolCall(nextStep.toolCall!);

            // Mark as completed
            await this.updateStepStatus(sessionId, nextStep.id, 'completed');
            await this.addStepResult(sessionId, nextStep.id, result);

            return { ...nextStep, status: 'completed' };
        } catch (error) {
            // Mark as failed
            await this.updateStepStatus(sessionId, nextStep.id, 'failed');
            await this.addStepError(sessionId, nextStep.id, error as Error);

            return {
                ...nextStep,
                status: 'failed',
                error: (error as Error).message,
            };
        }
    }

    /**
     * 3. createFinalResponse agora tem TODO o contexto!
     */
    async createFinalResponse(plannerContext: any) {
        // 🔥 SOLVES YOUR ORIGINAL PROBLEM!
        const finalContext =
            await this.contextRuntime.buildFinalResponseContext(plannerContext);

        // Now you have EVERYTHING:
        console.log('🎯 Complete context for createFinalResponse:');
        console.log(
            `   ✅ Current plan: ${finalContext.runtime.execution.planId}`,
        );
        console.log(
            `   ✅ Completed steps: ${finalContext.runtime.execution.completedSteps.length}`,
        );
        console.log(
            `   ✅ Failed steps: ${finalContext.runtime.execution.failedSteps.length}`,
        );
        console.log(
            `   ✅ Success rate: ${finalContext.executionSummary.successRate}%`,
        );
        console.log(
            `   ✅ Is replan: ${finalContext.executionSummary.replanCount > 0}`,
        );
        console.log(
            `   ✅ Entities: ${Object.keys(finalContext.runtime.entities).length} types`,
        );

        // Build perfect response with full context
        return this.buildContextualResponse(finalContext);
    }

    // ===== HELPER METHODS =====

    private applyPlanToContext(
        context: AgentRuntimeContext,
        planResult: PlanningResult,
    ): AgentRuntimeContext {
        return {
            ...context,
            execution: {
                ...context.execution,
                planId: `plan_${Date.now()}`,
                status: 'in_progress',
                completedSteps: [],
                failedSteps: [],
                currentStep: {
                    id: planResult.plan[0]?.id || '',
                    status: 'pending',
                    toolCall: planResult.plan[0]?.toolCall,
                },
            },
            // Store plan steps for execution tracking
            state: {
                ...context.state,
                phase: 'execution',
                pendingActions: planResult.plan.map((step) => step.id),
            },
        };
    }

    private findNextPendingStep(context: AgentRuntimeContext): PlanStep | null {
        // This would look at your stored plan and find next pending step
        // Implementation depends on how you store the plan
        return context.execution.currentStep?.status === 'pending'
            ? (context.execution.currentStep as any)
            : null;
    }

    private async updateStepStatus(
        sessionId: string,
        stepId: string,
        status: PlanStep['status'],
    ) {
        await this.contextRuntime.contextBridge.updateRuntimeContext(
            sessionId,
            {
                execution: {
                    currentStep: {
                        id: stepId,
                        status,
                        toolCall: undefined, // Keep existing toolCall
                    },
                },
            },
        );
    }

    private async executeToolCall(toolCall: any) {
        // Your actual tool execution logic
        return { success: true, result: 'Tool executed successfully' };
    }

    private async addStepResult(
        sessionId: string,
        stepId: string,
        result: any,
    ) {
        const context = await this.contextRuntime.getContext(sessionId);

        await this.contextRuntime.contextBridge.updateRuntimeContext(
            sessionId,
            {
                execution: {
                    completedSteps: [
                        ...context.execution.completedSteps,
                        stepId,
                    ],
                },
            },
        );
    }

    private async addStepError(
        sessionId: string,
        stepId: string,
        error: Error,
    ) {
        const context = await this.contextRuntime.getContext(sessionId);

        await this.contextRuntime.contextBridge.updateRuntimeContext(
            sessionId,
            {
                execution: {
                    failedSteps: [...context.execution.failedSteps, stepId],
                    lastError: error.message,
                },
            },
        );
    }

    private async updateContextWithPlan(
        sessionId: string,
        context: AgentRuntimeContext,
        planResult: PlanningResult,
    ) {
        // Store the plan in context for execution tracking
        await this.contextRuntime.contextBridge.updateRuntimeContext(
            sessionId,
            context,
        );
    }

    private buildContextualResponse(finalContext: any) {
        const { runtime, executionSummary } = finalContext;

        let response = `Based on our plan execution`;

        if (executionSummary.replanCount > 0) {
            response += ` (replan #${executionSummary.replanCount})`;
        }

        response += `:
        
✅ Completed: ${runtime.execution.completedSteps.length} steps
❌ Failed: ${runtime.execution.failedSteps.length} steps  
📊 Success rate: ${executionSummary.successRate}%

Here's what I accomplished...`;

        return {
            response,
            confidence: this.calculateConfidence(finalContext),
            metadata: {
                planId: runtime.execution.planId,
                isReplan: executionSummary.replanCount > 0,
                stepsSummary: {
                    completed: runtime.execution.completedSteps.length,
                    failed: runtime.execution.failedSteps.length,
                    total:
                        runtime.execution.completedSteps.length +
                        runtime.execution.failedSteps.length,
                },
            },
        };
    }

    private calculateConfidence(finalContext: any): number {
        const { executionSummary } = finalContext;

        let confidence = 0.8; // Base

        // Higher confidence with better success rate
        if (executionSummary.successRate > 90) confidence += 0.1;
        else if (executionSummary.successRate < 50) confidence -= 0.2;

        // Lower confidence if many replans
        if (executionSummary.replanCount > 2) confidence -= 0.1;

        return Math.max(0.3, Math.min(0.95, confidence));
    }
}

// ===============================================
// 🎯 EXAMPLE USAGE WITH YOUR ACTUAL SCHEMAS
// ===============================================

async function demonstrateCompatibility() {
    const integration = new LLMIntegrationExample();

    // 1. This is your actual LLM result (exact schema match)
    const llmPlanningResult: PlanningResult = {
        goal: 'Create a KODY rule and update Notion page',
        plan: [
            {
                id: 'step_1',
                description: 'Search for existing KODY rules',
                status: 'pending',
                toolCall: {
                    name: 'KODUS_SEARCH_KODY_RULE',
                    arguments: JSON.stringify({ query: 'similar rules' }),
                },
            },
            {
                id: 'step_2',
                description: 'Create new KODY rule',
                status: 'pending',
                toolCall: {
                    name: 'KODUS_CREATE_KODY_RULE',
                    arguments: JSON.stringify({
                        name: 'New Rule',
                        description: 'Auto-generated rule',
                    }),
                },
                dependencies: ['step_1'],
            },
            {
                id: 'step_3',
                description: 'Update Notion page',
                status: 'pending',
                toolCall: {
                    name: 'NOTION_UPDATE_PAGE',
                    arguments: JSON.stringify({
                        pageId: 'page-123',
                        content: 'Rule created successfully',
                    }),
                },
                dependencies: ['step_2'],
            },
        ],
        reasoning: 'Need to check existing rules before creating new one',
        confidence: 0.85,
    };

    // 2. Handle the LLM result (perfect compatibility!)
    await integration.handleLLMPlanningResult('session_123', llmPlanningResult);

    // 3. Execute steps
    let step = await integration.executeNextStep('session_123');
    while (step) {
        console.log(`Step ${step.id} result: ${step.status}`);
        step = await integration.executeNextStep('session_123');
    }

    // 4. createFinalResponse now has COMPLETE context
    const finalResponse = await integration.createFinalResponse({
        sessionId: 'session_123',
    });
    console.log('🎯 Final Response:', finalResponse);
}

// Run the demo
// demonstrateCompatibility();
