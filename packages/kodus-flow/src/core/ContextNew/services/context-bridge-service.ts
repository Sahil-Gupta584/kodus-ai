/**
 * 🌉 CONTEXT BRIDGE SERVICE - SOLVES createFinalResponse
 *
 * THE solution to the original problem: "Quando eu chego aqui createFinalResponse,
 * eu não tenho todo contexto necessário para trabalhar"
 */

import {
    ContextBridgeService,
    FinalResponseContext,
    AgentRuntimeContext,
    SessionManager,
    ExecutionSnapshot,
} from '../types/context-types.js';
import { PlannerExecutionContext } from '../../types/allTypes.js';
import { MongoDBSessionService } from './mongodb-session-service.js';

// ===============================================
// 🎯 CONTEXT BRIDGE IMPLEMENTATION
// ===============================================

export class ContextBridge implements ContextBridgeService {
    constructor(private sessionManager: SessionManager) {}

    /**
     * 🔥 THE CORE METHOD - Solves createFinalResponse context problem
     *
     * Before: createFinalResponse had no context about what was executed,
     *         what succeeded, what failed, if it's a replan, etc.
     *
     * After: Complete context with execution history, entities, conversation,
     *        recovery info, and inferences for perfect responses.
     */
    async buildFinalResponseContext(
        plannerContext: PlannerExecutionContext,
    ): Promise<FinalResponseContext> {
        // 1. Get or recover session with all context
        const recovery = await this.sessionManager.recoverSession(
            plannerContext.sessionId,
        );
        const runtime = recovery.context;

        // 2. Build execution summary from recent activity
        const executionSummary = await this.buildExecutionSummary(runtime);

        // 3. Prepare recovery info if session was recovered
        const recoveryInfo = recovery.wasRecovered
            ? {
                  wasRecovered: true,
                  gapDuration: recovery.gapDuration,
                  recoveredFrom: 'mongodb-session',
                  confidence: this.calculateRecoveryConfidence(recovery),
              }
            : undefined;

        // 4. Build complete context
        const finalContext: FinalResponseContext = {
            runtime,
            executionSummary,
            recovery: recoveryInfo,
            inferences: recovery.inferences,
        };

        console.log(
            `🌉 ContextBridge: Built complete context for createFinalResponse`,
        );
        console.log(`   • Messages: ${runtime.messages.length}`);
        console.log(
            `   • Entities: ${Object.keys(runtime.entities).length} types`,
        );
        console.log(`   • Success rate: ${executionSummary.successRate}%`);
        console.log(`   • Recovered: ${recovery.wasRecovered ? 'Yes' : 'No'}`);

        return finalContext;
    }

    async getRuntimeContext(sessionId: string): Promise<AgentRuntimeContext> {
        const recovery = await this.sessionManager.recoverSession(sessionId);
        return recovery.context;
    }

    async updateRuntimeContext(
        sessionId: string,
        updates: Partial<AgentRuntimeContext>,
    ): Promise<void> {
        // Update different parts based on what's provided
        if (updates.messages) {
            for (const message of updates.messages) {
                await this.sessionManager.addMessage(sessionId, message);
            }
        }

        if (updates.entities) {
            await this.sessionManager.addEntities(sessionId, updates.entities);
        }

        if (updates.execution) {
            await this.sessionManager.updateExecution(
                sessionId,
                updates.execution,
            );
        }

        if (updates.state) {
            // Update state fields directly via session manager
            if (this.sessionManager instanceof MongoDBSessionService) {
                await (this.sessionManager as any).sessions.updateOne(
                    { sessionId },
                    {
                        $set: {
                            'runtime.state': updates.state,
                            'lastActivityAt': new Date(),
                        },
                    },
                );
            }
        }
    }

    // ===== HELPER METHODS =====

    private async buildExecutionSummary(runtime: AgentRuntimeContext) {
        const execution = runtime.execution;

        // Calculate metrics from current execution state
        const totalSteps =
            execution.completedSteps.length + execution.failedSteps.length;
        const successfulSteps = execution.completedSteps.length;
        const failedSteps = execution.failedSteps.length;

        // Simple success rate calculation
        const successRate =
            totalSteps > 0
                ? Math.round((successfulSteps / totalSteps) * 100)
                : 100;

        // Estimate execution time based on steps (rough approximation)
        const estimatedExecutionTime =
            totalSteps > 0 ? totalSteps * 2000 : 1000; // 2s per step average

        return {
            totalExecutions: this.countExecutionsFromMessages(runtime.messages),
            successfulExecutions: successfulSteps,
            failedExecutions: failedSteps,
            successRate,
            averageExecutionTime: estimatedExecutionTime,
            replanCount: execution.replanCount || 0,
        };
    }

    private countExecutionsFromMessages(messages: any[]): number {
        // Count tool calls as executions
        return messages.filter(
            (msg) =>
                msg.role === 'assistant' &&
                msg.tool_calls &&
                msg.tool_calls.length > 0,
        ).length;
    }

    private calculateRecoveryConfidence(recovery: any): number {
        let confidence = 0.7; // Base confidence

        // Higher confidence if gap is short
        if (recovery.gapDuration < 300000) {
            // < 5 minutes
            confidence += 0.2;
        } else if (recovery.gapDuration < 900000) {
            // < 15 minutes
            confidence += 0.1;
        }

        // Higher confidence if we have entities to infer from
        if (Object.keys(recovery.inferences).length > 0) {
            confidence += 0.1;
        }

        return Math.min(confidence, 1.0);
    }
}

// ===============================================
// 🏗️ FACTORY & HELPERS
// ===============================================

/**
 * Factory to create ContextBridge with MongoDB backend
 */
