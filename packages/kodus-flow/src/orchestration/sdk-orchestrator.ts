import { createLogger, getObservability } from '../observability/index.js';
import { EngineError } from '../core/errors.js';
import { ToolEngine } from '../engine/tools/tool-engine.js';
import { AgentEngine } from '../engine/agents/agent-engine.js';
import { AgentExecutor } from '../engine/agents/agent-executor.js';
import { IdGenerator } from '../utils/id-generator.js';
import {
    createDefaultMultiKernelHandler,
    createMultiKernelHandler,
} from '../engine/core/multi-kernel-handler.js';
import { ContextBuilder } from '../core/context/context-builder.js';
import { safeJsonSchemaToZod } from '../core/utils/json-schema-to-zod.js';
import {
    AgentConfig,
    AgentCoreConfig,
    AgentData,
    AgentDefinition,
    AgentExecutionOptions,
    agentIdentitySchema,
    ContextBuilderConfig,
    defineTool,
    MCPAdapter,
    OrchestrationConfig,
    OrchestrationConfigInternal,
    OrchestrationResult,
    SessionId,
    Thread,
    ToolConfig,
    ToolDefinition,
    ToolId,
    UserContext,
} from '@/core/types/allTypes.js';

export class SDKOrchestrator {
    private agents = new Map<string, AgentData>();
    private toolEngine: ToolEngine;
    private mcpAdapter?: MCPAdapter;
    private logger = createLogger('sdk-orchestrator');
    private config: Required<OrchestrationConfigInternal>;
    private kernelHandler?: ReturnType<typeof createDefaultMultiKernelHandler>;

