/**
 * Memory types used in the SDK
 *
 * These types define the memory system that allows agents and workflows
 * to store and retrieve information.
 */
import { z } from 'zod';
import { entityIdSchema, sessionIdSchema } from './common-types.js';
import { contextIdSchema } from './context-types.js';

/**
 * Memory ID schema and type
 * Used to identify a memory item
 */
export const memoryIdSchema = z.string().min(1);
export type MemoryId = string;

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
            type: z.enum(['memory', 'redis', 'custom']),
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
            type: z.enum(['memory', 'redis', 'pinecone', 'qdrant', 'custom']),
            config: z.record(z.string(), z.unknown()).optional(),
        })
        .optional(),
});
export type MemoryVectorStoreOptions = z.infer<
    typeof memoryVectorStoreOptionsSchema
>;

/**
 * Memory vector search result schema and type
 * Result of a vector search
 */
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
