import { z } from 'zod';
import type {
    BaseContext,
    BaseDefinition,
    BaseExecutionResult,
    BaseEngineConfig,
    Metadata,
    SessionId,
} from './base-types.js';
import type { Thread, ToolCall } from './common-types.js';
import type { UserContext, SystemContext } from './base-types.js';
import type {
    ToolMetadataForLLM,
    ToolMetadataForPlanner,
    ToolDefinition,
} from './tool-types.js';
import { AgentIdentity } from './agent-definition.js';

import { IdGenerator } from '../../utils/id-generator.js';
import { ContextStateService } from '../context/services/state-service.js';
import { Persistor } from '../../persistor/index.js';
import {
    ContextManager,
    EnhancedMessageContext,
    StepExecution,
} from '../context/index.js';

interface SimpleExecutionRuntime {
    startExecution(agentName: string): Promise<void>;
    endExecution(result: {
        success: boolean;
        error?: Error;
        outputSummary?: string;
    }): Promise<void>;
    updateExecution(updates: {
        iteration?: number;
        toolsUsed?: string[];
        currentThought?: string;
    }): void;
    getExecutionInfo(): {
        executionId: string;
        isRunning: boolean;
        duration: number;
        agentName?: string;
        identifiers: {
            sessionId: string;
            tenantId: string;
            threadId: string;
        };
    };
    health(): Promise<{ status: 'healthy' | 'unhealthy'; details: unknown }>;
    cleanup(): Promise<void>;
    getSummary(): {
        executionId: string;
        agentName?: string;
        status: 'running' | 'completed' | 'idle';
        duration: number;
    };
}

/**
 * Agent action types - what an agent can decide to do
 */
export const agentActionTypeSchema = z.enum([
    'final_answer',
    'need_more_info',
    'tool_call',
    // Meta-action to trigger full plan execution by executor
    'execute_plan',
    // Enhanced action types for multi-agent coordination
    'delegate_to_agent',
    'request_human_input',
    'wait_for_condition',
    'parallel_execution',
    'conditional_branch',
    // ===== PARALLEL TOOL EXECUTION =====
    'parallel_tools', // Execute multiple tools in parallel
    'sequential_tools', // Execute tools in sequence with dependencies
    'conditional_tools', // Execute tools based on conditions
    'mixed_tools', // Mixed strategy execution
    'dependency_tools', // Execute tools with explicit dependency resolution
]);
export type AgentActionType = z.infer<typeof agentActionTypeSchema>;

/**
 * Base agent action interface
 */
export interface AgentAction<TContent = unknown> {
    type: AgentActionType;
    content?: TContent;
}

// ===== SPECIFIC ACTION IMPLEMENTATIONS =====

export interface FinalAnswerAction<TContent = unknown>
    extends AgentAction<TContent> {
    type: 'final_answer';
    content: TContent;
}

export interface NeedMoreInfoAction extends AgentAction {
    type: 'need_more_info';
    question: string;
    context?: string;
}

export interface ToolCallAction extends AgentAction {
    type: 'tool_call';
    toolName: string;
    input: unknown;
    reasoning?: string;
}

/**
 * Meta action to delegate full plan execution to the executor
 */
export interface ExecutePlanAction extends AgentAction {
    type: 'execute_plan';
    planId: string;
}

export interface DelegateToAgentAction extends AgentAction {
    type: 'delegate_to_agent';
    agentName: string;
    input: unknown;
    reasoning?: string;
}

// ===== PARALLEL TOOL EXECUTION ACTIONS =====

/**
 * Parallel tools execution action
 */
export interface ParallelToolsAction extends AgentAction {
    type: 'parallel_tools';
    tools: ToolCall[];
    concurrency?: number; // Max concurrent executions
    timeout?: number; // Total timeout for all tools
    failFast?: boolean; // Stop on first failure
    aggregateResults?: boolean; // Combine all results
    reasoning?: string;
}

/**
 * Sequential tools execution action
 */
export interface SequentialToolsAction extends AgentAction {
    type: 'sequential_tools';
    tools: ToolCall[];
    stopOnError?: boolean; // Stop sequence on error
    passResults?: boolean; // Pass results between tools
    timeout?: number; // Total timeout for sequence
    reasoning?: string;
}

/**
 * Conditional tools execution action
 */
export interface ConditionalToolsAction extends AgentAction {
    type: 'conditional_tools';
    tools: ToolCall[];
    conditions?: Record<string, unknown>; // Execution conditions
    defaultTool?: string; // Fallback tool
    evaluateAll?: boolean; // Evaluate all conditions
    reasoning?: string;
}

/**
 * Mixed strategy tools execution action
 */
