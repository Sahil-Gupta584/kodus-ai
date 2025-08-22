import { createLogger } from '../../observability/index.js';
import { getGlobalMemoryManager } from '../memory/memory-manager.js';
import type { AgentContext } from '../types/agent-types.js';
import type { AgentThought, AgentAction } from '../types/agent-types.js';
import type {
    ActionResult,
    ResultAnalysis,
} from '../../engine/planning/planner-factory.js';
import { STATE_NAMESPACES, MEMORY_TYPES } from './namespace-constants.js';

// ============================================================================
// 1. STEP EXECUTION (AI SDK CONCEPT)
// ============================================================================

export interface AgentStepResult {
    stepId: string;
    iteration: number;
    thought: AgentThought;
    action: AgentAction;
    status: string;
    result: ActionResult;
    observation: ResultAnalysis;
    duration: number;
    metadata: {
        contextOperations: Array<{
            layer: 'state' | 'session' | 'memory';
            operation: string;
            data: unknown;
        }>;
        toolCalls: Array<{
            toolName: string;
            input: unknown;
            result: unknown;
            duration: number;
        }>;
        performance: {
            thinkDuration: number;
            actDuration: number;
            observeDuration: number;
        };
    };
}

export class StepExecution {
    private steps: Map<string, AgentStepResult> = new Map();
    private currentStepId: string | null = null;
    private logger = createLogger('step-execution');

    startStep(iteration: number): string {
        const stepId = `step-${iteration}-${Date.now()}`;
        this.currentStepId = stepId;

        this.steps.set(stepId, {
            stepId,
            iteration,
            thought: {
                reasoning: '',
                action: { type: 'final_answer', content: '' },
            },
            status: 'final_answer',
            action: { type: 'final_answer', content: '' },
            result: { type: 'error', error: 'Not executed yet' },
            observation: {
                isComplete: false,
                isSuccessful: false,
                feedback: '',
                shouldContinue: false,
            },
            duration: 0,
            metadata: {
                contextOperations: [],
                toolCalls: [],
                performance: {
                    thinkDuration: 0,
                    actDuration: 0,
                    observeDuration: 0,
                },
            },
        });

        this.logger.debug('Step started', { stepId, iteration });
        return stepId;
    }

    updateStep(
        stepId: string,
        updates: Partial<
            Pick<
                AgentStepResult,
                'thought' | 'action' | 'result' | 'observation' | 'duration'
            >
        >,
    ): void {
        const step = this.steps.get(stepId);
        if (step) {
            Object.assign(step, updates);
            this.logger.debug('Step updated', {
                stepId,
                updates: Object.keys(updates),
            });
        }
    }

    addContextOperation(
        stepId: string,
        layer: 'state' | 'session' | 'memory',
        operation: string,
        data: unknown,
    ): void {
        const step = this.steps.get(stepId);
        if (step) {
            step.metadata.contextOperations.push({ layer, operation, data });
            this.logger.debug('Context operation added', {
                stepId,
                layer,
                operation,
            });
        }
    }

    addToolCall(
        stepId: string,
        toolName: string,
        input: unknown,
        result: unknown,
        duration: number,
    ): void {
        const step = this.steps.get(stepId);
        if (step) {
            step.metadata.toolCalls.push({ toolName, input, result, duration });
            this.logger.debug('Tool call added', {
                stepId,
                toolName,
                duration,
            });
        }
    }

    getStep(stepId: string): AgentStepResult | undefined {
        return this.steps.get(stepId);
    }

    getAllSteps(): AgentStepResult[] {
        return Array.from(this.steps.values());
    }

    getCurrentStep(): AgentStepResult | undefined {
        return this.currentStepId
            ? this.steps.get(this.currentStepId)
            : undefined;
    }

    getExecutionSummary(): {
        totalSteps: number;
        successfulSteps: number;
        failedSteps: number;
        averageDuration: number;
        totalContextOperations: number;
        totalToolCalls: number;
    } {
        const steps = this.getAllSteps();
        const successfulSteps = steps.filter(
            (s) => s.observation.isSuccessful,
        ).length;
        const failedSteps = steps.filter(
            (s) => !s.observation.isSuccessful,
        ).length;
        const totalDuration = steps.reduce((sum, s) => sum + s.duration, 0);
        const totalContextOperations = steps.reduce(
            (sum, s) => sum + s.metadata.contextOperations.length,
            0,
        );
        const totalToolCalls = steps.reduce(
            (sum, s) => sum + s.metadata.toolCalls.length,
            0,
        );

        return {
            totalSteps: steps.length,
            successfulSteps,
            failedSteps,
            averageDuration:
                steps.length > 0 ? totalDuration / steps.length : 0,
            totalContextOperations,
            totalToolCalls,
        };
    }
}

// ============================================================================
// 2. ENHANCED MESSAGE CONTEXT (AI SDK CONCEPT)
// ============================================================================

