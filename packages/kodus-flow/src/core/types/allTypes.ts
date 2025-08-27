import { z } from 'zod';

import {
    CancelledNotification,
    InitializeResult,
    ProgressNotification,
} from '@modelcontextprotocol/sdk/types.js';
import { IdGenerator } from '@/utils/index.js';
import { createLogger, TelemetrySystem } from '@/observability/index.js';
import { zodToJSONSchema } from '../utils/zod-to-json-schema.js';
import { ContextStateService } from '../context/index.js';
import { EventStore } from '@/runtime/index.js';
import { EventChainTracker } from '@/runtime/core/event-processor-optimized.js';
import { ExecutionKernel } from '@/kernel/kernel.js';
import { AgentEngine, AgentExecutor } from '@/engine/index.js';

export type AgentIdentity = {
    /**
     * Agent's role/position (what they are)
     * Example: "Senior Software Engineer", "Data Analyst"
     */
    role?: string;

    /**
     * Agent's specific goal (what they should achieve)
     * Example: "Write clean, efficient, and well-tested Python code"
     */
    goal?: string;

    /**
     * General description (fallback/legacy support)
     */
    description?: string;

    /**
     * Agent's expertise areas
     * Example: ["Python", "Data Analysis", "Machine Learning"]
     */
    expertise?: string[];

    /**
     * Agent's personality/backstory for context
     */
    personality?: string;

    /**
     * Communication style
     * Example: "professional", "casual", "technical", "friendly"
     */
    style?: string;

    /**
     * Custom system prompt (overrides generated prompt)
     */
    systemPrompt?: string;
};

export interface AgentAction<TContent = unknown> {
    type: AgentActionType;
    content?: TContent;
    reasoning?: string;
}

export interface AgentThought<TContent = unknown> {
    reasoning: string;
    action: AgentAction<TContent>;
    confidence?: number;
    metadata?: Record<string, unknown>;
}

export type ThinkFunction<TInput = unknown, TContent = unknown> = (
    input: TInput,
    context: AgentContext,
) => Promise<AgentThought<TContent>>;

/**
 * Agent configuration options
 */
export interface AgentConfig {
    /**
     * Maximum iterations for looping agents
     */
    maxIterations?: number;

    /**
     * Execution timeout in milliseconds
     */
    timeout?: number;

    /**
     * Required tools for this agent
     */
    requiredTools?: string[];

    /**
     * Optional tools that enhance this agent
     */
    optionalTools?: string[];

    /**
     * Enable specific capabilities
     */
    capabilities?: {
        enableMemory?: boolean;
        enableState?: boolean;
        enableSession?: boolean;
        enableTools?: boolean;
    };
}

/**
 * Generate system prompt from identity
 */
export function generateSystemPrompt(identity: AgentIdentity): string {
    if (identity.systemPrompt) {
        return identity.systemPrompt;
    }

    const parts: string[] = [];

    if (identity.role) {
        parts.push(`You are a ${identity.role}.`);
    }

    if (identity.goal) {
        parts.push(`Your goal is: ${identity.goal}`);
    }

    if (identity.expertise && identity.expertise.length > 0) {
        parts.push(
            `Your areas of expertise include: ${identity.expertise.join(', ')}.`,
        );
    }

    if (identity.personality) {
        parts.push(identity.personality);
    }

    if (identity.style) {
        parts.push(`Communication style: ${identity.style}.`);
    }

    if (identity.description) {
        if (parts.length === 0) {
            parts.push(identity.description);
        } else {
            parts.push(`Additional context: ${identity.description}`);
        }
    }

    if (parts.length === 0) {
        parts.push(
            'You are a helpful AI assistant ready to assist with various tasks.',
        );
    }

    return parts.join(' ');
}

export type ThinkStatus =
    | 'thinking' // Analisando input e contexto
    | 'planning' // Gerando plano de execução
    | 'replanning' // Replanejando após falha
    | 'analyzing' // Analisando resultado anterior
    | 'deciding' // Decidindo próxima ação
    | 'thinking_complete' // Pensamento concluído
    | 'thinking_failed'; // Falha no pensamento

export type ActStatus =
    | 'acting' // Executando ação
    | 'tool_calling' // Chamando ferramenta
    | 'plan_executing' // Executando plano
    | 'waiting_response' // Aguardando resposta da ferramenta
    | 'acting_complete' // Ação concluída com sucesso
    | 'acting_failed'; // Falha na execução

// ═══════════════════════════════════════════════════════════════════════════════
// 👁️ OBSERVE PHASE STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export type ObserveStatus =
    | 'observing' // Analisando resultado
    | 'evaluating' // Avaliando sucesso/falha
    | 'synthesizing' // Sintetizando resposta final
    | 'observing_complete' // Observação concluída
    | 'observing_failed'; // Falha na observação

// ═══════════════════════════════════════════════════════════════════════════════
// 📋 PLAN STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export type PlanStatus =
    | 'plan_created' // Plano criado
    | 'plan_executing' // Plano em execução
    | 'plan_paused' // Plano pausado
    | 'plan_completed' // Plano concluído com sucesso
    | 'plan_failed' // Plano falhou
    | 'plan_cancelled' // Plano cancelado
    | 'plan_waiting_input' // Plano aguardando input do usuário
    | 'plan_replanning'; // Plano sendo replanejado

// ═══════════════════════════════════════════════════════════════════════════════
// 🔧 STEP STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export type StepStatus =
    | 'step_pending' // Step aguardando execução
    | 'step_blocked' // Step bloqueado por dependência
    | 'step_executing' // Step em execução
    | 'step_completed' // Step concluído com sucesso
    | 'step_failed' // Step falhou
    | 'step_skipped' // Step pulado
    | 'step_cancelled' // Step cancelado
    | 'step_retrying'; // Step sendo reexecutado

// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 EXECUTION STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export type ExecutionStatus =
    | 'execution_started' // Execução iniciada
    | 'execution_running' // Execução em andamento
    | 'execution_paused' // Execução pausada
    | 'execution_completed' // Execução concluída com sucesso
    | 'execution_failed' // Execução falhou
    | 'execution_cancelled' // Execução cancelada
    | 'execution_timeout' // Execução expirou
    | 'execution_deadlock' // Execução em deadlock
    | 'execution_waiting'; // Execução aguardando

// ═══════════════════════════════════════════════════════════════════════════════
// 🔄 REPLAN STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export type ReplanStatus =
    | 'replan_triggered' // Replan foi disparado
    | 'replan_analyzing' // Analisando falhas para replan
    | 'replan_preserving' // Preservando steps bem-sucedidos
    | 'replan_generating' // Gerando novo plano
    | 'replan_completed' // Replan concluído
    | 'replan_failed' // Replan falhou
    | 'replan_limit_reached' // Limite de replans atingido
    | 'replan_cancelled'; // Replan cancelado

// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 AGENT OVERALL STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export type AgentOverallStatus =
    | 'agent_idle' // Agent ocioso
    | 'agent_initializing' // Agent inicializando
    | 'agent_ready' // Agent pronto para executar
    | 'agent_running' // Agent executando
    | 'agent_paused' // Agent pausado
    | 'agent_completed' // Agent concluído com sucesso
    | 'agent_failed' // Agent falhou
    | 'agent_error' // Agent em erro
    | 'agent_timeout' // Agent expirou
    | 'agent_cancelled' // Agent cancelado
    | 'agent_waiting_input' // Agent aguardando input
    | 'agent_stagnated'; // Agent estagnado

// ═══════════════════════════════════════════════════════════════════════════════
// 🚨 ERROR STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export type ErrorStatus =
    | 'error_tool_unavailable' // Ferramenta não disponível
    | 'error_tool_failed' // Ferramenta falhou
    | 'error_invalid_input' // Input inválido
    | 'error_missing_parameters' // Parâmetros faltando
    | 'error_permission_denied' // Permissão negada
    | 'error_rate_limit' // Rate limit atingido
    | 'error_timeout' // Timeout
    | 'error_network' // Erro de rede
    | 'error_unknown' // Erro desconhecido
    | 'error_llm_failed' // LLM falhou
    | 'error_planning_failed' // Planejamento falhou
    | 'error_execution_failed'; // Execução falhou

// ═══════════════════════════════════════════════════════════════════════════════
// 📊 SUCCESS STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export type SuccessStatus =
    | 'success_completed' // Tarefa concluída com sucesso
    | 'success_partial' // Sucesso parcial
    | 'success_with_warnings' // Sucesso com avisos
    | 'success_alternative' // Sucesso com alternativa
    | 'success_cached' // Sucesso usando cache
    | 'success_optimized'; // Sucesso otimizado

// 🎯 UNIFIED STATUS SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Status unificado para o agent
 */
export type AgentStatus =
    | ThinkStatus
    | ActStatus
    | ObserveStatus
    | PlanStatus
    | StepStatus
    | ExecutionStatus
    | ReplanStatus
    | AgentOverallStatus
    | ErrorStatus
    | SuccessStatus;

/**
 * Status detalhado com contexto
 */
export interface DetailedAgentStatus {
    // Status principal
    status: AgentStatus;

    // Fase atual
    phase:
        | 'think'
        | 'act'
        | 'observe'
        | 'plan'
        | 'execute'
        | 'replan'
        | 'error'
        | 'success';

    // Contexto adicional
    context?: {
        currentStep?: number;
        totalSteps?: number;
        progress?: number; // 0-100
        iteration?: number;
        maxIterations?: number;
        elapsedTime?: number;
        estimatedTimeRemaining?: number;
        errorMessage?: string;
        successMessage?: string;
        warnings?: string[];
        suggestions?: string[];
    };

    // Timestamps
    timestamp: number;
    phaseStartTime?: number;

    // Metadata
    metadata?: Record<string, unknown>;
}

export function isSuccessStatus(status: AgentStatus): boolean {
    return (
        status.startsWith('success_') ||
        status === 'agent_completed' ||
        status === 'execution_completed' ||
        status === 'plan_completed' ||
        status === 'step_completed' ||
        status === 'acting_complete' ||
        status === 'observing_complete' ||
        status === 'thinking_complete'
    );
}

/**
 * Verifica se o status indica erro
 */
export function isErrorStatus(status: AgentStatus): boolean {
    return (
        status.startsWith('error_') ||
        status === 'agent_failed' ||
        status === 'agent_error' ||
        status === 'execution_failed' ||
        status === 'plan_failed' ||
        status === 'step_failed' ||
        status === 'acting_failed' ||
        status === 'observing_failed' ||
        status === 'thinking_failed'
    );
}

/**
 * Verifica se o status indica que está em execução
 */
export function isRunningStatus(status: AgentStatus): boolean {
    return (
        status === 'agent_running' ||
        status === 'execution_running' ||
        status === 'plan_executing' ||
        status === 'step_executing' ||
        status === 'acting' ||
        status === 'observing' ||
        status === 'thinking'
    );
}

/**
 * Verifica se o status indica que está aguardando
 */
export function isWaitingStatus(status: AgentStatus): boolean {
    return (
        status === 'agent_waiting_input' ||
        status === 'execution_waiting' ||
        status === 'plan_waiting_input' ||
        status === 'step_pending' ||
        status === 'waiting_response'
    );
}

/**
 * Verifica se o status indica que está completo
 */
export function isCompleteStatus(status: AgentStatus): boolean {
    return (
        isSuccessStatus(status) ||
        isErrorStatus(status) ||
        status === 'agent_cancelled' ||
        status === 'execution_cancelled' ||
        status === 'plan_cancelled' ||
        status === 'step_cancelled'
    );
}

// agent-types.ts
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
    'initialized',
    'final_answer',
    'need_more_info',
    'tool_call',
    'execute_plan',
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

export interface ParallelToolsAction extends AgentAction {
    type: 'parallel_tools';
    tools: ToolCall[];
    concurrency?: number; // Max concurrent executions
    timeout?: number; // Total timeout for all tools
    failFast?: boolean; // Stop on first failure
    aggregateResults?: boolean; // Combine all results
    reasoning?: string;
}

export interface NeedMoreInfoAction extends AgentAction {
    type: 'need_more_info';
    question: string;
    context?: string;
    metadata?: Record<string, unknown>;
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
}

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

export interface AgentThought<TContent = unknown> {
    reasoning: string;
    action: AgentAction<TContent>;
    metadata?: Metadata;
}

export interface AgentDefinition<
    TInput = unknown,
    TOutput = unknown,
    TContent = unknown,
> extends BaseDefinition {
    identity: AgentIdentity;

    think: ThinkFunction<TInput, TContent>;

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
    config?: AgentConfig;

    // Required tools for this agent
    requiredTools?: string[];

    // Optional tools that enhance this agent
    optionalTools?: string[];
}

export interface AgentContext {
    sessionId: string;
    tenantId: string;
    correlationId: string;
    thread: Thread;
    agentName: string;
    invocationId: string;
    executionId?: string;

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

    availableTools: ToolMetadataForPlanner[];
    signal: AbortSignal;

    // Cleanup
    cleanup(): Promise<void>;

    executionRuntime: {
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
    };
    agentIdentity?: AgentIdentity;
    agentExecutionOptions?: AgentExecutionOptions;
    allTools?: ToolDefinition<unknown, unknown>[];
}

export interface AgentExecutionContext extends BaseContext {
    agentName: string;
    invocationId: string;
    startTime: number;

