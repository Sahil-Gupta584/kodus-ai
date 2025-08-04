/**
 * @module core/types/tool-types
 * @description Sistema de definição de tools com Zod como padrão interno
 *
 * ARQUITETURA ZOD-FIRST:
 * - Zod como schema primário interno
 * - Conversão automática para JSON Schema
 * - Compatibilidade total com MCP
 * - Type safety em runtime
 * - Validação automática de entrada/saída
 *
 * PADRÕES SEGUIDOS:
 * - OpenAI Structured Outputs
 * - Anthropic MCP
 * - LangChain Tools
 * - Industry best practices
 */

import { z } from 'zod';
import type {
    BaseContext,
    BaseDefinition,
    BaseExecutionResult,
    BaseEngineConfig,
    Metadata,
} from './base-types.js';
import type { RetryOptions } from './retry-types.js';
import { zodToJSONSchema } from '../utils/zod-to-json-schema.js';

// ===== TOOL IDENTITY TYPES =====

/**
 * Tool ID schema for validation - uses branded type
 */
export const toolIdSchema = z.string().min(1);
export type ToolIdSchema = z.infer<typeof toolIdSchema>;

export type { ToolId } from './base-types.js';

/**
 * Tool Call ID - identifies a specific tool invocation
 */
export const toolCallIdSchema = z.string().min(1);
// ToolCallId moved to base-types.ts

// =============================================================================
// ZOD-FIRST SCHEMA SYSTEM
// =============================================================================

/**
 * JSON Schema compatible com LLMs - gerado automaticamente do Zod
 */
export interface ToolJSONSchema {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
        additionalProperties?: boolean;
    };
}

/**
 * Tool parameter schema - mantido para compatibilidade
 */
export const toolParameterSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
    required: z.boolean().optional(),
    enum: z.array(z.string()).optional(),
    properties: z
        .record(
            z.string(),
            z.lazy((): z.ZodType<unknown> => toolParameterSchema),
        )
        .optional(),
    items: z.lazy((): z.ZodType<unknown> => toolParameterSchema).optional(),
    default: z.unknown().optional(),
});
export type ToolParameter = z.infer<typeof toolParameterSchema>;

// =============================================================================
// TOOL DEFINITION - ZOD FIRST
// =============================================================================

/**
 * Tool Handler function type - execução da tool
 */
export type ToolHandler<TInput = unknown, TOutput = unknown> = (
    input: TInput,
    context: ToolContext,
) => Promise<TOutput> | TOutput;

/**
 * Tool Definition - Definição de uma tool com Zod como schema primário
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown>
    extends BaseDefinition {
    // === EXECUÇÃO ===
    execute: ToolHandler<TInput, TOutput>;

    // === SCHEMA ZOD (PRIMÁRIO) ===
    /** Schema Zod para validação de entrada - PADRÃO INTERNO */
    inputSchema: z.ZodSchema<TInput>;

    /** Schema Zod para validação de saída (opcional) */
    outputSchema?: z.ZodSchema<TOutput>;

    // === JSON SCHEMA (GERADO AUTOMATICAMENTE) ===
    /** JSON Schema gerado automaticamente do Zod para LLMs */
    jsonSchema?: ToolJSONSchema;

    // === CONFIGURAÇÃO ===
    config?: {
        timeout?: number;
        requiresAuth?: boolean;
        allowParallel?: boolean;
        maxConcurrentCalls?: number;
        // MCP-specific
        serverName?: string;
        mcpTool?: boolean;
        // Origem da tool
        source?: 'mcp' | 'user' | 'system';
    };

    // === CATEGORIZAÇÃO ===
    categories?: string[];

    // === CONTEXT ENGINEERING ===
    /** Exemplos de uso para context engineering */
    examples?: ToolExample[];

    /** Estratégias de error handling */
    errorHandling?: {
        retryStrategy?: 'exponential' | 'linear' | 'none';
        maxRetries?: number;
        fallbackAction?: string;
        errorMessages?: Record<string, string>;
    };

    /** Dicas para o planner sobre como usar a tool */
    plannerHints?: {
        /** Quando usar esta tool */
        useWhen?: string[];
        /** Quando NÃO usar esta tool */
        avoidWhen?: string[];
        /** Tools que funcionam bem juntas */
        combinesWith?: string[];
        /** Tools que conflitam */
        conflictsWith?: string[];
    };
    dependencies?: string[];
    tags?: string[];

    // === TOOL CALLBACKS (AI SDK INSPIRED) ===
    /** Callbacks para melhor UX durante execução da tool */
    callbacks?: ToolCallbacks;
}

