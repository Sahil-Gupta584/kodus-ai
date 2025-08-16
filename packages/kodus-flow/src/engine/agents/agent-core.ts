import {
    createLogger,
    getObservability,
    startAgentSpan,
    applyErrorToSpan,
    markSpanOk,
    type ObservabilitySystem,
} from '../../observability/index.js';
import { CircuitBreaker } from '../../runtime/core/circuit-breaker.js';
import { EngineError } from '../../core/errors.js';
import { createAgentError } from '../../core/error-unified.js';
import { IdGenerator } from '../../utils/id-generator.js';
import { ContextBuilder } from '../../core/context/context-builder.js';
// Timeline removida
import type {
    AgentContext,
    TenantId,
    ToolCall,
} from '../../core/types/common-types.js';
import type { ToolEngine } from '../tools/tool-engine.js';
import {
    createDefaultMultiKernelHandler,
    type MultiKernelHandler,
} from '../core/multi-kernel-handler.js';

// Types do sistema
import type {
    AgentThought,
    AgentAction,
    AgentDefinition,
    AgentExecutionOptions,
    AgentExecutionResult,
    ParallelToolsAction,
    SequentialToolsAction,
    ConditionalToolsAction,
    MixedToolsAction,
    DependencyToolsAction,
} from '../../core/types/agent-types.js';
import {
    isNeedMoreInfoAction,
    isExecutePlanAction,
} from '../../core/types/agent-types.js';

import type { AnyEvent } from '../../core/types/events.js';

// ──────────────────────────────────────────────────────────────────────────
// 🚀 CONVERSATIONAL SHORTCUT UTILITIES
// ──────────────────────────────────────────────────────────────────────────

// Import dos types de coordenação
import type {
    AgentCapability,
    AgentMessage,
    // AgentCoordinationStrategy,
    // AgentSelectionCriteria,
    // MultiAgentContext,
    // MultiAgentResult,
    // WorkflowStep,
    // WorkflowStepContext,
    TrackedMessage,
    DelegationContext,
    // DelegationResult,
} from './multi-agent-types.js';

// ✅ REMOVER: Import não utilizado após remoção do stateManager duplicado
// import { ContextStateService } from '../../core/context/services/state-service.js';
import { sessionService } from '../../core/context/services/session-service.js';
import { ToolId } from '../../core/types/tool-types.js';
import type { Router } from '../routing/router.js';
import type { Plan, PlanStep } from '../planning/planner.js';

// NEW: Think→Act→Observe imports
import type { LLMAdapter } from '../../adapters/llm/index.js';
import {
    PlannerFactory,
    type Planner,
    type PlannerType,
    type ActionResult,
    type ResultAnalysis,
    type PlannerExecutionContext,
    isToolCallAction,
    isFinalAnswerAction,
    isErrorResult,
    getResultError,
    isToolResult,
    StepExecution,
} from '../planning/planner-factory.js';
import {
    ExecutionPlan,
    ReplanPolicyConfig,
} from '@/core/types/planning-shared.js';
import { PlanExecutor } from '../planning/executor/plan-executor.js';

// ──────────────────────────────────────────────────────────────────────────────
// 🧩 CORE CONFIGURATION
// ──────────────────────────────────────────────────────────────────────────────

export interface AgentCoreConfig {
    // Identity & Multi-tenancy
    tenantId: TenantId;
    agentName?: string;

    // NEW: Think→Act→Observe Configuration
    planner?: PlannerType;
    llmAdapter?: LLMAdapter;
    maxThinkingIterations?: number;
    thinkingTimeout?: number;

    // Debugging & Monitoring
    debug?: boolean;
    monitoring?: boolean;

    // Performance & Concurrency
    maxConcurrentAgents?: number;
    agentTimeout?: number;

    // Execution Control
    timeout?: number;
    enableFallback?: boolean;
    concurrency?: number;

    // Multi-Agent Support (BÁSICO)
    enableMultiAgent?: boolean;
    maxChainDepth?: number;
    enableDelegation?: boolean;

    enableAdvancedCoordination?: boolean;
    enableMessaging?: boolean;
    enableMetrics?: boolean;
    maxHistorySize?: number;
    deliveryRetryInterval?: number;
    defaultMaxAttempts?: number;

    enableTools?: boolean;
    toolTimeout?: number;
    maxToolRetries?: number;

    enableKernelIntegration?: boolean;

    plannerOptions?: {
        replanPolicy?: Partial<ReplanPolicyConfig>;
    };
}

// ──────────────────────────────────────────────────────────────────────────────
// 🚀 AGENT CORE IMPLEMENTATION
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Core compartilhado para agentes com suporte multi-agent avançado
 */
export abstract class AgentCore<
    TInput = unknown,
    TOutput = unknown,
    TContent = unknown,