    agentIdentity?: AgentIdentity;

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

export type ExtractActionContent<T extends AgentAction> =
    T extends AgentAction<infer C> ? C : unknown;

export type CreateAgentAction<C = unknown> = AgentAction<C>;

export function isNeedMoreInfoAction(
    action: AgentAction,
): action is NeedMoreInfoAction {
    return action.type === 'need_more_info';
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

/**
 * Check if action is a specific type
 */
export function isActionType<T extends AgentActionType>(
    action: AgentAction,
    type: T,
): action is AgentAction & { type: T } {
    return action.type === type;
}

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

export interface AgentLifecycleContext extends BaseContext {
    agentName: string;
    operation: 'start' | 'stop' | 'pause' | 'resume' | 'schedule';

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

export interface AgentLifecycleExecutionOptions {
    timeout?: number;
    force?: boolean;
    saveSnapshot?: boolean;
    context?: Partial<AgentLifecycleContext>;
    metadata?: Metadata;
}

export interface AgentLifecycleResult extends BaseExecutionResult<unknown> {
    agentName: string;
    operation: string;
    previousStatus: AgentStatus;
    currentStatus: AgentStatus;

    metadata: Metadata & {
        snapshotId?: string;
        executionTime: number;
        transitionValid: boolean;
        forceUsed?: boolean;
    };
}

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

// base-types.ts

export type EntityId = string;
export type TenantId = string;
export type SessionId = string;
export type ThreadId = string;
export type CorrelationId = string;
export type UserId = string;
export type InvocationId = string;
export type CallId = string;

export type ExecutionId = string;
export type WorkflowId = string;
export type StepId = string;

export type AgentId = string;
export type ToolId = string;

export type EventId = string;
export type OperationId = string;
export type ParentId = string;
export type SnapshotId = string;

// Additional identifiers consolidated from other files
export type ContextId = string;
export type MemoryId = string;
export type StateId = string;
export type WorkflowExecutionId = string;
export type ToolCallId = string;

export const identifierSchemas = {
    entityId: z.string().min(1),
    tenantId: z.string().min(1).max(100),
    sessionId: z.string().min(1),
    threadId: z.string().min(1),
    correlationId: z.string().min(1).max(100),
    userId: z.string().min(1),
    invocationId: z.string().min(1),
    executionId: z.string().min(1),
    workflowId: z.string().min(1),
    stepId: z.string().min(1),
    agentId: z.string().min(1),
    toolId: z.string().min(1),
    eventId: z.string().min(1),
    operationId: z.string().min(1),
    parentId: z.string().min(1),
    snapshotId: z.string().min(1),
} as const;

export type BaseContext = {
    tenantId: TenantId;
    correlationId: CorrelationId;
    startTime: number;
};

/**
 * Contexto de execução com identificadores de sessão
 */
export type ExecutionContext = BaseContext & {
    executionId: ExecutionId;
    sessionId?: SessionId;
    threadId?: ThreadId;
    status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED';
};

// WorkflowContext é definido em workflow-types.ts para evitar conflitos

/**
 * Contexto específico para operações
 */
export type OperationContext = BaseContext & {
    operationId: OperationId;
    executionId: ExecutionId;
};

// ──────────────────────────────────────────────────────────────────────────────
// 👤 CONTEXTOS SEPARADOS - User vs System
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Contexto do Usuário - Dados controlados pelo usuário
 * IMUTÁVEL durante a execução
 */
export type UserContext = Record<string, unknown>;

/**
 * Contexto do Sistema - Dados gerados automaticamente pelo runtime
 * MUTÁVEL durante a execução
 */
export type SystemContext = BaseContext & {
    // === IDENTIDADE ===
    threadId: ThreadId;
    status: 'running' | 'completed' | 'failed' | 'paused';

    executionId: ExecutionId;
    sessionId?: SessionId;

    // === ESTADO DA EXECUÇÃO ===
    iteration?: number;
    toolsUsed?: number;
    lastToolResult?: unknown;
    // === MEMÓRIA E HISTÓRICO ===
    conversationHistory?: ConversationHistory[];
    memoryData?: unknown;

    // === MÉTRICAS E TIMING ===
    duration?: number;
};

// SeparatedContext removed - use AgentContext with user/runtime pattern instead

// RuntimeContext removed - use SystemContext directly

// AgentContextPattern integrated directly into AgentContext interface

/**
 * Contexto específico para snapshots
 */
export interface SnapshotContext extends BaseContext {
    snapshotId: SnapshotId;
    executionId: ExecutionId;
    parentId?: ParentId;
}

/**
 * Contexto específico para observabilidade
 */
export interface ObservabilityContext extends BaseContext {
    sessionId?: SessionId;
    threadId?: ThreadId;
    executionId?: ExecutionId;
}

/**
 * Contexto específico para segurança
 */
export interface SecurityContext extends BaseContext {
    sessionId?: SessionId;
    operationId?: OperationId;
}

/**
 * Contexto específico para rate limiting
 */
export interface RateLimitContext extends BaseContext {
    sessionId?: SessionId;
    operationId?: OperationId;
}

/**
 * Contexto específico para MCP
 */
export interface MCPContext extends BaseContext {
    sessionId?: SessionId;
    serverName?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// 📊 MÉTRICAS E TRACKING
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Interface para métricas de identificadores
 */
export interface IdentifierMetrics {
    tenantId: TenantId;
    correlationId: CorrelationId;
    timestamp: number;
    operation: string;
    duration?: number;
    success?: boolean;
    error?: string;
}

/**
 * Interface para tracking de identificadores
 */
export interface IdentifierTracking {
    tenantId: TenantId;
    correlationId: CorrelationId;
    sessionId?: SessionId;
    threadId?: ThreadId;
    executionId?: ExecutionId;
    agentId?: AgentId;
    workflowId?: WorkflowId;
    operationId?: OperationId;
    eventId?: EventId;
    parentId?: ParentId;
    snapshotId?: SnapshotId;
}

// ──────────────────────────────────────────────────────────────────────────────
// 📋 TIPOS DE STATUS E METADADOS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Status de operação
 */
export type OperationStatus =
    | 'idle'
    | 'active'
    | 'completed'
    | 'failed'
    | 'timeout';

/**
 * Interface para metadados genéricos
 */
export interface Metadata {
    [key: string]: unknown;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🏗️ INTERFACES BASE PARA DEFINIÇÕES
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Interface base para definições
 */
export interface BaseDefinition {
    name: string;
    description?: string;
    version?: string;
    metadata?: Metadata;
}

/**
 * Interface base para resultados de execução
 */
export interface BaseExecutionResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: Error;
    duration: number;
    metadata?: Metadata;
}

/**
 * Interface base para configurações de engine
 */
export interface BaseEngineConfig {
    debug?: boolean;
    monitor?: boolean;
    timeout?: number;
    retries?: number;
    metadata?: Metadata;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🔧 FUNÇÕES UTILITÁRIAS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Valida se um objeto é um BaseContext válido
 */
export function validateBaseContext(obj: unknown): obj is BaseContext {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'tenantId' in obj &&
        'correlationId' in obj &&
        typeof (obj as Record<string, unknown>).tenantId === 'string' &&
        typeof (obj as Record<string, unknown>).correlationId === 'string'
    );
}

//base-storage.ts

/**
 * Base storage item interface
 * Integrates with existing framework types
 */
export const baseStorageItemSchema = z.object({
    id: z.string().min(1),
    timestamp: z.number(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    // Framework integration
    tenantId: z.string().optional(),
    correlationId: z.string().optional(),
    entityId: z.string().optional(),
});
export type BaseStorageItem = z.infer<typeof baseStorageItemSchema> &
    Partial<BaseContext>;

/**
 * Base query filters
 */
export const baseQueryFiltersSchema = z.object({
    fromTimestamp: z.number().optional(),
    toTimestamp: z.number().optional(),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional(),
    sortBy: z.string().optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    // Framework integration
    tenantId: z.string().optional(),
    entityId: z.string().optional(),
    correlationId: z.string().optional(),
});
export type BaseQueryFilters = z.infer<typeof baseQueryFiltersSchema>;

/**
 * Base storage statistics
 */
export const baseStorageStatsSchema = z.object({
    itemCount: z.number(),
    totalSize: z.number(),
    averageItemSize: z.number(),
    adapterType: z.string(),
    // Framework integration
    tenantId: z.string().optional(),
    healthStatus: z.enum(['healthy', 'degraded', 'unhealthy']).optional(),
});
export type BaseStorageStats = z.infer<typeof baseStorageStatsSchema>;

/**
 * Base storage configuration
 */
export const baseStorageConfigSchema = z.object({
    maxItems: z.number().int().positive().default(1000),
    enableCompression: z.boolean().default(true),
    cleanupInterval: z.number().int().positive().default(300000), // 5 minutes
    timeout: z.number().int().positive().default(5000),
    retries: z.number().int().nonnegative().default(3),
    // Framework integration
    enableObservability: z.boolean().default(true),
    enableHealthChecks: z.boolean().default(true),
    enableMetrics: z.boolean().default(true),
});
export type BaseStorageConfig = z.infer<typeof baseStorageConfigSchema>;

/**
 * Base storage interface
 * Shared between Persistor and Memory Manager
 */
export interface BaseStorage<T extends BaseStorageItem> {
    /**
     * Store an item
     */
    store(item: T): Promise<void>;

    /**
     * Retrieve an item by ID
     */
    retrieve(id: string): Promise<T | null>;

    /**
     * Delete an item by ID
     */
    delete(id: string): Promise<boolean>;

    /**
     * Clear all items
     */
    clear(): Promise<void>;

    /**
     * Get storage statistics
     */
    getStats(): Promise<BaseStorageStats>;

    /**
     * Check if storage is healthy/connected
     */
    isHealthy(): Promise<boolean>;

    /**
     * Initialize the storage
     */
    initialize(): Promise<void>;

    /**
     * Cleanup resources
     */
    cleanup(): Promise<void>;
}

// common-types.ts

// Re-export specific schemas for backwards compatibility
export const sessionIdSchema = z.string().min(1);
export const entityIdSchema = z.string().min(1);

export type WorkflowEventHandler<E extends AnyEvent = AnyEvent> = (
    event: E,
) => Promise<AnyEvent | void> | AnyEvent | void;

// Re-export enhanced types for consistency
//

/**
 * Persistor interface for snapshot storage
 */
export interface Persistor {
    /**
     * Save a snapshot to storage
     * @param snap The snapshot to save
     * @param options Options for snapshot persistence
     */
    append(snap: Snapshot, options?: SnapshotOptions): Promise<void>;

    /**
     * Load snapshots for an execution context
     * @param xcId The execution context ID
     */
    load(xcId: string): AsyncIterable<Snapshot>;

    /**
     * Check if a snapshot exists
     * @param hash The hash to check
     */
    has(hash: string): Promise<boolean>;

    /**
     * Load a specific snapshot by hash
     * @param hash The hash of the snapshot to load
     * @returns The snapshot or null if not found
     */
    getByHash?(hash: string): Promise<Snapshot | null>;

    /**
     * List all snapshot hashes for an execution context
     * @param xcId The execution context ID
     * @returns Array of snapshot hashes
     */
    listHashes?(xcId: string): Promise<string[]>;

    /**
     * Get storage statistics
     * @returns Storage statistics
     */
    getStats?(): Promise<PersistorStats>;
}

/**
 * Storage statistics for a persistor
 */
export interface PersistorStats {
    /** Total number of snapshots stored */
    snapshotCount: number;

    /** Total storage size in bytes */
    totalSizeBytes: number;

    /** Average snapshot size in bytes */
    avgSnapshotSizeBytes: number;

    /** Percentage of snapshots that are delta compressed */
    deltaCompressionRatio?: number;
}

export interface Snapshot {
    /** Execution context ID (format: tenant:job) */
    xcId: string;
    /** Timestamp when snapshot was created */
    ts: number;
    /** Complete event history */
    events: AnyEvent[];
    /** Complete workflow state */
    state: unknown;
    /** Deterministic hash of snapshot content */
    hash: string;
}

export interface DeltaSnapshot extends Snapshot {
    /** Flag indicating this is a delta snapshot */
    isDelta: true;
    /** Hash of the base snapshot this delta applies to */
    baseHash: string;
    /** Delta for events (implementation specific) */
    eventsDelta?: unknown;
    /** Delta for state (implementation specific, e.g., JSON Patch) */
    stateDelta?: unknown;
}

export interface SnapshotOptions {
    includeMetadata?: boolean;
    compression?: boolean;
    maxSize?: number;
    maxSnapshots?: number;
    useDelta?: boolean;
}

export type EventHandler<E extends AnyEvent = AnyEvent, R = AnyEvent | void> = (
    event: E,
) => Promise<R> | R;

export type HandlerReturn = AnyEvent | void | Promise<AnyEvent | void>;

export type EventPredicate = (event: AnyEvent) => boolean;

export interface EventStream<T extends AnyEvent = AnyEvent>
    extends AsyncIterable<T> {
    filter(predicate: (event: T) => boolean): EventStream<T>;
    map<U extends AnyEvent>(mapper: (event: T) => U): EventStream<U>;
    until(predicate: (event: T) => boolean): EventStream<T>;
    takeUntil(predicate: (event: T) => boolean): EventStream<T>;
    toArray(): Promise<T[]>;
    withMiddleware(middleware: unknown): EventStream<T>;
    debounce(delayMs: number): EventStream<T>;
    throttle(intervalMs: number): EventStream<T>;
    batch(size: number, timeoutMs?: number): EventStream<AnyEvent>;
    merge(...streams: EventStream<T>[]): EventStream<T>;
    combineLatest(...streams: EventStream<T>[]): EventStream<AnyEvent>;
}

/**
 * Async operation result
 */
export type AsyncResult<T = unknown, E = Error> = Promise<Result<T, E>>;

/**
 * Function signature for async operations
 */
export type AsyncFunction<TInput = unknown, TOutput = unknown> = (
    input: TInput,
) => Promise<TOutput>;

// ===== TYPE GUARDS =====
// Utility type guards for runtime type checking

export function isBaseContext(obj: unknown): obj is BaseContext {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'executionId' in obj &&
        'tenantId' in obj &&
        'startTime' in obj &&
        'status' in obj
    );
}

export function isAgentContext(obj: unknown): obj is AgentContext {
    return (
        isBaseContext(obj) &&
        'agentName' in obj &&
        'invocationId' in obj &&
        'stateManager' in obj &&
        'availableTools' in obj
    );
}

export function isToolContext(obj: unknown): obj is ToolContext {
    return (
        isBaseContext(obj) &&
        'toolName' in obj &&
        'callId' in obj &&
        'parameters' in obj
    );
}

export function isWorkflowContext(obj: unknown): obj is WorkflowContext {
    return (
        isBaseContext(obj) &&
        'workflowName' in obj &&
        'stateManager' in obj &&
        'data' in obj &&
        'currentSteps' in obj
    );
}

// ===== CONFIGURATION INTERFACES =====
// Common configuration patterns used across engines

/**
 * Common retry configuration
 */
export interface RetryConfig {
    maxAttempts: number;
    delayMs: number;
    backoffMultiplier?: number;
    maxDelayMs?: number;
}

/**
 * Common timeout configuration
 */
export interface TimeoutConfig {
    defaultTimeoutMs: number;
    maxTimeoutMs?: number;
}

/**
 * Common concurrency configuration
 */
export interface ConcurrencyConfig {
    maxConcurrent: number;
    queueLimit?: number;
}

// ===== 🚀 NEW: INTELLIGENCE TYPES =====

/**
 * Agent intelligence capabilities for autonomous operation
 */
export interface AgentIntelligence {
    // === TOOL EXECUTION INTELLIGENCE ===
    toolExecution: {
        // Can analyze which tools to run in parallel
        supportsParallelAnalysis: boolean;
        // Can determine execution order based on dependencies
        supportsDependencyAnalysis: boolean;
        // Can adapt strategy based on context
        supportsAdaptiveStrategy: boolean;
        // Can predict resource requirements
        supportsResourcePrediction: boolean;
    };

    // === DECISION MAKING INTELLIGENCE ===
    decisionMaking: {
        // Can make autonomous tool selection decisions
        autonomousToolSelection: boolean;
        // Can handle uncertainty and ambiguity
        uncertaintyHandling: boolean;
        // Can learn from past executions
        experientialLearning: boolean;
        // Can reason about trade-offs
        tradeoffReasoning: boolean;
    };

    // === CONTEXT INTELLIGENCE ===
    contextual: {
        // Can understand user intent from context
        intentRecognition: boolean;
        // Can maintain conversation state
        conversationState: boolean;
        // Can adapt to user preferences
        preferenceAdaptation: boolean;
        // Can handle multi-turn interactions
        multiTurnDialogue: boolean;
    };

    // === COLLABORATION INTELLIGENCE ===
    collaboration: {
        // Can coordinate with other agents
        multiAgentCoordination: boolean;
        // Can delegate tasks effectively
        taskDelegation: boolean;
        // Can request help when stuck
        helpSeeking: boolean;
        // Can share knowledge with other agents
        knowledgeSharing: boolean;
    };
}

/**
 * Planner intelligence for strategic planning
 */
export interface PlannerIntelligence {
    // === STRATEGY ANALYSIS ===
    strategy: {
        // Can analyze tool parallelization opportunities
        analyzeParallelization: (
            tools: string[],
            context: Record<string, unknown>,
        ) => {
            parallelizable: string[][];
            sequential: string[];
            conditional: Record<string, string[]>;
            reasoning: string;
        };

        // Can estimate execution complexity
        estimateComplexity: (
            plan: unknown,
            context: Record<string, unknown>,
        ) => {
            timeEstimate: number;
            resourceEstimate: number;
            riskLevel: 'low' | 'medium' | 'high';
            confidence: number;
        };

        // Can suggest optimizations
        suggestOptimizations: (
            plan: unknown,
            context: Record<string, unknown>,
        ) => {
            optimizations: string[];
            potentialSavings: number;
            tradeoffs: string[];
        };
    };

    // === ADAPTIVE CAPABILITIES ===
    adaptive: {
        // Can learn from execution results
        learnFromExecution: boolean;
        // Can adjust strategies based on performance
        performanceAdaptation: boolean;
        // Can handle plan failures gracefully
        failureRecovery: boolean;
        // Can replan when conditions change
        dynamicReplanning: boolean;
    };

    // === INTELLIGENCE HINTS ===
    hints: {
        // Preferred execution strategies
        preferredStrategies: string[];
        // Performance optimizations to consider
        optimizations: string[];
        // Risk factors to monitor
        riskFactors: string[];
        // Success metrics to track
        successMetrics: string[];
    };
}

/**
 * Router intelligence for routing decisions
 */
export interface RouterIntelligence {
    // === ROUTING STRATEGY ===
    routing: {
        // Can determine optimal tool execution strategy
        determineToolExecutionStrategy: (
            tools: string[],
            context: Record<string, unknown>,
        ) => {
            strategy: 'parallel' | 'sequential' | 'conditional' | 'adaptive';
            confidence: number;
            reasoning: string;
            alternatives: string[];
        };

        // Can apply execution rules intelligently
        applyExecutionRules: (
            rules: unknown[],
            context: Record<string, unknown>,
        ) => {
            selectedRules: unknown[];
            reasoning: string;
            confidence: number;
        };

        // Can perform heuristic analysis
        heuristicAnalysis: (
            input: unknown,
            availableOptions: string[],
            context: Record<string, unknown>,
        ) => {
            recommendations: Array<{
                option: string;
                score: number;
                reasoning: string;
            }>;
            confidence: number;
        };
    };

    // === ADAPTIVE INTELLIGENCE ===
    adaptive: {
        // Can adapt routing based on performance
        performanceBasedRouting: boolean;
        // Can learn from routing decisions
        routingLearning: boolean;
        // Can handle routing failures
        failureHandling: boolean;
        // Can optimize routes over time
        routeOptimization: boolean;
    };

    // === INTELLIGENCE METADATA ===
    metadata: {
        // Intelligence capabilities supported
        capabilities: string[];
        // Performance metrics tracked
        metrics: string[];
        // Learning algorithms used
        algorithms: string[];
        // Confidence thresholds
        confidenceThresholds: Record<string, number>;
    };
}

/**
 * Combined intelligence capabilities for autonomous agents
 */
export interface CombinedIntelligence {
    agent: AgentIntelligence;
    planner: PlannerIntelligence;
    router: RouterIntelligence;

    // === INTEGRATION CAPABILITIES ===
    integration: {
        // Can coordinate between intelligence layers
        crossLayerCoordination: boolean;
        // Can share insights between components
        insightSharing: boolean;
        // Can resolve conflicts between intelligence layers
        conflictResolution: boolean;
        // Can optimize overall system performance
        systemOptimization: boolean;
    };

    // === LEARNING CAPABILITIES ===
    learning: {
        // Can learn from multi-layer feedback
        multiLayerLearning: boolean;
        // Can transfer knowledge between components
        knowledgeTransfer: boolean;
        // Can adapt to changing environments
        environmentalAdaptation: boolean;
        // Can improve over time
        continuousImprovement: boolean;
    };
}

// ===== FACTORY FUNCTIONS =====
// Common factory functions for creating contexts and configurations

/**
 * Create a new execution ID
 */
export function createExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create a new correlation ID
 */
export function createCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create default metadata
 */
export function createDefaultMetadata(): Metadata {
    return {
        createdAt: Date.now(),
        version: '1.0.0',
    };
}

/**
 * Thread configuration for conversation/workflow identification
 * Used to identify and track execution context
 */
export interface Thread {
    /** Unique thread identifier */
    id: ThreadId;
    /** Thread metadata (description, type, etc.) */
    metadata: {
        /** Thread description */
        description?: string;
        /** Additional metadata (string or number only to avoid large objects) */
        [key: string]: string | number | undefined;
    };
}

/**
 * Thread metadata schema for validation
 */
export const threadMetadataSchema = z
    .object({
        description: z.string().optional(),
        type: z
            .enum(['user', 'organization', 'system', 'bot', 'custom'])
            .optional(),
    })
    .and(z.record(z.string(), z.union([z.string(), z.number()])));

/**
 * Thread schema for validation
 */
export const threadSchema = z.object({
    id: z.string().min(1),
    metadata: threadMetadataSchema,
});

//context-types.ts

/**
 * Context ID schema and type
 * Used to identify an execution context
 */
export const contextIdSchema = z.string().min(1);

export const contextStateSchema = z.record(z.string(), z.unknown());
export type ContextState = z.infer<typeof contextStateSchema>;

export const contextVariablesSchema = z.record(z.string(), z.unknown());
export type ContextVariables = z.infer<typeof contextVariablesSchema>;

export const contextOptionsSchema = z.object({
    entityId: z.string().optional(),
    sessionId: z.string().optional(),
    tenantId: z.string().optional(),
    parentContextId: contextIdSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    state: contextStateSchema.optional(),
    variables: contextVariablesSchema.optional(),
    timeoutMs: z.number().int().positive().optional(),
});
export type ContextOptions = z.infer<typeof contextOptionsSchema>;

/**
 * Context factory options schema and type
 * Used to configure a context factory
 */
export const contextFactoryOptionsSchema = z.object({
    defaultTimeoutMs: z.number().int().positive().optional(),
    defaultMetadata: z.record(z.string(), z.unknown()).optional(),
});
export type ContextFactoryOptions = z.infer<typeof contextFactoryOptionsSchema>;

/**
 * Context event schema and type
 * Used for events related to context lifecycle
 */
export const contextEventSchema = z.object({
    type: z.enum(['created', 'updated', 'destroyed', 'timeout']),
    contextId: contextIdSchema,
    timestamp: z.number(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ContextEvent = z.infer<typeof contextEventSchema>;

/**
 * Context reference schema and type
 * A lightweight reference to a context
 */
export const contextReferenceSchema = z.object({
    contextId: contextIdSchema,
    entityId: z.string().optional(),
    sessionId: z.string().optional(),
    tenantId: z.string().optional(),
});
export type ContextReference = z.infer<typeof contextReferenceSchema>;

export const contextStatusSchema = z.enum([
    'active',
    'paused',
    'completed',
    'failed',
    'canceled',
    'timeout',
]);
export type ContextStatus = z.infer<typeof contextStatusSchema>;

export const contextInfoSchema = z.object({
    contextId: contextIdSchema,
    entityId: z.string().optional(),
    sessionId: z.string().optional(),
    tenantId: z.string().optional(),
    parentContextId: contextIdSchema.optional(),
    status: contextStatusSchema,
    startTime: z.number().optional(),
    endTime: z.number().optional(),
    duration: z.number().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ContextInfo = z.infer<typeof contextInfoSchema>;

export function isToolCallAction(
    action: AgentAction,
): action is Extract<AgentAction, { type: 'tool_call' }> {
    return action.type === 'tool_call';
}

export function isFinalAnswerAction(
    action: AgentAction,
): action is Extract<AgentAction, { type: 'final_answer' }> {
    return action.type === 'final_answer';
}

export interface ActionCapability {
    name: string;
    description: string;
    requiresTarget: boolean;
    supportsAsync: boolean;
    requiresPermission?: string;
    estimatedDuration?: number;
}

/**
 * Registry de capabilities por action type
 */
export const ACTION_CAPABILITIES: Record<string, ActionCapability> = {
    toolCall: {
        name: 'Tool Execution',
        description: 'Execute external tools and services',
        requiresTarget: false,
        supportsAsync: true,
    },
    finalAnswer: {
        name: 'Final Response',
        description: 'Provide final answer to the user',
        requiresTarget: false,
        supportsAsync: false,
    },
    needMoreInfo: {
        name: 'Information Request',
        description: 'Request additional information from user',
        requiresTarget: false,
        supportsAsync: false,
    },
    delegate: {
        name: 'Agent Delegation',
        description: 'Delegate task to another agent',
        requiresTarget: true,
        supportsAsync: true,
        requiresPermission: 'agent.delegate',
        estimatedDuration: 5000,
    },
    collaborate: {
        name: 'Multi-Agent Collaboration',
        description: 'Coordinate multiple agents on a task',
        requiresTarget: true,
        supportsAsync: true,
        requiresPermission: 'agent.collaborate',
        estimatedDuration: 10000,
    },
    route: {
        name: 'Intelligent Routing',
        description: 'Route request through intelligent router',
        requiresTarget: true,
        supportsAsync: true,
        estimatedDuration: 2000,
    },
    plan: {
        name: 'Goal Planning',
        description: 'Create execution plan for complex goal',
        requiresTarget: true,
        supportsAsync: true,
        estimatedDuration: 3000,
    },
    pause: {
        name: 'Execution Pause',
        description: 'Pause execution with resume condition',
        requiresTarget: false,
        supportsAsync: false,
    },
    broadcast: {
        name: 'Event Broadcasting',
        description: 'Broadcast event to multiple agents',
        requiresTarget: false,
        supportsAsync: true,
        requiresPermission: 'agent.broadcast',
    },
    discover: {
        name: 'Agent Discovery',
        description: 'Discover available agents by criteria',
        requiresTarget: false,
        supportsAsync: true,
    },
    syncState: {
        name: 'State Synchronization',
        description: 'Synchronize state with other agents',
        requiresTarget: true,
        supportsAsync: true,
        requiresPermission: 'agent.sync',
    },
};

/**
 * Get action capability by type
 */
export function getActionCapability(
    actionType: string,
): ActionCapability | undefined {
    return ACTION_CAPABILITIES[actionType];
}

/**
 * Get all available action types
 */
export function getAvailableActionTypes(): string[] {
    return Object.keys(ACTION_CAPABILITIES);
}

/**
 * Filter actions by capability requirements
 */
export function filterActionsByCapability(
    requirements: Partial<ActionCapability>,
): string[] {
    return Object.entries(ACTION_CAPABILITIES)
        .filter(([, capability]) => {
            return Object.entries(requirements).every(([key, value]) => {
                return capability[key as keyof ActionCapability] === value;
            });
        })
        .map(([actionType]) => actionType);
}

export interface EnhancedAgentContextOptions extends AgentExecutionOptions {
    agentName: string;
    enableAISDKFeatures?: boolean;
    maxMessageHistory?: number;
    enableAutoContext?: boolean;
}

export interface EnhancedAgentCoreConfig {
    agentName: string;
    maxThinkingIterations?: number;
    enableParallelExecution?: boolean;
    enableAutoContext?: boolean;
    enableAdvancedLogging?: boolean;
    planner?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    llmAdapter?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    kernelHandler?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    logger?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface ExecutionComparison {
    original: {
        duration: number;
        iterations: number;
        success: boolean;
    };
    enhanced: {
        duration: number;
        iterations: number;
        success: boolean;
        aiSDKFeatures: string[];
    };
}

export interface ImprovementReport {
    performance: {
        durationImprovement: string;
        iterationImprovement: string;
    };
    features: string[];
    summary: string;
}

export interface EnhancedWorkflowEventFactory {
    <P = void, K extends EventType = EventType>(
        type: K,
    ): EnhancedEventDef<P, K>;
    <P, K extends EventType = EventType>(
        type: K,
        schema?: (data: unknown) => data is P,
    ): EnhancedEventDef<P, K>;
}

export type InferEventPayload<T> =
    T extends EventDef<infer P, EventType> ? P : never;

export type InferEventKey<T> = T extends EventDef<unknown, infer K> ? K : never;

export type InferHandlerReturn<T> =
    T extends EventHandler<Event<EventType>, infer R> ? R : never;

export type EventUnion<T extends readonly EventDef<unknown, EventType>[]> = {
    [K in keyof T]: T[K] extends EventDef<unknown, infer Type>
        ? Event<Type>
        : never;
}[number];

export type ExtractPayloads<T extends Event> =
    T extends Event<infer K> ? EventPayloads[K] : never;

export interface EventMatcher<T extends Event = Event> {
    on<E extends T>(
        eventDef: EventDef<InferEventPayload<E>, InferEventKey<E>>,
        handler: (event: E) => Event | void | Promise<Event | void>,
    ): EventMatcher<T>;

    onAny<E extends T>(
        eventDefs: Array<EventDef<InferEventPayload<E>, InferEventKey<E>>>,
        handler: (event: E) => Event | void | Promise<Event | void>,
    ): EventMatcher<T>;

    otherwise(
        handler: (event: T) => Event | void | Promise<Event | void>,
    ): EventMatcher<T>;

    build(): (event: T) => Event | void | Promise<Event | void>;
}

export type If<C extends boolean, T, F> = C extends true ? T : F;

export type IsVoid<T> = T extends void ? true : false;

export type IsPromise<T> = T extends Promise<unknown> ? true : false;

export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * Deep readonly utility
 */
export type DeepReadonly<T> = {
    readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * Make certain properties optional
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Make certain properties required
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> &
    Required<Pick<T, K>>;

/**
 * Type-safe key paths
 */
export type KeyPath<T, K extends keyof T = keyof T> = K extends string
    ? T[K] extends object
        ? `${K}` | `${K}.${KeyPath<T[K]>}`
        : `${K}`
    : never;

/**
 * Get type by key path
 */
export type GetByPath<
    T,
    P extends string,
> = P extends `${infer K}.${infer Rest}`
    ? K extends keyof T
        ? GetByPath<T[K], Rest>
        : never
    : P extends keyof T
      ? T[P]
      : never;

/**
 * Enhanced handler with better type inference
 */
export interface EnhancedHandler<
    TEvent extends Event = Event,
    TReturn = Event | void,
> {
    /**
     * The event handler function
     */
    handle: EventHandler<TEvent, TReturn>;

    /**
     * Event type this handler accepts
     */
    eventType: TEvent['type'];

    /**
     * Metadata about the handler
     */
    metadata?: {
        name?: string;
        description?: string;
        tags?: string[];
        timeout?: number;
        retries?: number;
    };
}

/**
 * Create an event matcher with type-safe chaining
 */
export function createEventMatcher<T extends Event = Event>(): EventMatcher<T> {
    const handlers = new Map<
        string,
        (event: T) => Event | void | Promise<Event | void>
    >();
    let fallbackHandler:
        | ((event: T) => Event | void | Promise<Event | void>)
        | undefined;

    const matcher: EventMatcher<T> = {
        on<E extends T>(
            eventDef: EventDef<InferEventPayload<E>, InferEventKey<E>>,
            handler: (event: E) => Event | void | Promise<Event | void>,
        ) {
            handlers.set(eventDef.type, ((event: T) =>
                handler(event as unknown as E)) as (
                event: T,
            ) => Event | void | Promise<Event | void>);
            return matcher;
        },

        onAny<E extends T>(
            eventDefs: Array<EventDef<InferEventPayload<E>, InferEventKey<E>>>,
            handler: (event: E) => Event | void | Promise<Event | void>,
        ) {
            for (const eventDef of eventDefs) {
                handlers.set(eventDef.type, ((event: T) =>
                    handler(event as unknown as E)) as (
                    event: T,
                ) => Event | void | Promise<Event | void>);
            }
            return matcher;
        },

        otherwise(handler: (event: T) => Event | void | Promise<Event | void>) {
            fallbackHandler = handler;
            return matcher;
        },

        build() {
            return (event: T) => {
                const handler = handlers.get(event.type);
                if (handler) {
                    return handler(event);
                }
                if (fallbackHandler) {
                    return fallbackHandler(event);
                }
                return undefined;
            };
        },
    };

    return matcher;
}

export type MaybePromise<T> = T | Promise<T>;

export type PromiseValue<T> = T extends Promise<infer U> ? U : T;

export type AllValues<T extends readonly unknown[]> = {
    [K in keyof T]: PromiseValue<T[K]>;
};

export type Result<T, E = Error> =
    | { success: true; data: T }
    | { success: false; error: E };

// error-types.ts
// event-types.ts

export const eventIdSchema = z.string().min(1);

export const eventPayloadSchema = z
    .unknown()
    .refine((val) => val !== null && typeof val === 'object', {
        message: 'Event payload must be an object',
    });
export type EventPayload = z.infer<typeof eventPayloadSchema>;

export const eventFilterSchema = z
    .object({
        type: z.string().or(z.array(z.string())).optional(),
        source: z.string().or(z.array(z.string())).optional(),
        entityId: entityIdSchema.optional(),
        sessionId: sessionIdSchema.optional(),
        tenantId: z.string().optional(),
        contextId: contextIdSchema.optional(),
        fromTimestamp: z.number().optional(),
        toTimestamp: z.number().optional(),
    })
    .strict(); // ✅ Zod v4: strict() para performance
export type EventFilter = z.infer<typeof eventFilterSchema>;

export const eventBusOptionsSchema = z
    .object({
        // Whether to buffer events when there are no subscribers
        bufferEvents: z.boolean().optional(),
        // Maximum number of events to buffer
        maxBufferSize: z.number().int().positive().optional(),
        // Whether to allow wildcard event types
        allowWildcards: z.boolean().optional(),
    })
    .strict(); // ✅ Zod v4: strict() para performance
export type EventBusOptions = z.infer<typeof eventBusOptionsSchema>;

/**
 * Event emitter options schema and type
 * Options for emitting an event
 */
export const eventEmitOptionsSchema = z
    .object({
        // Whether to wait for all handlers to complete
        waitForHandlers: z.boolean().optional(),
        // Timeout for waiting for handlers in milliseconds
        handlerTimeoutMs: z.number().int().positive().optional(),
    })
    .strict(); // ✅ Zod v4: strict() para performance
export type EventEmitOptions = z.infer<typeof eventEmitOptionsSchema>;

/**
 * Common event types used in the SDK
 */
export enum SystemEventType {
    // Context events
    CONTEXT_CREATED = 'context.created',
    CONTEXT_UPDATED = 'context.updated',
    CONTEXT_DESTROYED = 'context.destroyed',
    CONTEXT_TIMEOUT = 'context.timeout',

    // State events
    STATE_UPDATED = 'state.updated',
    STATE_DELETED = 'state.deleted',

    // Workflow events
    WORKFLOW_STARTED = 'workflow.started',
    WORKFLOW_COMPLETED = 'workflow.completed',
    WORKFLOW_FAILED = 'workflow.failed',
    WORKFLOW_PAUSED = 'workflow.paused',
    WORKFLOW_RESUMED = 'workflow.resumed',
    WORKFLOW_CANCELED = 'workflow.canceled',

    // Step events
    STEP_STARTED = 'step.started',
    STEP_COMPLETED = 'step.completed',
    STEP_FAILED = 'step.failed',
    STEP_SKIPPED = 'step.skipped',

    // Agent events
    AGENT_STARTED = 'agent.started',
    AGENT_COMPLETED = 'agent.completed',
    AGENT_FAILED = 'agent.failed',

    // Tool events
    TOOL_CALLED = 'tool.called',
    TOOL_COMPLETED = 'tool.completed',
    TOOL_FAILED = 'tool.failed',

    // Human intervention events
    HUMAN_INTERVENTION_REQUESTED = 'human.intervention.requested',
    HUMAN_INTERVENTION_COMPLETED = 'human.intervention.completed',

    // System events
    SYSTEM_ERROR = 'system.error',
    SYSTEM_WARNING = 'system.warning',
    SYSTEM_INFO = 'system.info',
}

// events.ts

// ============================================================================
// 1️⃣ CONSTANTES DE TIPOS DE EVENTO
// ============================================================================

/**
 * Constantes para todos os tipos de eventos do sistema
 * Usar essas constantes em vez de strings literais
 */
export const EVENT_TYPES = {
    // === AGENT EVENTS ===
    AGENT_STARTED: 'agent.started',
    AGENT_INPUT: 'agent.input',
    AGENT_THINKING: 'agent.thinking',
    AGENT_THOUGHT: 'agent.thought',
    AGENT_COMPLETED: 'agent.completed',
    AGENT_FAILED: 'agent.failed',
    AGENT_QUESTION: 'agent.question',
    AGENT_ERROR: 'agent.error',
    AGENT_LIFECYCLE_STARTED: 'agent.lifecycle.started',
    AGENT_LIFECYCLE_STOPPED: 'agent.lifecycle.stopped',
    AGENT_LIFECYCLE_PAUSED: 'agent.lifecycle.paused',
    AGENT_LIFECYCLE_RESUMED: 'agent.lifecycle.resumed',
    AGENT_LIFECYCLE_SCHEDULED: 'agent.lifecycle.scheduled',
    AGENT_LIFECYCLE_ERROR: 'agent.lifecycle.error',
    AGENT_LIFECYCLE_STATUS_CHANGED: 'agent.lifecycle.status_changed',

    // === TOOL EVENTS ===
    TOOL_CALLED: 'tool.called',
    TOOL_CALL: 'tool.call',
    TOOL_RESULT: 'tool.result',
    TOOL_ERROR: 'tool.error',
    TOOL_COMPLETED: 'tool.completed',

    // === WORKFLOW EVENTS ===
    WORKFLOW_STARTED: 'workflow.started',
    WORKFLOW_START: 'workflow.start',
    WORKFLOW_COMPLETED: 'workflow.completed',
    WORKFLOW_COMPLETE: 'workflow.complete',
    WORKFLOW_FAILED: 'workflow.failed',
    WORKFLOW_ERROR: 'workflow.error',
    WORKFLOW_PAUSED: 'workflow.paused',
    WORKFLOW_RESUMED: 'workflow.resumed',
    WORKFLOW_CANCELED: 'workflow.canceled',
    WORKFLOW_RUN: 'workflow.run',

    // === CONTEXT EVENTS ===
    CONTEXT_CREATED: 'context.created',
    CONTEXT_UPDATED: 'context.updated',
    CONTEXT_DESTROYED: 'context.destroyed',
    CONTEXT_TIMEOUT: 'context.timeout',

    // === STATE EVENTS ===
    STATE_UPDATED: 'state.updated',
    STATE_DELETED: 'state.deleted',

    // === STEP EVENTS ===
    STEP_STARTED: 'step.started',
    STEP_COMPLETED: 'step.completed',
    STEP_FAILED: 'step.failed',
    STEP_SKIPPED: 'step.skipped',

    // === KERNEL EVENTS ===
    KERNEL_STARTED: 'kernel.started',
    KERNEL_PAUSED: 'kernel.paused',
    KERNEL_RESUMED: 'kernel.resumed',
    KERNEL_COMPLETED: 'kernel.completed',
    EXECUTION_COMPLETED: 'execution.completed',
    EXECUTION_RUN: 'execution.run',
    KERNEL_QUOTA_EXCEEDED: 'kernel.quota.exceeded',

    // === ROUTER EVENTS ===
    ROUTER_ROUTE: 'router.route',

    // === MCP EVENTS ===
    MCP_CONNECTED: 'mcp.connected',
    MCP_DISCONNECTED: 'mcp.disconnected',
    MCP_TOOL_CALLED: 'mcp.tool.called',
    MCP_TOOL_RESULT: 'mcp.tool.result',
    MCP_ERROR: 'mcp.error',

    // === PLANNER EVENTS ===
    PLANNER_STARTED: 'planner.started',
    PLANNER_COMPLETED: 'planner.completed',
    PLANNER_FAILED: 'planner.failed',
    PLANNER_STEP_COMPLETED: 'planner.step.completed',

    // === ECOSYSTEM EVENTS ===
    ECOSYSTEM_DISCOVER: 'ecosystem.discover',
    ECOSYSTEM_BROADCAST: 'ecosystem.broadcast',
    AGENT_DELEGATE: 'agent.delegate',

    // === SYSTEM EVENTS ===
    SYSTEM_ERROR: 'system.error',
    SYSTEM_WARNING: 'system.warning',
    SYSTEM_INFO: 'system.info',

    // === STREAM EVENTS ===
    STREAM_ERROR: 'stream.error',
    STREAM_BATCH: 'stream.batch',

    // === ERROR EVENTS ===
    ERROR: 'error',

    // === HUMAN INTERVENTION EVENTS ===
    HUMAN_INTERVENTION_REQUESTED: 'human.intervention.requested',
    HUMAN_INTERVENTION_COMPLETED: 'human.intervention.completed',

    // === MONITORING EVENTS ===
    MEMORY_HEAP: 'memory.heap',
    MEMORY_UTILIZATION: 'memory.utilization',
    RESOURCES_CONTEXTS: 'resources.contexts',
    RESOURCES_GENERATORS: 'resources.generators',
    PERFORMANCE_EVENT_RATE: 'performance.eventRate',
    PERFORMANCE_AVG_PROCESSING_TIME: 'performance.avgProcessingTime',
    PERFORMANCE_ERROR_RATE: 'performance.errorRate',

    // === AGENT CALL EVENTS ===
    AGENT_CALL: 'agent.call',

    // === TEST EVENTS ===
    START: 'start',
    BENCHMARK: 'benchmark',
    DONE: 'done',
    HIGH_VOLUME: 'high-volume',
    START_LIFECYCLE: 'START_LIFECYCLE',
    PROCESS_LIFECYCLE: 'PROCESS_LIFECYCLE',
    STOP_LIFECYCLE: 'STOP_LIFECYCLE',
    AFTER_STOP_LIFECYCLE: 'AFTER_STOP_LIFECYCLE',

    // === WORKFLOW ENGINE EVENTS ===
    STEP_PREFIX: 'step.',

    // === TEST WORKFLOW EVENTS ===
    CONCURRENT: 'concurrent',
    METRIC: 'metric',
    STEP_EVENT: 'step.event',
    WORKFLOW_STEP: 'workflow.step',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES] | string;

export interface EventPayloads {
    // === AGENT EVENTS ===
    [EVENT_TYPES.AGENT_STARTED]: {
        agentName: string;
        input: unknown;
        correlationId?: string;
    };

    [EVENT_TYPES.AGENT_INPUT]: {
        input: unknown;
        agent: string;
        correlationId?: string;
    };

    [EVENT_TYPES.AGENT_THINKING]: {
        agentName: string;
        input: unknown;
        correlationId?: string;
    };

    [EVENT_TYPES.AGENT_THOUGHT]: {
        agentName: string;
        thought: AgentThought;
        correlationId?: string;
    };

    [EVENT_TYPES.AGENT_COMPLETED]: {
        result: unknown;
        agent: string;
        reasoning: string;
    };

    [EVENT_TYPES.AGENT_FAILED]: {
        error: string;
        agent: string;
        reasoning?: string;
    };

    [EVENT_TYPES.AGENT_QUESTION]: {
        question: string;
        agent: string;
        correlationId?: string;
    };

    [EVENT_TYPES.AGENT_ERROR]: {
        error: string;
        agent: string;
        correlationId?: string;
    };

    [EVENT_TYPES.AGENT_LIFECYCLE_STARTED]: {
        agentName: string;
        tenantId: string;
        executionId: string;
        status: AgentStatus;
        startedAt: number;
    };

    [EVENT_TYPES.AGENT_LIFECYCLE_STOPPED]: {
        agentName: string;
        tenantId: string;
        status: AgentStatus;
        stoppedAt: number;
        reason?: string;
    };

    [EVENT_TYPES.AGENT_LIFECYCLE_PAUSED]: {
        agentName: string;
        tenantId: string;
        status: AgentStatus;
        pausedAt: number;
        snapshotId?: string;
        reason?: string;
    };

    [EVENT_TYPES.AGENT_LIFECYCLE_RESUMED]: {
        agentName: string;
        tenantId: string;
        status: AgentStatus;
        resumedAt: number;
        snapshotId?: string;
    };

    [EVENT_TYPES.AGENT_LIFECYCLE_SCHEDULED]: {
        agentName: string;
        tenantId: string;
        status: AgentStatus;
        scheduleTime: number;
        scheduleConfig: unknown;
    };

    [EVENT_TYPES.AGENT_LIFECYCLE_ERROR]: {
        agentName: string;
        tenantId: string;
        operation: string;
        error: string;
        details?: unknown;
        timestamp: number;
    };

    [EVENT_TYPES.AGENT_LIFECYCLE_STATUS_CHANGED]: {
        agentName: string;
        tenantId: string;
        fromStatus: AgentStatus;
        toStatus: AgentStatus;
        reason?: string;
        timestamp: number;
    };

    // === TOOL EVENTS ===
    [EVENT_TYPES.TOOL_CALLED]: {
        toolName: string;
        input: unknown;
        agent: string;
        correlationId?: string;
    };

    [EVENT_TYPES.TOOL_CALL]: {
        toolName: string;
        input: unknown;
        agent: string;
        correlationId?: string;
    };

    [EVENT_TYPES.TOOL_RESULT]: {
        result: unknown;
        agent: string;
        reasoning: string;
        toolName: string;
    };

    [EVENT_TYPES.TOOL_ERROR]: {
        error: string;
        toolName: string;
        agent: string;
        reasoning?: string;
    };

    [EVENT_TYPES.TOOL_COMPLETED]: {
        toolName: string;
        result: unknown;
        agent: string;
    };

    // === WORKFLOW EVENTS ===
    [EVENT_TYPES.WORKFLOW_STARTED]: {
        workflowName: string;
        input: unknown;
        correlationId?: string;
    };

    [EVENT_TYPES.WORKFLOW_START]: {
        input: unknown;
    };

    [EVENT_TYPES.WORKFLOW_COMPLETED]: {
        workflowName: string;
        result: unknown;
        correlationId?: string;
    };

    [EVENT_TYPES.WORKFLOW_COMPLETE]: {
        result: unknown;
    };

    [EVENT_TYPES.WORKFLOW_FAILED]: {
        workflowName: string;
        error: string;
        correlationId?: string;
    };

    [EVENT_TYPES.WORKFLOW_ERROR]: {
        error: Error;
        step: string;
    };

    [EVENT_TYPES.WORKFLOW_PAUSED]: {
        workflowName: string;
        reason: string;
        snapshotId: string;
    };

    [EVENT_TYPES.WORKFLOW_RESUMED]: {
        workflowName: string;
        snapshotId: string;
    };

    [EVENT_TYPES.WORKFLOW_CANCELED]: {
        workflowName: string;
        reason: string;
        correlationId?: string;
    };

    [EVENT_TYPES.WORKFLOW_RUN]: {
        input: unknown;
    };

    // === CONTEXT EVENTS ===
    [EVENT_TYPES.CONTEXT_CREATED]: {
        executionId: string;
        tenantId: string;
    };

    [EVENT_TYPES.CONTEXT_UPDATED]: {
        executionId: string;
        updates: Record<string, unknown>;
    };

    [EVENT_TYPES.CONTEXT_DESTROYED]: {
        executionId: string;
        reason?: string;
    };

    [EVENT_TYPES.CONTEXT_TIMEOUT]: {
        executionId: string;
        timeoutMs: number;
    };

    // === STATE EVENTS ===
    [EVENT_TYPES.STATE_UPDATED]: {
        namespace: string;
        key: string;
        value: unknown;
    };

    [EVENT_TYPES.STATE_DELETED]: {
        namespace: string;
        key: string;
    };

    // === STEP EVENTS ===
    [EVENT_TYPES.STEP_STARTED]: {
        stepName: string;
        input: unknown;
        correlationId?: string;
    };

    [EVENT_TYPES.STEP_COMPLETED]: {
        stepName: string;
        result: unknown;
        correlationId?: string;
    };

    [EVENT_TYPES.STEP_FAILED]: {
        stepName: string;
        error: string;
        correlationId?: string;
    };

    [EVENT_TYPES.STEP_SKIPPED]: {
        stepName: string;
        reason: string;
        correlationId?: string;
    };

    // === KERNEL EVENTS ===
    [EVENT_TYPES.KERNEL_STARTED]: {
        kernelId: string;
        tenantId: string;
    };

    [EVENT_TYPES.KERNEL_PAUSED]: {
        kernelId: string;
        reason: string;
        snapshotId: string;
    };

    [EVENT_TYPES.KERNEL_RESUMED]: {
        kernelId: string;
        snapshotId: string;
    };

    [EVENT_TYPES.KERNEL_COMPLETED]: {
        kernelId: string;
        result: unknown;
    };

    [EVENT_TYPES.EXECUTION_COMPLETED]: {
        executionId: string;
        result: unknown;
    };

    [EVENT_TYPES.EXECUTION_RUN]: {
        input: unknown;
    };

    [EVENT_TYPES.KERNEL_QUOTA_EXCEEDED]: {
        kernelId: string;
        type: string;
    };

    // === ROUTER EVENTS ===
    [EVENT_TYPES.ROUTER_ROUTE]: {
        routerName: string;
        input: unknown;
        route: string;
        correlationId?: string;
    };

    // === MCP EVENTS ===
    [EVENT_TYPES.MCP_CONNECTED]: {
        threadId: string;
    };

    [EVENT_TYPES.MCP_DISCONNECTED]: {
        threadId: string;
    };

    [EVENT_TYPES.MCP_TOOL_CALLED]: {
        toolName: string;
        input: unknown;
        threadId: string;
        correlationId?: string;
    };

    [EVENT_TYPES.MCP_TOOL_RESULT]: {
        result: unknown;
        toolName: string;
        threadId: string;
        correlationId?: string;
    };

    [EVENT_TYPES.MCP_ERROR]: {
        error: string;
        threadId: string;
        correlationId?: string;
    };

    // === PLANNER EVENTS ===
    [EVENT_TYPES.PLANNER_STARTED]: {
        plannerName: string;
        input: unknown;
        correlationId?: string;
    };

    [EVENT_TYPES.PLANNER_COMPLETED]: {
        plannerName: string;
        result: unknown;
        correlationId?: string;
    };

    [EVENT_TYPES.PLANNER_FAILED]: {
        plannerName: string;
        error: string;
        correlationId?: string;
    };

    [EVENT_TYPES.PLANNER_STEP_COMPLETED]: {
        plannerName: string;
        stepName: string;
        result: unknown;
        correlationId?: string;
    };

    // === ECOSYSTEM EVENTS ===
    [EVENT_TYPES.ECOSYSTEM_DISCOVER]: {
        criteria: {
            capability?: string;
            specialization?: string;
            availability?: boolean;
        };
        results: string[];
        correlationId?: string;
    };

    [EVENT_TYPES.ECOSYSTEM_BROADCAST]: {
        event: string;
        data: unknown;
        recipients?: string[];
        correlationId?: string;
    };

    [EVENT_TYPES.AGENT_DELEGATE]: {
        targetAgent: string;
        input: unknown;
        correlationId?: string;
    };

    // === SYSTEM EVENTS ===
    [EVENT_TYPES.SYSTEM_ERROR]: {
        error: string;
        context?: Record<string, unknown>;
    };

    [EVENT_TYPES.SYSTEM_WARNING]: {
        warning: string;
        context?: Record<string, unknown>;
    };

    [EVENT_TYPES.SYSTEM_INFO]: {
        message: string;
        context?: Record<string, unknown>;
    };

    // === STREAM EVENTS ===
    [EVENT_TYPES.STREAM_ERROR]: {
        originalEvent: Event<EventType>;
        handler: string;
        error: unknown;
        timestamp: number;
        attempt: number;
        recoverable: boolean;
    };

    [EVENT_TYPES.STREAM_BATCH]: {
        events: Event<EventType>[];
        size: number;
    };

    // === ERROR EVENTS ===
    [EVENT_TYPES.ERROR]: {
        originalEvent: Event<EventType>;
        handler: string;
        error: unknown;
        timestamp: number;
        attempt: number;
        recoverable: boolean;
    };

    // === HUMAN INTERVENTION EVENTS ===
    [EVENT_TYPES.HUMAN_INTERVENTION_REQUESTED]: {
        reason: string;
        context: unknown;
        correlationId?: string;
    };

    [EVENT_TYPES.HUMAN_INTERVENTION_COMPLETED]: {
        result: unknown;
        correlationId?: string;
    };

    // === MONITORING EVENTS ===
    [EVENT_TYPES.MEMORY_HEAP]: {
        used: number;
        total: number;
        percentage: number;
    };

    [EVENT_TYPES.MEMORY_UTILIZATION]: {
        percentage: number;
        details: Record<string, number>;
    };

    [EVENT_TYPES.RESOURCES_CONTEXTS]: {
        active: number;
        total: number;
        details: Record<string, number>;
    };

    [EVENT_TYPES.RESOURCES_GENERATORS]: {
        active: number;
        total: number;
        details: Record<string, number>;
    };

    [EVENT_TYPES.PERFORMANCE_EVENT_RATE]: {
        eventsPerSecond: number;
        window: number;
    };

    [EVENT_TYPES.PERFORMANCE_AVG_PROCESSING_TIME]: {
        avgTimeMs: number;
        samples: number;
    };

    [EVENT_TYPES.PERFORMANCE_ERROR_RATE]: {
        errorRate: number;
        totalEvents: number;
        errorEvents: number;
    };

    // === AGENT CALL EVENTS ===
    [EVENT_TYPES.AGENT_CALL]: {
        agentName: string;
        input: unknown;
        correlationId?: string;
    };

    // === TEST EVENTS ===
    [EVENT_TYPES.START]: void;

    [EVENT_TYPES.BENCHMARK]: {
        id: number;
    };

    [EVENT_TYPES.DONE]: void;

    [EVENT_TYPES.HIGH_VOLUME]: {
        id: number;
    };

    [EVENT_TYPES.START_LIFECYCLE]: void;

    [EVENT_TYPES.PROCESS_LIFECYCLE]: {
        id: number;
    };

    [EVENT_TYPES.STOP_LIFECYCLE]: void;

    [EVENT_TYPES.AFTER_STOP_LIFECYCLE]: void;

    // === WORKFLOW ENGINE EVENTS ===
    [EVENT_TYPES.STEP_PREFIX]: {
        stepName: string;
        input: unknown;
        correlationId?: string;
    };

    // === TEST WORKFLOW EVENTS ===
    [EVENT_TYPES.CONCURRENT]: {
        id: string;
        key: string;
    };

    [EVENT_TYPES.METRIC]: {
        id: string;
        key: string;
    };

    [EVENT_TYPES.STEP_EVENT]: {
        stepName: string;
        input: unknown;
    };

    [EVENT_TYPES.WORKFLOW_STEP]: {
        stepName: string;
        input: unknown;
    };

    // === FALLBACK PARA TIPOS DINÂMICOS ===
    [key: string]: unknown;
}

// ============================================================================
// 4️⃣ INTERFACE GENÉRICA DE EVENTO
// ============================================================================

export interface Event<K extends EventType = EventType> {
    readonly id: string;
    readonly type: K;
    readonly data: EventPayloads[K];
    readonly ts: number;
    readonly threadId: string;
    metadata?: {
        correlationId?: string;
        deliveryGuarantee?: 'at-most-once' | 'at-least-once' | 'exactly-once';
        tenantId?: string;
        executionId?: string;
        timestamp?: number;
        [key: string]: unknown;
    };
}

/**
 * Alias para Event genérico (qualquer tipo de evento)
 */
export type AnyEvent = Event<EventType>;

// ============================================================================
// 5️⃣ TIPOS ENHANCED (Centralizados aqui)
// ============================================================================

/**
 * EventDef com tipagem melhorada
 */
export type EventDef<P, K extends EventType> = {
    type: K;
    with(data: P): Event<K>;
    include(event: AnyEvent): event is Event<K>;
};

export type EnhancedEventDef<P, K extends EventType> = EventDef<P, K> & {
    // Funcionalidades adicionais podem ser adicionadas aqui
    validate?(data: P): boolean;
    transform?(data: P): P;
};

export type HandlerBuilder<TEvent extends AnyEvent = AnyEvent> = {
    onSuccess(handler: (event: TEvent) => void): HandlerBuilder<TEvent>;
    onError(handler: (error: Error) => void): HandlerBuilder<TEvent>;
    build(): (event: TEvent) => void;
};

export const ALL_EVENT_TYPES = Object.values(EVENT_TYPES) as EventType[];

export function isValidEventType(type: string): type is EventType {
    return ALL_EVENT_TYPES.includes(type as EventType);
}

export function isEventType<K extends EventType>(
    event: AnyEvent,
    eventType: K,
): event is Event<K> {
    return event.type === eventType;
}

/**
 * Valida se um payload é válido para um evento
 */
export function validateEventPayload(
    payload: unknown,
): payload is Record<string, unknown> {
    return payload !== null && typeof payload === 'object';
}

/**
 * Cria um evento com validação de payload
 */
export function createValidatedEvent<K extends EventType>(
    type: K,
    payload: EventPayloads[K],
    options?: {
        id?: string;
        timestamp?: number;
        correlationId?: string;
        metadata?: Record<string, unknown>;
    },
): Event<K> {
    if (!validateEventPayload(payload)) {
        throw new Error(`Invalid payload for event type: ${type}`);
    }

    return createEvent(type, payload, options);
}

/**
 * Factory para criar eventos tipados com opções avançadas
 */
export function createEvent<K extends EventType>(
    type: K,
    data?: EventPayloads[K],
    options?: {
        id?: string;
        timestamp?: number;
        threadId?: string;
    },
): Event<K> {
    const eventId = options?.id || IdGenerator.callId();

    return {
        id: eventId,
        type,
        data: data as EventPayloads[K],
        ts: options?.timestamp || Date.now(),
        threadId: options?.threadId || IdGenerator.callId(),
    };
}

// ============================================================================
// 7️⃣ TYPE GUARDS ESPECÍFICOS
// ============================================================================

/**
 * Type guards para eventos específicos
 */
export const isAgentCompletedEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.AGENT_COMPLETED> =>
    event.type === EVENT_TYPES.AGENT_COMPLETED;

export const isToolResultEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.TOOL_RESULT> =>
    event.type === EVENT_TYPES.TOOL_RESULT;

export const isAgentErrorEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.AGENT_ERROR> =>
    event.type === EVENT_TYPES.AGENT_ERROR;

export const isToolErrorEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.TOOL_ERROR> =>
    event.type === EVENT_TYPES.TOOL_ERROR;

export const isWorkflowCompletedEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.WORKFLOW_COMPLETED> =>
    event.type === EVENT_TYPES.WORKFLOW_COMPLETED;

export const isWorkflowErrorEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.WORKFLOW_ERROR> =>
    event.type === EVENT_TYPES.WORKFLOW_ERROR;

// === AGENT LIFECYCLE TYPE GUARDS ===

export const isAgentLifecycleStartedEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.AGENT_LIFECYCLE_STARTED> =>
    event.type === EVENT_TYPES.AGENT_LIFECYCLE_STARTED;

export const isAgentLifecycleStoppedEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.AGENT_LIFECYCLE_STOPPED> =>
    event.type === EVENT_TYPES.AGENT_LIFECYCLE_STOPPED;

export const isAgentLifecyclePausedEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.AGENT_LIFECYCLE_PAUSED> =>
    event.type === EVENT_TYPES.AGENT_LIFECYCLE_PAUSED;

export const isAgentLifecycleResumedEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.AGENT_LIFECYCLE_RESUMED> =>
    event.type === EVENT_TYPES.AGENT_LIFECYCLE_RESUMED;

export const isAgentLifecycleScheduledEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.AGENT_LIFECYCLE_SCHEDULED> =>
    event.type === EVENT_TYPES.AGENT_LIFECYCLE_SCHEDULED;

export const isAgentLifecycleErrorEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.AGENT_LIFECYCLE_ERROR> =>
    event.type === EVENT_TYPES.AGENT_LIFECYCLE_ERROR;

export const isAgentLifecycleStatusChangedEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.AGENT_LIFECYCLE_STATUS_CHANGED> =>
    event.type === EVENT_TYPES.AGENT_LIFECYCLE_STATUS_CHANGED;

// === MCP TYPE GUARDS ===

export const isMcpConnectedEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.MCP_CONNECTED> =>
    event.type === EVENT_TYPES.MCP_CONNECTED;

export const isMcpDisconnectedEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.MCP_DISCONNECTED> =>
    event.type === EVENT_TYPES.MCP_DISCONNECTED;

export const isMcpToolCalledEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.MCP_TOOL_CALLED> =>
    event.type === EVENT_TYPES.MCP_TOOL_CALLED;

export const isMcpToolResultEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.MCP_TOOL_RESULT> =>
    event.type === EVENT_TYPES.MCP_TOOL_RESULT;

export const isMcpErrorEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.MCP_ERROR> =>
    event.type === EVENT_TYPES.MCP_ERROR;

// === PLANNER TYPE GUARDS ===

export const isPlannerStartedEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.PLANNER_STARTED> =>
    event.type === EVENT_TYPES.PLANNER_STARTED;

export const isPlannerCompletedEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.PLANNER_COMPLETED> =>
    event.type === EVENT_TYPES.PLANNER_COMPLETED;

export const isPlannerFailedEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.PLANNER_FAILED> =>
    event.type === EVENT_TYPES.PLANNER_FAILED;

export const isPlannerStepCompletedEvent = (
    event: AnyEvent,
): event is Event<typeof EVENT_TYPES.PLANNER_STEP_COMPLETED> =>
    event.type === EVENT_TYPES.PLANNER_STEP_COMPLETED;

// ============================================================================
// 8️⃣ UTILITÁRIOS PARA EVENTOS DE LIFECYCLE
// ============================================================================

/**
 * Utilitários para criar eventos de lifecycle de agentes
 */
export const agentLifecycleEvents = {
    /**
     * Cria evento de agente iniciado
     */
    started: (
        data: EventPayloads[typeof EVENT_TYPES.AGENT_LIFECYCLE_STARTED],
    ) => createEvent(EVENT_TYPES.AGENT_LIFECYCLE_STARTED, data),

    /**
     * Cria evento de agente parado
     */
    stopped: (
        data: EventPayloads[typeof EVENT_TYPES.AGENT_LIFECYCLE_STOPPED],
    ) => createEvent(EVENT_TYPES.AGENT_LIFECYCLE_STOPPED, data),

    /**
     * Cria evento de agente pausado
     */
    paused: (data: EventPayloads[typeof EVENT_TYPES.AGENT_LIFECYCLE_PAUSED]) =>
        createEvent(EVENT_TYPES.AGENT_LIFECYCLE_PAUSED, data),

    /**
     * Cria evento de agente resumido
     */
    resumed: (
        data: EventPayloads[typeof EVENT_TYPES.AGENT_LIFECYCLE_RESUMED],
    ) => createEvent(EVENT_TYPES.AGENT_LIFECYCLE_RESUMED, data),

    /**
     * Cria evento de agente agendado
     */
    scheduled: (
        data: EventPayloads[typeof EVENT_TYPES.AGENT_LIFECYCLE_SCHEDULED],
    ) => createEvent(EVENT_TYPES.AGENT_LIFECYCLE_SCHEDULED, data),

    /**
     * Cria evento de erro no lifecycle
     */
    error: (data: EventPayloads[typeof EVENT_TYPES.AGENT_LIFECYCLE_ERROR]) =>
        createEvent(EVENT_TYPES.AGENT_LIFECYCLE_ERROR, data),

    /**
     * Cria evento de mudança de status
     */
    statusChanged: (
        data: EventPayloads[typeof EVENT_TYPES.AGENT_LIFECYCLE_STATUS_CHANGED],
    ) => createEvent(EVENT_TYPES.AGENT_LIFECYCLE_STATUS_CHANGED, data),
};

//logging-types.ts
/**
 * Logger configuration schema and type
 */
export const loggerConfigSchema = z.object({
    minLevel: logLevelSchema.default('info'),
    enableConsole: z.boolean().default(true),
    enableTelemetry: z.boolean().default(false),
    context: z.record(z.string(), z.unknown()).optional(),
});
export type LoggerConfig = z.infer<typeof loggerConfigSchema>;

/**
 * Log entry schema and type
 */
export const logEntrySchema = z.object({
    timestamp: z.string().datetime(),
    level: logLevelSchema,
    message: z.string(),
    context: z.record(z.string(), z.unknown()).optional(),
    error: z
        .object({
            name: z.string().optional(),
            message: z.string().optional(),
            stack: z.string().optional(),
            cause: z.unknown().optional(),
        })
        .optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});
export type LogEntry = z.infer<typeof logEntrySchema>;

/**
 * Logger interface
 * Defines the contract for a logger implementation
 */
export interface ILogger {
    debug(message: string, data?: Record<string, unknown>): void;
    info(message: string, data?: Record<string, unknown>): void;
    warn(message: string, data?: Record<string, unknown>): void;
    error(
        message: string,
        error?: Error | unknown,
        data?: Record<string, unknown>,
    ): void;
    withContext(context: Record<string, unknown>): ILogger;
}

/**
 * Log transport interface
 * Defines the contract for a log transport implementation
 */
export interface ILogTransport {
    log(entry: LogEntry): void;
    flush(): Promise<void>;
}

/**
 * Console log transport options schema and type
 */
export const consoleTransportOptionsSchema = z.object({
    format: z.enum(['simple', 'json', 'pretty']).default('simple'),
    colors: z.boolean().default(true),
});
export type ConsoleTransportOptions = z.infer<
    typeof consoleTransportOptionsSchema
>;

/**
 * OpenTelemetry log transport options schema and type
 */
export const otelTransportOptionsSchema = z.object({
    serviceName: z.string(),
    serviceVersion: z.string().optional(),
    resourceAttributes: z.record(z.string(), z.unknown()).optional(),
});
export type OtelTransportOptions = z.infer<typeof otelTransportOptionsSchema>;

// memory-types.ts

/**
 * Memory ID schema and type
 * Used to identify a memory item
 */
export const memoryIdSchema = z.string().min(1);
// MemoryId moved to base-types.ts

/**
 * Memory item schema and type
 * Represents a single memory item
 */
export const memoryItemSchema = z.object({
    id: memoryIdSchema,
    key: z.string(),
    value: z.unknown(),
    type: z.string().optional(),
    timestamp: z.number(),
    expireAt: z.number().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    entityId: entityIdSchema.optional(),
    sessionId: sessionIdSchema.optional(),
    tenantId: z.string().optional(),
    contextId: contextIdSchema.optional(),
});
export type MemoryItem = z.infer<typeof memoryItemSchema>;

/**
 * Memory scope schema and type
 * Defines the scope of a memory item
 */
export const memoryScopeSchema = z.enum([
    'global',
    'tenant',
    'entity',
    'session',
    'context',
]);
export type MemoryScope = z.infer<typeof memoryScopeSchema>;

/**
 * Memory query schema and type
 * Used to query memory items
 */
export const memoryQuerySchema = z.object({
    key: z.string().optional(),
    keyPattern: z.string().optional(),
    type: z.string().optional(),
    scope: memoryScopeSchema.optional(),
    entityId: entityIdSchema.optional(),
    sessionId: sessionIdSchema.optional(),
    tenantId: z.string().optional(),
    contextId: contextIdSchema.optional(),
    fromTimestamp: z.number().optional(),
    toTimestamp: z.number().optional(),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional(),
    sortBy: z.string().optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
});
export type MemoryQuery = z.infer<typeof memoryQuerySchema>;

/**
 * Memory store options schema and type
 * Options for configuring a memory store
 */
export const memoryStoreOptionsSchema = z.object({
    // Default TTL for memory items in milliseconds
    defaultTtlMs: z.number().int().positive().optional(),
    // Storage backend configuration
    storage: z
        .object({
            type: z.enum(['memory', 'custom']),
            config: z.record(z.string(), z.unknown()).optional(),
        })
        .optional(),
});
export type MemoryStoreOptions = z.infer<typeof memoryStoreOptionsSchema>;

/**
 * Memory vector schema and type
 * Represents a vector in memory for semantic search
 */
export const memoryVectorSchema = z.object({
    id: memoryIdSchema,
    vector: z.array(z.number()),
    text: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    timestamp: z.number(),
    entityId: entityIdSchema.optional(),
    sessionId: sessionIdSchema.optional(),
    tenantId: z.string().optional(),
    contextId: contextIdSchema.optional(),
});
export type MemoryVector = z.infer<typeof memoryVectorSchema>;

/**
 * Memory vector query schema and type
 * Used for semantic search in memory
 */
export const memoryVectorQuerySchema = z.object({
    vector: z.array(z.number()),
    text: z.string().optional(),
    topK: z.number().int().positive(),
    minScore: z.number().optional(),
    filter: z
        .object({
            entityId: entityIdSchema.optional(),
            sessionId: sessionIdSchema.optional(),
            tenantId: z.string().optional(),
            contextId: contextIdSchema.optional(),
            metadata: z.record(z.string(), z.unknown()).optional(),
        })
        .optional(),
});
export type MemoryVectorQuery = z.infer<typeof memoryVectorQuerySchema>;

/**
 * Memory vector store options schema and type
 * Options for configuring a vector store
 */
export const memoryVectorStoreOptionsSchema = z.object({
    // Dimensions of vectors
    dimensions: z.number().int().positive(),
    // Distance metric for similarity search
    distanceMetric: z.enum(['cosine', 'euclidean', 'dot']).optional(),
    // Storage backend configuration
    storage: z
        .object({
            type: z.enum(['memory', 'pinecone', 'qdrant', 'custom']),
            config: z.record(z.string(), z.unknown()).optional(),
        })
        .optional(),
});
export type MemoryVectorStoreOptions = z.infer<
    typeof memoryVectorStoreOptionsSchema
>;

export const memoryVectorSearchResultSchema = z.object({
    id: memoryIdSchema,
    score: z.number(),
    vector: z.array(z.number()).optional(),
    text: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    timestamp: z.number(),
    entityId: entityIdSchema.optional(),
    sessionId: sessionIdSchema.optional(),
    tenantId: z.string().optional(),
    contextId: contextIdSchema.optional(),
});
export type MemoryVectorSearchResult = z.infer<
    typeof memoryVectorSearchResultSchema
>;

/**
 * Memory manager options schema and type
 * Options for configuring a memory manager
 */
export const memoryManagerOptionsSchema = z.object({
    // Store options
    storeOptions: memoryStoreOptionsSchema.optional(),
    // Vector store options
    vectorStoreOptions: memoryVectorStoreOptionsSchema.optional(),
    // Whether to automatically vectorize text items
    autoVectorizeText: z.boolean().optional(),
    // Default scope for memory items
    defaultScope: memoryScopeSchema.optional(),
});
export type MemoryManagerOptions = z.infer<typeof memoryManagerOptionsSchema>;

// planning-shared.ts
export const UNIFIED_STATUS = {
    // Estados básicos
    PENDING: 'pending',
    EXECUTING: 'executing',
    COMPLETED: 'completed',
    FAILED: 'failed',

    // Estados de controle
    REPLANNING: 'replanning',
    WAITING_INPUT: 'waiting_input',
    PAUSED: 'paused',
    CANCELLED: 'cancelled',
    SKIPPED: 'skipped',

    // Estados ReWOO
    REWRITING: 'rewriting',
    OBSERVING: 'observing',
    PARALLEL: 'parallel',

    // Estados de problema
    STAGNATED: 'stagnated',
    TIMEOUT: 'timeout',
    DEADLOCK: 'deadlock',

    // Estados de resposta final
    FINAL_ANSWER_RESULT: 'final_answer_result',
} as const;

export type UnifiedStatus =
    (typeof UNIFIED_STATUS)[keyof typeof UNIFIED_STATUS];

/**
 * Status transitions validation
 */
export const VALID_STATUS_TRANSITIONS: Record<UnifiedStatus, UnifiedStatus[]> =
    {
        [UNIFIED_STATUS.PENDING]: [
            UNIFIED_STATUS.EXECUTING,
            UNIFIED_STATUS.CANCELLED,
            UNIFIED_STATUS.SKIPPED,
        ],
        [UNIFIED_STATUS.EXECUTING]: [
            UNIFIED_STATUS.COMPLETED,
            UNIFIED_STATUS.FAILED,
            UNIFIED_STATUS.REPLANNING,
            UNIFIED_STATUS.WAITING_INPUT,
            UNIFIED_STATUS.PAUSED,
            UNIFIED_STATUS.CANCELLED,
            UNIFIED_STATUS.REWRITING,
            UNIFIED_STATUS.OBSERVING,
            UNIFIED_STATUS.PARALLEL,
            UNIFIED_STATUS.STAGNATED,
            UNIFIED_STATUS.TIMEOUT,
            UNIFIED_STATUS.DEADLOCK,
        ],
        [UNIFIED_STATUS.COMPLETED]: [], // Estado final
        [UNIFIED_STATUS.FAILED]: [
            UNIFIED_STATUS.REPLANNING,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.REPLANNING]: [
            UNIFIED_STATUS.EXECUTING,
            UNIFIED_STATUS.FAILED,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.WAITING_INPUT]: [
            UNIFIED_STATUS.EXECUTING,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.PAUSED]: [
            UNIFIED_STATUS.EXECUTING,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.CANCELLED]: [], // Estado final
        [UNIFIED_STATUS.SKIPPED]: [], // Estado final
        [UNIFIED_STATUS.REWRITING]: [
            UNIFIED_STATUS.EXECUTING,
            UNIFIED_STATUS.FAILED,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.OBSERVING]: [
            UNIFIED_STATUS.EXECUTING,
            UNIFIED_STATUS.FAILED,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.PARALLEL]: [
            UNIFIED_STATUS.EXECUTING,
            UNIFIED_STATUS.FAILED,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.STAGNATED]: [
            UNIFIED_STATUS.EXECUTING,
            UNIFIED_STATUS.FAILED,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.TIMEOUT]: [
            UNIFIED_STATUS.REPLANNING,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.DEADLOCK]: [
            UNIFIED_STATUS.REPLANNING,
            UNIFIED_STATUS.CANCELLED,
        ],
        [UNIFIED_STATUS.FINAL_ANSWER_RESULT]: [], // Estado final - resposta sintetizada
    };

/**
 * Validate status transition
 */
export function isValidStatusTransition(
    from: UnifiedStatus,
    to: UnifiedStatus,
): boolean {
    return VALID_STATUS_TRANSITIONS[from].includes(to);
}
/**
 * Unified PlanStep interface (consolidates all conflicting definitions)
 */
export interface PlanStep {
    id: string;
    description: string;
    type?:
        | 'action'
        | 'decision'
        | 'verification'
        | 'delegation'
        | 'aggregation'
        | 'checkpoint';
    // Execution
    tool?: string;
    agent?: string;
    arguments?: Record<string, unknown>;

    // Dependencies
    dependencies?: string[];
    dependents?: string[];

    // Execution control
    status: StepStatus;
    parallel?: boolean;
    optional?: boolean;
    retry?: number;
    retryCount?: number;
    maxRetries?: number;

    // Results & timing
    result?: unknown;
    error?: string;
    startTime?: number;
    endTime?: number;
    duration?: number;

    // Metadata
    reasoning?: string;
    confidence?: number;
    metadata?: Record<string, unknown>;
}

/**
 * Execution plan interface
 */
export interface ExecutionPlan {
    id: string;
    strategy: string;
    version?: string;
    goal: string;
    reasoning: string;
    steps: PlanStep[];
    status: string;
    currentStepIndex: number;
    signals?: PlanSignals;
    createdAt: number;
    updatedAt: number;
    executionStartTime?: number;
    executionEndTime?: number;
    metadata?: Record<string, unknown>;
}

/**
 * Step execution result
 */
export interface StepExecutionResult {
    stepId: string;
    step: PlanStep;
    success: boolean;
    result?: unknown;
    error?: string;
    executedAt: number;
    duration: number;
    retryCount?: number;
}

/**
 * Plan execution result types
 */
export type PlanExecutionResultType =
    | 'execution_complete'
    | 'needs_replan'
    | 'deadlock'
    | 'cancelled'
    | 'timeout'
    | 'budget_exceeded';

/**
 * Complete plan execution result
 */
export interface PlanExecutionResult {
    type: PlanExecutionResultType;
    planId: string;
    strategy: string;
    totalSteps: number;
    executedSteps: StepExecutionResult[];
    successfulSteps: string[];
    failedSteps: string[];
    skippedSteps: string[];
    hasSignalsProblems: boolean;
    signals?: PlanSignals;
    executionTime: number;
    feedback: string;
    confidence?: number;
    replanContext?: ReplanContext;
}

/**
 * Replan policy configuration
 */
export interface ReplanPolicyConfig {
    maxReplans?: number; // ✅ SIMPLE: Unified replan limit
    toolUnavailable?: 'replan' | 'ask_user' | 'fail';
}

export function getReadySteps(plan: ExecutionPlan): PlanStep[] {
    return plan.steps.filter((step) => {
        if (step.status !== UNIFIED_STATUS.PENDING) return false;
        if (!step.dependencies || step.dependencies.length === 0) return true;

        // ✅ CORREÇÃO: Verificar se alguma dependência falhou
        return step.dependencies.every((depId) => {
            const depStep = plan.steps.find((s) => s.id === depId);
            // Se a dependência falhou, este step não pode ser executado
            if (depStep?.status === UNIFIED_STATUS.FAILED) {
                return false;
            }
            return depStep?.status === UNIFIED_STATUS.COMPLETED;
        });
    });
}

/**
 * Structured replan context for planning optimization
 */
export interface PlanExecutionData {
    plan: {
        id: string;
        goal: string;
        strategy?: string;
        totalSteps?: number;
        steps?: unknown[];
    };
    executionData: {
        toolsThatWorked?: unknown[];
        toolsThatFailed?: unknown[];
        toolsNotExecuted?: unknown[];
    };
    signals?: PlanSignals;
}

export interface ReplanContext {
    isReplan: boolean;
    executedPlan: PlanExecutionData;
    planHistory?: PlanExecutionData[];
}

export function isExecutePlanAction(action: AgentAction | unknown): boolean {
    return (
        typeof action === 'object' &&
        action !== null &&
        'type' in action &&
        action.type === 'execute_plan'
    );
}

export function createStepId(name: string): string {
    return name.startsWith('step-') ? name : `step-${name}`;
}

export function createPlanId(name: string): string {
    return name.startsWith('plan-') ? name : `plan-${name}`;
}

// retry-types.ts
/**
 * Retry options schema and type
 */
export const retryOptionsSchema = z.object({
    maxRetries: z.number().int().nonnegative().default(2),
    initialDelayMs: z.number().int().positive().default(100),
    maxDelayMs: z.number().int().positive().default(2000),
    maxTotalMs: z.number().int().positive().default(60_000),
    backoffFactor: z.number().positive().default(2),
    jitter: z.boolean().default(true),
    retryableErrorCodes: z
        .array(
            z.enum([
                'NETWORK_ERROR',
                'TIMEOUT_ERROR',
                'TIMEOUT_EXCEEDED',
                'DEPENDENCY_ERROR',
            ] as const),
        )
        .default(['NETWORK_ERROR', 'TIMEOUT_ERROR', 'TIMEOUT_EXCEEDED']),
    retryableStatusCodes: z
        .array(z.number().int())
        .default([408, 429, 500, 502, 503, 504]),
    retryPredicate: z.instanceof(Function).optional(),
});
export type RetryOptions = z.infer<typeof retryOptionsSchema>;

/**
 * Retry state schema and type
 */
export const retryStateSchema = z.object({
    attempt: z.number().int().nonnegative(),
    maxRetries: z.number().int().nonnegative(),
    delayMs: z.number().int().nonnegative(),
    error: z.unknown().optional(),
    startTime: z.number(),
    totalElapsedMs: z.number().nonnegative(),
});
export type RetryState = z.infer<typeof retryStateSchema>;

/**
 * Retry result schema and type
 */
export const retryResultSchema = z.object({
    success: z.boolean(),
    value: z.unknown().optional(),
    error: z.unknown().optional(),
    attempts: z.number().int().positive(),
    totalElapsedMs: z.number().nonnegative(),
});
export type RetryResult<T = unknown> = z.infer<typeof retryResultSchema> & {
    value?: T;
};

/**
 * Retry event type schema and type
 */
export const retryEventTypeSchema = z.enum([
    'RETRY_STARTED',
    'RETRY_ATTEMPT',
    'RETRY_SUCCEEDED',
    'RETRY_FAILED',
    'RETRY_ABORTED',
]);
export type RetryEventType = z.infer<typeof retryEventTypeSchema>;

/**
 * Retry event schema and type
 */
export const retryEventSchema = z.object({
    type: retryEventTypeSchema,
    timestamp: z.number(),
    operationName: z.string(),
    attempt: z.number().int().nonnegative(),
    maxRetries: z.number().int().nonnegative(),
    delayMs: z.number().int().nonnegative().optional(),
    error: z
        .object({
            message: z.string().optional(),
            code: z.string().optional(),
            stack: z.string().optional(),
        })
        .optional(),
    totalElapsedMs: z.number().nonnegative().optional(),
});
export type RetryEvent = z.infer<typeof retryEventSchema>;

// state-types.ts
/**
 * State ID schema and type
 * Used to identify a state object
 */
export const stateIdSchema = z.string().min(1);
// StateId moved to base-types.ts

/**
 * State value schema and type
 * Represents any value that can be stored in state
 */
export const stateValueSchema = z.unknown();
export type StateValue = z.infer<typeof stateValueSchema>;

/**
 * State entry schema and type
 * Represents a single state entry with metadata
 */
export const stateEntrySchema = z.object({
    stateId: stateIdSchema,
    key: z.string(),
    value: stateValueSchema,
    version: z.number().int().nonnegative(),
    timestamp: z.number(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});
export type StateEntry = z.infer<typeof stateEntrySchema>;

/**
 * State scope schema and type
 * Defines the scope of a state entry
 */
export const stateScopeSchema = z.enum([
    'global',
    'tenant',
    'entity',
    'session',
    'context',
]);
export type StateScope = z.infer<typeof stateScopeSchema>;

/**
 * State reference schema and type
 * A reference to a state entry
 */
export const stateReferenceSchema = z.object({
    scope: stateScopeSchema,
    key: z.string(),
    tenantId: z.string().optional(),
    entityId: entityIdSchema.optional(),
    sessionId: sessionIdSchema.optional(),
    contextId: contextIdSchema.optional(),
});
export type StateReference = z.infer<typeof stateReferenceSchema>;

/**
 * State query schema and type
 * Used to query state entries
 */
export const stateQuerySchema = z.object({
    scope: stateScopeSchema.optional(),
    keyPattern: z.string().optional(),
    tenantId: z.string().optional(),
    entityId: entityIdSchema.optional(),
    sessionId: sessionIdSchema.optional(),
    contextId: contextIdSchema.optional(),
    fromTimestamp: z.number().optional(),
    toTimestamp: z.number().optional(),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional(),
});
export type StateQuery = z.infer<typeof stateQuerySchema>;

/**
 * State update schema and type
 * Used to update state entries
 */
export const stateUpdateSchema = z.object({
    key: z.string(),
    value: stateValueSchema,
    scope: stateScopeSchema.optional().default('context'),
    tenantId: z.string().optional(),
    entityId: entityIdSchema.optional(),
    sessionId: sessionIdSchema.optional(),
    contextId: contextIdSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    // If provided, the update will only succeed if the current version matches
    expectedVersion: z.number().int().nonnegative().optional(),
});
export type StateUpdate = z.infer<typeof stateUpdateSchema>;

export const stateUpdateResultSchema = z.object({
    success: z.boolean(),
    stateId: stateIdSchema.optional(),
    key: z.string(),
    newVersion: z.number().int().nonnegative().optional(),
    error: z.string().optional(),
});
export type StateUpdateResult = z.infer<typeof stateUpdateResultSchema>;

/**
 * State delete schema and type
 * Used to delete state entries
 */
export const stateDeleteSchema = z.object({
    key: z.string(),
    scope: stateScopeSchema.optional().default('context'),
    tenantId: z.string().optional(),
    entityId: entityIdSchema.optional(),
    sessionId: sessionIdSchema.optional(),
    contextId: contextIdSchema.optional(),
    // If provided, the delete will only succeed if the current version matches
    expectedVersion: z.number().int().nonnegative().optional(),
});
export type StateDelete = z.infer<typeof stateDeleteSchema>;

export const stateDeleteResultSchema = z.object({
    success: z.boolean(),
    key: z.string(),
    error: z.string().optional(),
});
export type StateDeleteResult = z.infer<typeof stateDeleteResultSchema>;

/**
 * State manager options schema and type
 * Options for configuring a state manager
 */
export const stateManagerOptionsSchema = z.object({
    // Default TTL for state entries in milliseconds
    defaultTtlMs: z.number().int().positive().optional(),
    // Whether to use optimistic locking for updates
    optimisticLocking: z.boolean().optional(),
    // Storage backend configuration
    storage: z
        .object({
            type: z.enum(['memory', 'custom']),
            config: z.record(z.string(), z.unknown()).optional(),
        })
        .optional(),
});
export type StateManagerOptions = z.infer<typeof stateManagerOptionsSchema>;

// storage-types.ts
/**
 * @module core/types/storage-types
 * @description Unified storage types and enums
 */

/**
 * Convert OrchestrationConfig storage type to adapter type
 */
export function toAdapterType(storageType: StorageEnum): StorageEnum {
    switch (storageType) {
        case StorageEnum.INMEMORY:
            return StorageEnum.INMEMORY;
        case StorageEnum.MONGODB:
            return StorageEnum.MONGODB;
        default:
            return StorageEnum.INMEMORY;
    }
}

/**
 * Convert string to adapter type (with fallback)
 */
export function stringToAdapterType(type: string): StorageEnum {
    switch (type) {
        case 'memory':
            return StorageEnum.INMEMORY;
        case 'mongodb':
            return StorageEnum.MONGODB;

        case 'memory':
            return StorageEnum.INMEMORY;
        default:
            return StorageEnum.INMEMORY;
    }
}

// tool-types.ts
// ===== TOOL IDENTITY TYPES =====

/**
 * Tool ID schema for validation - uses branded type
 */
export const toolIdSchema = z.string().min(1);
export type ToolIdSchema = z.infer<typeof toolIdSchema>;
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

    // === JSON SCHEMA (GERADO AUTOMATICAMENTE) ===
    /** JSON Schema gerado automaticamente do Zod para LLMs */
    inputJsonSchema?: ToolJSONSchema;

    outputSchema?: z.ZodSchema<TOutput>;
    outputJsonSchema?: ToolJSONSchema;

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
    outputSchema?: Record<string, unknown>;
};

/**
 * Metadata estruturada da tool para planners
 */
export interface ToolMetadataForPlanner {
    name: string;
    description: string;

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

    outputSchema?: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
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

export interface ToolResult<TOutput = unknown> {
    type: 'tool_result';
    callId: string;
    toolName: string;
    result?: TOutput;
    error?: string;
    timestamp: number;
    duration: number;
    content: string;
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

    const outputJsonSchema = config.outputSchema
        ? zodToJSONSchema(config.outputSchema, config.name, config.description)
        : undefined;

    return {
        name: config.name,
        description: config.description,
        execute: config.execute,
        inputSchema: config.inputSchema,
        inputJsonSchema: jsonSchema,
        outputSchema: config.outputSchema,
        outputJsonSchema: outputJsonSchema,
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

// validation.ts
// ──────────────────────────────────────────────────────────────────────────────
// 🎯 VALIDATION SCHEMAS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Tool ID validation schema
 */
export const toolIdValidationSchema = z.string().min(1).max(100);

/**
 * Agent ID validation schema
 */
export const agentIdValidationSchema = z.string().min(1).max(100);

/**
 * Execution ID validation schema
 */
export const executionIdValidationSchema = z.string().min(1).max(100);

/**
 * Tenant ID validation schema
 */
export const tenantIdValidationSchema = z.string().min(1).max(100);

/**
 * Correlation ID validation schema
 */
export const correlationIdValidationSchema = z.string().min(1).max(100);

/**
 * Plan step parameters validation schema
 */
export const planStepParametersSchema = z.object({
    tool: z
        .object({
            input: z.unknown().optional(),
            options: z.record(z.string(), z.unknown()).optional(),
            timeout: z.number().positive().optional(),
            retry: z.number().nonnegative().optional(),
        })
        .optional(),
    agent: z
        .object({
            input: z.unknown().optional(),
            context: z.record(z.string(), z.unknown()).optional(),
            options: z.record(z.string(), z.unknown()).optional(),
            timeout: z.number().positive().optional(),
        })
        .optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
});

// ✅ Zod v4: Novos recursos para validação avançada
export const enhancedValidationSchema = z.object({
    // ✅ z.preprocess() para limpeza automática
    email: z.preprocess(
        (val) => (typeof val === 'string' ? val.toLowerCase().trim() : val),
        z.string().email(),
    ),

    // ✅ z.transform() para conversão automática
    age: z.number().transform((val) => Math.floor(val)),

    // ✅ z.coerce() para conversão automática de tipos
    userId: z.coerce.number().positive(),
    isActive: z.coerce.boolean(),

    // ✅ z.nullish() para valores null/undefined
    optionalField: z.string().nullish(),

    // ✅ z.brand() para tipos branded (quando necessário)
    tenantId: z.string().brand<'TenantId'>(),
});

// ✅ Zod v4: Validação customizada mais robusta
export const customValidationSchema = z
    .object({
        input: z.unknown().optional(),
        options: z.record(z.string(), z.unknown()).optional(),
    })
    .refine(
        (data) => {
            // ✅ Validação customizada mais performática
            return (
                data.input !== undefined ||
                Object.keys(data.options || {}).length > 0
            );
        },
        {
            message: 'Either input or options must be provided',
            path: ['input'], // ✅ Path específico para erro
        },
    );

// ✅ Zod v4: Validação condicional
export const conditionalValidationSchema = z
    .object({
        type: z.enum(['user', 'admin']),
        permissions: z.array(z.string()).optional(),
    })
    .refine(
        (data) => {
            if (data.type === 'admin') {
                return data.permissions && data.permissions.length > 0;
            }
            return true;
        },
        {
            message: 'Admin users must have permissions',
            path: ['permissions'],
        },
    );

// ✅ Zod v4: Validação cross-field
export const crossFieldValidationSchema = z
    .object({
        startDate: z.date(),
        endDate: z.date(),
        custom: z.record(z.string(), z.unknown()).optional(),
    })
    .refine((data) => data.endDate > data.startDate, {
        message: 'End date must be after start date',
        path: ['endDate'],
    });

// ──────────────────────────────────────────────────────────────────────────────
// 🔍 VALIDATION FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Validates if a value is a valid ToolId
 */
export function validateToolId(id: unknown): id is ToolId {
    return toolIdValidationSchema.safeParse(id).success;
}

/**
 * Validates if a value is a valid AgentId
 */
export function validateAgentId(id: unknown): id is AgentId {
    return agentIdValidationSchema.safeParse(id).success;
}

/**
 * Validates if a value is a valid ExecutionId
 */
export function validateExecutionId(id: unknown): id is string {
    return executionIdValidationSchema.safeParse(id).success;
}

/**
 * Validates if a value is a valid TenantId
 */
export function validateTenantId(id: unknown): id is string {
    return tenantIdValidationSchema.safeParse(id).success;
}

/**
 * Validates if a value is a valid CorrelationId
 */
export function validateCorrelationId(id: unknown): id is string {
    return correlationIdValidationSchema.safeParse(id).success;
}

/**
 * Validate plan step parameters
 */
export function validatePlanStepParameters(params: unknown): boolean {
    return planStepParametersSchema.safeParse(params).success;
}

/**
 * Validate that all required fields are present
 */
export function validateRequiredFields<T extends Record<string, unknown>>(
    obj: T,
    requiredFields: (keyof T)[],
): boolean {
    return requiredFields.every(
        (field) => obj[field] !== undefined && obj[field] !== null,
    );
}

/**
 * Type guard for checking if an object has specific properties
 */
export function hasProperties<
    T extends Record<string, unknown>,
    K extends keyof T,
>(obj: T, properties: K[]): obj is T & Required<Pick<T, K>> {
    return properties.every((prop) => prop in obj && obj[prop] !== undefined);
}

// ──────────────────────────────────────────────────────────────────────────────
// 🛡️ RUNTIME TYPE CHECKS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Runtime type checking utilities
 */
export const typeChecks = {
    /**
     * Check if value is a valid string ID
     */
    isValidId: (value: unknown): value is string => {
        return (
            typeof value === 'string' && value.length > 0 && value.length <= 100
        );
    },

    /**
     * Check if value is a valid object
     */
    isValidObject: (value: unknown): value is Record<string, unknown> => {
        return (
            typeof value === 'object' && value !== null && !Array.isArray(value)
        );
    },

    /**
     * Check if value is a valid array
     */
    isValidArray: (value: unknown): value is unknown[] => {
        return Array.isArray(value);
    },

    /**
     * Check if value is a valid function
     */
    isValidFunction: (
        value: unknown,
    ): value is (...args: unknown[]) => unknown => {
        return typeof value === 'function';
    },

    /**
     * Check if value is a valid number
     */
    isValidNumber: (value: unknown): value is number => {
        return typeof value === 'number' && !isNaN(value);
    },

    /**
     * Check if value is a valid boolean
     */
    isValidBoolean: (value: unknown): value is boolean => {
        return typeof value === 'boolean';
    },
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// 📊 VALIDATION RESULTS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Validation result with detailed error information
 */
export interface ValidationResult<T = unknown> {
    isValid: boolean;
    value?: T;
    errors: string[];
    warnings: string[];
}

/**
 * Create a validation result
 */
export function createValidationResult<T>(
    isValid: boolean,
    value?: T,
    errors: string[] = [],
    warnings: string[] = [],
): ValidationResult<T> {
    return { isValid, value, errors, warnings };
}

/**
 * Combine multiple validation results
 */
export function combineValidationResults(
    ...results: ValidationResult[]
): ValidationResult {
    const isValid = results.every((r) => r.isValid);
    const errors = results.flatMap((r) => r.errors);
    const warnings = results.flatMap((r) => r.warnings);

    return createValidationResult(isValid, undefined, errors, warnings);
}

// ===== UTILITY FUNCTIONS =====

/**
 * Creates a safe ID by validating and converting to branded type
 */
export function createToolId(id: string): ToolId | null {
    return validateToolId(id) ? (id as ToolId) : null;
}

/**
 * Creates a safe AgentId by validating and converting to branded type
 */
export function createAgentId(id: string): AgentId | null {
    return validateAgentId(id) ? (id as AgentId) : null;
}

//workflow-types.ts

// ===== WORKFLOW IDENTITY TYPES =====

/**
 * Workflow ID - identifies a specific workflow definition
 */
export const workflowIdSchema = z.string().min(1);
// WorkflowId moved to base-types.ts

/**
 * Step ID - identifies a specific step in a workflow
 */
export const stepIdSchema = z.string().min(1);
// StepId moved to base-types.ts

/**
 * Execution ID for workflow instances
 */
export const workflowExecutionIdSchema = z.string().min(1);
// WorkflowExecutionId moved to base-types.ts

// ===== WORKFLOW STEP TYPES =====

/**
 * Step type - defines what kind of step this is
 */
export const stepTypeSchema = z.enum([
    'task',
    'agent',
    'tool',
    'condition',
    'parallel',
    'sequence',
    'wait',
    'human',
    'workflow', // For sub-workflows
    'custom',
]);
export type StepType = z.infer<typeof stepTypeSchema>;

/**
 * Workflow status - tracks execution state of the entire workflow
 */
export const workflowStatusSchema = z.enum([
    'pending',
    'running',
    'completed',
    'failed',
    'paused',
    'canceled',
]);
export type WorkflowStatus = z.infer<typeof workflowStatusSchema>;

// ===== STEP DEFINITION =====

/**
 * Step Definition - Blueprint for a workflow step
 */
export interface StepDefinition {
    id?: string;
    name: string;
    description?: string;
    type: StepType;

    // Step configuration
    config?: Record<string, unknown>;

    // Input/Output mappings
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;

    // Flow control
    next?: string | string[] | Record<string, string>; // Conditional routing
    condition?: (data: Record<string, unknown>) => boolean | Promise<boolean>;

    // Retry configuration
    retry?: {
        maxAttempts: number;
        delayMs: number;
        backoffMultiplier?: number;
        maxDelayMs?: number;
    };

    // Timeout for step execution
    timeout?: number;

    metadata?: Metadata;
}

// ===== WORKFLOW DEFINITION =====

/**
 * Workflow Definition - Blueprint for a workflow
 * This is the "what" - defines what the workflow is and can do
 */
export interface WorkflowDefinition extends BaseDefinition {
    // Workflow structure
    steps: Record<string, StepDefinition>;
    entryPoints: string[]; // Step IDs where workflow can start

    // Workflow configuration
    config?: {
        timeout?: number;
        maxConcurrency?: number;
        enableStateTracking?: boolean;
        enableRetry?: boolean;
    };

    // Workflow triggers
    triggers?: Array<{
        type: string;
        config?: Record<string, unknown>;
    }>;

    // Workflow signals for external communication
    signals?: Array<{
        name: string;
        description?: string;
        schema?: Record<string, unknown>;
    }>;

    // Dependencies on other workflows
    dependencies?: string[];
}

// ===== WORKFLOW CONTEXT =====

/**
 * Workflow Context - Execution environment for workflows
 * Extends BaseContext with stateful capabilities (memory, persistence, state tracking)
 */
export interface WorkflowContext extends BaseContext {
    // === WORKFLOW IDENTITY ===
    workflowName: string;
    executionId: string;

    // === STATEFUL CAPABILITIES ===
    // Memory service for learning and context retention
    // memoryService?: MemoryService;

    // Persistence service for data storage
    persistorService?: Persistor;

    // State management for execution state
    stateManager: ContextStateService;

    // === WORKFLOW STATE ===
    // Current workflow data/variables
    data: Record<string, unknown>;

    // Step execution tracking
    currentSteps: string[];
    completedSteps: string[];
    failedSteps: string[];

    // Workflow inputs and outputs
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;

    // === EXECUTION CONTROL ===
    // Abort signal for cancellation
    signal: AbortSignal;

    // Pause/resume capabilities
    isPaused: boolean;

    // === RUNTIME CAPABILITIES ===
    // Event stream for runtime communication
    stream?: EventStream<Event>;
    sendEvent?: (event: Event) => Promise<void>;
    emit?: (event: Event) => void;

    // Resource management
    resourceManager?: {
        addTimer: (timer: NodeJS.Timeout) => void;
        addInterval: (interval: NodeJS.Timeout) => void;
        addCleanupCallback: (callback: () => void | Promise<void>) => void;
        removeTimer: (timer: NodeJS.Timeout) => boolean;
        removeInterval: (interval: NodeJS.Timeout) => boolean;
        removeCleanupCallback: (
            callback: () => void | Promise<void>,
        ) => boolean;
    };

    // Workflow control
    pause?: (reason?: string) => Promise<string>;
    resume?: (snapshotId?: string) => Promise<void>;

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

export interface StepContext extends BaseContext {
    stepId: string;
    stepName: string;
    stepType: StepType;

    workflowContext: WorkflowContext;

    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;

    attempt: number;
    maxAttempts: number;

    signal: AbortSignal;

    cleanup(): Promise<void>;
}

export interface WorkflowEngineConfig extends BaseEngineConfig {
    validateDefinitions?: boolean;
    maxConcurrentExecutions?: number;
    defaultTimeoutMs?: number;

    storage?: {
        type: 'memory' | 'custom';
        config?: Record<string, unknown>;
    };

    // Step execution
    maxStepRetries?: number;
    defaultStepTimeout?: number;
}

/**
 * Workflow Execution Options
 */
export interface WorkflowExecutionOptions {
    inputs?: Record<string, unknown>;
    metadata?: Metadata;
    timeout?: number;
    maxConcurrency?: number;
    enableStateTracking?: boolean;
    context?: Partial<WorkflowContext>;
}

export interface WorkflowExecutionResult<TOutput = unknown>
    extends BaseExecutionResult<TOutput> {
    // Workflow-specific information
    workflowName: string;
    workflowExecutionId: string;

    // Execution details
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;

    // Enhanced metadata for workflows
    metadata: Metadata & {
        executionTime: number;
        stepsExecuted: string[];
        stepsSkipped: string[];
        retryCount: number;
    };
}

// ===== STEP EXECUTION TYPES =====

/**
 * Step Execution - represents execution of a single step
 */
export interface StepExecution {
    id: string;
    stepId: string;
    executionId: string;
    status: StepStatus;

    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
    error?: string;

    startTime?: number;
    endTime?: number;
    duration?: number;
    attempt?: number;

    metadata?: Metadata;
}

// ===== WORKFLOW EXECUTION TRACKING =====

/**
 * Workflow Execution - represents execution of an entire workflow
 */
export interface WorkflowExecution {
    id: string;
    workflowId: string;
    status: WorkflowStatus;

    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
    error?: string;

    // Step tracking
    currentSteps?: string[];
    completedSteps?: string[];
    failedSteps?: string[];

    startTime?: number;
    endTime?: number;
    duration?: number;

    metadata?: Metadata;
}

// ===== SIGNAL TYPES =====

/**
 * Workflow Signal - external events sent to workflows
 */
export interface WorkflowSignal {
    name: string;
    payload: unknown;
    executionId: string;
    timestamp: number;
    metadata?: Metadata;
}

/**
 * Trigger - event that can start a workflow
 */
export interface WorkflowTrigger {
    id: string;
    type: string;
    workflowId: string;
    config?: Record<string, unknown>;
    metadata?: Metadata;
}

// ===== VALIDATION SCHEMAS =====

export const stepDefinitionSchema = z.object({
    id: stepIdSchema.optional(),
    name: z.string(),
    description: z.string().optional(),
    type: stepTypeSchema,
    config: z.record(z.string(), z.unknown()).optional(),
    inputs: z.record(z.string(), z.unknown()).optional(),
    outputs: z.record(z.string(), z.unknown()).optional(),
    next: z
        .union([
            z.string(),
            z.array(z.string()),
            z.record(z.string(), z.string()),
        ])
        .optional(),
    condition: z.unknown().optional(), // ✅ Zod v4: z.function() não é mais suportado em objetos
    retry: z
        .object({
            maxAttempts: z.number().int().positive(),
            delayMs: z.number().int().nonnegative(),
            backoffMultiplier: z.number().positive().optional(),
            maxDelayMs: z.number().int().positive().optional(),
        })
        .optional(),
    timeout: z.number().int().positive().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

export const workflowDefinitionSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    version: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    steps: z.record(z.string(), stepDefinitionSchema),
    entryPoints: z.array(z.string()).min(1),
    config: z
        .object({
            timeout: z.number().positive().optional(),
            maxConcurrency: z.number().positive().optional(),
            enableStateTracking: z.boolean().optional(),
            enableRetry: z.boolean().optional(),
        })
        .optional(),
    triggers: z
        .array(
            z.object({
                type: z.string(),
                config: z.record(z.string(), z.unknown()).optional(),
            }),
        )
        .optional(),
    signals: z
        .array(
            z.object({
                name: z.string(),
                description: z.string().optional(),
                schema: z.record(z.string(), z.unknown()).optional(),
            }),
        )
        .optional(),
    dependencies: z.array(z.string()).optional(),
});

export const workflowExecutionOptionsSchema = z.object({
    inputs: z.record(z.string(), z.unknown()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    timeout: z.number().positive().optional(),
    maxConcurrency: z.number().positive().optional(),
    enableStateTracking: z.boolean().optional(),
    context: z.record(z.string(), z.unknown()).optional(),
});

// ===== HELPER FUNCTIONS =====

/**
 * Create Workflow Context with defaults
 */
export function createWorkflowContext(
    workflowName: string,
    executionId: string,
    tenantId: string,
    options: {
        correlationId?: string;
        parentId?: string;
        inputs?: Record<string, unknown>;
        // memoryService?: MemoryService;
        persistorService?: Persistor;
        metadata?: Metadata;
    } = {},
): WorkflowContext {
    return {
        // BaseContext
        executionId,
        tenantId,
        correlationId: options.correlationId || 'default',
        startTime: Date.now(),

        // WorkflowContext specific
        workflowName,
        //memoryService: options.memoryService,
        persistorService: options.persistorService,
        stateManager: new ContextStateService({}),
        data: {},
        currentSteps: [],
        completedSteps: [],
        failedSteps: [],
        inputs: options.inputs,
        signal: new AbortController().signal,
        isPaused: false,

        cleanup: async () => {
            // Cleanup logic will be implemented by the engine
        },
    };
}

/**
 * Create Step Context with defaults
 */
export function createStepContext(
    stepId: string,
    stepName: string,
    stepType: StepType,
    workflowContext: WorkflowContext,
    inputs: Record<string, unknown> = {},
    options: {
        attempt?: number;
        maxAttempts?: number;
        metadata?: Metadata;
    } = {},
): StepContext {
    return {
        // BaseContext
        tenantId: workflowContext.tenantId,
        correlationId: workflowContext.correlationId,
        startTime: Date.now(),

        // StepContext specific
        stepId,
        stepName,
        stepType,
        workflowContext,
        inputs,
        outputs: {},
        attempt: options.attempt || 1,
        maxAttempts: options.maxAttempts || 1,
        signal: workflowContext.signal,

        cleanup: async () => {
            // Cleanup logic will be implemented by the engine
        },
    };
}

export function validateWorkflowDefinition(
    definition: unknown,
): definition is WorkflowDefinition {
    try {
        workflowDefinitionSchema.parse(definition);
        return true;
    } catch {
        return false;
    }
}

export function validateStepDefinition(
    definition: unknown,
): definition is StepDefinition {
    try {
        stepDefinitionSchema.parse(definition);
        return true;
    } catch {
        return false;
    }
}

export function defineWorkflow(
    name: string,
    description: string,
    steps: Record<string, StepDefinition>,
    entryPoints: string[],
    options: Partial<
        Omit<
            WorkflowDefinition,
            'name' | 'description' | 'steps' | 'entryPoints'
        >
    > = {},
): WorkflowDefinition {
    return {
        name,
        description,
        steps,
        entryPoints,
        ...options,
    };
}

export function defineStep(
    name: string,
    type: StepType,
    options: Partial<Omit<StepDefinition, 'name' | 'type'>> = {},
): StepDefinition {
    return {
        name,
        type,
        ...options,
    };
}

export function createWorkflow(
    definition: WorkflowDefinition,
    options: {
        tenantId?: string;
        persistorService?: Persistor;
    } = {},
): Workflow {
    const logger = createLogger('workflow');
    return {
        name: definition.name,
        description: definition.description,

        createContext(): WorkflowContext {
            const executionId = IdGenerator.executionId();
            const tenantId = options.tenantId || 'default';

            return createWorkflowContext(
                definition.name,
                executionId,
                tenantId,
                {
                    //memoryService: options.memoryService,
                    persistorService: options.persistorService,
                    metadata: definition.metadata,
                },
            );
        },

        on(
            eventType: string,
            _handler: (event: unknown) => void | Promise<void>,
        ): void {
            // Basic event handling - can be extended
            logger.info('Event handler registered', { eventType });
        },

        emit(eventType: string, data?: unknown): void {
            // Basic event emission - can be extended
            logger.info('Event emitted', { eventType, data });
        },

        async pause(reason?: string): Promise<string> {
            // Basic pause implementation
            const snapshotId = `snapshot_${Date.now()}`;
            logger.warn('Workflow paused', { reason, snapshotId });
            return snapshotId;
        },

        async resume(snapshotId?: string): Promise<void> {
            // Basic resume implementation
            logger.info('Workflow resumed', { snapshotId });
        },

        async cleanup(): Promise<void> {
            // Basic cleanup implementation
            logger.info('Workflow cleanup completed');
        },
    };
}

// ===== WORKFLOW INTERFACE =====

/**
 * Workflow Interface - Runtime workflow object with createContext method
 * This is what the Kernel expects to receive
 */
export interface Workflow {
    /**
     * Create a workflow context for execution
     * This is the main method expected by the Kernel
     */
    createContext(): WorkflowContext;

    /**
     * Optional: Workflow name
     */
    name?: string;

    /**
     * Optional: Workflow description
     */
    description?: string;

    /**
     * Optional: Event handlers
     */
    on?(
        eventType: string,
        handler: (event: unknown) => void | Promise<void>,
    ): void;

    /**
     * Optional: Event emission
     */
    emit?(eventType: string, data?: unknown): void;

    /**
     * Optional: Pause workflow
     */
    pause?(reason?: string): Promise<string>;

    /**
     * Optional: Resume workflow
     */
    resume?(snapshotId?: string): Promise<void>;

    /**
     * Optional: Cleanup workflow
     */
    cleanup?(): Promise<void>;
}

// mcp/types.ts
// =============================================================================
// MCP ELICITATION TYPES (when not available in SDK)
// =============================================================================

export interface CreateElicitationRequest {
    params: {
        message: string;
        requestedSchema?: unknown;
        timeout?: number;
    };
}

export type TransportType = 'http' | 'sse' | 'websocket' | 'stdio';

export interface MCPTransport {
    connect(): Promise<void>;
    request<T>(
        method: string,
        params?: unknown,
        signal?: AbortSignal,
    ): Promise<T>;
    close(): Promise<void>;
}

export interface CreateElicitationResult {
    action: 'continue' | 'retry' | 'cancel';
    data?: unknown;
    message?: string;
}

// =============================================================================
// CLIENT CAPABILITIES
// =============================================================================

export interface CompleteClientCapabilities {
    tools?: {
        listChanged?: boolean;
    };
    resources?: {
        listChanged?: boolean;
        subscribe?: boolean;
    };
    prompts?: {
        listChanged?: boolean;
    };
    roots?: {
        listChanged?: boolean;
    };
    sampling?: Record<string, unknown>;
    elicitation?: Record<string, unknown>;
}

// =============================================================================
// KODUS FLOW ADAPTER TYPES - apenas o que não existe no SDK oficial
// =============================================================================

// =============================================================================
// SECURITY & MULTI-TENANT TYPES
// =============================================================================

export interface TenantContext {
    tenantId: string;
    userId?: string;
    permissions: string[];
    allowedRoots: string[];
    quotas: {
        maxRequests: number;
        maxTokens: number;
        rateLimit: number;
    };
}

export interface SecurityPolicy {
    /** Allowed file URI patterns */
    allowedUriPatterns: RegExp[];
    /** Blocked file URI patterns */
    blockedUriPatterns: RegExp[];
    /** Maximum file size for reads */
    maxFileSize: number;
    /** Path traversal protection */
    preventPathTraversal: boolean;
    /** Require human approval for sampling */
    requireHumanApproval: boolean;
}

// =============================================================================
// OBSERVABILITY & MONITORING TYPES
// =============================================================================

export interface MCPMetrics {
    // Connection metrics
    connectionsTotal: number;
    connectionsActive: number;
    connectionErrors: number;

    // Request metrics
    requestsTotal: number;
    requestsSuccessful: number;
    requestsFailed: number;
    requestDuration: number[];

    // Feature usage
    toolCalls: number;
    resourceReads: number;
    promptGets: number;
    samplingRequests: number;
    elicitationRequests: number;

    // Security events
    securityViolations: number;
    unauthorizedAccess: number;
    pathTraversalAttempts: number;

    // Per-tenant metrics
    tenantMetrics: Record<
        string,
        {
            requests: number;
            tokensUsed: number;
            errors: number;
        }
    >;
}

export interface AuditEvent {
    timestamp: number;
    tenantId: string;
    userId?: string;
    event: string;
    resource?: string;
    success: boolean;
    error?: string;
    metadata?: Record<string, unknown>;
}

// =============================================================================
// CLIENT CONFIGURATION
// =============================================================================

export interface MCPClientConfig {
    clientInfo: {
        name: string;
        version: string;
    };

    /** Transport configuration */
    transport: {
        type: TransportType;

        // Stdio config
        command?: string;
        args?: string[];
        env?: Record<string, string>;
        cwd?: string;

        // Network config
        url?: string;
        headers?: Record<string, string>;

        // Connection options
        timeout?: number;
        retries?: number;
        keepAlive?: boolean;
    };

    /** Client capabilities */
    capabilities: CompleteClientCapabilities;

    /** Security configuration */
    security?: SecurityPolicy;

    /** Multi-tenant configuration */
    tenant?: TenantContext;

    /** Observability configuration */
    observability?: {
        enableMetrics: boolean;
        enableTracing: boolean;
        enableAuditLog: boolean;
        metricsInterval: number;
    };

    allowedTools?: string[]; // Tools that this client is allowed to use
}

// =============================================================================
// HUMAN APPROVAL INTERFACES
// =============================================================================

export interface HumanApprovalRequest {
    type: 'sampling' | 'elicitation' | 'tool_call' | 'resource_access';
    message: string;
    context: {
        server: string;
        action: string;
        parameters?: Record<string, unknown>;
        security?: {
            riskLevel: 'low' | 'medium' | 'high';
            reason: string;
        };
    };
    timeout?: number;
}

export interface HumanApprovalResponse {
    approved: boolean;
    reason?: string;
    remember?: boolean;
    conditions?: string[];
}

export interface HumanApprovalHandler {
    requestApproval(
        request: HumanApprovalRequest,
    ): Promise<HumanApprovalResponse>;
}

// =============================================================================
// EVENT SYSTEM
// =============================================================================

export interface MCPClientEvents {
    // Connection events
    connected: [InitializeResult];
    disconnected: [string?];
    error: [Error];

    // Server notifications
    toolsListChanged: [];
    resourcesListChanged: [];
    promptsListChanged: [];
    rootsListChanged: [];

    // Progress events
    progress: [ProgressNotification];
    cancelled: [CancelledNotification];

    // Security events
    securityViolation: [AuditEvent];
    securityApprovalRequired: [HumanApprovalRequest];
    securityApprovalResponse: [HumanApprovalResponse];

    // Tenant events
    tenantQuotaExceeded: [TenantContext];
    tenantRateLimited: [TenantContext];

    // Observability events
    metricsUpdated: [MCPMetrics];
    auditEvent: [AuditEvent];
}

// =============================================================================
// ADAPTER TYPES (for compatibility with existing code)
// =============================================================================

export interface MCPServerConfig {
    name: string;
    type: TransportType;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
    url?: string;
    headers?: Record<string, string>;
    timeout?: number;
    retries?: number;
    allowedTools?: string[];
}

export interface MCPAdapterConfig {
    servers: MCPServerConfig[];
    defaultTimeout?: number;
    maxRetries?: number;
    onError?: (error: Error, serverName: string) => void;

    // =============================================================================
    // TOOL FILTERING & ACCESS CONTROL
    // =============================================================================

    /** Configuração de segurança por tool */
    toolSecurity?: {
        /** Tools que requerem aprovação humana */
        requireApproval?: string[];
        /** Tools com timeout específico */
        timeouts?: Record<string, number>;
        /** Tools com rate limit específico */
        rateLimits?: Record<string, number>;
        /** Tools com permissões específicas */
        permissions?: Record<string, string[]>;
    };

    /** Configuração de cache por tool */
    toolCache?: {
        /** Tools que devem ser cacheadas */
        enabled?: boolean;
        /** TTL específico por tool */
        ttls?: Record<string, number>;
        /** Tools que não devem ser cacheadas */
        disabled?: string[];
    };
}

// =============================================================================
// TOOL TYPES WITH VALIDATION
// =============================================================================

// Raw tool from MCP SDK (without execute function)
export interface MCPToolRaw {
    name: string;
    title?: string;
    description?: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
    annotations?: Record<string, unknown>;
}

// Tool with execute function for engine compatibility
export interface MCPTool extends MCPToolRaw {
    execute: (args: unknown, ctx: unknown) => Promise<unknown>;
}

// Tool with server information
export interface MCPToolRawWithServer extends MCPToolRaw {
    serverName?: string;
}

export interface MCPToolWithServer extends MCPTool {
    serverName: string;
}

// =============================================================================
// RESOURCE TYPES
// =============================================================================

export interface MCPResource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
}

export interface MCPResourceWithServer extends MCPResource {
    serverName: string;
}

// =============================================================================
// PROMPT TYPES
// =============================================================================

export interface MCPPrompt {
    name: string;
    description?: string;
    arguments?: Array<{
        name: string;
        description?: string;
        required?: boolean;
    }>;
}

export interface MCPPromptWithServer extends MCPPrompt {
    serverName: string;
}

// =============================================================================
// ADAPTER INTERFACE
// =============================================================================

export interface MCPAdapter {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    ensureConnection(): Promise<void>;
    getTools(): Promise<MCPTool[]>;
    hasTool(name: string): Promise<boolean>;
    listResources(): Promise<MCPResourceWithServer[]>;
    readResource(uri: string, serverName?: string): Promise<unknown>;
    listPrompts(): Promise<MCPPromptWithServer[]>;
    getPrompt(
        name: string,
        args?: Record<string, string>,
        serverName?: string,
    ): Promise<unknown>;
    executeTool(
        name: string,
        args?: Record<string, unknown>,
        serverName?: string,
    ): Promise<unknown>;
    getMetrics(): Record<string, unknown>;
    getRegistry(): unknown;
}

// =============================================================================
// HEALTH CHECKS & CIRCUIT BREAKER
// =============================================================================

export interface MCPHealthCheck {
    interval: number; // Verificar a cada 30s
    timeout: number; // Timeout de 5s
    retries: number; // 3 tentativas
    enabled: boolean; // Habilitar/desabilitar
}

export interface MCPCircuitBreaker {
    failureThreshold: number; // 5 falhas
    resetTimeout: number; // 60s para reset
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    lastFailureTime: number;
}

export interface MCPRateLimiter {
    requestsPerMinute: number; // 100 requests/min
    burstSize: number; // 10 requests burst
    windowMs: number; // 60000ms (1 min)
    currentRequests: number;
    lastResetTime: number;
}

// Schema cache removed - keeping it simple

// =============================================================================
// SERVER STATUS TYPES
// =============================================================================

export interface MCPServerStatus {
    name: string;
    connected: boolean;
    lastHealthCheck: number;
    lastError?: string;
    responseTime: number;
    uptime: number;
    metrics: {
        requestsTotal: number;
        requestsSuccessful: number;
        requestsFailed: number;
        averageResponseTime: number;
    };
}

export interface MCPHealthCheckResult {
    serverName: string;
    healthy: boolean;
    responseTime: number;
    error?: string;
    timestamp: number;
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validate MCP server configuration
 */
export function validateMCPServerConfig(config: MCPServerConfig): boolean {
    if (!config.name || typeof config.name !== 'string') {
        return false;
    }

    if (!config.type || !['http', 'sse', 'websocket'].includes(config.type)) {
        return false;
    }

    // For network transports, URL is required
    if (['http', 'sse', 'websocket'].includes(config.type) && !config.url) {
        return false;
    }

    // For stdio transport, command is required
    if (config.type === 'stdio' && !config.command) {
        return false;
    }

    return true;
}

//context/session-service.ts
export interface ConversationMessage {
    role: 'user' | 'assistant' | 'tool' | 'system';
    content: string;
    timestamp: number;
    metadata?: {
        model?: string;
        agentName?: string;
        responseTimeMs?: number;
        tokensUsed?: number;
        toolsUsed?: string[];
        toolCallsCount?: number;
        source?: string;
        connectionId?: string;
        [key: string]: unknown;
    };
}

export type ConversationHistory = ConversationMessage[];

export type Session = {
    id: string;
    threadId: string;
    tenantId: string;
    createdAt: number;
    lastActivity: number;
    status: 'active' | 'paused' | 'expired' | 'closed';
    metadata: Record<string, unknown>;
    contextData: Record<string, unknown>;
    conversationHistory: ConversationHistory;
    currentExecutionId?: string; // Track current execution
};

export interface SessionConfig {
    maxSessions?: number;
    sessionTimeout?: number; // ms
    maxConversationHistory?: number;
    enableAutoCleanup?: boolean;
    cleanupInterval?: number; // ms
    persistent?: boolean;
    adapterType?: StorageEnum;
    connectionString?: string;
    adapterOptions?: Record<string, unknown>;
}

export interface SessionContext {
    id: SessionId;
    threadId: ThreadId;
    tenantId: TenantId;
    stateManager: ContextStateService;
    metadata: Record<string, unknown>;
    conversationHistory: ConversationHistory;
}

// adapter/factory.ts

export enum StorageEnum {
    INMEMORY = 'memory',
    MONGODB = 'mongodb',
}

export interface StorageAdapterConfig extends BaseStorageConfig {
    type: StorageEnum;
    connectionString?: string;
    options?: Record<string, unknown>;
}

export interface StorageDefaultConfig {
    maxItems: number;
    enableCompression: boolean;
    cleanupInterval: number;
    timeout: number;
    retries: number;
    enableObservability: boolean;
    enableHealthChecks: boolean;
    enableMetrics: boolean;
    options?: Record<string, unknown>;
}

export const STORAGE_DEFAULTS: Record<StorageEnum, StorageDefaultConfig> = {
    memory: {
        maxItems: 1000,
        enableCompression: true,
        cleanupInterval: 300000,
        timeout: 5000,
        retries: 3,
        enableObservability: true,
        enableHealthChecks: true,
        enableMetrics: true,
    },
    mongodb: {
        maxItems: 1000,
        enableCompression: true,
        cleanupInterval: 300000,
        timeout: 10000,
        retries: 3,
        enableObservability: true,
        enableHealthChecks: true,
        enableMetrics: true,
        options: {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            database: 'kodus',
            collection: 'storage',
        },
    },
};

// observability/debugging.ts

/**
 * Relatório de debugging
 */
export interface DebugReport {
    timestamp: number;
    config: DebugConfig;
    summary: {
        tracedEvents: number;
        completedMeasurements: number;
        stateSnapshots: number;
        activeMeasurements: number;
        avgEventProcessingTime: number;
        avgMeasurementTime: number;
    };
    eventTypeDistribution: Record<string, number>;
    recentErrors: Array<{
        eventType: string;
        error: string;
        timestamp: number;
        traceId: string;
    }>;
    performanceInsights: PerformanceInsights;
}

/**
 * Insights de performance
 */
export interface PerformanceInsights {
    slowOperations: Array<{ name: string; duration: number; category: string }>;
    fastOperations: Array<{ name: string; duration: number; category: string }>;
    recommendations: string[];
}

export interface DebugContext {
    setCorrelationId(id: string): void;
    clearCorrelationId(): void;

    log(level: LogLevel, message: string, data?: Record<string, unknown>): void;
    trace(event: Event, source?: string): string;

    measure<T>(
        name: string,
        fn: () => T | Promise<T>,
        metadata?: Record<string, unknown>,
    ): Promise<{ result: T; measurement: PerformanceMeasurement }>;
    startMeasurement(name: string, metadata?: Record<string, unknown>): string;
    endMeasurement(id: string): PerformanceMeasurement | undefined;

    captureSnapshot(
        entityName: string,
        entityType: 'agent' | 'workflow' | 'system',
        state: Record<string, unknown>,
    ): string;

    generateReport(): DebugReport;
}
/**
 * Configuração de debugging simplificada
 */
export interface DebugConfig {
    enabled: boolean;
    level: LogLevel;
    features: {
        eventTracing: boolean;
        performanceProfiling: boolean;
        stateInspection: boolean;
        errorAnalysis: boolean;
    };

    // Output configuration
    outputs: DebugOutput[];

    // History settings
    maxEventHistory: number;
    maxMeasurementHistory: number;

    // Auto-flush settings
    autoFlush: boolean;
    flushInterval: number; // milliseconds
}

/**
 * Debug output interface
 */
export interface DebugOutput {
    name: string;
    write(entry: DebugEntry): void | Promise<void>;
    flush?(): void | Promise<void>;
}

/**
 * Debug entry simplificada
 */
export interface DebugEntry {
    timestamp: number;
    level: LogLevel;
    category: 'event' | 'performance' | 'state' | 'error';
    message: string;
    data?: Record<string, unknown>;
    correlationId?: string;
}

/**
 * Performance measurement simplificada
 */
export interface PerformanceMeasurement {
    id: string;
    name: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    category: string;
    correlationId?: string;
}

/**
 * Event trace simplificada
 */
export interface EventTrace {
    id: string;
    event: Event;
    timestamp: number;
    correlationId: string;
    processingDuration?: number;
    result?: Event | void;
    error?: Error;
}

/**
 * State snapshot simplificada
 */
export interface StateSnapshot {
    id: string;
    entityName: string;
    entityType: 'agent' | 'workflow' | 'system';
    timestamp: number;
    state: Record<string, unknown>;
    correlationId?: string;
}

// mcp/tools.ts
/**
 * Tool structure expected by the engine
 */
export interface EngineTool {
    name: string;
    description: string;
    inputZodSchema: z.ZodSchema;
    inputSchema: unknown;
    outputSchema?: unknown;
    outputZodSchema?: z.ZodSchema;
    annotations?: Record<string, unknown>;
    title?: string;
    execute: (args: unknown, ctx: unknown) => Promise<unknown>;
}

// mcp/registry.ts
export interface MCPRegistryOptions {
    /** timeout padrão dos clientes (ms) */
    defaultTimeout?: number;
    /** tentativas de retry */
    maxRetries?: number;
}

// mcp/client.ts
export interface MCPRequestMethod {
    request(
        request: { method: string; params?: Record<string, unknown> },
        options?: { signal?: AbortSignal },
    ): Promise<unknown>;
}

// llm/index.ts
export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    name?: string;
    toolCallId?: string;
    toolCalls?: Array<{
        id: string;
        type: 'function';
        function: {
            name: string;
            arguments: string;
        };
    }>;
}

export interface LLMRequest {
    messages: LLMMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    }>;
}

export interface LLMResponse {
    content: string;
    toolCalls?: Array<{
        name: string;
        arguments: Record<string, unknown>;
    }>;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface LLMConfig {
    provider: string;
    apiKey?: string;
    model?: string;
    baseURL?: string;
    timeout?: number;
    maxRetries?: number;
}

// =============================================================================
// INTERFACE PRINCIPAL
// =============================================================================

export interface LLMAdapter {
    call(request: LLMRequest): Promise<LLMResponse>;
    analyzeContext(
        pergunta: string,
        availableTools: Array<{ name: string; description?: string }>,
    ): Promise<{
        intent: string;
        urgency: 'low' | 'normal' | 'high';
        complexity: 'simple' | 'medium' | 'complex';
        selectedTool: string;
        confidence: number;
        reasoning: string;
    }>;
    extractParameters(
        pergunta: string,
        toolName: string,
        context: unknown,
    ): Promise<Record<string, unknown>>;
    generateResponse(
        result: unknown,
        originalQuestion: string,
    ): Promise<string>;

    supportsStructuredGeneration?(): boolean;

    createPlan?(
        goal: string,
        strategy: string,
        context: unknown,
    ): Promise<unknown>;

    getProvider?(): { name: string };
    getAvailableTechniques?(): string[];
}

// context/service/simple-execution-log.ts
export interface SimpleExecutionLog {
    executionId: string;
    sessionId: string;
    agentName: string;
    startTime: number;
    endTime: number;
    totalDuration: number;
    toolCallsCount: number;
    complexityScore: number;
    finalStatus: 'success' | 'error' | 'timeout';
    // Only store essential data - not full steps to keep it lightweight
}

export interface ExecutionCriteria {
    hasToolCalls: boolean;
    executionTimeMs: number;
    multipleSteps: boolean;
    hasErrors: boolean;
    isDebugMode: boolean;
}

// context/execution-tracker.ts

export interface StepResult {
    stepId: string;
    iteration: number;
    thought: AgentThought;
    action: AgentAction;
    status: string;
    result: ActionResult;
    observation: ResultAnalysis;
    duration: number;
    startedAt: number;
    toolCalls: Array<{
        toolName: string;
        input: unknown;
        result: unknown;
        duration: number;
    }>;
}

export const STATE_NAMESPACES = {
    EXECUTION: 'execution',
} as const;

export type StateNamespace =
    (typeof STATE_NAMESPACES)[keyof typeof STATE_NAMESPACES];

// planning/planner-factory.ts
export type PlannerType = 'react' | 'tot' | 'reflexion' | 'plan-execute';

export interface Planner<
    TContext extends PlannerExecutionContext = PlannerExecutionContext,
> {
    think(context: TContext, stepId?: string): Promise<AgentThought>;
    analyzeResult(
        result: ActionResult,
        context: TContext,
    ): Promise<ResultAnalysis>;
    // Optional hooks for Plan–Execute style planners
    createFinalResponse?(context: TContext): Promise<string>;
    getPlanForContext?(context: TContext): unknown | null;
    resolveArgs?(
        args: Record<string, unknown>,
        steps: unknown[],
        context?: TContext,
    ): Promise<{ args: Record<string, unknown>; missing: string[] }>;
}

// Specific metadata types for better type safety
export interface AgentThoughtMetadata {
    plannerType?: PlannerType;
    executionTime?: number;
    retryCount?: number;
    [key: string]: unknown;
}

// export interface AgentThought {
//     reasoning: string;
//     action: AgentAction; // Make action required to fix compatibility
//     metadata?: AgentThoughtMetadata;
// }

// Specific metadata types for action results
export interface ActionResultMetadata {
    executionTime?: number;
    toolName?: string;
    success?: boolean;
    retryCount?: number;
    errorCode?: string;
    [key: string]: unknown;
}

export type ActionResult =
    | ToolResult
    | FinalAnswerResult
    | ErrorResult
    | ToolResultsArray
    | NeedsReplanResult;

// Tool results array for multiple tool execution
export interface ToolResultsArray {
    type: 'tool_results';
    content: Array<{
        toolName: string;
        result?: unknown;
        error?: string;
    }>;
    metadata?: ActionResultMetadata;
}

export interface FinalAnswerResult {
    type: 'final_answer';
    content: string;
    metadata?: ActionResultMetadata;
    planExecutionResult?: PlanExecutionResult;
}

export interface ErrorResult {
    type: 'error';
    error: string;
    metadata?: ActionResultMetadata;
    status?: string;
    replanContext?: PlanExecutionResult['replanContext'];
    feedback?: string;
    planExecutionResult?: PlanExecutionResult; // ✅ Para capturar dados do PlanExecutor
}

export interface NeedsReplanResult {
    type: 'needs_replan';
    replanContext?: PlanExecutionResult['replanContext'];
    feedback: string;
    metadata?: ActionResultMetadata;
}

export type ResultAnalysis = {
    isComplete: boolean;
    isSuccessful: boolean | null; // null = não executado ainda
    feedback: string;
    shouldContinue: boolean;
    suggestedNextAction?: string;
};

// Specific metadata types for execution context
export interface ExecutionContextMetadata {
    agentName?: string;
    correlationId?: string;
    tenantId?: string;
    thread?: Thread;
    startTime?: number;
    plannerType?: PlannerType;
    // Replan cause for observability
    replanCause?:
        | 'fail_window'
        | 'ttl'
        | 'budget'
        | 'tool_missing'
        | 'missing_inputs';
    // 🆕 NEW: Context quality metrics from auto-retrieval
    contextMetrics?: {
        memoryRelevance: number;
        sessionContinuity: number;
        executionHealth: number;
    };
    [key: string]: unknown;
}

// Enhanced tool information with usage analytics and context engineering
export interface EnhancedToolInfo {
    name: string;
    description: string;
    schema: unknown;

    // Usage analytics
    usageCount?: number; // How many times this tool was used
    lastSuccess?: boolean; // Was the last execution successful?
    avgResponseTime?: number; // Average execution time in ms
    errorRate?: number; // Percentage of failed executions
    lastUsed?: number; // Timestamp of last usage

    // Context engineering metadata
    examples?: Array<{
        description: string;
        input: Record<string, unknown>;
        expectedOutput?: unknown;
        context?: string;
        tags?: string[];
    }>;

    plannerHints?: {
        useWhen?: string[];
        avoidWhen?: string[];
        combinesWith?: string[];
        conflictsWith?: string[];
    };

    categories?: string[];
    dependencies?: string[];
}

// Learning context from previous executions
export interface LearningContext {
    commonMistakes: string[]; // Patterns of errors to avoid
    successPatterns: string[]; // What works well for this agent
    userFeedback: string[]; // User feedback on agent performance
    preferredTools: string[]; // Tools that work best for this agent
}

// Execution hints for better LLM performance
export interface ExecutionHints {
    lastSuccessfulAction?: string; // Description of the last successful action
    currentGoal?: string; // What the agent is trying to achieve now
    timeConstraint?: number; // Time limit in seconds
    userUrgency?: 'low' | 'medium' | 'high'; // How urgent this task is
    environmentState?: Record<string, unknown>; // Current state of the world
    userPreferences?: {
        // How the user likes things done
        verbosity?: 'concise' | 'detailed' | 'verbose';
        riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
        preferredStyle?: 'formal' | 'casual' | 'technical';
    };
    // 🆕 NEW: Auto-retrieved context from ContextBuilder
    relevantMemories?: string[];
    recentPatterns?: string[];
    suggestions?: string[];
    sessionContinuity?: string;
}

export interface ExecutionHistoryEntry {
    thought: AgentThought;
    action: AgentAction;
    result: ActionResult;
    observation: ResultAnalysis;
}

// Enhanced execution context for planners with improved LLM performance
export interface PlannerExecutionContext {
    input: string;
    history: StepExecution[];
    isComplete: boolean;

    iterations: number;
    maxIterations: number;
    plannerMetadata: ExecutionContextMetadata;

    // 🚀 NEW: Execution hints for better LLM decision making
    executionHints?: ExecutionHints;

    // ✅ NEW: ContextBuilder integration - AgentContext with clean APIs
    agentContext?: AgentContext;

    // ✅ CORREÇÃO: Replan context for better planning
    replanContext?: PlanExecutionResult['replanContext'];

    // Methods
    update(
        thought: AgentThought,
        result: ActionResult,
        observation: ResultAnalysis,
    ): void;
    getCurrentSituation(): string;
    getFinalResult(): AgentExecutionResult;
    getCurrentPlan?(): unknown | null; // Access to current plan state
}

// Enhanced context configuration for advanced execution features
export interface ContextEnhancementConfig {
    executionHints?: ExecutionHints;
    learningContext?: LearningContext;
    enhanceTools?: boolean; // Whether to enhance tool info with analytics
}

export function isToolResult(result: ActionResult): result is ToolResult {
    return result.type === 'tool_result';
}

export function isFinalAnswerResult(
    result: ActionResult,
): result is FinalAnswerResult {
    return result.type === 'final_answer';
}

export function isErrorResult(result: ActionResult): result is ErrorResult {
    return result.type === 'error';
}

export function isNeedsReplanResult(
    result: ActionResult,
): result is NeedsReplanResult {
    return result.type === 'needs_replan';
}

export function isToolResultsArray(
    result: ActionResult,
): result is ToolResultsArray {
    return result.type === 'tool_results';
}
/**
 * Helper function to check if ActionResult is successful (not an error)
 */
export function isSuccessResult(result: ActionResult): boolean {
    return result.type !== 'error';
}

// Specific metadata types for execution results
export interface ExecutionResultMetadata {
    plannerType?: PlannerType;
    toolCallsCount?: number;
    errorsCount?: number;
    averageConfidence?: number;
    finalConfidence?: number;
    actionBreakdown?: Record<string, number>;
    [key: string]: unknown;
}

// Helper function to get error from any result type
export function getResultError(result: ActionResult): string | undefined {
    if (isErrorResult(result)) {
        return result.error;
    }
    return undefined;
}

// Helper function to get content from any result type
export function getResultContent(result: ActionResult): unknown {
    if (
        (isFinalAnswerResult(result) || isErrorResult(result)) &&
        result.planExecutionResult
    ) {
        // Se temos planExecutionResult, extrair signals e execution data
        const { signals, feedback, executedSteps } = result.planExecutionResult;
        return {
            planResult: result.planExecutionResult.type,
            feedback,
            signals,
            executedSteps: executedSteps.map((step) => ({
                stepId: step.stepId,
                success: step.success,
                result: step.result,
                error: step.error,
            })),
        };
    }

    // ✅ FALLBACK: Content padrão para outros tipos
    if (isToolResult(result)) {
        return result.content;
    }
    if (isFinalAnswerResult(result)) {
        return result.content;
    }
    if (isToolResultsArray(result)) {
        return result.content;
    }
    return undefined;
}

//planning/prompt/types.ts
export interface PlanningExample {
    /** Brief description of the scenario */
    scenario: string;

    /** Context or situation description */
    context: string;

    /** List of tool names available in this example */
    availableTools: string[];

    /** The expected plan structure for this scenario */
    expectedPlan: {
        strategy: string;
        goal: string;
        plan: Array<{
            id: string;
            description: string;
            tool: string;
            argsTemplate?: Record<string, unknown>;
            dependsOn?: string[];
            parallel?: boolean;
        }>;
        reasoning: string[];
    };

    /** Optional: Weight/priority of this example (higher = more important) */
    weight?: number;

    /** Optional: Tags for categorizing examples */
    tags?: string[];
}

/**
 * Provider interface for domain-specific planning examples
 */
export interface DomainExamplesProvider {
    /**
     * Get all available planning examples
     */
    getExamples(): PlanningExample[];

    /**
     * Get examples filtered by available tools
     * Useful for showing only relevant examples to the LLM
     */
    getRelevantExamples?(availableTools: string[]): PlanningExample[];

    /**
     * Get examples filtered by scenario tags
     */
    getExamplesByTags?(tags: string[]): PlanningExample[];
}

/**
 * Provider interface for domain-specific reasoning patterns
 */
export interface DomainPatternsProvider {
    /**
     * Get domain-specific reasoning patterns
     */
    getPatterns(): string[];

    /**
     * Get contextual patterns based on available tools or context
     */
    getContextualPatterns?(context: {
        availableTools?: string[];
        userContext?: Record<string, unknown>;
        previousAttempts?: number;
    }): string[];
}

/**
 * Behavioral configuration for the planner
 */
export interface PlannerBehavior {
    /** Prefer parallel execution when possible */
    preferParallelExecution?: boolean;

    /** Automatically discover tool relationships */
    autoDiscoverRelationships?: boolean;

    /** Include detailed reasoning in responses */
    verboseReasoning?: boolean;

    /** Maximum steps allowed in a single plan */
    maxStepsPerPlan?: number;

    /** Prefer discovery tools when context is ambiguous */
    preferDiscoveryOnAmbiguity?: boolean;

    /** Timeout for individual planning operations (ms) */
    planningTimeout?: number;
}

/**
 * Main configuration interface for the prompt system
 */
export interface PlannerPromptConfig {
    /** Optional custom examples provider */
    customExamples?: PlanningExample[];

    /** Optional examples provider interface */
    examplesProvider?: DomainExamplesProvider;

    /** Optional patterns provider interface */
    patternsProvider?: DomainPatternsProvider;

    /** Additional reasoning patterns (simple strings) */
    additionalPatterns?: string[];

    /** Custom constraints to apply to planning */
    constraints?: string[];

    /** Behavioral configuration */
    behavior?: PlannerBehavior;

    /** Feature flags */
    features?: {
        /** Include default universal patterns */
        includeUniversalPatterns?: boolean;

        /** Include dynamic hints based on request analysis */
        includeDynamicHints?: boolean;

        /** Use caching for prompt composition */
        enablePromptCaching?: boolean;
    };

    /** Custom prompt templates (advanced usage) */
    templates?: {
        /** Override system prompt template */
        system?: string;

        /** Override user prompt template */
        user?: string;

        /** Custom response format specification */
        responseFormat?: string;
    };
}

/**
 * Context object passed to prompt composition
 */
export interface PromptCompositionContext {
    /** User's goal/request */
    goal: string;

    /** Available tools with metadata */
    availableTools: Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
    }>;

    /** Memory context from previous interactions */
    memoryContext?: string;

    /** Planning history from current session */
    planningHistory?: string;

    /** Additional context data (user-provided info only) */
    additionalContext?: Record<string, unknown>;

    /** Replan context (system information about previous execution) */
    replanContext?: ReplanContext;

    /** Current iteration number */
    iteration?: number;

    /** Maximum allowed iterations */
    maxIterations?: number;
}

/**
 * Result of prompt composition
 */
export interface ComposedPrompt {
    /** The system prompt */
    systemPrompt: string;

    /** The user prompt */
    userPrompt: string;

    /** Metadata about the composition */
    metadata: {
        /** Total token count estimate */
        estimatedTokens: number;

        /** Whether smart analysis was included */
        includesSmartAnalysis: boolean;

        /** Composition timestamp */
        timestamp: number;

        /** Version of the prompt system */
        version: string;
    };
}

// response-synthesizer.ts

export interface ResponseSynthesisContext {
    originalQuery: string;

    plannerType: string;

    executionResults: ActionResult[];

    planSteps?: Array<{
        id: string;
        description: string;
        status:
            | typeof UNIFIED_STATUS.COMPLETED
            | typeof UNIFIED_STATUS.FAILED
            | typeof UNIFIED_STATUS.SKIPPED;
        result?: unknown;
    }>;

    plannerReasoning?: string;

    metadata: {
        totalSteps: number;
        completedSteps: number;
        failedSteps: number;
        executionTime?: number;
        iterationCount?: number;
        [key: string]: unknown;
    };
}

export interface SynthesizedResponse {
    content: string;
    needsClarification: boolean;
    includesError: boolean;
    metadata: {
        synthesisStrategy: string;
        discoveryCount: number;
        primaryFindings: string[];
        [key: string]: unknown;
    };
}

export type SynthesisStrategy =
    | 'conversational'
    | 'summary'
    | 'problem-solution'
    | 'technical';

// tool-result-parser.ts

// ═══════════════════════════════════════════════════════════════════════════════════════
// 📋 MCP TYPES (Based on official spec)
// ═══════════════════════════════════════════════════════════════════════════════════════

export interface ContentBlock {
    type: 'text' | 'image' | 'audio' | 'resource_link' | 'embedded_resource';
    [key: string]: unknown;
}

export interface TextContent extends ContentBlock {
    type: 'text';
    text: string;
}

export interface MCPToolResult {
    content: ContentBlock[];
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 🎯 PARSER RESULT INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════════════

export interface ParsedToolResult {
    /** Extracted text content */
    text: string;

    /** Structured data if available */
    data?: Record<string, unknown>;

    /** Whether this seems like a substantial/meaningful result */
    isSubstantial: boolean;

    /** Whether this indicates an error */
    isError: boolean;

    /** Original result for fallback */
    original: unknown;

    /** Metadata about parsing */
    metadata: {
        source: 'mcp' | 'nested' | 'simple' | 'json-string' | 'unknown';
        contentType: 'text' | 'json' | 'mixed' | 'empty';
        textLength: number;
        hasStructuredData: boolean;
        parsingSteps: string[];
    };
}

// multi-agent-types.ts
export interface AgentCapability {
    domain: string; // e.g., "security", "performance", "quality"
    skills: string[]; // e.g., ["vulnerability_scan", "code_review"]
    inputTypes: string[]; // Tipos de input que o agente pode processar
    outputTypes: string[]; // Tipos de output que o agente pode gerar
    load: number; // 0-100, current workload
    priority: number; // Agent priority level
    availability: boolean; // Is agent available
    performance: {
        averageResponseTime: number;
        successRate: number;
        lastUsed: number;
    };
}

// ──────────────────────────────────────────────────────────────────────────────
// 🧩 MESSAGE TYPES
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Mensagem entre agentes
 */
export interface AgentMessage {
    id: string;
    fromAgent: string;
    toAgent: string;
    type: 'request' | 'response' | 'notification' | 'delegation';
    content: unknown;
    timestamp: number;
    correlationId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🧩 COORDINATION TYPES
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Estratégias de coordenação de agentes
 */
export type AgentCoordinationStrategy =
    | 'sequential' // Execução sequencial
    | 'parallel' // Execução paralela
    | 'competition' // Competição entre agentes
    | 'collaboration' // Colaboração entre agentes
    | 'delegation' // Delegação hierárquica
    | 'voting' // Votação entre agentes
    | 'consensus' // Consenso entre agentes
    | 'pipeline' // Pipeline de processamento
    | 'custom'; // Estratégia customizada

/**
 * Critérios para seleção de agentes
 */
export interface AgentSelectionCriteria {
    requiredSkills?: string[];
    requiredDomain?: string;
    minSuccessRate?: number;
    maxLoad?: number;
    minPriority?: number;
    preferredAgents?: string[];
    excludedAgents?: string[];
    maxResponseTime?: number;
    requiredInputTypes?: string[];
    requiredOutputTypes?: string[];
    tags?: string[];
    metadata?: Record<string, unknown>;
}

/**
 * Contexto para coordenação multi-agente
 */
export interface MultiAgentContext {
    coordinationId: string;
    strategy: AgentCoordinationStrategy;
    criteria: AgentSelectionCriteria;
    availableAgents: string[];
    startTime: number;
    correlationId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
}

/**
 * Resultado de coordenação multi-agente
 */
export interface MultiAgentResult {
    status: 'completed' | 'failed' | 'partial' | 'timeout';
    result: unknown;
    error?: string;
    coordinationId: string;
    duration: number;
    strategy: AgentCoordinationStrategy;
    participatingAgents: string[];
    agentResults?: Record<
        string,
        {
            success: boolean;
            result?: unknown;
            error?: string;
            duration: number;
        }
    >;
    metadata?: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🧩 AGENT INTERFACE (NÃO IMPERATIVE)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Interface de agente para coordenação (sem usar types imperative)
 */
export interface CoordinatableAgent<TInput = unknown, TOutput = unknown> {
    name: string;
    definition: AgentDefinition<TInput, TOutput>;

    // Método principal de execução
    process(input: TInput, context?: Partial<AgentContext>): Promise<TOutput>;

    // Método para verificar disponibilidade
    isAvailable(): boolean;

    // Método para obter capacidades
    getCapabilities(): AgentCapability;

    // Método para obter carga atual
    getCurrentLoad(): number;

    // Método para atualizar métricas
    updateMetrics(metrics: {
        latency: number;
        success: boolean;
        cost?: number;
    }): void;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🧩 WORKFLOW STEP TYPES
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Contexto de execução de workflow step
 */
export interface WorkflowStepContext {
    executionId: string;
    correlationId: string;
    sessionId?: string;
    tenantId: string;
    metadata?: Record<string, unknown>;
}

/**
 * Interface de workflow step
 */
export interface WorkflowStep<TInput = unknown, TOutput = unknown> {
    name: string;
    execute(input: TInput, context: WorkflowStepContext): Promise<TOutput>;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🧩 HELPER TYPES
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Status de entrega de mensagem
 */
export type MessageStatus = 'pending' | 'delivered' | 'failed' | 'acknowledged';

/**
 * Mensagem rastreada com status de entrega
 */
export interface TrackedMessage extends AgentMessage {
    status: MessageStatus;
    deliveryAttempts: number;
    maxAttempts: number;
    createdAt: number;
    deliveredAt?: number;
    acknowledgedAt?: number;
    error?: string;
}

/**
 * Agente registrado com métricas
 */
export interface RegisteredAgent {
    agent: CoordinatableAgent<unknown, unknown>;
    capabilities: AgentCapability;
    metadata: Record<string, unknown>;
    performance: {
        averageLatency: number;
        successRate: number;
        totalExecutions: number;
        lastExecution?: number;
    };
    isAvailable: boolean;
    currentTasks: number;
    maxConcurrentTasks: number;
}

/**
 * Contexto de delegação
 */
export interface DelegationContext {
    fromAgent: string;
    targetAgent: string;
    reason?: string;
    timeout?: number;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    chainLevel: number;
    originalAgent?: string;
    correlationId: string;
    executionId: string;
    startTime: number;
}

/**
 * Resultado de delegação
 */
export interface DelegationResult {
    success: boolean;
    result?: unknown;
    error?: string;
    duration: number;
    targetAgent: string;
    fromAgent: string;
    correlationId: string;
}

// multi-kernel-handler.ts
/**
 * Multi-Kernel Handler Configuration
 */
export interface MultiKernelHandlerConfig {
    tenantId: string;
    debug?: boolean;
    monitor?: boolean;

    // Observability kernel configuration
    observability?: {
        enabled?: boolean;
        workflow?: Workflow;
        performance?: {
            enableBatching?: boolean;
            enableLazyLoading?: boolean;
        };
    };

    // Agent kernel configuration
    agent?: {
        enabled?: boolean;
        workflow?: Workflow;
        quotas?: {
            maxEvents?: number;
            maxDuration?: number;
            maxMemory?: number;
        };
        runtimeConfig?: {
            queueSize?: number;
            batchSize?: number;
            middleware?: Middleware[];
        };
        performance?: {
            enableBatching?: boolean;
            enableCaching?: boolean;
            autoSnapshot?: {
                enabled?: boolean;
                intervalMs?: number;
                eventInterval?: number;
                useDelta?: boolean;
            };
        };
    };

    // Global configuration
    global?: {
        persistorType?: PersistorType;
        persistorOptions?: Record<string, unknown>;
        enableCrossKernelLogging?: boolean;
    };

    // Infinite loop protection
    loopProtection?: {
        enabled?: boolean;
        maxEventCount?: number;
        maxEventRate?: number;
        windowSize?: number;
    };
}

/**
 * Execution result for multi-kernel operations
 */
export interface MultiKernelExecutionResult<T = unknown> {
    status: 'completed' | 'failed' | 'paused';
    data?: T;
    error?: {
        message: string;
        details?: unknown;
    };
    metadata: {
        executionId: ExecutionId;
        duration: number;
        kernelsUsed: string[];
        agentEventCount: number;
        observabilityEventCount: number;
        snapshotId?: string;
    };
}

// persistor/config.ts
export const persistorTypeSchema = z.enum(['memory', 'mongodb']);

export const basePersistorConfigSchema = z.object({
    type: persistorTypeSchema,
    maxSnapshots: z.number().min(1).max(10000).default(1000),
    enableCompression: z.boolean().default(true),
    enableDeltaCompression: z.boolean().default(true),
    cleanupInterval: z.number().min(1000).max(3600000).default(300000), // 5 minutes
});

/**
 * Memory Persistor Configuration
 */
export const memoryPersistorConfigSchema = basePersistorConfigSchema.extend({
    type: z.literal('memory'),
    maxMemoryUsage: z
        .number()
        .min(1024 * 1024)
        .max(1024 * 1024 * 1024)
        .default(100 * 1024 * 1024), // 100MB
});

export const mongodbPersistorConfigSchema = basePersistorConfigSchema.extend({
    type: z.literal('mongodb'),
    connectionString: z.string().default('mongodb://localhost:27017/default'),
    database: z.string().default('default'),
    collection: z.string().default('snapshots'),
    maxPoolSize: z.number().min(1).max(100).default(10),
    serverSelectionTimeoutMS: z.number().min(1000).max(30000).default(5000),
    connectTimeoutMS: z.number().min(1000).max(30000).default(10000),
    socketTimeoutMS: z.number().min(1000).max(30000).default(45000),
    enableCompression: z.boolean().default(true),
    ttl: z.number().min(60).max(31536000).default(86400),
});

export const persistorConfigSchema = z.discriminatedUnion('type', [
    memoryPersistorConfigSchema,
    mongodbPersistorConfigSchema,
]);

export type PersistorType = z.infer<typeof persistorTypeSchema>;
export type BasePersistorConfig = z.infer<typeof basePersistorConfigSchema>;
export type MemoryPersistorConfig = z.infer<typeof memoryPersistorConfigSchema>;
export type MongoDBPersistorConfig = z.infer<
    typeof mongodbPersistorConfigSchema
>;

export type PersistorConfig = z.infer<typeof persistorConfigSchema>;

// multi-kernel-manager.ts
/**
 * Kernel specification for different purposes
 */
export interface KernelSpec {
    kernelId: string;
    namespace: string;
    workflow: Workflow;
    needsPersistence: boolean;
    needsSnapshots: boolean;
    quotas?: KernelConfig['quotas'];
    performance?: KernelConfig['performance'];
    runtimeConfig?: KernelConfig['runtimeConfig'];
}

/**
 * Cross-kernel event bridge configuration
 */
export interface CrossKernelBridge {
    fromNamespace: string;
    toNamespace: string;
    eventPattern: string;
    transform?: (event: AnyEvent) => AnyEvent;
    enableLogging?: boolean;
}

/**
 * Multi-kernel manager configuration
 */
export interface MultiKernelConfig {
    tenantId: string;
    kernels: KernelSpec[];
    bridges?: CrossKernelBridge[];
    global?: {
        persistorType?: PersistorType;
        persistorOptions?: Record<string, unknown>;
        enableCrossKernelLogging?: boolean;
        maxConcurrentKernels?: number;
    };
}

/**
 * Kernel instance with metadata
 */
export interface ManagedKernel {
    spec: KernelSpec;
    instance: ExecutionKernel | null;
    status: 'initializing' | 'running' | 'paused' | 'failed' | 'stopped';
    startTime: number;
    lastActivity: number;
    eventCount: number;
}

//persistor/index.ts
export interface Persistor {
    /**
     * Appends a snapshot to the persistent store.
     *
     * @param s - The snapshot to append.
     * @param options - Optional parameters for snapshot persistence.
     * @returns A promise that resolves when the operation is complete.
     */
    append(s: Snapshot, options?: SnapshotOptions): Promise<void>;

    /**
     * Loads all snapshots associated with a given execution context ID.
     * Snapshots should be iterable in the order they were appended.
     *
     * @param xcId - The execution context ID.
     * @returns An async iterable of snapshots.
     */
    load(xcId: string): AsyncIterable<Snapshot>;

    /**
     * Checks if a snapshot with the given hash already exists in the store.
     * This can be used to avoid storing duplicate snapshots.
     *
     * @param hash - The deterministic hash of the snapshot's content.
     * @returns A promise that resolves to `true` if the snapshot exists, `false` otherwise.
     */
    has(hash: string): Promise<boolean>;

    /**
     * Load a specific snapshot by hash.
     * Optional method for enhanced functionality.
     *
     * @param hash - The hash of the snapshot to load.
     * @returns The snapshot or null if not found.
     */
    getByHash?(hash: string): Promise<Snapshot | null>;

    /**
     * List all snapshot hashes for an execution context.
     * Optional method for enhanced functionality.
     *
     * @param xcId - The execution context ID.
     * @returns Array of snapshot hashes.
     */
    listHashes?(xcId: string): Promise<string[]>;

    /**
     * Get storage statistics.
     * Optional method for monitoring and debugging.
     *
     * @returns Storage statistics.
     */
    getStats?(): Promise<PersistorStats>;
}

// kernel.ts
export interface KernelState {
    // Identification
    id: string; // tenant:job format
    tenantId: TenantId;
    correlationId: CorrelationId;
    jobId: string;

    // Context management (ISOLATED PER TENANT)
    contextData: Record<string, unknown>;
    stateData: Record<string, unknown>;

    // Execution state (ATOMIC)
    status: 'initialized' | 'running' | 'paused' | 'completed' | 'failed';
    startTime: number;
    eventCount: number;

    // Quota tracking
    quotas: {
        maxEvents?: number;
        maxDuration?: number;
        maxMemory?: number;
    };

    // IDEMPOTENCY & ATOMICITY
    operationId?: string; // Para garantir idempotência
    lastOperationHash?: string; // Hash da última operação
    pendingOperations: Set<string>; // Operações em andamento
}

/**
 * Kernel Configuration
 */
export interface KernelConfig {
    tenantId: TenantId;
    jobId?: string;

    // REQUIRED: Workflow for execution
    workflow: Workflow;

    // Context configuration
    // TODO: Remove contextFactory - using ContextBuilder instead

    // Persistence
    persistor?: Persistor;

    // Runtime configuration (delegado para runtime)
    runtimeConfig?: RuntimeConfig;

    // Quotas
    quotas?: {
        maxEvents?: number;
        maxDuration?: number;
        maxMemory?: number;
    };

    // Performance optimizations
    performance?: {
        enableBatching?: boolean;
        batchSize?: number;
        batchTimeoutMs?: number;
        enableCaching?: boolean;
        cacheSize?: number;
        enableLazyLoading?: boolean;
        contextUpdateDebounceMs?: number;
        autoSnapshot?: {
            enabled?: boolean;
            intervalMs?: number;
            eventInterval?: number;
            useDelta?: boolean;
        };
    };

    // ISOLATION & ATOMICITY
    isolation?: {
        enableTenantIsolation?: boolean; // Isolamento completo por tenant
        enableEventIsolation?: boolean; // Isolamento de eventos
        enableContextIsolation?: boolean; // Isolamento de contexto
        maxConcurrentOperations?: number; // Limite de operações concorrentes
    };

    // IDEMPOTENCY
    idempotency?: {
        enableOperationIdempotency?: boolean; // Idempotência por operação
        enableEventIdempotency?: boolean; // Idempotência de eventos
        operationTimeout?: number; // Timeout para operações
        maxRetries?: number; // Máximo de retentativas
    };

    // Options
    debug?: boolean;
    monitor?: boolean;
}

// snapshot.ts

export const snapshotSchema = z.object({
    xcId: z.string(),
    ts: z.number(),
    events: z.array(z.unknown()), // ✅ Zod v4: Mais type-safe que z.any()
    state: z.unknown(),
    hash: z.string(),
});

// Extended schema for delta snapshots
export const deltaSnapshotSchema = snapshotSchema.extend({
    isDelta: z.literal(true),
    baseHash: z.string(),
    eventsDelta: z.unknown().optional(),
    stateDelta: z.unknown().optional(),
});

export type ExtendedContext = BaseContext & { jobId?: string };

// runtime/index.ts
/**
 * Configuração do Runtime - Simplificada
 */
export interface RuntimeConfig {
    // Core settings
    queueSize?: number; // Default: 1000
    batchSize?: number; // Default: 100
    enableObservability?: boolean; // Default: true

    // Event processing limits
    maxEventDepth?: number; // Default: 100
    maxEventChainLength?: number; // Default: 1000

    // Memory management
    cleanupInterval?: number; // Default: 2min
    staleThreshold?: number; // Default: 10min
    memoryMonitor?: MemoryMonitorConfig;

    // Middleware pipeline
    middleware?: Middleware[];

    // Delivery guarantees (simplified)
    enableAcks?: boolean; // Default: true (controls ACK/NACK system)
    ackTimeout?: number; // Default: 30s

    // Multi-tenant support
    tenantId?: string;

    // Persistence (unified configuration)
    persistor?: Persistor;
    executionId?: string;

    // Queue configuration (direct access to EventQueue config)
    queueConfig?: Partial<EventQueueConfig>;

    // Event Store configuration
    enableEventStore?: boolean; // Default: false
    eventStoreConfig?: {
        persistorType?: PersistorType;
        persistorOptions?: Record<string, unknown>;
        replayBatchSize?: number;
        maxStoredEvents?: number;
    };

    // Batching configuration
    batching?: {
        enabled?: boolean; // Default: false
        defaultBatchSize?: number; // Default: 50
        defaultBatchTimeout?: number; // Default: 100ms
        maxBatchSize?: number; // Default: 1000
        flushOnEventTypes?: string[]; // Event types that trigger immediate flush
    };
}

/**
 * Opções de emissão de eventos
 */
export interface EmitOptions {
    deliveryGuarantee?: 'at-most-once' | 'at-least-once' | 'exactly-once';
    priority?: number;
    timeout?: number;
    retryPolicy?: {
        maxRetries: number;
        backoff: 'linear' | 'exponential';
        initialDelay: number;
    };
    correlationId?: string;
    tenantId?: string;

    // Batching options
    batch?: boolean; // Enable batching for this event
    batchSize?: number; // Override default batch size
    batchTimeout?: number; // Override default batch timeout (ms)
    flushBatch?: boolean; // Force flush the batch after this event
}

/**
 * Resultado da emissão
 */
export interface EmitResult {
    success: boolean;
    eventId: string;
    queued: boolean;
    error?: Error;
    correlationId?: string;
}

/**
 * Runtime - Interface principal
 */
export interface Runtime {
    // Event handling
    on(eventType: EventType, handler: EventHandler<AnyEvent>): void;
    emit<T extends EventType>(
        eventType: T,
        data?: EventPayloads[T],
        options?: EmitOptions,
    ): EmitResult;
    emitAsync<T extends EventType>(
        eventType: T,
        data?: EventPayloads[T],
        options?: EmitOptions,
    ): Promise<EmitResult>;
    off(eventType: EventType, handler: EventHandler<AnyEvent>): void;

    // Processing
    process(withStats?: boolean): Promise<void | {
        processed: number;
        acked: number;
        failed: number;
    }>;

    // ACK/NACK para delivery guarantees
    ack(eventId: string): Promise<void>;
    nack(eventId: string, error?: Error): Promise<void>;

    // Event factory
    createEvent<T extends EventType>(
        type: T,
        data?: EventPayloads[T],
    ): Event<T>;

    // Stream processing
    createStream<S extends AnyEvent>(
        generator: () => AsyncGenerator<S>,
    ): EventStream<S>;

    // Multi-tenant
    forTenant(tenantId: string): Runtime;

    // Statistics
    getStats(): Record<string, unknown>;
    getRecentEvents?(limit?: number): Array<{
        eventId: string;
        eventType: string;
        timestamp: number;
        correlationId?: string;
    }>;

    // Enhanced queue access (if available)
    getEnhancedQueue?(): EventQueue | null;
    getQueueSnapshot?(limit?: number): Array<{
        eventId: string;
        eventType: string;
        priority: number;
        retryCount: number;
        timestamp: number;
        correlationId?: string;
        tenantId?: string;
    }>;
    reprocessFromDLQ?(eventId: string): Promise<boolean>;
    reprocessDLQByCriteria?(criteria: {
        maxAge?: number;
        limit?: number;
        eventType?: string;
    }): Promise<{ reprocessedCount: number; events: AnyEvent[] }>;

    // Event Store access
    getEventStore?(): EventStore | null;
    replayEvents?(
        fromTimestamp: number,
        options?: {
            toTimestamp?: number;
            onlyUnprocessed?: boolean;
            batchSize?: number;
        },
    ): AsyncGenerator<AnyEvent[]>;

    // Cleanup
    clear(): void;
    cleanup(): Promise<void>;
}

// runtime/middleware/types.ts

/**
 * TrackedEventHandler interface for runtime tracking integration
 */
export interface TrackedEventHandler<TEvent extends Event = Event>
    extends EventHandler<TEvent> {
    _handlerId?: string;
    _lastUsed?: number;
    _isActive?: boolean;
}

/**
 * Type guard to check if handler is a TrackedEventHandler
 */
export function isTrackedEventHandler<TEvent extends Event = Event>(
    handler: EventHandler<TEvent>,
): handler is TrackedEventHandler<TEvent> {
    return (
        typeof handler === 'function' &&
        ('_handlerId' in handler ||
            '_lastUsed' in handler ||
            '_isActive' in handler)
    );
}

/**
 * Utility type to make specific properties optional in tracked handlers
 */
export type OptionalTrackedProperties<T> = T &
    Partial<
        Pick<TrackedEventHandler, '_handlerId' | '_lastUsed' | '_isActive'>
    >;

/**
 * Type-safe property copier for tracked handlers
 */
export function copyTrackedProperties<TEvent extends Event = Event>(
    source: EventHandler<TEvent>,
    target: EventHandler<TEvent>,
): void {
    if (isTrackedEventHandler(source)) {
        const targetWithTracking = target as OptionalTrackedProperties<
            EventHandler<TEvent>
        >;

        if (source._handlerId !== undefined) {
            targetWithTracking._handlerId = source._handlerId;
        }
        if (source._isActive !== undefined) {
            targetWithTracking._isActive = source._isActive;
        }
        if (source._lastUsed !== undefined) {
            targetWithTracking._lastUsed = source._lastUsed;
        }
    }
}

/**
 * Type-safe tracking updater
 */
export function updateTrackedHandler<TEvent extends Event = Event>(
    handler: EventHandler<TEvent>,
): void {
    if (isTrackedEventHandler(handler)) {
        handler._lastUsed = Date.now();
    }
}

/**
 * Base middleware function type
 * A middleware takes a handler and returns an enhanced handler
 */
export type MiddlewareKind = 'pipeline' | 'handler';

export type Middleware<TEvent extends Event = Event> = ((
    handler: EventHandler<TEvent>,
) => EventHandler<TEvent>) & {
    kind?: MiddlewareKind;
    /**
     * DO NOT write to Function.name at runtime (read-only in many environments).
     * Use displayName for custom labeling, and keep name as the intrinsic function name.
     */
    name?: string;
    displayName?: string;
};

/**
 * Configurable middleware factory
 * Takes configuration and returns a middleware
 */
export type MiddlewareFactoryType<TConfig, TEvent extends Event = Event> = (
    config: TConfig,
) => Middleware<TEvent>;

/**
 * Composable middleware chain
 */
export type MiddlewareChain<TEvent extends Event = Event> = {
    use<TMiddleware extends Middleware<TEvent>>(
        middleware: TMiddleware,
    ): MiddlewareChain<TEvent>;

    apply(handler: EventHandler<TEvent>): EventHandler<TEvent>;
};

/**
 * Type-safe middleware composition
 */
export function composeMiddleware<TEvent extends Event = Event>(
    ...middlewares: Array<Middleware<TEvent>>
): Middleware<TEvent> {
    return (handler: EventHandler<TEvent>) => {
        return middlewares.reduceRight(
            (acc, middleware) => middleware(acc),
            handler,
        );
    };
}

/**
 * Create a middleware chain builder
 */
export function createMiddlewareChain<
    TEvent extends Event = Event,
>(): MiddlewareChain<TEvent> {
    const middlewares: Array<Middleware<TEvent>> = [];

    return {
        use(middleware: Middleware<TEvent>) {
            middlewares.push(middleware);
            return this;
        },

        apply(handler: EventHandler<TEvent>) {
            return composeMiddleware(...middlewares)(handler);
        },
    };
}

/**
 * Type guard for middleware configuration
 */
export function isMiddlewareConfig<T>(
    value: unknown,
    validator: (v: unknown) => v is T,
): value is T {
    return validator(value);
}

/**
 * Middleware error with context
 */
export class MiddlewareError extends Error {
    constructor(
        public readonly middleware: string,
        message: string,
        public readonly context?: Record<string, unknown>,
    ) {
        super(`[${middleware}] ${message}`);
        this.name = 'MiddlewareError';
    }
}

/**
 * Type-safe middleware wrapper with error handling and tracking integration
 */
export function safeMiddleware<TEvent extends Event = Event>(
    name: string,
    middleware: Middleware<TEvent>,
): Middleware<TEvent> {
    return (handler: EventHandler<TEvent>) => {
        const enhancedHandler = async (event: TEvent) => {
            const startTime = Date.now();

            try {
                const wrappedHandler = middleware(handler);
                const result = await wrappedHandler(event);

                // Update tracking if handler is TrackedEventHandler
                updateTrackedHandler(handler);

                return result;
            } catch (error) {
                // Update error tracking if handler is TrackedEventHandler
                updateTrackedHandler(handler);

                throw new MiddlewareError(
                    name,
                    error instanceof Error ? error.message : String(error),
                    {
                        event,
                        originalError: error,
                        executionTime: Date.now() - startTime,
                        middleware: name,
                    },
                );
            }
        };

        // Copy tracking properties if original handler has them
        copyTrackedProperties(handler, enhancedHandler);

        return enhancedHandler;
    };
}

/**
 * Utility type to extract event type from handler
 */
export type ExtractEventType<T> = T extends EventHandler<infer E> ? E : never;

/**
 * Utility type to extract return type from handler
 */
export type ExtractReturnType<T> =
    T extends EventHandler<Event, infer R> ? R : never;

/**
 * Advanced middleware composition types for type-safe chaining
 */

/**
 * Conditional middleware type that applies only to specific event types
 */
// Removido definição duplicada de ConditionalMiddleware

/**
 * Transform middleware that changes event type
 */
export type TransformMiddleware<TInput extends Event, TOutput extends Event> = (
    handler: EventHandler<TOutput>,
) => EventHandler<TInput>;

/**
 * Async middleware for handling promises and async operations
 */
export type AsyncMiddleware<TEvent extends Event = Event> = (
    handler: EventHandler<TEvent>,
) => EventHandler<TEvent, Promise<Event | void>>;

/**
 * Middleware with context support for sharing data between middleware
 */
export interface MiddlewareContext {
    readonly startTime: number;
    readonly middlewareChain: string[];
    data: Record<string, unknown>;
    event: AnyEvent;
    observability: ObservabilitySystem;
    metadata?: Record<string, unknown>;
}

export type ContextAwareMiddleware<TEvent extends Event = Event> = (
    handler: EventHandler<TEvent>,
    context: MiddlewareContext,
) => EventHandler<TEvent>;

/**
 * Pipeline of typed middleware with context
 */
export class MiddlewarePipelineClass<TEvent extends Event = Event> {
    private middlewares: Array<{
        name: string;
        middleware: Middleware<TEvent> | ContextAwareMiddleware<TEvent>;
        isContextAware: boolean;
    }> = [];

    add<TMid extends Middleware<TEvent>>(name: string, middleware: TMid): this;
    add<TMid extends ContextAwareMiddleware<TEvent>>(
        name: string,
        middleware: TMid,
    ): this;
    add(
        name: string,
        middleware: Middleware<TEvent> | ContextAwareMiddleware<TEvent>,
    ): this {
        const isContextAware = middleware.length > 1;
        this.middlewares.push({ name, middleware, isContextAware });
        return this;
    }

    build(): Middleware<TEvent> {
        return (handler: EventHandler<TEvent>) => {
            const context: MiddlewareContext = {
                startTime: Date.now(),
                middlewareChain: this.middlewares.map((m) => m.name),
                data: {},
                event: {} as AnyEvent,
                observability: {} as ObservabilitySystem,
            };

            return this.middlewares.reduceRight<EventHandler<TEvent>>(
                (acc, { middleware, isContextAware }) => {
                    if (isContextAware) {
                        return (middleware as ContextAwareMiddleware<TEvent>)(
                            acc,
                            context,
                        );
                    } else {
                        return (middleware as Middleware<TEvent>)(acc);
                    }
                },
                handler,
            );
        };
    }
}

/**
 * Type-safe middleware factory with configuration validation
 */
export function createTypedMiddlewareFactory<
    TConfig,
    TEvent extends Event = Event,
>(
    name: string,
    configValidator: ConfigValidator<TConfig>,
    factory: (config: TConfig) => Middleware<TEvent>,
): MiddlewareFactoryType<TConfig, TEvent> {
    return (config: TConfig) => {
        if (!configValidator.validate(config)) {
            throw new MiddlewareError(name, 'Invalid configuration provided', {
                config,
            });
        }

        const parsedConfig = configValidator.parse(config);
        return safeMiddleware(name, factory(parsedConfig));
    };
}

/**
 * Type-safe middleware config validator
 */
export interface ConfigValidator<T> {
    validate(config: unknown): config is T;
    parse(config: unknown): T;
}

/**
 * Create a config validator
 */
export function createConfigValidator<T>(schema: {
    validate: (value: unknown) => boolean;
    parse: (value: unknown) => T;
}): ConfigValidator<T> {
    return {
        validate: (config): config is T => schema.validate(config),
        parse: (config) => schema.parse(config),
    };
}

/**
 * Advanced TypeScript utility types for middleware system
 */

/**
 * Branded type for middleware identification
 */
export type Brand<T, B> = T & { readonly __brand: B };

/**
 * Middleware execution priority
 */
export type MiddlewarePriority = Brand<number, 'MiddlewarePriority'>;

export const createPriority = (value: number): MiddlewarePriority => {
    if (value < 0 || value > 100) {
        throw new Error('Middleware priority must be between 0 and 100');
    }
    return value as MiddlewarePriority;
};

/**
 * Middleware metadata for advanced composition
 */
export interface MiddlewareMetadata {
    readonly name: string;
    readonly version: string;
    readonly priority: MiddlewarePriority;
    readonly eventTypes: readonly string[];
    readonly dependencies: readonly string[];
    readonly tags: readonly string[];
}

/**
 * Tagged middleware with metadata
 */
export interface TaggedMiddleware<TEvent extends Event = Event> {
    readonly metadata: MiddlewareMetadata;
    readonly middleware: Middleware<TEvent>;
}

/**
 * Middleware registry with dependency resolution
 */
export class MiddlewareRegistry<TEvent extends Event = Event> {
    private registry = new Map<string, TaggedMiddleware<TEvent>>();

    register(tagged: TaggedMiddleware<TEvent>): void {
        if (this.registry.has(tagged.metadata.name)) {
            throw new MiddlewareError(
                'Registry',
                `Middleware '${tagged.metadata.name}' is already registered`,
            );
        }

        this.registry.set(tagged.metadata.name, tagged);
    }

    resolve(names: string[]): Middleware<TEvent>[] {
        const resolved = new Set<string>();
        const result: TaggedMiddleware<TEvent>[] = [];

        const resolveDeps = (name: string): void => {
            if (resolved.has(name)) return;

            const middleware = this.registry.get(name);
            if (!middleware) {
                throw new MiddlewareError(
                    'Registry',
                    `Middleware '${name}' not found`,
                );
            }

            // Resolve dependencies first
            for (const dep of middleware.metadata.dependencies) {
                resolveDeps(dep);
            }

            resolved.add(name);
            result.push(middleware);
        };

        names.forEach(resolveDeps);

        // Sort by priority (higher priority first)
        result.sort((a, b) => b.metadata.priority - a.metadata.priority);

        return result.map((m) => m.middleware);
    }

    findByTag(tag: string): TaggedMiddleware<TEvent>[] {
        return Array.from(this.registry.values()).filter((m) =>
            m.metadata.tags.includes(tag),
        );
    }

    findByEventType(eventType: string): TaggedMiddleware<TEvent>[] {
        return Array.from(this.registry.values()).filter(
            (m) =>
                m.metadata.eventTypes.includes(eventType) ||
                m.metadata.eventTypes.includes('*'),
        );
    }
}

/**
 * Conditional type for middleware applicability
 */
export type MiddlewareApplicableFor<TMiddleware, TEvent extends Event> =
    TMiddleware extends Middleware<infer E>
        ? TEvent extends E
            ? TMiddleware
            : never
        : never;

/**
 * Type-level middleware composition validation
 */
export type ValidMiddlewareChain<
    TEvent extends Event,
    TMiddlewares extends readonly Middleware<TEvent>[],
> = {
    readonly [K in keyof TMiddlewares]: MiddlewareApplicableFor<
        TMiddlewares[K],
        TEvent
    >;
};

/**
 * Higher-order type for creating typed middleware builders
 */
export interface MiddlewareBuilder<TEvent extends Event = Event> {
    withMetadata(metadata: Omit<MiddlewareMetadata, 'name'>): this;
    withPriority(priority: number): this;
    withDependencies(...deps: string[]): this;
    withTags(...tags: string[]): this;
    build(
        name: string,
        middleware: Middleware<TEvent>,
    ): TaggedMiddleware<TEvent>;
}

/**
 * Create a middleware builder
 */
export function createMiddlewareBuilder<
    TEvent extends Event = Event,
>(): MiddlewareBuilder<TEvent> {
    const metadata: {
        version: string;
        priority: MiddlewarePriority;
        eventTypes: string[];
        dependencies: string[];
        tags: string[];
    } = {
        version: '1.0.0',
        priority: createPriority(50),
        eventTypes: ['*'],
        dependencies: [],
        tags: [],
    };

    return {
        withMetadata(meta) {
            Object.assign(metadata, meta);
            return this;
        },

        withPriority(priority) {
            metadata.priority = createPriority(priority);
            return this;
        },

        withDependencies(...deps) {
            metadata.dependencies.length = 0;
            metadata.dependencies.push(...deps);
            return this;
        },

        withTags(...tags) {
            metadata.tags.length = 0;
            metadata.tags.push(...tags);
            return this;
        },

        build(name, middleware) {
            return {
                metadata: {
                    name,
                    version: metadata.version,
                    priority: metadata.priority,
                    eventTypes: [...metadata.eventTypes],
                    dependencies: [...metadata.dependencies],
                    tags: [...metadata.tags],
                },
                middleware,
            };
        },
    };
}

/**
 * @module runtime/middleware/types
 * @description Tipos para middlewares do runtime
 */

/**
 * Função do middleware
 */
export type MiddlewareFunction = (
    context: MiddlewareContext,
    next: () => Promise<void>,
) => Promise<void>;

/**
 * Condição para aplicar middleware
 */
export type MiddlewareCondition = (
    context: MiddlewareContext,
) => boolean | Promise<boolean>;

/**
 * Middleware com condição
 */
export interface ConditionalMiddleware {
    middleware: MiddlewareFunction;
    condition: MiddlewareCondition;
    name?: string;
    priority?: number; // Prioridade de execução (menor = maior prioridade)
}

/**
 * Configuração do middleware
 */
export interface MiddlewareConfig {
    name?: string;
    enabled?: boolean;
    condition?: MiddlewareCondition;
    priority?: number;
    metadata?: Record<string, unknown>;
}

/**
 * Pipeline de middlewares
 */
export type MiddlewarePipeline = (MiddlewareFunction | ConditionalMiddleware)[];

/**
 * Resultado da execução do middleware
 */
export interface MiddlewareResult {
    success: boolean;
    error?: Error;
    metadata?: Record<string, unknown>;
    executionTime?: number;
    middlewareName?: string;
}

/**
 * Estatísticas do middleware
 */
export interface MiddlewareStats {
    name: string;
    executions: number;
    errors: number;
    avgExecutionTime: number;
    lastExecution?: Date;
    conditions?: {
        applied: number;
        skipped: number;
    };
}

/**
 * Configuração de retry
 */
export interface RetryConfig extends MiddlewareConfig {
    maxAttempts?: number;
    backoffMs?: number;
    maxBackoffMs?: number;
    retryableErrors?: string[];
    nonRetryableErrors?: string[];
}

/**
 * Configuração de timeout
 */
export interface TimeoutConfig extends MiddlewareConfig {
    timeoutMs?: number;
    errorMessage?: string;
}

/**
 * Configuração de concorrência
 */
export interface ConcurrencyConfig extends MiddlewareConfig {
    maxConcurrent?: number;
    key?: string | ((context: MiddlewareContext) => string);
    queueTimeoutMs?: number;
    dropOnTimeout?: boolean;
}

/**
 * Configuração de validação
 */
export interface ValidationConfig extends MiddlewareConfig {
    schema?: unknown; // Zod schema
    validateEvent?: boolean;
    validateContext?: boolean;
    strict?: boolean;
}

/**
 * Configuração de observabilidade
 */
export interface ObservabilityConfig extends MiddlewareConfig {
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    includeMetadata?: boolean;
    includeStack?: boolean;
    customMetrics?: string[];
}

/**
 * Configuração de cache
 */
export interface CacheConfig extends MiddlewareConfig {
    ttlMs?: number;
    key?: string | ((context: MiddlewareContext) => string);
    storage?: 'memory' | 'custom';
    maxSize?: number;
}

/**
 * Configuração de rate limiting
 */
export interface RateLimitConfig extends MiddlewareConfig {
    maxRequests?: number;
    windowMs?: number;
    key?: string | ((context: MiddlewareContext) => string);
    strategy?: 'token-bucket' | 'leaky-bucket' | 'fixed-window';
}

/**
 * Configuração de circuit breaker
 */
export interface CircuitBreakerConfig extends MiddlewareConfig {
    failureThreshold?: number;
    recoveryTimeoutMs?: number;
    halfOpenMaxAttempts?: number;
    errorThreshold?: number;
}

/**
 * Configuração de compressão
 */
export interface CompressionConfig extends MiddlewareConfig {
    algorithm?: 'gzip' | 'brotli' | 'deflate';
    threshold?: number; // Tamanho mínimo para comprimir
    level?: number; // Nível de compressão
}

/**
 * Configuração de criptografia
 */
export interface EncryptionConfig extends MiddlewareConfig {
    algorithm?: 'aes-256-gcm' | 'chacha20-poly1305';
    key?: string | ((context: MiddlewareContext) => string);
    encryptFields?: string[];
    decryptFields?: string[];
}

/**
 * Configuração de transformação
 */
export interface TransformConfig extends MiddlewareConfig {
    transform?: (context: MiddlewareContext) => Promise<MiddlewareContext>;
    validate?: (context: MiddlewareContext) => Promise<boolean>;
    rollback?: (context: MiddlewareContext) => Promise<void>;
}

/**
 * Configuração de monitoramento
 */
export interface MonitoringConfig extends MiddlewareConfig {
    metrics?: string[];
    alerts?: {
        threshold: number;
        condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
        action: 'log' | 'alert' | 'callback';
    }[];
    healthCheck?: () => Promise<boolean>;
}

/**
 * Configuração de segurança
 */
export interface SecurityConfig extends MiddlewareConfig {
    sanitize?: boolean;
    validateOrigin?: boolean;
    rateLimit?: RateLimitConfig;
    encryption?: EncryptionConfig;
    audit?: boolean;
}

/**
 * Configuração de performance
 */
export interface PerformanceConfig extends MiddlewareConfig {
    profiling?: boolean;
    memoryTracking?: boolean;
    cpuTracking?: boolean;
    slowQueryThreshold?: number;
    optimization?: {
        enableCaching?: boolean;
        enableCompression?: boolean;
        enableBatching?: boolean;
    };
}

/**
 * Configuração de resiliência
 */
export interface ResilienceConfig extends MiddlewareConfig {
    retry?: RetryConfig;
    circuitBreaker?: CircuitBreakerConfig;
    timeout?: TimeoutConfig;
    fallback?: (context: MiddlewareContext) => Promise<void>;
}

/**
 * Configuração completa de middleware
 */
export interface CompleteMiddlewareConfig {
    retry?: RetryConfig;
    timeout?: TimeoutConfig;
    concurrency?: ConcurrencyConfig;
    validation?: ValidationConfig;
    observability?: ObservabilityConfig;
    cache?: CacheConfig;
    rateLimit?: RateLimitConfig;
    circuitBreaker?: CircuitBreakerConfig;
    compression?: CompressionConfig;
    encryption?: EncryptionConfig;
    transform?: TransformConfig;
    monitoring?: MonitoringConfig;
    security?: SecurityConfig;
    performance?: PerformanceConfig;
    resilience?: ResilienceConfig;
    custom?: Record<string, MiddlewareConfig>;
}

/**
 * Factory de middleware condicional
 */
export interface MiddlewareFactory {
    createRetryMiddleware(config?: RetryConfig): ConditionalMiddleware;
    createTimeoutMiddleware(config?: TimeoutConfig): ConditionalMiddleware;
    createConcurrencyMiddleware(
        config?: ConcurrencyConfig,
    ): ConditionalMiddleware;
    createValidationMiddleware(
        config?: ValidationConfig,
    ): ConditionalMiddleware;
    createObservabilityMiddleware(
        config?: ObservabilityConfig,
    ): ConditionalMiddleware;
    createCacheMiddleware(config?: CacheConfig): ConditionalMiddleware;
    createRateLimitMiddleware(config?: RateLimitConfig): ConditionalMiddleware;
    createCircuitBreakerMiddleware(
        config?: CircuitBreakerConfig,
    ): ConditionalMiddleware;
    createCompressionMiddleware(
        config?: CompressionConfig,
    ): ConditionalMiddleware;
    createEncryptionMiddleware(
        config?: EncryptionConfig,
    ): ConditionalMiddleware;
    createTransformMiddleware(config?: TransformConfig): ConditionalMiddleware;
    createMonitoringMiddleware(
        config?: MonitoringConfig,
    ): ConditionalMiddleware;
    createSecurityMiddleware(config?: SecurityConfig): ConditionalMiddleware;
    createPerformanceMiddleware(
        config?: PerformanceConfig,
    ): ConditionalMiddleware;
    createResilienceMiddleware(
        config?: ResilienceConfig,
    ): ConditionalMiddleware;
    createCustomMiddleware(
        middleware: MiddlewareFunction,
        config?: MiddlewareConfig,
    ): ConditionalMiddleware;
}

/**
 * Utilitários para condições
 */
export interface ConditionUtils {
    /**
     * Aplicar middleware apenas para tipos específicos de evento
     */
    forEventTypes(types: string[]): MiddlewareCondition;

    /**
     * Aplicar middleware apenas para eventos com prioridade específica
     */
    forPriority(minPriority: number, maxPriority?: number): MiddlewareCondition;

    /**
     * Aplicar middleware apenas para eventos com tamanho específico
     */
    forEventSize(minSize: number, maxSize?: number): MiddlewareCondition;

    /**
     * Aplicar middleware apenas para eventos com metadata específica
     */
    forMetadata(key: string, value: unknown): MiddlewareCondition;

    /**
     * Aplicar middleware apenas para eventos com contexto específico
     */
    forContext(
        predicate: (context: MiddlewareContext) => boolean,
    ): MiddlewareCondition;

    /**
     * Aplicar middleware apenas em horários específicos
     */
    forTimeWindow(startHour: number, endHour: number): MiddlewareCondition;

    /**
     * Aplicar middleware apenas para eventos com origem específica
     */
    forOrigin(origins: string[]): MiddlewareCondition;

    /**
     * Aplicar middleware apenas para eventos com tenant específico
     */
    forTenant(tenants: string[]): MiddlewareCondition;

    /**
     * Combinar múltiplas condições com AND
     */
    and(...conditions: MiddlewareCondition[]): MiddlewareCondition;

    /**
     * Combinar múltiplas condições com OR
     */
    or(...conditions: MiddlewareCondition[]): MiddlewareCondition;

    /**
     * Negar uma condição
     */
    not(condition: MiddlewareCondition): MiddlewareCondition;

    /**
     * Aplicar middleware com probabilidade específica
     */
    withProbability(probability: number): MiddlewareCondition;

    /**
     * Aplicar middleware apenas para eventos críticos
     */
    forCriticalEvents(): MiddlewareCondition;

    /**
     * Aplicar middleware apenas para eventos de debug
     */
    forDebugEvents(): MiddlewareCondition;

    /**
     * Aplicar middleware apenas para eventos de produção
     */
    forProductionEvents(): MiddlewareCondition;
}

// runtime/core/memoryMonitor.ts

export interface MemoryMonitorConfig {
    /**
     * Intervalo de monitoramento em ms
     * @default 30000 (30 segundos)
     */
    intervalMs?: number;

    /**
     * Thresholds de alerta (em MB)
     */
    thresholds?: {
        /**
         * Alerta quando heap usado excede este valor
         * @default 512 MB
         */
        heapUsed?: number;

        /**
         * Alerta quando RSS excede este valor
         * @default 1024 MB
         */
        rss?: number;

        /**
         * Alerta quando external memory excede este valor
         * @default 256 MB
         */
        external?: number;

        /**
         * Alerta quando heap total excede este valor
         * @default 1024 MB
         */
        heapTotal?: number;
    };

    /**
     * Configuração de detecção de memory leaks
     */
    leakDetection?: {
        /**
         * Habilitar detecção de memory leaks
         * @default true
         */
        enabled?: boolean;

        /**
         * Número de amostras para detectar leak
         * @default 10
         */
        samples?: number;

        /**
         * Crescimento mínimo em MB para considerar leak
         * @default 50
         */
        minGrowthMb?: number;

        /**
         * Intervalo entre amostras em ms
         * @default 60000 (1 minuto)
         */
        sampleIntervalMs?: number;
    };

    /**
     * Habilitar monitoramento
     * @default true
     */
    enabled?: boolean;

    /**
     * Callback para alertas customizados
     */
    onAlert?: (alert: MemoryAlert) => void;
}

/**
 * Métricas de memória
 */
export interface MemoryMetrics {
    /**
     * Timestamp da medição
     */
    timestamp: number;

    /**
     * Heap usado (bytes)
     */
    heapUsed: number;

    /**
     * Heap total (bytes)
     */
    heapTotal: number;

    /**
     * Heap livre (bytes)
     */
    heapFree: number;

    /**
     * RSS - Resident Set Size (bytes)
     */
    rss: number;

    /**
     * Memória externa (bytes)
     */
    external: number;

    /**
     * Array buffers (bytes)
     */
    arrayBuffers: number;

    /**
     * Uso de memória em MB (calculado)
     */
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
    externalMb: number;

    /**
     * Percentual de uso do heap
     */
    heapUsagePercent: number;
}

/**
 * Alerta de memória
 */
export interface MemoryAlert {
    /**
     * Tipo de alerta
     */
    type: 'THRESHOLD_EXCEEDED' | 'MEMORY_LEAK_DETECTED' | 'HIGH_USAGE';

    /**
     * Severidade
     */
    severity: 'WARNING' | 'ERROR' | 'CRITICAL';

    /**
     * Mensagem do alerta
     */
    message: string;

    /**
     * Métricas atuais
     */
    metrics: MemoryMetrics;

    /**
     * Threshold que foi excedido (se aplicável)
     */
    threshold?: number;

    /**
     * Crescimento detectado (se aplicável)
     */
    growth?: {
        samples: number;
        growthMb: number;
        growthPercent: number;
    };

    /**
     * Timestamp do alerta
     */
    timestamp: number;
}

/**
 * Estatísticas do monitor
 */
export interface MemoryMonitorStats {
    /**
     * Número total de medições
     */
    totalMeasurements: number;

    /**
     * Número de alertas gerados
     */
    totalAlerts: number;

    /**
     * Última medição
     */
    lastMeasurement?: MemoryMetrics;

    /**
     * Pico de uso de memória
     */
    peakUsage: {
        heapUsed: number;
        rss: number;
        external: number;
        timestamp: number;
    };

    /**
     * Média de uso nos últimos 10 minutos
     */
    averageUsage: {
        heapUsed: number;
        rss: number;
        external: number;
    };

    /**
     * Memory leaks detectados
     */
    leaksDetected: number;

    /**
     * Status do monitor
     */
    isRunning: boolean;

    /**
     * Próxima medição em ms
     */
    nextMeasurementIn: number;
}

// runtime/event-store.ts

export interface EventStoreConfig {
    executionId: string;
    enableReplay?: boolean; // Default: true
    replayBatchSize?: number; // Default: 100
    maxStoredEvents?: number; // Default: 10000

    // Persistor config (usa factory existente)
    persistor?: Persistor;
    persistorType?: PersistorType; // Default: memory
    persistorOptions?: Record<string, unknown>;

    // Observability
    enableObservability?: boolean; // Default: true
}

/**
 * Metadata do evento para replay
 */
export interface EventMetadata {
    eventId: string;
    eventType: string;
    timestamp: number;
    processed: boolean;
    processingAttempts: number;
    lastProcessedAt?: number;
}

/**
 * Resultado do replay
 */
export interface ReplayResult {
    totalEvents: number;
    replayedEvents: number;
    skippedEvents: number;
    startTime: number;
    endTime: number;
    fromTimestamp: number;
    toTimestamp?: number;
}

// event-queue.ts
export interface EventQueueConfig {
    // Configuração baseada em recursos (0.0 - 1.0)
    maxMemoryUsage?: number; // % máxima de uso de memória (default: 0.8 = 80%)
    maxCpuUsage?: number; // % máxima de uso de CPU (default: 0.7 = 70%)
    maxQueueDepth?: number; // Profundidade máxima da fila (default: sem limite)

    // Configuração de processamento
    enableObservability?: boolean;
    batchSize?: number;
    chunkSize?: number;
    maxConcurrent?: number;

    // Event Size Awareness
    largeEventThreshold?: number;
    hugeEventThreshold?: number;
    enableCompression?: boolean;
    maxEventSize?: number;
    dropHugeEvents?: boolean;

    // === PERSISTENCE FEATURES (from DurableEventQueue) ===
    enablePersistence?: boolean; // Default: false
    persistor?: Persistor;
    executionId?: string;
    persistCriticalEvents?: boolean; // Default: true
    persistAllEvents?: boolean; // Default: false
    maxPersistedEvents?: number; // Default: 1000
    enableAutoRecovery?: boolean; // Default: true
    recoveryBatchSize?: number; // Default: 100
    criticalEventTypes?: string[]; // Events types to always persist
    criticalEventPrefixes?: string[]; // Event prefixes to always persist (default: ['agent.', 'workflow.'])

    // === EVENT STORE INTEGRATION ===
    enableEventStore?: boolean; // Default: false
    //TODO: melhor pratica?
    eventStore?: EventStore; // Event store instance

    // Global concurrency control (used when integrated via Runtime)
    enableGlobalConcurrency?: boolean; // Default: false

    // Processed events cache size (for dedup)
    maxProcessedEvents?: number; // Default: 10000
}

/**
 * Métricas de recursos do sistema
 */
export interface SystemMetrics {
    timestamp: number; // Timestamp da medição
    memoryUsage: number; // 0.0 - 1.0
    cpuUsage: number; // 0.0 - 1.0
    queueDepth: number;
    processingRate: number; // eventos/segundo
    averageProcessingTime: number; // ms
}

/**
 * Item da fila com metadados
 */
export interface QueueItem {
    event: AnyEvent;
    timestamp: number;
    priority: number;
    retryCount: number;
    size?: number;
    isLarge?: boolean;
    isHuge?: boolean;
    compressed?: boolean;
    originalSize?: number;

    // Persistence metadata
    persistent?: boolean;
    persistedAt?: number;

    // Retry metadata
    lastRetryAt?: number;
    nextRetryAt?: number;
    retryDelays?: number[];
    originalError?: string;
}

/**
 * Snapshot simplificado de itens na fila (para debug/observabilidade)
 */
export interface QueueItemSnapshot {
    eventId: string;
    eventType: string;
    priority: number;
    retryCount: number;
    timestamp: number;
    correlationId?: string;
    tenantId?: string;
}

// event-processor-optimized.ts
/**
 * Configuração do processador otimizado
 */
export interface OptimizedEventProcessorConfig {
    maxEventDepth?: number;
    maxEventChainLength?: number;
    enableObservability?: boolean;
    middleware?: Middleware[];
    batchSize?: number;
    cleanupInterval?: number;
    staleThreshold?: number;
    operationTimeoutMs?: number; // Usar DEFAULT_TIMEOUT_MS como padrão
}

/**
 * Handler com tracking para otimização
 */
export interface TrackedEventHandler extends EventHandler<AnyEvent> {
    _handlerId?: string;
    _lastUsed?: number;
    _isActive?: boolean;
}

/**
 * Mapa otimizado de handlers
 */
export interface OptimizedHandlerMap {
    exact: Map<string, TrackedEventHandler[]>;
    wildcard: TrackedEventHandler[];
    patterns: Map<RegExp, TrackedEventHandler[]>;
    _cleanupTimer?: NodeJS.Timeout;
}

/**
 * Contexto de processamento com tracking
 */
export interface EventProcessingContext {
    depth: number;
    eventChain: EventChainTracker;
    startTime: number;
    correlationId?: string;
}

export interface CircularBuffer<T> {
    items: T[];
    head: number;
    tail: number;
    size: number;
    capacity: number;
}

// event-factory.ts

// ===== WORKFLOW EVENT FACTORY TYPE =====
type WorkflowEventFactory = <P = void, K extends EventType = EventType>(
    name?: K,
) => EventDef<P, K>;

/**
 * Factory de eventos para workflow
 */
export const workflowEvent: WorkflowEventFactory = <
    P = void,
    K extends EventType = EventType,
>(
    name?: K,
) => {
    const type = name ?? (IdGenerator.callId().slice(5) as K);

    const def: EventDef<P, K> = {
        type: type,
        with(data: P): Event<K> {
            return {
                id: IdGenerator.callId(),
                type: type,
                threadId: `workflow-${Date.now()}`,
                data: (data ?? {}) as EventPayloads[K],
                ts: Date.now(),
            };
        },
        include(ev): ev is Event<K> {
            return ev.type === type;
        },
    };
    return def;
};

/**
 * Verificar se um evento é de um grupo de tipos
 */
export const isEventTypeGroup = (
    event: AnyEvent,
    types: EventType[],
): boolean => {
    return types.includes(event.type);
};

/**
 * Extrair dados de um evento com type safety
 */
export const extractEventData = <T extends EventType>(
    event: AnyEvent,
    type: T,
): EventPayloads[T] | undefined => {
    if (event.type === type) {
        return event.data === undefined
            ? ({} as EventPayloads[T])
            : (event.data as EventPayloads[T]);
    }
    return undefined;
};

// runtime/core/circuit-breaker.ts
/**
 * Estados do Circuit Breaker
 */
export enum CircuitState {
    CLOSED = 'CLOSED',
    OPEN = 'OPEN',
    HALF_OPEN = 'HALF_OPEN',
}

/**
 * Configuração do Circuit Breaker
 */
export interface CircuitBreakerConfig {
    /**
     * Nome do circuito (identificador único)
     */
    name: string;

    /**
     * Número de falhas consecutivas para abrir o circuito
     * @default 5
     */
    failureThreshold?: number;

    /**
     * Tempo em ms para tentar reabrir o circuito (half-open)
     * @default 60000 (1 minuto)
     */
    recoveryTimeout?: number;

    /**
     * Número de tentativas de sucesso para fechar o circuito
     * @default 3
     */
    successThreshold?: number;

    /**
     * Timeout para operações individuais
     * @default 60000 (60 segundos)
     */
    operationTimeout?: number;

    /**
     * Habilitar monitoramento
     * @default true
     */
    enabled?: boolean;

    /**
     * Callback para mudanças de estado
     */
    onStateChange?: (state: CircuitState, previousState: CircuitState) => void;

    /**
     * Callback para falhas
     */
    onFailure?: (error: Error, context?: unknown) => void;

    /**
     * Callback para sucessos
     */
    onSuccess?: (result: unknown, context?: unknown) => void;
}

/**
 * Métricas do Circuit Breaker
 */
export interface CircuitMetrics {
    /**
     * Estado atual
     */
    state: CircuitState;

    /**
     * Número total de chamadas
     */
    totalCalls: number;

    /**
     * Número de chamadas bem-sucedidas
     */
    successfulCalls: number;

    /**
     * Número de chamadas que falharam
     */
    failedCalls: number;

    /**
     * Número de chamadas rejeitadas (circuito aberto)
     */
    rejectedCalls: number;

    /**
     * Taxa de sucesso (0-1)
     */
    successRate: number;

    /**
     * Taxa de falha (0-1)
     */
    failureRate: number;

    /**
     * Última falha
     */
    lastFailure?: {
        timestamp: number;
        error: string;
    };

    /**
     * Último sucesso
     */
    lastSuccess?: {
        timestamp: number;
    };

    /**
     * Tempo desde a última mudança de estado
     */
    timeInCurrentState: number;

    /**
     * Próxima tentativa de reabertura (se aplicável)
     */
    nextAttempt?: number;
}

/**
 * Resultado de uma operação do Circuit Breaker
 */
export interface CircuitResult<T> {
    /**
     * Resultado da operação (se bem-sucedida)
     */
    result?: T;

    /**
     * Erro (se falhou)
     */
    error?: Error;

    /**
     * Estado do circuito após a operação
     */
    state: CircuitState;

    /**
     * Se a operação foi executada
     */
    executed: boolean;

    /**
     * Se foi rejeitada pelo circuito
     */
    rejected: boolean;

    /**
     * Duração da operação em ms
     */
    duration: number;
}

// core/errors.ts
/**
 * Core Error Types
 *
 * This module defines the error types used throughout the SDK.
 * All errors follow a consistent pattern for better error handling and debugging.
 */

/**
 * Error codes used by the kernel
 */
export type KernelErrorCode =
    | 'RETRY_EXCEEDED'
    | 'TIMEOUT_EXCEEDED'
    | 'ABORTED'
    | 'VALIDATION_ERROR'
    | 'UNKNOWN'
    | 'INTERNAL_ERROR'
    | 'KERNEL_QUOTA_EXCEEDED'
    | 'KERNEL_CONTEXT_CORRUPTION'
    | 'KERNEL_STATE_SYNC_FAILED'
    | 'KERNEL_INITIALIZATION_FAILED'
    | 'KERNEL_SHUTDOWN_FAILED'
    | 'KERNEL_OPERATION_TIMEOUT';

/**
 * Error codes for runtime operations
 */
export type RuntimeErrorCode =
    | 'EVENT_LOOP_DETECTED'
    | 'EVENT_CHAIN_TOO_LONG'
    | 'CIRCULAR_EVENT_DETECTED'
    | 'CONTEXT_NOT_INITIALIZED'
    | 'WORKFLOW_ABORTED'
    | 'BUFFER_OVERFLOW'
    | 'HANDLER_NOT_FOUND'
    | 'STREAM_ERROR'
    | 'RUNTIME_EVENT_PROCESSING_TIMEOUT'
    | 'RUNTIME_MIDDLEWARE_CHAIN_BROKEN'
    | 'RUNTIME_STREAM_BUFFER_FULL'
    | 'RUNTIME_EVENT_QUEUE_FULL'
    | 'RUNTIME_MEMORY_EXCEEDED'
    | 'RUNTIME_PROCESSING_FAILED';

/**
 * Error codes for engine operations
 */
export type EngineErrorCode =
    | 'AGENT_ERROR'
    | 'TOOL_ERROR'
    | 'WORKFLOW_ERROR'
    | 'STEP_FAILED'
    | 'TOOL_NOT_FOUND'
    | 'INVALID_TOOL_INPUT'
    | 'AGENT_TIMEOUT'
    | 'WORKFLOW_CYCLE_DETECTED'
    | 'EXECUTION_TIMEOUT'
    | 'AGENT_LOOP_DETECTED'
    | 'ENGINE_AGENT_INITIALIZATION_FAILED'
    | 'ENGINE_TOOL_EXECUTION_TIMEOUT'
    | 'ENGINE_WORKFLOW_VALIDATION_FAILED'
    | 'ENGINE_PLANNING_FAILED'
    | 'ENGINE_ROUTING_FAILED'
    | 'ENGINE_COORDINATION_FAILED'
    | 'LLM_ERROR';

/**
 * Error codes for middleware operations
 */
export type MiddlewareErrorCode =
    | 'CONCURRENCY_DROP'
    | 'CONCURRENCY_TIMEOUT'
    | 'SCHEDULE_ERROR'
    | 'STATE_ERROR'
    | 'MIDDLEWARE_INIT_ERROR'
    | 'MIDDLEWARE_VALIDATION_FAILED'
    | 'MIDDLEWARE_RETRY_EXCEEDED'
    | 'MIDDLEWARE_CIRCUIT_BREAKER_OPEN'
    | 'MIDDLEWARE_TIMEOUT_ERROR'
    | 'MIDDLEWARE_RATE_LIMIT_EXCEEDED';

/**
 * Error codes for orchestration operations
 */
export type OrchestrationErrorCode =
    | 'ORCHESTRATION_AGENT_NOT_FOUND'
    | 'ORCHESTRATION_TOOL_NOT_FOUND'
    | 'ORCHESTRATION_WORKFLOW_NOT_FOUND'
    | 'ORCHESTRATION_INVALID_CONFIGURATION'
    | 'ORCHESTRATION_TENANT_NOT_FOUND'
    | 'ORCHESTRATION_PERMISSION_DENIED'
    | 'ORCHESTRATION_RESOURCE_LIMIT_EXCEEDED'
    | 'ORCHESTRATION_OPERATION_FAILED';

/**
 * All possible error codes
 */
export type ErrorCode =
    | KernelErrorCode
    | RuntimeErrorCode
    | EngineErrorCode
    | MiddlewareErrorCode
    | OrchestrationErrorCode;

/**
 * Base error interface for all SDK errors
 */
export interface SDKErrorOptions<T extends ErrorCode = ErrorCode> {
    code: T;
    message?: string;
    cause?: Error | unknown;
    context?: Record<string, unknown>;
    recoverable?: boolean;
    retryable?: boolean;
}

// observability/logger.ts

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
    [key: string]: unknown;
}

export type LogContextProvider = () => LogContext | undefined;
export let globalLogContextProvider: LogContextProvider | undefined;

/**
 * Log processor type for external processing (e.g. MongoDB export)
 */
export type LogProcessor = (
    level: LogLevel,
    message: string,
    component: string,
    context?: LogContext,
    error?: Error,
) => void;

export const globalLogProcessors: LogProcessor[] = [];
export const isProcessingLog = false;

export interface Logger {
    debug(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, error?: Error, context?: LogContext): void;
}

// observability/telemetry.ts
export interface TelemetryConfig {
    enabled: boolean;
    serviceName: string;
    serviceVersion?: string;
    environment?: string;

    // Sampling configuration
    sampling: {
        rate: number; // 0.0 to 1.0
        strategy: 'probabilistic';
    };

    // Custom attributes applied to all spans
    globalAttributes?: Record<string, string | number | boolean>;

    // Feature flags
    features: {
        traceEvents: boolean;
        traceKernel: boolean;
        traceSnapshots: boolean;
        tracePersistence: boolean;
        metricsEnabled: boolean;
    };

    // External tracer integration
    externalTracer?: Tracer;

    // Privacy flags
    privacy?: {
        includeSensitiveData?: boolean;
    };

    // Span timeout behavior (apenas para InMemoryTracer)
    spanTimeouts?: {
        enabled?: boolean; // default: true
        maxDurationMs?: number; // default: 5m
    };
}

/**
 * OpenTelemetry-compatible span interface
 */
export interface Span {
    // Core span operations
    setAttribute(key: string, value: string | number | boolean): Span;
    setAttributes(attributes: Record<string, string | number | boolean>): Span;
    setStatus(status: SpanStatus): Span;
    recordException(exception: Error): Span;
    addEvent(name: string, attributes?: Record<string, unknown>): Span;
    end(endTime?: number): void;

    // Span context
    getSpanContext(): SpanContext;
    isRecording(): boolean;
}

/**
 * Span status
 */
export interface SpanStatus {
    code: 'ok' | 'error' | 'timeout';
    message?: string;
}

/**
 * Span context for correlation
 */
export interface SpanContext {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    traceFlags: number;
}

/**
 * OpenTelemetry-compatible tracer interface
 */
export interface Tracer {
    startSpan(name: string, options?: SpanOptions): Span;
    createSpanContext(traceId: string, spanId: string): SpanContext;
}

/**
 * Span creation options
 */
export interface SpanOptions {
    kind?: SpanKind;
    parent?: SpanContext;
    attributes?: Record<string, string | number | boolean>;
    startTime?: number;
}

/**
 * Span kinds following OTEL specification
 */
export type SpanKind =
    | 'internal'
    | 'server'
    | 'client'
    | 'producer'
    | 'consumer';

/**
 * Metrics interface
 */
export interface Metrics {
    counter(
        name: string,
        value: number,
        attributes?: Record<string, string>,
    ): void;
    histogram(
        name: string,
        value: number,
        attributes?: Record<string, string>,
    ): void;
    gauge(
        name: string,
        value: number,
        attributes?: Record<string, string>,
    ): void;
}

// observability/monitoring.ts

// Tipos auxiliares para métricas
export type MetricValue = number | string | boolean;

/**
 * Métricas essenciais do Kernel
 */
export interface KernelMetrics {
    // Lifecycle básico
    lifecycle: {
        startTime: number;
        status: 'initialized' | 'running' | 'paused' | 'completed' | 'failed';
        eventCount: number;
        pauseCount: number;
        resumeCount: number;
    };
}

/**
 * Métricas essenciais do Runtime
 */
export interface RuntimeMetrics {
    // Event Processing básico
    eventProcessing: {
        totalEvents: number;
        processedEvents: number;
        failedEvents: number;
        averageProcessingTimeMs: number;
    };

    // Performance básica
    performance: {
        memoryUsageBytes: number;
        cpuUsagePercent: number;
    };
}

/**
 * Métricas essenciais do Engine
 */
export interface EngineMetrics {
    // Agent Operations - ESSENCIAL
    agentOperations: {
        totalAgents: number;
        activeAgents: number;
        agentExecutions: number;
        agentSuccesses: number;
        agentFailures: number;
        averageAgentExecutionTimeMs: number;
    };

    // Tool Operations - ESSENCIAL
    toolOperations: {
        totalTools: number;
        activeTools: number;
        toolCalls: number;
        toolSuccesses: number;
        toolFailures: number;
        averageToolExecutionTimeMs: number;
    };

    // Workflow Operations - ESSENCIAL
    workflowOperations: {
        totalWorkflows: number;
        activeWorkflows: number;
        workflowExecutions: number;
        workflowSuccesses: number;
        workflowFailures: number;
        averageWorkflowExecutionTimeMs: number;
    };
}

/**
 * Métricas consolidadas do sistema
 */
export interface SystemMetrics {
    kernel: KernelMetrics;
    runtime: RuntimeMetrics;
    engine: EngineMetrics;

    // System health
    health: {
        overallHealth: 'healthy' | 'degraded' | 'unhealthy';
        lastHealthCheck: number;
        uptimeMs: number;
        memoryUsageBytes: number;
        cpuUsagePercent: number;
    };
}

/**
 * Configuração do sistema de métricas
 */
export interface MetricsConfig {
    enabled: boolean;
    collectionIntervalMs: number;
    retentionPeriodMs: number;
    enableRealTime: boolean;
    enableHistorical: boolean;
    maxMetricsHistory: number;
    exportFormats: ('json' | 'prometheus' | 'statsd')[];
}

// observability/index.ts
/**
 * OpenTelemetry-compatible context
 */
export interface OtelContext {
    traceId?: string;
    spanId?: string;
    parentSpanId?: string;
    correlationId?: string;
    [key: string]: unknown;
}

/**
 * Unified observability configuration
 */
export interface ObservabilityConfig {
    enabled: boolean;
    environment: 'development' | 'production' | 'test';
    debug: boolean;
    logging?: {
        enabled?: boolean;
        level?: LogLevel;
        outputs?: string[];
        filePath?: string;
    };
    telemetry?: Partial<TelemetryConfig>;
    monitoring?: Partial<MonitoringConfig>;
    debugging?: Partial<DebugConfig>;
    mongodb?: {
        type: 'mongodb';
        connectionString?: string;
        database?: string;
        collections?: {
            logs?: string;
            telemetry?: string;
            metrics?: string;
            errors?: string;
        };
        batchSize?: number;
        flushIntervalMs?: number;
        ttlDays?: number;
        enableObservability?: boolean;
    };
    correlation?: {
        enabled: boolean;
        generateIds: boolean;
        propagateContext: boolean;
    };
}

/**
 * Observability context for correlated operations
 */
export interface ObservabilityContext extends OtelContext {
    tenantId?: string;
    executionId?: string;
    sessionId?: string; // ✅ NEW: Link to session for proper hierarchy
    metadata?: Record<string, unknown>;
}

/**
 * Resource leak information
 */
export interface ResourceLeak {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    timestamp: number;
}

/**
 * Unified observability interface
 */
export interface ObservabilityInterface {
    logger: Logger;
    telemetry: TelemetrySystem;
    monitor: ResourceMonitor | null;
    debug: DebugSystem;
    createContext(correlationId?: string): ObservabilityContext;
    setContext(context: ObservabilityContext): void;
    getContext(): ObservabilityContext | undefined;
    clearContext(): void;

    trace<T>(
        name: string,
        fn: () => T | Promise<T>,
        context?: Partial<ObservabilityContext>,
    ): Promise<T>;
    measure<T>(
        name: string,
        fn: () => T | Promise<T>,
        category?: string,
    ): Promise<{ result: T; duration: number }>;

    logError(
        error: Error | BaseSDKError,
        message: string,
        context?: Partial<ObservabilityContext>,
    ): void;
    wrapAndLogError(
        error: unknown,
        code: ErrorCode,
        message?: string,
        context?: Partial<ObservabilityContext>,
    ): BaseSDKError;

    getHealthStatus(): HealthStatus;
    generateReport(): UnifiedReport;

    updateConfig(config: Partial<ObservabilityConfig>): void;

    flush(): Promise<void>;
    dispose(): Promise<void>;
}

/**
 * Health status interface
 */
export interface HealthStatus {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    components: {
        logging: { status: 'ok' | 'warning' | 'error'; message?: string };
        telemetry: { status: 'ok' | 'warning' | 'error'; message?: string };
        monitoring: { status: 'ok' | 'warning' | 'error'; message?: string };
        debugging: { status: 'ok' | 'warning' | 'error'; message?: string };
    };
    lastCheck: number;
}

/**
 * Unified observability report
 */
export interface UnifiedReport {
    timestamp: number;
    environment: string;
    health: HealthStatus;

    // Summary insights
    insights: {
        warnings: string[];
        recommendations: string[];
        criticalIssues: string[];
    };
}

/**
 * Default observability configuration
 */
export const DEFAULT_CONFIG: ObservabilityConfig = {
    enabled: true,
    environment: 'development',
    debug: false,

    logging: {
        enabled: true,
        level: 'warn',
        outputs: ['console'],
    },

    telemetry: {
        enabled: true,
        serviceName: 'kodus-flow',
        sampling: { rate: 1.0, strategy: 'probabilistic' },
        features: {
            traceEvents: true,
            traceKernel: true,
            traceSnapshots: false,
            tracePersistence: false,
            metricsEnabled: true,
        },
    },

    monitoring: {
        enabled: true,
        collectionIntervalMs: 30000,
        retentionPeriodMs: 24 * 60 * 60 * 1000, // 24 hours
        enableRealTime: true,
        enableHistorical: true,
        maxMetricsHistory: 1000,
        exportFormats: ['json'] as ('json' | 'prometheus' | 'statsd')[],
    },

    debugging: {
        enabled: false, // Disabled by default
        level: 'debug',
        features: {
            eventTracing: true,
            performanceProfiling: true,
            stateInspection: true,
            errorAnalysis: true,
        },
    },

    correlation: {
        enabled: true,
        generateIds: true,
        propagateContext: true,
    },
};

export interface TraceItem {
    name: string;
    context: SpanContext;
    attributes: Record<string, string | number | boolean>;
    startTime: number;
    endTime: number;
}

// ============================================================================
// DOMAIN SPAN HELPERS (padronizam nomes e atributos)
// ============================================================================

export type AgentPhase = 'think' | 'act' | 'observe' | 'analyze' | 'synthesize';

export interface AgentSpanAttributes {
    agentName: string;
    tenantId?: string;
    correlationId?: string;
    iteration?: number;
    attributes?: Record<string, string | number | boolean>;
}

export interface LLMSpanAttributes {
    model?: string;
    technique?: string;
    inputTokens?: number;
    outputTokens?: number;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    tenantId?: string;
    correlationId?: string;
    attributes?: Record<string, string | number | boolean>;
}

export interface ToolSpanAttributes {
    toolName: string;
    callId?: string;
    timeoutMs?: number;
    tenantId?: string;
    correlationId?: string;
    attributes?: Record<string, string | number | boolean>;
}

// middleware/timeout.ts
export interface TimeoutOptions {
    /**
     * Timeout in milliseconds
     * @default 30000 (30 seconds)
     */
    timeoutMs?: number;
}

// middleware/circuitBreaker.ts
export interface CircuitBreakerMiddlewareConfig extends CircuitBreakerConfig {
    /**
     * Chave para identificar o circuito (opcional, usa event.type se não fornecido)
     */
    circuitKey?: string;

    /**
     * Função para gerar chave do circuito baseada no evento
     */
    keyGenerator?: (event: unknown) => string;

    /**
     * Função para determinar se o evento deve ser protegido
     */
    shouldProtect?: (event: unknown) => boolean;

    /**
     * Callback para quando operação é rejeitada
     */
    onRejected?: (event: unknown, result: CircuitResult<unknown>) => void;
}

// middleware/validate.ts
export type EventHandler<E extends Event = Event> = (
    event: E,
) => Promise<Event | void> | Event | void;

/**
 * Type for any schema-like object that has a parse method
 */
export interface SchemaLike {
    parse: (data: unknown) => unknown;
    safeParse: (data: unknown) => { success: boolean; error?: unknown };
}

/**
 * Options for the validate middleware
 */
export interface ValidateOptions {
    /**
     * Whether to throw an error on validation failure
     * @default true
     */
    throwOnError?: boolean;

    /**
     * Custom error code to use when validation fails
     * @default 'VALIDATION_ERROR'
     */
    errorCode?: KernelErrorCode;
}

// middleware/schedule.ts
export interface ScheduleOptions {
    /**
     * Interval in milliseconds between event triggers
     */
    intervalMs: number;

    /**
     * Maximum number of times to trigger the event (optional)
     * If not provided, the event will be triggered indefinitely
     */
    maxTriggers?: number;

    /**
     * Whether to trigger the event immediately upon registration
     * Default: false (wait for first interval)
     */
    triggerImmediately?: boolean;

    /**
     * Function to generate event data for each trigger
     * If not provided, the original event data will be used
     */
    generateData?: (triggerCount: number, originalEvent: Event) => unknown;
}

/**
 * Default schedule options
 */
export const DEFAULT_SCHEDULE_OPTIONS: Partial<ScheduleOptions> = {
    triggerImmediately: false,
};

// middleware/concurrency.ts
export interface ConcurrencyOptions {
    maxConcurrent: number;
    getKey?: (ev: Event) => string;
    queueTimeoutMs?: number; // 0 = drop (default)
    emitMetrics?: boolean;
    context?: { cost?: { concurrencyDrops: number } };
}

// defaultOptions fora da função para não recriar
export const DEFAULT_OPTS: ConcurrencyOptions = {
    maxConcurrent: 5,
    getKey: (ev) => ev.type,
    queueTimeoutMs: 0,
    emitMetrics: true,
};

// middleware/composites.ts
export interface StandardMiddlewareOptions {
    retry?: Partial<RetryOptions> | boolean;
    timeout?: number;
    concurrency?: number;
    monitoring?: boolean;
}

// middleware/observability.ts

export interface ObservabilityOptions {
    namePrefix?: string;
    includeSensitiveData?: boolean;
    // Filtro opcional por tipo de evento
    includeEventTypes?: string[];
    excludeEventTypes?: string[];
}

// middleware/retry.ts

export const DEFAULT: RetryOptions = {
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 5_000,
    maxTotalMs: 60_000, // ⬅️ novo
    backoffFactor: 2,
    jitter: true,
    retryableErrorCodes: ['NETWORK_ERROR', 'TIMEOUT_ERROR', 'TIMEOUT_EXCEEDED'],
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

export interface HasCostCtx {
    ctx?: { cost?: { retries: number } };
}

// runtime/constants.ts
/**
 * @module runtime/constants
 * @description Runtime constants and default configurations
 */

// ===== DEFAULT CONFIGURATIONS =====

/**
 * Default timeout configuration
 */
export const DEFAULT_TIMEOUT_MS = 60000; // ✅ UNIFIED: 60s timeout

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG = {
    maxRetries: 1,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    enableJitter: true,
    jitterRatio: 0.1,
};

/**
 * Default concurrency options
 */
export const DEFAULT_CONCURRENCY_OPTIONS = {
    /**
     * Maximum number of concurrent executions
     */
    maxConcurrent: 5,

    /**
     * Default concurrency mode
     */
    mode: 'drop' as 'drop' | 'wait',
};

// ===== HIGH PERFORMANCE CONFIGURATIONS =====

/**
 * High performance configuration for many executions
 * Optimized for enterprise workloads with thousands of concurrent operations
 */
export const HIGH_PERFORMANCE_CONFIG = {
    // === CONCURRENCY ===
    maxConcurrent: 100, // 100 execuções simultâneas (10x mais)
    maxConcurrentPerTenant: 50, // 50 por tenant
    maxConcurrentPerEventType: 25, // 25 por tipo de evento

    // === QUEUE SETTINGS ===
    queueSize: 10000, // 10k eventos na fila (10x mais)
    batchSize: 500, // 500 eventos por batch (5x mais)
    chunkSize: 100, // 100 por chunk

    // === MEMORY OPTIMIZATION ===
    maxMemoryUsage: 0.85, // 85% da memória (mais agressivo)
    maxCpuUsage: 0.8, // 80% da CPU (mais agressivo)
    enableCompression: true, // Compressão habilitada
    enableDeltaCompression: true, // Compressão delta

    // === RETRY OPTIMIZATION ===
    maxRetries: 2, // Menos retries para velocidade
    baseRetryDelay: 500, // Retry mais rápido
    maxRetryDelay: 10000, // Max retry menor

    // === PERSISTENCE ===
    enablePersistence: true, // Persistência habilitada
    persistCriticalEvents: true, // Eventos críticos sempre persistidos
    maxPersistedEvents: 5000, // 5k eventos persistidos

    // === CLEANUP ===
    cleanupInterval: 60000, // Cleanup a cada 1min
    staleThreshold: 300000, // 5min para stale handlers

    // === EVENT PROCESSING ===
    maxEventDepth: 200, // Profundidade maior
    maxEventChainLength: 2000, // Cadeia maior
    operationTimeoutMs: 15000, // Timeout menor para velocidade
};

/**
 * Ultra high performance configuration for extreme workloads
 * For systems with 10k+ concurrent operations
 */
export const ULTRA_HIGH_PERFORMANCE_CONFIG = {
    // === CONCURRENCY ===
    maxConcurrent: 500, // 500 execuções simultâneas
    maxConcurrentPerTenant: 100, // 100 por tenant
    maxConcurrentPerEventType: 50, // 50 por tipo de evento

    // === QUEUE SETTINGS ===
    queueSize: 50000, // 50k eventos na fila
    batchSize: 1000, // 1k eventos por batch
    chunkSize: 200, // 200 por chunk

    // === MEMORY OPTIMIZATION ===
    maxMemoryUsage: 0.9, // 90% da memória
    maxCpuUsage: 0.85, // 85% da CPU
    enableCompression: true,
    enableDeltaCompression: true,

    // === RETRY OPTIMIZATION ===
    maxRetries: 1, // Apenas 1 retry
    baseRetryDelay: 200, // Retry muito rápido
    maxRetryDelay: 5000, // Max retry pequeno

    // === PERSISTENCE ===
    enablePersistence: true,
    persistCriticalEvents: true,
    maxPersistedEvents: 10000, // 10k eventos persistidos

    // === CLEANUP ===
    cleanupInterval: 30000, // Cleanup a cada 30s
    staleThreshold: 180000, // 3min para stale handlers

    // === EVENT PROCESSING ===
    maxEventDepth: 500, // Profundidade muito maior
    maxEventChainLength: 5000, // Cadeia muito maior
    operationTimeoutMs: 10000, // Timeout muito menor
};

/**
 * Enterprise configuration for production workloads
 * Balanced between performance and stability
 */
export const ENTERPRISE_CONFIG = {
    // === CONCURRENCY ===
    maxConcurrent: 200, // 200 execuções simultâneas
    maxConcurrentPerTenant: 75, // 75 por tenant
    maxConcurrentPerEventType: 35, // 35 por tipo de evento

    // === QUEUE SETTINGS ===
    queueSize: 25000, // 25k eventos na fila
    batchSize: 750, // 750 eventos por batch
    chunkSize: 150, // 150 por chunk

    // === MEMORY OPTIMIZATION ===
    maxMemoryUsage: 0.8, // 80% da memória (conservador)
    maxCpuUsage: 0.75, // 75% da CPU (conservador)
    enableCompression: true,
    enableDeltaCompression: true,

    // === RETRY OPTIMIZATION ===
    maxRetries: 1, // 1 retry (padrão)
    baseRetryDelay: 1000, // Retry padrão
    maxRetryDelay: 20000, // Max retry padrão

    // === PERSISTENCE ===
    enablePersistence: true,
    persistCriticalEvents: true,
    maxPersistedEvents: 7500, // 7.5k eventos persistidos

    // === CLEANUP ===
    cleanupInterval: 90000, // Cleanup a cada 1.5min
    staleThreshold: 300000, // 5min para stale handlers

    // === EVENT PROCESSING ===
    maxEventDepth: 300, // Profundidade média
    maxEventChainLength: 3000, // Cadeia média
    operationTimeoutMs: 20000, // Timeout padrão
};

// ===== CONFIGURATION PRESETS =====

/**
 * Configuration presets for different use cases
 */
export const RUNTIME_PRESETS = {
    /**
     * Development configuration
     */
    development: {
        maxConcurrent: 10,
        queueSize: 1000,
        batchSize: 100,
        enablePersistence: false,
    },

    /**
     * Testing configuration
     */
    testing: {
        maxConcurrent: 5,
        queueSize: 500,
        batchSize: 50,
        enablePersistence: false,
        operationTimeoutMs: 5000,
    },

    /**
     * Production configuration
     */
    production: ENTERPRISE_CONFIG,

    /**
     * High performance configuration
     */
    highPerformance: HIGH_PERFORMANCE_CONFIG,

    /**
     * Ultra high performance configuration
     */
    ultraHighPerformance: ULTRA_HIGH_PERFORMANCE_CONFIG,
} as const;

// ===== MIDDLEWARE PRESETS =====

/**
 * Middleware presets for different performance needs
 */
export const MIDDLEWARE_PRESETS = {
    /**
     * Standard middleware for production
     */
    standard: ['timeout', 'retry', 'concurrency', 'validation'],

    /**
     * High performance middleware
     */
    highPerformance: ['timeout', 'concurrency', 'retry'],

    /**
     * Ultra high performance middleware (minimal)
     */
    ultraHighPerformance: ['timeout', 'concurrency'],
} as const;

// thread-safe-state.ts
export interface StateManager {
    get<T = unknown>(namespace: string, key: string): Promise<T | undefined>;
    set(namespace: string, key: string, value: unknown): Promise<void>;
    delete(namespace: string, key: string): Promise<boolean>;
    clear(namespace?: string): Promise<void>;
    has(namespace: string, key: string): Promise<boolean>;
    keys(namespace: string): Promise<string[]>;
    size(namespace?: string): Promise<number>;
}

export interface StateManagerStats {
    namespaceCount: number;
    totalKeys: number;
    memoryUsage: number;
    namespaces: Record<
        string,
        {
            keyCount: number;
            estimatedSize: number;
        }
    >;
}

//transaction-persistor.ts

export interface Transaction {
    id: string;
    begin(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    addOperation(op: TransactionOperation): void;
}

/**
 * Transaction operation
 */
export interface TransactionOperation {
    type: 'save' | 'delete' | 'update';
    data: Snapshot | DeltaSnapshot;
    options?: SnapshotOptions;
}

/**
 * Transaction state
 */
export interface TransactionState {
    id: string;
    operations: TransactionOperation[];
    status: 'pending' | 'committed' | 'rolled_back';
    startTime: number;
    endTime?: number;
}

// otel-adapter.ts
// Tipos soltos para evitar dependência rígida em @opentelemetry/* tipos
export type UnknownRecord = Record<string, unknown>;

export interface LooseOtelSpan {
    setAttribute: (k: string, v: unknown) => unknown;
    addEvent: (name: string, attributes?: UnknownRecord) => unknown;
    setStatus: (s: UnknownRecord) => unknown;
    recordException: (e: unknown) => unknown;
    end: (t?: number) => unknown;
    spanContext: () => { traceId: string; spanId: string; traceFlags: number };
    isRecording: () => boolean;
}

export interface LooseTracer {
    startSpan: (
        name: string,
        options?: UnknownRecord,
        ctx?: unknown,
    ) => LooseOtelSpan;
}

export interface LooseOtelAPI {
    trace: {
        getTracer: (name: string) => LooseTracer;
        setSpan: (ctx: unknown, span: unknown) => unknown;
    };
    context: { active: () => unknown };
}

// mongodb-exporter.ts

export interface MongoDBExporterConfig {
    // MongoDB connection
    connectionString: string;
    database: string;

    // Collections
    collections: {
        logs: string;
        telemetry: string;
        metrics: string;
        errors: string;
    };

    // Performance
    batchSize: number;
    flushIntervalMs: number;
    maxRetries: number;

    // Data retention
    ttlDays: number;

    // Observability
    enableObservability: boolean;
}

/**
 * Configuração de storage para observabilidade
 */
export interface ObservabilityStorageConfig {
    type: 'mongodb';
    connectionString: string;
    database: string;
    collections?: {
        logs?: string;
        telemetry?: string;
        metrics?: string;
        errors?: string;
    };
    batchSize?: number;
    flushIntervalMs?: number;
    ttlDays?: number;
    enableObservability?: boolean;
}

/**
 * Item de log para MongoDB
 */
export interface MongoDBLogItem {
    _id?: string;
    timestamp: Date;
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    component: string;
    correlationId?: string;
    tenantId?: string;
    executionId?: string;
    sessionId?: string; // ✅ NEW: Link to session for proper hierarchy
    metadata?: Record<string, unknown>;
    error?: {
        name: string;
        message: string;
        stack?: string;
    };
    createdAt: Date;
}

/**
 * Item de telemetry para MongoDB
 */
export interface MongoDBTelemetryItem {
    _id?: string;
    timestamp: Date;
    name: string;
    duration: number;
    correlationId?: string;
    tenantId?: string;
    executionId?: string;
    sessionId?: string; // ✅ NEW: Link to session for proper hierarchy
    agentName?: string;
    toolName?: string;
    phase?: 'think' | 'act' | 'observe';
    attributes: Record<string, string | number | boolean>;
    status: 'ok' | 'error';
    error?: {
        name: string;
        message: string;
        stack?: string;
    };
    createdAt: Date;
}

/**
 * Item de métricas para MongoDB
 */
export interface MongoDBMetricsItem {
    _id?: string;
    timestamp: Date;
    correlationId?: string;
    tenantId?: string;
    executionId?: string;
    metrics: SystemMetrics;
    createdAt: Date;
}

/**
 * Item de erro para MongoDB
 */
export interface MongoDBErrorItem {
    _id?: string;
    timestamp: Date;
    correlationId?: string;
    tenantId?: string;
    executionId?: string;
    sessionId?: string; // ✅ NEW: Link to session for proper hierarchy
    errorName: string;
    errorMessage: string;
    errorStack?: string;
    context: Record<string, unknown>;
    createdAt: Date;
}

// kernel/persistor.ts

// workflow-engine.ts
export interface Step<TInput = unknown, TOutput = unknown> {
    readonly name: string;
    readonly handler: (input: TInput, ctx: StepContext) => Promise<TOutput>;
}

// Step context
export interface StepContext {
    readonly executionId: string;
    readonly correlationId: string;
    readonly state: Map<string, unknown>;
    readonly logger: ReturnType<typeof createLogger>;
    getState<T = unknown>(key: string): T | undefined;
    setState<T = unknown>(key: string, value: T): void;
}

// Workflow definition
export interface WorkflowDefinition {
    readonly name: string;
    readonly steps: ReadonlyArray<Step<unknown, unknown>>;
    readonly metadata?: Readonly<Record<string, unknown>>;
}

// engine/core/kernel-handler.ts
/**
 * Resultado de execução (migrado do ExecutionEngine)
 */
export interface ExecutionResult<T = unknown> {
    status: 'completed' | 'failed' | 'paused';
    data?: T;
    error?: {
        message: string;
        details?: unknown;
    };
    metadata: {
        executionId: ExecutionId;
        duration: number;
        eventCount: number;
        snapshotId?: string;
    };
}

/**
 * Configuração do KernelHandler
 */
export interface KernelHandlerConfig {
    tenantId: string;
    debug?: boolean;
    monitor?: boolean;

    // Kernel configuration
    kernelConfig?: Partial<KernelConfig>;

    // Runtime configuration (passado para o Kernel)
    runtimeConfig?: {
        queueSize?: number;
        batchSize?: number;
        middleware?: Middleware[];
    };

    // Performance (passado para o Kernel)
    performance?: {
        enableBatching?: boolean;
        enableCaching?: boolean;
        enableLazyLoading?: boolean;
    };

    // Infinite loop protection
    loopProtection?: {
        enabled?: boolean;
        maxEventCount?: number;
        maxEventRate?: number;
        windowSize?: number;
        circuitBreakerConfig?: {
            failureThreshold?: number;
            timeout?: number;
            resetTimeout?: number;
        };
    };
}

/**
 * Interface para comunicação com Kernel
 */
export interface KernelHandlerInterface {
    // Lifecycle
    initialize(): Promise<void>;
    isInitialized(): boolean;
    cleanup(): Promise<void>;

    // Context management (via Kernel)
    getContext<T = unknown>(
        namespace: string,
        key: string,
        threadId?: string,
    ): T | undefined;
    setContext(
        namespace: string,
        key: string,
        value: unknown,
        threadId?: string,
    ): void;
    incrementContext(
        namespace: string,
        key: string,
        delta?: number,
        threadId?: string,
    ): number;

    // Event management (via Kernel → Runtime)
    emit<T extends EventType>(eventType: T, data?: unknown): void;
    on<T extends AnyEvent>(eventType: string, handler: EventHandler<T>): void;
    off(eventType: string, handler: EventHandler<AnyEvent>): void;

    // Stream processing (via Kernel → Runtime)
    createStream<S extends AnyEvent>(
        generator: () => AsyncGenerator<S>,
    ): unknown;

    // Workflow management
    registerWorkflow(workflow: Workflow): void;
    getWorkflowContext(): WorkflowContext | null;

    // State management (via Kernel)
    pause(reason?: string): Promise<string>;
    resume(snapshotId: string): Promise<void>;
    getStatus(): Record<string, unknown>;

    // Direct access (apenas Kernel, não Runtime)
    getKernel(): ExecutionKernel | null;

    // Execution methods (migrados do ExecutionEngine)
    run(startEvent: AnyEvent): Promise<ExecutionResult>;
    getExecutionStatus(): {
        executionId: ExecutionId;
        tenantId: string;
        status: Record<string, unknown>;
        uptime: number;
    };
}

// planner.ts

export type PlanningStrategy =
    | 'cot'
    | 'tot'
    | 'graph'
    | 'multi'
    | 'react'
    | 'ooda'
    | 'llm_hybrid';

/**
 * Tool parameters for plan steps
 */
export interface ToolParameters {
    input?: unknown;
    options?: Record<string, unknown>;
    timeout?: number;
    retry?: number;
}

/**
 * Agent parameters for plan steps
 */
export interface AgentParameters {
    input?: unknown;
    context?: Record<string, unknown>;
    options?: Record<string, unknown>;
    timeout?: number;
}

/**
 * Plan step parameters
 */
export interface PlanStepParameters {
    tool?: ToolParameters;
    agent?: AgentParameters;
    custom?: Record<string, unknown>;
}

/**
 * Plan step definition
 */
export interface PlanStep {
    id: string;
    description: string;
    // SDK-compatible properties
    tool?: ToolId; // ID da tool a ser executada
    agent?: AgentId; // ID do agent a ser delegado
    params?: PlanStepParameters; // Parâmetros tipados para tool/agent
    critical?: boolean; // Se o step é crítico para o plano
    retry?: number; // Número de tentativas permitidas
    // Original properties
    dependencies?: string[]; // IDs of steps this depends on
    estimatedDuration?: number;
    complexity?: 'low' | 'medium' | 'high';
    completed?: boolean;
    result?: unknown;

    // ===== 🚀 NEW: TOOL EXECUTION INTELLIGENCE =====
    executionHint?: ToolExecutionHint; // Dica de estratégia de execução
    canRunInParallel?: boolean; // Pode ser executado em paralelo
    toolDependencies?: string[]; // Dependencies específicas de tools
    resourceRequirements?: {
        memory?: 'low' | 'medium' | 'high';
        cpu?: 'low' | 'medium' | 'high';
        network?: 'low' | 'medium' | 'high';
    };
}

/**
 * Plan definition
 */
export interface Plan {
    id: string;
    goal: string | string[];
    strategy: PlanningStrategy;
    steps: PlanStep[];
    context: Record<string, unknown>;
    createdAt: number;
    agentName: string;
    status: 'created' | 'executing' | 'completed' | 'failed';
    // SDK-compatible property
    metadata?: Record<string, unknown>;
}

/**
 * Planner interface (MINHA IMPLEMENTAÇÃO)
 */
export interface Planner {
    name: string;
    strategy: PlanningStrategy;

    /**
     * Create plan from goal and context
     */
    createPlan(
        goal: string | string[],
        context: AgentContext,
        options?: PlannerOptions,
        callbacks?: PlannerCallbacks,
    ): Promise<Plan>;
}

/**
 * Planner options
 */
export interface PlannerOptions {
    maxSteps?: number;
    maxDepth?: number;
    beamWidth?: number; // For ToT
    temperature?: number; // For CoT
    timeout?: number;
    context?: Record<string, unknown>; // Additional context for planning
}

/**
 * Agent with planning capability
 */
export interface PlanningAgent {
    setPlanner(planner: Planner): void;
    getPlanner(): Planner | undefined;
}

/**
 * Callbacks para eventos do Planner
 */
export interface PlannerCallbacks {
    onPlanStart?: (
        goal: string | string[],
        context: AgentContext,
        strategy: PlanningStrategy,
    ) => void;
    onPlanStep?: (step: PlanStep, stepIndex: number, plan: Plan) => void;
    onPlanComplete?: (plan: Plan) => void;
    onPlanError?: (error: Error, plan?: Plan) => void;
    onReplan?: (plan: Plan, reason: string) => void;
}

/**
 * Planning context extension para ctx.plan() (SUA VISÃO)
 */
export interface PlanningContext {
    /**
     * 🎯 SUA VISÃO: Simple planning interface
     */
    plan(goal: string | string[], options?: PlannerOptions): Promise<Plan>;

    /**
     * Set planner strategy for this agent
     */
    setPlanner(strategy: PlanningStrategy): void;

    /**
     * Get current planner strategy
     */
    getPlanner(): PlanningStrategy;
}

/**
 * Planner strategy configuration (API Target V2)
 */
export interface PlannerStrategyConfig {
    prompt?: string;
    maxSteps?: number;
    maxBranches?: number;
    temperature?: number;
    evaluationFn?: (branch: unknown) => number;
}

/**
 * Planner configuration (API Target V2)
 */
export interface PlannerConfig {
    name: string;
    description?: string;

    // ✨ Multiple strategies with configs
    strategies?: {
        cot?: PlannerStrategyConfig;
        tot?: PlannerStrategyConfig;
        graph?: PlannerStrategyConfig;
        dynamic?: {
            fallbackStrategy: PlanningStrategy;
            complexityThreshold: number;
        };
    };

    // ✨ Auto strategy selection
    decideStrategy?: (input: unknown) => PlanningStrategy;

    // ✨ Plan structure definition
    planSchema?: z.ZodType;

    // ✨ Default options
    defaultOptions?: PlannerOptions;
}

// executor/plan-executor.ts
export interface PlanExecutorConfig {
    enableReWOO?: boolean;
    maxRetries?: number;
    maxExecutionRounds?: number;
}

export interface WrappedToolResult {
    result: {
        isError?: boolean;
        content: Array<{
            type: string;
            text: string;
        }>;
    };
}

export interface InnerToolResult {
    successful?: boolean;
    error?: string;
    data?: Record<string, unknown>;
}

export type PlanSignals = {
    failurePatterns?: string[];
    needs?: string[];
    noDiscoveryPath?: string[];
    errors?: string[];
    suggestedNextStep?: string;
};

export interface StepAnalysis {
    success: boolean;
    shouldReplan: boolean;
}

export interface ExecutionSummary {
    successfulSteps: string[];
    failedSteps: string[];
    skippedSteps: string[];
    allStepsProcessed: boolean;
    hasNoMoreExecutableSteps: boolean;
}

// agent-lifecycle.ts
export interface AgentRegistryEntry {
    agentName: string;
    tenantId: TenantId;
    status: AgentStatus;
    executionId?: ExecutionId;
    startedAt?: number;
    pausedAt?: number;
    stoppedAt?: number;
    snapshotId?: string;
    config?: Record<string, unknown>;
    context?: Record<string, unknown>;
    error?: Error;
    scheduleConfig?: AgentScheduleConfig;
    scheduleTimer?: NodeJS.Timeout;
}

/**
 * Estatísticas do lifecycle handler
 */
export interface LifecycleStats {
    totalAgents: number;
    agentsByStatus: Record<AgentStatus, number>;
    agentsByTenant: Record<string, number>;
    totalTransitions: number;
    totalErrors: number;
    uptime: number;
}

// agent-executor.ts

// agent-core.ts
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
    enableDebugging?: boolean;

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

// storage-session-adapter.ts
export type SessionForStorage = Omit<Session, 'createdAt' | 'lastActivity'> & {
    createdAt: string;
    lastActivity: string;
    createdAtTimestamp: number;
    lastActivityTimestamp: number;
};

export type SessionFromStorage = Omit<Session, 'createdAt' | 'lastActivity'> & {
    createdAt: string | number;
    lastActivity: string | number;
    createdAtTimestamp?: number;
    lastActivityTimestamp?: number;
};

export interface SessionAdapterConfig {
    adapterType: StorageEnum;
    connectionString?: string;
    options?: Record<string, unknown>;
    timeout?: number;
    retries?: number;
}

export interface SessionStorageItem extends BaseStorageItem {
    sessionData: SessionForStorage;
}

// context-builder.ts
export interface ContextBuilderConfig {
    memory?: {
        adapterType?: StorageEnum;
        adapterConfig?: {
            connectionString?: string;
            options?: Record<string, unknown>;
        };
    };
    session?: SessionConfig;
    snapshot?: {
        adapterType?: StorageEnum;
        adapterConfig?: {
            connectionString?: string;
            options?: Record<string, unknown>;
        };
    };
}

// memory/types.ts
export interface MemoryAdapterConfig {
    adapterType: StorageEnum;
    connectionString?: string;
    options?: Record<string, unknown>;
    timeout?: number;
    retries?: number;
}

/**
 * Memory adapter interface
 */
export interface MemoryAdapter {
    initialize(): Promise<void>;
    store(item: MemoryItem): Promise<void>;
    retrieve(id: string): Promise<MemoryItem | null>;
    search(query: MemoryQuery): Promise<MemoryItem[]>;
    delete(id: string): Promise<boolean>;
    clear(): Promise<void>;
    getStats(): Promise<{
        itemCount: number;
        totalSize: number;
        adapterType: string;
    }>;
    isHealthy(): Promise<boolean>;
    cleanup(): Promise<void>;
}

/**
 * Memory adapter types
 */
export type AdapterType = StorageEnum;

//vector-store.ts
export type DistanceMetric = 'cosine' | 'euclidean' | 'dot';

// direct-llm-adapter.ts

export const DEFAULT_LLM_SETTINGS = {
    // Temperature: Lower = more focused/deterministic, Higher = more creative
    temperature: 0, // Very focused for agent tasks (0.0-0.2 recommended for tools)

    // Max tokens: Sufficient for reasoning + action without waste
    maxTokens: 2500, // Increased for complex tool metadata and enhanced ReAct prompts

    // Universal stop tokens to prevent hallucination and maintain control
    stop: [
        // ReAct pattern stops
        'Observation:',
        '\nObservation',

        // Conversation boundaries
        'Human:',
        'User:',
        'Assistant:',
        '\nHuman:',
        '\nUser:',

        // Additional safety stops
        'System:',
        '\nSystem:',
        '<|endoftext|>',
        '<|im_end|>',
    ],
} as const;

/**
 * Temperature presets for different use cases
 */
export const TEMPERATURE_PRESETS = {
    DETERMINISTIC: 0.0, // Math, code generation, precise tasks
    FOCUSED: 0.1, // Agent planning, tool selection (DEFAULT)
    BALANCED: 0.3, // General Q&A with some variety
    CREATIVE: 0.7, // Creative writing, brainstorming
    EXPLORATORY: 0.9, // Maximum creativity, idea generation
} as const;

/**
 * Token limit presets
 */
export const TOKEN_PRESETS = {
    QUICK: 500, // Quick responses, tool calls
    STANDARD: 2500, // Standard agent reasoning (INCREASED for enhanced metadata)
    EXTENDED: 3500, // Complex multi-step reasoning
    MAXIMUM: 4500, // Maximum context (use sparingly)
    // ReAct-specific presets
    REACT_SIMPLE: 2000, // Simple ReAct with few tools
    REACT_COMPLEX: 3000, // Complex ReAct with many tools and rich metadata
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// 📋 LANGCHAIN NATIVE TYPES
// ──────────────────────────────────────────────────────────────────────────────

export interface LangChainMessage {
    role: string;
    content: string;
    name?: string;
    toolCallId?: string;
    toolCalls?: Array<{
        id: string;
        type: string;
        function: {
            name: string;
            arguments: string;
        };
    }>;
}

export interface LangChainOptions {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stop?: readonly string[] | string[];
    stream?: boolean;
    tools?: unknown[];
    toolChoice?: string;
}

export interface LangChainResponse {
    content: string;
    toolCalls?: Array<{
        id: string;
        type: string;
        function: {
            name: string;
            arguments: string;
        };
    }>;
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
    };
    additionalKwargs?: Record<string, unknown>;
}

export interface LangChainLLM {
    call(
        messages: LangChainMessage[],
        options?: LangChainOptions,
    ): Promise<LangChainResponse | string>;
    stream?(
        messages: LangChainMessage[],
        options?: LangChainOptions,
    ): AsyncGenerator<LangChainResponse | string>;
    name?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧠 PLANNING & ROUTING TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanningTechnique {
    name: string;
    description: string;
    responseParser: (response: string) => PlanningResult;
    options?: LangChainOptions;
}

export interface RoutingTechnique {
    name: string;
    description: string;
    systemPrompt: string;
    userPromptTemplate: string;
    responseParser: (response: string) => RoutingResult;
    options?: LangChainOptions;
}

export interface PlanningResult {
    strategy: string;
    goal: string;
    steps: Array<{
        id: string;
        description: string;
        tool?: string;
        arguments?: Record<string, unknown>;
        dependencies?: string[];
        type:
            | 'analysis'
            | 'action'
            | 'decision'
            | 'observation'
            | 'verification';
    }>;
    reasoning: string;
    estimatedTime?: number;
    signals?: {
        needs?: string[];
        noDiscoveryPath?: string[];
        errors?: string[];
        suggestedNextStep?: string;
    };
    audit?: string[];
}

export interface RoutingResult {
    strategy: string;
    selectedTool: string;
    confidence: number;
    reasoning: string;
    alternatives?: Array<{
        tool: string;
        confidence: number;
        reason: string;
    }>;
}

// response-validator.ts

/**
 * Schema for PlanStep in PlanningResult
 */
export const planStepSchema = {
    type: 'object',
    properties: {
        id: { type: 'string', pattern: '^[a-z0-9-]+$' }, // kebab-case
        description: { type: 'string', minLength: 1 },
        tool: { type: 'string', nullable: true },
        arguments: {
            type: 'object',
            additionalProperties: true,
            nullable: true,
        },
        dependencies: {
            type: 'array',
            items: { type: 'string' },
            nullable: true,
        },
        type: {
            type: 'string',
            enum: [
                'analysis',
                'action',
                'decision',
                'observation',
                'verification',
            ],
        },
        parallel: { type: 'boolean', nullable: true },
        argsTemplate: {
            type: 'object',
            additionalProperties: true,
            nullable: true,
        },
        expectedOutcome: { type: 'string', nullable: true },
        retry: { type: 'number', nullable: true },
        status: {
            type: 'string',
            enum: ['pending', 'executing', 'completed', 'failed', 'skipped'],
            nullable: true,
        },
    },
    required: ['id', 'description'],
    additionalProperties: true,
};

/**
 * Schema for PlanningResult
 */
export const planningResultSchema = {
    type: 'object',
    properties: {
        strategy: { type: 'string', minLength: 1 },
        goal: { type: 'string', minLength: 1 },
        steps: {
            type: 'array',
            items: planStepSchema,
            minItems: 0,
        },
        plan: {
            type: 'array',
            items: planStepSchema,
            minItems: 0,
        },
        signals: {
            type: 'object',
            properties: {
                needs: {
                    type: 'array',
                    items: { type: 'string' },
                    nullable: true,
                },
                noDiscoveryPath: {
                    type: 'array',
                    items: { type: 'string' },
                    nullable: true,
                },
                errors: {
                    type: 'array',
                    items: { type: 'string' },
                    nullable: true,
                },
                suggestedNextStep: { type: 'string', nullable: true },
            },
            additionalProperties: true,
            nullable: true,
        },
        audit: {
            type: 'array',
            items: { type: 'string' },
            nullable: true,
        },
        reasoning: {
            oneOf: [
                { type: 'string' },
                {
                    type: 'array',
                    items: { type: 'string' },
                },
            ],
        },
        complexity: {
            type: 'string',
            enum: ['simple', 'medium', 'complex'],
            nullable: true,
        },
        estimatedTime: { type: 'number', nullable: true },
        metadata: {
            type: 'object',
            additionalProperties: true,
            nullable: true,
        },
    },
    oneOf: [
        { required: ['strategy', 'goal', 'steps'] },
        { required: ['strategy', 'goal', 'plan'] },
    ],
    additionalProperties: true,
};

/**
 * Schema for RoutingResult
 */
export const routingResultSchema = {
    type: 'object',
    properties: {
        strategy: { type: 'string', minLength: 1 },
        selectedTool: { type: 'string', minLength: 1 },
        confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
        },
        reasoning: { type: 'string', minLength: 1 },
        alternatives: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    tool: { type: 'string', minLength: 1 },
                    confidence: {
                        type: 'number',
                        minimum: 0,
                        maximum: 1,
                    },
                    reason: { type: 'string' },
                },
                required: ['tool', 'confidence'],
            },
            nullable: true,
        },
    },
    required: ['strategy', 'selectedTool', 'confidence', 'reasoning'],
    additionalProperties: true,
};

/**
 * Schema for generic LLM response
 */
export const llmResponseSchema = {
    type: 'object',
    properties: {
        content: { type: 'string' },
        toolCalls: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    type: { type: 'string' },
                    function: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            arguments: { type: 'string' },
                        },
                        required: ['name', 'arguments'],
                    },
                },
                required: ['id', 'type', 'function'],
            },
            nullable: true,
        },
        usage: {
            type: 'object',
            properties: {
                promptTokens: { type: 'number', nullable: true },
                completionTokens: { type: 'number', nullable: true },
                totalTokens: { type: 'number', nullable: true },
            },
            nullable: true,
        },
        additionalKwargs: {
            type: 'object',
            additionalProperties: true,
            nullable: true,
        },
    },
    required: ['content'],
    additionalProperties: true,
};

//enhanced-errors.ts
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ErrorDomain =
    | 'infrastructure'
    | 'business'
    | 'security'
    | 'performance';
export type UserImpact = 'none' | 'degraded' | 'broken';

export interface EnhancedErrorOptions {
    context?: Record<string, unknown>;
    severity?: ErrorSeverity;
    domain?: ErrorDomain;
    userImpact?: UserImpact;
    userMessage?: string;
    recoveryHints?: string[];
    retryable?: boolean;
    recoverable?: boolean;
    tags?: string[];
}

export interface StructuredErrorResponse {
    error: {
        id: string;
        code: ErrorCode;
        message: string;
        severity: ErrorSeverity;
        domain: ErrorDomain;
        userImpact: UserImpact;
        correlationId: string;
        timestamp: number;
        userMessage?: string;
        retryable: boolean;
        recoverable: boolean;
        recoveryHints: string[];
        tags: string[];
    };
    metadata: {
        component: string;
        tenantId: string;
        version: string;
        requestId?: string;
    };
    context?: Record<string, unknown>;
}

// error-unified.ts
// ✅ UNIFIED EVENT INTERFACE
export interface UnifiedEventConfig {
    // Event routing
    enableObservability?: boolean;
    enablePersistence?: boolean;
    enableRequestResponse?: boolean;

    // Performance
    maxListeners?: number;
    bufferSize?: number;
    flushInterval?: number;

    // Filtering
    eventFilters?: string[];
    componentFilters?: string[];

    // Error handling
    enableErrorHandling?: boolean;
    maxRetries?: number;
}

export interface UnifiedEventContext {
    correlationId?: string;
    tenantId?: string;
    timestamp?: number;
    source?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    retryable?: boolean;
}

export interface EventResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: Error;
    timestamp: number;
    duration: number;
}

// sdk-orchestrator.ts
export interface OrchestrationConfig {
    llmAdapter: LLMAdapter;
    tenantId?: string;
    mcpAdapter?: MCPAdapter;
    enableObservability?: boolean;
    defaultTimeout?: number;
    defaultPlanner?: PlannerType;
    defaultMaxIterations?: number;
    storage?: {
        memory?: {
            type: StorageType;
            connectionString?: string;
            database?: string;
            collection?: string;
            maxItems?: number;
            enableCompression?: boolean;
            cleanupInterval?: number;
        };
        session?: {
            type: StorageType;
            connectionString?: string;
            database?: string;
            collection?: string;
            maxSessions?: number;
            sessionTimeout?: number;
            enableCompression?: boolean;
            cleanupInterval?: number;
        };
        snapshot?: {
            type: StorageType;
            connectionString?: string;
            database?: string;
            collection?: string;
            maxSnapshots?: number;
            enableCompression?: boolean;
            enableDeltaCompression?: boolean;
            cleanupInterval?: number;
            ttl?: number;
        };
    };
    observability?: Partial<ObservabilityConfig>;
    kernel?: {
        performance?: {
            autoSnapshot?: {
                enabled?: boolean;
                intervalMs?: number;
                eventInterval?: number;
                useDelta?: boolean;
            };
        };
    };
}

export interface OrchestrationConfigInternal
    extends Omit<OrchestrationConfig, 'mcpAdapter'> {
    mcpAdapter: MCPAdapter | null;
}

export type AgentConfig = {
    name: string;
    identity: AgentIdentity;
    maxIterations?: number;
    executionMode?: 'simple' | 'workflow';
    constraints?: string[];
    enableSession?: boolean; // Default: true
    enableState?: boolean; // Default: true
    enableMemory?: boolean; // Default: true
    timeout?: number;
    plannerOptions?: {
        planner?: PlannerType;
        replanPolicy?: Partial<ReplanPolicyConfig>;
    };
};

export interface ToolConfig {
    name: string;
    title?: string;
    description: string;
    inputSchema: z.ZodSchema<unknown>;
    outputSchema?: z.ZodSchema<unknown>;
    execute: (input: unknown, context: ToolContext) => Promise<unknown>;
    categories?: string[];
    dependencies?: string[];
    annotations?: Record<string, unknown>;
}

export interface OrchestrationResult<T = unknown> {
    success: boolean;
    result?: T;
    error?: string;
    context: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

// orchestration/types.ts
export interface AgentData {
    instance: AgentEngine | AgentExecutor;
    definition: AgentDefinition;
    config: {
        executionMode: 'simple' | 'workflow';
        simpleConfig?: Record<string, unknown>;
        workflowConfig?: Record<string, unknown>;
        hooks?: {
            onStart?: (
                input: unknown,
                context: Record<string, unknown>,
            ) => Promise<void>;
            onFinish?: (
                result: unknown,
                context: Record<string, unknown>,
            ) => Promise<void>;
            onError?: (
                error: Error,
                context: Record<string, unknown>,
            ) => Promise<void>;
        };
    };
}