export interface MixedToolsAction extends AgentAction {
    type: 'mixed_tools';
    strategy: 'parallel' | 'sequential' | 'conditional' | 'adaptive';
    tools: ToolCall[];
    config?: {
        concurrency?: number;
        timeout?: number;
        failFast?: boolean;
        conditions?: Record<string, unknown>;
    };
    reasoning?: string;
}

/**
 * Dependency-based tools execution action
 */
export interface DependencyToolsAction extends AgentAction {
    type: 'dependency_tools';
    tools: ToolCall[];
    dependencies: Array<{
        toolName: string;
        dependencies: string[]; // Tools that this tool depends on
        type: 'required' | 'optional' | 'conditional';
        condition?: string;
        failureAction?: 'stop' | 'continue' | 'retry' | 'fallback';
        fallbackTool?: string;
    }>;
    config?: {
        maxConcurrency?: number;
        timeout?: number;
        failFast?: boolean;
    };
    reasoning?: string;
}

/**
 * Agent thought - result of agent thinking process
 */
export interface AgentThought<TContent = unknown> {
    reasoning: string;
    action: AgentAction<TContent>;
    metadata?: Metadata;
}

// ===== AGENT DEFINITION =====

/**
 * Agent Definition - Blueprint for an agent
 * This is the "what" - defines what the agent is and can do
 */
export interface AgentDefinition<
    TInput = unknown,
    TOutput = unknown,
    TContent = unknown,
> extends BaseDefinition {
    // ===== AGENT IDENTITY (Structured & Customizable) =====

    /**
     * Agent identity configuration - at least one field is required
     * This replaces the generic 'description' with structured, purposeful identity
     */
    identity: {
        /**
         * Agent's role/position (what they are)
         * Example: "Senior Software Engineer", "Data Analyst", "Project Manager"
         */
        role?: string;

        /**
         * Agent's specific goal (what they should achieve)
         * Example: "Write clean, efficient, and well-tested Python code"
         * More specific than description and guides agent behavior
         */
        goal?: string;

        /**
         * General description (fallback/legacy support)
         * Example: "A helpful assistant that processes data"
         */
        description?: string;

        /**
         * Agent's expertise areas
         * Example: ["Python", "Data Analysis", "Machine Learning"]
         */
        expertise?: string[];

        /**
         * Agent's personality/backstory for context
         * Example: "You are a seasoned developer with 10 years of experience..."
         */
        personality?: string;

        /**
         * Communication style
         * Example: "professional", "casual", "technical", "friendly"
         */
        style?: string;

        /**
         * Custom system prompt (overrides generated prompt)
         * Use when you need full control over the agent's instructions
         */
        systemPrompt?: string;
    };

    // ===== CORE AGENT BEHAVIOR =====

    // Core agent behavior
    think: (
        input: TInput,
        context: AgentContext,
    ) => Promise<AgentThought<TContent>>;

    onStart?: (
        input: TInput,
        context: AgentContext,
    ) => Promise<AgentThought<TContent>>;
    onFinish?: (output: TOutput) => Promise<AgentThought<TContent>>;
    onError?: (error: Error) => Promise<AgentThought<TContent>>;

    // Optional response formatting
    formatResponse?: (thought: AgentThought<TContent>) => TOutput;

    // Optional input validation
    validateInput?: (input: unknown) => input is TInput;

    // ===== AGENT CAPABILITIES =====

    // Agent capabilities configuration
    config?: {
        maxIterations?: number;
        timeout?: number;
        enableTools?: boolean;
        enableLLM?: boolean;
        enableMemory?: boolean;
        enablePersistence?: boolean;
        enableSession?: boolean;
        enableState?: boolean;
    };

    // Required tools for this agent
    requiredTools?: string[];

    // Optional tools that enhance this agent
    optionalTools?: string[];
}

/**
 * Agent Context - Execution environment for agents
 * Extends BaseContext with intelligent capabilities (memory, persistence, tools)
 */
/**
 * AgentContext - GLOBAL context shared across ALL components
 * Used by Planners, ToolEngine, Router, etc.
 */
export interface AgentContext {
    // ===== EXECUTION DATA =====
    sessionId: string;
    tenantId: string;
    correlationId: string;
    thread: Thread;
    agentName: string;
    invocationId: string;
    executionId?: string;

    // State: Namespace-based working memory with explicit persistence
    state: {
        get: <T>(
            namespace: string,
            key: string,
            threadId?: string,
        ) => Promise<T | undefined>;
        set: (
            namespace: string,
            key: string,
            value: unknown,
            threadId?: string,
        ) => Promise<void>;
        clear: (namespace: string) => Promise<void>;
        getNamespace: (
            namespace: string,
        ) => Promise<Map<string, unknown> | undefined>;
        // EXPLICIT persistence control
        persist?: (namespace?: string) => Promise<void>;
        hasChanges?: () => boolean;
    };

