/**
 * 🎯 CONTEXT SERVICE - Senior Software Engineering Solution
 *
 * Facade/Service Layer that encapsulates ALL contextNew complexity.
 * Follows: DRY, Single Responsibility, Facade Pattern, Dependency Inversion
 *
 * PRINCIPLES:
 * - ✅ Single source of truth for context operations
 * - ✅ Clean API for all components
 * - ✅ Centralized error handling and logging
 * - ✅ Performance optimization in one place
 * - ✅ Easy testing and mocking
 */

import { createLogger } from '../../observability/logger.js';
import { EnhancedContextBuilder } from './index.js';
import type {
    AgentRuntimeContext,
    ChatMessage,
    ExecutionSnapshot,
    FinalResponseContext,
} from './types/context-types.js';
import type { PlannerExecutionContext } from '../types/allTypes.js';
// UnifiedExecutionContext now handled in agent-core

const logger = createLogger('context-service');

/**
 * 🔥 CONTEXT SERVICE - Clean API for all context operations
 */
export class ContextService {
    private constructor() {
        // Private constructor - use static methods
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 🎯 PUBLIC API - Simple, direct methods
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Initialize context session (should be called first in execution chain)
     */
    static async initializeSession(
        threadId: string,
        tenantId: string,
    ): Promise<void> {
        logger.debug('🚀 Initializing context session', {
            threadId,
            tenantId,
        });

        try {
            const builder = EnhancedContextBuilder.getInstance();
            await builder.initializeAgentSession(threadId, tenantId);

            logger.info('✅ Context session initialized successfully', {
                threadId,
                tenantId,
            });
        } catch (error) {
            logger.error(
                '❌ Failed to initialize context session',
                error instanceof Error ? error : undefined,
                {
                    threadId,
                    tenantId,
                },
            );
            throw new Error(
                `Context session initialization failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * Get current runtime context by threadId
     */
    static async getContext(threadId: string): Promise<AgentRuntimeContext> {
        logger.debug('📖 Getting runtime context', { threadId });

        try {
            const builder = EnhancedContextBuilder.getInstance();
            const contextBridge = builder.getContextBridge();
            const context = await contextBridge.getRuntimeContext(threadId);

            logger.debug('✅ Runtime context retrieved', {
                threadId,
                sessionId: context.sessionId,
                phase: context.state.phase,
                messagesCount: context.messages.length,
            });

            return context;
        } catch (error) {
            logger.error(
                '❌ Failed to get runtime context',
                error instanceof Error ? error : undefined,
                {
                    threadId,
                },
            );
            throw new Error(
                `Get context failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * Update execution state (centralized, no duplications)
     */
    static async updateExecution(
        threadId: string,
        executionData: {
            planId?: string;
            status?: 'in_progress' | 'success' | 'error' | 'partial';
            completedSteps?: string[];
            failedSteps?: string[];
            currentTool?: string;
            lastError?: string;
            replanCount?: number;
            currentStep?: {
                id: string;
                status:
                    | 'pending'
                    | 'executing'
                    | 'completed'
                    | 'failed'
                    | 'skipped';
                toolCall?: any;
                error?: string;
            };
        },
    ): Promise<void> {
        logger.debug('🔄 Updating execution state', {
            threadId,
            status: executionData.status,
            completedSteps: executionData.completedSteps?.length,
            failedSteps: executionData.failedSteps?.length,
        });

        try {
            const builder = EnhancedContextBuilder.getInstance();
            const sessionManager = builder.getSessionManager();

            await sessionManager.updateExecution(threadId, executionData);

            logger.debug('✅ Execution state updated successfully', {
                threadId,
                status: executionData.status,
            });
        } catch (error) {
            logger.error(
                '❌ Failed to update execution state',
                error instanceof Error ? error : undefined,
                {
                    threadId,
                    executionData,
                },
            );
            // Don't throw - execution updates shouldn't break main flow
        }
    }

    /**
     * Add message to conversation (centralized)
     */
    static async addMessage(
        threadId: string,
        message: {
            role: 'user' | 'assistant' | 'system' | 'tool';
            content: string;
            toolCalls?: any[];
            toolCallId?: string;
            name?: string;
            metadata?: Record<string, unknown>;
        },
    ): Promise<string> {
        logger.debug('💬 Adding message to conversation', {
            threadId,
            role: message.role,
            contentLength: message.content.length,
            hasToolCalls: !!message.toolCalls?.length,
        });

        // 🔍 DEBUG: Log detalhado para todas as roles
        logger.info('🔍 CONTEXT SERVICE - Adding message details', {
            threadId,
            role: message.role,
            roleType: typeof message.role,
            isUser: message.role === 'user',
            isAssistant: message.role === 'assistant',
            isTool: message.role === 'tool',
            isSystem: message.role === 'system',
            contentPreview:
                message.content.substring(0, 300) +
                (message.content.length > 300 ? '...' : ''),
            metadata: message.metadata,
        });

        try {
            const builder = EnhancedContextBuilder.getInstance();
            const sessionManager = builder.getSessionManager();

            // Generate unique messageId for Progressive Persistence
            const messageId =
                (message.metadata?.messageId as string) ||
                `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const chatMessage: ChatMessage = {
                ...message,
                timestamp: Date.now(),
                metadata: {
                    ...message.metadata,
                    messageId, // Ensure messageId is in metadata
                },
            } as ChatMessage;

            await sessionManager.addMessage(threadId, chatMessage);

            logger.debug('✅ Message added successfully', {
                threadId,
                role: message.role,
                messageId,
            });

            return messageId;
        } catch (error) {
            logger.error(
                '❌ Failed to add message',
                error instanceof Error ? error : undefined,
                {
                    threadId,
                    messageRole: message.role,
                },
            );
            // Return generated ID even on error for consistency
            return `msg_${Date.now()}_error`;
        }
    }

    /**
     * Update state (phase, intent, iterations, pending actions)
     */
    static async updateState(
        threadId: string,
        stateUpdate: {
            phase?: 'planning' | 'execution' | 'completed' | 'error';
            lastUserIntent?: string;
            pendingActions?: string[];
            currentStep?: string;
            currentIteration?: number;
            totalIterations?: number;
        },
    ): Promise<void> {
        logger.debug('🔄 Updating context state', {
            threadId,
            phase: stateUpdate.phase,
            currentIteration: stateUpdate.currentIteration,
            pendingActionsCount: stateUpdate.pendingActions?.length,
        });

        try {
            const builder = EnhancedContextBuilder.getInstance();
            const contextBridge = builder.getContextBridge();

            // Get current context to merge with update
            const currentContext =
                await contextBridge.getRuntimeContext(threadId);

            await contextBridge.updateRuntimeContext(threadId, {
                state: {
                    ...currentContext.state,
                    ...stateUpdate,
                },
            });

            logger.debug('✅ Context state updated successfully', {
                threadId,
                phase: stateUpdate.phase,
            });
        } catch (error) {
            logger.error(
                '❌ Failed to update context state',
                error instanceof Error ? error : undefined,
                {
                    threadId,
                    stateUpdate,
                },
            );
            // Don't throw - state updates shouldn't break main flow
        }
    }

    /**
     * Update existing message (for Progressive Persistence pattern)
     */
    static async updateMessage(
        threadId: string,
        messageId: string,
        updates: {
            content?: string;
            metadata?: Record<string, unknown>;
        },
    ): Promise<void> {
        logger.debug('🔄 Updating message', {
            threadId,
            messageId,
            hasContent: !!updates.content,
            hasMetadata: !!updates.metadata,
        });

        try {
            const builder = EnhancedContextBuilder.getInstance();
            const sessionManager = builder.getSessionManager();

            await sessionManager.updateMessage(threadId, messageId, updates);

            logger.debug('✅ Message updated successfully', {
                threadId,
                messageId,
            });
        } catch (error) {
            logger.error(
                '❌ Failed to update message',
                error instanceof Error ? error : undefined,
                {
                    threadId,
                    messageId,
                },
            );
            // Don't throw - message updates shouldn't break main flow
        }
    }

    /**
     * Add entities to context (centralized)
     */
    static async addEntities(
        threadId: string,
        entities: Record<string, any>,
    ): Promise<void> {
        logger.debug('🏷️ Adding entities to context', {
            threadId,
            entityTypes: Object.keys(entities),
            totalEntities: Object.values(entities).reduce(
                (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 1),
                0,
            ),
        });

        try {
            const builder = EnhancedContextBuilder.getInstance();
            const sessionManager = builder.getSessionManager();

            await sessionManager.addEntities(threadId, entities);

            logger.debug('✅ Entities added successfully', {
                threadId,
                entityTypes: Object.keys(entities),
            });
        } catch (error) {
            logger.error(
                '❌ Failed to add entities',
                error instanceof Error ? error : undefined,
                {
                    threadId,
                    entityTypes: Object.keys(entities),
                },
            );
            // Don't throw - entity updates shouldn't break main flow
        }
    }

    /**
     * Save execution snapshot for recovery/audit (centralized)
     */
    static async saveSnapshot(
        threadId: string,
        snapshot: ExecutionSnapshot,
    ): Promise<void> {
        logger.debug('📸 Saving execution snapshot', {
            threadId,
            sessionId: snapshot.sessionId,
            outcome: snapshot.outcome,
        });

        try {
            const builder = EnhancedContextBuilder.getInstance();
            const sessionManager = builder.getSessionManager();

            await sessionManager.saveSnapshot(threadId, snapshot);

            logger.info('✅ Execution snapshot saved', {
                threadId,
                sessionId: snapshot.sessionId,
                outcome: snapshot.outcome,
            });
        } catch (error) {
            logger.error(
                '❌ Failed to save execution snapshot',
                error instanceof Error ? error : undefined,
                {
                    threadId,
                    sessionId: snapshot.sessionId,
                },
            );
            // Don't throw - snapshots shouldn't break main flow
        }
    }

    /**
     * Build complete final response context (solves original createFinalResponse problem)
     */
    static async buildFinalResponseContext(
        plannerContext: PlannerExecutionContext,
    ): Promise<FinalResponseContext> {
        const threadId =
            plannerContext.agentContext?.thread?.id ||
            plannerContext.agentContext?.sessionId;

        logger.debug('🌉 Building final response context', {
            threadId,
            hasAgentContext: !!plannerContext.agentContext,
        });

        if (!threadId) {
            const error = new Error(
                'Missing threadId in plannerContext.agentContext',
            );
            logger.error('❌ Cannot build final response context', error, {
                plannerContext: {
                    hasAgentContext: !!plannerContext.agentContext,
                },
            });
            throw error;
        }

        try {
            const builder = EnhancedContextBuilder.getInstance();
            const finalContext =
                await builder.buildFinalResponseContext(plannerContext);

            logger.info('✅ Final response context built successfully', {
                threadId,
                messagesCount: finalContext.runtime.messages.length,
                entitiesCount: Object.keys(finalContext.runtime.entities)
                    .length,
                successRate: finalContext.executionSummary.successRate,
                wasRecovered: finalContext.recovery?.wasRecovered || false,
            });

            return finalContext;
        } catch (error) {
            logger.error(
                '❌ Failed to build final response context',
                error instanceof Error ? error : undefined,
                {
                    threadId,
                    plannerContext: {
                        hasAgentContext: !!plannerContext.agentContext,
                    },
                },
            );
            throw new Error(
                `Build final response context failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 🔧 UTILITY METHODS
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Check if context service is ready
     */
    static async isReady(): Promise<boolean> {
        try {
            const builder = EnhancedContextBuilder.getInstance();
            // Try to get session manager - will throw if not initialized
            builder.getSessionManager();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get context health status
     */
    static async getHealthStatus(threadId?: string): Promise<{
        healthy: boolean;
        issues: string[];
        contextExists?: boolean;
        lastActivity?: number;
    }> {
        const issues: string[] = [];
        let contextExists = false;
        let lastActivity: number | undefined;

        try {
            const builder = EnhancedContextBuilder.getInstance();
            builder.getSessionManager(); // Test if initialized

            if (threadId) {
                const context = await this.getContext(threadId);
                contextExists = true;
                lastActivity =
                    context.messages.length > 0
                        ? Math.max(...context.messages.map((m) => m.timestamp))
                        : undefined;
            }
        } catch (error) {
            issues.push(
                `Service not ready: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        return {
            healthy: issues.length === 0,
            issues,
            contextExists,
            lastActivity,
        };
    }

    // Removed createExecutionContext - now handled by agent-core
    // ContextService focuses on basic operations: save, get, update

    /*
    static async createExecutionContext_OLD(params: {
        executionId: string;
        input: unknown;
        agentExecutionOptions: {
            thread: { id: string };
            tenantId?: string;
            correlationId?: string;
            agentName?: string;
        };
        agentConfig: {
            strategy: 'react' | 'rewoo' | 'plan-execute';
            maxIterations?: number;
        };
        agentName: string; // From agent definition
    }): Promise<UnifiedExecutionContext> {
        const threadId = params.agentExecutionOptions.thread.id;
        const agentName = params.agentName;
        const { correlationId } = params.agentExecutionOptions;

        logger.info('🚀 Creating complete execution context (ALL-IN-ONE)', {
            threadId,
            executionId: params.executionId,
            agentName,
            strategy: params.agentConfig.strategy,
        });

        try {
            // 🏗️ 1. INITIALIZE SESSION (if needed)
            await this.initializeSession(
                threadId,
                params.agentExecutionOptions.tenantId || 'default',
            );

            // 💬 2. ADD USER INPUT TO CONVERSATION
            await this.addMessage(threadId, {
                role: 'user' as any,
                content:
                    typeof params.input === 'string'
                        ? params.input
                        : JSON.stringify(params.input),
                metadata: {
                    agentName,
                    executionId: params.executionId,
                    correlationId,
                    source: 'user-input',
                },
            });

            // ⏳ 3. ADD PROCESSING PLACEHOLDER MESSAGE
            const assistantMessageId = await this.addMessage(threadId, {
                role: 'assistant' as any,
                content: '⏳ Processing your request...',
                metadata: {
                    agentName,
                    executionId: params.executionId,
                    correlationId,
                    status: 'processing',
                    source: 'agent-placeholder',
                },
            });

            // 🔥 4. GET ALL CONTEXT DATA in one place
            const runtimeContext = await this.getContext(threadId);

            // TODO: Implement proper tool and history retrieval
            const availableTools: any[] = []; // Will be populated from ToolEngine later
            const executionHistory: any[] = []; // Will be populated from session data later

            // 🎯 CONVERT tools to Strategy format
            const tools = availableTools.map((tool: any) => ({
                name: tool.name,
                description: tool.description || `Tool: ${tool.name}`,
                parameters: tool.inputSchema?.parameters || {},
                required: tool.inputSchema?.required || [],
                optional: [],
            }));

            // ✅ 6. COMPLETE EXECUTION CONTEXT - Everything done!
            const completeContext = {
                // Input data
                input:
                    typeof params.input === 'string'
                        ? params.input
                        : JSON.stringify(params.input),
                executionId: params.executionId,
                threadId,

                // Context data (from ContextService)
                runtimeContext,
                tools,
                history: executionHistory,

                // Agent configuration
                agentConfig: {
                    agentName,
                    tenantId:
                        params.agentExecutionOptions.tenantId || 'default',
                    correlationId,
                    strategy: params.agentConfig.strategy,
                    maxIterations: params.agentConfig.maxIterations,
                },

                // Execution metadata
                metadata: {
                    startTime: Date.now(),
                    correlationId,
                    complexity: tools.length,
                    assistantMessageId, // For later update
                },

                // Legacy compatibility (will be removed later)
                agentContext: {
                    sessionId: threadId,
                    tenantId:
                        params.agentExecutionOptions.tenantId || 'default',
                    correlationId,
                    thread: { id: threadId },
                    agentName,
                    executionId: params.executionId,
                    allTools: [], // Empty for now
                    agentExecutionOptions: params.agentExecutionOptions,
                },
            };

            logger.debug('✅ Complete execution context created (ALL-IN-ONE)', {
                threadId,
                toolsCount: tools.length,
                historyCount: executionHistory.length,
                hasRuntimeContext: !!runtimeContext,
                assistantMessageId,
            });

            return completeContext;
        } catch (error) {
            logger.error(
                '❌ Failed to create execution context',
                error instanceof Error ? error : undefined,
                {
                    threadId,
                    executionId: params.executionId,
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            );
            throw error;
        }
    }
    */
}

// ──────────────────────────────────────────────────────────────────────────
// 🚀 EXPORTS
// ──────────────────────────────────────────────────────────────────────────

export default ContextService;

// Named export for flexibility
export { ContextService as Context };
