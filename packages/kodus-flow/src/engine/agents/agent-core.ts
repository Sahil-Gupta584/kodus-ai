/**
 * @module engine/agents/agent-core
 * @description Core compartilhado para agentes com suporte multi-agent avançado
 *
 * RESPONSABILIDADES BÁSICAS:
 * ✅ State, Context, Logging
 * ✅ Communication, Router, Coordination
 * ✅ Thinking, Actions, Tools
 * ✅ Event tracking, Observability
 * ✅ Multi-agent support (BÁSICO + AVANÇADO)
 *
 * NOVAS FUNCIONALIDADES INTEGRADAS:
 * ✅ Coordenação avançada (sequential, parallel, competition, etc.)
 * ✅ Sistema de mensagens entre agentes
 * ✅ Critérios de seleção de agentes
 * ✅ Métricas e performance tracking
 * ✅ Workflow integration
 *
 * NÃO INCLUI:
 * ❌ Lifecycle management (já existe AgentLifecycleHandler)
 * ❌ Workflow execution (responsabilidade do executor)
 * ❌ Snapshot management (responsabilidade do executor)
 */

import { createLogger } from '../../observability/index.js';
import { CircuitBreaker } from '../../runtime/core/circuit-breaker.js';
import { EngineError } from '../../core/errors.js';
import { createAgentError } from '../../core/error-unified.js';
import { IdGenerator } from '../../utils/id-generator.js';
import { contextBuilder } from '../../core/context/context-builder.js';
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
    ToolCallAction,
    DelegateToAgentAction,
    AgentExecutionOptions,
    AgentExecutionResult,
    ParallelToolsAction,
    SequentialToolsAction,
    ConditionalToolsAction,
    MixedToolsAction,
    DependencyToolsAction,
} from '../../core/types/agent-types.js';

import type {
    AnyEvent,
    EventType,
    EventPayloads,
} from '../../core/types/events.js';

