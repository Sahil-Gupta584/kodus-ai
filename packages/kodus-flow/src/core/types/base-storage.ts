/**
 * @module core/types/base-storage
 * @description Base storage interface shared between Persistor and Memory Manager
 */

import { z } from 'zod';
import type { BaseContext } from './base-types.js';

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
