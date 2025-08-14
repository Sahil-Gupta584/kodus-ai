/**
 * @module core/context/services/storage-session-adapter
 * @description Adapter to bridge SessionService with BaseStorage (same pattern as StorageMemoryAdapter)
 */

import { createLogger } from '../../../observability/logger.js';
import type { Session } from './session-service.js';
import type {
    BaseStorage,
    BaseStorageItem,
    BaseStorageStats,
} from '../../types/base-storage.js';
import {
    StorageAdapterFactory,
    StorageType,
    StorageAdapterConfig,
} from '../../storage/factory.js';

const logger = createLogger('storage-session-adapter');

export interface SessionAdapterConfig {
    adapterType: StorageType;
    connectionString?: string;
    options?: Record<string, unknown>;
    timeout?: number;
    retries?: number;
}

/**
 * Storage item for sessions
 */
interface SessionStorageItem extends BaseStorageItem {
    sessionData: Session;
}

/**
 * Adapter that implements session storage using BaseStorage (same pattern as StorageMemoryAdapter)
 */
export class StorageSessionAdapter implements BaseStorage<SessionStorageItem> {
    private storage: BaseStorage<SessionStorageItem> | null = null;
    private config: StorageAdapterConfig;
    private isInitialized = false;

    constructor(config: SessionAdapterConfig = { adapterType: 'memory' }) {
        this.config = {
            type: config.adapterType,
            connectionString: config.connectionString,
            options: {
                ...config.options,
                // ✅ SESSION: Use specific collection for Session data
                database: config.options?.database || 'kodus',
                collection: config.options?.collection || 'sessions',
            },
            maxItems: 1000,
            enableCompression: true,
            cleanupInterval: 300000,
            timeout: config.timeout || 10000,
            retries: config.retries || 3,
            enableObservability: true,
            enableHealthChecks: true,
            enableMetrics: true,
        };
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        this.storage = await StorageAdapterFactory.create<
            BaseStorage<SessionStorageItem>
        >(this.config);

        this.isInitialized = true;
        logger.info('StorageSessionAdapter initialized', {
            adapterType: this.config.type,
        });
    }

    async store(item: SessionStorageItem): Promise<void> {
        await this.ensureInitialized();
        await this.storage!.store(item);
        logger.debug('Session stored', { sessionId: item.sessionData.id });
    }

    async retrieve(id: string): Promise<SessionStorageItem | null> {
        await this.ensureInitialized();
        return await this.storage!.retrieve(id);
    }

    async delete(id: string): Promise<boolean> {
        await this.ensureInitialized();
        const deleted = await this.storage!.delete(id);
        if (deleted) {
            logger.debug('Session deleted', { sessionId: id });
        }
        return deleted;
    }

    async clear(): Promise<void> {
        await this.ensureInitialized();
        await this.storage!.clear();
        logger.info('All sessions cleared');
    }

    async getStats(): Promise<BaseStorageStats> {
        await this.ensureInitialized();
        return await this.storage!.getStats();
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
        logger.info('StorageSessionAdapter cleaned up');
    }

    // Convenience methods for Session-specific operations
    async storeSession(session: Session): Promise<void> {
        const storageItem: SessionStorageItem = {
            id: `session_${session.id}`,
            timestamp: session.lastActivity,
            metadata: {
                sessionData: session,
            },
            sessionData: session,
        };

        await this.store(storageItem);
    }

    async retrieveSession(sessionId: string): Promise<Session | null> {
        const item = await this.retrieve(`session_${sessionId}`);
        if (!item) return null;

        const sessionData = item.sessionData;
        logger.debug('Session loaded', { sessionId });
        return sessionData;
    }

    async deleteSession(sessionId: string): Promise<boolean> {
        return await this.delete(`session_${sessionId}`);
    }

    /**
     * Find session by threadId (and optional tenantId)
     * Fallback-safe: retorna null se storage não suportar query
     */
    async findSessionByThread(
        threadId: string,
        tenantId?: string,
    ): Promise<Session | null> {
        await this.ensureInitialized();
        try {
            // Tentar usar recurso específico do MongoDB adapter se disponível
            const anyStorage = this.storage as unknown as {
                findOneByQuery?: (
                    query: Record<string, unknown>,
                ) => Promise<SessionStorageItem | null>;
            };

            if (typeof anyStorage.findOneByQuery === 'function') {
                const query: Record<string, unknown> = {};
                query['sessionData.threadId'] = threadId;
                query['sessionData.status'] = 'active';
                if (tenantId) {
                    query['sessionData.tenantId'] = tenantId;
                }

                const doc = await anyStorage.findOneByQuery!(query);
                return doc?.sessionData ?? null;
            }

            // Fallback: se não suportar query, retorna null
            return null;
        } catch {
            // Em caso de falha de conexão ou erro, retorna null sem quebrar
            return null;
        }
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }
}