    // Conversation Management (ONLY legitimate agent concern)
    conversation: {
        addMessage: (
            role: 'user' | 'assistant' | 'system',
            content: string,
            metadata?: Record<string, unknown>,
        ) => Promise<void>;
        getHistory: () => Promise<
            Array<{
                role: 'user' | 'assistant' | 'system' | 'tool';
                content: string;
                timestamp: number;
                metadata?: Record<string, unknown>;
            }>
        >;
        updateMetadata: (metadata: Record<string, unknown>) => Promise<void>;
    };

    // Tools available to this agent execution
    availableTools: ToolMetadataForPlanner[];

    // === REMOVED FROM AgentContext ===
    // ❌ memory: Use dependency injection - MemoryManager
    // ❌ telemetry: Use getObservability() directly
    // ❌ state: Replaced with structured 'variables'

    // Signal for cancellation
    signal: AbortSignal;

    // Cleanup
    cleanup(): Promise<void>;

    // ===== BACKWARD COMPATIBILITY =====
    // TODO: Remove these after full migration
    // system: {
    //     sessionId: string;
    //     threadId: string;
    //     executionId: string;
    //     conversationHistory?: unknown[];
    //     iteration?: number;
    //     toolsUsed?: string[];
    // };
    executionRuntime: {
        // Long-term memory patterns (MemoryManager)
        storeToolUsagePattern: (
            toolName: string,
            input: unknown,
            output: unknown,
            success: boolean,
            duration: number,
        ) => Promise<void>;
        storeExecutionPattern: (
            patternType: 'success' | 'failure' | string,
            action: string | unknown,
            result: unknown,
            context?: string | unknown,
        ) => Promise<void>;
        // Removed duplicated methods - use state.set() directly for working memory
    };
    agentIdentity?: AgentIdentity;
    agentExecutionOptions?: AgentExecutionOptions;
    allTools?: ToolDefinition<unknown, unknown>[];
    stepExecution?: StepExecution;
    messageContext?: EnhancedMessageContext;
    contextManager?: ContextManager;
}

/**
 * AgentExecutionContext - AGENT COMPONENT specific context
 * Used internally by agent-core.ts for agent-specific operations
 */
export interface AgentExecutionContext extends BaseContext {
    // === AGENT IDENTITY ===
    agentName: string;
    invocationId: string;
    startTime: number;

    // ✅ AGENT IDENTITY: Structured for enhanced execution context
    agentIdentity?: AgentIdentity;

    // === CONTEXT SEPARATION (fonte única para user/system data) ===
    user: UserContext;
    system: SystemContext;

    // === SINGLE RUNTIME REFERENCE ===
    executionRuntime: SimpleExecutionRuntime;

    availableToolsForLLM?: ToolMetadataForLLM[];
    signal: AbortSignal;

    // === CLEANUP ===
    cleanup(): Promise<void>;
    agentExecutionOptions?: AgentExecutionOptions;
}

// ===== AGENT ENGINE TYPES =====

/**
 * Agent Engine Configuration
 */
export interface AgentEngineConfig extends BaseEngineConfig {
    // Performance & Concurrency
    maxConcurrentAgents?: number;
    agentTimeout?: number;
    maxThinkingIterations?: number;
    thinkingTimeout?: number;

    // Enhanced features
    enableFallback?: boolean;
    concurrency?: number;
}

/**
 * Core identifiers for all agent operations
 * Unified approach to avoid confusion between similar IDs
 */
export interface CoreIdentifiers {
    /**
     * Multi-tenancy identifier
     */
    tenantId: string;

    /**
     * Conversation/session context identifier
     * Replaces: sessionId (for consistency)
     */
    threadId: string;

    /**
     * Unique execution instance identifier
     * Replaces: invocationId, contextId (for consistency)
     */
    executionId: string;

    /**
     * Cross-service tracing identifier
     */
    correlationId: string;
}

/**
 * Agent Execution Options - User-facing options for executing an agent
 * BaseContext properties (tenantId, correlationId, startTime) are generated automatically
 */
export type AgentExecutionOptions = {
    // === IDENTIFICAÇÃO DE QUEM EXECUTA ===
    agentName: string;
    thread: Thread;

    // === IDENTIFICAÇÃO DE EXECUÇÃO (Opcional) ===
    sessionId?: SessionId; // Session management

    // === CAMPOS OPCIONAIS DE BASECONTEXT (Override automático) ===
    tenantId?: string; // Se não fornecido, usa 'default'
    correlationId?: string; // Se não fornecido, gera automaticamente

    // === CONFIGURAÇÕES ===
    timeout?: number;
    maxIterations?: number;

    // === CONTEXTO DO USUÁRIO ===
    userContext?: Record<string, unknown>;
};

