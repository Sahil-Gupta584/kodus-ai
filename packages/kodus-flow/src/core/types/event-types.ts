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
export type EventId = string;

/**
 * Event type schema and type
 * Defines the type of an event
 */
export const eventTypeSchema = z.string().min(1);
export type EventType = z.infer<typeof eventTypeSchema>;

/**
 * Event payload schema and type
 * The data payload of an event
 */
export const eventPayloadSchema = z.unknown();
export type EventPayload = z.infer<typeof eventPayloadSchema>;

/**
 * Event schema and type
 * Represents a single event in the system
 */
export const eventSchema = z.object({
    id: eventIdSchema,
    type: eventTypeSchema,
    payload: eventPayloadSchema,
    timestamp: z.number(),
    source: z.string().optional(),
    entityId: entityIdSchema.optional(),
    sessionId: sessionIdSchema.optional(),
    tenantId: z.string().optional(),
    contextId: contextIdSchema.optional(),
    metadata: z.record(z.unknown()).optional(),
});
export type Event = z.infer<typeof eventSchema>;

/**
 * Event handler schema and type
 * A function that handles an event
 */
export const eventHandlerSchema = z
    .function()
    .args(eventSchema)
    .returns(z.void());
export type EventHandler = z.infer<typeof eventHandlerSchema>;

/**
 * Event filter schema and type
 * Used to filter events
 */
export const eventFilterSchema = z.object({
    type: z.string().or(z.array(z.string())).optional(),
    source: z.string().or(z.array(z.string())).optional(),
    entityId: entityIdSchema.optional(),
    sessionId: sessionIdSchema.optional(),
    tenantId: z.string().optional(),
    contextId: contextIdSchema.optional(),
    fromTimestamp: z.number().optional(),
    toTimestamp: z.number().optional(),
});
export type EventFilter = z.infer<typeof eventFilterSchema>;

/**
 * Event subscription schema and type
 * Represents a subscription to events
 */
export const eventSubscriptionSchema = z.object({
    id: z.string(),
    filter: eventFilterSchema,
    handler: eventHandlerSchema,
});
export type EventSubscription = z.infer<typeof eventSubscriptionSchema>;

/**
 * Event bus options schema and type
 * Options for configuring an event bus
 */
export const eventBusOptionsSchema = z.object({
    // Whether to buffer events when there are no subscribers
    bufferEvents: z.boolean().optional(),
    // Maximum number of events to buffer
    maxBufferSize: z.number().int().positive().optional(),
    // Whether to allow wildcard event types
    allowWildcards: z.boolean().optional(),
});
export type EventBusOptions = z.infer<typeof eventBusOptionsSchema>;

/**
 * Event emitter options schema and type
 * Options for emitting an event
 */
export const eventEmitOptionsSchema = z.object({
    // Whether to wait for all handlers to complete
    waitForHandlers: z.boolean().optional(),
    // Timeout for waiting for handlers in milliseconds
    handlerTimeoutMs: z.number().int().positive().optional(),
});
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
