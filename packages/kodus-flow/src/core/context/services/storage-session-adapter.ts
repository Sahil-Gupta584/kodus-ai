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

/**
 * Session type for storage (with string dates)
 */
type SessionForStorage = Omit<Session, 'createdAt' | 'lastActivity'> & {
    createdAt: string;
    lastActivity: string;
    createdAtTimestamp: number; // Backup for compatibility
    lastActivityTimestamp: number; // Backup for compatibility
};

/**
 * Session type that can come from storage (mixed types)
 */
type SessionFromStorage = Omit<Session, 'createdAt' | 'lastActivity'> & {
    createdAt: string | number;
    lastActivity: string | number;
    createdAtTimestamp?: number;
    lastActivityTimestamp?: number;
};

/**
 * Utility functions for date transformation
 */
class DateUtils {
    /**
     * Convert timestamp to formatted date string for storage
     */
    static timestampToFormattedDate(timestamp: number): string {
        return new Date(timestamp).toISOString();
    }

    /**
     * Convert formatted date string back to timestamp for application logic
     */
    static formattedDateToTimestamp(dateString: string): number {
        return new Date(dateString).getTime();
    }

    /**
     * Transform nested timestamps in objects (like contextData)
     */
    static transformNestedTimestamps(obj: unknown): unknown {
        if (!obj || typeof obj !== 'object') return obj;

        if (Array.isArray(obj)) {
            return obj.map((item) => this.transformNestedTimestamps(item));
        }

        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(
            obj as Record<string, unknown>,
        )) {
            // Transform known timestamp fields
            if (
                (key === 'completedAt' ||
                    key === 'createdAt' ||
                    key === 'startTime' ||
                    key === 'at' ||
                    key === 'timestamp') &&
                typeof value === 'number'
            ) {
                result[key] = this.timestampToFormattedDate(value as number);
                result[`${key}Original`] = value; // Backup
            } else if (typeof value === 'object' && value !== null) {
                result[key] = this.transformNestedTimestamps(value);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    /**
     * Restore nested timestamps from storage
     */
    static restoreNestedTimestamps(obj: unknown): unknown {
        if (!obj || typeof obj !== 'object') return obj;

        if (Array.isArray(obj)) {
            return obj.map((item) => this.restoreNestedTimestamps(item));
        }

        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(
            obj as Record<string, unknown>,
        )) {
            // Restore known timestamp fields
            if (
                (key === 'completedAt' ||
                    key === 'createdAt' ||
                    key === 'startTime' ||
                    key === 'at' ||
                    key === 'timestamp') &&
                typeof value === 'string'
            ) {
                result[key] = this.formattedDateToTimestamp(value);
            } else if (key.endsWith('Original')) {
                // Skip backup fields - they're just for safety
                continue;
            } else if (typeof value === 'object' && value !== null) {
                result[key] = this.restoreNestedTimestamps(value);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    /**
     * Transform session for storage (timestamps → formatted dates)
     */
    static transformSessionForStorage(session: Session): SessionForStorage {
        const transformed = {
            ...session,
            createdAt: this.timestampToFormattedDate(session.createdAt),
            lastActivity: this.timestampToFormattedDate(session.lastActivity),
            createdAtTimestamp: session.createdAt,
            lastActivityTimestamp: session.lastActivity,
        };

        // ✅ Transform nested timestamps in contextData
        if (transformed.contextData) {
            transformed.contextData = this.transformNestedTimestamps(
                transformed.contextData,
            ) as Record<string, unknown>;
        }

        // ✅ Transform timestamps in conversationHistory
        if (transformed.conversationHistory) {
            transformed.conversationHistory = this.transformNestedTimestamps(
                transformed.conversationHistory,
            ) as typeof transformed.conversationHistory;
        }

        return transformed;
    }

    /**
     * Transform session from storage (formatted dates → timestamps)
     */
    static transformSessionFromStorage(
        sessionData: SessionFromStorage,
    ): Session {
        const restored = {
            ...sessionData,
            createdAt:
                typeof sessionData.createdAt === 'string'
                    ? this.formattedDateToTimestamp(sessionData.createdAt)
                    : sessionData.createdAtTimestamp || sessionData.createdAt,
            lastActivity:
                typeof sessionData.lastActivity === 'string'
                    ? this.formattedDateToTimestamp(sessionData.lastActivity)
                    : sessionData.lastActivityTimestamp ||
                      sessionData.lastActivity,
        };

        // ✅ Restore nested timestamps in contextData
        if (restored.contextData) {
            restored.contextData = this.restoreNestedTimestamps(
                restored.contextData,
            ) as Record<string, unknown>;
        }

        // ✅ Restore timestamps in conversationHistory
        if (restored.conversationHistory) {
            restored.conversationHistory = this.restoreNestedTimestamps(
                restored.conversationHistory,
            ) as typeof restored.conversationHistory;
        }

        return restored;
    }
}

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
    sessionData: SessionForStorage;
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
        // ✅ Transform timestamps to formatted dates for storage
        const sessionForStorage = DateUtils.transformSessionForStorage(session);

        const storageItem: SessionStorageItem = {
            id: `session_${session.id}`,
            timestamp: session.lastActivity,
            sessionData: sessionForStorage,
        };

        await this.store(storageItem);
    }

    async retrieveSession(sessionId: string): Promise<Session | null> {
        const item = await this.retrieve(`session_${sessionId}`);
        if (!item) return null;

        // ✅ Transform formatted dates back to timestamps for application logic
        const sessionData = DateUtils.transformSessionFromStorage(
            item.sessionData,
        );

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
                ) => Promise<{ sessionData: SessionFromStorage } | null>;
            };

            if (typeof anyStorage.findOneByQuery === 'function') {
                const query: Record<string, unknown> = {};
                query['sessionData.threadId'] = threadId;
                query['sessionData.status'] = 'active';
                if (tenantId) {
                    query['sessionData.tenantId'] = tenantId;
                }

                const doc = await anyStorage.findOneByQuery!(query);
                if (!doc?.sessionData) return null;

                // ✅ Transform formatted dates back to timestamps
                return DateUtils.transformSessionFromStorage(doc.sessionData);
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
