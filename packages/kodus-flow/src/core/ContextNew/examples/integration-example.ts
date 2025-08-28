/**
 * 🔗 INTEGRATION EXAMPLE - How to use ContextNew in plan-execute-planner
 *
 * Shows exactly how to integrate the simplified ContextNew architecture
 * into the existing plan-execute-planner to solve the createFinalResponse problem
 */

import {
    createContextRuntime,
    AgentRuntimeContext,
    FinalResponseContext,
    ChatMessage,
    EntityRef,
} from '../index.js';
import { PlannerExecutionContext } from '../../types/allTypes.js';

// ===============================================
// 🎯 INTEGRATION IN PLAN-EXECUTE-PLANNER
// ===============================================

/**
 * Enhanced PlanExecuteStrategy with ContextNew integration
 */
export class EnhancedPlanExecuteStrategy {
    private contextRuntime: ReturnType<typeof createContextRuntime>;

    constructor(mongoConnectionString: string) {
        // Simple setup - one line!
        this.contextRuntime = createContextRuntime(mongoConnectionString);
    }

    // ===== ORIGINAL PROBLEM SOLVED =====

    /**
     * 🔥 BEFORE: createFinalResponse had NO context
     * ❌ Não sabia o que foi planejado, executado, sucessos, falhas, replans
     * ❌ Confidence baixa, respostas genéricas
     * ❌ Não resolvia "esse card", "aquela regra"
     */
    async createFinalResponse_OLD(context: PlannerExecutionContext) {
        return {
            response: 'Executei algumas ações', // Generic
            confidence: 0.3, // Low
            reasoning: 'Contexto limitado', // Poor
        };
    }

    /**
     * ✅ AFTER: createFinalResponse with COMPLETE context
     * ✅ Sabe tudo que foi executado, sucessos, falhas, replans
     * ✅ Confidence alta, respostas personalizadas
     * ✅ Resolve referências: "esse card" -> "PROJ-123"
     */
    async createFinalResponse(context: PlannerExecutionContext) {
        // 🌉 THE MAGIC - Get complete context in one call!
        const finalContext =
            await this.contextRuntime.buildFinalResponseContext(context);

        return {
            response: this.buildRichResponse(finalContext),
            confidence: this.calculateRealConfidence(finalContext),
            reasoning: this.buildContextualReasoning(finalContext),
            metadata: {
                entitiesResolved: Object.keys(finalContext.inferences || {})
                    .length,
                executionHistory: finalContext.executionSummary.totalExecutions,
                conversationLength: finalContext.runtime.messages.length,
                wasRecovered: finalContext.recovery?.wasRecovered || false,
            },
        };
    }

    // ===== EXECUTION FLOW WITH CONTEXT =====

    async execute(context: PlannerExecutionContext) {
        // 1. Get current session context
        const sessionContext = await this.contextRuntime.getContext(
            context.sessionId,
        );

        // 2. Add user message to conversation
        await this.contextRuntime.sessionManager.addMessage(context.sessionId, {
            role: 'user',
            content: context.userMessage,
            timestamp: Date.now(),
        });

        // 3. Execute plan (your existing logic)
        const executionResult = await this.executePlan(context, sessionContext);

        // 4. Save execution results
        if (executionResult.toolCalls && executionResult.toolCalls.length > 0) {
            // Extract entities from tool results
            const entities = this.extractEntitiesFromToolCalls(
                executionResult.toolCalls,
            );
            await this.contextRuntime.sessionManager.addEntities(
                context.sessionId,
                entities,
            );
        }

        // 5. Update execution state
        await this.contextRuntime.sessionManager.updateExecution(
            context.sessionId,
            {
                planId: executionResult.planId,
                status: executionResult.success ? 'success' : 'error',
                completedSteps: executionResult.completedSteps || [],
                failedSteps: executionResult.failedSteps || [],
                lastError: executionResult.error,
                replanCount:
                    (sessionContext.execution.replanCount || 0) +
                    (executionResult.isReplan ? 1 : 0),
            },
        );

        // 6. Add assistant response to conversation
        await this.contextRuntime.sessionManager.addMessage(context.sessionId, {
            role: 'assistant',
            content: executionResult.response,
            timestamp: Date.now(),
            tool_calls: executionResult.toolCalls?.map((tc) => ({
                id: tc.id || 'tc_' + Date.now(),
                name: tc.name,
                arguments: JSON.stringify(tc.arguments || {}),
            })),
        });

        // 7. Save execution snapshot for recovery
        if (executionResult.success || executionResult.error) {
            await this.contextRuntime.sessionManager.saveSnapshot(
                context.sessionId,
                {
                    sessionId: context.sessionId,
                    executionId: context.sessionId + '_exec_' + Date.now(),
                    timestamp: new Date().toISOString(),
                    outcome: executionResult.success ? 'success' : 'error',
                    plan: {
                        goal: executionResult.goal || context.userMessage,
                        steps: executionResult.completedSteps || [],
                    },
                    results: executionResult.stepResults || {},
                    error: executionResult.error
                        ? {
                              step: executionResult.failedStep || 'unknown',
                              message: executionResult.error,
                              recoverable: true,
                          }
                        : undefined,
                    recoveryContext: {
                        entities: sessionContext.entities,
                        assumptions: executionResult.assumptions || [],
                        nextAction: executionResult.nextAction || 'continue',
                        userIntent: sessionContext.state.lastUserIntent,
                    },
                },
            );
        }

        return executionResult;
    }

