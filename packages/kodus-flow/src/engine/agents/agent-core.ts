import {
    createLogger,
    getObservability,
    startAgentSpan,
    applyErrorToSpan,
    markSpanOk,
    ObservabilitySystem,
} from '../../observability/index.js';
import { CircuitBreaker } from '../../runtime/core/circuit-breaker.js';
import { EngineError } from '../../core/errors.js';
import { createAgentError } from '../../core/error-unified.js';
import { IdGenerator } from '../../utils/id-generator.js';
import { ContextBuilder } from '../../core/context/context-builder.js';
import { EnhancedContextBuilder } from '../../core/contextNew/index.js';
import {
    createDefaultMultiKernelHandler,
    MultiKernelHandler,
} from '../core/multi-kernel-handler.js';

import { PlanExecutor } from '../planning/executor/plan-executor.js';
import { parseToolResult } from '../../core/utils/tool-result-parser.js';
import { PlannerFactory } from '../planning/planner-factory.js';
import {
    ActionResult,
    AgentAction,
    AgentCapability,
    AgentContext,
    AgentCoreConfig,
    AgentDefinition,
    AgentExecutionOptions,
    AgentExecutionResult,
    AgentThought,
    AnyEvent,
    ConditionalToolsAction,
    DelegationContext,
    DependencyToolsAction,
    ExecutionPlan,
    getResultError,
    isErrorResult,
    isExecutePlanAction,
    isFinalAnswerAction,
    isNeedMoreInfoAction,
    isToolCallAction,
    isToolResult,
    LLMAdapter,
    MixedToolsAction,
    ParallelToolsAction,
    Planner,
    PlannerExecutionContext,
    PlannerType,
    PlanStep,
    ResultAnalysis,
    SequentialToolsAction,
    StepResult,
    ToolCall,
    ToolId,
    TrackedMessage,
    UNIFIED_STATUS,
    UnifiedStatus,
} from '@/core/types/allTypes.js';
import { ToolEngine } from '../tools/tool-engine.js';

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

    private _agents?: Map<string, AgentDefinition<unknown, unknown, unknown>>;
    private _agentCapabilities?: Map<string, AgentCapability>;
    private _messages?: Map<string, TrackedMessage>;
    private _agentInboxes?: Map<string, TrackedMessage[]>;
    private _activeDelegations?: Map<string, DelegationContext>;
    private _messageHistory?: TrackedMessage[];
    private _deliveryQueue?: TrackedMessage[];
    protected deliveryIntervalId?: NodeJS.Timeout;
    protected isProcessingQueue = false;

    protected activeExecutions = new Map<
        string,
        {
            correlationId: string;
            sessionId?: string;
            startTime: number;
            status: UnifiedStatus;
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
        this.thinkingTimeout = 1600000; // ✅ 1600s thinking timeout

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
            thinkingTimeout: 1600000, // ✅ 1600s thinking timeout
            timeout: 1600000,
            enableFallback: true,
            maxConcurrentAgents: 10,
            enableMultiAgent: true,
            enableTools: true,
            maxChainDepth: 5,
            enableDelegation: true,
            toolTimeout: 1600000, // ✅ 1600s tool timeout
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
        this.thinkingTimeout = this.config.thinkingTimeout || 1200000;

        // Setup memory leak prevention - cleanup expired executions every 5 minutes
        setInterval(() => {
            this.cleanupExpiredExecutions();
        }, 300000);

        this.initializePlannerComponents();

        // ✅ Step execution tracking handled by context layer
        // REMOVED: Duplicated ExecutionTracker - use context.stepExecution

        if (this.config.enableMessaging) {
            this.startDeliveryProcessor();
        }

        if (this.toolEngine) {
            ContextBuilder.getInstance().setToolEngine(this.toolEngine);
            this.logger.info('ToolEngine configured in ContextBuilder', {
                toolCount: this.toolEngine.listTools().length,
            });

            // 🔥 Also verify EnhancedContextBuilder availability
            try {
                EnhancedContextBuilder.getInstance();
                this.logger.info(
                    '✅ EnhancedContextBuilder available for enhanced context',
                );
            } catch (error) {
                this.logger.warn(
                    '⚠️ EnhancedContextBuilder not configured, will use legacy context only',
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                );
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 🔧 CORE EXECUTION LOGIC (COMPARTILHADA)
    // ──────────────────────────────────────────────────────────────────────────

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

        const context = await this.createAgentContext(
            agent.name,
            executionId,
            agentExecutionOptions,
        );

        await this.trackExecutionStart(
            context,
            executionId,
            startTime,
            correlationId,
        );

        await this.addConversationEntry(context, input, agent.name);

        try {
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
        this.logger.debug('Execution started', {
            executionId,
            agentName: context.agentName,
            sessionId: context.sessionId,
            correlationId,
            startTime,
        });

        // ✅ Telemetria será implementada futuramente
        // TODO: Implement proper telemetry event structure
    }

    private async addConversationEntry(
        context: AgentContext,
        input: unknown,
        agentName: string,
    ): Promise<void> {
        if (!context.sessionId) {
            return;
        }

        // ✅ CLEAN ARCHITECTURE: Use conversation interface for agent communication
        await context.conversation.addMessage(
            'user',
            typeof input === 'string' ? input : JSON.stringify(input),
            {
                agentName,
                timestamp: Date.now(),
                source: 'agent-input',
            },
        );

        // Use state directly instead of removed addContextValue
        if (context.state) {
            await context.state.set('runtime', 'conversationEntry', {
                sessionId: context.sessionId,
                input,
                agentName,
                timestamp: Date.now(),
                source: 'agent-core',
                action: 'conversation-start',
            });
        }
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
            execution.status = UNIFIED_STATUS.COMPLETED;
        }

        if (context.executionRuntime) {
            // Store execution completion in state
            await context.state.set('runtime', 'executionCompletion', {
                executionId,
                duration,
                iterations: result.iterations,
                toolsUsed: result.toolsUsed,
                success: true,
                status: 'completed',
                timestamp: Date.now(),
                source: 'agent-core',
                action: 'execution_completed',
                correlationId,
                agentName: context.agentName,
            });
        }
    }

    private async updateConversationEntry(
        context: AgentContext,
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

        // ✅ CLEAN ARCHITECTURE: Use conversation interface for agent communication
        await context.conversation.addMessage(
            'assistant',
            typeof output === 'string' ? output : JSON.stringify(output),
            {
                agentName,
                executionId: metadata.executionId,
                correlationId: metadata.correlationId,
                success: metadata.success,
                timestamp: Date.now(),
                source: 'agent-output',
            },
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
            execution.status = UNIFIED_STATUS.FAILED;
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

        // 3. 🔥 Initialize Enhanced session for ContextNew integration
        try {
            const enhancedContextBuilder = EnhancedContextBuilder.getInstance();
            await enhancedContextBuilder.initializeAgentSession(
                context.sessionId,
                config.tenantId || 'default',
                config.tenantId || 'default',
                {
                    availableTools:
                        this.toolEngine?.listTools().map((t) => t.name) || [],
                    activeConnections: {}, // Will be populated by MCP adapters
                },
            );
            this.logger.debug('✅ Enhanced session initialized', {
                sessionId: context.sessionId,
                toolCount: this.toolEngine?.listTools().length || 0,
            });
        } catch (error) {
            this.logger.warn(
                '⚠️ Enhanced session initialization failed, continuing with legacy context',
                {
                    sessionId: context.sessionId,
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            );
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
        const toolCount = tools.length;

        if (toolCount === 1) {
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
                    context.stepExecution?.addToolCall(
                        currentStepId,
                        tool.toolName,
                        tool.arguments,
                        result,
                        duration,
                    );
                }

                return [{ toolName: tool.toolName, result }];
            } catch (error) {
                const errorMessage =
                    error instanceof Error ? error.message : String(error);
                return [{ toolName: tool.toolName, error: errorMessage }];
            }
        } else if (toolCount <= 3) {
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
                        context.stepExecution?.addToolCall(
                            currentStepId,
                            r.toolName,
                            input,
                            r.result ?? { error: r.error },
                            0,
                        );
                    }
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
                        context.stepExecution?.addToolCall(
                            currentStepId,
                            r.toolName,
                            input,
                            r.result ?? { error: r.error },
                            0,
                        );
                    }
                    // await context.track?.toolUsage?.(
                    //     r.toolName,
                    //     input,
                    //     r.result ?? { error: r.error },
                    //     !r.error,
                    // );
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
                    context.stepExecution?.addToolCall(
                        currentStepId,
                        r.toolName,
                        input,
                        r.result ?? { error: r.error },
                        0,
                    );
                }
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
        return IdGenerator.correlationId();
    }

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
                const iterationResult = await this.executeSingleIteration(
                    plannerInput,
                    iterations,
                    obs,
                    context,
                );

                executionHistory.push(iterationResult);

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

        const finalResult = await this.extractFinalResult(
            finalExecutionContext,
        );

        // ✅ SMART EXECUTION LOGGING - Log complex executions automatically
        await this.logExecutionWithCriteria(context);

        return finalResult as TOutput;
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

        // ✅ START NEW STEP FOR TRACKING - Use context.stepExecution
        const stepId =
            context.stepExecution?.startStep(iterations) ||
            `step-${iterations}-${Date.now()}`;

        // ✅ SIMPLIFICADO: Think
        const thought = await this.executeThinkPhase(
            plannerInput,
            iterations,
            obs,
            context,
            stepId, // ✅ Pass stepId
        );

        // ✅ SIMPLIFICADO: Act
        const result = await this.executeActPhase(
            thought,
            iterations,
            obs,
            context,
            plannerInput,
            stepId, // ✅ Pass stepId
        );

        // ✅ SIMPLIFICADO: Observe
        const observation = await this.executeObservePhase(
            result,
            plannerInput,
            iterations,
            obs,
            context,
            stepId, // ✅ Pass stepId
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
        stepId: string, // ✅ Add stepId parameter
    ): Promise<AgentThought> {
        const thinkSpan = startAgentSpan(obs.telemetry, 'think', {
            agentName: this.config.agentName || 'unknown',
            correlationId: context.correlationId || 'unknown',
            iteration: iterations,
        });

        return obs.telemetry.withSpan(thinkSpan, async () => {
            try {
                const res = await this.think(plannerInput, stepId); // ✅ Pass stepId
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
        stepId: string,
    ): Promise<ActionResult> {
        if (!thought.action) {
            throw new Error('Thought action is undefined');
        }

        // ✅ LIFECYCLE: Transition step from 'initialized' to 'executing'
        if (context.stepExecution) {
            context.stepExecution.startExecuting(
                stepId,
                thought,
                thought.action,
            );
        }

        // ✅ SIMPLIFICADO: Handle execute_plan action
        if (isExecutePlanAction(thought.action)) {
            const res = await this.executePlanAction(
                context,
                plannerInput,
                stepId,
            );

            if (stepId && context.stepExecution) {
                try {
                    context.stepExecution.updateStep(stepId, {
                        action: thought.action,
                        result: res,
                    });
                } catch {}
            }
            return res;
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
                const res = await this.act(thought.action, context, stepId); // ✅ Pass context and stepId
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
        stepId: string, // ✅ Add stepId parameter
    ): Promise<ResultAnalysis> {
        const observeSpan = startAgentSpan(obs.telemetry, 'observe', {
            agentName: this.config.agentName || 'unknown',
            correlationId: context.correlationId || 'unknown',
            iteration: iterations,
        });

        return obs.telemetry.withSpan(observeSpan, async () => {
            try {
                const res = await this.observe(result, plannerInput, stepId); // ✅ Pass stepId
                markSpanOk(observeSpan);
                return res;
            } catch (err) {
                applyErrorToSpan(observeSpan, err, { phase: 'observe' });
                throw err;
            }
        });
    }

    private isExecutionPlan(x: unknown): x is ExecutionPlan {
        return !!x && typeof x === 'object' && 'id' in x && 'steps' in x;
    }

    private async executePlanAction(
        context: AgentContext,
        plannerContext: PlannerExecutionContext,
        stepId?: string,
    ): Promise<ActionResult> {
        const maybePlan = this.planner?.getPlanForContext?.(plannerContext);
        if (!this.isExecutionPlan(maybePlan)) {
            throw new Error('No plan available for execute_plan');
        }
        const plan: ExecutionPlan = maybePlan as ExecutionPlan;

        // act wrapper agora propaga stepId p/ rastreio
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
                    const res = await this.act(action, context, stepId); // <= passa stepId
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

        // tipa o stepList como PlanStep[]
        const resolveArgs = (
            rawArgs: Record<string, unknown>,
            stepList: PlanStep[],
            contextForResolution: PlannerExecutionContext,
        ) =>
            this.planner!.resolveArgs
                ? this.planner!.resolveArgs(
                      rawArgs,
                      stepList,
                      contextForResolution,
                  )
                : Promise.resolve({ args: rawArgs, missing: [] });

        // ✅ FIXED: Use PlannerHandler's managed executor
        const obsRes = this.plannerHandler
            ? await this.plannerHandler.executePlan(
                  plan,
                  plannerContext,
                  act,
                  resolveArgs,
              )
            : await new PlanExecutor(act, resolveArgs, {
                  enableReWOO: true,
              }).run(plan, plannerContext);

        if (stepId && context.stepExecution) {
            try {
                context.stepExecution.updateStep(stepId, {
                    action: {
                        type: 'execute_plan',
                        planId: plan.id,
                    } as AgentAction,
                });
            } catch {}
        }

        let finalResult: ActionResult;
        if (obsRes.type === 'needs_replan') {
            finalResult = {
                type: 'error',
                replanContext: obsRes.replanContext,
                feedback: obsRes.feedback,
                status: 'needs_replan',
                error: obsRes.feedback,
                planExecutionResult: obsRes,
            };
        } else if (obsRes.type === 'execution_complete') {
            finalResult = {
                type: 'final_answer',
                content: obsRes.feedback,
                planExecutionResult: obsRes,
            };
        } else {
            finalResult = {
                type: 'error',
                error: obsRes.feedback,
                planExecutionResult: obsRes,
            };
        }

        if (stepId && context.stepExecution) {
            try {
                context.stepExecution.updateStep(stepId, {
                    result: finalResult,
                });
            } catch {}
        }

        return finalResult;
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

    private async extractFinalResult(
        finalExecutionContext: PlannerExecutionContext | undefined,
    ): Promise<unknown> {
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
        stepId?: string, // ✅ Add optional stepId parameter
    ): Promise<AgentThought> {
        if (!this.planner) {
            throw new EngineError('AGENT_ERROR', 'Planner not initialized');
        }

        const thinkStart = Date.now();

        try {
            let enhancedContext = { ...context, stepId };
            if (stepId && context.agentContext?.stepExecution) {
                const relevantContext =
                    await context.agentContext.stepExecution.getContextForModel(
                        context.agentContext,
                        context.input,
                    );

                enhancedContext = {
                    ...context,
                    stepId,
                    plannerMetadata: {
                        ...context.plannerMetadata,
                        enhancedContext: relevantContext,
                    },
                };
            }

            const thought = await this.planner.think(enhancedContext, stepId);
            const thinkDuration = Date.now() - thinkStart;

            if (stepId && context.agentContext?.stepExecution) {
                context.agentContext.stepExecution.updateStep(stepId, {
                    thought,
                });

                this.logger.debug('Think phase completed', {
                    stepId,
                    thinkDuration,
                    thoughtType: thought.action.type,
                });
            }

            return thought;
        } catch (error) {
            const thinkDuration = Date.now() - thinkStart;

            if (stepId && context.agentContext?.stepExecution) {
                this.logger.warn('Think phase failed', {
                    stepId,
                    thinkDuration,
                    error: String(error),
                });
            }

            throw error;
        }
    }

    private async act(
        action: AgentAction,
        context: AgentContext,
        stepId?: string,
    ): Promise<ActionResult> {
        const actStart = Date.now();

        try {
            let result: ActionResult;

            if (isToolCallAction(action)) {
                const toolStart = Date.now();
                result = await this.executeToolAction(action);
                const toolDuration = Date.now() - toolStart;

                // ✅ Record tool call in step
                if (stepId && context.stepExecution) {
                    context.stepExecution?.addToolCall(
                        stepId,
                        action.toolName,
                        action.input,
                        result,
                        toolDuration,
                    );
                }
            } else if (isFinalAnswerAction(action)) {
                result = {
                    type: 'final_answer',
                    content: String(action.content),
                };
            } else if (isNeedMoreInfoAction(action)) {
                result = {
                    type: 'final_answer',
                    content: action.question,
                };
            } else {
                throw new Error(`Unknown action type: ${action.type}`);
            }

            const actDuration = Date.now() - actStart;

            // ✅ Update step with action result
            if (stepId && context.stepExecution) {
                context.stepExecution?.updateStep(stepId, {
                    action,
                    result,
                });

                this.logger.debug('Act phase completed', {
                    stepId,
                    actDuration,
                    actionType: action.type,
                    resultType: result.type,
                });
            }

            return result;
        } catch (error) {
            const actDuration = Date.now() - actStart;

            if (stepId && context.stepExecution) {
                context.stepExecution?.updateStep(stepId, {
                    result: { type: 'error', error: String(error) },
                });

                this.logger.warn('Act phase failed', {
                    stepId,
                    actDuration,
                    actionType: action.type,
                    error: String(error),
                });
            }

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
     * OBSERVE phase - Delegate to planner for analysis and synthesize response when needed
     */
    private async observe(
        result: ActionResult,
        context: PlannerExecutionContext,
        stepId?: string, // ✅ Add optional stepId parameter
    ): Promise<ResultAnalysis> {
        if (!this.planner) {
            throw new EngineError('AGENT_ERROR', 'Planner not initialized');
        }

        // ✅ CAMADA 1: PLANNER DECIDE
        // Parse tool result for additional context
        const parsed = isToolResult(result)
            ? parseToolResult(result.content)
            : null;

        const observeStart = Date.now();

        const obs = getObservability();
        const analyzeSpan = startAgentSpan(obs.telemetry, 'analyze', {
            agentName: this.config.agentName || 'unknown',
            correlationId: context.plannerMetadata.correlationId || 'unknown',
            attributes: {
                resultType: result?.type || 'unknown',
                isToolResult: isToolResult(result),
                isSubstantial: parsed?.isSubstantial || false,
                hasError: parsed?.isError || false,
            },
        });

        const analysis = await obs.telemetry.withSpan(analyzeSpan, async () => {
            try {
                const analyzeResult = await this.planner!.analyzeResult(
                    result,
                    context,
                );
                markSpanOk(analyzeSpan);
                return analyzeResult;
            } catch (err) {
                applyErrorToSpan(analyzeSpan, err, { phase: 'analyze' });
                throw err;
            }
        });

        // ✅ CAMADA 2: SE DEVE PARAR, SINTETIZA RESPOSTA
        if (analysis.isComplete && analysis.isSuccessful) {
            const synthesizeSpan = startAgentSpan(obs.telemetry, 'synthesize', {
                agentName: this.config.agentName || 'unknown',
                correlationId:
                    context.plannerMetadata.correlationId || 'unknown',
                attributes: { analysisComplete: true },
            });

            const synthesizedResponse = await obs.telemetry.withSpan(
                synthesizeSpan,
                async () => {
                    try {
                        // Check if planner supports createFinalResponse
                        if (!this.planner?.createFinalResponse) {
                            this.logger.warn(
                                'Planner does not support createFinalResponse, skipping synthesis',
                                {
                                    plannerType: this.planner?.constructor.name,
                                },
                            );
                            markSpanOk(synthesizeSpan);
                            return 'Synthesis not supported by this planner';
                        }

                        const response =
                            await this.planner.createFinalResponse(context);
                        markSpanOk(synthesizeSpan);
                        return response;
                    } catch (err) {
                        applyErrorToSpan(synthesizeSpan, err, {
                            phase: 'synthesize',
                        });
                        throw err;
                    }
                },
            );

            const observeDuration = Date.now() - observeStart;

            if (stepId && context.agentContext?.stepExecution) {
                // ✅ LIFECYCLE: Mark step as completed or failed based on synthesized analysis
                const synthesizedAnalysis = {
                    ...analysis,
                    feedback: synthesizedResponse,
                };

                if (analysis.isComplete) {
                    if (analysis.isSuccessful) {
                        context.agentContext.stepExecution.markCompleted(
                            stepId,
                            result,
                            synthesizedAnalysis,
                        );
                    } else {
                        context.agentContext.stepExecution.markFailed(
                            stepId,
                            result,
                            synthesizedAnalysis,
                        );
                    }
                } else {
                    // Still executing, just update the step
                    context.agentContext.stepExecution.updateStep(stepId, {
                        observation: synthesizedAnalysis,
                    });
                }

                this.logger.debug('Observe phase completed (synthesis)', {
                    stepId,
                    observeDuration,
                    analysisComplete: analysis.isComplete,
                    isSuccessful: analysis.isSuccessful,
                    synthesized: true,
                });
            }

            return {
                ...analysis,
                feedback: synthesizedResponse,
            };
        }

        const observeDuration = Date.now() - observeStart;

        if (stepId && context.agentContext?.stepExecution) {
            // ✅ LIFECYCLE: Mark step as completed or failed based on analysis
            if (analysis.isComplete) {
                if (analysis.isSuccessful) {
                    context.agentContext.stepExecution.markCompleted(
                        stepId,
                        result,
                        analysis,
                    );
                } else {
                    context.agentContext.stepExecution.markFailed(
                        stepId,
                        result,
                        analysis,
                    );
                }
            } else {
                // Still executing, just update the step
                context.agentContext.stepExecution.updateStep(stepId, {
                    observation: analysis,
                    duration: observeDuration,
                });
            }

            this.logger.debug('Observe phase completed (continuing)', {
                stepId,
                observeDuration,
                shouldContinue: analysis.shouldContinue,
                isComplete: analysis.isComplete,
                isSuccessful: analysis.isSuccessful,
                synthesized: false,
            });
        }

        return analysis;
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
        const stepHistory: StepResult[] = history.map((entry, index) => ({
            stepId: `step-${index + 1}`,
            iteration: index + 1,
            thought: entry.thought,
            action: entry.action,
            status: entry.result.type,
            result: entry.result,
            observation: entry.observation,
            duration: 0,
            startedAt: Date.now(), // Timestamp placeholder for historical steps
            toolCalls: [],
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
            getCurrentPlan: () =>
                this.planner?.getPlanForContext
                    ? this.planner.getPlanForContext({
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
                          update: () => {},
                          getCurrentSituation: () =>
                              this.getCurrentSituation(history),
                          getFinalResult: () =>
                              this.buildFinalResult(history, iterations),
                      })
                    : null,
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

    private async logExecutionWithCriteria(
        context: AgentContext,
    ): Promise<void> {
        if (!context.stepExecution) {
            this.logger.debug('No stepExecution available for logging');
            return;
        }

        const steps = context.stepExecution.getAllSteps();
        if (steps.length === 0) {
            this.logger.debug('No steps to log');
            return;
        }

        const startTime =
            typeof steps[0]?.thought?.metadata?.startTime === 'number'
                ? steps[0].thought.metadata.startTime
                : Date.now() - 1000; // Default to 1 second ago if no start time
        const endTime = Date.now();

        // Calculate execution criteria for smart persistence
        const executionCriteria = {
            hasToolCalls: steps.some(
                (step) => step.toolCalls && step.toolCalls.length > 0,
            ),
            executionTimeMs: endTime - startTime,
            multipleSteps: steps.length > 1,
            hasErrors: steps.some((step) => !step.observation?.isSuccessful),
            isDebugMode: this.config.debug || false,
        };

        // Get SimpleExecutionLogger from ContextBuilder
        const contextBuilder = ContextBuilder.getInstance();
        const executionLogger = contextBuilder
            .getServices()
            .getExecutionLogger();

        // Log execution with smart persistence logic
        const logResult = executionLogger.logExecution(
            context.invocationId,
            context.sessionId,
            context.agentName,
            startTime,
            endTime,
            steps,
            executionCriteria,
        );

        // Auto-persist if criteria met
        if (logResult.shouldPersist) {
            // ✅ ENHANCED EXECUTION CONTEXT: Criar estrutura rica para persistence
            const executionSummary =
                context.stepExecution?.getExecutionSummary();
            const allSteps = context.stepExecution?.getAllSteps() || [];

            // ✅ COLLECT PLAN DATA from planner if available
            const planData: Record<string, unknown> = {};
            if (this.planner && 'getCurrentPlan' in this.planner) {
                try {
                    const plannerWithGetPlan = this.planner as {
                        getCurrentPlan?: (context: unknown) => unknown;
                    };
                    const currentPlan = plannerWithGetPlan.getCurrentPlan?.(
                        this.executionContext,
                    ) as Record<string, unknown> | undefined;
                    if (
                        currentPlan &&
                        typeof currentPlan === 'object' &&
                        'id' in currentPlan
                    ) {
                        const planId = String(currentPlan.id);
                        const metadata = currentPlan.metadata as
                            | Record<string, unknown>
                            | undefined;
                        planData[planId] = {
                            goal: currentPlan.goal,
                            strategy: currentPlan.strategy,
                            steps: currentPlan.steps || [],
                            signals: currentPlan.signals || metadata?.signals,
                            reasoning: currentPlan.reasoning,
                            status: currentPlan.status,
                            executionTime:
                                currentPlan.updatedAt && currentPlan.createdAt
                                    ? Number(currentPlan.updatedAt) -
                                      Number(currentPlan.createdAt)
                                    : 0,
                            createdAt: currentPlan.createdAt,
                            updatedAt: currentPlan.updatedAt,
                        };
                    }
                } catch (error) {
                    // Planner não suporta getCurrentPlan ou erro na extração
                    this.logger.debug(
                        'Could not extract plan data for persistence',
                        { error },
                    );
                }
            }

            // ✅ COLLECT AGENT DECISIONS from execution history
            const decisions: Array<{
                step: string;
                decision: string;
                reasoning: string;
                fallback?: string;
                timestamp: number;
            }> = [];

            allSteps.forEach((step, index) => {
                if (step.thought?.reasoning && step.action) {
                    const decision = {
                        step: `step-${index}`,
                        decision: step.action.type,
                        reasoning: step.thought.reasoning,
                        timestamp: Date.now(),
                        fallback: undefined as string | undefined,
                    };

                    // Detectar decisões específicas - manter tipos válidos
                    if (step.action.type === 'execute_plan') {
                        decision.decision = 'execute_plan';
                    }
                    if (
                        step.result?.type === 'error' &&
                        step.observation?.isSuccessful
                    ) {
                        decision.decision = 'final_answer'; // Recovery bem-sucedido
                        decision.fallback = 'continue_execution';
                    }

                    decisions.push(decision);
                }
            });

            // ✅ HIERARCHICAL STRUCTURE: Organizar dados hierarquicamente
            const enhancedExecutionData = {
                session: {
                    summary: executionSummary,
                    logResult: logResult.summary,
                },
                planning: {
                    plans: planData,
                    decisions: decisions,
                },
                tooling: {
                    availableTools:
                        context.availableTools?.map((t) => t.name) || [],
                    toolCallsAttempted: allSteps.reduce(
                        (acc, step) => acc + (step.toolCalls?.length || 0),
                        0,
                    ),
                    toolCallsSuccessful: allSteps.reduce(
                        (acc, step) =>
                            acc +
                            (step.toolCalls?.filter((tc) => tc.result).length ||
                                0),
                        0,
                    ),
                },
                synthesis: {
                    totalSteps: allSteps.length,
                    completedSteps: allSteps.filter(
                        (s) => s.observation?.isComplete,
                    ).length,
                    strategy: 'enhanced_context_persistence',
                    persistedAt: Date.now(),
                },
                steps: allSteps, // ✅ Manter steps para compatibilidade
            };

            await context.state.set(
                'execution',
                'enhanced',
                enhancedExecutionData,
            );
            await context.state.persist?.('execution');

            this.logger.info('Complex execution persisted', {
                executionId: context.invocationId,
                complexity: logResult.summary.complexityScore,
                duration: logResult.summary.totalDuration,
                toolCalls: logResult.summary.toolCallsCount,
                stepsCount: allSteps.length,
            });
        }
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
