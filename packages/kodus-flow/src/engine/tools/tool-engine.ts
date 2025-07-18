/**
 * @module engine/tool-engine
 * @description Tool engine with Zod validation and retry support
 */

import { createLogger } from '../../observability/index.js';
import { IdGenerator } from '../../utils/id-generator.js';
import type {
    ToolDefinition,
    ToolEngineConfig,
    ToolId,
    ToolCall,
    ToolDependency,
    ToolMetadataForPlanner,
} from '../../core/types/tool-types.js';
import { createToolContext } from '../../core/types/tool-types.js';
import type {
    ParallelToolsAction,
    SequentialToolsAction,
    ConditionalToolsAction,
} from '../../core/types/agent-types.js';
import {
    validateWithZod,
    zodToJSONSchema,
} from '../../core/utils/zod-to-json-schema.js';
import { createToolError } from '../../core/error-unified.js';
import type { MultiKernelHandler } from '../core/multi-kernel-handler.js';
import type { Router } from '../routing/router.js';
import type { AnyEvent } from '../../core/types/events.js';
import type { Plan, PlanStep } from '../planning/planner.js';
import {
    extractDependenciesFromPlan,
    type PlanDependencyExtractionConfig,
} from '../planning/plan-dependency-extractor.js';
import type { FeedbackOptimizer } from '../planning/feedback-optimizer.js';

export class ToolEngine {
    private logger: ReturnType<typeof createLogger>;
    private tools = new Map<ToolId, ToolDefinition<unknown, unknown>>();
    private config: ToolEngineConfig;
    private kernelHandler?: MultiKernelHandler;
    private router?: Router;
    private feedbackOptimizer?: FeedbackOptimizer;

