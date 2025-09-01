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
    EntityRef,
} from '../types/context-types.js';
import {
    AgentInputEnum,
    PlannerExecutionContext,
} from '../../types/allTypes.js';
import { EnhancedSessionService } from './enhanced-session-service.js';
import { MemoryManager } from '../../memory/memory-manager.js';

// ===============================================
// 🎯 CONTEXT BRIDGE IMPLEMENTATION
// ===============================================

export class ContextBridge implements ContextBridgeService {
    constructor(
        private sessionManager: SessionManager,
        private memoryManager?: MemoryManager, // ✅ REUSE: Existing memory manager
    ) {}

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
        const threadId =
            plannerContext.agentContext?.thread?.id ||
            plannerContext.agentContext?.sessionId;
        if (!threadId) {
            throw new Error('Missing threadId in plannerContext.agentContext');
        }

        const recovery = await this.sessionManager.recoverSession(threadId);
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

        // 4. Enrich with memory data (if available)
        if (this.memoryManager) {
            await this.enrichWithMemoryContext(runtime);
        }

        // 5. Build complete context
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

    async getRuntimeContext(threadId: string): Promise<AgentRuntimeContext> {
        const recovery = await this.sessionManager.recoverSession(threadId);
        return recovery.context;
    }

    async updateRuntimeContext(
        threadId: string,
        updates: Partial<AgentRuntimeContext>,
    ): Promise<void> {
        // Update different parts based on what's provided
        if (updates.messages) {
            for (const message of updates.messages) {
                await this.sessionManager.addMessage(threadId, message);
            }
        }

        if (updates.entities) {
            await this.sessionManager.addEntities(threadId, updates.entities);
        }

        if (updates.execution) {
            await this.sessionManager.updateExecution(
                threadId,
                updates.execution,
            );
        }

        if (updates.state) {
            // Update state fields via session manager
            if (this.sessionManager instanceof EnhancedSessionService) {
                // Get current session and update state
                const currentSession =
                    await this.sessionManager.recoverSession(threadId);
                currentSession.context.state = {
                    ...currentSession.context.state,
                    ...updates.state,
                };

                // This would need a method to update just the state
                // For now, we'll use updateExecution as a workaround
                await this.sessionManager.updateExecution(threadId, {});
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
                msg.role === AgentInputEnum.ASSISTANT &&
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

    // ===== MEMORY INTEGRATION =====

    /**
     * Enrich runtime context with data from existing MemoryManager
     */
    private async enrichWithMemoryContext(
        runtime: AgentRuntimeContext,
    ): Promise<void> {
        if (!this.memoryManager) return;

        try {
            // Get recent memories related to this session
            const recentMemories = await this.memoryManager.query({
                sessionId: runtime.sessionId,
                limit: 10,
                since: Date.now() - 24 * 60 * 60 * 1000, // Last 24 hours
            });

            // Extract entities from memory
            const memoryEntities: Record<string, EntityRef[]> = {};

            for (const memory of recentMemories) {
                if (memory.type === 'tool_usage_pattern' && memory.value) {
                    const toolData = memory.value as any;

                    // Extract entity references from tool results
                    if (
                        toolData.output &&
                        typeof toolData.output === 'object'
                    ) {
                        this.extractEntitiesFromToolOutput(
                            toolData,
                            memoryEntities,
                        );
                    }
                }
            }

            // Merge with existing entities (memory data takes lower priority)
            Object.entries(memoryEntities).forEach(([entityType, entities]) => {
                const existingEntities = runtime.entities[
                    entityType as keyof typeof runtime.entities
                ] as EntityRef[] | undefined;

                if (!existingEntities) {
                    (runtime.entities as any)[entityType] = entities;
                } else {
                    // Add memory entities that aren't already present
                    const existingIds = new Set(
                        existingEntities.map((e) => e.id),
                    );
                    const newEntities = entities.filter(
                        (e) => !existingIds.has(e.id),
                    );

                    (runtime.entities as any)[entityType] = [
                        ...existingEntities,
                        ...newEntities,
                    ].slice(-10);
                }
            });

            console.log(
                `🧠 Enriched context with ${recentMemories.length} memory items`,
            );
        } catch (error) {
            console.warn('⚠️ Failed to enrich with memory context:', error);
        }
    }

    /**
     * Extract entity references from tool output (framework agnostic)
     * TODO: This should be configurable/pluggable per framework
     */
    private extractEntitiesFromToolOutput(
        toolData: any,
        entities: Record<string, EntityRef[]>,
    ): void {
        const { toolName, output } = toolData;

        // Generic entity extraction - frameworks can extend this
        if (output && typeof output === 'object') {
            // Look for common patterns in tool output
            const possibleId =
                output.id || output.cardId || output.ruleId || output.pageId;
            const possibleTitle = output.title || output.name || output.summary;

            if (possibleId && possibleTitle) {
                // Create generic entity type based on tool name
                const entityType = this.inferEntityTypeFromTool(toolName);

                entities[entityType] = entities[entityType] || [];
                entities[entityType].push({
                    id: possibleId,
                    title: possibleTitle,
                    type: entityType,
                    lastUsed: Date.now(),
                });
            }
        }
    }

    /**
     * Infer entity type from tool name (generic approach)
     */
    private inferEntityTypeFromTool(toolName: string): string {
        // Convert tool names to generic entity types
        const toolLower = toolName.toLowerCase();

        if (toolLower.includes('create') || toolLower.includes('update')) {
            // Extract the main subject from tool name
            // e.g., "SOME_CREATE_RULE" -> "rules", "OTHER_UPDATE_CARD" -> "cards"
            const parts = toolName.split('_');
            const subject = parts[parts.length - 1]?.toLowerCase();
            return subject ? `${subject}s` : 'items';
        }

        return 'items'; // Generic fallback
    }
}

// ===============================================
// 🏗️ FACTORY & HELPERS
// ===============================================

/**
 * Factory to create ContextBridge with Enhanced Storage backend (InMemory or MongoDB)
 */
export function createContextBridge(
    mongoConnectionString?: string,
    options?: {
        memoryManager?: MemoryManager;
        dbName?: string;
        sessionsCollection?: string; // 🎯 Customizável!
        snapshotsCollection?: string; // 🎯 Customizável!
        sessionTTL?: number;
        snapshotTTL?: number;
    },
): ContextBridge {
    const sessionManager = new EnhancedSessionService(mongoConnectionString, {
        dbName: options?.dbName,
        sessionsCollection: options?.sessionsCollection,
        snapshotsCollection: options?.snapshotsCollection,
        sessionTTL: options?.sessionTTL,
        snapshotTTL: options?.snapshotTTL,
    });

    return new ContextBridge(sessionManager, options?.memoryManager);
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

        // Base confidence - can be customized by framework
        const confidence = 0.8;

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

    constructor(mongoConnectionString: string, memoryManager?: MemoryManager) {
        this.contextBridge = createContextBridge(mongoConnectionString, {
            memoryManager,
        });
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
        const { runtime, executionSummary, recovery } = context;

        let response = 'Based on our conversation';

        // Add context about what was accomplished
        if (executionSummary.totalExecutions > 0) {
            response += ` and ${executionSummary.totalExecutions} executions`;

            if (executionSummary.successRate < 100) {
                response += ` (${executionSummary.successRate}% success rate)`;
            }
        }

        // Reference entities if available
        const entityTypes = Object.keys(runtime.entities).filter((key) => {
            const entities =
                runtime.entities[key as keyof typeof runtime.entities];
            return Array.isArray(entities) && entities.length > 0;
        });

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
