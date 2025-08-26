/**
 * 🎯 EVENTOS CENTRALIZADOS - Kodus Flow
 *
 * Estrutura padronizada para todos os eventos do sistema.
 *
 * BENEFÍCIOS:
 * ✅ Type safety completo
 * ✅ Autocomplete em todos os lugares
 * ✅ Refactoring seguro
 * ✅ Centralização de tipos
 * ✅ Padrão consistente
 */

/**
 * @module core/types/events
 * @description Event system types and utilities
 */

import { IdGenerator } from '../../utils/id-generator.js';
import type { AgentThought } from './common-types.js';
import type { AgentStatus } from './agent-types.js';

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

// ============================================================================
// 2️⃣ TIPO UNIÃO DOS EVENTOS
// ============================================================================

/**
 * Tipo união extraído das constantes + suporte para tipos dinâmicos
 * Garante que só usamos tipos válidos, mas permite strings literais
 */
export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES] | string;

// ============================================================================
// 3️⃣ PAYLOADS PARA CADA EVENTO
// ============================================================================

/**
 * Mapeamento de tipos de eventos para seus payloads específicos
 * Cada evento tem sua estrutura de dados tipada
 * Para tipos dinâmicos, usa um payload genérico
 */
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

/**
 * Interface genérica de evento com type safety completo
 *
 * Uso:
 * - Event<K> - Para um tipo específico de evento
 * - Event - Para qualquer tipo de evento (default: EventType)
 * - AnyEvent - Alias para Event (qualquer evento)
 */
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

/**
 * Enhanced EventDef com funcionalidades avançadas
 */
export type EnhancedEventDef<P, K extends EventType> = EventDef<P, K> & {
    // Funcionalidades adicionais podem ser adicionadas aqui
    validate?(data: P): boolean;
    transform?(data: P): P;
};

/**
 * EventMatcher para matching de eventos
 */
export type EventMatcher<T extends AnyEvent = AnyEvent> = {
    match(event: AnyEvent): event is T;
    filter(predicate: (event: T) => boolean): EventMatcher<T>;
};

/**
 * HandlerBuilder para construção de handlers
 */
export type HandlerBuilder<TEvent extends AnyEvent = AnyEvent> = {
    onSuccess(handler: (event: TEvent) => void): HandlerBuilder<TEvent>;
    onError(handler: (error: Error) => void): HandlerBuilder<TEvent>;
    build(): (event: TEvent) => void;
};

// ============================================================================
// 6️⃣ UTILITÁRIOS
// ============================================================================

/**
 * Array com todos os tipos de eventos (útil para validação)
 */
export const ALL_EVENT_TYPES = Object.values(EVENT_TYPES) as EventType[];

/**
 * Type guard para verificar se um tipo é um evento válido
 */
export function isValidEventType(type: string): type is EventType {
    return ALL_EVENT_TYPES.includes(type as EventType);
}

/**
 * Type guard para verificar se um evento é de um tipo específico
 */
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

// ============================================================================
// 9️⃣ EXEMPLOS DE USO
// ============================================================================

/**
 * Exemplos de como usar a nova estrutura:
 *
 * ```typescript
 * // ✅ Handler específico com type safety
 * function handleAgentCompleted(event: Event<typeof EVENT_TYPES.AGENT_COMPLETED>) {
 *     const { result, agent, reasoning } = event.data; // ✅ Tipado!
 *     // console.log removed
 * }
 *
 * // ✅ Switch com constantes
 * function dispatch(event: AnyEvent) {
 *     switch (event.type) {
 *         case EVENT_TYPES.AGENT_COMPLETED:
 *             return handleAgentCompleted(event);
 *         case EVENT_TYPES.TOOL_RESULT:
 *             return handleToolResult(event);
 *         default:
 *             // console.log removed
 *     }
 * }
 *
 * // ✅ Criação de eventos básica
 * const event = createEvent(EVENT_TYPES.AGENT_COMPLETED, {
 *     result: 'success',
 *     agent: 'mathAgent',
 *     reasoning: 'Calculation completed'
 * });
 *
 * // ✅ Criação de eventos com opções
 * const eventWithOptions = createEvent(EVENT_TYPES.AGENT_COMPLETED, {
 *     result: 'success',
 *     agent: 'mathAgent',
 *     reasoning: 'Calculation completed'
 * }, {
 *     id: 'custom-id',
 *     timestamp: Date.now()
 * });
 *
 * // ✅ Criação de eventos de lifecycle usando utilitários
 * const lifecycleEvent = agentLifecycleEvents.started({
 *     agentName: 'myAgent',
 *     tenantId: 'tenant-123',
 *     executionId: 'exec-456',
 *     status: 'running',
 *     startedAt: Date.now()
 * });
 *
 * // ✅ Validação de eventos
 * const validatedEvent = createValidatedEvent(EVENT_TYPES.AGENT_COMPLETED, {
 *     result: 'success',
 *     agent: 'mathAgent',
 *     reasoning: 'Calculation completed'
 * });
 *
 * // ✅ Type guards para eventos de lifecycle
 * if (isAgentLifecycleStartedEvent(event)) {
 *     const { agentName, executionId } = event.data; // ✅ Tipado!
 * }
 * ```
 */