/**
 * Exemplo de uso de uma tool para context engineering
 */
export interface ToolExample {
    /** Descrição do exemplo */
    description: string;

    /** Input de exemplo */
    input: Record<string, unknown>;

    /** Output esperado (opcional) */
    expectedOutput?: unknown;

    /** Contexto em que este exemplo é útil */
    context?: string;

    /** Tags para categorizar o exemplo */
    tags?: string[];
}

export type ToolMetadataForLLM = {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
};

/**
 * Metadata estruturada da tool para planners
 */
export interface ToolMetadataForPlanner {
    name: string;
    description: string;

    // Schema estruturado com parâmetros obrigatórios
    inputSchema: {
        type: 'object';
        properties: Record<
            string,
            {
                type: string;
                description?: string;
                required: boolean;
                enum?: string[];
                default?: unknown;
                format?: string;
            }
        >;
        required: string[];
    };

    // Configuração de execução
    config: {
        timeout: number;
        requiresAuth: boolean;
        allowParallel: boolean;
        maxConcurrentCalls: number;
        source: 'mcp' | 'user' | 'system';
    };

    // Metadados para context engineering
    categories: string[];
    dependencies: string[];
    tags: string[];

    // Exemplos de uso
    examples: ToolExample[];

    // Dicas para o planner
    plannerHints?: {
        useWhen?: string[];
        avoidWhen?: string[];
        combinesWith?: string[];
        conflictsWith?: string[];
    };

    // Estratégias de error handling
    errorHandling?: {
        retryStrategy?: 'exponential' | 'linear' | 'none';
        maxRetries?: number;
        fallbackAction?: string;
        errorMessages?: Record<string, string>;
    };
}

// ===== TOOL CONTEXT =====

/**
 * Tool Context - Execution environment for tools
 * Extends BaseContext but remains stateless (tools don't have memory/persistence)
 */
export interface ToolContext extends BaseContext {
    // === TOOL IDENTITY ===
    toolName: string;
    callId: string;

    // === EXECUTION STATE (read-only for tools) ===
    // Input parameters for this call
    parameters: Record<string, unknown>;

    // Abort signal for cancellation
    signal: AbortSignal;

    // === OBSERVABILITY ===
    // Logger instance
    logger?: {
        debug: (message: string, meta?: Record<string, unknown>) => void;
        info: (message: string, meta?: Record<string, unknown>) => void;
        warn: (message: string, meta?: Record<string, unknown>) => void;
        error: (
            message: string,
            error?: Error,
            meta?: Record<string, unknown>,
        ) => void;
    };

    // === CLEANUP ===
    cleanup(): Promise<void>;
}

// ===== TOOL ENGINE TYPES =====

/**
 * Tool Engine Configuration
 */
export interface ToolEngineConfig extends BaseEngineConfig {
    // Tool execution settings
    validateSchemas?: boolean;
    allowOverrides?: boolean;
    defaultToolTimeout?: number;
    maxConcurrentCalls?: number;

    // Retry configuration
    retry?: Partial<RetryOptions>;
    retryOptions?: Partial<RetryOptions>; // Alias for compatibility

    // Timeout configuration
    timeout?: number; // Default timeout for tool execution

    // Security settings
    sandboxEnabled?: boolean;
    allowedCategories?: string[];
}

/**
 * Tool Execution Options
 */
export interface ToolExecutionOptions {
    timeout?: number;
    validateArguments?: boolean;
    continueOnError?: boolean;
    context?: Partial<ToolContext>;
    metadata?: Metadata;
}

// ===== TOOL EXECUTION STRATEGY TYPES =====

/**
 * Tool execution strategies for autonomous agents
 */
export type ToolExecutionStrategy =
    | 'parallel' // Execute all tools simultaneously
    | 'sequential' // Execute tools one after another
    | 'conditional' // Execute tools based on conditions
    | 'adaptive' // Adaptive strategy based on context
    | 'dependencyBased' // Execute based on tool dependencies
    | 'priorityBased' // Execute based on priority levels
    | 'resourceAware'; // Execute based on resource availability

/**
 * Tool execution rule for intelligent decision making
 */
