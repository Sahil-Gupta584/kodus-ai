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

type SessionForStorage = Omit<Session, 'createdAt' | 'lastActivity'> & {
    createdAt: string;
    lastActivity: string;
    createdAtTimestamp: number;
    lastActivityTimestamp: number;
};

type SessionFromStorage = Omit<Session, 'createdAt' | 'lastActivity'> & {
    createdAt: string | number;
    lastActivity: string | number;
    createdAtTimestamp?: number;
    lastActivityTimestamp?: number;
};

class DateUtils {
    static timestampToFormattedDate(timestamp: number): string {
        return new Date(timestamp).toISOString();
    }

    static formattedDateToTimestamp(dateString: string): number {
        return new Date(dateString).getTime();
    }

    static transformNestedTimestamps(obj: unknown): unknown {
        if (!obj || typeof obj !== 'object') {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map((item) => this.transformNestedTimestamps(item));
        }

        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(
            obj as Record<string, unknown>,
        )) {
            if (
                (key === 'completedAt' ||
                    key === 'createdAt' ||
                    key === 'startTime' ||
                    key === 'at' ||
                    key === 'timestamp') &&
                typeof value === 'number'
            ) {
                result[key] = this.timestampToFormattedDate(value as number);
                result[`${key}Original`] = value;
            } else if (typeof value === 'object' && value !== null) {
                result[key] = this.transformNestedTimestamps(value);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    static restoreNestedTimestamps(obj: unknown): unknown {
        if (!obj || typeof obj !== 'object') {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map((item) => this.restoreNestedTimestamps(item));
        }

        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(
            obj as Record<string, unknown>,
        )) {
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
                continue;
            } else if (typeof value === 'object' && value !== null) {
                result[key] = this.restoreNestedTimestamps(value);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    static transformSessionForStorage(session: Session): SessionForStorage {
        const transformed = {
            ...session,
            createdAt: this.timestampToFormattedDate(session.createdAt),
            lastActivity: this.timestampToFormattedDate(session.lastActivity),
            createdAtTimestamp: session.createdAt,
            lastActivityTimestamp: session.lastActivity,
        };

        if (transformed.contextData) {
            transformed.contextData = this.transformNestedTimestamps(
                transformed.contextData,
            ) as Record<string, unknown>;
        }

        // Note: conversationHistory removed from Session - now handled by ConversationManager

        return transformed;
    }

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

        if (restored.contextData) {
            restored.contextData = this.restoreNestedTimestamps(
                restored.contextData,
            ) as Record<string, unknown>;
        }

        // Note: conversationHistory removed from Session - now handled by ConversationManager

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

interface SessionStorageItem extends BaseStorageItem {
    sessionData: SessionForStorage;
}

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
        if (this.isInitialized) {
            return;
        }

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

        if (!item) {
            return null;
        }

        const sessionData = DateUtils.transformSessionFromStorage(
            item.sessionData,
        );

        logger.debug('Session loaded', { sessionId });
        return sessionData;
    }

    async deleteSession(sessionId: string): Promise<boolean> {
        return await this.delete(`session_${sessionId}`);
    }

    async findSessionByThread(
        threadId: string,
        tenantId: string,
    ): Promise<Session | null> {
        if (!tenantId) {
            throw new Error('TenantId is required for session queries');
        }

        await this.ensureInitialized();
        try {
            const anyStorage = this.storage as unknown as {
                findOneByQuery?: (
                    query: Record<string, unknown>,
                ) => Promise<{ sessionData: SessionFromStorage } | null>;
            };

            if (typeof anyStorage.findOneByQuery === 'function') {
                // MongoDB query with dot notation
                const query: Record<string, unknown> = {};
                query['sessionData.threadId'] = threadId;
                query['sessionData.tenantId'] = tenantId;
                query['sessionData.status'] = 'active';

                const doc = await anyStorage.findOneByQuery!(query);
                if (!doc?.sessionData) {
                    return null;
                }

                return DateUtils.transformSessionFromStorage(doc.sessionData);
            }

            return null;
        } catch {
            return null;
        }
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }
}