    constructor(config: OrchestrationConfig) {
        if (config.observability) {
            getObservability(config.observability);
        }

        if (!config.llmAdapter) {
            throw new EngineError(
                'ENGINE_AGENT_INITIALIZATION_FAILED',
                `
🚨 LLM Adapter is REQUIRED!

SDKOrchestrator creates intelligent agents that need LLM to:
- Think and reason about problems
- Make decisions about actions
- Adapt strategies based on observations

Without LLM, you can't create agents - only scripts.
Provide an LLMAdapter to create real agents.

Example:
const orchestrator = new SDKOrchestrator({
    llmAdapter: createLLMAdapter(geminiProvider)
});
            `,
            );
        }

        this.config = {
            llmAdapter: config.llmAdapter,
            tenantId: config.tenantId || 'default-tenant',
            mcpAdapter: config.mcpAdapter || null,
            enableObservability: config.enableObservability ?? true,
            defaultTimeout: config.defaultTimeout || 60000, //UNIFIED: 60s timeout
            defaultPlanner: config.defaultPlanner || 'plan-execute',
            defaultMaxIterations: config.defaultMaxIterations || 15,
            storage: config.storage || {},
            observability: config.observability || {},
            kernel: config.kernel || {},
        };

        this.mcpAdapter = config.mcpAdapter;
        this.toolEngine = new ToolEngine();

        this.logger.info(
            'About to configure ContextBuilder with storage config',
            {
                hasStorageConfig: !!this.config.storage,
                storageKeys: Object.keys(this.config.storage || {}),
            },
        );
        this.configureContextBuilder();

        if (this.config.kernel?.performance?.autoSnapshot) {
            this.kernelHandler = createMultiKernelHandler({
                tenantId: this.config.tenantId,
                observability: { enabled: true },
                agent: {
                    enabled: true,
                    performance: {
                        enableBatching: true,
                        enableCaching: true,
                        autoSnapshot:
                            this.config.kernel.performance.autoSnapshot,
                    },
                },
                loopProtection: { enabled: true },
            });
        } else {
            //TODO: Remove this when we have a default persistor config
            // this.kernelHandler = createDefaultMultiKernelHandler(
            //     this.config.tenantId,
            //     {
            //         type: this.config.persistorConfig.type,
            //         options: this.config.persistorConfig,
            //     },
            // );
        }

        this.logger.info('Clean SDKOrchestrator initialized', {
            tenantId: this.config.tenantId,
            llmProvider:
                this.config.llmAdapter.getProvider?.()?.name || 'unknown',
            defaultPlanner: this.config.defaultPlanner,
            hasMCP: !!this.mcpAdapter,
        });
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🤖 AGENT MANAGEMENT - APENAS COORDENAÇÃO
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Create agent - APENAS delega para AgentEngine/AgentExecutor
     */
    async createAgent(
        config: AgentConfig,
    ): Promise<AgentDefinition<unknown, unknown, unknown>> {
        this.logger.info('Creating agent', {
            name: config.name,
            planner:
                config.plannerOptions?.planner || this.config.defaultPlanner,
            executionMode: config.executionMode || 'simple',
        });

        try {
            agentIdentitySchema.parse(config.identity);
        } catch (error) {
            throw new EngineError(
                'ENGINE_AGENT_INITIALIZATION_FAILED',
                `Invalid agent identity: ${error instanceof Error ? error.message : 'Unknown validation error'}`,
            );
        }

        const agentDefinition: AgentDefinition<unknown, unknown, unknown> = {
            name: config.name,
            identity: config.identity,
            think: async () => {
                throw new EngineError(
                    'AGENT_ERROR',
                    'Agent think function should be replaced by AgentCore',
                );
            },
            config: {
                name: config.name,
                identity: config.identity,
                enableSession: config.enableSession ?? true,
                enableState: config.enableState ?? true,
                enableMemory: config.enableMemory ?? true,
                maxIterations: config.maxIterations,
                timeout: config.timeout,
            },
        };

        const agentCoreConfig: AgentCoreConfig = {
            tenantId: this.config.tenantId,
            agentName: config.name,
            planner:
                config?.plannerOptions?.planner || this.config.defaultPlanner,
            llmAdapter: this.config.llmAdapter, // Pass LLM adapter
            maxThinkingIterations:
                config.maxIterations || this.config.defaultMaxIterations,
            enableKernelIntegration: true,
            debug: process.env.NODE_ENV === 'development',
            monitoring: this.config.enableObservability,
            plannerOptions: config?.plannerOptions,
        };

        let agentInstance:
            | AgentEngine<unknown, unknown, unknown>
            | AgentExecutor<unknown, unknown, unknown>;

        if (config.executionMode === 'workflow') {
            agentInstance = new AgentExecutor(
                agentDefinition,
                this.toolEngine,
                agentCoreConfig,
            );

            this.logger.info('Agent created via AgentExecutor (workflow)', {
                agentName: config.name,
                planner:
                    config?.plannerOptions?.planner ||
                    this.config.defaultPlanner,
            });
        } else {
            agentInstance = new AgentEngine(
                agentDefinition,
                this.toolEngine,
                agentCoreConfig,
            );

            this.logger.info('Agent created via AgentEngine (simple)', {
                agentName: config.name,
                planner:
                    config?.plannerOptions?.planner ||
                    this.config.defaultPlanner,
            });
        }

        // Register agent
        this.agents.set(config.name, {
            instance: agentInstance,
            definition: agentDefinition,
            config: {
                executionMode: config.executionMode || 'simple',
                hooks: {}, // No hooks for clean implementation
            },
        });

        // Inject kernel handler
        if (this.kernelHandler) {
            if (!this.kernelHandler.isInitialized()) {
                await this.kernelHandler.initialize();
            }

            await this.injectKernelHandler(agentInstance);
            // CRITICAL: Also inject kernel handler into ToolEngine for event handling
            this.toolEngine.setKernelHandler(this.kernelHandler);
        }

        this.logger.info('Agent registered successfully', {
            agentName: config.name,
            totalAgents: this.agents.size,
        });

        return agentDefinition;
    }

    /**
     * Call agent - APENAS encontra e executa
     */
    async callAgent(
        agentName: string,
        input: unknown,
        context?: {
            thread?: Thread;
            userContext?: UserContext;
            sessionId?: SessionId;
        },
    ): Promise<OrchestrationResult<unknown>> {
        const startTime = Date.now();
        const correlationId = IdGenerator.correlationId();
        const obs = getObservability();
        const obsContext = obs.createContext(correlationId);
        obsContext.tenantId = this.config.tenantId;
        obsContext.metadata = { agentName };
        obs.setContext(obsContext);

        this.logger.info('🚀 SDK ORCHESTRATOR - Agent execution started', {
            agentName,
            correlationId,
            inputType: typeof input,
            hasContext: !!context,
            hasThread: !!context?.thread,
            tenantId: this.config.tenantId,
            trace: {
                source: 'sdk-orchestrator',
                step: 'callAgent-start',
                timestamp: Date.now(),
            },
        });

        try {
            this.logger.debug('🔍 SDK ORCHESTRATOR - Looking up agent', {
                agentName,
                correlationId,
                registeredAgents: Array.from(this.agents.keys()),
                trace: {
                    source: 'sdk-orchestrator',
                    step: 'agent-lookup',
                    timestamp: Date.now(),
                },
            });

            const agentData = this.agents.get(agentName);

            if (!agentData) {
                this.logger.error(
                    '❌ SDK ORCHESTRATOR - Agent not found',
                    new Error(`Agent '${agentName}' not found`),
                    {
                        agentName,
                        correlationId,
                        availableAgents: Array.from(this.agents.keys()),
                        trace: {
                            source: 'sdk-orchestrator',
                            step: 'agent-not-found',
                            timestamp: Date.now(),
                        },
                    },
                );
                throw new EngineError(
                    'AGENT_ERROR',
                    `Agent '${agentName}' not found`,
                );
            }

            // Generate thread if not provided
            const thread = context?.thread || {
                id: `thread-${IdGenerator.callId()}`,
                metadata: {
                    description: 'Auto-generated thread',
                    type: 'auto',
                },
            };

            this.logger.info('🧵 SDK ORCHESTRATOR - Thread prepared', {
                agentName,
                correlationId,
                threadId: thread.id,
                threadType: thread.metadata?.type,
                isAutoGenerated: !context?.thread,
                trace: {
                    source: 'sdk-orchestrator',
                    step: 'thread-prepared',
                    timestamp: Date.now(),
                },
            });

            // Execute agent
            const executionOptions: AgentExecutionOptions = {
                ...context,
                agentName,
                correlationId,
                tenantId: this.config.tenantId,
            } as AgentExecutionOptions;

            this.logger.info('⚡ SDK ORCHESTRATOR - Starting agent execution', {
                agentName,
                correlationId,
                executionMode: agentData.config.executionMode,
                isAgentEngine: agentData.instance instanceof AgentEngine,
                isAgentExecutor: agentData.instance instanceof AgentExecutor,
                trace: {
                    source: 'sdk-orchestrator',
                    step: 'agent-execution-start',
                    timestamp: Date.now(),
                },
            });

            // Root trace with error recording
            const result = await obs.trace(
                'orchestration.call_agent',
                async () => {
                    if (agentData.instance instanceof AgentEngine) {
                        this.logger.debug(
                            '🔧 SDK ORCHESTRATOR - Executing via AgentEngine',
                            {
                                agentName,
                                correlationId,
                                trace: {
                                    source: 'sdk-orchestrator',
                                    step: 'agent-engine-execute',
                                    timestamp: Date.now(),
                                },
                            },
                        );
                        return await agentData.instance.execute(
                            input,
                            executionOptions,
                        );
                    }
                    if (agentData.instance instanceof AgentExecutor) {
                        this.logger.debug(
                            '🔧 SDK ORCHESTRATOR - Executing via AgentExecutor (workflow)',
                            {
                                agentName,
                                correlationId,
                                trace: {
                                    source: 'sdk-orchestrator',
                                    step: 'agent-executor-execute',
                                    timestamp: Date.now(),
                                },
                            },
                        );
                        return await agentData.instance.executeViaWorkflow(
                            input,
                            executionOptions,
                        );
                    }

                    // Unknown instance type
                    return Promise.reject(
                        new EngineError(
                            'AGENT_ERROR',
                            `Unknown agent instance type for '${agentName}'`,
                        ),
                    );
                },
                {
                    correlationId,
                    tenantId: this.config.tenantId,
                    metadata: { agentName },
                },
            );

            if (
                !(agentData.instance instanceof AgentEngine) &&
                !(agentData.instance instanceof AgentExecutor)
            ) {
                this.logger.error(
                    '❌ SDK ORCHESTRATOR - Unknown agent instance type',
                    new Error(`Unknown agent instance type for '${agentName}'`),
                    {
                        agentName,
                        correlationId,
                        instanceType: typeof agentData.instance,
                        trace: {
                            source: 'sdk-orchestrator',
                            step: 'unknown-agent-type',
                            timestamp: Date.now(),
                        },
                    },
                );
                throw new EngineError(
                    'AGENT_ERROR',
                    `Unknown agent instance type for '${agentName}'`,
                );
            }

            const duration = Date.now() - startTime;

            this.logger.info(
                '✅ SDK ORCHESTRATOR - Agent execution completed successfully',
                {
                    agentName,
                    correlationId,
                    success: result.success,
                    duration,
                    resultType: typeof result.data,
                    hasData: !!result.data,
                    trace: {
                        source: 'sdk-orchestrator',
                        step: 'agent-execution-success',
                        timestamp: Date.now(),
                    },
                },
            );

            return {
                success: true,
                result: result.data,
                context: {
                    agentName,
                    correlationId,
                    threadId: thread.id,
                    duration,
                    executionMode: agentData.config.executionMode,
                },
                metadata: {
                    ...result?.metadata,
                },
            };
        } catch (error) {
            const duration = Date.now() - startTime;

            this.logger.error(
                '❌ SDK ORCHESTRATOR - Agent execution failed',
                error as Error,
                {
                    agentName,
                    correlationId,
                    duration,
                    errorType:
                        error instanceof Error
                            ? error.constructor.name
                            : typeof error,
                    errorMessage:
                        error instanceof Error ? error.message : String(error),
                    trace: {
                        source: 'sdk-orchestrator',
                        step: 'agent-execution-error',
                        timestamp: Date.now(),
                    },
                },
            );

            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                context: {
                    agentName,
                    correlationId,
                    duration,
                },
                metadata: {
                    agentName,
                    correlationId,
                    error:
                        error instanceof Error
                            ? error.message
                            : 'Unknown error',
                },
            };
        } finally {
            // Clear context to avoid leaking across executions
            obs.clearContext();
        }
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🛠️ TOOL MANAGEMENT - APENAS COORDENAÇÃO
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Create tool - APENAS delega para ToolEngine
     */
    createTool(config: ToolConfig): ToolDefinition<unknown, unknown> {
        const toolDefinition = defineTool<unknown, unknown>({
            name: config.name,
            description: config.description,
            inputSchema: config.inputSchema,
            outputSchema: config.outputSchema,
            execute: config.execute,
            categories: config.categories || [],
            dependencies: config.dependencies || [],
            tags: [
                ...(config.title ? [`title:${config.title}`] : []),
                ...(config.annotations
                    ? [`annotations:${JSON.stringify(config.annotations)}`]
                    : []),
            ],
        });

        this.toolEngine.registerTool(toolDefinition);

        this.logger.info('Tool created and registered', {
            toolName: config.name,
            description: config.description,
            title: config.title,
            hasAnnotations: !!config.annotations,
        });

        return toolDefinition;
    }

    async callTool(
        toolName: string,
        input: unknown,
        options?: {
            correlationId?: string;
            tenantId?: string;
        },
    ): Promise<OrchestrationResult<unknown>> {
        const startTime = Date.now();
        const correlationId =
            options?.correlationId || IdGenerator.correlationId();
        const obs = getObservability();
        const obsContext = obs.createContext(correlationId);
        obsContext.tenantId = options?.tenantId || this.config.tenantId;
        obsContext.metadata = { toolName };
        obs.setContext(obsContext);

        this.logger.info('Tool execution started', {
            toolName,
            correlationId,
            tenantId: obsContext.tenantId,
        });

        try {
            const result = await this.toolEngine.executeCall(
                toolName as ToolId,
                input,
                {
                    correlationId,
                    tenantId: obsContext.tenantId,
                },
            );
            const duration = Date.now() - startTime;

            return {
                success: true,
                result,
                context: {
                    toolName,
                    correlationId,
                    duration,
                },
                metadata: {
                    toolName,
                    correlationId,
                },
            };
        } catch (error) {
            const duration = Date.now() - startTime;

            this.logger.error('Tool execution failed', error as Error, {
                toolName,
                correlationId,
                tenantId: obsContext.tenantId,
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                context: {
                    toolName,
                    correlationId,
                    duration,
                },
                metadata: {
                    toolName,
                    correlationId,
                    error:
                        error instanceof Error
                            ? error.message
                            : 'Unknown error',
                },
            };
        } finally {
            // Clear context to avoid leaking across executions
            obs.clearContext();
        }
    }

    /**
     * Get registered tools with full metadata for context engineering
     */
    getRegisteredTools(): Array<{
        name: string;
        title?: string;
        description: string;
        categories?: string[];
        schema?: unknown;
        outputSchema?: unknown;
        examples?: unknown[];
        plannerHints?: unknown;
        annotations?: Record<string, unknown>;
    }> {
        return this.toolEngine.listTools().map((tool) => {
            // ✅ ADDED: Extract title and annotations from tags
            const title = tool.tags
                ?.find((tag) => tag.startsWith('title:'))
                ?.replace('title:', '');
            const annotationsTag = tool.tags?.find((tag) =>
                tag.startsWith('annotations:'),
            );
            const annotations = annotationsTag
                ? JSON.parse(annotationsTag.replace('annotations:', ''))
                : undefined;

            return {
                name: tool.name,
                title,
                description: tool.description || `Tool: ${tool.name}`,
                categories: tool.categories,
                schema: tool.inputSchema,
                outputSchema: tool.outputSchema,
                annotations,
            };
        });
    }

    getRegisteredToolsForLLM(): Array<{
        name: string;
        description: string;
        categories?: string[];
        schema?: unknown;
        examples?: unknown[];
        plannerHints?: unknown;
    }> {
        return this.toolEngine.getToolsForLLM().map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        }));
    }

    getToolsForLLM(): Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    }> {
        return this.toolEngine.getToolsForLLM();
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🔌 MCP INTEGRATION - APENAS COORDENAÇÃO
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Register MCP tools - APENAS delega para MCP adapter
     */
    async registerMCPTools(): Promise<void> {
        if (!this.mcpAdapter) {
            this.logger.warn(
                'MCP adapter not configured - cannot register tools',
            );
            return;
        }

        try {
            const mcpTools = await this.mcpAdapter.getTools();
            this.logger.info(`Registering ${mcpTools.length} MCP tools`);

            for (const mcpTool of mcpTools) {
                const zodSchema = safeJsonSchemaToZod(mcpTool.inputSchema);
                const output = mcpTool?.outputSchema
                    ? safeJsonSchemaToZod(mcpTool.outputSchema)
                    : undefined;

                this.createTool({
                    name: mcpTool.name,
                    title: mcpTool.title,
                    description:
                        mcpTool.description ||
                        mcpTool.title ||
                        `MCP Tool: ${mcpTool.name}`,
                    inputSchema: zodSchema,
                    outputSchema: output,
                    execute: async (input: unknown) => {
                        const result = await this.mcpAdapter!.executeTool(
                            mcpTool.name,
                            input as Record<string, unknown>,
                        );
                        return { result };
                    },
                    categories: ['mcp'],
                    annotations: mcpTool.annotations,
                });
            }

            this.logger.info(
                `Successfully registered ${mcpTools.length} MCP tools`,
            );
        } catch (error) {
            this.logger.error('Failed to register MCP tools', error as Error);
            throw error;
        }
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 📊 GETTERS & UTILITIES
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Get orchestrator stats
     */
    getStats() {
        return {
            tenantId: this.config.tenantId,
            agentCount: this.agents.size,
            toolCount: this.toolEngine.getAvailableTools().length,
            llmProvider:
                this.config.llmAdapter.getProvider?.()?.name || 'unknown',
            defaultPlanner: this.config.defaultPlanner,
            mcpConnected: !!this.mcpAdapter,
        };
    }

    /**
     * List agents
     */
    listAgents(): string[] {
        return Array.from(this.agents.keys());
    }

    /**
     * Get agent status
     */
    getAgentStatus(agentName: string) {
        const agentData = this.agents.get(agentName);
        if (!agentData) return null;

        return {
            name: agentName,
            type: agentData.config.executionMode,
            plannerInfo:
                agentData.instance instanceof AgentEngine
                    ? (
                          agentData.instance as {
                              getPlannerInfo?: () => unknown;
                          }
                      ).getPlannerInfo?.()
                    : { isInitialized: false },
        };
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🔧 INTERNAL HELPERS
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Configure ContextBuilder with storage settings
     */
    private configureContextBuilder(): void {
        this.logger.info('🔍 [DEBUG] Starting configureContextBuilder', {
            hasStorageInConfig: !!this.config.storage,
            storageKeys: Object.keys(this.config.storage || {}),
            fullStorageConfig: this.config.storage,
        });

        const contextConfig = this.getStorageConfig();

        this.logger.info(
            '🔍 [DEBUG] Generated contextConfig from getStorageConfig',
            {
                contextConfig,
                hasMemory: !!contextConfig.memory,
                hasSession: !!contextConfig.session,
                hasSnapshot: !!contextConfig.snapshot,
                memoryConnectionString:
                    contextConfig.memory?.adapterConfig?.connectionString,
                sessionConnectionString:
                    contextConfig.session?.connectionString,
            },
        );

        try {
            ContextBuilder.configure(contextConfig);

            this.logger.info(
                'ContextBuilder configured with storage settings',
                {
                    hasMemoryConfig: !!contextConfig.memory,
                    hasSessionConfig: !!contextConfig.session,
                    memoryAdapter: contextConfig.memory?.adapterType,
                    sessionAdapter: contextConfig.session?.adapterType,
                },
            );
        } catch (error) {
            this.logger.error(
                'Failed to configure ContextBuilder',
                error instanceof Error ? error : new Error('Unknown error'),
            );
        }
    }

    getStorageConfig(): ContextBuilderConfig {
        const result: ContextBuilderConfig = {};

        // ✅ Convert memory config to ContextBuilder format
        if (this.config.storage?.memory) {
            const memoryConfig = this.config.storage.memory;
            result.memory = {
                adapterType: memoryConfig.type,
                adapterConfig: {
                    connectionString: memoryConfig.connectionString,
                    options: {
                        database: memoryConfig.database || 'kodus',
                        collection: memoryConfig.collection || 'memories',
                        maxItems: memoryConfig.maxItems || 10000,
                        enableCompression:
                            memoryConfig.enableCompression ?? true,
                        cleanupInterval: memoryConfig.cleanupInterval || 300000,
                    },
                },
            };
        }

        // ✅ Convert session config to SessionConfig format
        if (this.config.storage?.session) {
            const sessionConfig = this.config.storage.session;
            result.session = {
                maxSessions: sessionConfig.maxSessions || 1000,
                sessionTimeout: sessionConfig.sessionTimeout || 30 * 60 * 1000,
                enableAutoCleanup: true,
                persistent: sessionConfig.type === 'mongodb',
                adapterType: sessionConfig.type,
                connectionString: sessionConfig.connectionString,
                adapterOptions: {
                    database: sessionConfig.database || 'kodus',
                    collection: sessionConfig.collection || 'sessions',
                },
                cleanupInterval: sessionConfig.cleanupInterval || 300000,
            };
        }

        if (this.config.storage?.snapshot) {
            const snapshotConfig = this.config.storage.snapshot;
            result.snapshot = {
                adapterType: snapshotConfig.type,
                adapterConfig: {
                    connectionString: snapshotConfig.connectionString,
                    options: {
                        database: snapshotConfig.database || 'kodus',
                        collection: snapshotConfig.collection || 'snapshots',
                        maxSnapshots: snapshotConfig.maxSnapshots || 1000,
                        enableCompression:
                            snapshotConfig.enableCompression ?? true,
                        enableDeltaCompression:
                            snapshotConfig.enableDeltaCompression ?? true,
                        cleanupInterval:
                            snapshotConfig.cleanupInterval || 300000,
                    },
                },
            };
        }

        return result;
    }

    /**
     * Inject kernel handler into agent
     */
    private async injectKernelHandler(
        agentInstance:
            | AgentEngine<unknown, unknown, unknown>
            | AgentExecutor<unknown, unknown, unknown>,
    ): Promise<void> {
        try {
            if (!this.kernelHandler) {
                this.logger.warn('KernelHandler not available');
                return;
            }

            if (!this.kernelHandler.isInitialized()) {
                await this.kernelHandler.initialize();
            }

            if (
                'setKernelHandler' in agentInstance &&
                typeof agentInstance.setKernelHandler === 'function'
            ) {
                agentInstance.setKernelHandler(this.kernelHandler);
                this.logger.debug('KernelHandler injected successfully');
            }
        } catch (error) {
            this.logger.error('Failed to inject KernelHandler', error as Error);
            // Continue without kernel handler
        }
    }

    async connectMCP(): Promise<void> {
        if (!this.mcpAdapter) {
            this.logger.warn('MCP adapter not configured, skipping connection');
            return;
        }

        try {
            await this.mcpAdapter.connect();
            this.logger.info('MCP adapter connected successfully');
        } catch (error) {
            this.logger.error('Failed to connect MCP adapter', error as Error);
            throw error;
        }
    }

    /**
     * Desconecta do MCP
     */
    async disconnectMCP(): Promise<void> {
        if (!this.mcpAdapter) {
            return;
        }

        try {
            await this.mcpAdapter.disconnect();
            this.logger.info('MCP adapter disconnected successfully');
        } catch (error) {
            this.logger.error(
                'Failed to disconnect MCP adapter',
                error as Error,
            );
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 🏭 FACTORY FUNCTION
// ──────────────────────────────────────────────────────────────────────────────

export function createOrchestration(
    config: OrchestrationConfig,
): SDKOrchestrator {
    return new SDKOrchestrator(config);
}
