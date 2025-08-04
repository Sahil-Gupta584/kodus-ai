/**
 * Context types used for execution context in the SDK
 *
 * These types define the execution context that is passed through the workflow
 * and provides access to state, tools, and other resources.
 */
import { z } from 'zod';

/**
 * Context ID schema and type
 * Used to identify an execution context
 */
export const contextIdSchema = z.string().min(1);
// ContextId moved to base-types.ts

/**
 * Execution context schema and type
 * The core context object that is passed through the workflow
 */
export const executionContextSchema = z.object({
    contextId: contextIdSchema,
    entityId: z.string().optional(),
    sessionId: z.string().optional(),
    tenantId: z.string().optional(),
    parentContextId: contextIdSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
    startTime: z.number().optional(),
    endTime: z.number().optional(),
});
export type ExecutionContext = z.infer<typeof executionContextSchema>;

/**
 * Context state schema and type
 * Used to store state within a context
 */
export const contextStateSchema = z.record(z.string(), z.unknown());
export type ContextState = z.infer<typeof contextStateSchema>;

/**
 * Context variables schema and type
 * Used to store variables within a context
 */
export const contextVariablesSchema = z.record(z.string(), z.unknown());
export type ContextVariables = z.infer<typeof contextVariablesSchema>;

/**
 * Context options schema and type
 * Used to configure a context
 */
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

/**
 * Context status schema and type
 * Represents the current status of a context
 */
export const contextStatusSchema = z.enum([
    'active',
    'paused',
    'completed',
    'failed',
    'canceled',
    'timeout',
]);
export type ContextStatus = z.infer<typeof contextStatusSchema>;

/**
 * Context info schema and type
 * Contains information about a context
 */
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
