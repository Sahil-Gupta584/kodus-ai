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
                // Store full snapshot for simple adapters (memory)
                snapshot: s,
                ...options,
            },
        };

        await this.storage!.store(storageItem);
        logger.debug('Snapshot appended', { hash: s.hash, xcId: s.xcId });
    }

    async *load(xcId: string): AsyncIterable<Snapshot> {
        await this.ensureInitialized();
        // Try to iterate items if storage supports getAllItems (in-memory)
        const storageAny = this.storage as unknown as {
            getAllItems?: () => Map<string, BaseStorageItem>;
        };
        if (storageAny.getAllItems) {
            const items = storageAny.getAllItems();
            for (const [, item] of items) {
                if (item.metadata && item.metadata['xcId'] === xcId) {
                    const snap = item.metadata['snapshot'] as
                        | Snapshot
                        | undefined;
                    if (snap) {
                        yield snap;
                    }
                }
            }
            return;
        }
        // Fallback: nothing available
        logger.warn('load() not supported by underlying storage');
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
        const snap = item.metadata?.['snapshot'] as Snapshot | undefined;
        return snap ?? null;
    }

    async listHashes(xcId: string): Promise<string[]> {
        await this.ensureInitialized();
        const result: string[] = [];
        const storageAny = this.storage as unknown as {
            getAllItems?: () => Map<string, BaseStorageItem>;
        };
        if (storageAny.getAllItems) {
            for (const [id, item] of storageAny.getAllItems()!) {
                if (item.metadata && item.metadata['xcId'] === xcId) {
                    result.push(id);
                }
            }
            return result;
        }
        logger.warn('listHashes() not supported by underlying storage');
        return result;
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
