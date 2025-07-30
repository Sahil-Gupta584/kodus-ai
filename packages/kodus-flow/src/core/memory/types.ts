/**
 * @module core/memory/types
 * @description Types for memory management system
 */

import type { MemoryItem, MemoryQuery } from '../types/memory-types.js';
import type { StorageType } from '../storage/factory.js';

/**
 * Memory adapter configuration
 */
export interface MemoryAdapterConfig {
    adapterType: StorageType;
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
export type AdapterType = StorageType;