> {
    protected logger: ReturnType<typeof createLogger>;
    protected readonly thinkingTimeout: number;
    protected config: AgentCoreConfig;
    protected eventHistory: AnyEvent[] = [];

    // Single agent mode
    protected singleAgentDefinition?: AgentDefinition<
        TInput,
        TOutput,
        TContent
    >;
    protected toolEngine?: ToolEngine;
    protected router?: Router;

    // Multi-agent mode (LAZY INITIALIZATION)
    private _agents?: Map<string, AgentDefinition<unknown, unknown, unknown>>;
    private _agentCapabilities?: Map<string, AgentCapability>;
    private _messages?: Map<string, TrackedMessage>;
    private _agentInboxes?: Map<string, TrackedMessage[]>;
    private _activeDelegations?: Map<string, DelegationContext>;
    private _messageHistory?: TrackedMessage[];
    private _deliveryQueue?: TrackedMessage[];
    protected deliveryIntervalId?: NodeJS.Timeout;
    protected isProcessingQueue = false;

    // Execution tracking (sempre necessário)
    protected activeExecutions = new Map<
        string,
        {
            correlationId: string;
            sessionId?: string;
            startTime: number;
            status: 'running' | 'paused' | 'completed' | 'failed';
        }
    >();

    protected kernelHandler?: MultiKernelHandler;

    protected toolCircuitBreaker?: CircuitBreaker;

    private initializeCircuitBreaker(): void {
        const observabilitySystem = {
            logger: this.logger,
            monitoring: {
                recordMetric: () => {},
                recordHistogram: () => {},
                incrementCounter: () => {},
            },
            telemetry: {
                startSpan: () => ({
                    end: () => {},
                    setAttribute: () => ({ end: () => {} }),
                    setAttributes: () => ({ end: () => {} }),
                    setStatus: () => ({ end: () => {} }),
                    recordException: () => ({ end: () => {} }),
                    addEvent: () => ({ end: () => {} }),
                    updateName: () => ({ end: () => {} }),
                }),
                recordException: () => {},
            },
            config: {},
            monitor: {},
            debug: {},
            createContext: () => ({}),
        } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

        this.toolCircuitBreaker = new CircuitBreaker(observabilitySystem, {
            name: `tool-execution-${this.config.agentName || 'default'}`,
            failureThreshold: 3, // Open after 3 failures
            recoveryTimeout: 150000, // ✅ Try to recover after 2.5 minutes
            successThreshold: 2, // Close after 2 successes
            operationTimeout: this.config.toolTimeout || 60000, // ✅ 60s timeout
            onStateChange: (newState, prevState) => {
                this.logger.info('Tool circuit breaker state changed', {
                    agentName: this.config.agentName,
                    from: prevState,
                    to: newState,
                });
            },
            onFailure: (error, context) => {
                this.logger.warn('Tool circuit breaker recorded failure', {
                    agentName: this.config.agentName,
                    error: error.message,
                    context,
                });
            },
        });
    }

    // === LAZY INITIALIZATION GETTERS ===
    protected get agents() {
        if (!this._agents) {
            this._agents = new Map<
                string,
                AgentDefinition<unknown, unknown, unknown>
            >();
        }
        return this._agents;
    }

    protected get agentCapabilities() {
        if (!this._agentCapabilities) {
            this._agentCapabilities = new Map<string, AgentCapability>();
        }
        return this._agentCapabilities;
    }

    protected get messages() {
        if (!this._messages) {
            this._messages = new Map<string, TrackedMessage>();
        }
        return this._messages;
    }

    protected get agentInboxes() {
        if (!this._agentInboxes) {
            this._agentInboxes = new Map<string, TrackedMessage[]>();
        }
        return this._agentInboxes;
    }

    protected get activeDelegations() {
        if (!this._activeDelegations) {
            this._activeDelegations = new Map<string, DelegationContext>();
        }
        return this._activeDelegations;
    }

    protected get messageHistory() {
        if (!this._messageHistory) {
            this._messageHistory = [];
        }
        return this._messageHistory;
    }

    protected get deliveryQueue() {
        if (!this._deliveryQueue) {
            this._deliveryQueue = [];
        }
        return this._deliveryQueue;
    }

    protected planner?: Planner;
    protected llmAdapter?: LLMAdapter;
    protected executionContext?: PlannerExecutionContext;

    constructor(
        definitionOrConfig:
            | AgentDefinition<TInput, TOutput, TContent>
            | AgentCoreConfig,
        toolEngineOrConfig?: ToolEngine | AgentCoreConfig,
        config?: AgentCoreConfig,
    ) {
        this.logger = createLogger('agent-core');
        this.thinkingTimeout = 60000; // ✅ 60s thinking timeout

        if (this.isAgentDefinition(definitionOrConfig)) {
            this.singleAgentDefinition = definitionOrConfig;
            this.toolEngine = toolEngineOrConfig as ToolEngine;
            this.config = config || { tenantId: 'default' };
            this.config.agentName = definitionOrConfig.name;
        } else {
            // Multi-agent mode
            this.config = definitionOrConfig as AgentCoreConfig;
            if (!this.config.tenantId) {
                throw new EngineError(
                    'AGENT_ERROR',
                    'tenantId é obrigatório para modo multi-agent',
                );
            }
        }

        this.config = {
            maxThinkingIterations: 15,
            thinkingTimeout: 60000, // ✅ 60s thinking timeout
            timeout: 60000,
            enableFallback: true,
            maxConcurrentAgents: 10,
            enableMultiAgent: true,
            enableTools: true,
            maxChainDepth: 5,
            enableDelegation: true,
            toolTimeout: 60000, // ✅ 60s tool timeout
            maxToolRetries: 2,
            // Advanced multi-agent defaults
            enableAdvancedCoordination: true,
            enableMessaging: true,
            enableMetrics: true,
            maxHistorySize: 10000,
            deliveryRetryInterval: 1000,
            defaultMaxAttempts: 2,
            ...this.config,
        };

        // Setup logger first
        const agentName = this.config.agentName || 'multi-agent';
        this.logger = createLogger(`agent-core:${agentName}`);
        this.initializeCircuitBreaker();

        // KernelHandler sempre habilitado - será injetado via setKernelHandler()
        // Apenas criar local KernelHandler se tenant for 'isolated'
        if (this.config.tenantId === 'isolated') {
            this.kernelHandler = createDefaultMultiKernelHandler(
                this.config.tenantId,
            );
        }
        this.thinkingTimeout = this.config.thinkingTimeout || 60000; // ✅ 60s thinking timeout

        // Setup memory leak prevention - cleanup expired executions every 5 minutes
        setInterval(() => {
            this.cleanupExpiredExecutions();
        }, 300000);

        this.initializePlannerComponents();

        if (this.config.enableMessaging) {
            this.startDeliveryProcessor();
        }

        // ✅ NEW: Configure ToolEngine in ContextBuilder if available
        if (this.toolEngine) {
            ContextBuilder.getInstance().setToolEngine(this.toolEngine);
            this.logger.info('ToolEngine configured in ContextBuilder', {
                toolCount: this.toolEngine.listTools().length,
            });
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 🔧 CORE EXECUTION LOGIC (COMPARTILHADA)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Lógica de execução compartilhada - IDÊNTICA para ambos os métodos
     */
    protected async executeAgent(
        agent:
            | AgentDefinition<TInput, TOutput, TContent>
            | AgentDefinition<unknown, unknown, unknown>,
        input: unknown,
        agentExecutionOptions?: AgentExecutionOptions,
    ): Promise<AgentExecutionResult<unknown>> {
        const startTime = Date.now();
        const executionId = IdGenerator.executionId();
        const { correlationId } = agentExecutionOptions || {};

        // ✅ SIMPLIFICADO: Criar contexto
        const context = await this.createAgentContext(
            agent.name,
            executionId,
            agentExecutionOptions,
        );

        // ✅ SIMPLIFICADO: Track execution start
        await this.trackExecutionStart(
            context,
            executionId,
            startTime,
            correlationId,
        );

        await this.addConversationEntry(context, input, agent.name);

        try {
            // ✅ SIMPLIFICADO: Processar thinking
            const result = await this.processAgentThinking(
                agent,
                input,
                context,
            );
            const duration = Date.now() - startTime;

            await this.markExecutionCompleted(
                executionId,
                context,
                duration,
                result,
                correlationId,
            );

            await this.updateConversationEntry(
                context,
                input,
                result.output,
                agent.name,
                { correlationId, executionId, success: true },
            );

            return this.buildExecutionResult(
                result,
                correlationId,
                context.sessionId,
                executionId,
                duration,
                agent.name,
            );
        } catch (error) {
            this.markExecutionFailed(executionId);
            throw error;
        }
    }

    // ✅ NOVOS MÉTODOS PRIVADOS SIMPLES
    private async trackExecutionStart(
        context: AgentContext,
        executionId: string,
        startTime: number,
        correlationId?: string,
    ): Promise<void> {
        await context.track.plannerStep({
            type: 'execution_start',
            executionId,
            startTime,
            status: 'running',
            agentName: context.agentName,
            correlationId,
        });
    }

    private async addConversationEntry(
        context: AgentContext,
        input: unknown,
        agentName: string,
    ): Promise<void> {
        if (!context.sessionId) {
            return;
        }

        await sessionService.addConversationEntry(
            context.sessionId,
            input,
            null,
            agentName,
        );

        await context.executionRuntime?.addContextValue({
            type: 'session',
            key: 'conversationEntry',
            value: {
                sessionId: context.sessionId,
                input,
                agentName,
                timestamp: Date.now(),
            },
            metadata: {
                source: 'agent-core',
                action: 'conversation-start',
                sessionId: context.sessionId,
            },
        });
    }

    private async markExecutionCompleted(
        executionId: string,
        context: AgentContext,
        duration: number,
        result: {
            output: unknown;
            reasoning: string;
            iterations: number;
            toolsUsed: number;
            events: AnyEvent[];
        },
        correlationId?: string,
    ): Promise<void> {
        const execution = this.activeExecutions.get(executionId);
        if (execution) {
            execution.status = 'completed';
        }

        if (context.executionRuntime) {
            await context.executionRuntime.addContextValue({
                type: 'execution',
                key: 'completion',
                value: {
                    executionId,
                    duration,
                    iterations: result.iterations,
                    toolsUsed: result.toolsUsed,
                    success: true,
                    status: 'completed',
                    timestamp: Date.now(),
                },
                metadata: {
                    source: 'agent-core',
                    action: 'execution_completed',
                    correlationId,
                    agentName: context.agentName,
                },
            });
        }
    }

    private async updateConversationEntry(
        context: AgentContext,
        input: unknown,
        output: unknown,
        agentName: string,
        metadata: {
            correlationId?: string;
            executionId: string;
            success: boolean;
        },
    ): Promise<void> {
        if (!context.sessionId) {
            return;
        }

        await sessionService.addConversationEntry(
            context.sessionId,
            input,
            output,
            agentName,
            metadata,
        );
    }

    private buildExecutionResult(
        result: {
            output: unknown;
            reasoning: string;
            iterations: number;
            toolsUsed: number;
            events: AnyEvent[];
        },
        correlationId?: string,
        sessionId?: string,
        executionId?: string,
        duration?: number,
        agentName?: string,
    ): AgentExecutionResult<unknown> & { timeline?: unknown } {
        return {
            success: true,
            data: result.output,
            reasoning: result.reasoning,
            correlationId,
            sessionId,
            status: 'COMPLETED',
            executionId,
            duration: duration || 0,
            metadata: {
                agentName: agentName || 'unknown',
                iterations: result.iterations,
                toolsUsed: result.toolsUsed,
                thinkingTime: duration || 0,
                timeline: null, // Timeline removida
            },
        };
    }

    private markExecutionFailed(executionId: string): void {
        const execution = this.activeExecutions.get(executionId);
        if (execution) {
            execution.status = 'failed';
        }
    }

    protected async processAgentThinking(
        agent:
            | AgentDefinition<TInput, TOutput, TContent>
            | AgentDefinition<unknown, unknown, unknown>,
        input: unknown,
        context: AgentContext,
    ): Promise<{
        output: unknown;
        reasoning: string;
        iterations: number;
        toolsUsed: number;
        events: AnyEvent[];
    }> {
        if (!this.planner || !this.llmAdapter) {
            throw createAgentError(
                `Agent '${agent.name}' requires both planner and LLM adapter`,
                {
                    severity: 'high',
                    domain: 'infrastructure',
                    userImpact: 'broken',
                    retryable: false,
                    recoverable: true,
                    context: {
                        agentName: agent.name,
                        hasPlanner: !!this.planner,
                        hasLLMAdapter: !!this.llmAdapter,
                    },
                    userMessage:
                        'This agent requires both a planner and AI language model to function.',
                    recoveryHints: [
                        'Provide an LLMAdapter when creating the agent',
                        'Ensure planner is properly initialized',
                        'Check that your LLM provider is properly configured',
                    ],
                },
            );
        }

        const result = await this.executeThinkActObserve(input, context);

        return {
            output: result,
            reasoning: 'Think→Act→Observe completed',
            iterations: 1,
            toolsUsed: 0,
            events: [],
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 🎯 ADVANCED COORDINATION METHODS
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Coordenar execução de múltiplos agentes (AVANÇADO)
     */
    // async coordinate(
    //     input: unknown,
    //     strategy: AgentCoordinationStrategy,
    //     criteria: AgentSelectionCriteria,
    //     context: Partial<MultiAgentContext> = {},
    // ): Promise<MultiAgentResult> {
    //     if (!this.config.enableAdvancedCoordination) {
    //         throw new EngineError(
    //             'AGENT_ERROR',
    //             'Advanced coordination is not enabled',
    //         );
    //     }

    //     const coordinationId = IdGenerator.executionId();
    //     const startTime = Date.now();

    //     this.logger.info('Starting multi-agent coordination', {
    //         strategy,
    //         coordinationId,
    //         criteria,
    //     });

    //     // Criar contexto completo
    //     const fullContext: MultiAgentContext = {
    //         coordinationId,
    //         strategy,
    //         criteria,
    //         availableAgents: this.getAvailableAgents(criteria),
    //         startTime,
    //         correlationId: context.correlationId,
    //         sessionId: context.sessionId,
    //         metadata: context.metadata || {},
    //     };

    //     if (fullContext.availableAgents.length === 0) {
    //         return {
    //             status: 'failed',
    //             result: null,
    //             error: 'No agents available for coordination',
    //             coordinationId,
    //             duration: Date.now() - startTime,
    //             strategy,
    //             participatingAgents: [],
    //         };
    //     }

    //     let result: MultiAgentResult;

    //     try {
    //         // Executar estratégia de coordenação
    //         switch (strategy) {
    //             case 'sequential':
    //                 result = await this.executeSequential(input, fullContext);
    //                 break;
    //             case 'parallel':
    //                 result = await this.executeParallel(input, fullContext);
    //                 break;
    //             case 'competition':
    //                 result = await this.executeCompetition(input, fullContext);
    //                 break;
    //             case 'collaboration':
    //                 result = await this.executeCollaboration(
    //                     input,
    //                     fullContext,
    //                 );
    //                 break;
    //             case 'delegation':
    //                 result = await this.executeDelegation(input, fullContext);
    //                 break;
    //             case 'voting':
    //                 result = await this.executeVoting(input, fullContext);
    //                 break;
    //             default:
    //                 throw new EngineError(
    //                     'AGENT_ERROR',
    //                     `Unknown coordination strategy: ${strategy}`,
    //                 );
    //         }

    //         this.logger.info('Multi-agent coordination completed', {
    //             strategy,
    //             coordinationId,
    //             status: result.status,
    //             duration: result.duration,
    //             participatingAgents: result.participatingAgents.length,
    //         });

    //         return result;
    //     } catch (error) {
    //         this.logger.error(
    //             'Multi-agent coordination failed',
    //             error as Error,
    //             {
    //                 strategy,
    //                 coordinationId,
    //             },
    //         );

    //         return {
    //             status: 'failed',
    //             result: null,
    //             error: error instanceof Error ? error.message : 'Unknown error',
    //             coordinationId,
    //             duration: Date.now() - startTime,
    //             strategy,
    //             participatingAgents: fullContext.availableAgents,
    //         };
    //     }
    // }

    // ──────────────────────────────────────────────────────────────────────────
    // 💬 MESSAGE HANDLING (AVANÇADO)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Enviar mensagem entre agentes (AVANÇADO)
     */
    async sendMessage(
        message: Omit<AgentMessage, 'id' | 'timestamp'>,
        options: {
            priority?: 'low' | 'normal' | 'high';
            maxAttempts?: number;
            requireAcknowledgment?: boolean;
        } = {},
    ): Promise<string> {
        if (!this.config.enableMessaging) {
            throw new EngineError('AGENT_ERROR', 'Messaging is not enabled');
        }

        const trackedMessage: TrackedMessage = {
            ...message,
            id: IdGenerator.executionId(),
            timestamp: Date.now(),
            status: 'pending',
            deliveryAttempts: 0,
            maxAttempts:
                options.maxAttempts ?? this.config.defaultMaxAttempts ?? 3,
            createdAt: Date.now(),
        };

        this.messages.set(trackedMessage.id, trackedMessage);
        this.messageHistory.push(trackedMessage);

        // Adicionar à fila de entrega
        this.deliveryQueue.push(trackedMessage);

        this.logger.debug('Message queued for delivery', {
            messageId: trackedMessage.id,
            fromAgent: message.fromAgent,
            toAgent: message.toAgent,
            type: message.type,
        });

        // this.emit('messageQueued', trackedMessage);

        return trackedMessage.id;
    }

    /**
     * Obter mensagens de um agente (AVANÇADO)
     */
    getMessages(
        agentId: string,
        markAsRead: boolean = false,
    ): TrackedMessage[] {
        if (!this.config.enableMessaging) {
            return [];
        }

        const inbox = this.agentInboxes.get(agentId);
        if (!inbox) {
            return [];
        }

        const messages = [...inbox];

        if (markAsRead) {
            // Marcar mensagens como lidas (implementação simplificada)
            inbox.forEach((message) => {
                if (message.status === 'delivered') {
                    message.status = 'acknowledged';
                    message.acknowledgedAt = Date.now();
                }
            });
        }

        return messages;
    }

    /**
     * Confirmar recebimento de mensagem (AVANÇADO)
     */
    acknowledgeMessage(messageId: string, agentId: string): boolean {
        if (!this.config.enableMessaging) {
            return false;
        }

        const message = this.messages.get(messageId);
        if (!message || message.toAgent !== agentId) {
            return false;
        }

        message.status = 'acknowledged';
        message.acknowledgedAt = Date.now();

        this.logger.debug('Message acknowledged', {
            messageId,
            agentId,
        });

        //this.emit('messageAcknowledged', message);

        return true;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 🔄 DELEGATION HANDLING (AVANÇADO)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Lidar com delegação entre agentes (AVANÇADO)
     */
    // async handleDelegation(
    //     fromAgent: string,
    //     targetAgent: string,
    //     input: unknown,
    //     options: {
    //         reason?: string;
    //         timeout?: number;
    //         priority?: 'low' | 'medium' | 'high' | 'critical';
    //         correlationId?: string;
    //     } = {},
    // ): Promise<DelegationResult> {
    //     if (!this.config.enableDelegation) {
    //         throw new EngineError('AGENT_ERROR', 'Delegation is not enabled');
    //     }

    //     const delegationId = IdGenerator.executionId();
    //     const startTime = Date.now();

    //     this.logger.info('Handling agent delegation', {
    //         fromAgent,
    //         targetAgent,
    //         delegationId,
    //         reason: options.reason,
    //     });

    //     // Verificar se o agente destino existe
    //     const targetAgentDefinition = this.agents.get(targetAgent);
    //     if (!targetAgentDefinition) {
    //         return {
    //             success: false,
    //             error: `Target agent not found: ${targetAgent}`,
    //             duration: Date.now() - startTime,
    //             targetAgent,
    //             fromAgent,
    //             correlationId: options.correlationId || '',
    //         };
    //     }

    //     // Verificar profundidade da cadeia
    //     const chainLevel = this.calculateChainLevel(fromAgent);
    //     if (chainLevel >= (this.config.maxChainDepth || 5)) {
    //         return {
    //             success: false,
    //             error: `Delegation chain too deep: ${chainLevel}`,
    //             duration: Date.now() - startTime,
    //             targetAgent,
    //             fromAgent,
    //             correlationId: options.correlationId || '',
    //         };
    //     }

    //     // Criar contexto de delegação
    //     const delegationContext: DelegationContext = {
    //         fromAgent,
    //         targetAgent,
    //         reason: options.reason,
    //         timeout: options.timeout || 30000,
    //         priority: options.priority || 'medium',
    //         chainLevel,
    //         originalAgent: this.getOriginalAgent(fromAgent),
    //         correlationId: options.correlationId || IdGenerator.executionId(),
    //         executionId: delegationId,
    //         startTime,
    //     };

    //     this.activeDelegations.set(delegationId, delegationContext);

    //     try {
    //         // Executar delegação
    //         const result = await this.executeAgent(
    //             targetAgentDefinition,
    //             input,
    //             delegationContext.correlationId,
    //             undefined,
    //             {
    //                 timeout: delegationContext.timeout,
    //                 thread: {
    //                     id: delegationContext.correlationId,
    //                     metadata: {
    //                         description: `Delegation from ${delegationContext.fromAgent} to ${delegationContext.targetAgent}`,
    //                         type: 'delegation',
    //                     },
    //                 },
    //             },
    //         );

    //         const duration = Date.now() - startTime;

    //         this.logger.info('Delegation completed successfully', {
    //             fromAgent,
    //             targetAgent,
    //             delegationId,
    //             duration,
    //         });

    //         return {
    //             success: true,
    //             result: result.output,
    //             duration,
    //             targetAgent,
    //             fromAgent,
    //             correlationId: delegationContext.correlationId,
    //         };
    //     } catch (error) {
    //         const duration = Date.now() - startTime;

    //         this.logger.error('Delegation failed', error as Error, {
    //             fromAgent,
    //             targetAgent,
    //             delegationId,
    //             duration,
    //         });

    //         return {
    //             success: false,
    //             error: error instanceof Error ? error.message : 'Unknown error',
    //             duration,
    //             targetAgent,
    //             fromAgent,
    //             correlationId: delegationContext.correlationId,
    //         };
    //     } finally {
    //         this.activeDelegations.delete(delegationId);
    //     }
    // }

    // ──────────────────────────────────────────────────────────────────────────
    // 🔧 UTILITY METHODS (COMPARTILHADAS)
    // ──────────────────────────────────────────────────────────────────────────

    protected isAgentDefinition(
        obj: unknown,
    ): obj is AgentDefinition<TInput, TOutput, TContent> {
        return (
            typeof obj === 'object' &&
            obj !== null &&
            'name' in obj &&
            'think' in obj
        );
    }

    protected async initialize(): Promise<void> {
        this.logger.info('Initializing AgentCore');

        // Initialize local KernelHandler if it exists (isolated mode)
        if (this.kernelHandler && this.config.tenantId === 'isolated') {
            try {
                await this.kernelHandler.initialize();
                this.logger.info(
                    'Isolated KernelHandler initialized successfully',
                );
            } catch (error) {
                this.logger.error(
                    'Failed to initialize isolated KernelHandler',
                    error as Error,
                );
                // Don't throw here, just log the error
            }
        }

        this.logger.info('AgentCore initialized');
    }

    /**
     * Registrar um agente (BÁSICO + AVANÇADO)
     */
    protected registerAgent(
        agent: AgentDefinition<unknown, unknown, unknown>,
        capabilities?: AgentCapability,
    ): void {
        this.agents.set(agent.name, agent);

        // Registrar capabilities se fornecidas
        if (capabilities && this.config.enableAdvancedCoordination) {
            this.agentCapabilities.set(agent.name, capabilities);
        }

        // Inicializar inbox do agente se messaging estiver habilitado
        if (this.config.enableMessaging && !this.agentInboxes.has(agent.name)) {
            this.agentInboxes.set(agent.name, []);
        }

        this.logger.info('Agent registered', {
            agentName: agent.name,
            totalAgents: this.agents.size,
            hasCapabilities: !!capabilities,
            hasInbox: this.config.enableMessaging,
        });
    }

    protected getActionType(action: AgentAction<unknown>): string {
        // Check for explicit type property first (for new parallel tool actions)
        if ('type' in action) {
            return action.type as string;
        }

        // Legacy action type detection
        if ('toolName' in action) {
            return 'tool_call';
        }
        if ('question' in action) {
            return 'need_more_info';
        }
        if ('agentName' in action) {
            return 'delegate_to_agent';
        }
        return 'final_answer';
    }

    protected async createAgentContext(
        agentName: string,
        executionId: string,
        agentExecutionOptions?: AgentExecutionOptions,
    ): Promise<AgentContext> {
        const config: AgentExecutionOptions = {
            agentName,
            thread: agentExecutionOptions?.thread || {
                id: executionId,
                metadata: { description: 'Default agent thread' },
            },
            ...agentExecutionOptions,
            tenantId: agentExecutionOptions?.tenantId || this.config.tenantId,
        };

        // 1. Create base context via ContextBuilder
        const context =
            await ContextBuilder.getInstance().createAgentContext(config);

        // 2. ✅ ELEGANT: Enrich context with AgentDefinition data
        if (this.singleAgentDefinition?.identity) {
            context.agentIdentity = this.singleAgentDefinition.identity;
        }

        return context;
    }

    /**
     * Extract tools from action for processing
     */
    private extractToolsFromAction(action: {
        type?: string;
        tools?: ToolCall[];
        content?: unknown;
    }): ToolCall[] {
        // Direct structure: { type: 'parallel_tools', tools: [...] }
        if (action.tools && Array.isArray(action.tools)) {
            return action.tools;
        }

        // Content structure: { type: 'parallel_tools', content: { tools: [...] } }
        if (
            action.content &&
            typeof action.content === 'object' &&
            action.content !== null &&
            'tools' in action.content &&
            Array.isArray((action.content as { tools: ToolCall[] }).tools)
        ) {
            return (action.content as { tools: ToolCall[] }).tools;
        }

        return [];
    }

    /**
     * Process parallel tools action
     */
    protected async processParallelToolsAction(
        action: ParallelToolsAction,
        context: AgentContext,
    ): Promise<Array<{ toolName: string; result?: unknown; error?: string }>> {
        const { correlationId } = context.agentExecutionOptions || {};

        if (!this.toolEngine) {
            throw new EngineError('AGENT_ERROR', 'Tool engine not available');
        }

        const tools = this.extractToolsFromAction(action);

        this.logger.info('Processing parallel tools action', {
            agentName: context.agentName,
            toolCount: tools.length,
            concurrency: action.concurrency,
            correlationId,
        });

        // Emit parallel tools start event
        if (this.kernelHandler) {
            // ✅ Use kernelHandler.emitAsync() instead of accessing runtime directly
            if (this.kernelHandler.emitAsync) {
                const emitResult = await this.kernelHandler.emitAsync(
                    'agent.parallel.tools.start',
                    {
                        agentName: context.agentName,
                        toolNames: tools.map((t) => t.toolName),
                        correlationId,
                        sessionId: context.sessionId,
                    },
                    {
                        deliveryGuarantee: 'at-least-once',
                        correlationId,
                    },
                );

                if (!emitResult.success) {
                    this.logger.warn(
                        'Failed to emit agent.parallel.tools.start',
                        {
                            error: emitResult.error,
                            correlationId,
                        },
                    );
                }
            }
        }

        // Create properly structured action for ToolEngine
        const toolEngineAction: ParallelToolsAction = {
            ...action,
            tools: tools,
        };

        const results = this.kernelHandler
            ? await this.kernelHandler.request(
                  'tool.parallel.execute.request',
                  'tool.parallel.execute.response',
                  {
                      tools: toolEngineAction.tools,
                      metadata: {
                          agentName: context.agentName,
                          sessionId: context.sessionId,
                          correlationId,
                      },
                  },
                  { correlationId },
              )
            : await this.toolEngine.executeParallelTools(toolEngineAction);

        // Emit completion event
        if (this.kernelHandler) {
            // ✅ Use kernelHandler.emitAsync() instead of accessing runtime directly
            if (this.kernelHandler.emitAsync) {
                const emitResult = await this.kernelHandler.emitAsync(
                    'agent.parallel.tools.completed',
                    {
                        agentName: context.agentName,
                        results,
                        correlationId,
                        sessionId: context.sessionId,
                    },
                    {
                        deliveryGuarantee: 'at-least-once',
                        correlationId,
                    },
                );

                if (!emitResult.success) {
                    this.logger.warn(
                        'Failed to emit agent.parallel.tools.completed',
                        {
                            error: emitResult.error,
                            correlationId,
                        },
                    );
                }
            }
        }

        return results as Array<{
            toolName: string;
            result?: unknown;
            error?: string;
        }>;
    }

    /**
     * Process sequential tools action
     */
    protected async processSequentialToolsAction(
        action: SequentialToolsAction,
        context: AgentContext,
    ): Promise<Array<{ toolName: string; result?: unknown; error?: string }>> {
        const { correlationId } = context.agentExecutionOptions || {};

        if (!this.toolEngine) {
            throw new EngineError('AGENT_ERROR', 'Tool engine not available');
        }

        const tools = this.extractToolsFromAction(action);

        this.logger.info('Processing sequential tools action', {
            agentName: context.agentName,
            toolCount: tools.length,
            stopOnError: action.stopOnError,
            correlationId,
        });

        // Create properly structured action for ToolEngine
        const toolEngineAction: SequentialToolsAction = {
            ...action,
            tools: tools,
        };

        const results = this.kernelHandler
            ? await this.kernelHandler.request(
                  'tool.sequential.execute.request',
                  'tool.sequential.execute.response',
                  {
                      tools: toolEngineAction.tools,
                      stopOnError: toolEngineAction.stopOnError,
                      metadata: {
                          agentName: context.agentName,
                          sessionId: context.sessionId,
                          correlationId,
                      },
                  },
                  { correlationId },
              )
            : await this.toolEngine.executeSequentialTools(toolEngineAction);
        return results as Array<{
            toolName: string;
            result?: unknown;
            error?: string;
        }>;
    }

    /**
     * Process conditional tools action
     */
    protected async processConditionalToolsAction(
        action: ConditionalToolsAction,
        context: AgentContext,
    ): Promise<Array<{ toolName: string; result?: unknown; error?: string }>> {
        const { correlationId } = context.agentExecutionOptions || {};

        if (!this.toolEngine) {
            throw new EngineError('AGENT_ERROR', 'Tool engine not available');
        }

        const tools = this.extractToolsFromAction(action);

        this.logger.info('Processing conditional tools action', {
            agentName: context.agentName,
            toolCount: tools.length,
            hasConditions: Object.keys(action.conditions || {}).length > 0,
            correlationId,
        });

        // Create properly structured action for ToolEngine
        const toolEngineAction: ConditionalToolsAction = {
            ...action,
            tools: tools,
        };

        const results = this.kernelHandler
            ? await this.kernelHandler.request(
                  'tool.conditional.execute.request',
                  'tool.conditional.execute.response',
                  {
                      tools: toolEngineAction.tools,
                      conditions: toolEngineAction.conditions,
                      metadata: {
                          agentName: context.agentName,
                          sessionId: context.sessionId,
                          correlationId,
                      },
                  },
                  { correlationId },
              )
            : await this.toolEngine.executeConditionalTools(toolEngineAction);
        return results as Array<{
            toolName: string;
            result?: unknown;
            error?: string;
        }>;
    }

    /**
     * Process mixed tools action (adaptive strategy)
     */
    protected async processMixedToolsAction(
        action: MixedToolsAction,
        context: AgentContext,
    ): Promise<Array<{ toolName: string; result?: unknown; error?: string }>> {
        const { correlationId } = context.agentExecutionOptions || {};

        if (!this.toolEngine) {
            throw new EngineError('AGENT_ERROR', 'Tool engine not available');
        }

        const tools = this.extractToolsFromAction(action);

        this.logger.info('Processing mixed tools action', {
            agentName: context.agentName,
            strategy: action.strategy,
            toolCount: tools.length,
            correlationId,
        });

        // Convert mixed action to specific action based on strategy
        switch (action.strategy) {
            case 'parallel': {
                const parallelAction: ParallelToolsAction = {
                    type: 'parallel_tools',
                    tools: tools,
                    concurrency: action.config?.concurrency,
                    timeout: action.config?.timeout,
                    failFast: action.config?.failFast,
                    reasoning: action.reasoning,
                };
                return this.kernelHandler
                    ? await this.kernelHandler.request(
                          'tool.parallel.execute.request',
                          'tool.parallel.execute.response',
                          {
                              tools: parallelAction.tools,
                              concurrency: parallelAction.concurrency,
                              timeout: parallelAction.timeout,
                              failFast: parallelAction.failFast,
                              metadata: {
                                  agentName: context.agentName,
                                  sessionId: context.sessionId,
                                  correlationId,
                              },
                          },
                          { correlationId },
                      )
                    : await this.toolEngine.executeParallelTools(
                          parallelAction,
                      );
            }
            case 'sequential': {
                const sequentialAction: SequentialToolsAction = {
                    type: 'sequential_tools',
                    tools: tools,
                    timeout: action.config?.timeout,
                    reasoning: action.reasoning,
                };
                return this.kernelHandler
                    ? await this.kernelHandler.request(
                          'tool.sequential.execute.request',
                          'tool.sequential.execute.response',
                          {
                              tools: sequentialAction.tools,
                              timeout: sequentialAction.timeout,
                              metadata: {
                                  agentName: context.agentName,
                                  sessionId: context.sessionId,
                                  correlationId,
                              },
                          },
                          { correlationId },
                      )
                    : await this.toolEngine.executeSequentialTools(
                          sequentialAction,
                      );
            }
            case 'conditional': {
                const conditionalAction: ConditionalToolsAction = {
                    type: 'conditional_tools',
                    tools: tools,
                    conditions: action.config?.conditions || {},
                    reasoning: action.reasoning,
                };
                return this.kernelHandler
                    ? await this.kernelHandler.request(
                          'tool.conditional.execute.request',
                          'tool.conditional.execute.response',
                          {
                              tools: conditionalAction.tools,
                              conditions: conditionalAction.conditions,
                              metadata: {
                                  agentName: context.agentName,
                                  sessionId: context.sessionId,
                                  correlationId,
                              },
                          },
                          { correlationId },
                      )
                    : await this.toolEngine.executeConditionalTools(
                          conditionalAction,
                      );
            }
            case 'adaptive':
            default:
                // For adaptive strategy, analyze tools and choose best approach
                return await this.executeAdaptiveToolStrategy(action, context);
        }
    }

    /**
     * Execute adaptive tool strategy (intelligence-based decision)
     */
    protected async executeAdaptiveToolStrategy(
        action: MixedToolsAction,
        context: AgentContext,
    ): Promise<Array<{ toolName: string; result?: unknown; error?: string }>> {
        const { correlationId } = context.agentExecutionOptions || {};

        const tools = this.extractToolsFromAction(action);

        // Simple heuristic for now - can be enhanced with AI/ML in the future
        const toolCount = tools.length;

        if (toolCount === 1) {
            // Single tool - execute directly
            const tool = tools[0];
            if (!tool) {
                return [{ toolName: 'unknown', error: 'No tool available' }];
            }

            try {
                const toolStartTime = Date.now();
                const result = this.kernelHandler
                    ? await this.kernelHandler.requestToolExecution(
                          tool.toolName,
                          tool.arguments,
                          { correlationId },
                      )
                    : await this.toolEngine!.executeCall(
                          tool.toolName as ToolId,
                          tool.arguments,
                      );
                const duration = Date.now() - toolStartTime;

                const currentStepId =
                    context.stepExecution?.getCurrentStep()?.stepId;
                if (currentStepId && context.stepExecution) {
                    context.stepExecution.addToolCall(
                        currentStepId,
                        tool.toolName,
                        tool.arguments,
                        result,
                        duration,
                    );
                }
                await context.track?.toolUsage?.(
                    tool.toolName,
                    tool.arguments,
                    result,
                    true,
                );

                return [{ toolName: tool.toolName, result }];
            } catch (error) {
                await context.track?.toolUsage?.(
                    tool.toolName,
                    tool.arguments,
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    false,
                );
                const errorMessage =
                    error instanceof Error ? error.message : String(error);
                return [{ toolName: tool.toolName, error: errorMessage }];
            }
        } else if (toolCount <= 3) {
            // Small number of tools - execute in parallel
            const parallelAction: ParallelToolsAction = {
                type: 'parallel_tools',
                tools: tools,
                concurrency: toolCount,
                reasoning: `Adaptive strategy: parallel execution for ${toolCount} tools`,
            };
            const parallelResults = this.kernelHandler
                ? await this.kernelHandler.request(
                      'tool.parallel.execute.request',
                      'tool.parallel.execute.response',
                      {
                          tools: parallelAction.tools,
                          concurrency: parallelAction.concurrency,
                          metadata: {
                              agentName: context.agentName,
                              sessionId: context.sessionId,
                              correlationId,
                          },
                      },
                      { correlationId },
                  )
                : await this.toolEngine!.executeParallelTools(parallelAction);

            try {
                for (const r of parallelResults as Array<{
                    toolName: string;
                    result?: unknown;
                    error?: string;
                }>) {
                    const input = parallelAction.tools.find(
                        (t) => t.toolName === r.toolName,
                    )?.arguments;
                    const currentStepId =
                        context.stepExecution?.getCurrentStep()?.stepId;
                    if (currentStepId && context.stepExecution) {
                        context.stepExecution.addToolCall(
                            currentStepId,
                            r.toolName,
                            input,
                            r.result ?? { error: r.error },
                            0,
                        );
                    }
                    await context.track?.toolUsage?.(
                        r.toolName,
                        input,
                        r.result ?? { error: r.error },
                        !r.error,
                    );
                }
            } catch {
                // best-effort
            }

            return parallelResults as Array<{
                toolName: string;
                result?: unknown;
                error?: string;
            }>;
        } else {
            // Large number of tools - execute sequentially to avoid resource issues
            const sequentialAction: SequentialToolsAction = {
                type: 'sequential_tools',
                tools: tools,
                reasoning: `Adaptive strategy: sequential execution for ${toolCount} tools`,
            };
            const sequentialResults = this.kernelHandler
                ? await this.kernelHandler.request(
                      'tool.sequential.execute.request',
                      'tool.sequential.execute.response',
                      {
                          tools: sequentialAction.tools,
                          metadata: {
                              agentName: context.agentName,
                              sessionId: context.sessionId,
                              correlationId,
                          },
                      },
                      { correlationId },
                  )
                : await this.toolEngine!.executeSequentialTools(
                      sequentialAction,
                  );

            try {
                for (const r of sequentialResults as Array<{
                    toolName: string;
                    result?: unknown;
                    error?: string;
                }>) {
                    const input = sequentialAction.tools.find(
                        (t) => t.toolName === r.toolName,
                    )?.arguments;
                    const currentStepId =
                        context.stepExecution?.getCurrentStep()?.stepId;
                    if (currentStepId && context.stepExecution) {
                        context.stepExecution.addToolCall(
                            currentStepId,
                            r.toolName,
                            input,
                            r.result ?? { error: r.error },
                            0,
                        );
                    }
                    await context.track?.toolUsage?.(
                        r.toolName,
                        input,
                        r.result ?? { error: r.error },
                        !r.error,
                    );
                }
            } catch {
                // best-effort
            }

            return sequentialResults as Array<{
                toolName: string;
                result?: unknown;
                error?: string;
            }>;
        }
    }

    /**
     * Process dependency tools action (explicit dependency resolution)
     */
    protected async processDependencyToolsAction(
        action: DependencyToolsAction,
        context: AgentContext,
    ): Promise<Array<{ toolName: string; result?: unknown; error?: string }>> {
        const { correlationId } = context.agentExecutionOptions || {};

        if (!this.toolEngine) {
            throw new EngineError('AGENT_ERROR', 'Tool engine not available');
        }

        const tools = this.extractToolsFromAction(action);

        this.logger.info('Processing dependency tools action', {
            agentName: context.agentName,
            toolCount: tools.length,
            dependencyCount: action.dependencies.length,
            correlationId,
        });

        // Use the ToolEngine's dependency-aware execution
        const results = this.kernelHandler
            ? await this.kernelHandler.request(
                  'tool.dependency.execute.request',
                  'tool.dependency.execute.response',
                  {
                      tools,
                      dependencies: action.dependencies,
                      config: {
                          maxConcurrency: action.config?.maxConcurrency || 5,
                          timeout: action.config?.timeout || 60000,
                          failFast: action.config?.failFast || false,
                      },
                      metadata: {
                          agentName: context.agentName,
                          sessionId: context.sessionId,
                          correlationId,
                      },
                  },
                  { correlationId },
              )
            : await this.toolEngine.executeWithDependencies(
                  tools,
                  action.dependencies,
                  {
                      maxConcurrency: action.config?.maxConcurrency || 5,
                      timeout: action.config?.timeout || 60000,
                      failFast: action.config?.failFast || false,
                  },
              );

        try {
            for (const r of results as Array<{
                toolName: string;
                result?: unknown;
                error?: string;
            }>) {
                const input = tools.find(
                    (t) => t.toolName === r.toolName,
                )?.arguments;
                const currentStepId =
                    context.stepExecution?.getCurrentStep()?.stepId;
                if (currentStepId && context.stepExecution) {
                    context.stepExecution.addToolCall(
                        currentStepId,
                        r.toolName,
                        input,
                        r.result ?? { error: r.error },
                        0,
                    );
                }
                await context.track?.toolUsage?.(
                    r.toolName,
                    input,
                    r.result ?? { error: r.error },
                    !r.error,
                );
            }
        } catch {
            // best-effort
        }

        return results as Array<{
            toolName: string;
            result?: unknown;
            error?: string;
        }>;
    }

    /**
     * 🧠 Process tools with Router intelligence (NEW)
     * Intelligent tool execution using Router strategy analysis
     */
    protected async processToolsWithRouterIntelligence(
        tools: ToolCall[],
        context: AgentContext,
        correlationId: string,
        constraints?: {
            timeLimit?: number;
            resourceLimit?: number;
            qualityThreshold?: number;
        },
    ): Promise<Array<{ toolName: string; result?: unknown; error?: string }>> {
        if (!this.toolEngine) {
            throw new EngineError('AGENT_ERROR', 'Tool engine not available');
        }

        if (!this.router) {
            this.logger.warn(
                'Router not available, falling back to parallel execution',
            );
            return this.kernelHandler
                ? await this.kernelHandler.request(
                      'tool.parallel.execute.request',
                      'tool.parallel.execute.response',
                      {
                          tools,
                          concurrency: 5,
                          timeout: 60000,
                          failFast: false,
                          metadata: {
                              agentName: context.agentName,
                              sessionId: context.sessionId,
                              correlationId,
                          },
                      },
                      { correlationId },
                  )
                : await this.toolEngine.executeParallelTools({
                      type: 'parallel_tools',
                      tools,
                      concurrency: 5,
                      timeout: 60000,
                      failFast: false,
                  });
        }

        this.logger.info('Using Router intelligence for tool execution', {
            agentName: context.agentName,
            toolCount: tools.length,
            hasConstraints: !!constraints,
            correlationId,
        });

        // Prepare context for Router analysis
        const routerContext = {
            agentName: context.agentName,
            executionId: context.invocationId,
            tenantId: context.tenantId,
            ...constraints,
        };

        // Use ToolEngine's Router intelligence
        const results = this.kernelHandler
            ? await this.kernelHandler.request(
                  'tool.router.execute.request',
                  'tool.router.execute.response',
                  {
                      tools,
                      routerContext,
                      constraints,
                      metadata: {
                          agentName: context.agentName,
                          sessionId: context.sessionId,
                          correlationId,
                      },
                  },
                  { correlationId },
              )
            : await this.toolEngine.executeWithRouterStrategy(
                  tools,
                  routerContext,
                  constraints,
              );

        this.logger.info('Router-guided tool execution completed', {
            agentName: context.agentName,
            successCount: (
                results as Array<{
                    toolName: string;
                    result?: unknown;
                    error?: string;
                }>
            ).filter((r) => !r.error).length,
            errorCount: (
                results as Array<{
                    toolName: string;
                    result?: unknown;
                    error?: string;
                }>
            ).filter((r) => r.error).length,
            correlationId,
        });

        return results as Array<{
            toolName: string;
            result?: unknown;
            error?: string;
        }>;
    }

    /**
     * 🔄 Enhanced parallel tools processing with Router intelligence
     */
    protected async processParallelToolsActionEnhanced(
        action: ParallelToolsAction,
        context: AgentContext,
        correlationId: string,
    ): Promise<Array<{ toolName: string; result?: unknown; error?: string }>> {
        const tools = this.extractToolsFromAction(action);

        // Extract constraints from action config
        const constraints = {
            timeLimit: action.timeout,
            resourceLimit: action.concurrency
                ? 1 / action.concurrency
                : undefined,
            qualityThreshold: action.failFast ? 0.9 : 0.5, // High quality if failFast
        };

        return this.processToolsWithRouterIntelligence(
            tools,
            context,
            correlationId,
            constraints,
        );
    }

    /**
     * 🔄 Enhanced sequential tools processing with Router intelligence
     */
    protected async processSequentialToolsActionEnhanced(
        action: SequentialToolsAction,
        context: AgentContext,
        correlationId: string,
    ): Promise<Array<{ toolName: string; result?: unknown; error?: string }>> {
        const tools = this.extractToolsFromAction(action);

        const constraints = {
            timeLimit: action.timeout,
            qualityThreshold: action.stopOnError ? 0.8 : 0.5,
        };

        return this.processToolsWithRouterIntelligence(
            tools,
            context,
            correlationId,
            constraints,
        );
    }

    /**
     * 🔄 Enhanced mixed tools processing with Router intelligence
     */
    protected async processMixedToolsActionEnhanced(
        action: MixedToolsAction,
        context: AgentContext,
        correlationId: string,
    ): Promise<Array<{ toolName: string; result?: unknown; error?: string }>> {
        const tools = this.extractToolsFromAction(action);

        const constraints = {
            timeLimit: action.config?.timeout,
            resourceLimit: action.config?.concurrency
                ? 1 / action.config.concurrency
                : undefined,
            qualityThreshold: action.config?.failFast ? 0.9 : 0.6,
        };

        // For mixed tools, let Router intelligence choose the best strategy
        return this.processToolsWithRouterIntelligence(
            tools,
            context,
            correlationId,
            constraints,
        );
    }

    /**
     * 🧠 Process Plan with automatic dependency extraction and execution
     * Main entry point for Plan-based tool execution
     */
    protected async processPlanWithDependencies(
        plan: Plan,
        context: AgentContext,
        correlationId: string,
    ): Promise<Array<{ toolName: string; result?: unknown; error?: string }>> {
        if (!this.toolEngine) {
            throw new EngineError('AGENT_ERROR', 'Tool engine not available');
        }

        this.logger.info('Processing Plan with automatic dependencies', {
            agentName: context.agentName,
            planId: plan.id,
            stepCount: plan.steps.length,
            strategy: plan.strategy,
            correlationId,
        });

        // Check if plan has dependencies
        const hasDependencies = this.toolEngine.planHasDependencies(plan);

        if (!hasDependencies) {
            this.logger.debug(
                'Plan has no dependencies, using standard tool execution',
                {
                    planId: plan.id,
                    agentName: context.agentName,
                },
            );

            // Convert plan steps to tool calls for standard execution
            const toolCalls = this.convertPlanStepsToToolCalls(plan.steps);
            return this.processToolsWithRouterIntelligence(
                toolCalls,
                context,
                correlationId,
            );
        }

        // Use planner-aware execution
        this.logger.info(
            'Plan has dependencies, using planner-aware execution',
            {
                planId: plan.id,
                agentName: context.agentName,
                correlationId,
            },
        );

        const results = this.kernelHandler
            ? await this.kernelHandler.request(
                  'tool.planner.execute.request',
                  'tool.planner.execute.response',
                  {
                      plan,
                      metadata: {
                          agentName: context.agentName,
                          sessionId: context.sessionId,
                          correlationId,
                      },
                  },
                  { correlationId },
              )
            : await this.toolEngine.executeRespectingPlannerDependencies(plan);

        this.logger.info('Plan execution with dependencies completed', {
            planId: plan.id,
            agentName: context.agentName,
            successCount: (
                results as Array<{
                    toolName: string;
                    result?: unknown;
                    error?: string;
                }>
            ).filter((r) => !r.error).length,
            errorCount: (
                results as Array<{
                    toolName: string;
                    result?: unknown;
                    error?: string;
                }>
            ).filter((r) => r.error).length,
            correlationId,
        });

        return results as Array<{
            toolName: string;
            result?: unknown;
            error?: string;
        }>;
    }

    /**
     * 🔄 Process PlanSteps directly (alternative interface)
     */
    protected async processPlanSteps(
        planSteps: PlanStep[],
        context: AgentContext,
        correlationId: string,
        planId?: string,
    ): Promise<Array<{ toolName: string; result?: unknown; error?: string }>> {
        if (!this.toolEngine) {
            throw new EngineError('AGENT_ERROR', 'Tool engine not available');
        }

        this.logger.info('Processing PlanSteps with dependency analysis', {
            agentName: context.agentName,
            stepCount: planSteps.length,
            correlationId,
        });

        const results = this.kernelHandler
            ? await this.kernelHandler.request(
                  'tool.plan-steps.execute.request',
                  'tool.plan-steps.execute.response',
                  {
                      planSteps,
                      planId: planId || `${context.agentName}-${Date.now()}`,
                      metadata: {
                          agentName: context.agentName,
                          sessionId: context.sessionId,
                          correlationId,
                      },
                  },
                  { correlationId },
              )
            : await this.toolEngine.executePlanSteps(
                  planSteps,
                  planId || `${context.agentName}-${Date.now()}`,
              );

        return results as Array<{
            toolName: string;
            result?: unknown;
            error?: string;
        }>;
    }

    /**
     * 📊 Analyze plan dependencies without executing
     */
    protected analyzePlanDependencies(plan: Plan): {
        hasDependencies: boolean;
        analysis: ReturnType<
            typeof ToolEngine.prototype.analyzePlanDependencies
        > | null;
    } {
        if (!this.toolEngine) {
            return { hasDependencies: false, analysis: null };
        }

        const hasDependencies = this.toolEngine.planHasDependencies(plan);
        const analysis = hasDependencies
            ? this.toolEngine.analyzePlanDependencies(plan)
            : null;

        return { hasDependencies, analysis };
    }

    /**
     * 🔧 Convert PlanSteps to ToolCalls for standard execution
     */
    private convertPlanStepsToToolCalls(planSteps: PlanStep[]): ToolCall[] {
        return planSteps
            .filter((step) => step.tool) // Only steps with tools
            .map((step) => ({
                id: step.id,
                toolName: step.tool!,
                arguments: {
                    ...(step.params?.tool || {}),
                    stepId: step.id,
                    description: step.description,
                },
                timestamp: Date.now(),
                metadata: {
                    stepId: step.id,
                    critical: step.critical,
                    complexity: step.complexity,
                    estimatedDuration: step.estimatedDuration,
                    canRunInParallel: step.canRunInParallel,
                },
            }));
    }

    /**
     * 🎯 Smart plan execution: auto-choose best execution method
     */
    protected async executeToolsFromPlan(
        plan: Plan,
        context: AgentContext,
        correlationId: string,
    ): Promise<Array<{ toolName: string; result?: unknown; error?: string }>> {
        // Analyze plan to determine best execution approach
        const { hasDependencies, analysis } =
            this.analyzePlanDependencies(plan);

        this.logger.debug('Plan execution analysis', {
            planId: plan.id,
            hasDependencies,
            toolCount: analysis?.toolCount || 0,
            dependencyCount: analysis?.dependencyCount || 0,
            phaseCount: analysis?.executionPhases.phaseCount || 0,
            estimatedTime: analysis?.estimatedTime || 0,
            agentName: context.agentName,
        });

        // Use appropriate execution method
        if (hasDependencies) {
            return this.processPlanWithDependencies(
                plan,
                context,
                correlationId,
            );
        } else {
            // Use Router intelligence for plans without dependencies
            const toolCalls = this.convertPlanStepsToToolCalls(plan.steps);
            return this.processToolsWithRouterIntelligence(
                toolCalls,
                context,
                correlationId,
            );
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 📊 PUBLIC INTERFACE (COMPARTILHADA)
    // ──────────────────────────────────────────────────────────────────────────

    getDefinition(): AgentDefinition<TInput, TOutput, TContent> | undefined {
        return this.singleAgentDefinition;
    }

    setToolEngine(toolEngine: ToolEngine): void {
        this.toolEngine = toolEngine;

        // Configure ToolEngine in ContextBuilder
        ContextBuilder.getInstance().setToolEngine(toolEngine);

        // Inject KernelHandler if available
        if (this.kernelHandler) {
            toolEngine.setKernelHandler(this.kernelHandler);
        }

        this.logger.info('ToolEngine set for AgentCore', {
            toolCount: toolEngine.listTools().length,
            hasKernelHandler: !!this.kernelHandler,
        });
    }

    /**
     * Set KernelHandler (for dependency injection)
     */
    setKernelHandler(kernelHandler: MultiKernelHandler): void {
        this.kernelHandler = kernelHandler;

        // Also set KernelHandler for ToolEngine if available
        if (this.toolEngine && 'setKernelHandler' in this.toolEngine) {
            this.logger.info(
                '🔧 [AGENT] Setting KernelHandler for ToolEngine',
                {
                    toolEngineExists: !!this.toolEngine,
                    hasSetKernelHandler: 'setKernelHandler' in this.toolEngine,
                },
            );
            (this.toolEngine as ToolEngine).setKernelHandler(kernelHandler);
        } else {
            this.logger.warn(
                '🔧 [AGENT] ToolEngine not available for KernelHandler setup',
                {
                    toolEngineExists: !!this.toolEngine,
                    hasSetKernelHandler: this.toolEngine
                        ? 'setKernelHandler' in this.toolEngine
                        : false,
                },
            );
        }

        // ✅ ADD: Register event handlers for agent events
        this.registerAgentEventHandlers();

        this.logger.info('KernelHandler set for AgentCore');
    }

    /**
     * Register event handlers for agent events
     */
    private registerAgentEventHandlers(): void {
        if (!this.kernelHandler) {
            this.logger.warn('No KernelHandler available for event handlers');
            return;
        }

        this.logger.info('🔧 [AGENT] Registering agent event handlers', {
            agentName: this.config.agentName,
            trace: {
                source: 'agent-core',
                step: 'register-event-handlers',
                timestamp: Date.now(),
            },
        });

        // Register handler for agent.tool.error events
        this.kernelHandler.registerHandler(
            'agent.tool.error',
            async (event: AnyEvent) => {
                this.logger.info(
                    '🔧 [AGENT] Processing agent.tool.error event',
                    {
                        eventId: event.id,
                        eventType: event.type,
                        correlationId: event.metadata?.correlationId,
                        hasData: !!event.data,
                        dataKeys: event.data
                            ? Object.keys(event.data as Record<string, unknown>)
                            : [],
                        trace: {
                            source: 'agent-core',
                            step: 'process-agent-tool-error',
                            timestamp: Date.now(),
                        },
                    },
                );

                const { agentName, toolName, correlationId, error } =
                    event.data as {
                        agentName: string;
                        toolName: string;
                        correlationId: string;
                        error: string;
                    };

                // ✅ ADD: Log detalhado para debug
                this.logger.error(
                    '🤖 [AGENT] Tool execution failed',
                    (error as unknown) instanceof Error
                        ? (error as unknown as Error)
                        : new Error(String(error)),
                    {
                        agent: agentName,
                        toolName,
                        correlationId,
                        trace: {
                            source: 'agent-core',
                            step: 'tool-error-handler',
                            timestamp: Date.now(),
                        },
                    },
                );

                // ✅ ADD: Update context with error information
                // ✅ REMOVER: Usar stateManager do contexto quando disponível
                // if (this.stateManager) {
                //     await this.stateManager.set('main', 'lastToolError', {
                //         toolName,
                //         error,
                //         timestamp: Date.now(),
                //         correlationId,
                //     });
                // }

                // ✅ ADD: Emit error event for observability
                if (this.kernelHandler) {
                    await this.kernelHandler.emitAsync('agent.error', {
                        agent: agentName,
                        error:
                            (error as unknown) instanceof Error
                                ? (error as unknown as Error).message
                                : String(error),
                        correlationId,
                    });
                }
            },
        );

        this.logger.info('✅ [AGENT] Agent event handlers registered', {
            agentName: this.config.agentName,
            handlersRegistered: ['agent.tool.error'],
            trace: {
                source: 'agent-core',
                step: 'event-handlers-registered',
                timestamp: Date.now(),
            },
        });
    }

    /**
     * Set Router (for intelligent tool execution)
     */
    setRouter(router: Router): void {
        this.router = router;

        // Also set Router for ToolEngine if available
        if (this.toolEngine && 'setRouter' in this.toolEngine) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this.toolEngine as any).setRouter(router);
        }

        this.logger.info('Router set for AgentCore');
    }

    /**
     * Get KernelHandler (for dependency access)
     */
    getKernelHandler(): MultiKernelHandler | null {
        return this.kernelHandler || null;
    }

    /**
     * Get KernelHandler status
     */
    hasKernelHandler(): boolean {
        return !!this.kernelHandler;
    }

    getAgent(
        agentName: string,
    ): AgentDefinition<unknown, unknown, unknown> | undefined {
        return this.agents.get(agentName);
    }

    listAgents(): string[] {
        return Array.from(this.agents.keys());
    }

    removeAgent(agentName: string): boolean {
        const existed = this.agents.delete(agentName);
        if (existed) {
            this.agentCapabilities.delete(agentName);
            this.agentInboxes.delete(agentName);
            this.logger.info('Agent removed', { agentName });
        }
        return existed;
    }

    getStatus(): {
        initialized: boolean;
        mode: 'single' | 'multi';
        agentCount: number;
        agents: string[];
        eventCount: number;
        activeExecutions: number;
        // Advanced features
        advancedCoordination?: boolean;
        messaging?: boolean;
        totalMessages?: number;
        pendingMessages?: number;
        activeDelegations?: number;
    } {
        const mode: 'single' | 'multi' = this.singleAgentDefinition
            ? 'single'
            : 'multi';
        const baseStatus = {
            initialized: true,
            mode,
            agentCount: this.agents.size,
            agents: this.listAgents(),
            eventCount: this.eventHistory.length,
            activeExecutions: this.activeExecutions.size,
        };

        if (this.config.enableAdvancedCoordination) {
            return {
                ...baseStatus,
                advancedCoordination: true,
                messaging: this.config.enableMessaging,
                totalMessages: this.messageHistory.length,
                pendingMessages: this.deliveryQueue.length,
                activeDelegations: this.activeDelegations.size,
            };
        }

        return baseStatus;
    }

    getEventHistory(): AnyEvent[] {
        return [...this.eventHistory];
    }

    getActiveExecutions(): Array<{
        executionId: string;
        correlationId: string;
        sessionId?: string;
        startTime: number;
        status: string;
    }> {
        return Array.from(this.activeExecutions.entries()).map(
            ([executionId, execution]) => ({
                executionId,
                correlationId: execution.correlationId,
                sessionId: execution.sessionId,
                startTime: execution.startTime,
                status: execution.status,
            }),
        );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 🔧 WORKFLOW INTEGRATION (AVANÇADO)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Converter para workflow step (AVANÇADO)
     */
    // toStep(stepName?: string): WorkflowStep<unknown, MultiAgentResult> {
    //     if (!this.config.enableAdvancedCoordination) {
    //         throw new EngineError(
    //             'AGENT_ERROR',
    //             'Advanced coordination is not enabled',
    //         );
    //     }

    //     return {
    //         name:
    //             stepName ||
    //             `${this.config.agentName || 'agent-core'}-coordination`,
    //         execute: async (
    //             input: {
    //                 strategy: AgentCoordinationStrategy;
    //                 criteria: AgentSelectionCriteria;
    //                 data: unknown;
    //             },
    //             context: WorkflowStepContext,
    //         ): Promise<MultiAgentResult> => {
    //             return this.coordinate(
    //                 input.data,
    //                 input.strategy,
    //                 input.criteria,
    //                 {
    //                     correlationId: context.correlationId,
    //                     sessionId: context.sessionId,
    //                     metadata: context.metadata || {},
    //                 },
    //             );
    //         },
    //     };
    // }

    // ──────────────────────────────────────────────────────────────────────────
    // 🔄 PRIVATE EXECUTION METHODS (AVANÇADO)
    // ──────────────────────────────────────────────────────────────────────────

    // private async executeSequential(
    //     input: unknown,
    //     context: MultiAgentContext,
    // ): Promise<MultiAgentResult> {
    //     const results: Record<string, unknown> = {};
    //     const agentResults: Record<
    //         string,
    //         {
    //             success: boolean;
    //             result?: unknown;
    //             error?: string;
    //             duration: number;
    //         }
    //     > = {};

    //     for (const agentId of context.availableAgents) {
    //         const agent = this.getAgent(agentId);
    //         if (!agent) continue;

    //         const startTime = Date.now();
    //         try {
    //             const result = await this.executeAgent(
    //                 agent,
    //                 input,
    //                 context,
    //             );
    //             const duration = Date.now() - startTime;

    //             results[agentId] = result.output;
    //             agentResults[agentId] = {
    //                 success: true,
    //                 result: result.output,
    //                 duration,
    //             };

    //             // Usar resultado do primeiro agente bem-sucedido
    //             return {
    //                 status: 'completed',
    //                 result: result.output,
    //                 coordinationId: context.coordinationId,
    //                 duration: Date.now() - context.startTime,
    //                 strategy: context.strategy,
    //                 participatingAgents: [agentId],
    //                 agentResults,
    //             };
    //         } catch (error) {
    //             const duration = Date.now() - startTime;
    //             agentResults[agentId] = {
    //                 success: false,
    //                 error:
    //                     error instanceof Error
    //                         ? error.message
    //                         : 'Unknown error',
    //                 duration,
    //             };
    //         }
    //     }

    //     return {
    //         status: 'failed',
    //         result: null,
    //         error: 'All agents failed in sequential execution',
    //         coordinationId: context.coordinationId,
    //         duration: Date.now() - context.startTime,
    //         strategy: context.strategy,
    //         participatingAgents: context.availableAgents,
    //         agentResults,
    //     };
    // }

    // private async executeParallel(
    //     input: unknown,
    //     context: MultiAgentContext,
    // ): Promise<MultiAgentResult> {
    //     const agentPromises = context.availableAgents.map(async (agentId) => {
    //         const agent = this.getAgent(agentId);
    //         if (!agent) return null;

    //         const startTime = Date.now();
    //         try {
    //             const result = await this.executeAgent(
    //                 agent,
    //                 input,
    //                 {context.correlationId || IdGenerator.executionId()},
    //             );
    //             const duration = Date.now() - startTime;

    //             return {
    //                 agentId,
    //                 success: true,
    //                 result: result.output,
    //                 duration,
    //             };
    //         } catch (error) {
    //             const duration = Date.now() - startTime;
    //             return {
    //                 agentId,
    //                 success: false,
    //                 error:
    //                     error instanceof Error
    //                         ? error.message
    //                         : 'Unknown error',
    //                 duration,
    //             };
    //         }
    //     });

    //     const results = await Promise.all(agentPromises);
    //     const successfulResults = results.filter((r) => r && r.success);

    //     if (successfulResults.length === 0) {
    //         return {
    //             status: 'failed',
    //             result: null,
    //             error: 'All agents failed in parallel execution',
    //             coordinationId: context.coordinationId,
    //             duration: Date.now() - context.startTime,
    //             strategy: context.strategy,
    //             participatingAgents: context.availableAgents,
    //             agentResults: Object.fromEntries(
    //                 results.filter((r) => r).map((r) => [r!.agentId, r!]),
    //             ),
    //         };
    //     }

    //     // Usar o primeiro resultado bem-sucedido
    //     const firstSuccess = successfulResults[0]!;

    //     return {
    //         status: 'completed',
    //         result: firstSuccess.result,
    //         coordinationId: context.coordinationId,
    //         duration: Date.now() - context.startTime,
    //         strategy: context.strategy,
    //         participatingAgents: context.availableAgents,
    //         agentResults: Object.fromEntries(
    //             results.filter((r) => r).map((r) => [r!.agentId, r!]),
    //         ),
    //     };
    // }

    // private async executeCompetition(
    //     input: unknown,
    //     context: MultiAgentContext,
    // ): Promise<MultiAgentResult> {
    //     // Implementação simplificada - competição entre agentes
    //     return this.executeParallel(input, context);
    // }

    // private async executeCollaboration(
    //     input: unknown,
    //     context: MultiAgentContext,
    // ): Promise<MultiAgentResult> {
    //     // Implementação simplificada - colaboração entre agentes
    //     return this.executeParallel(input, context);
    // }

    // private async executeDelegation(
    //     input: unknown,
    //     context: MultiAgentContext,
    // ): Promise<MultiAgentResult> {
    //     // Implementação simplificada - delegação hierárquica
    //     if (context.availableAgents.length === 0) {
    //         return {
    //             status: 'failed',
    //             result: null,
    //             error: 'No agents available for delegation',
    //             coordinationId: context.coordinationId,
    //             duration: Date.now() - context.startTime,
    //             strategy: context.strategy,
    //             participatingAgents: [],
    //         };
    //     }

    //     const primaryAgent = context.availableAgents[0];
    //     if (!primaryAgent) {
    //         return {
    //             status: 'failed',
    //             result: null,
    //             error: 'No agents available for delegation',
    //             coordinationId: context.coordinationId,
    //             duration: Date.now() - context.startTime,
    //             strategy: context.strategy,
    //             participatingAgents: [],
    //         };
    //     }

    //     const agent = this.getAgent(primaryAgent);

    //     if (!agent) {
    //         return {
    //             status: 'failed',
    //             result: null,
    //             error: `Primary agent not found: ${primaryAgent}`,
    //             coordinationId: context.coordinationId,
    //             duration: Date.now() - context.startTime,
    //             strategy: context.strategy,
    //             participatingAgents: [],
    //         };
    //     }

    //     try {
    //         const result = await this.executeAgent(
    //             agent,
    //             input,
    //             context.correlationId || IdGenerator.executionId(),
    //         );
    //         return {
    //             status: 'completed',
    //             result: result.output,
    //             coordinationId: context.coordinationId,
    //             duration: Date.now() - context.startTime,
    //             strategy: context.strategy,
    //             participatingAgents: [primaryAgent],
    //         };
    //     } catch (error) {
    //         return {
    //             status: 'failed',
    //             result: null,
    //             error: error instanceof Error ? error.message : 'Unknown error',
    //             coordinationId: context.coordinationId,
    //             duration: Date.now() - context.startTime,
    //             strategy: context.strategy,
    //             participatingAgents: [primaryAgent],
    //         };
    //     }
    // }

    // private async executeVoting(
    //     input: unknown,
    //     context: MultiAgentContext,
    // ): Promise<MultiAgentResult> {
    //     // Implementação simplificada - votação entre agentes
    //     return this.executeParallel(input, context);
    // }

    // private calculateChainLevel(_fromAgent: string): number {
    //     // Implementação simplificada - calcular nível da cadeia
    //     return 1;
    // }

    // private getOriginalAgent(fromAgent: string): string {
    //     // Implementação simplificada - obter agente original
    //     return fromAgent;
    // }

    // private getAvailableAgents(criteria: AgentSelectionCriteria): string[] {
    //     return Array.from(this.agents.entries())
    //         .filter(([agentId, agent]) => {
    //             // Verificar disponibilidade básica
    //             if (!agent) return false;

    //             // Se não temos capabilities, usar lógica básica
    //             const capabilities = this.agentCapabilities.get(agentId);
    //             if (!capabilities) {
    //                 return true; // Aceitar se não temos critérios específicos
    //             }

    //             // Verificar skills requeridas
    //             if (
    //                 criteria.requiredSkills &&
    //                 criteria.requiredSkills.length > 0
    //             ) {
    //                 const hasRequiredSkills = criteria.requiredSkills.some(
    //                     (skill) => capabilities.skills.includes(skill),
    //                 );
    //                 if (!hasRequiredSkills) return false;
    //             }

    //             // Verificar domínio requerido
    //             if (
    //                 criteria.requiredDomain &&
    //                 capabilities.domain !== criteria.requiredDomain
    //             ) {
    //                 return false;
    //             }

    //             // Verificar agentes excluídos
    //             if (
    //                 criteria.excludedAgents &&
    //                 criteria.excludedAgents.includes(agentId)
    //             ) {
    //                 return false;
    //             }

    //             return true;
    //         })
    //         .map(([agentId, _]) => agentId);
    // }

    private startDeliveryProcessor(): void {
        if (!this.config.enableMessaging) return;

        this.deliveryIntervalId = setInterval(async () => {
            await this.processDeliveryQueue();
        }, this.config.deliveryRetryInterval);
    }

    private async processDeliveryQueue(): Promise<void> {
        if (this.isProcessingQueue || this.deliveryQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        try {
            const message = this.deliveryQueue.shift();
            if (message) {
                await this.deliverMessage(message);
            }
        } finally {
            this.isProcessingQueue = false;
        }
    }

    private async deliverMessage(message: TrackedMessage): Promise<void> {
        try {
            // Verificar se o agente destino existe
            if (!this.agentInboxes.has(message.toAgent)) {
                message.status = 'failed';
                message.error = `Target agent not found: ${message.toAgent}`;
                return;
            }

            // Adicionar à caixa de entrada do agente
            const inbox = this.agentInboxes.get(message.toAgent)!;
            inbox.push(message);

            message.status = 'delivered';
            message.deliveredAt = Date.now();

            this.logger.debug('Message delivered', {
                messageId: message.id,
                toAgent: message.toAgent,
            });

            //this.emit('messageDelivered', message);
        } catch (error) {
            message.status = 'failed';
            message.error =
                error instanceof Error ? error.message : 'Unknown error';
            message.deliveryAttempts++;

            this.logger.error('Message delivery failed', error as Error, {
                messageId: message.id,
                toAgent: message.toAgent,
                attempts: message.deliveryAttempts,
            });

            //this.emit('messageFailed', message);

            // Recolocar na fila se ainda há tentativas
            if (message.deliveryAttempts < message.maxAttempts) {
                this.deliveryQueue.push(message);
            }
        }
    }

    async cleanup(): Promise<void> {
        this.logger.info('Cleaning up AgentCore');

        // Clear event history
        this.eventHistory = [];

        // Clear agents
        this.agents.clear();
        this.agentCapabilities.clear();

        // Clear active executions
        this.activeExecutions.clear();

        // Clear messaging if enabled
        if (this.config.enableMessaging) {
            if (this.deliveryIntervalId) {
                clearInterval(this.deliveryIntervalId);
            }
            this.messages.clear();
            this.agentInboxes.clear();
            this.activeDelegations.clear();
            this.messageHistory.length = 0;
            this.deliveryQueue.length = 0;
        }

        this.logger.info('AgentCore cleanup completed');
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🔍 CONTEXT CAPTURE & OBSERVABILITY HELPERS
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Captura contexto automático para logging
     */
    protected captureLogContext(
        operation: string,
        additionalContext?: Record<string, unknown>,
    ): Record<string, unknown> {
        const baseContext = {
            operation,
            agentName: this.singleAgentDefinition?.name || 'multi-agent',
            tenantId: this.config.tenantId,
            timestamp: Date.now(),
        };

        // Adicionar contexto de execução se disponível
        if (this.activeExecutions.size > 0) {
            const executions = Array.from(this.activeExecutions.values());
            if (executions.length > 0) {
                const firstExecution = executions[0];
                if (firstExecution) {
                    Object.assign(baseContext, {
                        correlationId: firstExecution.correlationId,
                        sessionId: firstExecution.sessionId,
                        executionStatus: firstExecution.status,
                    });
                }
            }
        }

        // Adicionar contexto do kernel se disponível
        if (this.kernelHandler) {
            Object.assign(baseContext, {
                kernelEnabled: true,
                kernelContext: 'available', // TODO: Implementar getContextSummary no KernelHandler
            });
        }

        // Adicionar contexto multi-agent se disponível
        if (this.config.enableMultiAgent) {
            Object.assign(baseContext, {
                agentCount: this.agents.size,
                activeDelegations: this.activeDelegations.size,
                pendingMessages: this.deliveryQueue.length,
            });
        }

        return { ...baseContext, ...additionalContext };
    }

    /**
     * Sanitiza input para logging seguro
     */
    protected sanitizeInputForLogging(input: unknown): unknown {
        if (!input) return input;

        try {
            // Se for string, limitar tamanho
            if (typeof input === 'string') {
                return input.length > 1000
                    ? input.substring(0, 1000) + '...'
                    : input;
            }

            // Se for objeto, remover propriedades sensíveis
            if (typeof input === 'object' && input !== null) {
                const sanitized = { ...(input as Record<string, unknown>) };
                const sensitiveKeys = [
                    'password',
                    'token',
                    'secret',
                    'key',
                    'auth',
                ];

                sensitiveKeys.forEach((key) => {
                    if (key in sanitized) {
                        sanitized[key] = '[REDACTED]';
                    }
                });

                return sanitized;
            }

            return input;
        } catch {
            return '[UNSERIALIZABLE]';
        }
    }

    /**
     * Log de erro com contexto automático
     */
    protected logError(
        message: string,
        error: Error,
        operation: string,
        additionalContext?: Record<string, unknown>,
    ): void {
        const context = this.captureLogContext(operation, {
            errorName: error.name,
            errorMessage: error.message,
            errorStack: error.stack,
            ...additionalContext,
        });

        this.logger.error(message, error, context);
    }

    /**
     * Log de info com contexto automático
     */
    protected logInfo(
        message: string,
        operation: string,
        additionalContext?: Record<string, unknown>,
    ): void {
        const context = this.captureLogContext(operation, additionalContext);
        this.logger.info(message, context);
    }

    /**
     * Log de debug com contexto automático
     */
    protected logDebug(
        message: string,
        operation: string,
        additionalContext?: Record<string, unknown>,
    ): void {
        if (this.config.debug) {
            const context = this.captureLogContext(
                operation,
                additionalContext,
            );
            this.logger.debug(message, context);
        }
    }

    /**
     * Wrap error com observabilidade automática
     */
    protected wrapErrorWithObservability(
        error: Error,
        errorCode: string,
        _message: string,
        context?: Record<string, unknown>,
    ): Error {
        // TODO: Implementar integração com observabilityErrorUtils
        // Por enquanto, apenas adiciona contexto ao erro
        (
            error as Error & {
                context?: Record<string, unknown>;
                errorCode?: string;
            }
        ).context = context;
        (
            error as Error & {
                context?: Record<string, unknown>;
                errorCode?: string;
            }
        ).errorCode = errorCode;
        return error;
    }

    /**
     * Analyze input to understand tool execution patterns and requirements
     */
    // protected analyzeInputForToolPattern(
    //     input: unknown,
    //     availableTools: string[],
    // ): {
    //     complexity: number;
    //     toolCount: number;
    //     hasSequentialDependencies: boolean;
    //     hasConditionalLogic: boolean;
    //     estimatedExecutionTime: number;
    //     riskFactors: string[];
    //     inputType: 'simple' | 'complex' | 'batch' | 'stream';
    //     keywords: string[];
    // } {
    //     let complexity = 0.1; // Base complexity
    //     let toolCount = 0;
    //     let hasSequentialDependencies = false;
    //     let hasConditionalLogic = false;
    //     let estimatedExecutionTime = 1000; // Base time in ms
    //     const riskFactors: string[] = [];
    //     let inputType: 'simple' | 'complex' | 'batch' | 'stream' = 'simple';
    //     let keywords: string[] = [];

    //     // Analyze input structure
    //     if (typeof input === 'string') {
    //         const inputText = input.toLowerCase();
    //         keywords = inputText.split(/\s+/).filter((word) => word.length > 3);

    //         // Check for complexity indicators
    //         if (inputText.length > 500) {
    //             complexity += 0.3;
    //             inputType = 'complex';
    //         }

    //         // Check for batch processing indicators
    //         if (
    //             inputText.includes('batch') ||
    //             inputText.includes('bulk') ||
    //             inputText.includes('multiple')
    //         ) {
    //             complexity += 0.2;
    //             inputType = 'batch';
    //             estimatedExecutionTime *= 3;
    //         }

    //         // Check for streaming indicators
    //         if (
    //             inputText.includes('stream') ||
    //             inputText.includes('real-time') ||
    //             inputText.includes('continuous')
    //         ) {
    //             complexity += 0.2;
    //             inputType = 'stream';
    //             riskFactors.push('real-time-processing');
    //         }

    //         // Check for sequential dependencies
    //         if (
    //             inputText.includes('then') ||
    //             inputText.includes('after') ||
    //             inputText.includes('depends on')
    //         ) {
    //             hasSequentialDependencies = true;
    //             complexity += 0.2;
    //             estimatedExecutionTime *= 2;
    //         }

    //         // Check for conditional logic
    //         if (
    //             inputText.includes('if') ||
    //             inputText.includes('when') ||
    //             inputText.includes('condition')
    //         ) {
    //             hasConditionalLogic = true;
    //             complexity += 0.15;
    //             riskFactors.push('conditional-execution');
    //         }

    //         // Estimate tool count based on action words
    //         const actionWords = [
    //             'analyze',
    //             'process',
    //             'generate',
    //             'validate',
    //             'transform',
    //             'calculate',
    //             'fetch',
    //             'send',
    //         ];
    //         toolCount = actionWords.filter((word) =>
    //             inputText.includes(word),
    //         ).length;

    //         if (toolCount === 0) {
    //             // Fallback: estimate based on available tools mentioned
    //             toolCount = availableTools.filter((tool) =>
    //                 inputText.includes(tool.toLowerCase()),
    //             ).length;
    //         }

    //         toolCount = Math.max(1, Math.min(toolCount, availableTools.length));
    //     } else if (Array.isArray(input)) {
    //         // Array input suggests batch processing
    //         complexity += 0.3;
    //         inputType = 'batch';
    //         toolCount = Math.min(input.length, availableTools.length);
    //         estimatedExecutionTime = toolCount * 500;
    //     } else if (input && typeof input === 'object') {
    //         // Object input suggests complex structure
    //         complexity += 0.2;
    //         inputType = 'complex';

    //         const inputObj = input as Record<string, unknown>;
    //         const keys = Object.keys(inputObj);

    //         // Check for parallel processing indicators
    //         if (keys.includes('parallel') || keys.includes('concurrent')) {
    //             complexity += 0.1;
    //         }

    //         // Check for tool specifications
    //         if (keys.includes('tools') && Array.isArray(inputObj.tools)) {
    //             toolCount = (inputObj.tools as unknown[]).length;
    //             estimatedExecutionTime = toolCount * 300;
    //         }
    //     }

    //     // Add risk factors based on complexity
    //     if (complexity > 0.7) {
    //         riskFactors.push('high-complexity');
    //     }
    //     if (toolCount > 5) {
    //         riskFactors.push('many-tools');
    //     }
    //     if (estimatedExecutionTime > 10000) {
    //         riskFactors.push('long-execution');
    //     }

    //     return {
    //         complexity: Math.min(1.0, complexity),
    //         toolCount: Math.max(1, toolCount),
    //         hasSequentialDependencies,
    //         hasConditionalLogic,
    //         estimatedExecutionTime,
    //         riskFactors,
    //         inputType,
    //         keywords,
    //     };
    // }

    /**
     * Generate tool execution hints based on analysis
     */
    // private generateToolExecutionHints(
    //     _availableTools: string[],
    //     inputAnalysis: ReturnType<AgentCore['analyzeInputForToolPattern']>,
    // ): Array<{
    //     strategy: 'parallel' | 'sequential' | 'conditional' | 'adaptive';
    //     confidence: number;
    //     reasoning: string;
    //     estimatedTime: number;
    //     riskLevel: 'low' | 'medium' | 'high';
    // }> {
    //     const hints: Array<{
    //         strategy: 'parallel' | 'sequential' | 'conditional' | 'adaptive';
    //         confidence: number;
    //         reasoning: string;
    //         estimatedTime: number;
    //         riskLevel: 'low' | 'medium' | 'high';
    //     }> = [];

    //     // Parallel execution hint
    //     if (
    //         !inputAnalysis.hasSequentialDependencies &&
    //         inputAnalysis.toolCount > 1
    //     ) {
    //         hints.push({
    //             strategy: 'parallel',
    //             confidence: 0.8,
    //             reasoning: `${inputAnalysis.toolCount} tools can be executed simultaneously`,
    //             estimatedTime: Math.max(
    //                 500,
    //                 inputAnalysis.estimatedExecutionTime /
    //                     inputAnalysis.toolCount,
    //             ),
    //             riskLevel: inputAnalysis.complexity > 0.7 ? 'medium' : 'low',
    //         });
    //     }

    //     // Sequential execution hint
    //     if (
    //         inputAnalysis.hasSequentialDependencies ||
    //         inputAnalysis.complexity > 0.6
    //     ) {
    //         hints.push({
    //             strategy: 'sequential',
    //             confidence: inputAnalysis.hasSequentialDependencies ? 0.9 : 0.6,
    //             reasoning: inputAnalysis.hasSequentialDependencies
    //                 ? 'Sequential dependencies detected'
    //                 : 'High complexity requires sequential processing',
    //             estimatedTime: inputAnalysis.estimatedExecutionTime,
    //             riskLevel:
    //                 inputAnalysis.riskFactors.length > 2 ? 'high' : 'medium',
    //         });
    //     }

    //     // Conditional execution hint
    //     if (inputAnalysis.hasConditionalLogic) {
    //         hints.push({
    //             strategy: 'conditional',
    //             confidence: 0.85,
    //             reasoning: 'Conditional logic patterns detected in input',
    //             estimatedTime: inputAnalysis.estimatedExecutionTime * 1.2,
    //             riskLevel: 'medium',
    //         });
    //     }

    //     // Adaptive execution hint (always available as fallback)
    //     hints.push({
    //         strategy: 'adaptive',
    //         confidence: 0.7,
    //         reasoning:
    //             'Adaptive strategy can handle various execution patterns',
    //         estimatedTime: inputAnalysis.estimatedExecutionTime * 1.1,
    //         riskLevel: inputAnalysis.complexity > 0.8 ? 'medium' : 'low',
    //     });

    //     return hints;
    // }

    // ===== 🚀 NEW: RESULT AGGREGATION METHODS =====

    /**
     * Aggregate tool results from parallel, sequential, or conditional executions
     */
    protected aggregateToolResults(
        results: Array<{ toolName: string; result?: unknown; error?: string }>,
        strategy: 'parallel' | 'sequential' | 'conditional' | 'adaptive',
        options?: {
            includeErrors?: boolean;
            transformResults?: boolean;
            mergeStrategy?: 'combine' | 'merge' | 'aggregate' | 'summarize';
            metadata?: Record<string, unknown>;
        },
    ): {
        aggregatedResult: unknown;
        summary: {
            totalTools: number;
            successfulTools: number;
            failedTools: number;
            executionStrategy: string;
            errorSummary?: string[];
        };
        individualResults: Array<{
            toolName: string;
            success: boolean;
            result?: unknown;
            error?: string;
            executionTime?: number;
        }>;
        metadata: Record<string, unknown>;
    } {
        const includeErrors = options?.includeErrors ?? true;
        const transformResults = options?.transformResults ?? true;
        const mergeStrategy = options?.mergeStrategy ?? 'combine';

        // Process individual results
        const individualResults = results.map((result) => ({
            toolName: result.toolName,
            success: !result.error,
            result: result.result,
            error: result.error,
            executionTime: this.estimateToolExecutionTime(result.toolName),
        }));

        // Calculate summary statistics
        const summary = {
            totalTools: results.length,
            successfulTools: results.filter((r) => !r.error).length,
            failedTools: results.filter((r) => r.error).length,
            executionStrategy: strategy,
            errorSummary: includeErrors
                ? results
                      .filter((r) => r.error)
                      .map((r) => `${r.toolName}: ${r.error}`)
                : undefined,
        };

        // Aggregate results based on strategy
        let aggregatedResult: unknown;

        switch (mergeStrategy) {
            case 'combine':
                aggregatedResult = this.combineResults(
                    results,
                    strategy,
                    transformResults,
                );
                break;
            case 'merge':
                aggregatedResult = this.mergeResults(
                    results,
                    strategy,
                    transformResults,
                );
                break;
            case 'aggregate':
                aggregatedResult = this.aggregateResultsDetailed(
                    results,
                    strategy,
                    transformResults,
                );
                break;
            case 'summarize':
                aggregatedResult = this.summarizeResults(results, strategy);
                break;
            default:
                aggregatedResult = this.combineResults(
                    results,
                    strategy,
                    transformResults,
                );
        }

        // Build metadata
        const metadata = {
            aggregationStrategy: mergeStrategy,
            executionStrategy: strategy,
            timestamp: Date.now(),
            toolCount: results.length,
            successRate: summary.successfulTools / summary.totalTools,
            ...options?.metadata,
        };

        return {
            aggregatedResult,
            summary,
            individualResults,
            metadata,
        };
    }

    /**
     * Combine results into a structured format
     */
    private combineResults(
        results: Array<{ toolName: string; result?: unknown; error?: string }>,
        strategy: string,
        transform: boolean,
    ): unknown {
        if (results.length === 0) return null;
        if (results.length === 1) return results[0]?.result;

        const combined: Record<string, unknown> = {
            strategy,
            timestamp: Date.now(),
            results: {} as Record<string, unknown>,
        };

        for (const result of results) {
            if (result.error) {
                (combined.results as Record<string, unknown>)[result.toolName] =
                    {
                        error: result.error,
                        success: false,
                    };
            } else {
                (combined.results as Record<string, unknown>)[result.toolName] =
                    transform
                        ? this.transformSingleResult(
                              result.result,
                              result.toolName,
                          )
                        : result.result;
            }
        }

        return combined;
    }

    /**
     * Merge results into a unified structure
     */
    private mergeResults(
        results: Array<{ toolName: string; result?: unknown; error?: string }>,
        strategy: string,
        transform: boolean,
    ): unknown {
        const successfulResults = results.filter((r) => !r.error);

        if (successfulResults.length === 0) {
            return {
                error: 'All tools failed',
                strategy,
                failedTools: results.map((r) => r.toolName),
            };
        }

        if (successfulResults.length === 1) {
            const firstResult = successfulResults[0];
            return transform
                ? this.transformSingleResult(
                      firstResult?.result,
                      firstResult?.toolName || 'unknown',
                  )
                : firstResult?.result;
        }

        // Try to merge results intelligently
        const merged: Record<string, unknown> = {};

        for (const result of successfulResults) {
            if (result.result && typeof result.result === 'object') {
                Object.assign(merged, result.result);
            } else {
                merged[result.toolName] = result.result;
            }
        }

        return {
            ...merged,
            metadata: {
                strategy,
                mergedFrom: successfulResults.map((r) => r.toolName),
                timestamp: Date.now(),
            },
        };
    }

    /**
     * Create detailed aggregation with metrics
     */
    private aggregateResultsDetailed(
        results: Array<{ toolName: string; result?: unknown; error?: string }>,
        strategy: string,
        transform: boolean,
    ): unknown {
        const successfulResults = results.filter((r) => !r.error);
        const failedResults = results.filter((r) => r.error);

        return {
            strategy,
            timestamp: Date.now(),
            summary: {
                total: results.length,
                successful: successfulResults.length,
                failed: failedResults.length,
                successRate: successfulResults.length / results.length,
            },
            successful: Object.fromEntries(
                successfulResults.map((r) => [
                    r.toolName,
                    transform
                        ? this.transformSingleResult(r.result, r.toolName)
                        : r.result,
                ]),
            ),
            failed: Object.fromEntries(
                failedResults.map((r) => [r.toolName, { error: r.error }]),
            ),
            metrics: {
                averageExecutionTime:
                    this.calculateAverageExecutionTime(results),
                toolDistribution: this.analyzeToolDistribution(results),
                errorPatterns: this.analyzeErrorPatterns(failedResults),
            },
        };
    }

    /**
     * Summarize results into a concise format
     */
    private summarizeResults(
        results: Array<{ toolName: string; result?: unknown; error?: string }>,
        strategy: string,
    ): unknown {
        const successfulResults = results.filter((r) => !r.error);
        const failedResults = results.filter((r) => r.error);

        if (successfulResults.length === 0) {
            return {
                success: false,
                message: `All ${results.length} tools failed`,
                strategy,
                errors: failedResults.map((r) => r.error),
            };
        }

        if (failedResults.length === 0) {
            return {
                success: true,
                message: `All ${results.length} tools executed successfully`,
                strategy,
                resultCount: successfulResults.length,
                tools: successfulResults.map((r) => r.toolName),
            };
        }

        return {
            success: true,
            message: `${successfulResults.length}/${results.length} tools executed successfully`,
            strategy,
            successful: successfulResults.map((r) => r.toolName),
            failed: failedResults.map((r) => r.toolName),
            partialSuccess: true,
        };
    }

    /**
     * Transform individual result based on tool type and content
     */
    private transformSingleResult(result: unknown, toolName: string): unknown {
        // Simple transformation based on tool name patterns
        if (toolName.includes('fetch') || toolName.includes('get')) {
            // Data retrieval tools - wrap in data envelope
            return {
                data: result,
                source: toolName,
                timestamp: Date.now(),
                type: 'retrieval',
            };
        }

        if (toolName.includes('process') || toolName.includes('transform')) {
            // Processing tools - wrap with processing metadata
            return {
                processedData: result,
                processor: toolName,
                timestamp: Date.now(),
                type: 'processing',
            };
        }

        if (toolName.includes('validate') || toolName.includes('check')) {
            // Validation tools - wrap with validation metadata
            return {
                validationResult: result,
                validator: toolName,
                timestamp: Date.now(),
                type: 'validation',
            };
        }

        // Default transformation
        return {
            result,
            tool: toolName,
            timestamp: Date.now(),
            type: 'generic',
        };
    }

    /**
     * Estimate execution time for a tool (for aggregation metrics)
     */
    private estimateToolExecutionTime(toolName: string): number {
        // Simple estimation based on tool name patterns
        if (toolName.includes('fetch') || toolName.includes('api')) return 2000;
        if (toolName.includes('process') || toolName.includes('analyze'))
            return 3000;
        if (toolName.includes('generate') || toolName.includes('create'))
            return 5000;
        if (toolName.includes('validate') || toolName.includes('check'))
            return 1000;

        return 1500; // Default estimate
    }

    /**
     * Calculate average execution time from results
     */
    private calculateAverageExecutionTime(
        results: Array<{ toolName: string; result?: unknown; error?: string }>,
    ): number {
        const totalTime = results.reduce(
            (sum, result) =>
                sum + this.estimateToolExecutionTime(result.toolName),
            0,
        );
        return results.length > 0 ? totalTime / results.length : 0;
    }

    /**
     * Analyze tool distribution in results
     */
    private analyzeToolDistribution(
        results: Array<{ toolName: string; result?: unknown; error?: string }>,
    ): Record<string, number> {
        const distribution: Record<string, number> = {};

        for (const result of results) {
            // Categorize tools by type
            let category = 'other';
            if (
                result.toolName.includes('fetch') ||
                result.toolName.includes('get')
            )
                category = 'retrieval';
            else if (
                result.toolName.includes('process') ||
                result.toolName.includes('transform')
            )
                category = 'processing';
            else if (
                result.toolName.includes('validate') ||
                result.toolName.includes('check')
            )
                category = 'validation';
            else if (
                result.toolName.includes('generate') ||
                result.toolName.includes('create')
            )
                category = 'generation';

            distribution[category] = (distribution[category] || 0) + 1;
        }

        return distribution;
    }

    /**
     * Analyze error patterns in failed results
     */
    private analyzeErrorPatterns(
        failedResults: Array<{
            toolName: string;
            result?: unknown;
            error?: string;
        }>,
    ): Record<string, number> {
        const patterns: Record<string, number> = {};

        for (const result of failedResults) {
            if (result.error) {
                // Categorize errors by common patterns
                const error = result.error.toLowerCase();
                let category = 'unknown';

                if (error.includes('timeout')) category = 'timeout';
                else if (
                    error.includes('network') ||
                    error.includes('connection')
                )
                    category = 'network';
                else if (error.includes('auth') || error.includes('permission'))
                    category = 'authorization';
                else if (
                    error.includes('validation') ||
                    error.includes('invalid')
                )
                    category = 'validation';
                else if (error.includes('not found') || error.includes('404'))
                    category = 'not_found';
                else if (error.includes('server') || error.includes('500'))
                    category = 'server_error';

                patterns[category] = (patterns[category] || 0) + 1;
            }
        }

        return patterns;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🧠 NEW: Think→Act→Observe Implementation
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Initialize planner components for Think→Act→Observe
     */
    private initializePlannerComponents(): void {
        // Only initialize if LLM adapter is provided
        if (this.config.llmAdapter) {
            this.llmAdapter = this.config.llmAdapter;

            try {
                const plannerType = this.config.planner || 'plan-execute';
                this.planner = PlannerFactory.create(
                    plannerType,
                    this.llmAdapter,
                    this.config.plannerOptions?.replanPolicy
                        ? {
                              replanPolicy:
                                  this.config.plannerOptions.replanPolicy,
                          }
                        : undefined,
                );

                this.logger.info('Planner initialized', {
                    type: plannerType,
                    llmProvider:
                        this.llmAdapter?.getProvider?.()?.name || 'unknown',
                    agentName: this.config.agentName,
                });
            } catch (error) {
                this.logger.error(
                    'Failed to initialize planner',
                    error as Error,
                );
                // Continue without planner - will use traditional think function
            }
        } else {
            this.logger.warn(
                'No LLM adapter provided - Think→Act→Observe will not be available',
                {
                    agentName: this.config.agentName,
                },
            );
        }
    }

    /**
     * Generate correlation ID for request-response tracking
     */
    private generateCorrelationId(): string {
        return `corr_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    /**
     * Get current agent context for action processing
     * ✅ REMOVER: Método não utilizado após remoção do currentAgentContext
     */
    // private getCurrentAgentContext(): AgentContext {
    //     if (!this.currentAgentContext) {
    //         throw new EngineError(
    //             'AGENT_ERROR',
    //             'No current agent context available',
    //         );
    //     }
    //     return this.currentAgentContext;
    // }

    /**
     * Execute Think→Act→Observe loop - Main intelligence method
     * This is the primary method for agent intelligence processing
     */
    protected async executeThinkActObserve<TInput, TOutput>(
        input: TInput,
        context: AgentContext,
    ): Promise<TOutput> {
        if (!this.planner || !this.llmAdapter) {
            throw new EngineError(
                'AGENT_ERROR',
                'Think→Act→Observe requires planner and LLM adapter. Provide llmAdapter in config.',
            );
        }

        const maxIterations = this.config.maxThinkingIterations || 15;
        const inputString = String(input);
        const obs = getObservability();

        const executionHistory: Array<{
            thought: AgentThought;
            action: AgentAction;
            result: ActionResult;
            observation: ResultAnalysis;
        }> = [];

        let finalExecutionContext: PlannerExecutionContext | undefined;

        // ✅ SIMPLIFICADO: Loop principal
        for (let iterations = 0; iterations < maxIterations; iterations++) {
            const plannerInput = this.createPlannerContext(
                inputString,
                executionHistory,
                iterations,
                maxIterations,
                context,
            );

            finalExecutionContext = plannerInput;

            if (plannerInput.isComplete) {
                break;
            }

            try {
                // ✅ SIMPLIFICADO: Executar uma iteração
                const iterationResult = await this.executeSingleIteration(
                    plannerInput,
                    iterations,
                    obs,
                    context,
                );

                executionHistory.push(iterationResult);

                // ✅ SIMPLIFICADO: Atualizar estado
                await this.updateExecutionState(
                    context,
                    iterationResult,
                    iterations,
                );

                // ✅ SIMPLIFICADO: Verificar condições de parada
                if (
                    this.shouldStopExecution(
                        iterationResult,
                        iterations,
                        plannerInput,
                    )
                ) {
                    break;
                }
            } catch (error) {
                if (iterations >= maxIterations - 1) {
                    throw error;
                }
            }
        }

        // ✅ SIMPLIFICADO: Retornar resultado final
        return this.extractFinalResult(
            finalExecutionContext,
            executionHistory,
        ) as TOutput;
    }

    // ✅ NOVOS MÉTODOS PRIVADOS SIMPLES
    private async executeSingleIteration(
        plannerInput: PlannerExecutionContext,
        iterations: number,
        obs: ObservabilitySystem,
        context: AgentContext,
    ): Promise<{
        thought: AgentThought;
        action: AgentAction;
        result: ActionResult;
        observation: ResultAnalysis;
    }> {
        const kernel = this.kernelHandler
            ?.getMultiKernelManager()
            ?.getKernelByNamespace('agent');
        const initialEventCount = kernel?.getState().eventCount || 0;

        // ✅ SIMPLIFICADO: Think
        const thought = await this.executeThinkPhase(
            plannerInput,
            iterations,
            obs,
            context,
        );

        // ✅ SIMPLIFICADO: Act
        const result = await this.executeActPhase(
            thought,
            iterations,
            obs,
            context,
            plannerInput,
        );

        // ✅ SIMPLIFICADO: Observe
        const observation = await this.executeObservePhase(
            result,
            plannerInput,
            iterations,
            obs,
            context,
        );

        // ✅ SIMPLIFICADO: Logging
        this.logIterationCompletion(
            iterations,
            thought,
            result,
            observation,
            kernel,
            initialEventCount,
        );

        return { thought, action: thought.action, result, observation };
    }

    private async executeThinkPhase(
        plannerInput: PlannerExecutionContext,
        iterations: number,
        obs: ObservabilitySystem,
        context: AgentContext,
    ): Promise<AgentThought> {
        const thinkSpan = startAgentSpan(obs.telemetry, 'think', {
            agentName: this.config.agentName || 'unknown',
            correlationId: context.correlationId || 'unknown',
            iteration: iterations,
        });

        return obs.telemetry.withSpan(thinkSpan, async () => {
            try {
                const res = await this.think(plannerInput);
                markSpanOk(thinkSpan);
                return res;
            } catch (err) {
                applyErrorToSpan(thinkSpan, err, { phase: 'think' });
                throw err;
            }
        });
    }

    private async executeActPhase(
        thought: AgentThought,
        iterations: number,
        obs: ObservabilitySystem,
        context: AgentContext,
        plannerInput: PlannerExecutionContext,
    ): Promise<ActionResult> {
        if (!thought.action) {
            throw new Error('Thought action is undefined');
        }

        // ✅ SIMPLIFICADO: Handle execute_plan action
        if (isExecutePlanAction(thought.action)) {
            return await this.executePlanAction(context, plannerInput);
        }

        // ✅ SIMPLIFICADO: Handle regular actions
        const actSpan = startAgentSpan(obs.telemetry, 'act', {
            agentName: this.config.agentName || 'unknown',
            correlationId: context.correlationId || 'unknown',
            iteration: iterations,
            attributes: { actionType: thought.action?.type || 'unknown' },
        });

        return obs.telemetry.withSpan(actSpan, async () => {
            try {
                const res = await this.act(thought.action);
                markSpanOk(actSpan);
                return res;
            } catch (err) {
                applyErrorToSpan(actSpan, err, { phase: 'act' });
                throw err;
            }
        });
    }

    private async executeObservePhase(
        result: ActionResult,
        plannerInput: PlannerExecutionContext,
        iterations: number,
        obs: ObservabilitySystem,
        context: AgentContext,
    ): Promise<ResultAnalysis> {
        const observeSpan = startAgentSpan(obs.telemetry, 'observe', {
            agentName: this.config.agentName || 'unknown',
            correlationId: context.correlationId || 'unknown',
            iteration: iterations,
        });

        return obs.telemetry.withSpan(observeSpan, async () => {
            try {
                const res = await this.observe(result, plannerInput);
                markSpanOk(observeSpan);
                return res;
            } catch (err) {
                applyErrorToSpan(observeSpan, err, { phase: 'observe' });
                throw err;
            }
        });
    }

    private async executePlanAction(
        context: AgentContext,
        plannerContext: PlannerExecutionContext,
    ): Promise<ActionResult> {
        const plan = this.planner?.getPlanForContext?.(plannerContext);

        if (!plan) {
            throw new Error('No plan available for execute_plan');
        }

        // ✅ SIMPLIFICADO: Usar act diretamente com observabilidade
        const act = async (action: AgentAction) => {
            const obs = getObservability();
            const actSpan = startAgentSpan(obs.telemetry, 'act', {
                agentName: this.config.agentName || 'unknown',
                correlationId: context.correlationId || 'unknown',
                iteration: 0,
                attributes: {
                    actionType: action.type || 'unknown',
                    source: 'plan-executor',
                },
            });

            return obs.telemetry.withSpan(actSpan, async () => {
                try {
                    const res = await this.act(action);
                    markSpanOk(actSpan);
                    return res;
                } catch (err) {
                    applyErrorToSpan(actSpan, err, {
                        phase: 'act',
                        source: 'plan-executor',
                    });
                    throw err;
                }
            });
        };

        const resolveArgs = (
            rawArgs: Record<string, unknown>,
            stepList: unknown[],
            contextForResolution: PlannerExecutionContext,
        ) =>
            this.planner!.resolveArgs
                ? this.planner!.resolveArgs(
                      rawArgs,
                      stepList,
                      contextForResolution,
                  )
                : Promise.resolve({ args: rawArgs, missing: [] });

        const executor = new PlanExecutor(act, resolveArgs, {
            enableReWOO: true,
        });

        const obsRes = await executor.run(
            plan as ExecutionPlan,
            plannerContext,
        );

        // ✅ CORREÇÃO: Retornar replanContext quando necessário
        if (obsRes.type === 'needs_replan') {
            return {
                type: 'error',
                replanContext: obsRes.replanContext,
                feedback: obsRes.feedback,
                status: 'needs_replan',
                error: obsRes.feedback,
            };
        }

        return obsRes.type === 'execution_complete'
            ? { type: 'final_answer', content: obsRes.feedback }
            : { type: 'error', error: obsRes.feedback };
    }

    private async updateExecutionState(
        context: AgentContext,
        iterationResult: {
            thought: AgentThought;
            action: AgentAction;
            result: ActionResult;
            observation: ResultAnalysis;
        },
        iterations: number,
    ): Promise<void> {
        await context.session.addEntry(
            {
                type: 'execution_step',
                iteration: iterations,
                thought: iterationResult.thought.reasoning,
                action: iterationResult.action,
            },
            {
                type: 'execution_result',
                result:
                    iterationResult.result.type === 'error'
                        ? { error: iterationResult.result.error }
                        : iterationResult.result.type === 'needs_replan'
                          ? { needsReplan: iterationResult.result.feedback }
                          : iterationResult.result.content,
                observation: iterationResult.observation.feedback,
                isComplete: iterationResult.observation.isComplete,
                timestamp: Date.now(),
            },
        );

        await context.state.set(
            'execution',
            'last_action',
            iterationResult.action,
        );
        await context.state.set('execution', 'current_iteration', iterations);
        await context.state.set(
            'execution',
            'last_result',
            iterationResult.result,
        );
        await context.state.set(
            'execution',
            'last_observation',
            iterationResult.observation,
        );
        await context.state.set(
            'execution',
            'is_complete',
            iterationResult.observation.isComplete,
        );
    }

    private shouldStopExecution(
        iterationResult: {
            thought: AgentThought;
            action: AgentAction;
            result: ActionResult;
            observation: ResultAnalysis;
        },
        iterations: number,
        plannerInput: PlannerExecutionContext,
    ): boolean {
        if (iterationResult.observation.isComplete) {
            this.logger.info('Think→Act→Observe completed', {
                iterations,
                agentName: this.config.agentName,
                totalDuration:
                    Date.now() -
                    (plannerInput.plannerMetadata.startTime as number),
                finalAction: iterationResult.action?.type || 'unknown',
            });
            return true;
        }

        if (!iterationResult.observation.shouldContinue) {
            this.logger.info('Think→Act→Observe stopped by planner', {
                iterations,
                reason: iterationResult.observation.feedback,
                agentName: this.config.agentName,
                totalDuration:
                    Date.now() -
                    (plannerInput.plannerMetadata.startTime as number),
            });
            return true;
        }

        if (this.detectStagnation(plannerInput)) {
            this.logger.warn('Stagnation detected, breaking loop', {
                iterations,
                agentName: this.config.agentName,
            });
            return true;
        }

        return false;
    }

    private extractFinalResult(
        finalExecutionContext: PlannerExecutionContext | undefined,
        executionHistory: Array<{
            thought: AgentThought;
            action: AgentAction;
            result: ActionResult;
            observation: ResultAnalysis;
        }>,
    ): unknown {
        const finalResult = finalExecutionContext?.getFinalResult();

        if (finalResult && finalResult.success) {
            const result = finalResult.result;
            if (
                result &&
                typeof result === 'object' &&
                'type' in result &&
                'content' in result
            ) {
                if (result.type === 'final_answer') {
                    return result.content;
                }
            }
            return finalResult.result;
        }

        // ✅ SIMPLIFICADO: Extrair último resultado útil
        for (let i = executionHistory.length - 1; i >= 0; i--) {
            const entry = executionHistory[i];
            if (
                entry?.result &&
                'content' in entry.result &&
                entry.result.content
            ) {
                return entry.result.content;
            }
        }

        return 'Sorry, I had trouble processing your request. Please try again with more details.';
    }

    private logIterationCompletion(
        iterations: number,
        thought: AgentThought,
        _result: ActionResult,
        observation: ResultAnalysis,
        kernel: unknown,
        initialEventCount: number,
    ): void {
        const finalEventCount =
            (
                kernel as { getState?: () => { eventCount: number } }
            )?.getState?.()?.eventCount || 0;
        const eventsGenerated = finalEventCount - initialEventCount;

        this.logger.info('Think→Act→Observe iteration completed', {
            iteration: iterations,
            actionType: thought.action?.type || 'unknown',
            isComplete: observation.isComplete,
            shouldContinue: observation.shouldContinue,
            eventsGenerated,
            totalEvents: finalEventCount,
        });

        if (eventsGenerated > 100) {
            this.logger.error(
                'Excessive event generation detected - breaking loop',
                undefined,
                {
                    eventsGenerated: eventsGenerated.toString(),
                    iteration: iterations,
                    agentName: this.config.agentName,
                    actionType: thought.action?.type || 'unknown',
                },
            );
        }

        if (finalEventCount > 5000) {
            this.logger.warn(
                'Kernel event count approaching quota limit - breaking loop',
                {
                    finalEventCount,
                    iteration: iterations,
                    agentName: this.config.agentName,
                },
            );
        }
    }

    /**
     * THINK phase - Delegate to planner
     */
    private async think(
        context: PlannerExecutionContext,
    ): Promise<AgentThought> {
        if (!this.planner) {
            throw new EngineError('AGENT_ERROR', 'Planner not initialized');
        }

        return this.planner.think(context);
    }

    private async act(action: AgentAction): Promise<ActionResult> {
        try {
            if (isToolCallAction(action)) {
                return await this.executeToolAction(action);
            }

            if (isFinalAnswerAction(action)) {
                return {
                    type: 'final_answer',
                    content: String(action.content),
                };
            }

            if (isNeedMoreInfoAction(action)) {
                return {
                    type: 'final_answer',
                    content: action.question,
                };
            }

            throw new Error(`Unknown action type: ${action.type}`);
        } catch (error) {
            return this.handleActionError(error, action);
        }
    }

    /**
     * Execute tool action with all enterprise features
     */
    private async executeToolAction(
        action: AgentAction,
    ): Promise<ActionResult> {
        if (!this.toolEngine) {
            throw new Error('Tool engine not available');
        }

        if (!isToolCallAction(action)) {
            throw new Error('Action is not a tool call action');
        }

        // ✅ FIX: Generate correlationId ONCE to prevent duplication
        const correlationId = this.generateCorrelationId();

        // ✅ EMIT: Action start event with delivery guarantee
        await this.emitActionStartEvent(action, correlationId);

        let toolResult: unknown;

        try {
            // ✅ EXECUTE: Tool with circuit breaker protection
            toolResult = await this.executeToolWithCircuitBreaker(
                action,
                correlationId,
            );

            // ✅ EMIT: Tool completion event
            await this.emitToolCompletionEvent(
                action,
                toolResult,
                correlationId,
            );

            return {
                type: 'tool_result',
                content: toolResult,
                metadata: {
                    toolName: action.toolName,
                    arguments: action.input,
                    correlationId,
                },
            };
        } catch (error) {
            // ✅ EMIT: Tool error event
            await this.emitToolErrorEvent(action, error, correlationId);

            // ✅ HANDLE: Error with fallback logic
            return await this.handleToolExecutionError(
                error,
                action,
                correlationId,
            );
        }
    }

    /**
     * Execute tool with circuit breaker protection
     */
    private async executeToolWithCircuitBreaker(
        action: AgentAction,
        correlationId: string,
    ): Promise<unknown> {
        if (!isToolCallAction(action)) {
            throw new Error('Action is not a tool call action');
        }

        if (this.kernelHandler) {
            return await this.executeToolViaKernel(action, correlationId);
        } else {
            return await this.executeToolDirectly(action, correlationId);
        }
    }

    /**
     * Execute tool via kernel with circuit breaker
     */
    private async executeToolViaKernel(
        action: AgentAction,
        _correlationId: string,
    ): Promise<unknown> {
        if (!isToolCallAction(action)) {
            throw new Error('Action is not a tool call action');
        }

        if (this.toolCircuitBreaker) {
            // ✅ SIMPLIFIED: Direct tool execution with circuit breaker
            const circuitResult = await this.toolCircuitBreaker.execute(
                () =>
                    this.toolEngine!.executeCall(
                        action.toolName,
                        action.input || {},
                    ),
                {
                    toolName: action.toolName,
                    agentName: this.config.agentName,
                },
            );

            if (circuitResult.error) {
                throw circuitResult.error;
            }

            return circuitResult.result;
        } else {
            // ✅ SIMPLIFIED: Direct tool execution without circuit breaker
            return await this.toolEngine!.executeCall(
                action.toolName,
                action.input || {},
            );
        }
    }

    /**
     * Execute tool directly (fallback)
     */
    private async executeToolDirectly(
        action: AgentAction,
        correlationId: string,
    ): Promise<unknown> {
        if (!isToolCallAction(action)) {
            throw new Error('Action is not a tool call action');
        }

        this.logger.info('🤖 [AGENT] Executing tool directly', {
            toolName: action.toolName,
            agentName: this.config.agentName,
            correlationId,
        });

        if (!this.toolEngine) {
            throw new Error('Tool engine not available');
        }

        if (this.toolCircuitBreaker) {
            // ✅ SIMPLIFIED: No additional retries - Circuit Breaker handles retries
            const circuitResult = await this.toolCircuitBreaker.execute(
                () =>
                    this.toolEngine!.executeCall(
                        action.toolName,
                        action.input || {},
                    ),
                {
                    toolName: action.toolName,
                    agentName: this.config.agentName,
                },
            );

            if (circuitResult.rejected || circuitResult.error) {
                throw circuitResult.error;
            }

            return circuitResult.result;
        } else {
            return await this.toolEngine.executeCall(
                action.toolName,
                action.input || {},
            );
        }
    }

    /**
     * Handle tool execution errors - let Runtime handle retry
     */
    private async handleToolExecutionError(
        error: unknown,
        action: AgentAction,
        correlationId: string,
    ): Promise<ActionResult> {
        if (!isToolCallAction(action)) {
            throw new Error('Action is not a tool call action');
        }

        const errorMessage = (error as Error).message;

        // ✅ SIMPLE: Let Runtime handle retry, AgentCore just logs and returns error
        this.logger.error('🤖 [AGENT] Tool execution failed', error as Error, {
            toolName: action.toolName,
            agentName: this.config.agentName,
            correlationId,
            errorMessage,
        });

        // ✅ CORRECT: Return error as context for agent to handle
        return {
            type: 'error',
            error: errorMessage,
            metadata: {
                actionType: action.type,
                tool: action.toolName,
                correlationId,
                // ✅ Context for agent to understand what happened
                errorContext: {
                    toolName: action.toolName,
                    errorMessage,
                    timestamp: Date.now(),
                },
            },
        };
    }

    /**
     * Emit action start event
     */
    private async emitActionStartEvent(
        action: AgentAction,
        correlationId: string,
    ): Promise<void> {
        if (!this.kernelHandler?.emitAsync) {
            return;
        }

        const actionType = this.getActionType(action);
        const emitResult = await this.kernelHandler.emitAsync(
            'agent.action.start',
            {
                agentName: this.config.agentName,
                actionType,
                correlationId,
            },
            {
                deliveryGuarantee: 'at-least-once',
                correlationId,
            },
        );

        if (!emitResult.success) {
            this.logger.warn('Failed to emit agent.action.start', {
                error: emitResult.error,
                correlationId,
            });
        }
    }

    /**
     * Emit tool completion event
     */
    private async emitToolCompletionEvent(
        action: AgentAction,
        result: unknown,
        correlationId: string,
    ): Promise<void> {
        if (!isToolCallAction(action) || !this.kernelHandler?.emitAsync) {
            return;
        }

        const emitResult = await this.kernelHandler.emitAsync(
            'agent.tool.completed',
            {
                agentName: this.config.agentName,
                toolName: action.toolName,
                correlationId,
                result,
            },
            {
                deliveryGuarantee: 'at-least-once',
                correlationId,
            },
        );

        if (!emitResult.success) {
            this.logger.warn('Failed to emit agent.tool.completed', {
                error: emitResult.error,
                correlationId,
            });
        }
    }

    /**
     * Emit tool error event
     */
    private async emitToolErrorEvent(
        action: AgentAction,
        error: unknown,
        correlationId: string,
    ): Promise<void> {
        if (!isToolCallAction(action) || !this.kernelHandler?.emitAsync) return;

        const emitResult = await this.kernelHandler.emitAsync(
            'agent.tool.error',
            {
                agentName: this.config.agentName,
                toolName: action.toolName,
                correlationId,
                error: (error as Error).message,
            },
            {
                deliveryGuarantee: 'at-least-once',
                correlationId,
            },
        );

        if (!emitResult.success) {
            this.logger.warn('Failed to emit agent.tool.error', {
                error: emitResult.error,
                correlationId,
            });
        }
    }

    /**
     * Handle action execution errors
     */
    private handleActionError(
        error: unknown,
        action: AgentAction,
    ): ActionResult {
        this.logger.error('Action execution failed', error as Error, {
            actionType: action.type,
            tool: isToolCallAction(action) ? action.toolName : 'unknown',
            agentName: this.config.agentName,
        });

        return {
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            metadata: {
                actionType: action.type,
                tool: isToolCallAction(action) ? action.toolName : 'unknown',
            },
        };
    }

    /**
     * OBSERVE phase - Delegate to planner for analysis
     */
    private async observe(
        result: ActionResult,
        context: PlannerExecutionContext,
    ): Promise<ResultAnalysis> {
        if (!this.planner) {
            throw new EngineError('AGENT_ERROR', 'Planner not initialized');
        }

        if (isToolResult(result)) {
            const { parseToolResult } = await import(
                '../../core/utils/tool-result-parser.js'
            );
            const parsed = parseToolResult(result.content);

            if (parsed.isSubstantial && !parsed.isError) {
                const analysis = await this.planner.analyzeResult(
                    result,
                    context,
                );

                return {
                    ...analysis,
                };
            }
        }

        return this.planner.analyzeResult(result, context);
    }

    /**
     * Detect stagnation patterns in execution context
     */
    private detectStagnation(context: PlannerExecutionContext): boolean {
        if (context.history.length < 3) {
            return false;
        }

        const recent = context.history.slice(-3);

        // Check for repeated actions
        const actionTypes = recent.map((history) => history.action.type);
        const uniqueActions = new Set(actionTypes);

        if (uniqueActions.size === 1 && actionTypes[0] !== 'final_answer') {
            this.logger.warn('Repeated action pattern detected', {
                actionType: actionTypes[0],
                count: actionTypes.length,
            });
            return true;
        }

        // Check for repeated failures
        const failures = recent.filter((h) => isErrorResult(h.result));
        if (failures.length >= 2) {
            const errorMessages = failures
                .map((h) => getResultError(h.result))
                .join('; ');
            this.logger.warn('Repeated failure pattern detected', {
                failureCount: failures.length,
                errors: errorMessages,
            });
            return true;
        }

        // Removed confidence-based stagnation check

        return false;
    }

    getPlannerInfo(): {
        type?: PlannerType;
        llmProvider?: string;
        isInitialized: boolean;
    } {
        return {
            type: this.config.planner,
            llmProvider: this.llmAdapter?.getProvider?.()?.name || 'unknown',
            isInitialized: !!this.planner,
        };
    }

    /**
     * ✅ Memory leak prevention - cleanup expired executions
     */
    private cleanupExpiredExecutions(): void {
        const now = Date.now();
        const maxAge = 30 * 60 * 1000; // 30 minutes
        let cleanedCount = 0;

        for (const [key, execution] of this.activeExecutions) {
            const age = now - execution.startTime;

            // Remove old completed/failed executions or very old running ones
            if (
                execution.status === 'completed' ||
                execution.status === 'failed' ||
                age > maxAge
            ) {
                this.activeExecutions.delete(key);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            this.logger.debug('Cleaned up expired executions', {
                cleanedCount,
                remainingCount: this.activeExecutions.size,
            });
        }
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🔍 CONTEXT CAPTURE & OBSERVABILITY HELPERS
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Create planner context - extracted method to avoid object creation in loop
     */
    private createPlannerContext(
        input: string,
        history: Array<{
            thought: AgentThought;
            action: AgentAction;
            result: ActionResult;
            observation: ResultAnalysis;
        }>,
        iterations: number,
        maxIterations: number,
        agentContext: AgentContext,
    ): PlannerExecutionContext {
        // Convert simple history to StepExecution format
        const stepHistory: StepExecution[] = history.map((entry, index) => ({
            stepId: `step-${index + 1}`,
            iteration: index + 1,
            thought: entry.thought,
            action: entry.action,
            status: entry.result.type,
            result: entry.result,
            observation: entry.observation,
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
        }));

        return {
            input,
            history: stepHistory,
            iterations,
            maxIterations,
            plannerMetadata: {
                agentName: agentContext.agentName,
                correlationId: agentContext.correlationId,
                tenantId: agentContext.tenantId,
                thread: agentContext.thread,
                startTime: Date.now(),
            },
            agentContext,
            isComplete: this.isExecutionComplete(history),
            update: () => {}, // Interface compatibility only
            getCurrentSituation: () => this.getCurrentSituation(history),
            getFinalResult: () => this.buildFinalResult(history, iterations),
        };
    }

    /**
     * Check if execution is complete based on history
     */
    private isExecutionComplete(
        executionHistory: Array<{
            thought: AgentThought;
            action: AgentAction;
            result: ActionResult;
            observation: ResultAnalysis;
        }>,
    ): boolean {
        return (
            executionHistory.length > 0 &&
            executionHistory[executionHistory.length - 1]?.observation
                .isComplete === true
        );
    }

    /**
     * Get current situation summary from recent history
     */
    private getCurrentSituation(
        executionHistory: Array<{
            thought: AgentThought;
            action: AgentAction;
            result: ActionResult;
            observation: ResultAnalysis;
        }>,
    ): string {
        const recentHistory = executionHistory.slice(-3);
        return recentHistory
            .map(
                (entry) =>
                    `Action: ${JSON.stringify(entry.action)} -> Result: ${JSON.stringify(entry.result)}`,
            )
            .join('\n');
    }

    /**
     * Build final result from execution history
     */
    private buildFinalResult(
        executionHistory: Array<{
            thought: AgentThought;
            action: AgentAction;
            result: ActionResult;
            observation: ResultAnalysis;
        }>,
        iterations: number,
    ) {
        const lastEntry = executionHistory[executionHistory.length - 1];
        let finalResult = lastEntry?.result;

        if (
            lastEntry?.observation?.feedback &&
            lastEntry.observation.isComplete
        ) {
            finalResult = {
                type: 'final_answer',
                content: lastEntry.observation.feedback,
            };
        }

        return {
            success: lastEntry?.observation.isComplete || false,
            result: finalResult,
            iterations,
            totalTime: Date.now(),
            thoughts: executionHistory.map((h) => h.thought),
            metadata: {
                toolCallsCount: executionHistory.filter(
                    (h) => h.action.type === 'tool_call',
                ).length,
                errorsCount: executionHistory.filter(
                    (h) => h.result.type === 'error',
                ).length,
            },
        };
    }

    // 🕰️ TIMELINE METHODS - Para devolver timeline ao usuário
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Obter timeline visual ASCII para o usuário
     */
    // Timeline removida

    /**
     * Obter relatório completo de execução
     */
    public getExecutionReport(_correlationId: string): string {
        return '';
    }

    /**
     * Exportar timeline como JSON estruturado
     */
    public exportTimelineJSON(_correlationId: string): string {
        return '{}';
    }

    /**
     * Exportar timeline como CSV para análise
     */
    public exportTimelineCSV(_correlationId: string): string {
        return '';
    }

    /**
     * Obter timeline raw do TimelineManager
     */
    public getRawTimeline(_executionId: string): undefined {
        return undefined;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 🏭 FACTORY FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

export function createAgentCore(
    config: AgentCoreConfig,
): AgentCore<unknown, unknown, unknown> {
    return new (class extends AgentCore {
        // Abstract class implementation
    })(config);
}
