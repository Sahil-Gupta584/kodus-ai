/**
 * @module core/memory/memory-manager-v2
 * @description Enhanced memory manager with adapter support
 */

import { createLogger } from '../../observability/logger.js';
import type {
    MemoryItem,
    MemoryQuery,
    MemoryVectorQuery,
    MemoryVectorSearchResult,
    MemoryManagerOptions,
} from '../types/memory-types.js';
import type { MemoryAdapter, AdapterType } from './types.js';
import { StorageMemoryAdapter } from './storage-adapter.js';
import { VectorStore } from './vector-store.js';
import { IdGenerator } from '../../utils/id-generator.js';

const logger = createLogger('memory-manager-v2');

/**
 * Enhanced memory manager with adapter support
 * Supports multiple storage backends through adapters
 */
export class MemoryManager {
    private primaryAdapter!: MemoryAdapter;
    private backupAdapter?: MemoryAdapter;
    private vectorStore: VectorStore;
    private options: MemoryManagerOptions;
    private isInitialized = false;

    constructor(
        options: MemoryManagerOptions & {
            adapterType?: AdapterType;
            adapterConfig?: {
                connectionString?: string;
                options?: Record<string, unknown>;
            };
            backupAdapter?: {
                type: AdapterType;
                config: {
                    connectionString?: string;
                    options?: Record<string, unknown>;
                };
            };
        } = {},
    ) {
        this.options = {
            autoVectorizeText: true,
            defaultScope: 'session',
            ...options,
        };

        this.vectorStore = new VectorStore(
            this.options.vectorStoreOptions || {
                dimensions: 1536,
                distanceMetric: 'cosine',
                storage: { type: 'memory' },
            },
        );
    }

    /**
     * Initialize adapters based on configuration
     */
    private async initializeAdapters(
        options: MemoryManagerOptions & {
            adapterType?: AdapterType;
            adapterConfig?: {
                connectionString?: string;
                options?: Record<string, unknown>;
            };
            backupAdapter?: {
                type: AdapterType;
                config: {
                    connectionString?: string;
                    options?: Record<string, unknown>;
                };
            };
        },
    ): Promise<void> {
        try {
            // Create primary adapter
            const adapterType = options.adapterType || 'in-memory';
            const adapterConfig = {
                adapterType,
                connectionString: options.adapterConfig?.connectionString,
                options: options.adapterConfig?.options,
                timeout: 10000,
                retries: 3,
            };

            this.primaryAdapter = new StorageMemoryAdapter({
                adapterType: adapterType,
                connectionString: adapterConfig?.connectionString,
                options: adapterConfig?.options,
                timeout: adapterConfig?.timeout || 10000,
                retries: adapterConfig?.retries || 3,
            });

            // Create backup adapter if specified
            if (options.backupAdapter) {
                const backupConfig = {
                    adapterType: options.backupAdapter.type,
                    connectionString:
                        options.backupAdapter.config.connectionString,
                    options: options.backupAdapter.config.options,
                    timeout: 10000,
                    retries: 3,
                };

                this.backupAdapter = new StorageMemoryAdapter({
                    adapterType: options.backupAdapter.type,
                    connectionString: backupConfig.connectionString,
                    options: backupConfig.options,
                    timeout: backupConfig.timeout || 10000,
                    retries: backupConfig.retries || 3,
                });
            }

            logger.info('Memory adapters initialized', {
                primary: adapterType,
                backup: options.backupAdapter?.type,
                autoVectorizeText: this.options.autoVectorizeText,
            });
        } catch (error) {
            logger.error(
                'Failed to initialize memory adapters',
                error instanceof Error ? error : new Error('Unknown error'),
            );
            throw error;
        }
    }

