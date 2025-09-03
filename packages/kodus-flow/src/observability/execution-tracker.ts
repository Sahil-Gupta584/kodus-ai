import pino from 'pino';
import { getObservability } from './index.js';
import { IdGenerator } from '../utils/id-generator.js';

export interface ExecutionStep {
    id: string;
    timestamp: number;
    type: 'start' | 'think' | 'action' | 'tool' | 'finish' | 'error';
    component: string;
    data: Record<string, unknown>;
    duration?: number;
}

export interface ExecutionCycle {
    executionId: string;
    agentName: string;
    correlationId: string;
    startTime: number;
    endTime?: number;
    totalDuration?: number;
    steps: ExecutionStep[];
    input?: unknown;
    output?: unknown;
    error?: Error;
    status: 'running' | 'completed' | 'error';
    metadata: {
        tenantId?: string;
        sessionId?: string;
        threadId?: string;
        userId?: string;
    };
}

/**
 * Centralized execution cycle tracker for complete agent lifecycle monitoring
 */
export class ExecutionTracker {
    private static instance: ExecutionTracker;
    private cycles: Map<string, ExecutionCycle> = new Map();
    private logger: pino.Logger;

    private constructor() {
        this.logger = pino({ name: 'execution-tracker' });
    }

    static getInstance(): ExecutionTracker {
        if (!ExecutionTracker.instance) {
            ExecutionTracker.instance = new ExecutionTracker();
        }
        return ExecutionTracker.instance;
    }

    /**
     * Start tracking a new execution cycle
     */
    startExecution(
        agentName: string,
        correlationId: string,
        metadata: Partial<ExecutionCycle['metadata']> = {},
        input?: unknown,
    ): string {
        const executionId = IdGenerator.executionId();
        const cycle: ExecutionCycle = {
            executionId,
            agentName,
            correlationId,
            startTime: Date.now(),
            steps: [],
            status: 'running',
            metadata: {
                tenantId: metadata.tenantId,
                sessionId: metadata.sessionId,
                threadId: metadata.threadId,
                userId: metadata.userId,
            },
            ...(input ? { input } : {}),
        };

        this.cycles.set(executionId, cycle);

        // Add start step
        this.addStep(executionId, 'start', 'execution-tracker', {
            agentName,
            correlationId,
            input: input ? JSON.stringify(input).slice(0, 500) : undefined, // Limit input size
        });

        this.logger.info(
            {
                executionId,
                agentName,
                correlationId,
            },
            'Execution cycle started',
        );

        return executionId;
    }

    /**
     * Add a step to an execution cycle
     */
    addStep(
        executionId: string,
        type: ExecutionStep['type'],
        component: string,
        data: Record<string, unknown>,
        duration?: number,
    ): void {
        const cycle = this.cycles.get(executionId);
        if (!cycle) {
            this.logger.warn(
                {
                    executionId,
                    type,
                    component,
                },
                'Attempted to add step to unknown execution',
            );
            return;
        }

        const step: ExecutionStep = {
            id: IdGenerator.callId(),
            timestamp: Date.now(),
            type,
            component,
            data,
            ...(duration && { duration }),
        };

        cycle.steps.push(step);

        // Keep only last 50 steps to prevent memory bloat
        if (cycle.steps.length > 50) {
            cycle.steps.shift();
        }

        this.logger.debug(
            {
                executionId,
                type,
                component,
                stepCount: cycle.steps.length,
            },
            'Execution step added',
        );
    }

    /**
     * Complete an execution cycle successfully
     */
    completeExecution(executionId: string, output?: unknown): void {
        const cycle = this.cycles.get(executionId);
        if (!cycle) {
            this.logger.warn(
                {
                    executionId,
                },
                'Attempted to complete unknown execution',
            );
            return;
        }

        cycle.endTime = Date.now();
        cycle.totalDuration = cycle.endTime - cycle.startTime;
        cycle.status = 'completed';
        if (output !== undefined) {
            cycle.output = output;
        }

        // Add finish step
        this.addStep(executionId, 'finish', 'execution-tracker', {
            output: output ? JSON.stringify(output).slice(0, 1000) : undefined,
            totalDuration: cycle.totalDuration,
            stepCount: cycle.steps.length,
        });

        // Save to observability system
        void this.saveToObservability(cycle);

        this.logger.info(
            {
                executionId,
                agentName: cycle.agentName,
                totalDuration: cycle.totalDuration,
                stepCount: cycle.steps.length,
            },
            'Execution cycle completed',
        );

        // Clean up after 5 minutes to prevent memory leaks
        setTimeout(
            () => {
                this.cycles.delete(executionId);
            },
            5 * 60 * 1000,
        );
    }

