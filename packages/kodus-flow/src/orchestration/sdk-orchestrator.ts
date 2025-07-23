/**
 * NEW SDK Orchestrator - CLEAN VERSION
 *
 * RESPONSABILIDADES (APENAS COORDENAÇÃO):
 * ✅ Expor APIs simples dos engines
 * ✅ Coordenar uso dos componentes
 * ✅ Ser a porta de entrada para o usuário
 * ✅ LLM obrigatório para agents
 *
 * NÃO FAZ:
 * ❌ Lógica de planning (Planning Engine)
 * ❌ Lógica de routing (Routing Engine)
 * ❌ Implementação de tools (Tool Engine)
 * ❌ Think functions (Agent Core)
 */

import { createLogger } from '../observability/index.js';
import { EngineError } from '../core/errors.js';
import { ToolEngine } from '../engine/tools/tool-engine.js';
import { defineTool } from '../core/types/tool-types.js';
import { AgentEngine } from '../engine/agents/agent-engine.js';
import { AgentExecutor } from '../engine/agents/agent-executor.js';
import { IdGenerator } from '../utils/id-generator.js';

import { createDefaultMultiKernelHandler } from '../engine/core/multi-kernel-handler.js';

import type { LLMAdapter } from '../adapters/llm/index.js';
import type { PlannerType } from '../engine/planning/planner-factory.js';
import type {
    AgentDefinition,
    AgentExecutionOptions,
    AgentExecutionResult,
} from '../core/types/agent-types.js';
import { agentIdentitySchema } from '../core/types/agent-types.js';
import type { AgentCoreConfig } from '../engine/agents/agent-core.js';
import type {
    ToolDefinition,
    ToolId,
    ToolContext,
} from '../core/types/tool-types.js';
import type { MCPAdapter } from '../adapters/mcp/types.js';
import type { AgentData } from './types.js';
import { z } from 'zod';
import { safeJsonSchemaToZod } from '../core/utils/json-schema-to-zod.js';
import { AgentIdentity } from '@/core/types/agent-definition.js';
import { SessionId, UserContext } from '@/core/types/base-types.js';
import { Thread } from '@/core/types/common-types.js';
import type { PersistorType } from '../persistor/config.js';

// ──────────────────────────────────────────────────────────────────────────────
// 🏗️ CLEAN ORCHESTRATOR INTERFACES
// ──────────────────────────────────────────────────────────────────────────────

export interface OrchestrationConfig {
    // LLM é OBRIGATÓRIO para agents
    llmAdapter: LLMAdapter;

    // Tenant identification
    tenantId?: string;

    // Optional integrations
    mcpAdapter?: MCPAdapter;

    // Basic settings
    enableObservability?: boolean;
    defaultTimeout?: number;

    // Agent defaults
    defaultPlanner?: PlannerType;
    defaultMaxIterations?: number;

    // Persistence configuration
    persistorConfig?: {
        type: PersistorType;
        connectionString?: string;
        database?: string;
        collection?: string;
        maxPoolSize?: number;
        serverSelectionTimeoutMS?: number;
        connectTimeoutMS?: number;
        socketTimeoutMS?: number;
        ttl?: number;
        maxSnapshots?: number;
        enableCompression?: boolean;
        enableDeltaCompression?: boolean;
        cleanupInterval?: number;
    };
}

export interface OrchestrationConfigInternal
    extends Omit<OrchestrationConfig, 'mcpAdapter'> {
    mcpAdapter: MCPAdapter | null;
}

export type AgentConfig = {
    name: string;
    identity: AgentIdentity;
    planner?: PlannerType;
    maxIterations?: number;
    executionMode?: 'simple' | 'workflow';
    constraints?: string[];

    // Agent capabilities - configurações do agente (não da execução)
    enableSession?: boolean; // Default: true
    enableState?: boolean; // Default: true
    enableMemory?: boolean; // Default: true
    timeout?: number;
};

export interface ToolConfig {
    name: string;
    description: string;
    inputSchema: z.ZodSchema<unknown>;
    execute: (input: unknown, context: ToolContext) => Promise<unknown>;
    categories?: string[];
    dependencies?: string[];
}

