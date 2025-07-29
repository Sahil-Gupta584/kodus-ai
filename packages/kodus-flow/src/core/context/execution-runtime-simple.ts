/**
 * @file execution-runtime-simple.ts
 * @description ExecutionRuntime refatorado - Pure lifecycle manager
 *
 * RESPONSABILIDADES:
 * - Gerenciar lifecycle de execução (start/end)
 * - Tracking básico de execução
 * - Criar AgentExecutionContext para agent-core.ts
 * - NO business logic, NO service implementations
 */

import { createLogger } from '../../observability/index.js';
import { IdGenerator } from '../../utils/id-generator.js';

import type {
    AgentContext,
    AgentExecutionContext,
    AgentExecutionOptions,
} from '../types/agent-types.js';
import type { UserContext, SystemContext } from '../types/base-types.js';

/**
 * ExecutionRuntime - Pure lifecycle manager
 * NO business logic, NO service implementations
 * Just coordinates execution lifecycle
 */
// Simple runtime interface just for lifecycle management
interface SimpleRuntimeInterface {
    startExecution(agentName: string): Promise<void>;
    endExecution(result: {
        success: boolean;
        error?: Error;
        outputSummary?: string;
    }): Promise<void>;
    updateExecution(updates: {
        iteration?: number;
        toolsUsed?: string[];
        currentThought?: string;
    }): void;
    getExecutionInfo(): {
        executionId: string;
        isRunning: boolean;
        duration: number;
        agentName?: string;
        identifiers: {
            sessionId: string;
            tenantId: string;
            threadId: string;
        };
    };
    health(): Promise<{ status: 'healthy' | 'unhealthy'; details: unknown }>;
    cleanup(): Promise<void>;
    getSummary(): {
        executionId: string;
        agentName?: string;
        status: 'running' | 'completed' | 'idle';
        duration: number;
    };
}

export class ExecutionRuntime implements SimpleRuntimeInterface {
    private readonly logger = createLogger('ExecutionRuntime');
    private readonly executionId: string;
    private readonly startTime: number;
    private isRunning = false;
    private agentName?: string;

    constructor(
        private readonly identifiers: {
            sessionId: string;
            tenantId: string;
            threadId: string;
        },
    ) {
        this.executionId = IdGenerator.executionId();
        this.startTime = Date.now();

        this.logger.debug('ExecutionRuntime created', {
            executionId: this.executionId,
            ...this.identifiers,
        });
    }

    /**
     * Start execution lifecycle
     */
    async startExecution(agentName: string): Promise<void> {
        if (this.isRunning) {
            throw new Error(
                `Execution already running for agent: ${this.agentName}`,
            );
        }

        this.isRunning = true;
        this.agentName = agentName;

        this.logger.info('Execution started', {
            executionId: this.executionId,
            agentName,
            ...this.identifiers,
        });
    }

    /**
     * End execution lifecycle
     */
    async endExecution(result: {
        success: boolean;
        error?: Error;
        outputSummary?: string;
    }): Promise<void> {
        if (!this.isRunning) {
            throw new Error('No execution running');
        }

        const duration = Date.now() - this.startTime;
        this.isRunning = false;

        this.logger.info('Execution ended', {
            executionId: this.executionId,
            agentName: this.agentName,
            duration,
            success: result.success,
            error: result.error?.message,
            outputSummary: result.outputSummary,
            ...this.identifiers,
        });
    }

    /**
     * Create agent execution context (for agent-core.ts internal use)
     */
    createAgentExecutionContext(
        agentContext: AgentContext,
        options: AgentExecutionOptions,
    ): AgentExecutionContext {
        const user: UserContext = {
            id: 'anonymous', // AgentExecutionOptions não tem userId
            preferences: {},
            metadata: options.userContext || {},
        };

        const system: SystemContext = {
            // BaseContext fields required by SystemContext
            tenantId: this.identifiers.tenantId,
            correlationId: agentContext.correlationId,
            startTime: this.startTime,

            // SystemContext specific fields
            sessionId: this.identifiers.sessionId,
            threadId: this.identifiers.threadId,
            executionId: this.executionId,
            status: this.isRunning ? 'running' : 'completed',
            conversationHistory: [], // Will be populated from session
            iteration: 0,
            toolsUsed: 0, // SystemContext.toolsUsed é number, não array
        };

        return {
            // ===== AGENT IDENTITY =====
            agentName: agentContext.agentName,
            invocationId: agentContext.invocationId,
            startTime: this.startTime,
            tenantId: this.identifiers.tenantId,
            correlationId: agentContext.correlationId,

            // ===== AGENT-SPECIFIC DATA =====
            user,
            system,

            // ===== SINGLE RUNTIME REFERENCE (no circular ref) =====
            executionRuntime: this, // This ExecutionRuntime implements SimpleExecutionRuntime interface

            agentIdentity: undefined, // AgentExecutionOptions não tem agentIdentity
            agentExecutionOptions: options,
            availableToolsForLLM: undefined, // será preenchido pela engine
            signal: agentContext.signal,
            cleanup: () => this.cleanup(),
        };
    }

    /**
     * Update execution info (for agent-core.ts)
     */
    updateExecution(updates: {
        iteration?: number;
        toolsUsed?: string[];
        currentThought?: string;
    }): void {
        this.logger.debug('Execution updated', {
            executionId: this.executionId,
            agentName: this.agentName,
            updates,
        });
    }

    /**
     * Get execution info (for monitoring/debugging)
     */
    getExecutionInfo(): {
        executionId: string;
        isRunning: boolean;
        duration: number;
        agentName?: string;
        identifiers: {
            sessionId: string;
            tenantId: string;
            threadId: string;
        };
    } {
        return {
            executionId: this.executionId,
            isRunning: this.isRunning,
            duration: Date.now() - this.startTime,
            agentName: this.agentName,
            identifiers: this.identifiers,
        };
    }

    /**
     * Health check
     */
    async health(): Promise<{
        status: 'healthy' | 'unhealthy';
        details: unknown;
    }> {
        return {
            status: 'healthy',
            details: this.getExecutionInfo(),
        };
    }

    /**
     * Cleanup resources
     */
    async cleanup(): Promise<void> {
        if (this.isRunning) {
            await this.endExecution({
                success: false,
                error: new Error('Forced cleanup'),
                outputSummary: 'Execution terminated by cleanup',
            });
        }

        this.logger.info('ExecutionRuntime cleaned up', {
            executionId: this.executionId,
            agentName: this.agentName,
        });
    }

    /**
     * Get minimal execution summary (for logging/monitoring)
     */
    getSummary(): {
        executionId: string;
        agentName?: string;
        status: 'running' | 'completed' | 'idle';
        duration: number;
    } {
        return {
            executionId: this.executionId,
            agentName: this.agentName,
            status: this.isRunning
                ? 'running'
                : this.agentName
                  ? 'completed'
                  : 'idle',
            duration: Date.now() - this.startTime,
        };
    }
}
