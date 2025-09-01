import {
    createLogger,
    getObservability,
    startToolSpan,
    applyErrorToSpan,
    markSpanOk,
} from '../../observability/index.js';
import { IdGenerator } from '../../utils/id-generator.js';
import { ContextService } from '../../core/contextNew/index.js';

import {
    validateWithZod,
    zodToJSONSchema,
} from '../../core/utils/zod-to-json-schema.js';
import { createToolError } from '../../core/error-unified.js';
import {
    AnyEvent,
    ConditionalToolsAction,
    createToolContext,
    ParallelToolsAction,
    SequentialToolsAction,
    ToolCall,
    ToolContext,
    ToolDefinition,
    ToolDependency,
    ToolEngineConfig,
    ToolId,
    ToolMetadataForLLM,
    ToolMetadataForPlanner,
} from '../../core/types/allTypes.js';
import { MultiKernelHandler } from '../core/multi-kernel-handler.js';

export class ToolEngine {
    private logger: ReturnType<typeof createLogger>;
    private tools = new Map<ToolId, ToolDefinition<unknown, unknown>>();
    private config: ToolEngineConfig;
    private kernelHandler?: MultiKernelHandler;

    constructor(
        config: ToolEngineConfig = {},
        kernelHandler?: MultiKernelHandler,
    ) {
        this.config = {
            validateSchemas: true,
            ...config,
        };
        this.kernelHandler = kernelHandler;
        this.logger = createLogger('tool-engine');
    }

    /**
     * Register a tool
     */
    registerTool<TInput = unknown, TOutput = unknown>(
        tool: ToolDefinition<TInput, TOutput>,
    ): void {
        this.tools.set(
            tool.name as ToolId,
            tool as ToolDefinition<unknown, unknown>,
        );
        this.logger.info('Tool registered', {
            toolName: tool.name,
        });
    }

    /**
     * Execute a tool call with timeout protection
     * Note: Retry logic is handled by Circuit Breaker at higher level
     */
    async executeCall<TInput = unknown, TOutput = unknown>(
        toolName: ToolId,
        input: TInput,
        options?: {
            correlationId?: string;
            tenantId?: string;
            threadId?: string; // ✅ ADICIONAR threadId
        },
    ): Promise<TOutput> {
        const callId = IdGenerator.callId();
        const timeout = this.config.timeout || 120000; // ✅ AUMENTADO: 120s para APIs externas
        const startTime = Date.now();
        const obs = getObservability();
        const correlationId =
            options?.correlationId || obs.getContext()?.correlationId;

        // 🔥 REGISTRAR INÍCIO DA TOOL CALL no contextNew
        if (options?.threadId) {
            try {
                // 🎯 CLEAN API: Direct ContextService usage
                const sessionManager = ContextService;

                await sessionManager.updateExecution(options.threadId, {
                    currentTool: String(toolName),
                    currentStep: {
                        id: callId,
                        status: 'executing',
                        toolCall: {
                            name: String(toolName),
                            arguments: JSON.stringify(input),
                        },
                    },
                });
            } catch (contextError) {
                this.logger.warn(
                    'Failed to register tool execution start in contextNew',
                    {
                        error: contextError,
                        toolName,
                        threadId: options.threadId,
                    },
                );
            }
        }

        try {
            const span = startToolSpan(obs.telemetry, {
                toolName: String(toolName),
                callId,
                correlationId,
            });

            const result = await obs.telemetry.withSpan(span, async () => {
                try {
                    // ✅ SIMPLIFIED: Only timeout protection - Circuit Breaker handles retries
                    const timeoutPromise = new Promise<never>((_, reject) => {
                        setTimeout(() => {
                            reject(
                                new Error(
                                    `Tool execution timeout after ${timeout}ms`,
                                ),
                            );
                        }, timeout);
                    });

                    // Create execution promise
                    const executionPromise = this.executeToolInternal<
                        TInput,
                        TOutput
                    >(toolName, input, callId, {
                        correlationId,
                        tenantId: options?.tenantId,
                    });

                    const res = await Promise.race([
                        executionPromise,
                        timeoutPromise,
                    ]);
                    markSpanOk(span);

                    // 🔥 REGISTRAR SUCESSO DA TOOL CALL no contextNew
                    if (options?.threadId) {
                        try {
                            // 🎯 CLEAN API: Direct ContextService usage
                            const sessionManager = ContextService;

                            // Atualizar execution
                            await sessionManager.updateExecution(
                                options.threadId,
                                {
                                    currentTool: undefined, // Limpar tool atual
                                    completedSteps: [callId],
                                    currentStep: {
                                        id: callId,
                                        status: 'completed',
                                        toolCall: {
                                            name: String(toolName),
                                            arguments: JSON.stringify(input),
                                            result: res as Record<
                                                string,
                                                object
                                            >,
                                        },
                                    },
                                },
                            );

                            // Salvar resultado como entity
                            await sessionManager.addEntities(options.threadId, {
                                toolResults: {
                                    [String(toolName)]: {
                                        id: callId,
                                        title: `${toolName} result`,
                                        type: 'tool_result',
                                        lastUsed: Date.now(),
                                        data: res,
                                    },
                                },
                            });
                        } catch (contextError) {
                            this.logger.warn(
                                'Failed to register tool execution success in contextNew',
                                {
                                    error: contextError,
                                    toolName,
                                    threadId: options.threadId,
                                },
                            );
                        }
                    }

                    return res;
                } catch (innerError) {
                    applyErrorToSpan(span, innerError);
                    throw innerError;
                }
            });

            return result;
        } catch (error) {
            const lastError = error as Error;
            const executionTime = Date.now() - startTime;

            this.logger.error(
                '❌ TOOL ENGINE - Tool execution failed',
                lastError,
                {
                    toolName,
                    callId,
                    correlationId,
                    error: lastError.message,
                    errorType: lastError.constructor.name,
                    executionTime,
                    isTimeout: lastError.message.includes('timeout'),
                    trace: {
                        source: 'tool-engine',
                        step: 'executeCall-error',
                        timestamp: Date.now(),
                    },
                },
            );

            // 🔥 REGISTRAR ERRO DA TOOL CALL no contextNew
            if (options?.threadId) {
                try {
                    // 🎯 CLEAN API: Direct ContextService usage
                    const sessionManager = ContextService;

                    await sessionManager.updateExecution(options.threadId, {
                        currentTool: undefined, // Limpar tool atual
                        failedSteps: [callId],
                        lastError: lastError.message,
                        currentStep: {
                            id: callId,
                            status: 'failed',
                            toolCall: {
                                name: String(toolName),
                                arguments: JSON.stringify(input),
                            },
                            error: lastError.message,
                        },
                    });
                } catch (contextError) {
                    this.logger.warn(
                        'Failed to register tool execution failure in contextNew',
                        {
                            error: contextError,
                            toolName,
                            threadId: options.threadId,
                        },
                    );
                }
            }

            throw lastError;
        }
    }