export interface MessageEntry {
    id: string;
    role: 'user' | 'assistant' | 'tool' | 'system';
    content: unknown;
    timestamp: number;
    metadata?: Record<string, unknown>;
    stepId?: string;
}

export class EnhancedMessageContext {
    private messages: MessageEntry[] = [];
    private logger = createLogger('enhanced-message-context');

    constructor(_contextManager: ContextManager) {
        // Context manager reference not needed for current implementation
    }

    /**
     * ⭐ AI SDK CONCEPT: Obter contexto para o modelo
     * Integra contexto relevante das três camadas
     */
    async getContextForModel(
        context: AgentContext,
        query?: string,
    ): Promise<string> {
        const contextParts: string[] = [];

        try {
            // 1. MEMORY: Buscar memórias relevantes
            if (query) {
                // ✅ CLEAN ARCHITECTURE: Use dependency injection for memory
                const memoryManager = getGlobalMemoryManager();
                const searchResults = await memoryManager.search(query, {
                    topK: 3,
                    filter: {
                        tenantId: context.tenantId,
                        sessionId: context.sessionId,
                    },
                });
                if (searchResults && searchResults.length > 0) {
                    contextParts.push('\n📚 Conhecimento relevante:');
                    searchResults.forEach((result, i) => {
                        const memoryStr =
                            result.metadata?.content ||
                            result.text ||
                            'No content';
                        contextParts.push(`${i + 1}. ${memoryStr}`);
                    });
                }
            }

            // 2. SESSION: Histórico recente de conversa
            const sessionHistory = await context.conversation.getHistory();
            if (sessionHistory && sessionHistory.length > 0) {
                contextParts.push('\n💬 Conversa recente:');
                sessionHistory.slice(-3).forEach((entry, i) => {
                    const formattedEntry = this.formatSessionEntry(entry);
                    if (formattedEntry) {
                        contextParts.push(`${i + 1}. ${formattedEntry}`);
                    }
                });
            }

            // 3. STATE: Estado atual de trabalho
            const workingState = await context.state.getNamespace(
                STATE_NAMESPACES.EXECUTION,
            );
            if (workingState && workingState.size > 0) {
                contextParts.push('\n⚡ Estado atual:');
                let count = 0;
                for (const [key, value] of workingState) {
                    if (count >= 3) break;
                    const valueStr =
                        typeof value === 'string'
                            ? value
                            : JSON.stringify(value);
                    contextParts.push(`- ${key}: ${valueStr}`);
                    count++;
                }
            }

            // 4. MESSAGES: Mensagens da sessão atual
            if (this.messages.length > 0) {
                contextParts.push('\n📝 Mensagens da sessão:');
                this.messages.slice(-5).forEach((msg, i) => {
                    const contentStr =
                        typeof msg.content === 'string'
                            ? msg.content
                            : JSON.stringify(msg.content);
                    contextParts.push(
                        `${i + 1}. [${msg.role}] ${contentStr.substring(0, 100)}...`,
                    );
                });
            }
        } catch (error) {
            this.logger.warn('Failed to build context for model:', {
                error: String(error),
            });
        }

        return contextParts.join('\n');
    }

    /**
     * ✅ NEW: Format session entry for human-readable display
     */
    private formatSessionEntry(entry: unknown): string | null {
        if (!entry || typeof entry !== 'object') {
            return null;
        }

        const entryObj = entry as Record<string, unknown>;

        // Extract user input and assistant output
        const input = entryObj.input;
        const output = entryObj.output;

        // Format based on entry type
        if (input && typeof input === 'object') {
            const inputObj = input as Record<string, unknown>;

            // Handle different input types
            if (inputObj.type === 'memory_context_request') {
                const userInput = inputObj.input as string;
                return `User: "${userInput}"`;
            }

            if (inputObj.type === 'execution_step') {
                const thought = inputObj.thought as string;
                return `Agent: ${thought}`;
            }

            if (inputObj.type === 'plan_created') {
                const goal = inputObj.goal as string;
                return `Planning: "${goal}"`;
            }

            if (inputObj.type === 'plan_completed') {
                const synthesized =
                    output && typeof output === 'object'
                        ? ((output as Record<string, unknown>)
                              .synthesized as string)
                        : 'Completed';
                return `Response: "${synthesized}"`;
            }

            if (inputObj.type === 'step_execution_start') {
                const tool = inputObj.tool as string;
                return `Tool: ${tool}`;
            }
        }

        // Fallback: try to extract meaningful content
        if (output && typeof output === 'object') {
            const outputObj = output as Record<string, unknown>;
            if (outputObj.synthesized) {
                return `Response: "${outputObj.synthesized as string}"`;
            }
            if (outputObj.observation) {
                return `Result: "${outputObj.observation as string}"`;
            }
        }

        // If we have a simple string input/output
        if (typeof input === 'string' && input.length > 0) {
            return `User: "${input.substring(0, 50)}..."`;
        }

        return null;
    }

