/**
 * @module persistor/storage-adapter
 * @description Adapter to bridge old Persistor interface with new BaseStorage
 */

import { createLogger } from '../observability/logger.js';
import type { Persistor } from './index.js';
import type {
    Snapshot,
    SnapshotOptions,
    PersistorStats,
} from '../core/types/common-types.js';
import { StorageAdapterFactory } from '../core/storage/factory.js';
import type {
    BaseStorage,
    BaseStorageItem,
} from '../core/types/base-storage.js';

const logger = createLogger('persistor-storage-adapter');

/**
 * Adapter that implements the old Persistor interface using the new BaseStorage
 */
export class StoragePersistorAdapter implements Persistor {
    private storage: BaseStorage<BaseStorageItem> | null = null;
    private isInitialized = false;

    constructor(
        private config: {
            type: 'memory' | 'mongodb' | 'redis' | 'temporal';
            connectionString?: string;
            options?: Record<string, unknown>;
        } = { type: 'memory' },
        private persistorConfig?: {
            maxSnapshots?: number;
            enableCompression?: boolean;
            enableDeltaCompression?: boolean;
            cleanupInterval?: number;
        },
    ) {}

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        this.storage = await StorageAdapterFactory.create({
            type: this.config.type,
            connectionString: this.config.connectionString,
            options: {
                ...this.config.options,
                // ✅ PERSISTOR: Use specific collection for Persistor data
                database: this.config.options?.database || 'kodus',
                collection: this.config.options?.collection || 'snapshots',
            },
            maxItems: this.persistorConfig?.maxSnapshots ?? 1000,
            enableCompression: this.persistorConfig?.enableCompression ?? true,
            cleanupInterval: this.persistorConfig?.cleanupInterval ?? 300000,
            timeout: 10000,
            retries: 3,
            enableObservability: true,
            enableHealthChecks: true,
            enableMetrics: true,
        });

        this.isInitialized = true;
        logger.info('StoragePersistorAdapter initialized', {
            type: this.config.type,
        });
    }

    async append(s: Snapshot, options?: SnapshotOptions): Promise<void> {
        await this.ensureInitialized();

        const storageItem: BaseStorageItem = {
            id: s.hash,
            timestamp: Date.now(),
            metadata: {
                xcId: s.xcId,
                ...options,
            },
        };

        await this.storage!.store(storageItem);
        logger.debug('Snapshot appended', { hash: s.hash, xcId: s.xcId });
    }

    async *load(_xcId: string): AsyncIterable<Snapshot> {
        await this.ensureInitialized();

        // Note: This is a simplified implementation
        // In a real implementation, you'd need to query by xcId
        // For now, we'll return empty as the storage doesn't support this query pattern
        logger.warn(
            'load() not fully implemented in storage adapter - returning empty',
        );
        return;
    }

    async has(hash: string): Promise<boolean> {
        await this.ensureInitialized();

        const item = await this.storage!.retrieve(hash);
        return item !== null;
    }

    async getByHash(hash: string): Promise<Snapshot | null> {
        await this.ensureInitialized();

        const item = await this.storage!.retrieve(hash);
        if (!item) return null;

        // Note: This is simplified - real implementation would need full Snapshot data
        // For now, return null as the conversion is complex
        return null;
    }

    async listHashes(_xcId: string): Promise<string[]> {
        await this.ensureInitialized();

        // Note: This is a simplified implementation
        // In a real implementation, you'd need to query by xcId
        logger.warn(
            'listHashes() not fully implemented in storage adapter - returning empty',
        );
        return [];
    }

    async getStats(): Promise<PersistorStats> {
        await this.ensureInitialized();

        const stats = await this.storage!.getStats();

        return {
            snapshotCount: stats.itemCount,
            totalSizeBytes: stats.totalSize,
            avgSnapshotSizeBytes: stats.averageItemSize,
            deltaCompressionRatio: 0, // Not implemented in storage adapter
        };
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }
}
