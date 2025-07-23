/**
 * @module core/storage/adapters/mongodb-adapter
 * @description MongoDB storage adapter implementation
 * @ts-nocheck - MongoDB types are dynamic
 * @eslint-disable @typescript-eslint/no-explicit-any
 * @eslint-disable @typescript-eslint/naming-convention
 */

import { createLogger } from '../../../observability/logger.js';
import type {
    BaseStorage,
    BaseStorageItem,
    BaseStorageStats,
} from '../../types/base-storage.js';
import type { StorageAdapterConfig } from '../factory.js';
import type { MongoClient, Db, Collection } from 'mongodb';

const logger = createLogger('mongodb-storage-adapter');

/**
 * MongoDB storage adapter implementation
 */
export class MongoDBStorageAdapter<T extends BaseStorageItem>
    implements BaseStorage<T>
{
    private config: StorageAdapterConfig;
    private isInitialized = false;
    private client: MongoClient | null = null;
    private db: Db | null = null;
    private collection: Collection | null = null;

    constructor(config: StorageAdapterConfig) {
        this.config = config;
    }

    async initialize(): Promise<void> {
        debugger;
        if (this.isInitialized) return;

        try {
            // Dynamic import to avoid requiring mongodb in package.json
            const { MongoClient: mongoClient } = await import('mongodb');

            const connectionString =
                this.config.connectionString ||
                'mongodb://localhost:27017/kodus';
            const options = this.config.options || {};

            this.client = new mongoClient(connectionString, {
                maxPoolSize: (options.maxPoolSize as number) ?? 10,
                serverSelectionTimeoutMS:
                    (options.serverSelectionTimeoutMS as number) ?? 5000,
                connectTimeoutMS: (options.connectTimeoutMS as number) ?? 10000,
                socketTimeoutMS: (options.socketTimeoutMS as number) ?? 45000,
            });

            await this.client.connect();

            const database = (options.database as string) ?? 'kodus';
            const collection = (options.collection as string) ?? 'storage';

            this.db = this.client.db(database);
            this.collection = this.db.collection(collection);

            // Create indexes for performance
            await (
                this.collection as {
                    createIndex: (
                        index: unknown,
                        options?: unknown,
                    ) => Promise<unknown>;
                }
            ).createIndex({ id: 1 }, { unique: true });
            await (
                this.collection as {
                    createIndex: (
                        index: unknown,
                        options?: unknown,
                    ) => Promise<unknown>;
                }
            ).createIndex({ timestamp: 1 });
            await (
                this.collection as {
                    createIndex: (
                        index: unknown,
                        options?: unknown,
                    ) => Promise<unknown>;
                }
            ).createIndex({ [String('metadata.xcId')]: 1 } as {
                [key: string]: number;
            });

            // Create TTL index if TTL is configured
            if (options.ttl) {
                await (
                    this.collection as {
                        createIndex: (
                            index: unknown,
                            options?: unknown,
                        ) => Promise<unknown>;
                    }
                ).createIndex(
                    { createdAt: 1 },
                    { expireAfterSeconds: options.ttl },
                );
            }

            this.isInitialized = true;
            logger.info('MongoDBStorageAdapter initialized', {
                database,
                collection,
                maxItems: this.config.maxItems,
                enableCompression: this.config.enableCompression,
                timeout: this.config.timeout,
            });
        } catch (error) {
            logger.error(
                'Failed to initialize MongoDB adapter',
                error as Error,
            );
            throw error;
        }
    }

    async store(item: T): Promise<void> {
        await this.ensureInitialized();

        try {
            if (!this.collection) {
                throw new Error('Collection not initialized');
            }

            const document = {
                id: item.id,
                timestamp: item.timestamp,
                metadata: item.metadata,
                data: item,
                createdAt: new Date(),
            };

            await this.collection.replaceOne({ id: item.id }, document, {
                upsert: true,
            });

            logger.debug('Item stored in MongoDB', {
                id: item.id,
                timestamp: item.timestamp,
            });
        } catch (error) {
            logger.error('Failed to store item in MongoDB', error as Error, {
                id: item.id,
            });
            throw error;
        }
    }

    async retrieve(id: string): Promise<T | null> {
        await this.ensureInitialized();

        try {
            const document = await this.collection!.findOne({ id });

            if (!document) {
                logger.debug('Item not found in MongoDB', { id });
                return null;
            }

            logger.debug('Item retrieved from MongoDB', {
                id,
                timestamp: document.timestamp,
            });

            return document.data as T;
        } catch (error) {
            logger.error(
                'Failed to retrieve item from MongoDB',
                error as Error,
                {
                    id,
                },
            );
            throw error;
        }
    }

    async delete(id: string): Promise<boolean> {
        await this.ensureInitialized();

        try {
            const result = await this.collection!.deleteOne({ id });
            const deleted = result.deletedCount > 0;

            logger.debug('Item deleted from MongoDB', {
                id,
                deleted,
            });

            return deleted;
        } catch (error) {
            logger.error('Failed to delete item from MongoDB', error as Error, {
                id,
            });
            throw error;
        }
    }

    async clear(): Promise<void> {
        await this.ensureInitialized();

        try {
            await this.collection!.deleteMany({});
            logger.info('All items cleared from MongoDB');
        } catch (error) {
            logger.error('Failed to clear MongoDB collection', error as Error);
            throw error;
        }
    }

    async getStats(): Promise<BaseStorageStats> {
        await this.ensureInitialized();

        try {
            const itemCount = await this.collection!.countDocuments();
            const stats = await this.db!.stats();

            const result: BaseStorageStats = {
                itemCount,
                totalSize: stats.dataSize || 0,
                averageItemSize:
                    itemCount > 0 ? (stats.dataSize || 0) / itemCount : 0,
                adapterType: 'mongodb',
            };

            logger.debug('MongoDB stats retrieved', result);
            return result;
        } catch (error) {
            logger.error('Failed to get MongoDB stats', error as Error);
            throw error;
        }
    }

    async isHealthy(): Promise<boolean> {
        if (!this.isInitialized) return false;

        try {
            await this.db!.admin().ping();
            return true;
        } catch (error) {
            logger.error('MongoDB health check failed', error as Error);
            return false;
        }
    }

    async cleanup(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.db = null;
            this.collection = null;
        }

        this.isInitialized = false;
        logger.info('MongoDBStorageAdapter cleaned up');
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }
}