/**
 * Agent Execution Result
 */
export interface AgentExecutionResult<TOutput = unknown>
    extends BaseExecutionResult<TOutput> {
    output?: TOutput;
    reasoning?: string;
    correlationId?: string;
    sessionId?: string;
    status?: string;
    executionId?: string;

    // Enhanced metadata for agents
    metadata: Metadata & {
        agentName: string;
        iterations: number;
        toolsUsed: number;
        thinkingTime: number;
    };
}

// ===== AGENT EVENT TYPES =====

/**
 * Agent Input Event
 */
export interface AgentInputEvent<TInput = unknown> {
    input: TInput;
    correlationId?: string;
    sessionId?: string;
    agentName: string;
}

/**
 * Agent Output Event
 */
export interface AgentOutputEvent<TOutput = unknown> {
    output: TOutput;
    reasoning: string;
    correlationId?: string;
    sessionId?: string;
    agentName: string;
}

/**
 * Agent Thinking Event
 */
export interface AgentThinkingEvent {
    agentName: string;
    iteration: number;
    reasoning?: string;
    correlationId?: string;
}

// ===== VALIDATION SCHEMAS =====

/**
 * Parallel tools action schema
 */
export const parallelToolsActionSchema = z.object({
    type: z.literal('parallel_tools'),
    tools: z.array(
        z.object({
            toolName: z.string().min(1),
            input: z.unknown(),
            priority: z.number().optional(),
            timeout: z.number().positive().optional(),
            dependencies: z.array(z.string()).optional(),
            conditions: z.record(z.string(), z.unknown()).optional(),
            metadata: z.record(z.string(), z.unknown()).optional(),
        }),
    ),
    concurrency: z.number().positive().optional(),
    timeout: z.number().positive().optional(),
    failFast: z.boolean().optional(),
    aggregateResults: z.boolean().optional(),
    reasoning: z.string().optional(),
});

/**
 * Sequential tools action schema
 */
export const sequentialToolsActionSchema = z.object({
    type: z.literal('sequential_tools'),
    tools: z.array(
        z.object({
            toolName: z.string().min(1),
            input: z.unknown(),
            priority: z.number().optional(),
            timeout: z.number().positive().optional(),
            dependencies: z.array(z.string()).optional(),
            conditions: z.record(z.string(), z.unknown()).optional(),
            metadata: z.record(z.string(), z.unknown()).optional(),
        }),
    ),
    stopOnError: z.boolean().optional(),
    passResults: z.boolean().optional(),
    timeout: z.number().positive().optional(),
    reasoning: z.string().optional(),
});

/**
 * Conditional tools action schema
 */
export const conditionalToolsActionSchema = z.object({
    type: z.literal('conditional_tools'),
    tools: z.array(
        z.object({
            toolName: z.string().min(1),
            input: z.unknown(),
            priority: z.number().optional(),
            timeout: z.number().positive().optional(),
            dependencies: z.array(z.string()).optional(),
            conditions: z.record(z.string(), z.unknown()).optional(),
            metadata: z.record(z.string(), z.unknown()).optional(),
        }),
    ),
    conditions: z.record(z.string(), z.unknown()),
    defaultTool: z.string().optional(),
    evaluateAll: z.boolean().optional(),
    reasoning: z.string().optional(),
});

/**
 * Mixed tools action schema
 */
export const mixedToolsActionSchema = z.object({
    type: z.literal('mixed_tools'),
    strategy: z.enum(['parallel', 'sequential', 'conditional', 'adaptive']),
    tools: z.array(
        z.object({
            toolName: z.string().min(1),
            input: z.unknown(),
            priority: z.number().optional(),
            timeout: z.number().positive().optional(),
            dependencies: z.array(z.string()).optional(),
            conditions: z.record(z.string(), z.unknown()).optional(),
            metadata: z.record(z.string(), z.unknown()).optional(),
        }),
    ),
    config: z
        .object({
            concurrency: z.number().positive().optional(),
            timeout: z.number().positive().optional(),
            failFast: z.boolean().optional(),
            conditions: z.record(z.string(), z.unknown()).optional(),
        })
        .optional(),
    reasoning: z.string().optional(),
});

/**
 * Dependency-based tools action schema
 */