    /**
     * Internal tool execution method
     */
    private async executeToolInternal<TInput = unknown, TOutput = unknown>(
        toolName: ToolId,
        input: TInput,
        callId: string,
        options?: {
            correlationId?: string;
            tenantId?: string;
        },
    ): Promise<TOutput> {
        const tool = this.tools.get(toolName) as ToolDefinition<
            TInput,
            TOutput
        >;

        if (!tool) {
            this.logger.error(
                '❌ TOOL ENGINE - Tool not found',
                new Error(`Tool not found: ${toolName}`),
                {
                    toolName,
                    callId,
                    availableTools: Array.from(this.tools.keys()),
                    trace: {
                        source: 'tool-engine',
                        step: 'tool-not-found',
                        timestamp: Date.now(),
                    },
                },
            );
            throw new Error(`Tool not found: ${toolName}`);
        }

        this.validateToolInput(tool, input);

        let result: TOutput;
        let error: Error | undefined;

        try {
            // 🔥 ENHANCED: Create tool context with contextNew integration
            const context = await this.createEnhancedToolContext(
                tool.name,
                callId,
                `exec-${Date.now()}`,
                options?.tenantId || 'default',
                input as Record<string, unknown>,
                options,
            );

            // Execute tool using execute function
            result = await tool.execute(input, context);
        } catch (err) {
            error = err as Error;

            throw error;
        }

        return result;
    }

    /**
     * 🔥 ENHANCED: Create tool context with contextNew integration
     */
    private async createEnhancedToolContext(
        toolName: string,
        callId: string,
        executionId: string,
        tenantId: string,
        parameters: Record<string, unknown>,
        options?: {
            threadId?: string;
            correlationId?: string;
            parentId?: string;
            metadata?: any;
        },
    ): Promise<ToolContext> {
        // Start with basic tool context
        const basicContext = createToolContext(
            toolName,
            callId,
            executionId,
            tenantId,
            parameters,
            {
                correlationId: options?.correlationId,
                parentId: options?.parentId,
                metadata: options?.metadata,
            },
        );

        // Try to enhance with contextNew data
        if (options?.threadId) {
            try {
                // 🎯 CLEAN API: Direct ContextService usage
                // 🎯 CLEAN API: Using ContextService.getContext() directly

                // Get enhanced runtime context
                const runtimeContext = await ContextService.getContext(
                    options.threadId,
                );

                // Enhance basic context with contextNew data
                const enhancedContext: ToolContext = {
                    ...basicContext,
                    // Add contextNew session information
                    sessionId: runtimeContext.sessionId,
                    threadId: runtimeContext.threadId,
                    executionId: runtimeContext.executionId,
                    // Add current execution state
                    currentPhase: runtimeContext.state.phase,
                    lastUserIntent: runtimeContext.state.lastUserIntent,
                    // Add recent conversation context (last 3 messages for context)
                    recentMessages: runtimeContext.messages.slice(-3),
                    // Add relevant entities
                    availableEntities: runtimeContext.entities,
                    // Add execution history
                    completedSteps: runtimeContext.execution.completedSteps,
                    failedSteps: runtimeContext.execution.failedSteps,
                } as any;

                this.logger.debug('✅ Tool context enhanced with contextNew', {
                    toolName,
                    sessionId: runtimeContext.sessionId,
                    threadId: runtimeContext.threadId,
                    phase: runtimeContext.state.phase,
                    messagesCount: runtimeContext.messages.length,
                    entitiesCount: Object.keys(runtimeContext.entities).length,
                });

                return enhancedContext;
            } catch (contextError) {
                this.logger.warn(
                    '⚠️ Failed to enhance tool context with contextNew',
                    {
                        toolName,
                        threadId: options.threadId,
                        error:
                            contextError instanceof Error
                                ? contextError.message
                                : String(contextError),
                    },
                );
                // Return basic context on failure
            }
        }

        return basicContext;
    }