export interface ToolExecutionRule {
    id: string;
    name: string;
    description: string;
    condition: string | ((context: ToolContext) => boolean);
    strategy: ToolExecutionStrategy;
    priority: number;
    enabled: boolean;
    metadata?: Record<string, unknown>;
}

/**
 * Tool execution hint for planner/router intelligence
 */
export interface ToolExecutionHint {
    strategy: ToolExecutionStrategy;
    confidence: number; // 0-1 confidence in this strategy
    reasoning: string;
    estimatedTime?: number;
    estimatedResources?: number;
    riskLevel?: 'low' | 'medium' | 'high';
    benefits?: string[];
    drawbacks?: string[];
    alternatives?: ToolExecutionStrategy[];
    metadata?: Record<string, unknown>;
}

/**
 * Tool dependency specification
 */
export interface ToolDependency {
    toolName: string;
    dependencies?: string[]; // Tools that this tool depends on
    type: 'required' | 'optional' | 'conditional';
    condition?: string | ((context: ToolContext) => boolean);
    failureAction?: 'stop' | 'continue' | 'retry' | 'fallback';
    fallbackTool?: string;
}

/**
 * Tool execution batch configuration
 */
export interface ToolBatchConfig {
    maxConcurrency: number;
    batchSize: number;
    delayBetweenBatches?: number;
    priorityOrdering?: boolean;
    resourceLimits?: {
        maxMemoryMB?: number;
        maxCPUPercent?: number;
        maxNetworkMbps?: number;
    };
}

// ===== SIMPLIFIED METRICS =====

/**
 * Core tool execution metrics
 */
export interface ToolExecutionMetrics {
    // Basic timing
    startTime: number;
    endTime: number;
    totalExecutionTime: number;
    averageExecutionTime: number;

    // Success/failure
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    successRate: number;

    // Concurrency
    maxConcurrency: number;
    averageConcurrency: number;

    // Errors
    timeoutErrors: number;
    validationErrors: number;
    executionErrors: number;

    // Metadata
    toolName: string;
    executionStrategy: ToolExecutionStrategy;
    tenantId: string;
    timestamp: number;
}

/**
 * Tool Execution Result
 */
export interface ToolExecutionResult<TOutput = unknown>
    extends BaseExecutionResult<TOutput> {
    // Tool-specific information
    toolName: string;
    callId: string;

    // Enhanced metadata for tools
    metadata: Metadata & {
        toolCategory?: string;
        executionTime: number;
        retryCount: number;
        cacheHit?: boolean;
    };
}

// ===== TOOL CALL TYPES =====

/**
 * Tool Call - represents a request to execute a tool
 */
export interface ToolCall {
    id: string;
    toolName: string;
    arguments: Record<string, unknown>;
    timestamp: number;
    correlationId?: string;
    metadata?: Metadata;
}

/**
 * Tool Result - represents the result of a tool execution
 */
export interface ToolResult<TOutput = unknown> {
    callId: string;
    toolName: string;
    result?: TOutput;
    error?: string;
    timestamp: number;
    duration: number;
    metadata?: Metadata;
}

// ===== TOOL REGISTRY TYPES =====

/**
 * Tool Registry Options
 */
export interface ToolRegistryOptions {
    validateSchemas?: boolean;
    allowOverrides?: boolean;
    defaultTimeout?: number;
}

/**
 * Tool Category
 */
export interface ToolCategory {
    id: string;
    name: string;
    description?: string;
    parentId?: string;
    metadata?: Metadata;
}

/**
 * Tool Manifest - describes available tools
 */
export interface ToolManifest {
    tools: Array<{
        id: string;
        name: string;
        description: string;
        categories?: string[];
        version?: string;
        metadata?: Metadata;
    }>;
    categories?: ToolCategory[];
    metadata?: Metadata;
}

// ===== TOOL EVENT TYPES =====

/**
 * Tool Call Event
 */
export interface ToolCallEvent {
    toolName: string;
    input: unknown;
    callId: string;
    correlationId?: string;
    timestamp: number;
}

/**
 * Tool Result Event
 */
export interface ToolResultEvent<TOutput = unknown> {
    toolName: string;
    result: TOutput;
    callId: string;
    correlationId?: string;
    timestamp: number;
    duration: number;
}

/**
 * Tool Error Event
 */
export interface ToolErrorEvent {
    toolName: string;
    error: string;
    callId: string;
    correlationId?: string;
    timestamp: number;
}