export const dependencyToolsActionSchema = z.object({
    type: z.literal('dependency_tools'),
    tools: z.array(
        z.object({
            toolName: z.string().min(1),
            input: z.unknown(),
            timeout: z.number().positive().optional(),
            metadata: z.record(z.string(), z.unknown()).optional(),
        }),
    ),
    dependencies: z.array(
        z.object({
            toolName: z.string(),
            type: z.enum(['required', 'optional', 'conditional']),
            condition: z.string().optional(),
            failureAction: z
                .enum(['stop', 'continue', 'retry', 'fallback'])
                .optional(),
            fallbackTool: z.string().optional(),
        }),
    ),
    config: z
        .object({
            maxConcurrency: z.number().positive().optional(),
            timeout: z.number().positive().optional(),
            failFast: z.boolean().optional(),
        })
        .optional(),
    reasoning: z.string().optional(),
});

/**
 * Agent identity schema - ensures at least one field is provided
 */
export const agentIdentitySchema = z
    .object({
        role: z.string().optional(),
        goal: z.string().optional(),
        description: z.string().optional(),
        expertise: z.array(z.string()).optional(),
        personality: z.string().optional(),
        style: z.string().optional(),
        systemPrompt: z.string().optional(),
    })
    .refine(
        (data) => {
            // At least one field must be provided
            const fields = [
                data.role,
                data.goal,
                data.description,
                data.expertise,
                data.personality,
                data.style,
                data.systemPrompt,
            ];
            return fields.some(
                (field) =>
                    field !== undefined &&
                    field !== null &&
                    (Array.isArray(field)
                        ? field.length > 0
                        : field.trim?.() !== ''),
            );
        },
        {
            message:
                'At least one identity field (role, goal, description, expertise, personality, style, or systemPrompt) must be provided',
        },
    );

// ✅ Zod v4: Lazy loading para schemas complexos (performance)
export const agentDefinitionSchema = z.lazy(() =>
    z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        version: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        think: z.instanceof(Function), // ✅ Zod v4: Mais específico que z.unknown()
        formatResponse: z.instanceof(Function).optional(),
        validateInput: z.instanceof(Function).optional(),
        config: z
            .object({
                timeout: z.number().positive().optional(),
                maxRetries: z.number().nonnegative().optional(),
                enableMemory: z.boolean().optional(),
                enablePlanning: z.boolean().optional(),
                enableRouting: z.boolean().optional(),
                enableStreaming: z.boolean().optional(),
                enableHumanApproval: z.boolean().optional(),
                enableCostTracking: z.boolean().optional(),
                enableHallucinationPrevention: z.boolean().optional(),
                enableDebugging: z.boolean().optional(),
                enableMetrics: z.boolean().optional(),
                enableAudit: z.boolean().optional(),
                enableSecurity: z.boolean().optional(),
                enableMultiTenancy: z.boolean().optional(),
                enableCircuitBreaker: z.boolean().optional(),
                enableRateLimiting: z.boolean().optional(),
                enableCaching: z.boolean().optional(),
                enableCompression: z.boolean().optional(),
                enableEncryption: z.boolean().optional(),
                enableBackup: z.boolean().optional(),
                enableRecovery: z.boolean().optional(),
                enableMonitoring: z.boolean().optional(),
                enableAlerting: z.boolean().optional(),
                enableReporting: z.boolean().optional(),
                enableAnalytics: z.boolean().optional(),
                enableProfiling: z.boolean().optional(),
                enableTracing: z.boolean().optional(),
                enableLogging: z.boolean().optional(),
                enableValidation: z.boolean().optional(),
                enableSerialization: z.boolean().optional(),
                enableDeserialization: z.boolean().optional(),
            })
            .optional(),
        categories: z.array(z.string()).optional(),
        dependencies: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
    }),
);