    constructor(
        config: ToolEngineConfig = {},
        kernelHandler?: MultiKernelHandler,
        router?: Router,
    ) {
        this.config = config;
        this.kernelHandler = kernelHandler;
        this.router = router;
        this.logger = createLogger('tool-engine');
        this.logger.info('Tool engine created', {
            hasKernelHandler: !!kernelHandler,
            hasRouter: !!router,
        });
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
            description: tool.description,
        });
    }

    /**
     * Execute a tool call with retry logic and timeout
     */
    async executeCall<TInput = unknown, TOutput = unknown>(
        toolName: ToolId,
        input: TInput,
    ): Promise<TOutput> {
        const callId = IdGenerator.callId();
        const maxRetries = this.config.retry?.maxRetries || 3;
        const timeout = this.config.timeout || 30000;
        let lastError: Error;
        const startTime = Date.now();

        // Emit tool execution event via KernelHandler if available
        if (this.kernelHandler) {
            this.kernelHandler.emit('tool.execution.start', {
                toolName,
                callId,
                input,
                tenantId: 'default',
            });
        }

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Create timeout promise
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
                >(toolName, input, callId);

                // Race between execution and timeout
                const result = await Promise.race([
                    executionPromise,
                    timeoutPromise,
                ]);

                if (attempt > 1) {
                    this.logger.info('Tool execution succeeded after retry', {
                        toolName,
                        callId,
                        attempt,
                        maxRetries,
                    });
                }

                // Emit tool execution success event via KernelHandler
                if (this.kernelHandler) {
                    this.kernelHandler.emit('tool.execution.success', {
                        toolName,
                        callId,
                        result,
                        attempt,
                        tenantId: 'default',
                    });
                }

                // Record feedback metrics for successful execution
                if (this.feedbackOptimizer) {
                    const executionTime = Date.now() - startTime;
                    this.feedbackOptimizer.recordToolExecution(
                        toolName,
                        executionTime,
                        true, // success
                        attempt - 1, // retry count (0 if first attempt succeeded)
                    );
                }

                return result;
            } catch (error) {
                lastError = error as Error;

                // Emit tool execution error event via KernelHandler
                if (this.kernelHandler) {
                    this.kernelHandler.emit('tool.execution.error', {
                        toolName,
                        callId,
                        error: lastError.message,
                        attempt,
                        maxRetries,
                        tenantId: 'default',
                    });
                }

                if (attempt < maxRetries) {
                    const delay = Math.min(
                        1000 * Math.pow(2, attempt - 1),
                        5000,
                    );
                    this.logger.warn('Tool execution failed, retrying', {
                        toolName,
                        callId,
                        attempt,
                        maxRetries,
                        error: lastError.message,
                        retryDelay: delay,
                    });

                    await new Promise((resolve) => setTimeout(resolve, delay));
                } else {
                    this.logger.error(
                        'Tool execution failed after all retries',
                        lastError,
                        {
                            toolName,
                            callId,
                            attempt,
                            maxRetries,
                        },
                    );
                }
            }
        }

        // Record feedback metrics for failed execution (after all retries)
        if (this.feedbackOptimizer) {
            const executionTime = Date.now() - startTime;
            this.feedbackOptimizer.recordToolExecution(
                toolName,
                executionTime,
                false, // failed
                maxRetries, // used all retries
            );
        }

        throw lastError!;
    }

    /**
     * Internal tool execution method
     */
    private async executeToolInternal<TInput = unknown, TOutput = unknown>(
        toolName: ToolId,
        input: TInput,
        callId: string,
    ): Promise<TOutput> {
        // Find tool
        const tool = this.tools.get(toolName) as ToolDefinition<
            TInput,
            TOutput
        >;
        if (!tool) {
            throw new Error(`Tool not found: ${toolName}`);
        }

        // ✅ Unified validation
        this.validateToolInput(tool, input);

        // Create tool context using factory function
        const context = createToolContext(
            tool.name,
            callId,
            `exec-${Date.now()}`,
            'default',
            input as Record<string, unknown>,
        );

        // Execute tool using execute function
        const result = await tool.execute(input, context);

        this.logger.debug('Tool executed successfully', {
            toolName,
            callId,
        });

        return result;
    }

    /**
     * Get available tools with metadata for planner context engineering
     */
    getAvailableTools(): ToolMetadataForPlanner[] {
        debugger;
        return Array.from(this.tools.values())?.map((tool) => {
            // Prioritize existing JSON Schema, then convert Zod if needed
            let jsonSchema: unknown = tool.jsonSchema;

            // If inputSchema exists and looks like JSON Schema (not Zod), use it directly
            if (
                tool.inputSchema &&
                typeof tool.inputSchema === 'object' &&
                tool.inputSchema !== null &&
                'type' in tool.inputSchema
            ) {
                jsonSchema = tool.inputSchema;
            } else if (tool.inputSchema && !jsonSchema) {
                // Try converting Zod schema to JSON Schema
                try {
                    const converted = zodToJSONSchema(
                        tool.inputSchema,
                        tool.name,
                        tool.description || `Tool: ${tool.name}`,
                    );
                    jsonSchema = converted.parameters;
                } catch (error) {
                    this.logger.warn(
                        'Failed to convert Zod schema to JSON Schema',
                        {
                            toolName: tool.name,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        },
                    );
                    jsonSchema = { type: 'object', properties: {} };
                }
            }

            return {
                name: tool.name,
                description: tool.description || `Tool: ${tool.name}`,

                inputSchema: {
                    type: 'object' as const,
                    properties: this.extractPropertiesWithRequiredFlag(
                        ((jsonSchema as Record<string, unknown>)
                            ?.properties as Record<string, unknown>) || {},
                        ((jsonSchema as Record<string, unknown>)
                            ?.required as string[]) || [],
                    ),
                    required:
                        ((jsonSchema as Record<string, unknown>)
                            ?.required as string[]) || [],
                },

                config: {
                    timeout: 30000,
                    requiresAuth: false,
                    allowParallel: true,
                    maxConcurrentCalls: 5,
                    source: 'user' as const,
                },

                categories: tool.categories || [],
                dependencies: tool.dependencies || [],
                tags: tool.tags || [],

                examples: tool.examples || [],

                plannerHints: tool.plannerHints || {
                    useWhen: [`When you need to use ${tool.name}`],
                    avoidWhen: [],
                    combinesWith: [],
                    conflictsWith: [],
                },

                errorHandling: tool.errorHandling || {
                    retryStrategy: 'exponential',
                    maxRetries: 3,
                    fallbackAction: 'continue',
                    errorMessages: {},
                },
            };
        });
    }

    /**
     * Get tools in the correct format for LLMs (OpenAI, Anthropic, etc.)
     * Removes individual 'required' flags and keeps only the 'required' array
     */
    getToolsForLLM(): Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    }> {
        return Array.from(this.tools.values()).map((tool) => {
            // Prioritize existing JSON Schema, then convert Zod if needed
            let jsonSchema: unknown = tool.jsonSchema;

            // If inputSchema exists and looks like JSON Schema (not Zod), use it directly
            if (
                tool.inputSchema &&
                typeof tool.inputSchema === 'object' &&
                tool.inputSchema !== null &&
                'type' in tool.inputSchema
            ) {
                jsonSchema = tool.inputSchema;
            } else if (tool.inputSchema && !jsonSchema) {
                // Try converting Zod schema to JSON Schema
                try {
                    const converted = zodToJSONSchema(
                        tool.inputSchema,
                        tool.name,
                        tool.description || `Tool: ${tool.name}`,
                    );
                    jsonSchema = converted.parameters;
                } catch (error) {
                    this.logger.warn(
                        'Failed to convert Zod schema to JSON Schema for LLM',
                        {
                            toolName: tool.name,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        },
                    );
                    jsonSchema = { type: 'object', properties: {} };
                }
            }

            // Convert to LLM format - remove individual 'required' flags
            const jsonSchemaObj = jsonSchema as Record<string, unknown>;
            const properties =
                (jsonSchemaObj.properties as Record<string, unknown>) || {};
            const required = (jsonSchemaObj.required as string[]) || [];

            // Clean properties - remove individual 'required' flags
            const cleanProperties: Record<string, unknown> = {};
            for (const [key, prop] of Object.entries(properties)) {
                const propObj = prop as Record<string, unknown>;
                cleanProperties[key] = {
                    type: propObj.type || 'string',
                    description: propObj.description,
                    enum: propObj.enum,
                    default: propObj.default,
                    format: propObj.format,
                    // ❌ REMOVED: required: propObj.required
                };
            }

            return {
                name: tool.name,
                description: tool.description || `Tool: ${tool.name}`,
                parameters: {
                    type: 'object',
                    properties: cleanProperties,
                    required: required, // ✅ Keep only the array
                    additionalProperties:
                        jsonSchemaObj.additionalProperties ?? false,
                },
            };
        });
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
        this.logger.info('KernelHandler set for ToolEngine');

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
                const { toolName, input } = event.data as {
                    toolName: string;
                    input: unknown;
                };
                const correlationId = event.metadata?.correlationId;

                this.logger.info('🔧 [TOOL] Received tool execution request', {
                    toolName,
                    correlationId,
                    eventId: event.id,
                    hasInput: !!input,
                });

                try {
                    this.logger.info('🔧 [TOOL] Executing tool', {
                        toolName,
                        correlationId,
                    });

                    const result = await this.executeCall(toolName, input);

                    this.logger.info('🔧 [TOOL] Tool execution successful', {
                        toolName,
                        correlationId,
                        hasResult: !!result,
                    });

                    // Emit success response
                    this.kernelHandler!.emit('tool.execute.response', {
                        data: result,
                        metadata: {
                            correlationId,
                            success: true,
                            toolName,
                        },
                    });
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
                    this.kernelHandler!.emit('tool.execute.response', {
                        data: {
                            error: (error as Error).message,
                        },
                        metadata: {
                            correlationId,
                            success: false,
                            toolName,
                        },
                    });
                }
            },
        );

        this.logger.info('ToolEngine event handlers registered');
    }

    /**
     * Set Router (for intelligent tool execution)
     */
    setRouter(router: Router): void {
        this.router = router;
        this.logger.info('Router set for ToolEngine');
    }

    /**
     * Set FeedbackOptimizer (for learning and optimization)
     */
    setFeedbackOptimizer(feedbackOptimizer: FeedbackOptimizer): void {
        this.feedbackOptimizer = feedbackOptimizer;
        this.logger.info('FeedbackOptimizer set for ToolEngine');
    }

    /**
     * Get KernelHandler status
     */
    hasKernelHandler(): boolean {
        return !!this.kernelHandler;
    }

    /**
     * Get Router status
     */
    hasRouter(): boolean {
        return !!this.router;
    }

    /**
     * Get FeedbackOptimizer status
     */
    hasFeedbackOptimizer(): boolean {
        return !!this.feedbackOptimizer;
    }

    /**
     * Execute tool directly (for testing compatibility) - with basic retry
     */
    async executeTool<TInput = unknown, TOutput = unknown>(
        toolName: string,
        input: TInput,
    ): Promise<TOutput> {
        const maxRetries = this.config.retry?.maxRetries || 1;
        let lastError: Error;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const tool = this.tools.get(
                    toolName as ToolId,
                ) as ToolDefinition<TInput, TOutput>;
                if (!tool) {
                    throw new Error(`Tool ${toolName} not found`);
                }

                // ✅ Unified validation - ensure all execution paths validate input
                this.validateToolInput(tool, input);

                // Create tool context using factory function
                const context = createToolContext(
                    tool.name,
                    `call-${Date.now()}`,
                    `exec-${Date.now()}`,
                    'default',
                    input as Record<string, unknown>,
                );

                const result = await tool.execute(input, context);

                if (attempt > 1) {
                    this.logger.info('Tool execution succeeded after retry', {
                        toolName,
                        attempt,
                        maxRetries,
                    });
                }

                return result;
            } catch (error) {
                lastError = error as Error;

                if (attempt < maxRetries) {
                    const delay = Math.min(
                        1000 * Math.pow(2, attempt - 1),
                        5000,
                    );
                    this.logger.warn('Tool execution failed, retrying', {
                        toolName,
                        attempt,
                        maxRetries,
                        error: lastError.message,
                        retryDelay: delay,
                    });

                    await new Promise((resolve) => setTimeout(resolve, delay));
                } else {
                    this.logger.error(
                        'Tool execution failed after all retries',
                        lastError,
                        {
                            toolName,
                            attempt,
                            maxRetries,
                        },
                    );
                }
            }
        }

        throw lastError!;
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

            this.logger.debug('Executing dependency phase', {
                phase: phaseIndex,
                tools: phase?.map((t) => t.toolName) || [],
            });

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

    // ===== 🧠 NEW: ROUTER-INTELLIGENT TOOL EXECUTION =====

    /**
     * Execute tools using Router intelligence for optimal strategy
     */
    async executeWithRouterStrategy<TOutput = unknown>(
        tools: ToolCall[],
        context: Record<string, unknown> = {},
        constraints?: {
            timeLimit?: number;
            resourceLimit?: number;
            qualityThreshold?: number;
        },
    ): Promise<Array<{ toolName: string; result?: TOutput; error?: string }>> {
        if (!this.router) {
            this.logger.warn(
                'Router not available, falling back to parallel execution',
            );
            return this.executeParallelTools<TOutput>({
                type: 'parallel_tools',
                tools,
                concurrency: 5,
                timeout: 60000,
                failFast: false,
            });
        }

        const startTime = Date.now();
        const toolNames = tools.map((t) => t.toolName);

        this.logger.info('Analyzing tools with Router intelligence', {
            tools: toolNames,
            hasConstraints: !!constraints,
        });

        // Get Router intelligence
        const strategy = this.router.determineToolExecutionStrategy(
            toolNames,
            context,
            constraints,
        );

        this.logger.info('Router strategy determined', {
            strategy: strategy.strategy,
            confidence: strategy.confidence,
            reasoning: strategy.reasoning,
            estimatedTime: strategy.executionPlan.totalEstimatedTime,
            riskLevel: strategy.executionPlan.riskLevel,
        });

        // Execute based on Router recommendation
        let results: Array<{
            toolName: string;
            result?: TOutput;
            error?: string;
        }>;

        switch (strategy.strategy) {
            case 'parallel':
                results = await this.executeParallelTools<TOutput>({
                    type: 'parallel_tools',
                    tools,
                    concurrency: this.calculateOptimalConcurrency(
                        strategy,
                        constraints,
                    ),
                    timeout: constraints?.timeLimit || 60000,
                    failFast: strategy.executionPlan.riskLevel === 'high',
                    reasoning: `Router-optimized parallel execution: ${strategy.reasoning}`,
                });
                break;

            case 'sequential':
                results = await this.executeSequentialTools<TOutput>({
                    type: 'sequential_tools',
                    tools,
                    stopOnError: strategy.executionPlan.riskLevel === 'high',
                    passResults: this.shouldPassResults(strategy, context),
                    timeout: constraints?.timeLimit || 120000,
                    reasoning: `Router-optimized sequential execution: ${strategy.reasoning}`,
                });
                break;

            case 'conditional':
                results = await this.executeConditionalTools<TOutput>({
                    type: 'conditional_tools',
                    tools,
                    conditions: this.extractConditionsFromContext(context),
                    evaluateAll: strategy.confidence > 0.8,
                    reasoning: `Router-optimized conditional execution: ${strategy.reasoning}`,
                });
                break;

            case 'adaptive':
            default:
                results = await this.executeAdaptiveWithRouterPlan(
                    tools,
                    strategy,
                    context,
                );
                break;
        }

        const executionTime = Date.now() - startTime;

        this.logger.info('Router-guided execution completed', {
            strategy: strategy.strategy,
            actualTime: executionTime,
            estimatedTime: strategy.executionPlan.totalEstimatedTime,
            accuracy:
                Math.abs(
                    executionTime - strategy.executionPlan.totalEstimatedTime,
                ) / strategy.executionPlan.totalEstimatedTime,
            successCount: results.filter((r) => !r.error).length,
            errorCount: results.filter((r) => r.error).length,
        });

        return results;
    }

    /**
     * Execute adaptive strategy with Router execution plan
     */
    private async executeAdaptiveWithRouterPlan<TOutput = unknown>(
        tools: ToolCall[],
        strategy: ReturnType<Router['determineToolExecutionStrategy']>,
        _context: Record<string, unknown>,
    ): Promise<Array<{ toolName: string; result?: TOutput; error?: string }>> {
        const allResults: Array<{
            toolName: string;
            result?: TOutput;
            error?: string;
        }> = [];

        // Execute each phase according to Router plan
        for (let i = 0; i < strategy.executionPlan.phases.length; i++) {
            const phase = strategy.executionPlan.phases[i];
            if (!phase) continue;

            this.logger.debug('Executing Router-planned phase', {
                phase: i + 1,
                totalPhases: strategy.executionPlan.phases.length,
                tools: phase.tools,
                strategy: phase.strategy,
                estimatedTime: phase.estimatedTime,
            });

            const phaseTools = tools.filter((t) =>
                phase.tools.includes(t.toolName),
            );

            if (phaseTools.length === 0) continue;

            let phaseResults: Array<{
                toolName: string;
                result?: TOutput;
                error?: string;
            }>;

            if (phase.strategy === 'parallel') {
                phaseResults = await this.executeParallelTools<TOutput>({
                    type: 'parallel_tools',
                    tools: phaseTools,
                    concurrency: Math.min(phaseTools.length, 3),
                    timeout: phase.estimatedTime * 1.5, // 50% buffer
                    failFast: false,
                });
            } else {
                phaseResults = await this.executeSequentialTools<TOutput>({
                    type: 'sequential_tools',
                    tools: phaseTools,
                    stopOnError: false,
                    passResults: true,
                    timeout: phase.estimatedTime * 1.5,
                });
            }

            allResults.push(...phaseResults);

            // Check if we should continue based on phase results
            const phaseErrorCount = phaseResults.filter((r) => r.error).length;
            if (
                phaseErrorCount > 0 &&
                strategy.executionPlan.riskLevel === 'high'
            ) {
                this.logger.warn(
                    'Stopping adaptive execution due to phase errors',
                    {
                        phase: i + 1,
                        errors: phaseErrorCount,
                        riskLevel: strategy.executionPlan.riskLevel,
                    },
                );
                break;
            }
        }

        return allResults;
    }

    /**
     * Calculate optimal concurrency based on Router strategy
     */
    private calculateOptimalConcurrency(
        strategy: ReturnType<Router['determineToolExecutionStrategy']>,
        constraints?: { resourceLimit?: number },
    ): number {
        let baseConcurrency = 5; // Default

        // Adjust based on risk level
        switch (strategy.executionPlan.riskLevel) {
            case 'low':
                baseConcurrency = 8;
                break;
            case 'medium':
                baseConcurrency = 5;
                break;
            case 'high':
                baseConcurrency = 2;
                break;
        }

        // Adjust based on confidence
        if (strategy.confidence > 0.9) {
            baseConcurrency += 2;
        } else if (strategy.confidence < 0.5) {
            baseConcurrency = Math.max(1, baseConcurrency - 2);
        }

        // Apply resource constraints
        if (constraints?.resourceLimit && constraints.resourceLimit < 0.5) {
            baseConcurrency = Math.max(1, Math.floor(baseConcurrency * 0.6));
        }

        return baseConcurrency;
    }

    /**
     * Determine if results should be passed between tools
     */
    private shouldPassResults(
        strategy: ReturnType<Router['determineToolExecutionStrategy']>,
        context: Record<string, unknown>,
    ): boolean {
        // Pass results if strategy indicates dependencies or sequential processing benefits
        return (
            strategy.strategy === 'sequential' &&
            (strategy.reasoning.includes('dependencies') ||
                strategy.reasoning.includes('pipeline') ||
                context.passResults === true)
        );
    }

    /**
     * Extract conditions from context for conditional execution
     */
    private extractConditionsFromContext(
        context: Record<string, unknown>,
    ): Record<string, unknown> {
        const conditions: Record<string, unknown> = {};

        // Extract known condition patterns
        Object.keys(context).forEach((key) => {
            if (key.startsWith('condition_') || key.endsWith('_condition')) {
                conditions[key] = context[key];
            }
        });

        // Add common conditions
        conditions.hasAuth = !!context.token || !!context.apiKey;
        conditions.hasData = !!context.data || !!context.input;
        conditions.isProduction = context.environment === 'production';

        return conditions;
    }

    // ===== 🧠 NEW: PLANNER DEPENDENCIES INTEGRATION =====

    /**
     * Execute tools respecting Planner-generated dependencies
     */
    async executeRespectingPlannerDependencies<TOutput = unknown>(
        plan: Plan,
        config?: PlanDependencyExtractionConfig,
    ): Promise<Array<{ toolName: string; result?: TOutput; error?: string }>> {
        const startTime = Date.now();

        this.logger.info('Executing tools with Planner dependencies', {
            planId: plan.id,
            stepCount: plan.steps.length,
            strategy: plan.strategy,
        });

        // Extract dependencies from plan
        const extraction = extractDependenciesFromPlan(plan, config);

        // Log warnings se houver
        if (extraction.warnings.length > 0) {
            extraction.warnings.forEach((warning) => {
                this.logger.warn('Plan extraction warning', {
                    warning,
                    planId: plan.id,
                });
            });
        }

        this.logger.debug('Plan dependencies extracted', {
            planId: plan.id,
            toolCallsCount: extraction.toolCalls.length,
            dependenciesCount: extraction.dependencies.length,
            warningsCount: extraction.warnings.length,
        });

        // Execute using existing dependency system
        const results = await this.executeWithDependencies(
            extraction.toolCalls,
            extraction.dependencies,
            {
                maxConcurrency: this.determineConcurrencyFromPlan(plan),
                timeout: this.determineTimeoutFromPlan(plan),
                failFast: this.determineFastFailFromPlan(plan),
            },
        );

        const executionTime = Date.now() - startTime;

        this.logger.info('Planner-guided tool execution completed', {
            planId: plan.id,
            executionTime,
            successCount: results.filter((r) => !r.error).length,
            errorCount: results.filter((r) => r.error).length,
        });

        return results as Array<{
            toolName: string;
            result?: TOutput;
            error?: string;
        }>;
    }

    /**
     * Execute plan steps directly (alternative interface)
     */
    async executePlanSteps<TOutput = unknown>(
        planSteps: PlanStep[],
        planId: string = `plan-${Date.now()}`,
        config?: PlanDependencyExtractionConfig,
    ): Promise<Array<{ toolName: string; result?: TOutput; error?: string }>> {
        // Create a minimal plan for extraction
        const plan: Plan = {
            id: planId,
            goal: 'Execute plan steps',
            strategy: 'graph', // Assume graph for dependency handling
            steps: planSteps,
            context: {},
            createdAt: Date.now(),
            agentName: 'tool-engine',
            status: 'executing',
        };

        return this.executeRespectingPlannerDependencies(plan, config);
    }

    /**
     * Check if plan has tool dependencies that should be respected
     */
    planHasDependencies(plan: Plan): boolean {
        return plan.steps.some(
            (step) =>
                (step.dependencies && step.dependencies.length > 0) ||
                (step.toolDependencies && step.toolDependencies.length > 0),
        );
    }

    /**
     * Get plan dependency analysis without executing
     */
    analyzePlanDependencies(
        plan: Plan,
        config?: PlanDependencyExtractionConfig,
    ) {
        const extraction = extractDependenciesFromPlan(plan, config);

        return {
            hasDependencies: extraction.dependencies.length > 0,
            toolCount: extraction.toolCalls.length,
            dependencyCount: extraction.dependencies.length,
            warningsCount: extraction.warnings.length,
            warnings: extraction.warnings,
            executionPhases: this.calculateExecutionPhases(
                extraction.toolCalls,
                extraction.dependencies,
            ),
            estimatedTime: this.estimateExecutionTime(plan),
            recommendedConcurrency: this.determineConcurrencyFromPlan(plan),
        };
    }

    /**
     * Calculate execution phases for plan
     */
    private calculateExecutionPhases(
        tools: ToolCall[],
        dependencies: ToolDependency[],
    ) {
        const { executionOrder } = this.resolveToolDependencies(
            tools,
            dependencies,
        );
        return {
            phaseCount: executionOrder.length,
            phases: executionOrder.map((phase, index) => ({
                phase: index + 1,
                tools: phase.map((t) => t.toolName),
                canRunInParallel: phase.length > 1,
            })),
        };
    }

    /**
     * Determine optimal concurrency based on plan characteristics
     */
    private determineConcurrencyFromPlan(plan: Plan): number {
        const parallelSteps = plan.steps.filter(
            (step) => step.canRunInParallel !== false,
        );
        const highComplexitySteps = plan.steps.filter(
            (step) => step.complexity === 'high',
        );

        // Conservative approach for plans with many high-complexity steps
        if (highComplexitySteps.length > parallelSteps.length * 0.5) {
            return Math.max(1, Math.floor(parallelSteps.length * 0.3));
        }

        // Moderate concurrency for mixed complexity
        if (plan.steps.some((step) => step.complexity === 'high')) {
            return Math.max(2, Math.floor(parallelSteps.length * 0.6));
        }

        // Higher concurrency for low-complexity plans
        return Math.min(8, Math.max(3, parallelSteps.length));
    }

    /**
     * Determine timeout based on plan characteristics
     */
    private determineTimeoutFromPlan(plan: Plan): number {
        const estimatedDurations = plan.steps
            .map((step) => step.estimatedDuration || 30000)
            .filter(Boolean);

        if (estimatedDurations.length === 0) {
            return 120000; // 2 minutes default
        }

        const totalEstimated = estimatedDurations.reduce(
            (sum, duration) => sum + duration,
            0,
        );

        // Add 50% buffer
        return Math.max(60000, totalEstimated * 1.5);
    }

    /**
     * Determine failFast setting based on plan criticality
     */
    private determineFastFailFromPlan(plan: Plan): boolean {
        const criticalSteps = plan.steps.filter(
            (step) => step.critical === true,
        );

        // Fail fast if majority of steps are critical
        return criticalSteps.length > plan.steps.length * 0.6;
    }

    /**
     * Estimate total execution time for plan
     */
    private estimateExecutionTime(plan: Plan): number {
        const extraction = extractDependenciesFromPlan(plan);
        const { executionOrder } = this.resolveToolDependencies(
            extraction.toolCalls,
            extraction.dependencies,
        );

        let totalTime = 0;

        for (const phase of executionOrder) {
            if (phase.length === 0) continue;

            // For parallel phase, take the maximum estimated time
            const phaseSteps = phase
                .map((tool) => plan.steps.find((step) => step.id === tool.id))
                .filter(Boolean);

            const phaseTimes = phaseSteps.map(
                (step) => step?.estimatedDuration || 30000,
            );

            if (phase.length === 1) {
                // Sequential execution
                totalTime += phaseTimes[0] || 30000;
            } else {
                // Parallel execution - take max time
                totalTime += Math.max(...phaseTimes);
            }
        }

        return totalTime;
    }

    // ===== 🚀 NEW: PARALLEL TOOL EXECUTION METHODS =====

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
            this.kernelHandler.emit('tool.parallel.execution.start', {
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
                this.kernelHandler.emit('tool.parallel.execution.success', {
                    tools: action.tools.map((t) => t.toolName),
                    results,
                    executionTime: Date.now() - startTime,
                    tenantId: 'default',
                });
            }

            return results;
        } catch (error) {
            // Emit error event
            if (this.kernelHandler) {
                this.kernelHandler.emit('tool.parallel.execution.error', {
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
            this.kernelHandler.emit('tool.sequential.execution.start', {
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
                this.kernelHandler.emit('tool.sequential.execution.success', {
                    tools: action.tools.map((t) => t.toolName),
                    results,
                    executionTime: Date.now() - startTime,
                    tenantId: 'default',
                });
            }

            return results;
        } catch (error) {
            // Emit error event
            if (this.kernelHandler) {
                this.kernelHandler.emit('tool.sequential.execution.error', {
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
            this.kernelHandler.emit('tool.conditional.execution.start', {
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
                this.kernelHandler.emit('tool.conditional.execution.success', {
                    tools: action.tools.map((t) => t.toolName),
                    results,
                    executionTime: Date.now() - startTime,
                    tenantId: 'default',
                });
            }

            return results;
        } catch (error) {
            // Emit error event
            if (this.kernelHandler) {
                this.kernelHandler.emit('tool.conditional.execution.error', {
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

        // Validate input using Zod schema if available
        if (tool.inputSchema) {
            const validation = validateWithZod(tool.inputSchema, input);
            if (!validation.success) {
                throw createToolError(
                    `Tool input validation failed: ${validation.error}`,
                    {
                        severity: 'low',
                        domain: 'business',
                        userImpact: 'degraded',
                        retryable: false,
                        recoverable: true,
                        context: { toolName: tool.name, input, validation },
                        userMessage:
                            'The input provided to the tool is invalid. Please check the parameters and try again.',
                        recoveryHints: [
                            'Check the tool documentation for correct input format',
                            'Validate input parameters before calling the tool',
                        ],
                    },
                );
            }
        }
    }

    /**
     * Clean shutdown
     */
    async cleanup(): Promise<void> {
        this.tools.clear();
        this.logger.info('Tool engine cleaned up');
    }
}

// Re-export defineTool from tool-types to avoid duplication
export { defineTool } from '../../core/types/tool-types.js';
