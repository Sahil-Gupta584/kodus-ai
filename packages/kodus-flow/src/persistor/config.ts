import { z } from 'zod';

/**
 * Persistor Type Schema
 */
export const persistorTypeSchema = z.enum(['memory', 'mongodb']);

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

/**
 * Union type for all persistor configurations
 */
export const persistorConfigSchema = z.discriminatedUnion('type', [
    memoryPersistorConfigSchema,
    mongodbPersistorConfigSchema,
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

export type PersistorConfig = z.infer<typeof persistorConfigSchema>;
