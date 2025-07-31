/**
 * State management types used in the SDK
 *
 * These types define the state management system that is used to store and
 * retrieve state during workflow execution.
 */
import { z } from 'zod';
import { entityIdSchema, sessionIdSchema } from './common-types.js';
import { contextIdSchema } from './context-types.js';

/**
 * State ID schema and type
 * Used to identify a state object
 */
export const stateIdSchema = z.string().min(1);
export type StateId = string;

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

/**
 * State update result schema and type
 * Result of a state update operation
 */
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

/**
 * State delete result schema and type
 * Result of a state delete operation
 */
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
            type: z.enum(['memory', 'redis', 'custom']),
            config: z.record(z.string(), z.unknown()).optional(),
        })
        .optional(),
});
export type StateManagerOptions = z.infer<typeof stateManagerOptionsSchema>;
