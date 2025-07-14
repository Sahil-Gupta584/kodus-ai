/**
 * @module engine/agents/agent_new/agent-engine
 * @description Engine para execução direta de agentes - sem workflow
 *
 * CARACTERÍSTICAS:
 * ✅ Execução direta e rápida
 * ✅ Sem overhead de workflow
 * ✅ Sem pause/resume
 * ✅ Ideal para agentes simples e autônomos
 * ✅ Suporte completo a tools e multi-agent
 */

import { createLogger } from '../../observability/index.js';
import { EngineError } from '../../core/errors.js';
import { IdGenerator } from '../../utils/id-generator.js';
import type { ToolEngine } from '../tools/tool-engine.js';

// Types do sistema
import type {
    AgentDefinition,
    AgentExecutionOptions,
    AgentExecutionResult,
    AgentStartPayload,
    AgentStopPayload,
    AgentPausePayload,
    AgentResumePayload,
    AgentSchedulePayload,
    AgentLifecycleResult,
    AgentThought,
} from '../../core/types/agent-types.js';

import type { AgentCoreConfig } from './agent-core.js';
import { AgentCore } from './agent-core.js';

// ──────────────────────────────────────────────────────────────────────────────
// 🚀 AGENT ENGINE IMPLEMENTATION
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Engine para execução direta de agentes
 * Execução simples, rápida, sem workflow overhead
 */
export class AgentEngine<
    TInput = unknown,
    TOutput = unknown,
    TContent = unknown,