    // ===== PRIVATE HELPER METHODS =====

    private buildRichResponse(finalContext: FinalResponseContext): string {
        const { runtime, executionSummary, recovery, inferences } =
            finalContext;

        let response = '';

        // Start with context about what was accomplished
        if (executionSummary.totalExecutions > 0) {
            const successRate = executionSummary.successRate;

            if (successRate === 100) {
                response += `Executei ${executionSummary.totalExecutions} ações com sucesso.`;
            } else if (successRate > 80) {
                response += `Executei ${executionSummary.totalExecutions} ações com ${successRate}% de sucesso.`;
            } else {
                response += `Executei ${executionSummary.totalExecutions} ações. Tive alguns problemas (${successRate}% sucesso), mas consegui resolver.`;
            }

            if (executionSummary.replanCount > 0) {
                response += ` Precisei replanear ${executionSummary.replanCount} vez(es).`;
            }
        }

        // Add context about entities worked with
        const entityTypes = Object.keys(runtime.entities).filter(
            (key) =>
                runtime.entities[key as keyof typeof runtime.entities]?.length >
                0,
        );

        if (entityTypes.length > 0) {
            const entityNames = entityTypes.map((type) => {
                switch (type) {
                    case 'kodyRules':
                        return 'regras do Kody';
                    case 'jiraCards':
                        return 'cards do Jira';
                    case 'pullRequests':
                        return 'PRs';
                    case 'notionPages':
                        return 'páginas do Notion';
                    default:
                        return type;
                }
            });

            response += ` Trabalhei com ${entityNames.join(', ')}.`;
        }

        // Add recovery context if relevant
        if (recovery?.wasRecovered) {
            const gapMinutes = Math.round(recovery.gapDuration / 60000);
            response += ` (Retomei nossa conversa após ${gapMinutes} minuto(s).)`;
        }

        // Add inferences resolution
        if (inferences && Object.keys(inferences).length > 0) {
            response += ` Consegui resolver as referências que você mencionou.`;
        }

        return response.trim() || 'Pronto para ajudar!';
    }

    private calculateRealConfidence(
        finalContext: FinalResponseContext,
    ): number {
        let confidence = 0.7; // Base confidence

        // Higher confidence with more executions
        if (finalContext.executionSummary.totalExecutions > 0) {
            confidence += 0.1;
        }

        // Higher confidence with high success rate
        if (finalContext.executionSummary.successRate > 90) {
            confidence += 0.15;
        } else if (finalContext.executionSummary.successRate > 70) {
            confidence += 0.1;
        }

        // Higher confidence with more conversation context
        if (finalContext.runtime.messages.length > 3) {
            confidence += 0.05;
        }

        // Higher confidence when we can resolve references
        if (
            finalContext.inferences &&
            Object.keys(finalContext.inferences).length > 0
        ) {
            confidence += 0.05;
        }

        // Lower confidence if recovered with low confidence
        if (
            finalContext.recovery?.wasRecovered &&
            finalContext.recovery.confidence < 0.8
        ) {
            confidence -= 0.1;
        }

        // Lower confidence with many replans
        if (finalContext.executionSummary.replanCount > 2) {
            confidence -= 0.05;
        }

        return Math.min(Math.max(confidence, 0.3), 0.95);
    }