    /**
     * Mark execution as failed
     */
    failExecution(executionId: string, error: Error): void {
        const cycle = this.cycles.get(executionId);
        if (!cycle) {
            this.logger.warn(
                {
                    executionId,
                },
                'Attempted to fail unknown execution',
            );
            return;
        }

        cycle.endTime = Date.now();
        cycle.totalDuration = cycle.endTime - cycle.startTime;
        cycle.status = 'error';
        cycle.error = error;

        // Add error step
        this.addStep(executionId, 'error', 'execution-tracker', {
            errorName: error.name,
            errorMessage: error.message,
            totalDuration: cycle.totalDuration,
        });

        // Save to observability system
        void this.saveToObservability(cycle);

        this.logger.error(
            {
                executionId,
                agentName: cycle.agentName,
                errorName: error.name,
                errorMessage: error.message,
                totalDuration: cycle.totalDuration,
            },
            'Execution cycle failed',
        );

        // Clean up after 10 minutes for failed executions
        setTimeout(
            () => {
                this.cycles.delete(executionId);
            },
            10 * 60 * 1000,
        );
    }

    /**
     * Get current execution cycle data
     */
    getExecution(executionId: string): ExecutionCycle | undefined {
        return this.cycles.get(executionId);
    }

    /**
     * Get all active executions
     */
    getActiveExecutions(): ExecutionCycle[] {
        return Array.from(this.cycles.values()).filter(
            (cycle) => cycle.status === 'running',
        );
    }

    /**
     * Save execution cycle to observability system
     */
    private async saveToObservability(cycle: ExecutionCycle): Promise<void> {
        try {
            const obs = getObservability();
            await obs.saveAgentExecutionCycle(cycle);
        } catch (error) {
            this.logger.error(
                {
                    executionId: cycle.executionId,
                    error:
                        error instanceof Error
                            ? error.message
                            : 'Unknown error',
                },
                'Failed to save execution cycle to observability',
            );
        }
    }

    /**
     * Get execution summary for monitoring
     */
    getExecutionSummary(executionId: string): {
        executionId: string;
        agentName: string;
        status: string;
        duration: number;
        stepCount: number;
        hasError: boolean;
    } | null {
        const cycle = this.cycles.get(executionId);
        if (!cycle) return null;

        return {
            executionId: cycle.executionId,
            agentName: cycle.agentName,
            status: cycle.status,
            duration: cycle.totalDuration || Date.now() - cycle.startTime,
            stepCount: cycle.steps.length,
            hasError: cycle.status === 'error',
        };
    }
}

// Export singleton instance
export const executionTracker = ExecutionTracker.getInstance();

// Helper functions for easy integration
export function startExecutionTracking(
    agentName: string,
    correlationId: string,
    metadata?: Partial<ExecutionCycle['metadata']>,
    input?: unknown,
): string {
    return executionTracker.startExecution(
        agentName,
        correlationId,
        metadata,
        input,
    );
}

export function addExecutionStep(
    executionId: string,
    type: ExecutionStep['type'],
    component: string,
    data: Record<string, unknown>,
    duration?: number,
): void {
    executionTracker.addStep(executionId, type, component, data, duration);
}

export function completeExecutionTracking(
    executionId: string,
    output?: unknown,
): void {
    executionTracker.completeExecution(executionId, output);
}

export function failExecutionTracking(executionId: string, error: Error): void {
    executionTracker.failExecution(executionId, error);
}

export function getExecutionTracking(
    executionId: string,
): ExecutionCycle | undefined {
    return executionTracker.getExecution(executionId);
}