    /**
     * Get available tools with metadata for planner context engineering
     * Includes both built-in tools and external tools
     */
    getAvailableTools(): ToolMetadataForPlanner[] {
        const externalTools = Array.from(this.tools.values()).map((tool) =>
            this.convertToolToPlannerFormat(tool),
        );

        return [...externalTools];
    }

    /**
     * Convert tool to planner format - SIMPLIFIED
     */
    private convertToolToPlannerFormat(
        tool: ToolDefinition<unknown, unknown>,
    ): ToolMetadataForPlanner {
        let inputParameters: Record<string, unknown>;
        let outputParameters: Record<string, unknown>;

        if (tool.inputJsonSchema) {
            inputParameters = tool.inputJsonSchema.parameters;
        } else if (tool.inputSchema) {
            try {
                const converted = zodToJSONSchema(
                    tool.inputSchema,
                    tool.name,
                    tool.description || `Tool: ${tool.name}`,
                );
                inputParameters = converted.parameters;
            } catch {
                inputParameters = { type: 'object', properties: {} };
            }
        } else {
            inputParameters = { type: 'object', properties: {} };
        }

        if (tool.outputJsonSchema) {
            outputParameters = tool.outputJsonSchema.parameters;
        } else if (tool.outputSchema) {
            try {
                const converted = zodToJSONSchema(
                    tool.outputSchema,
                    tool.name,
                    tool.description || `Tool: ${tool.name}`,
                );
                outputParameters = converted.parameters;
            } catch {
                outputParameters = { type: 'object', properties: {} };
            }
        } else {
            outputParameters = { type: 'object', properties: {} };
        }

        return {
            name: tool.name,
            description: tool.description || `Tool: ${tool.name}`,
            inputSchema: {
                type: 'object' as const,
                properties: this.extractPropertiesWithRequiredFlag(
                    (inputParameters.properties as Record<string, unknown>) ||
                        {},
                    (inputParameters.required as string[]) || [],
                ),
                required: (inputParameters.required as string[]) || [],
            },
            outputSchema: {
                type: 'object' as const,
                properties: this.extractPropertiesWithRequiredFlag(
                    (outputParameters.properties as Record<string, unknown>) ||
                        {},
                    (outputParameters.required as string[]) || [],
                ),
                required: (outputParameters.required as string[]) || [],
            },
            config: {
                timeout: 60000,
                requiresAuth: false,
                allowParallel: true,
                maxConcurrentCalls: 5,
                source: 'user' as const,
            },
            categories: tool.categories || [],
            dependencies: tool.dependencies || [],
            tags: tool.tags || [],
            errorHandling: tool.errorHandling || {
                retryStrategy: 'none',
                maxRetries: 0,
                fallbackAction: 'continue',
                errorMessages: {},
            },
        };
    }

    getToolsForLLM(): ToolMetadataForLLM[] {
        const externalTools = this.listTools()?.map((tool) =>
            this.convertToolToLLMFormat(tool),
        );

        return [...externalTools];
    }

    /**
     * Convert tool to LLM format - SIMPLIFIED
     */
    private convertToolToLLMFormat(
        tool: ToolDefinition<unknown, unknown>,
    ): ToolMetadataForLLM {
        let parameters: Record<string, unknown>;

        if (tool.inputJsonSchema) {
            parameters = tool.inputJsonSchema.parameters;
        } else if (tool.inputSchema) {
            try {
                const converted = zodToJSONSchema(
                    tool.inputSchema,
                    tool.name,
                    tool.description || `Tool: ${tool.name}`,
                );
                parameters = converted.parameters;
            } catch {
                parameters = { type: 'object', properties: {} };
            }
        } else {
            parameters = { type: 'object', properties: {} };
        }

        return {
            name: tool.name,
            description: tool.description || `Tool: ${tool.name}`,
            parameters,
        };
    }

    /**
     * Extract properties with required flag for planner context
     */
    private extractPropertiesWithRequiredFlag(
        properties: Record<string, unknown>,
        requiredFields: string[],
    ): Record<
        string,
        {
            type: string;
            description?: string;
            required: boolean;
            enum?: string[];
            default?: unknown;
            format?: string;
        }
    > {
        const result: Record<
            string,
            {
                type: string;
                description?: string;
                required: boolean;
                enum?: string[];
                default?: unknown;
                format?: string;
            }
        > = {};

        for (const [key, prop] of Object.entries(properties)) {
            const propObj = prop as Record<string, unknown>;
            result[key] = {
                type: (propObj.type as string) || 'string',
                description: propObj.description as string | undefined,
                required: requiredFields.includes(key),
                enum: propObj.enum as string[] | undefined,
                default: propObj.default,
                format: propObj.format as string | undefined,
            };
        }

        return result;
    }

