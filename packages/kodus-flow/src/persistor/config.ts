/**
 * @module persistor/config
 * @description Unified configuration for persistence layer
 */

import { z } from 'zod';

/**
 * Persistor Type Schema
 */
export const persistorTypeSchema = z.enum([
    'memory',
    'mongodb',
    'redis',
    'temporal',
]);

/**
 * Base Persistor Configuration
 */
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

// SQLite support removed - not needed

/**
 * MongoDB Persistor Configuration
 */
export const mongodbPersistorConfigSchema = basePersistorConfigSchema.extend({
    type: z.literal('mongodb'),
    connectionString: z.string().default('mongodb://localhost:27017/kodus'),
    database: z.string().default('kodus'),
    collection: z.string().default('snapshots'),
    maxPoolSize: z.number().min(1).max(100).default(10),
    serverSelectionTimeoutMS: z.number().min(1000).max(30000).default(5000),
    connectTimeoutMS: z.number().min(1000).max(30000).default(10000),
    socketTimeoutMS: z.number().min(1000).max(30000).default(45000),
    enableCompression: z.boolean().default(true),
    ttl: z.number().min(60).max(31536000).default(86400), // 1 day
});

/**
 * Redis Persistor Configuration
 */
export const redisPersistorConfigSchema = basePersistorConfigSchema.extend({
    type: z.literal('redis'),
    host: z.string().default('localhost'),
    port: z.number().min(1).max(65535).default(6379),
    password: z.string().optional(),
    database: z.number().min(0).max(15).default(0),
    keyPrefix: z.string().default('kodus:snapshot:'),
    ttl: z.number().min(60).max(31536000).default(86400), // 1 day
});

/**
 * Temporal Persistor Configuration
 */
export const temporalPersistorConfigSchema = basePersistorConfigSchema.extend({
    type: z.literal('temporal'),
    namespace: z.string().default('kodus'),
    taskQueue: z.string().default('persistor'),
    workflowId: z.string().optional(),
});

/**
 * Union type for all persistor configurations
 */
export const persistorConfigSchema = z.discriminatedUnion('type', [
    memoryPersistorConfigSchema,
    mongodbPersistorConfigSchema,
    redisPersistorConfigSchema,
    temporalPersistorConfigSchema,
]);

/**
 * Type definitions
 */
export type PersistorType = z.infer<typeof persistorTypeSchema>;
export type BasePersistorConfig = z.infer<typeof basePersistorConfigSchema>;
export type MemoryPersistorConfig = z.infer<typeof memoryPersistorConfigSchema>;
// SQLite types removed
export type MongoDBPersistorConfig = z.infer<
    typeof mongodbPersistorConfigSchema
>;
export type RedisPersistorConfig = z.infer<typeof redisPersistorConfigSchema>;
export type TemporalPersistorConfig = z.infer<
    typeof temporalPersistorConfigSchema
>;
export type PersistorConfig = z.infer<typeof persistorConfigSchema>;

/**
 * Default configurations for each persistor type
 */
export const defaultPersistorConfigs: Record<PersistorType, PersistorConfig> = {
    memory: {
        type: 'memory',
        maxSnapshots: 1000,
        enableCompression: true,
        enableDeltaCompression: true,
        cleanupInterval: 300000,
        maxMemoryUsage: 100 * 1024 * 1024, // 100MB
    },
    mongodb: {
        type: 'mongodb',
        connectionString: 'mongodb://localhost:27017/kodus',
        database: 'kodus',
        collection: 'snapshots',
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        enableCompression: true,
        ttl: 86400,
        maxSnapshots: 1000,
        enableDeltaCompression: true,
        cleanupInterval: 300000,
    },
    redis: {
        type: 'redis',
        host: 'localhost',
        port: 6379,
        database: 0,
        keyPrefix: 'kodus:snapshot:',
        ttl: 86400,
        maxSnapshots: 1000,
        enableCompression: true,
        enableDeltaCompression: true,
        cleanupInterval: 300000,
    },
    temporal: {
        type: 'temporal',
        namespace: 'kodus',
        taskQueue: 'persistor',
        maxSnapshots: 1000,
        enableCompression: true,
        enableDeltaCompression: true,
        cleanupInterval: 300000,
    },
};

/**
 * Create persistor configuration with defaults
 */
export function createPersistorConfig(
    type: PersistorType,
    overrides: Partial<PersistorConfig> = {},
): PersistorConfig {
    const baseConfig = defaultPersistorConfigs[type];
    return persistorConfigSchema.parse({
        ...baseConfig,
        ...overrides,
        type, // Ensure type is not overridden
    });
}

/**
 * Validate persistor configuration
 */
export function validatePersistorConfig(config: unknown): PersistorConfig {
    return persistorConfigSchema.parse(config);
}