import { createEvent } from '../../core/types/events.js';

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
} from '../planning/planner-factory.js';

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

    // Multi-Agent Support (AVANÇADO)
    enableAdvancedCoordination?: boolean;
    enableMessaging?: boolean;
    enableMetrics?: boolean;
    maxHistorySize?: number;
    deliveryRetryInterval?: number;
    defaultMaxAttempts?: number;

    // Tool Integration
    enableTools?: boolean;
    toolTimeout?: number;
    maxToolRetries?: number;

    // Kernel Integration - sempre habilitado
    enableKernelIntegration?: boolean;

    // Factory customization moved to ContextBuilder level
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

    // Kernel integration
    protected kernelHandler?: MultiKernelHandler;

    // Circuit breaker for tool execution resilience
    protected toolCircuitBreaker?: CircuitBreaker;

    // === RETRY LOGIC REMOVED ===
    // ✅ Removed retryWithBackoff method - Circuit Breaker handles retries now
    // This eliminates retry amplification: Agent → Circuit Breaker → Runtime

    // === CIRCUIT BREAKER INITIALIZATION ===
    private initializeCircuitBreaker(): void {
        // Create observability system for circuit breaker
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

    // NEW: Think→Act→Observe components
    protected planner?: Planner;
    protected llmAdapter?: LLMAdapter;
    protected executionContext?: PlannerExecutionContext;

    // NEW: Current context for action processing
    // ✅ REMOVER: Variável não utilizada
    // private currentAgentContext?: AgentContext;

    // Context creation moved to initialization phase

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
        // Factory customization removed - use ContextBuilder.getInstance() directly

        // Apply defaults
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

        // Initialize circuit breaker for tool execution
        this.initializeCircuitBreaker();

        // KernelHandler sempre habilitado - será injetado via setKernelHandler()
        // Apenas criar local KernelHandler se tenant for 'isolated'
        if (this.config.tenantId === 'isolated') {
            this.logger.warn(
                'Creating isolated KernelHandler - this should be rare',
            );
            this.kernelHandler = createDefaultMultiKernelHandler(
                this.config.tenantId,
            );
        }
        this.thinkingTimeout = this.config.thinkingTimeout || 60000; // ✅ 60s thinking timeout

        // Setup memory leak prevention - cleanup expired executions every 5 minutes
        setInterval(() => {
            this.cleanupExpiredExecutions();
        }, 300000);

        // Initialize state manager

        // NEW: Initialize Think→Act→Observe components
        this.initializePlannerComponents();

        // Initialize advanced multi-agent features
        if (this.config.enableMessaging) {
            this.startDeliveryProcessor();
        }

        // ✅ NEW: Configure ToolEngine in ContextBuilder if available
        if (this.toolEngine) {
            contextBuilder.setToolEngine(this.toolEngine);
            this.logger.info('ToolEngine configured in ContextBuilder', {
                toolCount: this.toolEngine.listTools().length,
            });
        }

        this.logger.info('AgentCore created', {
            mode: this.singleAgentDefinition ? 'single' : 'multi',
            agentName,
            tenantId: this.config.tenantId,
            features: {
                multiAgent: this.config.enableMultiAgent,
                advancedCoordination: this.config.enableAdvancedCoordination,
                messaging: this.config.enableMessaging,
                tools: this.config.enableTools,
                toolEngineConfigured: !!this.toolEngine,
            },
        });
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
        debugger;
        const startTime = Date.now();
        const executionId = IdGenerator.executionId();
        const { correlationId, sessionId } = agentExecutionOptions || {};

        this.logger.info('Agent execution started', {
            agentName: agent.name,
            correlationId,
            executionId,
            sessionId: sessionId || 'will-be-determined-by-threadId',
            inputType: typeof input,
        });

        // Create context - session will be determined by threadId, not sessionId
        const context = await this.createAgentContext(
            agent.name,
            executionId,
            agentExecutionOptions,
        );

        // Track execution with actual sessionId from context
        //TODO Ainda precisa
        // this.activeExecutions.set(executionId, {
        //     correlationId: correlationId || '',
        //     sessionId: context.sessionId,
        //     startTime,
        //     status: 'running',
        // });

        // 🚀 Track execution start using context tracking API
        //TODO Porque plannerStep?
        await context.track.plannerStep({
            type: 'execution_start',
            executionId,
            startTime,
            status: 'running',
            agentName: agent.name,
            correlationId,
        });

        // ✅ REMOVED: agentIdentity is now set during createAgentContext

        // 🚀 Add conversation entry if session exists
        //TODO: Aqui não precisa recuperar?
        if (context.sessionId) {
            sessionService.addConversationEntry(
                context.sessionId,
                input,
                null, // output será adicionado depois
                agent.name,
            );

            // Inform ExecutionRuntime about this conversation entry
            await context.executionRuntime?.addContextValue({
                type: 'session',
                key: 'conversationEntry',
                value: {
                    sessionId: context.sessionId,
                    input,
                    agentName: agent.name,
                    timestamp: Date.now(),
                },
                metadata: {
                    source: 'agent-core',
                    action: 'conversation-start',
                    sessionId: context.sessionId,
                },
            });
        }

        try {
            // Process agent thinking (lógica principal)
            const result = await this.processAgentThinking(
                agent,
                input,
                context,
            );

            const duration = Date.now() - startTime;

            // Update execution status
            const execution = this.activeExecutions.get(executionId);
            if (execution) {
                execution.status = 'completed';
            }

            // 🚀 Add execution completion to ExecutionRuntime
            if (context.executionRuntime) {
                await context.executionRuntime.addContextValue({
                    type: 'execution',
                    key: 'completion',
                    value: {
                        executionId,
                        duration,
                        iterations: result.iterations,
                        toolsUsed: result.toolsUsed,
                        success: true, // Assume success if no error thrown
                        status: 'completed',
                        timestamp: Date.now(),
                    },
                    metadata: {
                        source: 'agent-core',
                        action: 'execution_completed',
                        correlationId,
                        agentName: agent.name,
                    },
                });
            }

            // Atualizar saída na conversa se tiver sessionId
            if (context.sessionId) {
                sessionService.addConversationEntry(
                    context.sessionId,
                    input,
                    result.output,
                    agent.name,
                    { correlationId, executionId, success: true },
                );
            }

            return {
                success: true,
                data: result.output,
                reasoning: result.reasoning,
                correlationId,
                sessionId: context.sessionId,
                status: 'COMPLETED',
                executionId,
                duration,
                metadata: {
                    agentName: agent.name,
                    iterations: result.iterations,
                    toolsUsed: result.toolsUsed,
                    thinkingTime: duration,
                },
            };
        } catch (error) {
            const duration = Date.now() - startTime;

            // Update execution status
            const execution = this.activeExecutions.get(executionId);
            if (execution) {
                execution.status = 'failed';
            }

            this.logger.error('Agent execution failed', error as Error, {
                agentName: agent.name,
                correlationId,
                executionId,
                sessionId: context.sessionId,
                duration,
            });

            throw error;
        }
    }

    /**
     * Processamento de thinking do agente (lógica principal)
     * MIGRATED: Now uses Think→Act→Observe pattern
     */
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
        debugger;
        // Agents REQUIRE planner and LLM - no fallback
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

        // Use Think→Act→Observe pattern - the ONLY way
        const result = await this.executeThinkActObserve(input, context);

        // Get execution context for metrics
        const executionContext = this.executionContext;
        const finalResult = executionContext?.getFinalResult();

        return {
            output: result,
            reasoning:
                finalResult?.thoughts?.[finalResult.thoughts.length - 1]
                    ?.reasoning || 'Think→Act→Observe completed',
            iterations: finalResult?.iterations || 1,
            toolsUsed: this.countToolCallsInThoughts(
                finalResult?.thoughts || [],
            ),
            events: this.extractEventsFromExecutionContext(executionContext),
        };
    }

    /**
     * Count tool calls in thoughts array
     */
    private countToolCallsInThoughts(thoughts: AgentThought[]): number {
        return thoughts.filter(
            (thought) => thought.action?.type === 'tool_call',
        ).length;
    }

    /**
     * Processamento de ações do agente
     */
    protected async processAction(
        thought: AgentThought<unknown>,
        context: AgentContext,
    ): Promise<{
        toolUsed: boolean;
        events: AnyEvent[];
        updatedInput?: unknown;
    }> {
        const { correlationId } = context.agentExecutionOptions || {};

        const events: AnyEvent[] = [];
        let toolUsed = false;
        let updatedInput: unknown | undefined;

        if (thought.action) {
            const actionType = this.getActionType(thought.action);

            this.logger.debug('Processing agent action', {
                agentName: context.agentName,
                actionType,
                correlationId,
            });

            // Emit action processing event with delivery guarantee
            if (this.kernelHandler) {
                // ✅ Use kernelHandler.emitAsync() instead of accessing runtime directly
                if (this.kernelHandler.emitAsync) {
                    const emitResult = await this.kernelHandler.emitAsync(
                        'agent.action.start',
                        {
                            agentName: context.agentName,
                            actionType,
                            correlationId,
                            sessionId: context.sessionId,
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
                } else {
                    // Fallback to basic emit
                    this.kernelHandler.emit('agent.action.start', {
                        agentName: context.agentName,
                        actionType,
                        correlationId,
                        sessionId: context.sessionId,
                    });
                }
            }

            // Handle tool calls
            if (
                actionType === 'tool_call' &&
                this.config.enableTools &&
                this.toolEngine
            ) {
                const toolAction = thought.action as ToolCallAction;
                const toolStartTime = Date.now();

                // Extract toolName and input from both possible structures
                let toolName: string = '';
                let toolInput: unknown;

                try {
                    if ('toolName' in toolAction && toolAction.toolName) {
                        // Direct structure: { type: 'tool_call', toolName: 'name', input: {...} }
                        toolName = toolAction.toolName;
                        toolInput = toolAction.input;
                    } else if (
                        toolAction.content &&
                        typeof toolAction.content === 'object'
                    ) {
                        // Content structure: { type: 'tool_call', content: { toolName: 'name', arguments: {...} } }
                        const content = toolAction.content as {
                            toolName?: string;
                            arguments?: unknown;
                        };
                        toolName = content.toolName || '';
                        toolInput = content.arguments;
                    } else {
                        throw new Error(
                            'Invalid tool action structure - missing toolName',
                        );
                    }

                    if (!toolName) {
                        throw new Error(
                            'Tool name is required for tool_call action',
                        );
                    }

                    this.logger.debug('Executing tool', {
                        agentName: context.agentName,
                        toolName,
                        correlationId,
                    });

                    // ✅ Execute tool via events instead of direct call
                    const toolResult = this.kernelHandler
                        ? await this.kernelHandler.requestToolExecution(
                              toolName,
                              toolInput,
                              { correlationId },
                          )
                        : await this.toolEngine.executeTool(
                              toolName,
                              toolInput,
                          );

                    // Update context with tool result
                    await context.executionRuntime.setState(
                        'main',
                        'lastToolResult',
                        toolResult,
                    );

                    // Store more detailed tool context in state
                    await context.executionRuntime.setState(
                        'tools',
                        `${toolName}_history`,
                        {
                            lastUsed: Date.now(),
                            input: toolInput,
                            output: toolResult,
                            success: true,
                            duration: Date.now() - toolStartTime,
                        },
                    );

                    // Store tool usage pattern in memory for learning
                    await context.executionRuntime.storeToolUsagePattern(
                        toolName,
                        toolInput,
                        toolResult,
                        true, // success
                        Date.now() - toolStartTime,
                    );
                    toolUsed = true;

                    // 🚀 Add tool result to ExecutionRuntime for rich context
                    if (context.executionRuntime) {
                        await context.executionRuntime.addContextValue({
                            type: 'tools',
                            key: `${toolName}_result`,
                            value: {
                                toolName,
                                parameters: toolInput,
                                result: toolResult,
                                success: true, // Assume success if no error thrown
                                timestamp: Date.now(),
                            },
                            metadata: {
                                source: 'agent-core',
                                action: 'tool_execution',
                                correlationId,
                                agentName: context.agentName,
                            },
                        });
                    }

                    // Update input for next iteration with tool result
                    // This is crucial for the agent to receive the tool result as input
                    updatedInput = toolResult;

                    // Emit tool completion event with delivery guarantee
                    if (this.kernelHandler) {
                        // ✅ Use kernelHandler.emitAsync() instead of accessing runtime directly
                        if (this.kernelHandler.emitAsync) {
                            const emitResult =
                                await this.kernelHandler.emitAsync(
                                    'agent.tool.completed',
                                    {
                                        agentName: context.agentName,
                                        toolName: toolName,
                                        correlationId,
                                        sessionId: context.sessionId,
                                        result: toolResult,
                                    },
                                    {
                                        deliveryGuarantee: 'at-least-once',
                                        correlationId,
                                    },
                                );

                            if (!emitResult.success) {
                                this.logger.warn(
                                    'Failed to emit agent.tool.completed',
                                    {
                                        error: emitResult.error,
                                        correlationId,
                                    },
                                );
                            }
                        } else {
                            // Fallback to basic emit
                            this.kernelHandler.emit('agent.tool.completed', {
                                agentName: context.agentName,
                                toolName: toolName,
                                correlationId,
                                sessionId: context.sessionId,
                            });
                        }
                    }

                    this.logger.debug('Tool execution completed', {
                        agentName: context.agentName,
                        toolName: toolName,
                        correlationId,
                    });
                } catch (error) {
                    // Emit tool error event with delivery guarantee
                    if (this.kernelHandler) {
                        // ✅ Use kernelHandler.emitAsync() instead of accessing runtime directly
                        if (this.kernelHandler.emitAsync) {
                            const emitResult =
                                await this.kernelHandler.emitAsync(
                                    'agent.tool.error',
                                    {
                                        agentName: context.agentName,
                                        toolName: toolName,
                                        correlationId,
                                        sessionId: context.sessionId,
                                        error: (error as Error).message,
                                    },
                                    {
                                        deliveryGuarantee: 'at-least-once',
                                        correlationId,
                                    },
                                );

                            if (!emitResult.success) {
                                this.logger.warn(
                                    'Failed to emit agent.tool.error',
                                    {
                                        error: emitResult.error,
                                        correlationId,
                                    },
                                );
                            }
                        } else {
                            // Fallback to basic emit
                            this.kernelHandler.emit('agent.tool.error', {
                                agentName: context.agentName,
                                toolName: toolName,
                                correlationId,
                                sessionId: context.sessionId,
                                error: (error as Error).message,
                            });
                        }
                    }

                    this.logger.error('Tool execution failed', error as Error, {
                        agentName: context.agentName,
                        toolName: toolName,
                        correlationId,
                    });

                    // 🚀 Add tool error to ExecutionRuntime for learning
                    if (context.executionRuntime) {
                        await context.executionRuntime.addContextValue({
                            type: 'tools',
                            key: `${toolName}_error`,
                            value: {
                                toolName,
                                parameters: toolInput,
                                success: false,
                                error: (error as Error).message,
                                timestamp: Date.now(),
                            },
                            metadata: {
                                source: 'agent-core',
                                action: 'tool_execution_failed',
                                correlationId,
                                agentName: context.agentName,
                            },
                        });
                    }

                    throw error;
                }
            }

            // Handle agent delegation
            if (
                actionType === 'delegate_to_agent' &&
                this.config.enableMultiAgent
            ) {
                const delegateAction = thought.action as DelegateToAgentAction;

                try {
                    const targetAgent = this.agents.get(
                        delegateAction.agentName,
                    );
                    if (!targetAgent) {
                        throw new EngineError(
                            'AGENT_ERROR',
                            `Target agent not found: ${delegateAction.agentName}`,
                        );
                    }

                    const delegationResult = await this.executeAgent(
                        targetAgent,
                        delegateAction.input,
                        context.agentExecutionOptions,
                    );

                    // Update context with delegation result
                    await context.executionRuntime.setState(
                        'main',
                        'delegationResult',
                        delegationResult,
                    );

                    this.logger.debug('Agent delegation completed', {
                        agentName: context.agentName,
                        targetAgent: delegateAction.agentName,
                        correlationId,
                    });
                } catch (error) {
                    this.logger.error(
                        'Agent delegation failed',
                        error as Error,
                        {
                            agentName: context.agentName,
                            targetAgent: delegateAction.agentName,
                            correlationId,
                        },
                    );

                    throw error;
                }
            }

            // ===== 🚀 NEW: PARALLEL TOOL EXECUTION ACTIONS =====

            // Handle parallel tools execution
            if (
                actionType === 'parallel_tools' &&
                this.config.enableTools &&
                this.toolEngine
            ) {
                const parallelAction = thought.action as ParallelToolsAction;
                try {
                    const results = await this.processParallelToolsAction(
                        parallelAction,
                        context,
                    );
                    updatedInput = results;
                    toolUsed = true;
                } catch (error) {
                    this.logger.error(
                        'Parallel tools execution failed',
                        error as Error,
                        {
                            agentName: context.agentName,
                            correlationId,
                        },
                    );
                    throw error;
                }
            }

            // Handle sequential tools execution
            if (
                actionType === 'sequential_tools' &&
                this.config.enableTools &&
                this.toolEngine
            ) {
                const sequentialAction =
                    thought.action as SequentialToolsAction;
                try {
                    const results = await this.processSequentialToolsAction(
                        sequentialAction,
                        context,
                    );
                    updatedInput = results;
                    toolUsed = true;
                } catch (error) {
                    this.logger.error(
                        'Sequential tools execution failed',
                        error as Error,
                        {
                            agentName: context.agentName,
                            correlationId,
                        },
                    );
                    throw error;
                }
            }

            // Handle conditional tools execution
            if (
                actionType === 'conditional_tools' &&
                this.config.enableTools &&
                this.toolEngine
            ) {
                const conditionalAction =
                    thought.action as ConditionalToolsAction;
                try {
                    const results = await this.processConditionalToolsAction(
                        conditionalAction,
                        context,
                    );
                    updatedInput = results;
                    toolUsed = true;
                } catch (error) {
                    this.logger.error(
                        'Conditional tools execution failed',
                        error as Error,
                        {
                            agentName: context.agentName,
                            correlationId,
                        },
                    );
                    throw error;
                }
            }

            // Handle mixed tools execution (adaptive strategy)
            if (
                actionType === 'mixed_tools' &&
                this.config.enableTools &&
                this.toolEngine
            ) {
                const mixedAction = thought.action as MixedToolsAction;
                try {
                    const results = await this.processMixedToolsAction(
                        mixedAction,
                        context,
                    );
                    updatedInput = results;
                    toolUsed = true;
                } catch (error) {
                    this.logger.error(
                        'Mixed tools execution failed',
                        error as Error,
                        {
                            agentName: context.agentName,
                            correlationId,
                        },
                    );
                    throw error;
                }
            }

            // Handle dependency-based tools execution
            if (
                actionType === 'dependency_tools' &&
                this.config.enableTools &&
                this.toolEngine
            ) {
                const dependencyAction =
                    thought.action as DependencyToolsAction;
                try {
                    const results = await this.processDependencyToolsAction(
                        dependencyAction,
                        context,
                    );
                    updatedInput = results;
                    toolUsed = true;
                } catch (error) {
                    this.logger.error(
                        'Dependency tools execution failed',
                        error as Error,
                        {
                            agentName: context.agentName,
                            correlationId,
                        },
                    );
                    throw error;
                }
            }
        }

        return { toolUsed, events, updatedInput };
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
        debugger;
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
        const context = await contextBuilder.createAgentContext(config);

        // 2. ✅ ELEGANT: Enrich context with AgentDefinition data
        if (this.singleAgentDefinition?.identity) {
            context.agentIdentity = this.singleAgentDefinition.identity;
        }

        return context;
    }

    protected emitEvent<K extends EventType>(
        eventType: K,
        data: EventPayloads[K],
    ): AnyEvent {
        const event = createEvent(eventType, data);
        this.eventHistory.push(event);

        this.logger.debug('Event emitted', {
            eventType,
            eventId: event.id,
        });

        return event;
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

        this.logger.warn('No tools found in action', {
            actionType: action.type,
            hasTools: !!action.tools,
            hasContent: !!action.content,
            hasContentTools: !!(
                action.content &&
                typeof action.content === 'object' &&
                action.content !== null &&
                'tools' in action.content
            ),
        });

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

                return [{ toolName: tool.toolName, result }];
            } catch (error) {
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
            return this.kernelHandler
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
        } else {
            // Large number of tools - execute sequentially to avoid resource issues
            const sequentialAction: SequentialToolsAction = {
                type: 'sequential_tools',
                tools: tools,
                reasoning: `Adaptive strategy: sequential execution for ${toolCount} tools`,
            };
            return this.kernelHandler
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

    /**
     * Get tools in the correct format for LLMs (OpenAI, Anthropic, etc.)
     * This method ensures tools are properly formatted for LLM function calling
     */
    getToolsForLLM(): Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    }> {
        return this.toolEngine?.getToolsForLLM() || [];
    }

    /**
     * Set ToolEngine (for dependency injection)
     */
    setToolEngine(toolEngine: ToolEngine): void {
        this.toolEngine = toolEngine;

        // Configure ToolEngine in ContextBuilder
        contextBuilder.setToolEngine(toolEngine);

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

        this.deliveryIntervalId = setInterval(() => {
            this.processDeliveryQueue();
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
        debugger;
        if (!this.planner || !this.llmAdapter) {
            throw new EngineError(
                'AGENT_ERROR',
                'Think→Act→Observe requires planner and LLM adapter. Provide llmAdapter in config.',
            );
        }
        let iterations = 0;
        const maxIterations = this.config.maxThinkingIterations || 15;
        const inputString = String(input);
        // ✅ REMOVER: Assignment desnecessário
        // this.currentAgentContext = context;

        // ✅ NEW: Use ContextBuilder - initialize execution history
        const executionHistory: Array<{
            thought: AgentThought;
            action: AgentAction;
            result: ActionResult;
            observation: ResultAnalysis;
        }> = [];

        // ✅ PERFORMANCE: Create context ONCE before loop
        this.executionContext = await this.createExecutionContext(
            inputString,
            context,
            executionHistory,
            iterations,
        );

        while (iterations < maxIterations) {
            // ✅ PERFORMANCE: Update context instead of recreating
            this.updateExecutionContext(
                this.executionContext,
                executionHistory,
                iterations,
            );

            if (this.executionContext.isComplete) break;
            try {
                // Get initial event count from kernel
                const kernel = this.kernelHandler
                    ?.getMultiKernelManager()
                    ?.getKernelByNamespace('agent');
                const initialEventCount = kernel?.getState().eventCount || 0;

                // 1. THINK - Planner decides next action
                const thinkStartTime = Date.now();
                const thought = await this.think(this.executionContext);
                const thinkDuration = Date.now() - thinkStartTime;

                // 2. ACT - Execute the decided action
                const actStartTime = Date.now();
                if (!thought.action) {
                    throw new Error('Thought action is undefined');
                }
                const result = await this.act(thought.action);
                const actDuration = Date.now() - actStartTime;

                // ✅ REMOVER: Debugger statement
                // debugger;
                // 3. OBSERVE - Analyze result and decide if continue
                const observeStartTime = Date.now();
                const observation = await this.observe(
                    result,
                    this.executionContext,
                );
                const observeDuration = Date.now() - observeStartTime;

                // ✅ REMOVER: Debugger statement
                // debugger;
                // ✅ NEW: Add to execution history directly
                executionHistory.push({
                    thought,
                    action: thought.action,
                    result,
                    observation,
                });

                iterations++;

                // ✅ REMOVER: Debugger statement
                // debugger;
                // Get final event count from kernel
                const finalEventCount = kernel?.getState().eventCount || 0;
                const eventsGenerated = finalEventCount - initialEventCount;

                // Enhanced logging with performance metrics
                this.logger.debug('Think→Act→Observe iteration completed', {
                    iteration: iterations,
                    thinkDuration,
                    actDuration,
                    observeDuration,
                    actionType: thought.action?.type || 'unknown',
                    confidence: thought.confidence,
                    isComplete: observation.isComplete,
                    shouldContinue: observation.shouldContinue,
                    eventsGenerated,
                    totalEvents: finalEventCount,
                });

                // 🚨 CRITICAL: Check for excessive event generation
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
                    break;
                }

                // 🚨 CRITICAL: Check for kernel quota approaching limit
                if (finalEventCount > 5000) {
                    this.logger.warn(
                        'Kernel event count approaching quota limit - breaking loop',
                        {
                            finalEventCount,
                            iteration: iterations,
                            agentName: this.config.agentName,
                        },
                    );
                    break;
                }

                // 5. CHECK - Early termination conditions
                if (observation.isComplete) {
                    this.logger.info('Think→Act→Observe completed', {
                        iterations,
                        agentName: this.config.agentName,
                        totalDuration:
                            Date.now() -
                            (this.executionContext.plannerMetadata
                                .startTime as number),
                        finalAction: thought.action?.type || 'unknown',
                    });
                    break;
                }

                if (!observation.shouldContinue) {
                    this.logger.info('Think→Act→Observe stopped by planner', {
                        iterations,
                        reason: observation.feedback,
                        agentName: this.config.agentName,
                        totalDuration:
                            Date.now() -
                            (this.executionContext.plannerMetadata
                                .startTime as number),
                    });
                    break;
                }

                // Check for stagnation patterns
                if (this.detectStagnation(this.executionContext)) {
                    this.logger.warn('Stagnation detected, breaking loop', {
                        iterations,
                        agentName: this.config.agentName,
                    });
                    break;
                }
            } catch (error) {
                // Try to continue with error handling
                if (iterations >= maxIterations - 1) {
                    throw error;
                }
            }
        }

        const finalResult = this.executionContext?.getFinalResult();

        if (finalResult && finalResult.success) {
            // Extract the content from the result if it's a final_answer
            const result = finalResult.result;
            if (
                result &&
                typeof result === 'object' &&
                'type' in result &&
                'content' in result
            ) {
                if (result.type === 'final_answer') {
                    return result.content as TOutput;
                }
            }
            return finalResult?.result as TOutput;
        } else {
            // ✅ ADD: Log detalhado para debug
            this.logger.debug('❌ THINK→ACT→OBSERVE FAILED', {
                historyLength: this.executionContext?.history.length || 0,
                iterations: iterations,
                trace: {
                    source: 'agent-core',
                    step: 'think-act-observe-failed',
                    timestamp: Date.now(),
                },
            });

            // ✅ IMPROVED: Try to extract useful information from execution history
            let lastUsefulResult: unknown = null;

            if (this.executionContext?.history.length) {
                const history = this.executionContext.history;

                // Simple approach: get the last result with content
                for (let i = history.length - 1; i >= 0; i--) {
                    const entry = history[i];
                    if (entry?.result) {
                        // Check if result has content property
                        if ('content' in entry.result && entry.result.content) {
                            lastUsefulResult = entry.result.content;
                            break;
                        }
                    }
                }

                const lastEntry = history[history.length - 1];
                this.logger.debug('❌ LAST EXECUTION ENTRY', {
                    thought: lastEntry?.thought,
                    action: lastEntry?.action,
                    result: lastEntry?.result,
                    observation: lastEntry?.observation,
                    trace: {
                        source: 'agent-core',
                        step: 'last-execution-entry',
                        timestamp: Date.now(),
                    },
                });
            }

            // ✅ IMPROVED: Return helpful partial result instead of throwing error
            if (lastUsefulResult) {
                return lastUsefulResult as TOutput;
            }

            // ✅ IMPROVED: Generic helpful message instead of technical error
            const friendlyMessage = `Desculpe, tive algumas dificuldades para processar completamente sua solicitação. Tentei ${iterations} vezes, mas encontrei alguns problemas técnicos. Posso tentar de uma forma diferente se você quiser reformular sua pergunta?`;

            return friendlyMessage as TOutput;
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

            // ✅ REMOVER: Chamadas que dependem de contexto não disponível
            // NEW: Parallel tools action
            // if (action.type === 'parallel_tools') {
            //     const results = await this.processParallelToolsAction(
            //         action as ParallelToolsAction,
            //         this.getCurrentAgentContext(),
            //     );
            //     return {
            //         type: 'tool_results',
            //         content: results,
            //     };
            // }

            // NEW: Sequential tools action
            // if (action.type === 'sequential_tools') {
            //     const results = await this.processSequentialToolsAction(
            //         action as SequentialToolsAction,
            //         this.getCurrentAgentContext(),
            //     );
            //     return {
            //         type: 'tool_results',
            //         content: results,
            //     };
            // }

            // NEW: Conditional tools action
            // if (action.type === 'conditional_tools') {
            //     const results = await this.processConditionalToolsAction(
            //         action as ConditionalToolsAction,
            //         this.getCurrentAgentContext(),
            //     );
            //     return {
            //         type: 'tool_results',
            //         content: results,
            //     };
            // }

            // NEW: Mixed tools action
            // if (action.type === 'mixed_tools') {
            //     const results = await this.processMixedToolsAction(
            //         action as MixedToolsAction,
            //         this.getCurrentAgentContext(),
            //     );
            //     return {
            //         type: 'tool_results',
            //         content: results,
            //     };
            // }

            // NEW: Dependency tools action
            // if (action.type === 'dependency_tools') {
            //     const results = await this.processDependencyToolsAction(
            //         action as DependencyToolsAction,
            //         this.getCurrentAgentContext(),
            //     );
            //     return {
            //         type: 'tool_results',
            //         content: results,
            //     };
            // }

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
        correlationId: string,
    ): Promise<unknown> {
        if (!isToolCallAction(action)) {
            throw new Error('Action is not a tool call action');
        }

        if (this.toolCircuitBreaker) {
            // ✅ SIMPLIFIED: No additional retries - Circuit Breaker handles retries
            const circuitResult = await this.toolCircuitBreaker.execute(
                () =>
                    this.kernelHandler!.requestToolExecution(
                        action.toolName,
                        action.input || {},
                        {
                            correlationId: correlationId, // ✅ FIX: Use same correlationId
                            timeout: 30000, // ✅ UNIFIED: 30s timeout
                        },
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
            // Fallback without circuit breaker
            return await this.kernelHandler!.requestToolExecution(
                action.toolName,
                action.input || {},
                {
                    correlationId: correlationId, // ✅ FIX: Use same correlationId
                    timeout: 15000, // ✅ UNIFIED: 15s timeout
                },
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
        if (!this.kernelHandler?.emitAsync) return;

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
        if (!isToolCallAction(action) || !this.kernelHandler?.emitAsync) return;

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
        // ✅ REMOVER: Debugger statement
        // debugger;
        if (!this.planner) {
            throw new EngineError('AGENT_ERROR', 'Planner not initialized');
        }

        this.logger.debug('Observe phase started', {
            resultType: result.type,
            hasError: isErrorResult(result),
            agentName: this.config.agentName,
        });

        // ✅ SIMPLE: Early success detection
        if (result.type === 'final_answer') {
            return {
                isComplete: true,
                isSuccessful: true,
                feedback: 'Task completed successfully',
                shouldContinue: false,
            };
        }

        // ✅ REMOVER: Debugger statement
        // debugger;

        // ✅ ENHANCED: Use smart tool result parser
        if (isToolResult(result)) {
            const { parseToolResult } = await import(
                '../../core/utils/tool-result-parser.js'
            );
            const parsed = parseToolResult(result.content);

            this.logger.debug('Tool result parsed', {
                isSubstantial: parsed.isSubstantial,
                isError: parsed.isError,
                textLength: parsed.metadata.textLength,
                source: parsed.metadata.source,
                hasStructuredData: parsed.metadata.hasStructuredData,
                trace: {
                    source: 'agent-core',
                    step: 'tool-result-analysis',
                    timestamp: Date.now(),
                },
            });

            if (parsed.isSubstantial && !parsed.isError) {
                // Tool gave substantial response, might be sufficient
                const analysis = await this.planner.analyzeResult(
                    result,
                    context,
                );
                return {
                    ...analysis,
                    feedback: `Received substantial tool result (${parsed.metadata.textLength} chars, source: ${parsed.metadata.source}): ${analysis.feedback}`,
                    suggestedNextAction:
                        'Consider if this result answers the user question',
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

        // Check for low confidence patterns
        const confidences = recent
            .map((h) => h.thought.confidence)
            .filter((c): c is number => c !== undefined);

        if (confidences.length >= 2) {
            const avgConfidence =
                confidences.reduce((a, b) => a + b, 0) / confidences.length;
            if (avgConfidence < 0.3) {
                this.logger.warn('Low confidence pattern detected', {
                    averageConfidence: avgConfidence,
                    confidences,
                });
                return true;
            }
        }

        return false;
    }

    /**
     * Create execution context for Think→Act→Observe
     * ✅ NEW: Uses ContextBuilder with dynamic history and iterations
     */
    private async createExecutionContext(
        input: string,
        agentContext: AgentContext,
        history: Array<{
            thought: AgentThought;
            action: AgentAction;
            result: ActionResult;
            observation: ResultAnalysis;
        }>,
        iterations: number,
    ): Promise<PlannerExecutionContext> {
        // ✅ NEW: Use ContextBuilder with dynamic context
        const plannerContext: PlannerExecutionContext = {
            input,
            history, // ✅ Use passed history (accumulated)
            iterations, // ✅ Use passed iterations (current)
            maxIterations: this.config.maxThinkingIterations || 15,
            plannerMetadata: {
                agentName: agentContext.agentName,
                correlationId: agentContext.correlationId,
                tenantId: agentContext.tenantId,
                thread: agentContext.thread,
                startTime: Date.now(),
            },
            // ✅ NEW: Pass AgentContext with ContextBuilder APIs
            agentContext,
            update(_thought, _result, _observation) {
                // ✅ NEW: No longer needed - history managed externally
                // This method kept for backward compatibility
            },
            getCurrentSituation() {
                const recentHistory = history.slice(-3);
                return recentHistory
                    .map(
                        (entry) =>
                            `Action: ${JSON.stringify(entry.action)} -> Result: ${JSON.stringify(entry.result)}`,
                    )
                    .join('\n');
            },
            get isComplete() {
                return (
                    history.length > 0 &&
                    history[history.length - 1]?.observation.isComplete === true
                );
            },
            getFinalResult() {
                const lastEntry = history[history.length - 1];

                // Check if the last observation has a synthesized response in feedback
                let finalResult = lastEntry?.result;
                if (
                    lastEntry?.observation?.feedback &&
                    lastEntry.observation.isComplete
                ) {
                    // Use the synthesized feedback as the final result
                    finalResult = {
                        type: 'final_answer',
                        content: lastEntry.observation.feedback,
                    };
                }

                return {
                    success: lastEntry?.observation.isComplete || false,
                    result: finalResult,
                    iterations: 0,
                    totalTime: Date.now(),
                    thoughts: history.map((h) => h.thought),
                    metadata: {
                        toolCallsCount: history.filter(
                            (h) => h.action.type === 'tool_call',
                        ).length,
                        errorsCount: history.filter(
                            (h) => h.result.type === 'error',
                        ).length,
                    },
                };
            },
        };

        return plannerContext;
    }

    /**
     * ✅ PERFORMANCE: Update execution context instead of recreating
     */
    private updateExecutionContext(
        context: PlannerExecutionContext,
        history: Array<{
            thought: AgentThought;
            action: AgentAction;
            result: ActionResult;
            observation: ResultAnalysis;
        }>,
        iterations: number,
    ): void {
        // Update mutable properties without object recreation
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (context as any).history = history; // Update reference
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (context as any).iterations = iterations;

        // Update computed properties
        if (typeof context.getCurrentSituation === 'function') {
            // getCurrentSituation will use updated history automatically
        }

        if (typeof context.getFinalResult === 'function') {
            // getFinalResult will use updated history automatically
        }
    }

    /**
     * Get planner info for debugging
     */
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
     * Extract events from execution context
     */
    private extractEventsFromExecutionContext(
        context?: PlannerExecutionContext,
    ): AnyEvent[] {
        if (!context) {
            return [];
        }

        const events: AnyEvent[] = [];

        // Extract events from history entries
        for (const entry of context.history) {
            // Create events from thought-action-result cycle
            if (entry.thought) {
                events.push({
                    id: `thought-${Date.now()}-${Math.random()}`,
                    type: 'agent.thought',
                    threadId:
                        context.plannerMetadata?.correlationId || 'unknown',
                    data: {
                        reasoning: entry.thought.reasoning,
                        action: entry.thought.action,
                        agentName: context.plannerMetadata?.agentName,
                    },
                    ts: Date.now(),
                });
            }

            if (entry.action) {
                events.push({
                    id: `action-${Date.now()}-${Math.random()}`,
                    type: 'agent.action',
                    threadId:
                        context.plannerMetadata?.correlationId || 'unknown',
                    data: {
                        action: entry.action,
                        agentName: context.plannerMetadata?.agentName,
                    },
                    ts: Date.now(),
                });
            }

            if (entry.result) {
                events.push({
                    id: `result-${Date.now()}-${Math.random()}`,
                    type: 'agent.result',
                    threadId:
                        context.plannerMetadata?.correlationId || 'unknown',
                    data: {
                        result: entry.result,
                        agentName: context.plannerMetadata?.agentName,
                    },
                    ts: Date.now(),
                });
            }

            if (entry.observation) {
                events.push({
                    id: `observation-${Date.now()}-${Math.random()}`,
                    type: 'agent.observation',
                    threadId:
                        context.plannerMetadata?.correlationId || 'unknown',
                    data: {
                        observation: entry.observation,
                        agentName: context.plannerMetadata?.agentName,
                    },
                    ts: Date.now(),
                });
            }
        }

        return events;
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
