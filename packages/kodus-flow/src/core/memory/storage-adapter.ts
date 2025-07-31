/**
 * @module core/memory/storage-adapter
 * @description Adapter to bridge old MemoryAdapter interface with new BaseStorage
 */

import { createLogger } from '../../observability/logger.js';

import type { MemoryItem, MemoryQuery } from '../types/memory-types.js';
import type { BaseStorage, BaseStorageItem } from '../types/base-storage.js';
import { MemoryAdapter, MemoryAdapterConfig } from './types.js';
import { StorageAdapterFactory } from '../storage/factory.js';

const logger = createLogger('memory-storage-adapter');

/**
 * Adapter that implements the old MemoryAdapter interface using the new BaseStorage
 */
export class StorageMemoryAdapter implements MemoryAdapter {
    private storage: BaseStorage<BaseStorageItem> | null = null;
    private isInitialized = false;

    constructor(
        private config: MemoryAdapterConfig = { adapterType: 'memory' },
    ) {}

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        this.storage = await StorageAdapterFactory.create({
            type: this.config.adapterType,
            connectionString: this.config.connectionString,
            options: {
                ...this.config.options,
                // ✅ MEMORY: Use specific collection for Memory data
                database: this.config.options?.database || 'kodus',
                collection: this.config.options?.collection || 'memories',
            },
            maxItems: 10000,
            enableCompression: true,
            cleanupInterval: 300000,
            timeout: this.config.timeout || 5000,
            retries: this.config.retries || 3,
            enableObservability: true,
            enableHealthChecks: true,
            enableMetrics: true,
        });

        this.isInitialized = true;
        logger.info('StorageMemoryAdapter initialized', {
            adapterType: this.config.adapterType,
        });
    }

    async store(item: MemoryItem): Promise<void> {
        await this.ensureInitialized();

        const storageItem: BaseStorageItem = {
            id: item.id,
            timestamp: item.timestamp,
            metadata: {
                type: item.type,
                entityId: item.entityId,
                sessionId: item.sessionId,
                tenantId: item.tenantId,
                contextId: item.contextId,
                key: item.key,
                value: item.value,
                ...item.metadata,
            },
        };

        await this.storage!.store(storageItem);
        logger.debug('Memory item stored', { id: item.id, type: item.type });
    }

    async retrieve(id: string): Promise<MemoryItem | null> {
        await this.ensureInitialized();

        const item = await this.storage!.retrieve(id);
        if (!item) return null;

        // Convert back to MemoryItem format
        return {
            id: item.id,
            timestamp: item.timestamp,
            type: item.metadata?.type as string,
            entityId: item.metadata?.entityId as string,
            sessionId: item.metadata?.sessionId as string,
            tenantId: item.metadata?.tenantId as string,
            contextId: item.metadata?.contextId as string,
            key: item.metadata?.key as string,
            value: item.metadata?.value,
            metadata: item.metadata,
        } as MemoryItem;
    }

    async search(_query: MemoryQuery): Promise<MemoryItem[]> {
        await this.ensureInitialized();

        // Note: This is a simplified implementation
        // In a real implementation, you'd need to implement proper querying
        // For now, we'll return empty as the storage doesn't support this query pattern
        logger.warn(
            'search() not fully implemented in storage adapter - returning empty',
        );
        return [];
    }

    async delete(id: string): Promise<boolean> {
        await this.ensureInitialized();

        const deleted = await this.storage!.delete(id);
        if (deleted) {
            logger.debug('Memory item deleted', { id });
        }
        return deleted;
    }

    async clear(): Promise<void> {
        await this.ensureInitialized();

        await this.storage!.clear();
        logger.info('All memory items cleared');
    }

    async getStats(): Promise<{
        itemCount: number;
        totalSize: number;
        adapterType: string;
    }> {
        await this.ensureInitialized();

        const stats = await this.storage!.getStats();

        return {
            itemCount: stats.itemCount,
            totalSize: stats.totalSize,
            adapterType: stats.adapterType,
        };
    }

    async isHealthy(): Promise<boolean> {
        await this.ensureInitialized();
        return this.storage!.isHealthy();
    }

    async cleanup(): Promise<void> {
        if (this.storage) {
            await this.storage.cleanup();
        }
        this.isInitialized = false;
        logger.info('StorageMemoryAdapter cleaned up');
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }
}