    /**
     * Initialize the memory manager
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            // Initialize adapters
            await this.initializeAdapters(this.options);

            await this.primaryAdapter.initialize();
            if (this.backupAdapter) {
                await this.backupAdapter.initialize();
            }

            this.isInitialized = true;
            logger.info('Memory manager initialized');
        } catch (error) {
            logger.error(
                'Failed to initialize memory manager',
                error instanceof Error ? error : new Error('Unknown error'),
            );
            throw error;
        }
    }

    /**
     * Store an item in memory
     */
    async store(input: {
        key?: string;
        content: unknown;
        type?: string;
        entityId?: string;
        sessionId?: string;
        tenantId?: string;
        contextId?: string;
        metadata?: Record<string, unknown>;
        expireAt?: number;
    }): Promise<MemoryItem> {
        await this.ensureInitialized();

        const id = IdGenerator.executionId();
        const timestamp = Date.now();

        const item: MemoryItem = {
            id,
            key: input.key || 'default',
            value: input.content,
            type: input.type,
            timestamp,
            entityId: input.entityId,
            sessionId: input.sessionId,
            tenantId: input.tenantId,
            contextId: input.contextId,
            metadata: input.metadata,
            expireAt: input.expireAt,
        };

        // Store in primary adapter
        await this.primaryAdapter.store(item);

        // Store in backup adapter if available
        if (this.backupAdapter) {
            try {
                await this.backupAdapter.store(item);
            } catch (error) {
                logger.warn('Failed to store in backup adapter', { error });
            }
        }

        // Auto-vectorize text content if enabled
        if (
            this.options.autoVectorizeText &&
            typeof input.content === 'string'
        ) {
            await this.vectorizeItem(item);
        }

        logger.debug('Memory item stored', {
            id,
            type: input.type,
            hasVector: this.options.autoVectorizeText,
            hasBackup: !!this.backupAdapter,
        });

        return item;
    }

    /**
     * Retrieve an item from memory
     */
    async get(id: string): Promise<MemoryItem | null> {
        await this.ensureInitialized();

        // Try primary adapter first
        let item = await this.primaryAdapter.retrieve(id);

        // If not found and backup exists, try backup
        if (!item && this.backupAdapter) {
            try {
                item = await this.backupAdapter.retrieve(id);

                // If found in backup, sync to primary
                if (item) {
                    await this.primaryAdapter.store(item);
                    logger.debug('Synced item from backup to primary', { id });
                }
            } catch (error) {
                logger.warn('Failed to retrieve from backup adapter', {
                    error,
                });
            }
        }

        return item;
    }

    /**
     * Query memory items
     */
    async query(query: {
        type?: string;
        entityId?: string;
        sessionId?: string;
        tenantId?: string;
        contextId?: string;
        since?: number;
        until?: number;
        text?: string;
        limit?: number;
    }): Promise<MemoryItem[]> {
        await this.ensureInitialized();

        // Convert to MemoryQuery format
        const memoryQuery: MemoryQuery = {
            type: query.type,
            entityId: query.entityId,
            sessionId: query.sessionId,
            tenantId: query.tenantId,
            contextId: query.contextId,
            fromTimestamp: query.since,
            toTimestamp: query.until,
            limit: query.limit,
        };

        // Search in primary adapter
        let results = await this.primaryAdapter.search(memoryQuery);

        // If no results and backup exists, try backup
        if (results.length === 0 && this.backupAdapter) {
            try {
                results = await this.backupAdapter.search(memoryQuery);
                logger.debug('Found results in backup adapter', {
                    count: results.length,
                });
            } catch (error) {
                logger.warn('Failed to search in backup adapter', { error });
            }
        }

        // Apply text filter if specified
        if (query.text) {
            results = results.filter((item) => {
                const content = String(item.value).toLowerCase();
                const searchText = query.text!.toLowerCase();
                return content.includes(searchText);
            });
        }

        return results;
    }

    /**
     * Semantic search using vector similarity
     */
    async search(
        query: string,
        options: Partial<MemoryVectorQuery> = {},
    ): Promise<MemoryVectorSearchResult[]> {
        await this.ensureInitialized();

        // First, vectorize the query text
        const queryVector = await this.vectorizeText(query);

        const vectorQuery: MemoryVectorQuery = {
            vector: queryVector,
            text: query,
            topK: options.topK || 10,
            minScore: options.minScore || 0.7,
            filter: options.filter,
        };

        // Perform vector search
        const results = await this.vectorStore.search(vectorQuery);

        logger.debug('Semantic search completed', {
            query,
            resultsCount: results.length,
            topScore: results[0]?.score || 0,
        });

        return results;
    }