// ✅ Zod v4: Schema otimizado para validação rápida
export const agentExecutionOptionsSchema = z
    .object({
        sessionId: z.string().optional(),
        correlationId: z.string().optional(),
        timeout: z.number().positive().optional(),
        maxIterations: z.number().positive().optional(),
        context: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(); // ✅ Zod v4: strict() para performance

// ===== UTILITY TYPES =====

/**
 * Utility types for better developer experience
 */
export type ExtractActionType<T extends AgentAction> = T['type'];

/**
 * Extract content type from AgentAction
 */
export type ExtractActionContent<T extends AgentAction> =
    T extends AgentAction<infer C> ? C : unknown;

/**
 * Create typed agent action
 */
export type CreateAgentAction<C = unknown> = AgentAction<C>;

// ===== ENHANCED TYPE GUARDS =====

/**
 * Enhanced type guards for better runtime safety
 */
export function isFinalAnswerAction(
    action: AgentAction,
): action is FinalAnswerAction {
    return action.type === 'final_answer';
}

export function isToolCallAction(
    action: AgentAction,
): action is ToolCallAction {
    return action.type === 'tool_call';
}

export function isNeedMoreInfoAction(
    action: AgentAction,
): action is NeedMoreInfoAction {
    return action.type === 'need_more_info';
}

export function isExecutePlanAction(
    action: AgentAction,
): action is ExecutePlanAction {
    return action.type === 'execute_plan';
}

export function isParallelToolsAction(
    action: AgentAction,
): action is ParallelToolsAction {
    return action.type === 'parallel_tools';
}

export function isSequentialToolsAction(
    action: AgentAction,
): action is SequentialToolsAction {
    return action.type === 'sequential_tools';
}

export function isConditionalToolsAction(
    action: AgentAction,
): action is ConditionalToolsAction {
    return action.type === 'conditional_tools';
}

export function isMixedToolsAction(
    action: AgentAction,
): action is MixedToolsAction {
    return action.type === 'mixed_tools';
}

export function isDependencyToolsAction(
    action: AgentAction,
): action is DependencyToolsAction {
    return action.type === 'dependency_tools';
}

/**
 * Check if action is any tool execution action
 */
export function isToolExecutionAction(
    action: AgentAction,
): action is
    | ParallelToolsAction
    | SequentialToolsAction
    | ConditionalToolsAction
    | MixedToolsAction
    | DependencyToolsAction {
    return [
        'parallel_tools',
        'sequential_tools',
        'conditional_tools',
        'mixed_tools',
        'dependency_tools',
    ].includes(action.type);
}

// ===== HELPER FUNCTIONS =====

/**
 * Create Agent Context with defaults
 * @deprecated Use ExecutionRuntime.initializeAgentContext() instead
 */
export function createAgentContext(
    agentName: string,
    executionId: string,
    tenantId: string,
    options: {
        correlationId?: string;
        parentId?: string;
        invocationId?: string;
        availableTools?: ToolMetadataForPlanner[];
        persistorService?: Persistor;
        userContext?: UserContext;
        systemContext?: SystemContext;
    } = {},
): AgentExecutionContext {
    const correlationId = options.correlationId || IdGenerator.correlationId();
    const invocationId = options.invocationId || IdGenerator.executionId();

    // === CREATE SYSTEM CONTEXT ===
    const systemContext: SystemContext = {
        executionId,
        correlationId,
        threadId: executionId, // Will be updated by engine
        tenantId,
        iteration: 0,
        toolsUsed: 0,
        conversationHistory: [],
        startTime: Date.now(),
        status: 'running',
        ...options.systemContext,
    };

    // SystemContext becomes RuntimeContext in public API for clarity

    // Create state manager once
    const stateManager = new ContextStateService(
        {
            tenantId: tenantId,
            correlationId: correlationId,
        },
        {
            maxNamespaceSize: 1000,
            maxNamespaces: 100,
        },
    );

    return {
        tenantId: tenantId,
        correlationId: correlationId,
        startTime: Date.now(),

        agentName,
        invocationId,

        user: options.userContext || {},
        system: systemContext,

        // Single runtime reference (mock for compatibility)
        executionRuntime: null as unknown as SimpleExecutionRuntime, // TODO: Replace with actual ExecutionRuntime instance

        // Resources
        signal: new AbortController().signal,

        cleanup: async () => {
            // Cleanup state manager
            await stateManager.clear('agent-memory');
        },
    };
}

/**
 * Validate Agent Definition
 */
export function validateAgentDefinition(
    definition: unknown,
): definition is AgentDefinition {
    try {
        agentDefinitionSchema.parse(definition);
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if action is a specific type
 */
export function isActionType<T extends AgentActionType>(
    action: AgentAction,
    type: T,
): action is AgentAction & { type: T } {
    return action.type === type;
}

// ===== AGENT IDENTITY HELPER FUNCTIONS =====

/**
 * Generate system prompt from structured identity with smart fallbacks
 */
export function generateSystemPromptFromIdentity(
    identity: AgentDefinition['identity'],
): string {
    // If custom system prompt is provided, use it
    if (identity.systemPrompt) {
        return identity.systemPrompt;
    }

    const parts: string[] = [];

    // ✅ SMART FALLBACKS for incremental configs

    // 1. Role (with goal-based fallback)
    if (identity.role) {
        parts.push(`You are a ${identity.role}.`);
    } else if (identity.goal && !identity.description) {
        // Infer role from goal if no role specified
        parts.push(`You are a specialist focused on: ${identity.goal}`);
    }

    // 2. Goal/objective (with role-based fallback)
    if (identity.goal) {
        parts.push(`Your goal is: ${identity.goal}`);
    } else if (identity.role && !identity.description) {
        // Infer goal from role if no goal specified
        parts.push(
            `Your goal is to effectively perform your duties as a ${identity.role}.`,
        );
    }

    // 3. Expertise areas (enhance role understanding)
    if (identity.expertise && identity.expertise.length > 0) {
        parts.push(
            `Your areas of expertise include: ${identity.expertise.join(', ')}.`,
        );

        // If no role but have expertise, use expertise as role
        if (!identity.role && !identity.goal && parts.length === 1) {
            parts.unshift(`You are a ${identity.expertise[0]} expert.`);
        }
    }

    // 4. Personality/backstory
    if (identity.personality) {
        parts.push(identity.personality);
    }

    // 5. Communication style
    if (identity.style) {
        parts.push(`Communication style: ${identity.style}.`);
    }

    // 6. Fallback to description (legacy support)
    if (identity.description) {
        if (parts.length === 0) {
            // Description as primary if nothing else
            parts.push(identity.description);
        } else {
            // Description as additional context
            parts.push(`Additional context: ${identity.description}`);
        }
    }

    // 7. Ultimate fallback (shouldn't happen with validation)
    if (parts.length === 0) {
        parts.push(
            'You are a helpful AI assistant ready to assist with various tasks.',
        );
    }

    return parts.join(' ');
}

/**
 * Get agent display name from identity
 */
export function getAgentDisplayName(
    name: string,
    identity: AgentDefinition['identity'],
): string {
    if (identity.role) {
        return `${name} (${identity.role})`;
    }
    return name;
}

/**
 * Get agent summary from identity
 */
export function getAgentSummary(identity: AgentDefinition['identity']): string {
    const summaryParts: string[] = [];

    if (identity.role) {
        summaryParts.push(identity.role);
    }

    if (identity.goal) {
        summaryParts.push(`Goal: ${identity.goal}`);
    }

    if (identity.expertise && identity.expertise.length > 0) {
        summaryParts.push(
            `Expertise: ${identity.expertise.slice(0, 3).join(', ')}`,
        );
    }

    if (summaryParts.length === 0 && identity.description) {
        return identity.description;
    }

    return summaryParts.join(' | ') || 'AI Assistant';
}

/**
 * Validate agent identity - runtime validation
 */
export function validateAgentIdentity(
    identity: AgentDefinition['identity'],
): boolean {
    try {
        agentIdentitySchema.parse(identity);
        return true;
    } catch {
        return false;
    }
}

// ===== AGENT LIFECYCLE TYPES =====

/**
 * Agent status - standardized across all lifecycle operations
 */
export type AgentStatus =
    | 'stopped'
    | 'starting'
    | 'running'
    | 'pausing'
    | 'paused'
    | 'resuming'
    | 'stopping'
    | 'error'
    | 'scheduled';

// ===== AGENT LIFECYCLE PAYLOAD TYPES =====

/**
 * Agent start payload
 */
export interface AgentStartPayload {
    agentName: string;
    tenantId: string;
    config?: Record<string, unknown>;
    context?: Record<string, unknown>;
}

/**
 * Agent stop payload
 */
export interface AgentStopPayload {
    agentName: string;
    tenantId: string;
    reason?: string;
    force?: boolean;
}

/**
 * Agent pause payload
 */
export interface AgentPausePayload {
    agentName: string;
    tenantId: string;
    reason?: string;
    saveSnapshot?: boolean;
}

/**
 * Agent resume payload
 */
export interface AgentResumePayload {
    agentName: string;
    tenantId: string;
    snapshotId?: string;
    context?: Record<string, unknown>;
}

/**
 * Agent schedule payload
 */
export interface AgentSchedulePayload {
    agentName: string;
    tenantId: string;
    schedule: AgentScheduleConfig;
    config?: Record<string, unknown>;
}

// ===== AGENT SCHEDULE CONFIG =====

/**
 * Agent schedule configuration
 */
export interface AgentScheduleConfig {
    schedule: string | number; // cron expression or timestamp
    timezone?: string;
    enabled?: boolean;
    maxExecutions?: number;
    retryOnFailure?: boolean;
    retryAttempts?: number;
    retryDelay?: number;
    repeat?: boolean; // for recurring schedules
}

// ===== AGENT LIFECYCLE DEFINITION =====

/**
 * Agent Lifecycle Definition - Blueprint for lifecycle operations
 */
export interface AgentLifecycleDefinition extends BaseDefinition {
    // Core lifecycle operations
    start?: (payload: AgentStartPayload) => Promise<AgentLifecycleResult>;
    stop?: (payload: AgentStopPayload) => Promise<AgentLifecycleResult>;
    pause?: (payload: AgentPausePayload) => Promise<AgentLifecycleResult>;
    resume?: (payload: AgentResumePayload) => Promise<AgentLifecycleResult>;
    schedule?: (payload: AgentSchedulePayload) => Promise<AgentLifecycleResult>;

    // Lifecycle configuration
    config?: {
        autoStart?: boolean;
        autoStop?: boolean;
        maxRetries?: number;
        timeout?: number;
        enableSnapshots?: boolean;
    };

    // Validation
    validateStart?: (payload: AgentStartPayload) => boolean;
    validateStop?: (payload: AgentStopPayload) => boolean;
    validatePause?: (payload: AgentPausePayload) => boolean;
    validateResume?: (payload: AgentResumePayload) => boolean;
    validateSchedule?: (payload: AgentSchedulePayload) => boolean;
}

// ===== AGENT LIFECYCLE CONTEXT =====

/**
 * Agent Lifecycle Context - Execution environment for lifecycle operations
 */
export interface AgentLifecycleContext extends BaseContext {
    // === LIFECYCLE IDENTITY ===
    agentName: string;
    operation: 'start' | 'stop' | 'pause' | 'resume' | 'schedule';

    // === LIFECYCLE STATE ===
    currentStatus: AgentStatus;
    previousStatus?: AgentStatus;
    targetStatus?: AgentStatus;

    // === OPERATION DATA ===
    payload:
        | AgentStartPayload
        | AgentStopPayload
        | AgentPausePayload
        | AgentResumePayload
        | AgentSchedulePayload;

    // === SNAPSHOT SUPPORT ===
    snapshotId?: string;
    snapshotData?: Record<string, unknown>;

    // === CLEANUP ===
    cleanup(): Promise<void>;
}

// ===== AGENT LIFECYCLE ENGINE TYPES =====

/**
 * Agent Lifecycle Engine Configuration
 */
export interface AgentLifecycleEngineConfig extends BaseEngineConfig {
    // Lifecycle execution settings
    enableSnapshots?: boolean;
    autoCleanup?: boolean;
    maxConcurrentOperations?: number;
    defaultTimeout?: number;

    // Status validation
    validateTransitions?: boolean;
    allowForceStop?: boolean;

    // Scheduling
    enableScheduling?: boolean;
    maxScheduledAgents?: number;
}

/**
 * Agent Lifecycle Execution Options
 */
export interface AgentLifecycleExecutionOptions {
    timeout?: number;
    force?: boolean;
    saveSnapshot?: boolean;
    context?: Partial<AgentLifecycleContext>;
    metadata?: Metadata;
}

/**
 * Agent Lifecycle Execution Result
 */
export interface AgentLifecycleResult extends BaseExecutionResult<unknown> {
    // Lifecycle-specific information
    agentName: string;
    operation: string;
    previousStatus: AgentStatus;
    currentStatus: AgentStatus;

    // Enhanced metadata for lifecycle
    metadata: Metadata & {
        snapshotId?: string;
        executionTime: number;
        transitionValid: boolean;
        forceUsed?: boolean;
    };
}

// ===== VALIDATION FUNCTIONS =====

/**
 * Validate status transition
 */
export function isValidStatusTransition(
    fromStatus: AgentStatus,
    toStatus: AgentStatus,
): boolean {
    const validTransitions: Record<AgentStatus, AgentStatus[]> = {
        stopped: ['starting', 'scheduled'],
        starting: ['running', 'error', 'stopped'],
        running: ['pausing', 'stopping', 'error'],
        pausing: ['paused', 'error'],
        paused: ['resuming', 'stopping', 'error'],
        resuming: ['running', 'error'],
        stopping: ['stopped', 'error'],
        error: ['stopped', 'starting'],
        scheduled: ['starting', 'stopped'],
    };

    return validTransitions[fromStatus]?.includes(toStatus) || false;
}

/**
 * Validate agent lifecycle payload
 */
export function validateAgentStartPayload(
    payload: unknown,
): payload is AgentStartPayload {
    return (
        payload !== null &&
        typeof payload === 'object' &&
        'agentName' in payload &&
        'tenantId' in payload &&
        typeof (payload as Record<string, unknown>).agentName === 'string' &&
        typeof (payload as Record<string, unknown>).tenantId === 'string'
    );
}
/**
 * Métricas de performance do agente
 */
export interface AgentMetrics {
    currentLoad: number;
    averageResponseTime: number;
    successRate: number;
    availability: boolean;
    lastUsed: number;
    totalTasks: number;
    totalErrors: number;
    region?: string;
    latency?: number;
    currentTasks?: number;
    maxConcurrentTasks?: number;
}