// ===== VALIDATION SCHEMAS =====

/**
 * Tool execution strategy schema
 */
export const toolExecutionStrategySchema = z.enum([
    'parallel',
    'sequential',
    'conditional',
    'adaptive',
    'dependencyBased',
    'priorityBased',
    'resourceAware',
]);

/**
 * Tool execution rule schema
 */
export const toolExecutionRuleSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    condition: z.union([z.string(), z.unknown()]),
    strategy: toolExecutionStrategySchema,
    priority: z.number(),
    enabled: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Tool execution hint schema
 */
export const toolExecutionHintSchema = z.object({
    strategy: toolExecutionStrategySchema,
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
    estimatedTime: z.number().positive().optional(),
    estimatedResources: z.number().positive().optional(),
    riskLevel: z.enum(['low', 'medium', 'high']).optional(),
    benefits: z.array(z.string()).optional(),
    drawbacks: z.array(z.string()).optional(),
    alternatives: z.array(toolExecutionStrategySchema).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Tool dependency schema
 */
export const toolDependencySchema = z.object({
    toolName: z.string().min(1),
    type: z.enum(['required', 'optional', 'conditional']),
    condition: z.union([z.string(), z.unknown()]).optional(),
    failureAction: z.enum(['stop', 'continue', 'retry', 'fallback']).optional(),
    fallbackTool: z.string().optional(),
});

/**
 * Tool batch config schema
 */
export const toolBatchConfigSchema = z.object({
    maxConcurrency: z.number().positive(),
    batchSize: z.number().positive(),
    delayBetweenBatches: z.number().nonnegative().optional(),
    priorityOrdering: z.boolean().optional(),
    resourceLimits: z
        .object({
            maxMemoryMB: z.number().positive().optional(),
            maxCPUPercent: z.number().min(0).max(100).optional(),
            maxNetworkMbps: z.number().positive().optional(),
        })
        .optional(),
});

// ✅ Zod v4: Schemas otimizados para performance
export const toolDefinitionSchema = z
    .object({
        name: z.string().min(1),
        description: z.string().optional(),
        version: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        handler: z.instanceof(Function), // ✅ Zod v4: Mais específico que z.unknown()
        config: z
            .object({
                timeout: z.number().positive().optional(),
                requiresAuth: z.boolean().optional(),
                allowParallel: z.boolean().optional(),
                maxConcurrentCalls: z.number().positive().optional(),
            })
            .optional(),
        categories: z.array(z.string()).optional(),
        dependencies: z.array(z.string()).optional(),
    })
    .strict()
    .refine(
        // ✅ Zod v4: strict() + refine() para performance
        (data) => {
            // ✅ Validação cross-field: se requiresAuth=true, deve ter metadata.auth
            if (data.config?.requiresAuth) {
                return data.metadata?.auth !== undefined;
            }
            return true;
        },
        {
            message: 'Tools requiring auth must have auth metadata',
            path: ['metadata', 'auth'],
        },
    );

// ✅ Zod v4: Schema de tool input com coerção automática
export const toolInputSchema = z
    .object({
        arguments: z.record(z.string(), z.unknown()),
        context: z.record(z.string(), z.unknown()).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .transform((data) => {
        // ✅ Transformação automática: normalizar argumentos
        return {
            ...data,
            arguments: Object.fromEntries(
                Object.entries(data.arguments).map(([key, value]) => [
                    key.toLowerCase(),
                    value,
                ]),
            ),
        };
    });

// ✅ Zod v4: Schema de tool result com validação de sucesso
export const toolResultSchema = z
    .object({
        success: z.boolean(),
        data: z.unknown().optional(),
        error: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        executionTime: z.number().positive().optional(),
    })
    .refine(
        (data) => {
            // ✅ Validação: se success=true, deve ter data; se success=false, deve ter error
            if (data.success) {
                return data.data !== undefined;
            } else {
                return data.error !== undefined;
            }
        },
        {
            message:
                'Successful tools must have data, failed tools must have error',
            path: ['success'],
        },
    );

// ✅ Zod v4: Schema de tool execution com validação de timeout
export const toolExecutionSchema = z
    .object({
        toolName: z.string().min(1),
        input: toolInputSchema,
        config: z
            .object({
                timeout: z.number().positive().default(60000), // ✅ 60s timeout
                retries: z.number().nonnegative().default(3),
                enableCaching: z.boolean().default(false),
            })
            .optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .transform((data) => {
        // ✅ Transformação: aplicar configurações padrão
        return {
            ...data,
            config: {
                timeout: 60000, // ✅ 60s timeout
                retries: 3,
                enableCaching: false,
                ...data.config,
            },
        };
    });

export const toolExecutionOptionsSchema = z.object({
    timeout: z.number().positive().optional(),
    validateArguments: z.boolean().optional(),
    continueOnError: z.boolean().optional(),
    context: z.record(z.string(), z.unknown()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

// ✅ Zod v4: Schema otimizado para tool call
export const toolCallSchema = z
    .object({
        id: z.string(),
        toolName: z.string(),
        arguments: z.record(z.string(), z.unknown()),
        timestamp: z.number(),
        correlationId: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(); // ✅ Zod v4: strict() para performance

// ===== HELPER FUNCTIONS =====

/**
 * Create Tool Context with defaults
 */
export function createToolContext(
    toolName: string,
    callId: string,
    _executionId: string,
    tenantId: string,
    parameters: Record<string, unknown>,
    options: {
        correlationId?: string;
        parentId?: string;
        metadata?: Metadata;
    } = {},
): ToolContext {
    return {
        // BaseContext
        tenantId: tenantId || 'default',
        correlationId: options.correlationId || 'default',
        startTime: Date.now(),

        // ToolContext specific
        toolName,
        callId,
        parameters,
        signal: new AbortController().signal,

        cleanup: async () => {
            // Cleanup logic will be implemented by the engine
        },
    };
}

/**
 * Validate Tool Definition
 */
export function validateToolDefinition(
    definition: unknown,
): definition is ToolDefinition {
    try {
        toolDefinitionSchema.parse(definition);
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if tool call is valid
 */
export function validateToolCall(call: unknown): call is ToolCall {
    try {
        toolCallSchema.parse(call);
        return true;
    } catch {
        return false;
    }
}

// =============================================================================
// TOOL FACTORIES - ZOD FIRST
// =============================================================================

/**
 * Cria uma tool definition com Zod como schema primário
 */
export function defineTool<TInput = unknown, TOutput = unknown>(config: {
    name: string;
    description: string;
    inputSchema: z.ZodSchema<TInput>;
    execute: ToolHandler<TInput, TOutput>;
    outputSchema?: z.ZodSchema<TOutput>;
    config?: ToolDefinition<TInput, TOutput>['config'];
    categories?: string[];
    dependencies?: string[];
    tags?: string[];
    callbacks?: ToolCallbacks;
}): ToolDefinition<TInput, TOutput> {
    const jsonSchema = zodToJSONSchema(
        config.inputSchema,
        config.name,
        config.description,
    );

    return {
        name: config.name,
        description: config.description,
        execute: config.execute,
        inputSchema: config.inputSchema,
        outputSchema: config.outputSchema,
        jsonSchema,
        config: {
            timeout: 60000, // ✅ 60s timeout
            requiresAuth: false,
            allowParallel: true,
            maxConcurrentCalls: 10,
            source: 'user',
            ...config.config,
        },
        categories: config.categories || [],
        dependencies: config.dependencies || [],
        tags: config.tags || [],
        callbacks: config.callbacks,
    };
}

/**
 * @deprecated Use createTool instead
 */
export function defineMCPTool<TInput = unknown, TOutput = unknown>(config: {
    name: string;
    description: string;
    execute: ToolHandler<TInput, TOutput>;
    serverName: string;
    originalMCPSchema?: unknown;
    inputSchema?: z.ZodSchema<TInput>;
}): ToolDefinition<TInput, TOutput> {
    // Se não tem Zod schema, cria um genérico
    const zodSchema =
        config.inputSchema || (z.unknown() as z.ZodSchema<TInput>);

    return defineTool({
        name: config.name,
        description: config.description,
        inputSchema: zodSchema,
        execute: config.execute,
        config: {
            serverName: config.serverName,
            mcpTool: true,
            source: 'mcp',
        },
        tags: ['mcp', config.serverName],
    });
}

/**
 * Converte MCP tool raw para ToolDefinition
 */
export function fromMCPTool<TInput = unknown, TOutput = unknown>(
    mcpTool: {
        name: string;
        description?: string;
        inputSchema?: unknown;
        execute: (args: TInput, ctx: unknown) => Promise<TOutput>;
    },
    serverName: string,
): ToolDefinition<TInput, TOutput> {
    return defineMCPTool({
        name: mcpTool.name,
        description: mcpTool.description || `MCP Tool: ${mcpTool.name}`,
        execute: mcpTool.execute as ToolHandler<TInput, TOutput>,
        serverName,
        originalMCPSchema: mcpTool.inputSchema,
    });
}

// =============================================================================
// SIMPLIFIED PERFORMANCE MONITORING
// =============================================================================

/**
 * Configuração de performance monitoring
 */
export interface ToolPerformanceConfig {
    enabled: boolean;
    samplingRate: number; // 0.0 to 1.0
    maxMetricsHistory: number;
    enableAlerting: boolean;
    thresholds: {
        maxExecutionTime: number;
        maxFailureRate: number;
    };
    reportingInterval: number; // em milliseconds
    enablePeriodicReports: boolean;
}

/**
 * Schema Zod para ToolExecutionMetrics
 */
export const toolExecutionMetricsSchema = z.object({
    startTime: z.number(),
    endTime: z.number(),
    totalExecutionTime: z.number(),
    totalExecutions: z.number(),
    successfulExecutions: z.number(),
    failedExecutions: z.number(),
    successRate: z.number().min(0).max(1),
    averageExecutionTime: z.number(),
    maxConcurrency: z.number(),
    averageConcurrency: z.number(),
    timeoutErrors: z.number(),
    validationErrors: z.number(),
    executionErrors: z.number(),
    toolName: z.string(),
    executionStrategy: toolExecutionStrategySchema,
    tenantId: z.string(),
    timestamp: z.number(),
});

/**
 * Interface para alertas de threshold
 */
export interface ToolThresholdAlert {
    toolName: string;
    metric: string;
    value: number;
    threshold: number;
}

/**
 * Monitor de performance para ferramentas
 */
export interface ToolPerformanceMonitor {
    // Lifecycle
    start(): void;
    stop(): void;
    reset(): void;

    // Métricas collection
    recordExecution(toolName: string, duration: number, success: boolean): void;
    recordError(
        toolName: string,
        errorType: 'timeout' | 'validation' | 'execution',
    ): void;

    // Métricas retrieval
    getMetrics(toolName: string): ToolExecutionMetrics | undefined;
    getAllMetrics(): Map<string, ToolExecutionMetrics>;
    getAggregatedMetrics(): ToolExecutionMetrics;

    // Reporting
    generateReport(): string;
    exportMetrics(): Record<string, ToolExecutionMetrics>;

    // Configuration
    updateConfig(config: Partial<ToolPerformanceConfig>): void;
    getConfig(): ToolPerformanceConfig;

    // Alerting
    checkThresholds(
        toolName: string,
    ): Array<{ metric: string; value: number; threshold: number }>;
    onThresholdExceeded(
        callback: (alert: {
            toolName: string;
            metric: string;
            value: number;
            threshold: number;
        }) => void,
    ): void;
}

/**
 * Factory para criar monitor de performance
 */
export function createToolPerformanceMonitor(
    config: ToolPerformanceConfig,
): ToolPerformanceMonitor {
    const metricsHistory = new Map<string, ToolExecutionMetrics>();
    const executionHistory = new Map<
        string,
        Array<{ duration: number; success: boolean; timestamp: number }>
    >();
    const alertCallbacks: Array<(alert: ToolThresholdAlert) => void> = [];
    let isRunning = false;
    let reportingInterval: NodeJS.Timeout | null = null;

    const monitor: ToolPerformanceMonitor = {
        start() {
            isRunning = true;
            if (config.enablePeriodicReports && config.reportingInterval > 0) {
                reportingInterval = setInterval(
                    () => {},
                    config.reportingInterval,
                );
            }
        },

        stop() {
            isRunning = false;
            if (reportingInterval) {
                clearInterval(reportingInterval);
                reportingInterval = null;
            }
        },

        reset() {
            metricsHistory.clear();
            executionHistory.clear();
        },

        recordExecution(toolName: string, duration: number, success: boolean) {
            if (!isRunning || Math.random() > config.samplingRate) return;

            const history = executionHistory.get(toolName) || [];
            history.push({ duration, success, timestamp: Date.now() });

            // Manter apenas o histórico configurado
            if (history.length > config.maxMetricsHistory) {
                history.splice(0, history.length - config.maxMetricsHistory);
            }

            executionHistory.set(toolName, history);
            updateMetrics(toolName);
        },

        recordError(
            toolName: string,
            errorType: 'timeout' | 'validation' | 'execution',
        ) {
            if (!isRunning) return;

            const metrics = metricsHistory.get(toolName);
            if (metrics) {
                switch (errorType) {
                    case 'timeout':
                        metrics.timeoutErrors++;
                        break;
                    case 'validation':
                        metrics.validationErrors++;
                        break;
                    case 'execution':
                        metrics.executionErrors++;
                        break;
                }
                metricsHistory.set(toolName, metrics);
            }
        },

        getMetrics(toolName: string) {
            return metricsHistory.get(toolName);
        },

        getAllMetrics() {
            return new Map(metricsHistory);
        },

        getAggregatedMetrics() {
            const allMetrics = Array.from(metricsHistory.values());
            if (allMetrics.length === 0) {
                return createEmptyMetrics(
                    'aggregate',
                    'adaptive',
                    config.enabled ? 'default' : 'disabled',
                );
            }

            // Agregar métricas
            const totalExecutions = allMetrics.reduce(
                (sum, m) => sum + m.totalExecutions,
                0,
            );
            const successfulExecutions = allMetrics.reduce(
                (sum, m) => sum + m.successfulExecutions,
                0,
            );
            const failedExecutions = allMetrics.reduce(
                (sum, m) => sum + m.failedExecutions,
                0,
            );

            const totalDuration = allMetrics.reduce(
                (sum, m) => sum + m.totalExecutionTime,
                0,
            );

            return {
                startTime: Math.min(...allMetrics.map((m) => m.startTime)),
                endTime: Math.max(...allMetrics.map((m) => m.endTime)),
                totalExecutionTime: totalDuration,
                averageExecutionTime:
                    allMetrics.reduce(
                        (sum, m) => sum + m.averageExecutionTime,
                        0,
                    ) / allMetrics.length,
                totalExecutions,
                successfulExecutions,
                failedExecutions,
                successRate:
                    totalExecutions > 0
                        ? successfulExecutions / totalExecutions
                        : 0,
                maxConcurrency: Math.max(
                    ...allMetrics.map((m) => m.maxConcurrency),
                ),
                averageConcurrency:
                    allMetrics.reduce(
                        (sum, m) => sum + m.averageConcurrency,
                        0,
                    ) / allMetrics.length,
                timeoutErrors: allMetrics.reduce(
                    (sum, m) => sum + m.timeoutErrors,
                    0,
                ),
                validationErrors: allMetrics.reduce(
                    (sum, m) => sum + m.validationErrors,
                    0,
                ),
                executionErrors: allMetrics.reduce(
                    (sum, m) => sum + m.executionErrors,
                    0,
                ),
                toolName: 'aggregate',
                executionStrategy: 'adaptive' as ToolExecutionStrategy,
                tenantId: allMetrics[0]?.tenantId || 'unknown',
                timestamp: Date.now(),
            };
        },

        generateReport() {
            const aggregated = monitor.getAggregatedMetrics();
            return `
=== Tool Performance Report ===
Total Executions: ${aggregated.totalExecutions}
Success Rate: ${(aggregated.successRate * 100).toFixed(2)}%
Average Execution Time: ${aggregated.averageExecutionTime.toFixed(2)}ms
Max Concurrency: ${aggregated.maxConcurrency}
Errors: ${aggregated.timeoutErrors + aggregated.validationErrors + aggregated.executionErrors}
===============================`;
        },

        exportMetrics() {
            const result: Record<string, ToolExecutionMetrics> = {};
            for (const [toolName, metrics] of metricsHistory) {
                result[toolName] = metrics;
            }
            return result;
        },

        updateConfig(newConfig: Partial<ToolPerformanceConfig>) {
            Object.assign(config, newConfig);
        },

        getConfig() {
            return { ...config };
        },

        checkThresholds(toolName: string) {
            const metrics = metricsHistory.get(toolName);
            if (!metrics || !config.enableAlerting) return [];

            const alerts: Array<{
                metric: string;
                value: number;
                threshold: number;
            }> = [];

            if (
                metrics.averageExecutionTime >
                config.thresholds.maxExecutionTime
            ) {
                alerts.push({
                    metric: 'averageExecutionTime',
                    value: metrics.averageExecutionTime,
                    threshold: config.thresholds.maxExecutionTime,
                });
            }

            if (metrics.successRate < 1 - config.thresholds.maxFailureRate) {
                alerts.push({
                    metric: 'successRate',
                    value: metrics.successRate,
                    threshold: 1 - config.thresholds.maxFailureRate,
                });
            }

            return alerts;
        },

        onThresholdExceeded(callback: (alert: ToolThresholdAlert) => void) {
            alertCallbacks.push(callback);
        },
    };

    function updateMetrics(toolName: string) {
        const history = executionHistory.get(toolName) || [];
        if (history.length === 0) return;

        const durations = history.map((h) => h.duration);
        const successful = history.filter((h) => h.success).length;
        const failed = history.length - successful;

        const totalDuration = durations.reduce((sum, d) => sum + d, 0);
        const avgDuration = totalDuration / durations.length;

        const metrics: ToolExecutionMetrics = {
            startTime: history[0]?.timestamp || Date.now(),
            endTime: history[history.length - 1]?.timestamp || Date.now(),
            totalExecutionTime: totalDuration,
            averageExecutionTime: avgDuration,
            totalExecutions: history.length,
            successfulExecutions: successful,
            failedExecutions: failed,
            successRate: successful / history.length,
            maxConcurrency: 1, // Simplified
            averageConcurrency: 1, // Simplified
            timeoutErrors: 0, // Will be updated by recordError
            validationErrors: 0, // Will be updated by recordError
            executionErrors: 0, // Will be updated by recordError
            toolName,
            executionStrategy: 'adaptive' as ToolExecutionStrategy,
            tenantId: config.enabled ? 'default' : 'disabled',
            timestamp: Date.now(),
        };

        metricsHistory.set(toolName, metrics);

        // Verificar thresholds e alertar
        if (config.enableAlerting) {
            const alerts = monitor.checkThresholds(toolName);
            alerts.forEach((alert) => {
                alertCallbacks.forEach((callback) => {
                    callback({ toolName, ...alert });
                });
            });
        }
    }

    return monitor;
}

/**
 * Utilitários para métricas
 */
function createEmptyMetrics(
    toolName: string,
    strategy: ToolExecutionStrategy,
    tenantId: string,
): ToolExecutionMetrics {
    const now = Date.now();
    return {
        startTime: now,
        endTime: now,
        totalExecutionTime: 0,
        averageExecutionTime: 0,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        successRate: 0,
        maxConcurrency: 0,
        averageConcurrency: 0,
        timeoutErrors: 0,
        validationErrors: 0,
        executionErrors: 0,
        toolName,
        executionStrategy: strategy,
        tenantId,
        timestamp: now,
    };
}

/**
 * Enhanced tool callbacks for better UX (AI SDK inspired)
 */
export interface ToolCallbacks {
    /**
     * Called when tool input streaming starts
     * Only called when the tool is used in a streaming context
     */
    onInputStart?: (options: {
        toolCallId: string;
        messages: unknown[];
        abortSignal?: AbortSignal;
    }) => void | PromiseLike<void>;

    /**
     * Called when a tool input streaming delta is available
     * Only called when the tool is used in a streaming context
     */
    onInputDelta?: (options: {
        inputTextDelta: string;
        toolCallId: string;
        messages: unknown[];
        abortSignal?: AbortSignal;
    }) => void | PromiseLike<void>;

    /**
     * Called when a tool call can be started
     * Even if the execute function is not provided
     */
    onInputAvailable?: (options: {
        input: unknown;
        toolCallId: string;
        messages: unknown[];
        abortSignal?: AbortSignal;
    }) => void | PromiseLike<void>;

    /**
     * Called before tool execution starts
     */
    onExecutionStart?: (options: {
        toolName: string;
        input: unknown;
        toolCallId: string;
    }) => void | PromiseLike<void>;

    /**
     * Called after tool execution completes
     */
    onExecutionComplete?: (options: {
        toolName: string;
        input: unknown;
        result: unknown;
        duration: number;
        success: boolean;
        toolCallId: string;
    }) => void | PromiseLike<void>;

    /**
     * Called when tool execution fails
     */
    onExecutionError?: (options: {
        toolName: string;
        input: unknown;
        error: Error;
        toolCallId: string;
    }) => void | PromiseLike<void>;
}
