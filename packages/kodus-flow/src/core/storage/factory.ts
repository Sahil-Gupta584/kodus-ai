/**
 * @module core/storage/factory
 * @description Unified factory for creating storage adapters
 */

import { createLogger } from '../../observability/logger.js';
import type {
    BaseStorage,
    BaseStorageConfig,
    BaseStorageItem,
} from '../types/base-storage.js';
import { InMemoryStorageAdapter } from './adapters/in-memory-adapter.js';
import { MongoDBStorageAdapter } from './adapters/mongodb-adapter.js';

const logger = createLogger('storage-factory');

/**
 * Storage adapter types
 */
export type StorageType = 'memory' | 'mongodb' | 'redis' | 'temporal';

/**
 * Storage adapter configuration
 */
export interface StorageAdapterConfig extends BaseStorageConfig {
    type: StorageType;
    connectionString?: string;
    options?: Record<string, unknown>;
}

/**
 * Default storage configuration
 */
export interface StorageDefaultConfig {
    maxItems: number;
    enableCompression: boolean;
    cleanupInterval: number;
    timeout: number;
    retries: number;
    enableObservability: boolean;
    enableHealthChecks: boolean;
    enableMetrics: boolean;
    options?: Record<string, unknown>;
}

/**
 * Default configurations for each storage type
 */
export const STORAGE_DEFAULTS: Record<StorageType, StorageDefaultConfig> = {
    memory: {
        maxItems: 1000,
        enableCompression: true,
        cleanupInterval: 300000,
        timeout: 5000,
        retries: 3,
        enableObservability: true,
        enableHealthChecks: true,
        enableMetrics: true,
    },
    mongodb: {
        maxItems: 1000,
        enableCompression: true,
        cleanupInterval: 300000,
        timeout: 10000,
        retries: 3,
        enableObservability: true,
        enableHealthChecks: true,
        enableMetrics: true,
        options: {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            database: 'kodus',
            collection: 'storage',
        },
    },
    redis: {
        maxItems: 1000,
        enableCompression: true,
        cleanupInterval: 300000,
        timeout: 5000,
        retries: 3,
        enableObservability: true,
        enableHealthChecks: true,
        enableMetrics: true,
    },
    temporal: {
        maxItems: 1000,
        enableCompression: true,
        cleanupInterval: 300000,
        timeout: 5000,
        retries: 3,
        enableObservability: true,
        enableHealthChecks: true,
        enableMetrics: true,
    },
};

/**
 * Storage adapter factory
 * Unified factory for creating storage adapters
 */
export class StorageAdapterFactory {
    private static adapters = new Map<string, BaseStorage<BaseStorageItem>>();

    /**
     * Create a storage adapter
     */
    static async create<T extends BaseStorage<BaseStorageItem>>(
        config: StorageAdapterConfig,
    ): Promise<T> {
        logger.info('Creating storage adapter', { type: config.type, config });

        const adapterKey = `${config.type}_${config.connectionString || 'default'}`;

        // Check if adapter already exists
        if (this.adapters.has(adapterKey)) {
            logger.info('Returning cached adapter', { adapterKey });
            return this.adapters.get(adapterKey) as T;
        }

        // Merge with defaults
        const defaults =
            STORAGE_DEFAULTS[config.type] || STORAGE_DEFAULTS.memory;
        const mergedConfig = {
            ...defaults,
            ...config,
            options: {
                ...defaults.options,
                ...config.options,
            },
        };

        let adapter: BaseStorage<BaseStorageItem>;

        try {
            switch (config.type) {
                case 'memory':
                    adapter = new InMemoryStorageAdapter(mergedConfig);
                    break;

                case 'mongodb':
                    adapter = new MongoDBStorageAdapter(mergedConfig);
                    break;

                case 'redis':
                    logger.warn(
                        'Redis adapter not yet implemented, using memory',
                        { type: 'redis' },
                    );
                    adapter = new InMemoryStorageAdapter(mergedConfig);
                    break;

                case 'temporal':
                    logger.warn(
                        'Temporal adapter not yet implemented, using memory',
                        { type: 'temporal' },
                    );
                    adapter = new InMemoryStorageAdapter(mergedConfig);
                    break;

                default:
                    throw new Error(`Unknown storage type: ${config.type}`);
            }

            // Initialize adapter
            await adapter.initialize();

            // Cache adapter
            this.adapters.set(adapterKey, adapter);

            logger.info('Storage adapter created', {
                type: config.type,
                adapterKey,
            });

            return adapter as T;
        } catch (error) {
            logger.error('Failed to create storage adapter', error as Error, {
                type: config.type,
                adapterKey,
            });
            throw error;
        }
    }

    /**
     * Get cached adapter
     */
    static getCached<T extends BaseStorage<BaseStorageItem>>(
        type: StorageType,
        connectionString?: string,
    ): T | null {
        const adapterKey = `${type}_${connectionString || 'default'}`;
        return (this.adapters.get(adapterKey) as T) || null;
    }

    /**
     * Clear cached adapters
     */
    static async clearCache(): Promise<void> {
        const adapters = Array.from(this.adapters.values());
        await Promise.all(adapters.map((adapter) => adapter.cleanup()));
        this.adapters.clear();
        logger.info('Storage adapter cache cleared');
    }

    /**
     * Get all cached adapters
     */
    static getCachedAdapters(): Map<string, BaseStorage<BaseStorageItem>> {
        return new Map(this.adapters);
    }
}

/**
 * Global storage adapter management
 */
let globalStorageAdapter: BaseStorage<BaseStorageItem> | null = null;

/**
 * Get global storage adapter
 */
export function getGlobalStorageAdapter(): BaseStorage<BaseStorageItem> {
    if (!globalStorageAdapter) {
        throw new Error(
            'Global storage adapter not initialized. Call setGlobalStorageAdapter first.',
        );
    }
    return globalStorageAdapter;
}

/**
 * Set global storage adapter
 */
export function setGlobalStorageAdapter(
    adapter: BaseStorage<BaseStorageItem>,
): void {
    globalStorageAdapter = adapter;
    logger.info('Set global storage adapter', {
        type: adapter.constructor.name,
    });
}

/**
 * Reset global storage adapter
 */
export function resetGlobalStorageAdapter(): void {
    globalStorageAdapter = null;
    logger.info('Reset global storage adapter');
}