    /**
     * Get a specific tool by name (for testing compatibility)
     */
    getTool<TInput = unknown, TOutput = unknown>(
        name: string,
    ): ToolDefinition<TInput, TOutput> | undefined {
        return this.tools.get(name as ToolId) as
            | ToolDefinition<TInput, TOutput>
            | undefined;
    }

    /**
     * List all tools (for testing compatibility)
     */
    listTools(): ToolDefinition<unknown, unknown>[] {
        return Array.from(this.tools.values());
    }

    /**
     * Set KernelHandler (for dependency injection)
     */
    setKernelHandler(kernelHandler: MultiKernelHandler): void {
        this.kernelHandler = kernelHandler;
        this.logger.info('🔧 KERNELHANDLER SET FOR TOOLENGINE', {
            hasKernelHandler: !!kernelHandler,
            kernelHandlerType: kernelHandler?.constructor?.name,
            trace: {
                source: 'tool-engine',
                step: 'kernelhandler-set',
                timestamp: Date.now(),
            },
        });

        // Register event handlers for tool execution
        this.registerEventHandlers();
    }

    /**
     * Register event handlers for tool execution via events
     */
    private registerEventHandlers(): void {
        if (!this.kernelHandler) {
            return;
        }

        // Register handler for tool execution requests
        this.kernelHandler.registerHandler(
            'tool.execute.request',
            async (event: AnyEvent) => {
                const correlationId = event.metadata?.correlationId;

                const { toolName, input } = event.data as {
                    toolName: string;
                    input: unknown;
                };

                try {
                    this.logger.info('🔧 [TOOL] Starting tool execution', {
                        toolName,
                        correlationId,
                        inputSize: JSON.stringify(input).length,
                        timestamp: Date.now(),
                    });

                    const startTime = Date.now();

                    const result = await this.executeCall(toolName, input);
                    const executionTime = Date.now() - startTime;

                    this.logger.info('🔧 [TOOL] Tool execution completed', {
                        toolName,
                        correlationId,
                        executionTimeMs: executionTime,
                        resultSize: JSON.stringify(result).length,
                        timestamp: Date.now(),
                    });

                    // ✅ UNIFICADO: Sempre verificar se há erro no resultado
                    const hasError = this.checkToolResultError(result);

                    const responseData = {
                        ...(typeof result === 'object' && result !== null
                            ? result
                            : { result }),
                        success: !hasError,
                        toolName,
                        metadata: {
                            correlationId,
                            success: !hasError,
                            toolName,
                        },
                    };

                    if (this.kernelHandler?.emitAsync) {
                        await this.kernelHandler.emitAsync(
                            'tool.execute.response',
                            responseData,
                            {
                                correlationId,
                                deliveryGuarantee: 'at-least-once',
                            },
                        );
                    } else {
                        await this.kernelHandler!.emit(
                            'tool.execute.response',
                            responseData,
                        );
                    }
                } catch (error) {
                    this.logger.error(
                        '🔧 [TOOL] Tool execution failed via events',
                        error as Error,
                        {
                            toolName,
                            correlationId,
                        },
                    );

                    // Emit error response
                    this.logger.error(
                        '📤 EMITTING TOOL EXECUTION ERROR RESPONSE',
                        error as Error,
                        {
                            toolName,
                            correlationId,
                            trace: {
                                source: 'tool-engine',
                                step: 'emit-error-response',
                                timestamp: Date.now(),
                            },
                        },
                    );

                    await this.kernelHandler!.emit('tool.execute.response', {
                        error: (error as Error).message,
                        success: false,
                        toolName,
                        metadata: {
                            correlationId,
                            success: false,
                            toolName,
                        },
                    });
                }
            },
        );
    }

    /**
     * Check if tool result contains an error
     */
    private checkToolResultError(result: unknown): boolean {
        if (!result || typeof result !== 'object') {
            return false;
        }

        const resultObj = result as Record<string, unknown>;

        // Check for direct error indicators
        if (resultObj.error || resultObj.isError === true) {
            return true;
        }

        // Check for MCP-style result structure
        if (resultObj.result && typeof resultObj.result === 'object') {
            const innerResult = resultObj.result as Record<string, unknown>;
            if (innerResult.isError === true || innerResult.error) {
                return true;
            }

            // Check for successful: false in inner result
            if (innerResult.successful === false) {
                return true;
            }
        }

        // Check for success: false at top level
        if (resultObj.success === false) {
            return true;
        }

        return false;
    }

    /**
     * Get KernelHandler status
     */
    hasKernelHandler(): boolean {
        return !!this.kernelHandler;
    }