export interface OrchestrationResult<T = unknown> {
    success: boolean;
    result?: T;
    error?: string;
    context: Record<string, unknown>;
    duration: number;
    metadata?: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🚀 CLEAN SDK ORCHESTRATOR
// ──────────────────────────────────────────────────────────────────────────────

export class SDKOrchestrator {
    private agents = new Map<string, AgentData>();
    private toolEngine: ToolEngine;
    private mcpAdapter?: MCPAdapter;
    private logger = createLogger('sdk-orchestrator');
    private config: Required<OrchestrationConfigInternal>;
    private kernelHandler?: ReturnType<typeof createDefaultMultiKernelHandler>;

    constructor(config: OrchestrationConfig) {
        // LLM é OBRIGATÓRIO!
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
            defaultTimeout: config.defaultTimeout || 60000, // ✅ UNIFIED: 60s timeout
            defaultPlanner: config.defaultPlanner || 'plan-execute',
            defaultMaxIterations: config.defaultMaxIterations || 15,
            persistorConfig: config.persistorConfig || {
                type: 'memory',
                maxSnapshots: 1000,
                enableCompression: true,
                enableDeltaCompression: true,
                cleanupInterval: 300000,
            },
        };

        this.mcpAdapter = config.mcpAdapter;
        this.toolEngine = new ToolEngine();

