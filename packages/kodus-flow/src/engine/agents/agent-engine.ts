import { createLogger, getObservability } from '../../observability/index.js';
import { EngineError } from '../../core/errors.js';
import { AgentCore } from './agent-core.js';
import { MemoryManager } from '@/core/memory/index.js';
import {
    AgentCoreConfig,
    AgentDefinition,
    AgentExecutionOptions,
    AgentExecutionResult,
    AgentLifecycleResult,
    AgentPausePayload,
    AgentResumePayload,
    AgentSchedulePayload,
    AgentStartPayload,
    AgentStopPayload,
    AgentThought,
} from '@/core/types/allTypes.js';
import { ToolEngine } from '../tools/tool-engine.js';

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

    // ✅ ADICIONAR: MemoryManager para Engine Layer
    private memoryManager?: MemoryManager;

    constructor(
        definition: AgentDefinition<TInput, TOutput, TContent>,
        toolEngine?: ToolEngine,
        config?: AgentCoreConfig & {
            memoryManager?: MemoryManager; // ✅ ADICIONAR: MemoryManager opcional
        },
    ) {
        super(definition, toolEngine, config);

        // ✅ ADICIONAR: Inicializar MemoryManager se fornecido
        this.memoryManager = config?.memoryManager;

        this.engineLogger.info('AgentEngine created', {
            agentName: definition.name,
            mode: 'direct-execution',
            hasMemoryManager: !!this.memoryManager,
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
        agentExecutionOptions?: AgentExecutionOptions,
    ): Promise<AgentExecutionResult<TOutput>> {
        const { correlationId, sessionId } = agentExecutionOptions || {};
        const obs = getObservability();

        try {
            const definition = this.getDefinition();

            if (!definition) {
                this.engineLogger.error(
                    '❌ AGENT ENGINE - Agent definition not found',
                    new Error('Agent definition not found'),
                    {
                        correlationId,
                        trace: {
                            source: 'agent-engine',
                            step: 'definition-not-found',
                            timestamp: Date.now(),
                        },
                    },
                );
                throw new EngineError(
                    'AGENT_ERROR',
                    'Agent definition not found',
                );
            }

            const result = await obs.trace(
                `agent.execute`,
                async () =>
                    this.executeAgent(definition, input, agentExecutionOptions),
                {
                    correlationId,
                    tenantId: this.config.tenantId,
                },
            );

            this.engineLogger.debug(
                '📊 AGENT ENGINE - Core execution completed',
                {
                    agentName: definition.name,
                    correlationId,
                    success: result.success,
                    hasOutput: !!result.output,
                    hasReasoning: !!result.reasoning,
                    trace: {
                        source: 'agent-engine',
                        step: 'core-execution-done',
                        timestamp: Date.now(),
                    },
                },
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