    /**
     * Execute tool directly with timeout protection
     * Note: Retry logic is handled by Circuit Breaker at higher level
     */
    async executeTool<TInput = unknown, TOutput = unknown>(
        toolName: string,
        input: TInput,
    ): Promise<TOutput> {
        const callId = IdGenerator.callId();
        const timeout = this.config.timeout || 60000; // ✅ 60s timeout para ferramentas MCP
        const startTime = Date.now();
        const obs = getObservability();

        try {
            const span = obs.telemetry.startSpan('tool.execute', {
                attributes: {
                    toolName: String(toolName),
                    callId,
                },
            });

            const result = await obs.telemetry.withSpan(span, async () => {
                try {
                    // ✅ SIMPLIFIED: Only timeout protection - Circuit Breaker handles retries
                    const timeoutPromise = new Promise<never>((_, reject) => {
                        setTimeout(() => {
                            reject(
                                new Error(
                                    `Tool execution timeout after ${timeout}ms`,
                                ),
                            );
                        }, timeout);
                    });

                    // Create execution promise using executeToolInternal
                    const executionPromise = this.executeToolInternal<
                        TInput,
                        TOutput
                    >(toolName as ToolId, input, callId);

                    // Race between execution and timeout
                    const res = await Promise.race([
                        executionPromise,
                        timeoutPromise,
                    ]);
                    markSpanOk(span);
                    return res;
                } catch (innerError) {
                    applyErrorToSpan(span, innerError);
                    throw innerError;
                }
            });

            return result;
        } catch (error) {
            const lastError = error as Error;
            const executionTime = Date.now() - startTime;

            this.logger.error(
                '❌ TOOL EXECUTION FAILED (executeTool)',
                lastError,
                {
                    toolName,
                    callId,
                    error: lastError.message,
                    executionTime,
                    trace: {
                        source: 'tool-engine',
                        step: 'tool-execution-failed',
                        timestamp: Date.now(),
                    },
                },
            );

            throw lastError;
        }
    }

    // ===== 🚀 NEW: DEPENDENCY RESOLUTION METHODS =====

    /**
     * Resolve tool execution order based on dependencies
     */
    private resolveToolDependencies(
        tools: ToolCall[],
        dependencies: ToolDependency[],
    ): {
        executionOrder: ToolCall[][];
        warnings: string[];
    } {
        const warnings: string[] = [];
        const toolMap = new Map<string, ToolCall>();
        const dependencyMap = new Map<string, ToolDependency[]>();
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const executionPhases: ToolCall[][] = [];

        // Build maps
        for (const tool of tools) {
            toolMap.set(tool.toolName, tool);
        }

        // Build correct dependency map: toolName -> [tools it depends on]
        const actualDependencyMap = new Map<string, string[]>();
        for (const dep of dependencies) {
            actualDependencyMap.set(dep.toolName, dep.dependencies || []);
            // Also store dependency metadata
            if (!dependencyMap.has(dep.toolName)) {
                dependencyMap.set(dep.toolName, []);
            }
            dependencyMap.get(dep.toolName)!.push(dep);
        }

        // Topological sort with phases
        const sortedTools: string[] = [];

        function visit(toolName: string): void {
            if (visiting.has(toolName)) {
                warnings.push(
                    `Circular dependency detected involving tool: ${toolName}`,
                );
                return;
            }
            if (visited.has(toolName)) {
                return;
            }

            visiting.add(toolName);

            // Visit dependencies first
            const deps = actualDependencyMap.get(toolName) || [];
            for (const depToolName of deps) {
                if (toolMap.has(depToolName)) {
                    visit(depToolName);
                }
            }

            visiting.delete(toolName);
            visited.add(toolName);
            sortedTools.push(toolName);
        }

        // Sort all tools
        for (const tool of tools) {
            if (!visited.has(tool.toolName)) {
                visit(tool.toolName);
            }
        }

        // Group into execution phases (tools that can run in parallel)
        const phases: Map<number, ToolCall[]> = new Map();
        const toolPhases = new Map<string, number>();

        for (const toolName of sortedTools) {
            const tool = toolMap.get(toolName);
            if (!tool) continue;

            // Calculate phase based on dependencies
            let phase = 0;
            const deps = dependencyMap.get(toolName) || [];

            for (const dep of deps) {
                if (dep.type === 'required') {
                    const depPhase = toolPhases.get(dep.toolName);
                    if (depPhase !== undefined) {
                        phase = Math.max(phase, depPhase + 1);
                    }
                }
            }

            toolPhases.set(toolName, phase);

            if (!phases.has(phase)) {
                phases.set(phase, []);
            }
            phases.get(phase)!.push(tool);
        }

        // Convert to array
        const sortedPhases = Array.from(phases.keys()).sort((a, b) => a - b);
        for (const phaseNum of sortedPhases) {
            executionPhases.push(phases.get(phaseNum)!);
        }

        return {
            executionOrder: executionPhases,
            warnings,
        };
    }

