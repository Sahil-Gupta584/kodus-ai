import {
    ExecutionCriteria,
    SimpleExecutionLog,
    StepResult,
} from '@/core/types/allTypes.js';
import { createLogger } from '../../../observability/index.js';

export class SimpleExecutionLogger {
    private logs: Map<string, SimpleExecutionLog> = new Map();
    private readonly logger = createLogger('simple-execution-logger');
    private maxLogs = 100; // Keep only last 100 logs in memory

    /**
     * Determine if execution should be persisted based on complexity
     */
    private shouldPersistExecution(criteria: ExecutionCriteria): boolean {
        // Always persist if debug mode
        if (criteria.isDebugMode) return true;

        // Always persist if has errors (for debugging)
        if (criteria.hasErrors) return true;

        // Persist complex interactions
        if (criteria.hasToolCalls) return true;
        if (criteria.multipleSteps) return true;
        if (criteria.executionTimeMs > 2000) return true; // > 2 seconds

        // Skip simple interactions
        return false;
    }

    /**
     * Calculate simple complexity score
     */
    private calculateComplexity(steps: StepResult[]): number {
        let score = 1;

        // Add for tool calls
        const toolCalls = steps.reduce(
            (sum, step) => sum + step.toolCalls.length,
            0,
        );
        score += Math.min(toolCalls * 2, 6);

        // Add for multiple steps
        if (steps.length > 1) score += 2;

        // Add for errors
        const errors = steps.filter(
            (step) => !step.observation.isSuccessful,
        ).length;
        score += errors;

        return Math.min(score, 10);
    }

    /**
     * Log execution with smart persistence decision
     */
    logExecution(
        executionId: string,
        sessionId: string,
        agentName: string,
        startTime: number,
        endTime: number,
        steps: StepResult[],
        criteria: ExecutionCriteria,
    ): {
        logged: boolean;
        shouldPersist: boolean;
        summary: SimpleExecutionLog;
    } {
        const toolCallsCount = steps.reduce(
            (sum, step) => sum + step.toolCalls.length,
            0,
        );
        const hasErrors = steps.some((step) => !step.observation.isSuccessful);

        const log: SimpleExecutionLog = {
            executionId,
            sessionId,
            agentName,
            startTime,
            endTime,
            totalDuration: endTime - startTime,
            toolCallsCount,
            complexityScore: this.calculateComplexity(steps),
            finalStatus: hasErrors ? 'error' : 'success',
        };

        const shouldPersist = this.shouldPersistExecution(criteria);

        // Always keep in memory (for immediate access)
        this.logs.set(executionId, log);

        // Cleanup old logs
        if (this.logs.size > this.maxLogs) {
            const entries = Array.from(this.logs.entries());
            entries.sort((a, b) => a[1].startTime - b[1].startTime);
            const toDelete = entries.slice(0, entries.length - this.maxLogs);
            toDelete.forEach(([id]) => this.logs.delete(id));
        }

        this.logger.debug('Execution logged', {
            executionId,
            sessionId,
            agentName,
            duration: log.totalDuration,
            toolCalls: log.toolCallsCount,
            complexity: log.complexityScore,
            shouldPersist,
        });

        return {
            logged: true,
            shouldPersist,
            summary: log,
        };
    }

    /**
     * Get recent executions for a session
     */
    getSessionExecutions(sessionId: string): SimpleExecutionLog[] {
        return Array.from(this.logs.values())
            .filter((log) => log.sessionId === sessionId)
            .sort((a, b) => b.startTime - a.startTime)
            .slice(0, 10); // Last 10 executions
    }

    /**
     * Get execution by ID
     */
    getExecution(executionId: string): SimpleExecutionLog | undefined {
        return this.logs.get(executionId);
    }

    /**
     * Get simple analytics
     */
    getAnalytics(): {
        totalExecutions: number;
        successRate: number;
        avgDuration: number;
        avgComplexity: number;
    } {
        const logs = Array.from(this.logs.values());

        if (logs.length === 0) {
            return {
                totalExecutions: 0,
                successRate: 0,
                avgDuration: 0,
                avgComplexity: 0,
            };
        }

        const successCount = logs.filter(
            (log) => log.finalStatus === 'success',
        ).length;
        const totalDuration = logs.reduce(
            (sum, log) => sum + log.totalDuration,
            0,
        );
        const totalComplexity = logs.reduce(
            (sum, log) => sum + log.complexityScore,
            0,
        );

        return {
            totalExecutions: logs.length,
            successRate: (successCount / logs.length) * 100,
            avgDuration: totalDuration / logs.length,
            avgComplexity: totalComplexity / logs.length,
        };
    }

    /**
     * Clear all logs
     */
    clear(): void {
        this.logs.clear();
        this.logger.info('Execution logs cleared');
    }
}
