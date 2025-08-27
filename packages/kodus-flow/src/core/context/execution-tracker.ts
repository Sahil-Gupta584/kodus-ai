import { createLogger } from '../../observability/index.js';
import { getGlobalMemoryManager } from '../memory/memory-manager.js';

import {
    ActionResult,
    AgentAction,
    AgentContext,
    AgentThought,
    ResultAnalysis,
    STATE_NAMESPACES,
    StepResult,
} from '../types/allTypes.js';

export class ExecutionTracker {
    private steps: Map<string, StepResult> = new Map();
    private currentStepId: string | null = null;
    private logger = createLogger('execution-tracker');

    startStep(iteration: number): string {
        const stepId = `step-${iteration}-${Date.now()}`;
        this.currentStepId = stepId;

        const startTime = Date.now();
        this.steps.set(stepId, {
            stepId,
            iteration,
            thought: {
                reasoning: '',
                action: { type: 'initialized', content: '' },
            },
            action: { type: 'initialized', content: '' },
            status: 'initialized',
            result: { type: 'error', error: 'Not executed yet' },
            observation: {
                isComplete: false,
                isSuccessful: false,
                feedback: 'Step initialized',
                shouldContinue: false,
            },
            duration: 0,
            startedAt: startTime,
            toolCalls: [],
        });

        return stepId;
    }

    updateStep(stepId: string, updates: Partial<StepResult>): void {
        const step = this.steps.get(stepId);

        if (step) {
            Object.assign(step, updates);
        }
    }

    /**
     * Transition step from 'initialized' to 'executing'
     */
    startExecuting(
        stepId: string,
        thought: AgentThought,
        action: AgentAction,
    ): void {
        const step = this.steps.get(stepId);
        if (step && step.status === 'initialized') {
            step.status = 'executing';
            step.thought = thought;
            step.action = action;
            step.observation.isComplete = false;
            step.observation.isSuccessful = null; // Executando, ainda não sabemos
            step.observation.feedback = 'Step executing';
            step.observation.shouldContinue = true;
        }
    }

    /**
     * Mark step as completed successfully
     */
    markCompleted(
        stepId: string,
        result: ActionResult,
        observation: ResultAnalysis,
    ): void {
        const step = this.steps.get(stepId);
        if (step && step.status === 'executing') {
            step.status = 'completed';
            step.result = result;
            step.observation = {
                ...observation,
                isComplete: true,
                isSuccessful: true,
            };
            step.duration = Date.now() - (step.startedAt || Date.now());
        }
    }

    /**
     * Mark step as failed
     */
    markFailed(
        stepId: string,
        result: ActionResult,
        observation: ResultAnalysis,
    ): void {
        const step = this.steps.get(stepId);
        if (step && step.status === 'executing') {
            step.status = 'failed';
            step.result = result;
            step.observation = {
                ...observation,
                isComplete: true,
                isSuccessful: false,
            };
            step.duration = Date.now() - (step.startedAt || Date.now());
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
            step.toolCalls.push({ toolName, input, result, duration });
        }
    }

    getCurrentStep(): StepResult | undefined {
        return this.currentStepId
            ? this.steps.get(this.currentStepId)
            : undefined;
    }

    getStep(stepId: string): StepResult | undefined {
        return this.steps.get(stepId);
    }

    getAllSteps(): StepResult[] {
        return Array.from(this.steps.values());
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
        const totalToolCalls = steps.reduce(
            (sum, s) => sum + s.toolCalls.length,
            0,
        );

        return {
            totalSteps: steps.length,
            successfulSteps,
            failedSteps,
            averageDuration:
                steps.length > 0 ? totalDuration / steps.length : 0,
            totalContextOperations: 0,
            totalToolCalls,
        };
    }

    addContextOperation(): void {
        // Simplified - do nothing
    }

    async getContextForModel(
        context: AgentContext,
        query?: string,
    ): Promise<string> {
        const contextParts: string[] = [];

        try {
            // 1. MEMORY: Search relevant memories
            if (query) {
                const memoryManager = getGlobalMemoryManager();
                const searchResults = await memoryManager.search(query, {
                    topK: 3,
                    filter: {
                        tenantId: context.tenantId,
                        sessionId: context.sessionId,
                    },
                });
                if (searchResults && searchResults.length > 0) {
                    contextParts.push('\n📚 Relevant knowledge:');
                    searchResults.forEach((result, i) => {
                        const memoryStr =
                            result.metadata?.content ||
                            result.text ||
                            'No content';
                        contextParts.push(`${i + 1}. ${memoryStr}`);
                    });
                }
            }

            // 2. SESSION: Recent conversation history
            const sessionHistory = await context.conversation.getHistory();
            if (sessionHistory && sessionHistory.length > 0) {
                contextParts.push('\n💬 Recent conversation:');
                sessionHistory.slice(-3).forEach((entry, i) => {
                    contextParts.push(
                        `${i + 1}. [${entry.role}] ${entry.content.substring(0, 100)}...`,
                    );
                });
            }

            // 3. STATE: Current working state
            const workingState = await context.state.getNamespace(
                STATE_NAMESPACES.EXECUTION,
            );
            if (workingState && workingState.size > 0) {
                contextParts.push('\n⚡ Current state:');
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
        } catch (error) {
            this.logger.warn('Failed to build context for model:', {
                error: String(error),
            });
        }

        return contextParts.join('\n');
    }
}