    /**
     * Execute tools respecting dependencies
     */
    async executeWithDependencies<TOutput = unknown>(
        tools: ToolCall[],
        dependencies: ToolDependency[],
        options: {
            maxConcurrency?: number;
            timeout?: number;
            failFast?: boolean;
        } = {},
    ): Promise<Array<{ toolName: string; result?: TOutput; error?: string }>> {
        const { executionOrder, warnings } = this.resolveToolDependencies(
            tools,
            dependencies,
        );

        // Log warnings
        for (const warning of warnings) {
            this.logger.warn('Dependency resolution warning', { warning });
        }

        const allResults: Array<{
            toolName: string;
            result?: TOutput;
            error?: string;
        }> = [];
        const resultMap = new Map<string, TOutput>();

        // Execute each phase
        for (
            let phaseIndex = 0;
            phaseIndex < executionOrder.length;
            phaseIndex++
        ) {
            const phase = executionOrder[phaseIndex];

            // Execute tools in this phase (can be parallel)
            const phaseResults = await this.executeParallelTools<TOutput>({
                type: 'parallel_tools',
                tools: phase || [],
                concurrency: options.maxConcurrency || 5,
                timeout: options.timeout || 60000,
                failFast: options.failFast || false,
            });

            // Store results for next phases
            for (const result of phaseResults) {
                if (result.result !== undefined) {
                    resultMap.set(result.toolName, result.result);
                }
                allResults.push(result);

                // Check if required dependency failed
                if (result.error && options.failFast) {
                    const dependentTools = dependencies.filter(
                        (d) =>
                            d.toolName === result.toolName &&
                            d.type === 'required',
                    );

                    if (dependentTools.length > 0) {
                        throw new Error(
                            `Required tool ${result.toolName} failed, stopping execution: ${result.error}`,
                        );
                    }
                }
            }
        }

        return allResults;
    }

    /**
     * Execute multiple tools in parallel
     */
    async executeParallelTools<TOutput = unknown>(
        action: ParallelToolsAction,
    ): Promise<Array<{ toolName: string; result?: TOutput; error?: string }>> {
        const startTime = Date.now();
        const concurrency = action.concurrency || 5;
        const timeout = action.timeout || 60000;
        const results: Array<{
            toolName: string;
            result?: TOutput;
            error?: string;
        }> = [];

        // Emit parallel execution start event
        if (this.kernelHandler) {
            await this.kernelHandler.emit('tool.parallel.execution.start', {
                tools: action.tools.map((t) => t.toolName),
                concurrency,
                timeout,
                tenantId: 'default',
            });
        }

        try {
            // Create batches based on concurrency limit
            const batches = this.createBatches(action.tools, concurrency);

            for (const batch of batches) {
                const batchPromises = batch.map(async (toolCall) => {
                    try {
                        const result = await this.executeCall<unknown, TOutput>(
                            toolCall.toolName as ToolId,
                            toolCall.arguments,
                        );
                        return { toolName: toolCall.toolName, result };
                    } catch (error) {
                        const errorMessage =
                            error instanceof Error
                                ? error.message
                                : String(error);

                        if (action.failFast) {
                            throw new Error(
                                `Tool ${toolCall.toolName} failed: ${errorMessage}`,
                            );
                        }

                        return {
                            toolName: toolCall.toolName,
                            error: errorMessage,
                        };
                    }
                });

                // Execute batch with timeout
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(
                        () =>
                            reject(
                                new Error(
                                    `Parallel execution timeout after ${timeout}ms`,
                                ),
                            ),
                        timeout,
                    );
                });

                const batchResults = await Promise.race([
                    Promise.all(batchPromises),
                    timeoutPromise,
                ]);

                results.push(...batchResults);

                // Stop if failFast is enabled and we have errors
                if (action.failFast && results.some((r) => r.error)) {
                    break;
                }
            }

            // Emit success event
            if (this.kernelHandler) {
                await this.kernelHandler.emit(
                    'tool.parallel.execution.success',
                    {
                        tools: action.tools.map((t) => t.toolName),
                        results,
                        executionTime: Date.now() - startTime,
                        tenantId: 'default',
                    },
                );
            }