    /**
     * Delete an item from memory
     */
    async delete(id: string): Promise<boolean> {
        await this.ensureInitialized();

        // Delete from primary adapter
        const deleted = await this.primaryAdapter.delete(id);

        // Delete from backup adapter if available
        if (this.backupAdapter) {
            try {
                await this.backupAdapter.delete(id);
            } catch (error) {
                logger.warn('Failed to delete from backup adapter', { error });
            }
        }

        return deleted;
    }

    /**
     * Clear all memory items
     */
    async clear(): Promise<void> {
        await this.ensureInitialized();

        await this.primaryAdapter.clear();

        if (this.backupAdapter) {
            try {
                await this.backupAdapter.clear();
            } catch (error) {
                logger.warn('Failed to clear backup adapter', { error });
            }
        }
    }

    /**
     * Get recent memories ordered by timestamp
     * Required by plan-execute-planner for memory context
     */
    async getRecentMemories(limit: number = 5): Promise<MemoryItem[]> {
        await this.ensureInitialized();

        try {
            // Query recent memories with limit
            const results = await this.query({
                limit,
                // Get all items without specific filters to get most recent across all scopes
            });

            // Sort by timestamp descending (most recent first)
            return results.sort((a, b) => b.timestamp - a.timestamp);
        } catch (error) {
            logger.warn('Failed to get recent memories', {
                error: error instanceof Error ? error.message : 'Unknown error',
                limit,
            });
            return [];
        }
    }

    /**
     * Get memory statistics
     */
    async getStats(): Promise<{
        itemCount: number;
        vectorCount: number;
        totalMemoryUsage: number;
        averageAccessCount: number;
        adapterStats: {
            primary: Record<string, unknown>;
            backup?: Record<string, unknown>;
        };
    }> {
        await this.ensureInitialized();

        const primaryStats = await this.primaryAdapter.getStats();
        const backupStats = this.backupAdapter
            ? await this.backupAdapter.getStats()
            : undefined;

        return {
            itemCount: primaryStats.itemCount,
            vectorCount: 0, // TODO: Get from vector store
            totalMemoryUsage: primaryStats.totalSize,
            averageAccessCount: 0, // TODO: Calculate
            adapterStats: {
                primary: primaryStats,
                backup: backupStats,
            },
        };
    }

    /**
     * Check if memory manager is healthy
     */
    async isHealthy(): Promise<boolean> {
        try {
            const primaryHealthy = await this.primaryAdapter.isHealthy();
            const backupHealthy = this.backupAdapter
                ? await this.backupAdapter.isHealthy()
                : true;

            return primaryHealthy && backupHealthy;
        } catch {
            return false;
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup(): Promise<void> {
        await this.primaryAdapter.cleanup();

        if (this.backupAdapter) {
            await this.backupAdapter.cleanup();
        }
    }

    /**
     * Ensure memory manager is initialized
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    /**
     * Vectorize a memory item
     */
    private async vectorizeItem(item: MemoryItem): Promise<void> {
        if (typeof item.value === 'string') {
            const vector = await this.vectorizeText(item.value);
            await this.vectorStore.store({
                id: item.id,
                vector,
                text: item.value,
                metadata: item.metadata,
                timestamp: item.timestamp,
                entityId: item.entityId,
                sessionId: item.sessionId,
                tenantId: item.tenantId,
                contextId: item.contextId,
            });
        }
    }

    /**
     * Vectorize text content
     */
    private async vectorizeText(text: string): Promise<number[]> {
        // Simple hash-based vectorization for now
        // In production, use proper embedding service
        const hash = this.simpleHash(text);
        const vector = new Array(1536).fill(0);

        for (let i = 0; i < Math.min(text.length, 1536); i++) {
            vector[i] = ((text.charCodeAt(i) + hash) % 1000) / 1000;
        }

        return vector;
    }

    /**
     * Simple hash function
     */
    private simpleHash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }
}

/**
 * Global memory manager instance
 */
let globalMemoryManager: MemoryManager | null = null;

/**
 * Get global memory manager instance
 */
export function getGlobalMemoryManager(): MemoryManager {
    if (!globalMemoryManager) {
        globalMemoryManager = new MemoryManager();
    }
    return globalMemoryManager;
}

/**
 * Set global memory manager instance
 */
export function setGlobalMemoryManager(manager: MemoryManager): void {
    globalMemoryManager = manager;
}

/**
 * Reset global memory manager to default
 */
export function resetGlobalMemoryManager(): void {
    globalMemoryManager = null;
}
