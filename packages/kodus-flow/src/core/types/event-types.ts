/**
 * Event types used for communication between components
 *
 * These types define the event system that is used for communication
 * between different components in the SDK.
 */
import { z } from 'zod';
import { entityIdSchema, sessionIdSchema } from './common-types.js';
import { contextIdSchema } from './context-types.js';

/**
 * Event ID schema and type
 * Used to identify an event
 */
export const eventIdSchema = z.string().min(1);
// EventId moved to base-types.ts

/**
 * Event type schema and type
 * Defines the type of an event
 */
// ✅ Zod v4: Type guards mais robustos
export const eventTypeSchema = z.enum([
    'agent.started',
    'agent.stopped',
    'agent.error',
    'workflow.started',
    'workflow.completed',
    'workflow.error',
    'tool.called',
    'tool.result',
    'tool.error',
    'kernel.state_changed',
    'kernel.snapshot_created',
    'runtime.event_processed',
    'runtime.event_failed',
]);
export type EventType = z.infer<typeof eventTypeSchema>;

/**
 * Event payload schema and type
 * The data payload of an event
 */
// ✅ Zod v4: Validação de payload mais específica
export const eventPayloadSchema = z
    .unknown()
    .refine((val) => val !== null && typeof val === 'object', {
        message: 'Event payload must be an object',
    });
export type EventPayload = z.infer<typeof eventPayloadSchema>;

/**
 * Event schema and type
 * Represents a single event in the system
 */
// ✅ Zod v4: Schema de evento otimizado para performance
export const eventSchema = z
    .object({
        id: z.string().uuid(),
        type: eventTypeSchema,
        timestamp: z.number().positive(),
        payload: eventPayloadSchema.optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        correlationId: z.string().optional(),
        tenantId: z.string().optional(),
    })
    .strict()
    .refine(
        // ✅ Zod v4: strict() + refine() para performance
        (data) => {
            // ✅ Validação cross-field: correlationId deve existir para eventos críticos
            const criticalEvents = [
                'agent.error',
                'workflow.error',
                'tool.error',
            ];
            if (criticalEvents.includes(data.type)) {
                return !!data.correlationId;
            }
            return true;
        },
        {
            message: 'Critical events must have correlationId',
            path: ['correlationId'],
        },
    );
export type Event = z.infer<typeof eventSchema>;

/**
 * Event handler schema and type
 * A function that handles an event
 */
// ✅ Zod v4: Event handler com validação de função otimizada
export const eventHandlerSchema = z.instanceof(Function).refine(
    (fn) => {
        // ✅ Validação de assinatura da função
        return fn.length >= 1; // Deve aceitar pelo menos 1 parâmetro
    },
    {
        message: 'Event handler must accept at least one parameter',
    },
);
export type EventHandler = z.infer<typeof eventHandlerSchema>;

/**
 * Event filter schema and type
 * Used to filter events
 */
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

/**
 * Event subscription schema and type
 * Represents a subscription to events
 */
export const eventSubscriptionSchema = z
    .object({
        id: z.string(),
        filter: eventFilterSchema,
        handler: eventHandlerSchema,
    })
    .strict(); // ✅ Zod v4: strict() para performance
export type EventSubscription = z.infer<typeof eventSubscriptionSchema>;

/**
 * Event bus options schema and type
 * Options for configuring an event bus
 */
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

// ✅ Zod v4: Type guards customizados
export const isEventType = (value: unknown): value is EventType => {
    return eventTypeSchema.safeParse(value).success;
};

export const isEventHandler = (value: unknown): value is EventHandler => {
    return eventHandlerSchema.safeParse(value).success;
};

// ✅ Zod v4: Validação de eventos em batch
// ✅ Zod v4: Schema de batch otimizado
export const eventBatchSchema = z
    .object({
        events: z.array(eventSchema).min(1).max(1000),
        batchId: z.string().uuid(),
        timestamp: z.number().positive(),
        metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .strict()
    .refine(
        // ✅ Zod v4: strict() + refine() para performance
        (data) => {
            // ✅ Validação: todos os eventos devem ter o mesmo tenantId
            const tenantIds = new Set(
                data.events.map((e) => e.tenantId).filter(Boolean),
            );
            return tenantIds.size <= 1;
        },
        {
            message: 'All events in batch must have the same tenantId',
            path: ['events'],
        },
    );
export type EventBatch = z.infer<typeof eventBatchSchema>;