export function createContextBridge(
    mongoConnectionString: string,
): ContextBridge {
    const sessionManager = new MongoDBSessionService(mongoConnectionString);
    return new ContextBridge(sessionManager);
}

/**
 * Enhanced context for better responses
 */
export class EnhancedResponseBuilder {
    constructor(private contextBridge: ContextBridge) {}

    /**
     * Builds a rich, contextualized response using complete context
     */
    async buildRichResponse(
        plannerContext: PlannerExecutionContext,
        baseResponse: string,
    ): Promise<{
        response: string;
        confidence: number;
        context: {
            entities: number;
            conversationLength: number;
            successRate: number;
            wasRecovered: boolean;
        };
    }> {
        const finalContext =
            await this.contextBridge.buildFinalResponseContext(plannerContext);

        // Enhance response with context
        let enhancedResponse = baseResponse;

        // Add context-aware elements
        if (
            finalContext.inferences &&
            Object.keys(finalContext.inferences).length > 0
        ) {
            // Response can now resolve references like "esse card"
            Object.entries(finalContext.inferences).forEach(
                ([reference, resolved]) => {
                    enhancedResponse = enhancedResponse.replace(
                        new RegExp(reference, 'gi'),
                        resolved,
                    );
                },
            );
        }

        // Calculate confidence based on context
        let confidence = 0.8; // Base confidence

        if (finalContext.executionSummary.successRate > 80) {
            confidence += 0.1;
        }

        if (finalContext.runtime.messages.length > 2) {
            confidence += 0.05; // More context = higher confidence
        }

        if (finalContext.recovery?.wasRecovered) {
            confidence -= 0.05; // Slight reduction for recovered sessions
        }

        const entityCount = Object.values(finalContext.runtime.entities).flat()
            .length;

        return {
            response: enhancedResponse,
            confidence: Math.min(confidence, 1.0),
            context: {
                entities: entityCount,
                conversationLength: finalContext.runtime.messages.length,
                successRate: finalContext.executionSummary.successRate,
                wasRecovered: finalContext.recovery?.wasRecovered || false,
            },
        };
    }
}

// ===============================================
// 🎯 USAGE EXAMPLE FOR PLAN-EXECUTE-PLANNER
// ===============================================

/**
 * Example of how to use in the actual plan-execute-planner.ts
 */
export class ContextBridgeUsageExample {
    private contextBridge: ContextBridge;

    constructor(mongoConnectionString: string) {
        this.contextBridge = createContextBridge(mongoConnectionString);
    }

    /**
     * 🔥 This is how createFinalResponse becomes POWERFUL
     */
    async createFinalResponse(
        plannerContext: PlannerExecutionContext,
    ): Promise<any> {
        // ===== BEFORE: Limited context, poor responses =====
        // const response = "I don't have enough context to provide a rich response";
        // const confidence = 0.3;

        // ===== AFTER: Complete context, rich responses =====

        // 1. Get COMPLETE context (solves the original problem!)
        const finalContext =
            await this.contextBridge.buildFinalResponseContext(plannerContext);

        // 2. Now we have EVERYTHING we need:
        console.log('🎯 Complete context available:');
        console.log(
            `   • Conversation: ${finalContext.runtime.messages.length} messages`,
        );
        console.log(
            `   • Entities: ${Object.keys(finalContext.runtime.entities)} types`,
        );
        console.log(
            `   • Execution: ${finalContext.executionSummary.totalExecutions} runs`,
        );
        console.log(
            `   • Success rate: ${finalContext.executionSummary.successRate}%`,
        );
        console.log(
            `   • Recovery: ${finalContext.recovery?.wasRecovered ? 'Yes' : 'No'}`,
        );

        // 3. Build response using complete context
        const response = this.buildContextualResponse(finalContext);
        const confidence = this.calculateContextualConfidence(finalContext);

        return {
            response,
            confidence,
            metadata: {
                contextSource: 'ContextBridge',
                entitiesResolved: Object.keys(finalContext.inferences || {})
                    .length,
                executionHistory: finalContext.executionSummary.totalExecutions,
                sessionRecovered: finalContext.recovery?.wasRecovered || false,
            },
        };
    }

    private buildContextualResponse(context: FinalResponseContext): string {
        const { runtime, executionSummary, recovery, inferences } = context;

        let response = 'Based on our conversation';

        // Add context about what was accomplished
        if (executionSummary.totalExecutions > 0) {
            response += ` and ${executionSummary.totalExecutions} executions`;

            if (executionSummary.successRate < 100) {
                response += ` (${executionSummary.successRate}% success rate)`;
            }
        }

        // Reference entities if available
        const entityTypes = Object.keys(runtime.entities).filter(
            (key) =>
                runtime.entities[key as keyof typeof runtime.entities]?.length >
                0,
        );

        if (entityTypes.length > 0) {
            response += `, including work with ${entityTypes.join(', ')}`;
        }

        // Mention recovery if it happened
        if (recovery?.wasRecovered) {
            const gapMinutes = Math.round(recovery.gapDuration / 60000);
            response += ` (session recovered after ${gapMinutes}min gap)`;
        }

        response += ", here's what I can help you with...";

        return response;
    }

    private calculateContextualConfidence(
        context: FinalResponseContext,
    ): number {
        let confidence = 0.7; // Base

        // Higher confidence with more context
        if (context.runtime.messages.length > 3) confidence += 0.1;
        if (context.executionSummary.successRate > 80) confidence += 0.1;
        if (Object.keys(context.runtime.entities).length > 0)
            confidence += 0.05;

        // Lower confidence if recovered with uncertainty
        if (
            context.recovery?.wasRecovered &&
            context.recovery.confidence < 0.8
        ) {
            confidence -= 0.05;
        }

        return Math.min(confidence, 0.95);
    }
}