        // Initialize multi-kernel handler with separate kernels for observability and agent execution
        this.kernelHandler = createDefaultMultiKernelHandler(
            this.config.tenantId,
            {
                type: this.config.persistorConfig.type,
                options: this.config.persistorConfig,
            },
        );

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
            planner: config.planner || this.config.defaultPlanner,
            executionMode: config.executionMode || 'simple',
        });

        // Validate identity field - at least one field must be provided
        try {
            agentIdentitySchema.parse(config.identity);
        } catch (error) {
            throw new EngineError(
                'ENGINE_AGENT_INITIALIZATION_FAILED',
                `Invalid agent identity: ${error instanceof Error ? error.message : 'Unknown validation error'}`,
            );
        }

        // Create basic agent definition
        const agentDefinition: AgentDefinition<unknown, unknown, unknown> = {
            name: config.name,
            identity: config.identity,
            think: async () => {
                // This will be replaced by AgentCore with real planner
                throw new EngineError(
                    'AGENT_ERROR',
                    'Agent think function should be replaced by AgentCore',
                );
            },
            config: {
                enableSession: config.enableSession ?? true,
                enableState: config.enableState ?? true,
                enableMemory: config.enableMemory ?? true,
                maxIterations: config.maxIterations,
                timeout: config.timeout,
            },
        };

        // Create agent core configuration
        const agentCoreConfig: AgentCoreConfig = {
            tenantId: this.config.tenantId,
            agentName: config.name,
            planner: config.planner || this.config.defaultPlanner,
            llmAdapter: this.config.llmAdapter, // Pass LLM adapter
            maxThinkingIterations:
                config.maxIterations || this.config.defaultMaxIterations,
            enableKernelIntegration: true,
            debug: process.env.NODE_ENV === 'development',
            monitoring: this.config.enableObservability,
        };

        // Create agent instance based on execution mode
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
                planner: config.planner || this.config.defaultPlanner,
            });
        } else {
            agentInstance = new AgentEngine(
                agentDefinition,
                this.toolEngine,
                agentCoreConfig,
            );

            this.logger.info('Agent created via AgentEngine (simple)', {
                agentName: config.name,
                planner: config.planner || this.config.defaultPlanner,
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
            // Ensure kernelHandler is initialized
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

            let result: AgentExecutionResult<unknown>;

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
                result = await agentData.instance.execute(
                    input,
                    executionOptions,
                );
            } else if (agentData.instance instanceof AgentExecutor) {
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
                result = await agentData.instance.executeViaWorkflow(
                    input,
                    executionOptions,
                );
            } else {
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
                },
                duration,
                metadata: {
                    agentName,
                    correlationId,
                    executionMode: agentData.config.executionMode,
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
                duration,
                metadata: {
                    agentName,
                    correlationId,
                    error:
                        error instanceof Error
                            ? error.message
                            : 'Unknown error',
                },
            };
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
            execute: config.execute,
            categories: config.categories || [],
            dependencies: config.dependencies || [],
        });

        // Register with ToolEngine
        this.toolEngine.registerTool(toolDefinition);

        this.logger.info('Tool created and registered', {
            toolName: config.name,
            description: config.description,
        });

        return toolDefinition;
    }

    /**
     * Call tool - APENAS delega para ToolEngine
     */
    async callTool(
        toolName: string,
        input: unknown,
    ): Promise<OrchestrationResult<unknown>> {
        const startTime = Date.now();
        const correlationId = IdGenerator.correlationId();

        this.logger.info('Tool execution started', {
            toolName,
            correlationId,
        });

        try {
            const result = await this.toolEngine.executeCall(
                toolName as ToolId,
                input,
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
                duration,
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
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                context: {
                    toolName,
                    correlationId,
                    duration,
                },
                duration,
                metadata: {
                    toolName,
                    correlationId,
                    error:
                        error instanceof Error
                            ? error.message
                            : 'Unknown error',
                },
            };
        }
    }

    /**
     * Get registered tools with full metadata for context engineering
     */
    getRegisteredTools(): Array<{
        name: string;
        description: string;
        categories?: string[];
        schema?: unknown;
        examples?: unknown[];
        plannerHints?: unknown;
    }> {
        return this.toolEngine.getAvailableTools().map((tool) => ({
            name: tool.name,
            description: tool.description,
            categories: tool.categories, // Now properly extracted from metadata
            schema: tool.inputSchema,
            examples: tool.examples,
            plannerHints: tool.plannerHints,
        }));
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

    /**
     * Get tools in the correct format for LLMs (OpenAI, Anthropic, etc.)
     * This method ensures tools are properly formatted for LLM function calling
     *
     * @example
     * ```typescript
     * // ✅ CORRETO: Usar o novo método para LLMs
     * const toolsForLLM = orchestrator.getToolsForLLM();
     *
     * // Formato correto para LLMs:
     * // [
     * //   {
     * //     name: "calculator",
     * //     description: "Perform mathematical calculations",
     * //     parameters: {
     * //       type: "object",
     * //       properties: {
     * //         expression: {
     * //           type: "string",
     * //           description: "Mathematical expression to evaluate"
     * //         }
     * //       },
     * //       required: ["expression"] // ✅ Apenas array, sem flags individuais
     * //     }
     * //   }
     * // ]
     *
     * // Usar com LLM adapter
     * const response = await llmAdapter.call({
     *   messages: [{ role: 'user', content: 'Calculate 2 + 2' }],
     *   tools: toolsForLLM // ✅ Formato correto
     * });
     * ```
     */
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

            console.log('mcpTools', mcpTools);

            for (const mcpTool of mcpTools) {
                // ✅ IMPROVED: Better schema conversion with validation
                const zodSchema = safeJsonSchemaToZod(mcpTool.inputSchema);

                this.logger.debug('Processing MCP tool', {
                    name: mcpTool.name,
                    description: mcpTool.description,
                    hasInputSchema: !!mcpTool.inputSchema,
                    schemaType: mcpTool.inputSchema
                        ? typeof mcpTool.inputSchema
                        : 'none',
                    // ✅ ADDED: Log schema details for debugging
                    schemaProperties:
                        mcpTool.inputSchema &&
                        typeof mcpTool.inputSchema === 'object'
                            ? Object.keys(
                                  mcpTool.inputSchema as Record<
                                      string,
                                      unknown
                                  >,
                              )
                            : [],
                    requiredFields:
                        mcpTool.inputSchema &&
                        typeof mcpTool.inputSchema === 'object'
                            ? (mcpTool.inputSchema as Record<string, unknown>)
                                  .required
                            : [],
                });

                // ✅ IMPROVED: Preserve original JSON Schema for LLMs
                this.createTool({
                    name: mcpTool.name,
                    description:
                        mcpTool.description || `MCP Tool: ${mcpTool.name}`,
                    inputSchema: zodSchema,
                    execute: async (input: unknown) => {
                        this.logger.debug('Executing MCP tool', {
                            toolName: mcpTool.name,
                            input,
                            inputKeys:
                                input && typeof input === 'object'
                                    ? Object.keys(
                                          input as Record<string, unknown>,
                                      )
                                    : [],
                        });

                        const result = await this.mcpAdapter!.executeTool(
                            mcpTool.name,
                            input as Record<string, unknown>,
                        );
                        return { result };
                    },
                    categories: ['mcp'],
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
            this.logger.warn('MCP adapter not configured');
            return;
        }

        try {
            await this.mcpAdapter.connect();
            this.logger.info('MCP connected successfully');
        } catch (error) {
            this.logger.error('Failed to connect to MCP', error as Error);
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
            this.logger.info('MCP disconnected successfully');
        } catch (error) {
            this.logger.error('Failed to disconnect from MCP', error as Error);
            throw error;
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