    private buildContextualReasoning(
        finalContext: FinalResponseContext,
    ): string {
        const parts = [];

        parts.push(
            `Baseado em ${finalContext.runtime.messages.length} mensagens da conversa`,
        );

        if (finalContext.executionSummary.totalExecutions > 0) {
            parts.push(
                `${finalContext.executionSummary.totalExecutions} execuções (${finalContext.executionSummary.successRate}% sucesso)`,
            );
        }

        if (finalContext.recovery?.wasRecovered) {
            parts.push(
                `recuperação de sessão com ${Math.round(finalContext.recovery.confidence * 100)}% confiança`,
            );
        }

        const entityCount = Object.values(finalContext.runtime.entities).reduce(
            (sum, entities) =>
                sum + (Array.isArray(entities) ? entities.length : 0),
            0,
        );

        if (entityCount > 0) {
            parts.push(`${entityCount} entidades identificadas`);
        }

        return `Reasoning: ${parts.join(', ')}.`;
    }

    private extractEntitiesFromToolCalls(
        toolCalls: any[],
    ): Partial<AgentRuntimeContext['entities']> {
        const entities: Partial<AgentRuntimeContext['entities']> = {};

        toolCalls.forEach((toolCall) => {
            const { name, result } = toolCall;

            if (name === 'KODUS_CREATE_KODY_RULE' && result?.uuid) {
                entities.kodyRules = entities.kodyRules || [];
                entities.kodyRules.push({
                    id: result.uuid,
                    title: result.title || 'Regra Kody',
                    type: 'kody-rule',
                    lastUsed: Date.now(),
                });
            }

            if (name === 'JIRA_CREATE_ISSUE' && result?.key) {
                entities.jiraCards = entities.jiraCards || [];
                entities.jiraCards.push({
                    id: result.key,
                    title: result.fields?.summary || 'Card Jira',
                    type: 'jira-issue',
                    lastUsed: Date.now(),
                });
            }

            if (name === 'NOTION_CREATE_PAGE' && result?.id) {
                entities.notionPages = entities.notionPages || [];
                entities.notionPages.push({
                    id: result.id,
                    title: result.title || 'Página Notion',
                    type: 'notion-page',
                    lastUsed: Date.now(),
                });
            }

            // Add to toolResults for easy reference
            if (result?.uuid || result?.key || result?.id) {
                entities.toolResults = entities.toolResults || {};
                entities.toolResults[`last${name.replace(/[^A-Za-z]/g, '')}`] =
                    result.uuid || result.key || result.id;
            }
        });

        return entities;
    }

    private async executePlan(
        context: PlannerExecutionContext,
        sessionContext: AgentRuntimeContext,
    ): Promise<any> {
        // Your existing execution logic here
        // This is just a placeholder showing the structure
        return {
            success: true,
            planId: 'plan_' + Date.now(),
            response: 'Ações executadas com sucesso',
            completedSteps: ['step1', 'step2'],
            failedSteps: [],
            toolCalls: [],
            stepResults: {},
            goal: context.userMessage,
            assumptions: [],
            nextAction: 'continue',
        };
    }
}

// ===============================================
// 📋 USAGE EXAMPLE
// ===============================================

export async function demonstrateIntegration() {
    console.log('🔗 INTEGRATION DEMONSTRATION\n');

    // Setup (one line!)
    const planner = new EnhancedPlanExecuteStrategy(
        'mongodb://localhost:27017',
    );

    // Mock planner context
    const plannerContext: PlannerExecutionContext = {
        sessionId: 'session-integration-demo',
        userMessage: 'consegue atualizar esse card do Jira?',
        // ... other context fields
    } as any;

    console.log('📥 USER MESSAGE:', plannerContext.userMessage);

    // Execute plan (with context tracking)
    const executionResult = await planner.execute(plannerContext);
    console.log(
        '⚡ EXECUTION RESULT:',
        executionResult.success ? 'SUCCESS' : 'FAILED',
    );

    // Generate final response (THE SOLUTION!)
    const finalResponse = await planner.createFinalResponse(plannerContext);

    console.log('\n🎯 FINAL RESPONSE (With Complete Context):');
    console.log('Response:', finalResponse.response);
    console.log(
        'Confidence:',
        Math.round(finalResponse.confidence * 100) + '%',
    );
    console.log('Reasoning:', finalResponse.reasoning);
    console.log('Metadata:', finalResponse.metadata);

    console.log('\n✅ PROBLEM SOLVED:');
    console.log('   • createFinalResponse now has COMPLETE context');
    console.log('   • Rich, personalized responses');
    console.log('   • High confidence based on actual execution');
    console.log('   • Reference resolution ("esse card" -> specific ID)');
    console.log('   • Session recovery after gaps');
}

// Run demonstration
// demonstrateIntegration();