            return results;
        } catch (error) {
            // Emit error event
            if (this.kernelHandler) {
                await this.kernelHandler.emit('tool.parallel.execution.error', {
                    tools: action.tools.map((t) => t.toolName),
                    error:
                        error instanceof Error ? error.message : String(error),
                    executionTime: Date.now() - startTime,
                    tenantId: 'default',
                });
            }

            throw error;
        }
    }

    /**
     * Execute tools in sequence
     */
    async executeSequentialTools<TOutput = unknown>(
        action: SequentialToolsAction,
    ): Promise<Array<{ toolName: string; result?: TOutput; error?: string }>> {
        const startTime = Date.now();
        const results: Array<{
            toolName: string;
            result?: TOutput;
            error?: string;
        }> = [];
        let previousResult: TOutput | undefined;

        // Emit sequential execution start event
        if (this.kernelHandler) {
            await this.kernelHandler.emit('tool.sequential.execution.start', {
                tools: action.tools.map((t) => t.toolName),
                timeout: action.timeout,
                tenantId: 'default',
            });
        }

        try {
            for (const toolCall of action.tools) {
                try {
                    // Pass previous result if configured
                    const input =
                        action.passResults && previousResult
                            ? {
                                  ...(toolCall.arguments as object),
                                  previousResult,
                              }
                            : toolCall.arguments;

                    const result = await this.executeCall<unknown, TOutput>(
                        toolCall.toolName as ToolId,
                        input,
                    );

                    results.push({ toolName: toolCall.toolName, result });
                    previousResult = result;
                } catch (error) {
                    const errorMessage =
                        error instanceof Error ? error.message : String(error);
                    results.push({
                        toolName: toolCall.toolName,
                        error: errorMessage,
                    });

                    if (action.stopOnError) {
                        this.logger.warn(
                            'Sequential execution stopped due to error',
                            {
                                toolName: toolCall.toolName,
                                error: errorMessage,
                            },
                        );
                        break;
                    }
                }
            }

            // Emit success event
            if (this.kernelHandler) {
                await this.kernelHandler.emit(
                    'tool.sequential.execution.success',
                    {
                        tools: action.tools.map((t) => t.toolName),
                        results,
                        executionTime: Date.now() - startTime,
                        tenantId: 'default',
                    },
                );
            }

            return results;
        } catch (error) {
            // Emit error event
            if (this.kernelHandler) {
                await this.kernelHandler.emit(
                    'tool.sequential.execution.error',
                    {
                        tools: action.tools.map((t) => t.toolName),
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        executionTime: Date.now() - startTime,
                        tenantId: 'default',
                    },
                );
            }

            throw error;
        }
    }

    /**
     * Execute tools based on conditions
     */
    async executeConditionalTools<TOutput = unknown>(
        action: ConditionalToolsAction,
    ): Promise<Array<{ toolName: string; result?: TOutput; error?: string }>> {
        const startTime = Date.now();
        const results: Array<{
            toolName: string;
            result?: TOutput;
            error?: string;
        }> = [];

        // Emit conditional execution start event
        if (this.kernelHandler) {
            await this.kernelHandler.emit('tool.conditional.execution.start', {
                tools: action.tools.map((t) => t.toolName),
                conditions: action.conditions,
                tenantId: 'default',
            });
        }

        try {
            // Execute tools in dependency order
            const remainingTools = [...action.tools];
            const globalConditions = action.conditions || {};

            while (remainingTools.length > 0) {
                const executableTools: ToolCall[] = [];

                // Find tools that can be executed now
                for (let i = remainingTools.length - 1; i >= 0; i--) {
                    const toolCall = remainingTools[i];
                    if (
                        toolCall &&
                        this.evaluateConditions(
                            toolCall,
                            globalConditions,
                            results,
                        )
                    ) {
                        executableTools.push(toolCall);
                        remainingTools.splice(i, 1);
                    }
                }

                // If no tools can be executed, break to avoid infinite loop
                if (executableTools.length === 0) {
                    // Use default tool if specified
                    if (action.defaultTool && remainingTools.length > 0) {
                        const defaultToolCall = remainingTools.find(
                            (t) => t.toolName === action.defaultTool,
                        );
                        if (defaultToolCall) {
                            executableTools.push(defaultToolCall);
                            const index =
                                remainingTools.indexOf(defaultToolCall);
                            if (index > -1) {
                                remainingTools.splice(index, 1);
                            }
                        }
                    } else {
                        break; // No more tools can be executed
                    }
                }

                // Execute the tools (either in parallel or sequentially)
                if (action.evaluateAll) {
                    // Execute all matching tools in parallel
                    const parallelPromises = executableTools.map(
                        async (toolCall) => {
                            try {
                                const result = await this.executeCall<
                                    unknown,
                                    TOutput
                                >(
                                    toolCall.toolName as ToolId,
                                    toolCall.arguments,
                                );
                                return { toolName: toolCall.toolName, result };
                            } catch (error) {
                                const errorMessage =
                                    error instanceof Error
                                        ? error.message
                                        : String(error);
                                return {
                                    toolName: toolCall.toolName,
                                    error: errorMessage,
                                };
                            }
                        },
                    );

                    const batchResults = await Promise.all(parallelPromises);
                    results.push(...batchResults);
                } else {
                    // Execute tools sequentially
                    for (const toolCall of executableTools) {
                        try {
                            const result = await this.executeCall<
                                unknown,
                                TOutput
                            >(toolCall.toolName as ToolId, toolCall.arguments);
                            results.push({
                                toolName: toolCall.toolName,
                                result,
                            });
                        } catch (error) {
                            const errorMessage =
                                error instanceof Error
                                    ? error.message
                                    : String(error);
                            results.push({
                                toolName: toolCall.toolName,
                                error: errorMessage,
                            });
                        }
                    }
                }
            }

            // Emit success event
            if (this.kernelHandler) {
                await this.kernelHandler.emit(
                    'tool.conditional.execution.success',
                    {
                        tools: action.tools.map((t) => t.toolName),
                        results,
                        executionTime: Date.now() - startTime,
                        tenantId: 'default',
                    },
                );
            }

            return results;
        } catch (error) {
            // Emit error event
            if (this.kernelHandler) {
                await this.kernelHandler.emit(
                    'tool.conditional.execution.error',
                    {
                        tools: action.tools.map((t) => t.toolName),
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        executionTime: Date.now() - startTime,
                        tenantId: 'default',
                    },
                );
            }

            throw error;
        }
    }

    /**
     * Create batches for parallel execution
     */
    private createBatches<T>(items: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Evaluate conditions for a tool call
     */
    private evaluateConditions(
        _toolCall: ToolCall,
        _globalConditions: Record<string, unknown>,
        _results: Array<{
            toolName: string;
            result?: unknown;
            error?: string;
        }> = [],
    ): boolean {
        // For now, always return true since ToolCall doesn't have conditions
        // This can be enhanced later with custom condition evaluation logic
        return true;
    }

    /**
     * ✅ Unified tool input validation - ensures consistent validation across all execution paths
     */
    private validateToolInput<T>(tool: ToolDefinition<T>, input: T): void {
        // Skip validation if schemas are disabled
        if (this.config.validateSchemas === false) {
            return;
        }

        // ✅ ADD: Log detalhado para debug de validação
        this.logger.debug('🔍 Validating tool input', {
            toolName: tool.name,
            inputType: typeof input,
            hasInputSchema: !!tool.inputSchema,
            inputValue:
                typeof input === 'object'
                    ? JSON.stringify(input)
                    : String(input),
        });

        // Validate input using Zod schema if available
        if (tool.inputSchema) {
            try {
                const validation = validateWithZod(tool.inputSchema, input);
                if (!validation.success) {
                    // ✅ ADD: Log detalhado do erro de validação
                    this.logger.error(
                        `Tool input validation failed: ${validation.error}`,
                        new Error(
                            `Tool input validation failed: ${validation.error}`,
                        ),
                        {
                            toolName: tool.name,
                            validationError: validation.error,
                            inputType: typeof input,
                            inputValue:
                                typeof input === 'object'
                                    ? JSON.stringify(input)
                                    : String(input),
                            schemaType: tool.inputSchema.constructor.name,
                        },
                    );

                    // ✅ IMPROVED: Better error messages with parameter hints
                    const missingParams = this.extractMissingParameters(
                        validation.error,
                    );

                    throw createToolError(validation.error, {
                        severity: 'low',
                        domain: 'business',
                        userImpact: 'degraded',
                        retryable: false,
                        recoverable: true,
                        context: { toolName: tool.name, input, validation },
                        userMessage: `Tool '${tool.name}' requires specific parameters. ${missingParams.length > 0 ? `Missing: ${missingParams.join(', ')}` : 'Invalid parameters provided.'}`,
                        recoveryHints: [
                            'Check the tool documentation for correct input format',
                            'Ensure all required parameters are provided',
                            'For GitHub tools, you may need organizationId and teamId parameters',
                        ],
                    });
                }

                // ✅ ADD: Log de sucesso na validação
                this.logger.debug('✅ Tool input validation passed', {
                    toolName: tool.name,
                    inputType: typeof input,
                });
            } catch (validationError) {
                // ✅ ADD: Log de erro inesperado na validação
                this.logger.error(
                    `Unexpected validation error: ${validationError instanceof Error ? validationError.message : String(validationError)}`,
                    new Error(
                        `Unexpected validation error: ${validationError instanceof Error ? validationError.message : String(validationError)}`,
                    ),
                    {
                        toolName: tool.name,
                        error:
                            validationError instanceof Error
                                ? validationError.message
                                : String(validationError),
                        inputType: typeof input,
                        inputValue:
                            typeof input === 'object'
                                ? JSON.stringify(input)
                                : String(input),
                    },
                );

                throw createToolError(
                    validationError instanceof Error
                        ? validationError.message
                        : String(validationError),
                    {
                        severity: 'medium',
                        domain: 'business',
                        userImpact: 'degraded',
                        retryable: false,
                        recoverable: true,
                        context: {
                            toolName: tool.name,
                            input,
                            validationError,
                        },
                        userMessage:
                            'An unexpected error occurred during input validation.',
                        recoveryHints: [
                            'Check if the tool schema is properly defined',
                            'Verify the input format matches the expected schema',
                        ],
                    },
                );
            }
        }
    }

    /**
     * Extract missing parameters from validation error
     */
    private extractMissingParameters(validationError: string): string[] {
        try {
            // Parse Zod error to extract missing parameters
            const errorObj = JSON.parse(validationError);
            if (Array.isArray(errorObj)) {
                return errorObj
                    .filter(
                        (error: unknown) =>
                            typeof error === 'object' &&
                            error !== null &&
                            'code' in error &&
                            'message' in error &&
                            error.code === 'invalid_type' &&
                            typeof error.message === 'string' &&
                            error.message.includes('received undefined'),
                    )
                    .map((error: unknown) => {
                        if (
                            typeof error === 'object' &&
                            error !== null &&
                            'path' in error
                        ) {
                            const path = (error as { path?: unknown }).path;
                            if (
                                Array.isArray(path) &&
                                path.length > 0 &&
                                typeof path[0] === 'string'
                            ) {
                                return path[0];
                            }
                        }
                        return null;
                    })
                    .filter((param): param is string => param !== null);
            }
        } catch {
            // If parsing fails, try to extract from error message
            const match = validationError.match(/path":\s*\["([^"]+)"\]/);
            return match && match[1] ? [match[1]] : [];
        }
        return [];
    }

    /**
     * Clean shutdown
     */
    async cleanup(): Promise<void> {
        this.tools.clear();
        this.logger.info('Tool engine cleaned up');
    }
}