> extends AgentCore<TInput, TOutput, TContent> {
    protected readonly engineLogger = createLogger('agent-engine');

    constructor(
        definition: AgentDefinition<TInput, TOutput, TContent>,
        toolEngine?: ToolEngine,
        config?: AgentCoreConfig,
    ) {
        super(definition, toolEngine, config);

        this.engineLogger.info('AgentEngine created', {
            agentName: definition.name,
            mode: 'direct-execution',
        });

        // Initialize the core components
        this.initialize().catch((error) => {
            this.engineLogger.error(
                'Failed to initialize AgentEngine',
                error as Error,
            );
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 🎯 PUBLIC EXECUTION INTERFACE
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Executar agente diretamente (sem workflow)
     */
    async execute(
        input: TInput,
        options?: AgentExecutionOptions,
    ): Promise<AgentExecutionResult<TOutput>> {
        debugger;
        const correlationId =
            options?.correlationId || IdGenerator.correlationId();
        const sessionId = options?.sessionId;

        this.engineLogger.info('Agent execution started', {
            agentName: this.getDefinition()?.name,
            correlationId,
            sessionId,
            inputType: typeof input,
        });

        try {
            const definition = this.getDefinition();
            if (!definition) {
                throw new EngineError(
                    'AGENT_ERROR',
                    'Agent definition not found',
                );
            }

            // Execute using shared core logic
            const result = await this.executeAgent(
                definition,
                input,
                correlationId,
                sessionId,
                options,
            );

            // Format response if available
            if (definition.formatResponse) {
                const formattedOutput = definition.formatResponse({
                    reasoning: result.reasoning || '',
                    action: {
                        type: 'final_answer',
                        content: result.output,
                    },
                } as AgentThought<TContent>);

                return {
                    ...result,
                    output: formattedOutput,
                    data: formattedOutput,
                };
            }

            return result as AgentExecutionResult<TOutput>;
        } catch (error) {
            this.engineLogger.error('Agent execution failed', error as Error, {
                agentName: this.getDefinition()?.name,
                correlationId,
                sessionId,
            });

            throw error;
        }
    }

    /**
     * Executar agente com input validado
     */
    async executeWithValidation(
        input: unknown,
        options?: AgentExecutionOptions,
    ): Promise<AgentExecutionResult<TOutput>> {
        const definition = this.getDefinition();
        if (!definition) {
            throw new EngineError('AGENT_ERROR', 'Agent definition not found');
        }

        // Validate input if validation function exists
        if (definition.validateInput) {
            if (!definition.validateInput(input)) {
                throw new EngineError('AGENT_ERROR', 'Invalid input for agent');
            }
        }

        return this.execute(input as TInput, options);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 🔄 LIFECYCLE INTERFACE (DELEGATED TO CORE)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Start agent lifecycle (direct execution - no workflow)
     */
    async start(payload: AgentStartPayload): Promise<AgentLifecycleResult> {
        this.engineLogger.info('Agent engine lifecycle started', { payload });
        return {
            success: true,
            agentName: payload.agentName,
            operation: 'start',
            previousStatus: 'stopped',
            currentStatus: 'running',
            duration: 0,
            metadata: { executionTime: 0, transitionValid: true },
        };
    }

    /**
     * Stop agent lifecycle (direct execution - no workflow)
     */
    async stop(payload: AgentStopPayload): Promise<AgentLifecycleResult> {
        this.engineLogger.info('Agent engine lifecycle stopped', { payload });
        return {
            success: true,
            agentName: payload.agentName,
            operation: 'stop',
            previousStatus: 'running',
            currentStatus: 'stopped',
            duration: 0,
            metadata: { executionTime: 0, transitionValid: true },
        };
    }

    /**
     * Pause agent lifecycle (direct execution - no workflow)
     */
    async pause(payload: AgentPausePayload): Promise<AgentLifecycleResult> {
        this.engineLogger.info('Agent engine lifecycle paused', { payload });
        return {
            success: true,
            agentName: payload.agentName,
            operation: 'pause',
            previousStatus: 'running',
            currentStatus: 'paused',
            duration: 0,
            metadata: { executionTime: 0, transitionValid: true },
        };
    }

    /**
     * Resume agent lifecycle (direct execution - no workflow)
     */
    async resume(payload: AgentResumePayload): Promise<AgentLifecycleResult> {
        this.engineLogger.info('Agent engine lifecycle resumed', { payload });
        return {
            success: true,
            agentName: payload.agentName,
            operation: 'resume',
            previousStatus: 'paused',
            currentStatus: 'running',
            duration: 0,
            metadata: { executionTime: 0, transitionValid: true },
        };
    }

    /**
     * Schedule agent lifecycle (direct execution - no workflow)
     */
    async schedule(
        payload: AgentSchedulePayload,
    ): Promise<AgentLifecycleResult> {
        this.engineLogger.info('Agent engine lifecycle scheduled', { payload });
        return {
            success: true,
            agentName: payload.agentName,
            operation: 'schedule',
            previousStatus: 'stopped',
            currentStatus: 'scheduled',
            duration: 0,
            metadata: { executionTime: 0, transitionValid: true },
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 📊 STATUS & MONITORING
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Get engine status
     */
    getEngineStatus(): {
        engineType: 'direct';
        agentName: string;
        isReady: boolean;
        lifecycleStatus: string;
        activeExecutions: number;
        totalExecutions: number;
    } {
        const status = this.getStatus();
        const definition = this.getDefinition();

        return {
            engineType: 'direct',
            agentName: definition?.name || 'unknown',
            isReady: status.initialized,
            lifecycleStatus: 'running', // Direct execution is always running
            activeExecutions: status.activeExecutions,
            totalExecutions: status.eventCount,
        };
    }

    /**
     * Get execution statistics
     */
    getExecutionStats(): {
        totalExecutions: number;
        successfulExecutions: number;
        failedExecutions: number;
        averageExecutionTime: number;
        lastExecutionTime?: number;
    } {
        // TODO: Implement actual statistics tracking
        return {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            averageExecutionTime: 0,
        };
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 🏭 FACTORY FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Create agent for direct execution
 */
export function createAgent<
    TInput = unknown,
    TOutput = unknown,
    TContent = unknown,
>(
    definition: AgentDefinition<TInput, TOutput, TContent>,
    config?: AgentCoreConfig,
): AgentEngine<TInput, TOutput, TContent> {
    return new AgentEngine(definition, undefined, config);
}