    /**
     * ⭐ AI SDK CONCEPT: Obter apenas resultados de ferramentas
     */
    getToolResults(): unknown[] {
        return this.messages
            .filter((msg) => msg.role === 'tool')
            .map((msg) => msg.content);
    }

    /**
     * ⭐ AI SDK CONCEPT: Limpar mensagens antigas
     */
    cleanupOldMessages(maxAge: number = 24 * 60 * 60 * 1000): void {
        const cutoff = Date.now() - maxAge;
        this.messages = this.messages.filter((msg) => msg.timestamp > cutoff);
        this.logger.debug('Old messages cleaned up', {
            before:
                this.messages.length +
                this.messages.filter((m) => m.timestamp <= cutoff).length,
            after: this.messages.length,
        });
    }

    getMessageCount(): number {
        return this.messages.length;
    }

    getMessagesByRole(role: MessageEntry['role']): MessageEntry[] {
        return this.messages.filter((msg) => msg.role === role);
    }
}

// ============================================================================
// 3. CONTEXT MANAGER (AI SDK CONCEPT)
// ============================================================================

export class ContextManager {
    private stepExecution: StepExecution;
    private messageContext: EnhancedMessageContext;
    private logger = createLogger('context-manager');

    constructor(stepExecution: StepExecution) {
        this.stepExecution = stepExecution;
        this.messageContext = new EnhancedMessageContext(this);
    }

    /**
     * ⭐ AI SDK CONCEPT: API unificada para operações de context
     */
    async addToContext(
        type: 'state' | 'session' | 'memory',
        key: string,
        value: unknown,
        context: AgentContext,
        stepId?: string,
    ): Promise<void> {
        try {
            switch (type) {
                case 'state':
                    await context.state.set(
                        STATE_NAMESPACES.AI_SDK,
                        key,
                        value,
                    );
                    if (stepId) {
                        this.recordContextOperation(stepId, 'state', 'set', {
                            key,
                            value,
                        });
                    }
                    break;

                case 'session':
                    if (stepId) {
                        this.recordContextOperation(
                            stepId,
                            'session',
                            'add_entry',
                            { key, value },
                        );
                    }
                    break;

                case 'memory':
                    const memoryManager = getGlobalMemoryManager();
                    await memoryManager.store({
                        type: MEMORY_TYPES.LEARNING_CONTEXT,
                        content:
                            typeof value === 'string'
                                ? value
                                : JSON.stringify(value),
                        sessionId: context.sessionId,
                        tenantId: context.tenantId,
                        metadata: { key, timestamp: Date.now() },
                    });
                    if (stepId) {
                        this.recordContextOperation(stepId, 'memory', 'store', {
                            type: 'store',
                            key,
                        });
                    }
                    break;
            }

            this.logger.debug('Context operation completed', {
                type,
                key,
                stepId,
            });
        } catch (error) {
            this.logger.warn(`Failed to add to ${type} context:`, {
                error: String(error),
            });
        }
    }

    /**
     * ⭐ AI SDK CONCEPT: Obter contexto relevante para o modelo
     */
    async getRelevantContext(
        context: AgentContext,
        query?: string,
    ): Promise<string> {
        return this.messageContext.getContextForModel(context, query);
    }

    /**
     * ⭐ AI SDK CONCEPT: Registrar operação de context
     */
    recordContextOperation(
        stepId: string,
        layer: 'state' | 'session' | 'memory',
        operation: string,
        data: unknown,
    ): void {
        this.stepExecution.addContextOperation(stepId, layer, operation, data);
    }

    /**
     * ⭐ AI SDK CONCEPT: Obter estatísticas de context
     */
    async getContextStats(context: AgentContext): Promise<{
        sessionEntries: number;
        stateKeys: number;
        memoryItems: number;
        messageCount: number;
    }> {
        try {
            const sessionHistory = await context.conversation.getHistory();
            const stateKeys = await context.state.getNamespace(
                STATE_NAMESPACES.AI_SDK,
            );
            const messageCount = this.messageContext.getMessageCount();

            return {
                sessionEntries: sessionHistory?.length || 0,
                stateKeys: stateKeys?.size || 0,
                memoryItems: 0, // Memory doesn't have a direct count method
                messageCount,
            };
        } catch (error) {
            this.logger.warn('Failed to get context stats:', {
                error: String(error),
            });
            return {
                sessionEntries: 0,
                stateKeys: 0,
                memoryItems: 0,
                messageCount: 0,
            };
        }
    }

    getMessageContext(): EnhancedMessageContext {
        return this.messageContext;
    }

    getStepExecution(): StepExecution {
        return this.stepExecution;
    }
}
