import { IdGenerator } from '../../../utils/id-generator.js';
import { createLogger } from '../../../observability/index.js';
import { ContextStateService } from './state-service.js';
import { SessionId, ThreadId, TenantId } from '@/core/types/base-types.js';
import { StorageSessionAdapter } from './storage-session-adapter.js';
import type { StorageType } from '../../storage/factory.js';

export interface ConversationMessage {
    role: 'user' | 'assistant' | 'tool' | 'system';
    content: string;
    timestamp: number;
    metadata?: {
        model?: string;
        agentName?: string;
        responseTimeMs?: number;
        tokensUsed?: number;
        toolsUsed?: string[];
        toolCallsCount?: number;
        source?: string;
        connectionId?: string;
        [key: string]: unknown;
    };
}

export type ConversationHistory = ConversationMessage[];

export type Session = {
    id: string;
    threadId: string;
    tenantId: string;
    createdAt: number;
    lastActivity: number;
    status: 'active' | 'paused' | 'expired' | 'closed';
    metadata: Record<string, unknown>;
    contextData: Record<string, unknown>;
    conversationHistory: ConversationHistory;
    currentExecutionId?: string; // Track current execution
};

export interface SessionConfig {
    maxSessions?: number;
    sessionTimeout?: number; // ms
    maxConversationHistory?: number;
    enableAutoCleanup?: boolean;
    cleanupInterval?: number; // ms
    persistent?: boolean;
    adapterType?: StorageType;
    connectionString?: string;
    adapterOptions?: Record<string, unknown>;
}

export interface SessionContext {
    id: SessionId;
    threadId: ThreadId;
    tenantId: TenantId;
    stateManager: ContextStateService;
    metadata: Record<string, unknown>;
    conversationHistory: ConversationHistory;
}

export class SessionService {
    private sessions = new Map<string, Session>();
    private sessionStateManagers = new Map<string, ContextStateService>();
    private storage?: StorageSessionAdapter;
    private logger = createLogger('session-service');
    private config: Required<SessionConfig>;
    private cleanupIntervalId?: NodeJS.Timeout;
    private isInitialized = false;

    constructor(config: SessionConfig = {}) {
        this.logger.info('🔍 [DEBUG] SessionService constructor called', {
            receivedConfig: config,
            hasConnectionString: !!config.connectionString,
            connectionStringValue: config.connectionString,
            adapterType: config.adapterType,
        });

        this.config = {
            maxSessions: config.maxSessions || 1000,
            sessionTimeout: config.sessionTimeout || 30 * 60 * 1000, // 30 min
            maxConversationHistory: config.maxConversationHistory || 100,
            enableAutoCleanup: config.enableAutoCleanup !== false,
            cleanupInterval: config.cleanupInterval || 5 * 60 * 1000, // 5 min
            persistent: config.persistent ?? true,
            adapterType: config.adapterType || 'memory',
            connectionString: config.connectionString || '',
            adapterOptions: config.adapterOptions || {},
        };

        // Initialize asynchronously
        this.initializeStorage().catch((e) => {
            this.logger.error('Failed to initialize storage adapter', e);
        });

        if (this.config.enableAutoCleanup) {
            this.startAutoCleanup();
        }

        this.logger.info('SessionService initialized', {
            maxSessions: this.config.maxSessions,
            sessionTimeout: this.config.sessionTimeout,
            persistent: this.config.persistent,
            adapterType: this.config.adapterType,
        });
    }

    /**
     * SECURITY: Validate tenantId format and content
     */
    private validateTenantId(tenantId: string): void {
        if (
            !tenantId ||
            typeof tenantId !== 'string' ||
            tenantId.trim() === ''
        ) {
            throw new Error('Valid tenantId is required');
        }

        // Prevent injection attacks - allow only alphanumeric, underscore, hyphen
        if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
            throw new Error(
                'TenantId contains invalid characters. Only alphanumeric, underscore, and hyphen allowed.',
            );
        }

        // Prevent extremely long tenant IDs
        if (tenantId.length > 128) {
            throw new Error(
                'TenantId too long. Maximum 128 characters allowed.',
            );
        }
    }

    /**
     * ✅ NEW: Initialize storage adapter
     */
    private async initializeStorage(): Promise<void> {
        if (!this.config.persistent) {
            this.isInitialized = true;
            return;
        }

        try {
            const storageConfig = {
                adapterType:
                    this.config.adapterType === 'mongodb'
                        ? ('mongodb' as const)
                        : ('memory' as const),
                connectionString: this.config.connectionString,
                options: {
                    ...this.config.adapterOptions,
                    database: this.config.adapterOptions?.database || 'kodus',
                    collection:
                        this.config.adapterOptions?.collection || 'sessions',
                },
                timeout: 10000,
                retries: 3,
            };

            this.logger.info('🔍 [DEBUG] Creating StorageSessionAdapter', {
                storageConfig,
                connectionStringUsed: storageConfig.connectionString,
                adapterTypeUsed: storageConfig.adapterType,
            });

            this.storage = new StorageSessionAdapter(storageConfig);

            await this.storage.initialize();

            // ✅ LOAD: Restore active sessions from storage
            await this.loadActiveSessions();

            this.isInitialized = true;
            this.logger.info('SessionService storage initialized', {
                adapterType: this.config.adapterType,
                persistent: this.config.persistent,
            });
        } catch (error) {
            this.logger.warn(
                'Failed to initialize session storage - falling back to in-memory mode',
                {
                    error:
                        error instanceof Error
                            ? error.message
                            : 'Unknown error',
                    adapterType: this.config.adapterType,
                    connectionString: this.config.connectionString
                        ? '[CONFIGURED]'
                        : '[NOT SET]',
                    fallbackMode: 'in-memory',
                },
            );
            // Continue without persistence - sessions will work but won't persist between restarts
            this.storage = undefined;
            this.isInitialized = true;
        }
    }

    /**
     * ✅ NEW: Load active sessions from storage
     */
    private async loadActiveSessions(): Promise<void> {
        if (!this.storage) return;

        try {
            // Note: This would need custom query support in BaseStorage
            // For now, we'll load on-demand when sessions are requested
            this.logger.info('Session loading strategy: on-demand');
        } catch (error) {
            this.logger.warn('Failed to load active sessions', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    /**
     * Criar nova sessão
     */
    async createSession(
        tenantId: string,
        threadId: string,
        metadata: Record<string, unknown> = {},
    ): Promise<Session> {
        this.validateTenantId(tenantId);
        await this.ensureInitialized();

        const sessionId = IdGenerator.sessionId();

        const session: Session = {
            id: sessionId,
            threadId,
            tenantId,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            status: 'active',
            metadata,
            contextData: {},
            conversationHistory: [],
        };

        // Criar state manager para a sessão
        const stateManager = new ContextStateService(
            { sessionId },
            {
                maxNamespaceSize: 1000,
                maxNamespaces: 50,
            },
        );

        // ✅ HYBRID: Store in both RAM cache and persistent storage
        this.sessions.set(sessionId, session);
        this.sessionStateManagers.set(sessionId, stateManager);

        // ✅ PERSIST: Store in database if persistent mode
        if (this.config.persistent && this.storage) {
            await this.storage.storeSession(session);
        }

        // Enforce max sessions limit
        this.enforceMaxSessions();

        this.logger.info('Session created', {
            sessionId,
            threadId,
            tenantId,
            totalSessions: this.sessions.size,
            persistent: this.config.persistent,
        });

        return session;
    }

    /**
     * Obter sessão existente
     */
    async getSession(sessionId: string): Promise<Session | undefined> {
        await this.ensureInitialized();

        // ✅ HYBRID: Check RAM cache first
        let session = this.sessions.get(sessionId);

        // ✅ FALLBACK: If not in cache and persistent mode, try loading from storage
        if (!session && this.config.persistent && this.storage) {
            const loadedSession = await this.storage.retrieveSession(sessionId);
            if (loadedSession) {
                session = loadedSession;
                // Cache the loaded session
                this.sessions.set(sessionId, session);
                // Recreate state manager
                const stateManager = new ContextStateService(
                    { sessionId },
                    {
                        maxNamespaceSize: 1000,
                        maxNamespaces: 50,
                    },
                );
                this.sessionStateManagers.set(sessionId, stateManager);
            }
        }

        if (session) {
            // Verificar se sessão expirou ANTES de atualizar lastActivity
            if (this.isSessionExpired(session)) {
                session.status = 'expired';
                this.sessionStateManagers.delete(sessionId);

                this.logger.warn('Session expired', { sessionId });
                return undefined;
            }

            // Atualizar última atividade apenas se sessão não expirou
            session.lastActivity = Date.now();

            // ✅ SYNC: Update in storage if persistent
            if (this.config.persistent && this.storage) {
                await this.storage.storeSession(session);
            }
        } else {
            this.logger.warn('Session not found', { sessionId });
        }

        return session;
    }

    /**
     * Get session by thread ID (for ContextBuilder)
     * SECURITY: tenantId is MANDATORY for tenant isolation
     */
    async getSessionByThread(
        threadId: string,
        tenantId: string, // ✅ MANDATORY
    ): Promise<Session | undefined> {
        this.validateTenantId(tenantId);

        await this.ensureInitialized();

        // Check RAM cache first - WITH MANDATORY TENANT CHECK
        for (const session of this.sessions.values()) {
            if (
                session.threadId === threadId &&
                session.status === 'active' &&
                session.tenantId === tenantId // ✅ MANDATORY CHECK
            ) {
                return session;
            }
        }

        // Consulta opcional ao storage (se disponível e persistente)
        if (this.config.persistent && this.storage) {
            try {
                const found = await this.storage.findSessionByThread(
                    threadId,
                    tenantId,
                );
                if (found) {
                    // Cachear e criar state manager
                    this.sessions.set(found.id, found);
                    const stateManager = new ContextStateService(
                        { sessionId: found.id },
                        {
                            maxNamespaceSize: 1000,
                            maxNamespaces: 50,
                        },
                    );
                    this.sessionStateManagers.set(found.id, stateManager);
                    // Note: Conversation history handled in conversationHistory field
                    return found;
                }
            } catch (error) {
                this.logger.warn('Storage lookup by thread failed', {
                    threadId,
                    error: error instanceof Error ? error.message : 'Unknown',
                });
            }
        }

        // Fallback: não encontrado
        return undefined;
    }

    /**
     * Obter contexto completo da sessão
     */
    async getSessionContext(
        sessionId: string,
    ): Promise<SessionContext | undefined> {
        const session = await this.getSession(sessionId);
        if (!session) {
            return undefined;
        }

        const stateManager = this.sessionStateManagers.get(sessionId);
        if (!stateManager) {
            return undefined;
        }

        return {
            id: session.id,
            threadId: session.threadId,
            tenantId: session.tenantId,
            stateManager,
            metadata: session.metadata,
            conversationHistory: session.conversationHistory,
        };
    }

    /**
     * Atualizar metadados da sessão
     */
    async updateSessionMetadata(
        sessionId: string,
        updates: Record<string, unknown>,
    ): Promise<boolean> {
        const session = await this.getSession(sessionId);
        if (!session) return false;

        session.metadata = { ...session.metadata, ...updates };
        session.lastActivity = Date.now();

        // ✅ SYNC: Persist changes if enabled
        if (this.config.persistent && this.storage) {
            await this.storage.storeSession(session);
        }

        return true;
    }

    /**
     * Atualizar dados de contexto da sessão
     */
    async updateSessionContext(
        sessionId: string,
        updates: Record<string, unknown>,
    ): Promise<boolean> {
        const session = await this.getSession(sessionId);
        if (!session) return false;

        // Deep merge por namespace para não sobrescrever chaves irmãs
        const deepMerge = (
            target: Record<string, unknown>,
            source: Record<string, unknown>,
        ): Record<string, unknown> => {
            const result: Record<string, unknown> = { ...target };
            for (const [key, value] of Object.entries(source)) {
                const targetValue = result[key];
                const isObject = (v: unknown): v is Record<string, unknown> =>
                    typeof v === 'object' && v !== null && !Array.isArray(v);

                if (isObject(targetValue) && isObject(value)) {
                    result[key] = deepMerge(targetValue, value);
                } else {
                    result[key] = value;
                }
            }
            return result;
        };

        session.contextData = deepMerge(
            session.contextData as Record<string, unknown>,
            updates,
        );
        session.lastActivity = Date.now();

        // ✅ SYNC: Persist changes if enabled
        if (this.config.persistent && this.storage) {
            await this.storage.storeSession(session);
        }

        return true;
    }

    /**
     * Obter dados de contexto persistidos da sessão (diagnóstico)
     */
    async getSessionContextData(
        sessionId: string,
    ): Promise<Record<string, unknown>> {
        const session = await this.getSession(sessionId);
        return (session?.contextData as Record<string, unknown>) || {};
    }

    /**
     * Pausar sessão
     */
    async pauseSession(sessionId: string): Promise<boolean> {
        const session = await this.getSession(sessionId);
        if (!session) return false;

        session.status = 'paused';
        session.lastActivity = Date.now();

        // ✅ SYNC: Persist changes if enabled
        if (this.config.persistent && this.storage) {
            await this.storage.storeSession(session);
        }

        this.logger.info('Session paused', { sessionId });
        return true;
    }

    /**
     * Resumir sessão
     */
    async resumeSession(sessionId: string): Promise<boolean> {
        const session = await this.getSession(sessionId);
        if (!session) return false;

        session.status = 'active';
        session.lastActivity = Date.now();

        // ✅ SYNC: Persist changes if enabled
        if (this.config.persistent && this.storage) {
            await this.storage.storeSession(session);
        }

        this.logger.info('Session resumed', { sessionId });
        return true;
    }

    /**
     * Fechar sessão
     */
    async closeSession(sessionId: string): Promise<boolean> {
        const session = await this.getSession(sessionId);
        if (!session) return false;

        session.status = 'closed';
        session.lastActivity = Date.now();

        // ✅ SYNC: Persist final state if enabled
        if (this.config.persistent && this.storage) {
            await this.storage.storeSession(session);
        }

        // Cleanup state manager
        this.sessionStateManagers.delete(sessionId);

        return true;
    }

    /**
     * Buscar sessões por critérios
     * SECURITY: tenantId is MANDATORY for tenant isolation
     */
    findSessions(criteria: {
        threadId?: string;
        tenantId: string; // ✅ MANDATORY
        status?: Session['status'];
        activeSince?: number;
    }): Session[] {
        this.validateTenantId(criteria.tenantId);

        return Array.from(this.sessions.values()).filter((session) => {
            // ✅ MANDATORY: Filter by tenant FIRST
            if (session.tenantId !== criteria.tenantId) return false;
            if (criteria.threadId && session.threadId !== criteria.threadId)
                return false;
            if (criteria.status && session.status !== criteria.status)
                return false;
            if (
                criteria.activeSince &&
                session.lastActivity < criteria.activeSince
            )
                return false;
            return true;
        });
    }

    /**
     * Buscar sessão por thread (para continuidade)
     * SECURITY: tenantId is MANDATORY for tenant isolation
     */
    async findSessionByThread(
        threadId: string,
        tenantId: string, // ✅ MANDATORY
    ): Promise<Session | undefined> {
        this.validateTenantId(tenantId);

        await this.ensureInitialized();

        for (const session of this.sessions.values()) {
            if (
                session.threadId === threadId &&
                session.tenantId === tenantId && // ✅ MANDATORY CHECK
                session.status === 'active' &&
                !this.isSessionExpired(session)
            ) {
                return session;
            }
        }

        return undefined;
    }

    /**
     * Obter estatísticas das sessões
     */
    getSessionStats(): {
        total: number;
        active: number;
        paused: number;
        expired: number;
        closed: number;
        averageSessionDuration: number;
    } {
        const now = Date.now();
        const sessions = Array.from(this.sessions.values());

        const stats = {
            total: sessions.length,
            active: 0,
            paused: 0,
            expired: 0,
            closed: 0,
            averageSessionDuration: 0,
        };

        let totalDuration = 0;
        let validSessions = 0;

        for (const session of sessions) {
            stats[session.status]++;

            if (session.status !== 'closed') {
                const duration = now - session.createdAt;
                totalDuration += duration;
                validSessions++;
            }
        }

        stats.averageSessionDuration =
            validSessions > 0 ? totalDuration / validSessions : 0;

        return stats;
    }

    /**
     * Limpar sessões expiradas
     */
    cleanupExpiredSessions(): number {
        let cleanedCount = 0;

        for (const [sessionId, session] of this.sessions.entries()) {
            if (this.isSessionExpired(session)) {
                session.status = 'expired';
                // CRÍTICO: Limpar state manager para evitar memory leak
                this.sessionStateManagers.delete(sessionId);
                // Note: Conversation cleanup handled automatically with session
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            this.logger.info('Cleaned expired sessions', { cleanedCount });
        }

        return cleanedCount;
    }

    /**
     * Verificar se sessão expirou
     */
    private isSessionExpired(session: Session): boolean {
        if (session.status === 'closed') return false;

        const timeSinceLastActivity = Date.now() - session.lastActivity;
        return timeSinceLastActivity > this.config.sessionTimeout;
    }

    /**
     * Enforce max sessions limit
     */
    private enforceMaxSessions(): void {
        if (this.sessions.size <= this.config.maxSessions) return;

        // Remove oldest sessions
        const sessionsArray = Array.from(this.sessions.entries());
        sessionsArray.sort((a, b) => a[1].lastActivity - b[1].lastActivity);

        const toRemove = sessionsArray.slice(
            0,
            this.sessions.size - this.config.maxSessions,
        );

        for (const [sessionId] of toRemove) {
            this.sessions.delete(sessionId);
            this.sessionStateManagers.delete(sessionId);
        }

        this.logger.warn('Enforced max sessions limit', {
            removed: toRemove.length,
            remaining: this.sessions.size,
        });
    }

    /**
     * Iniciar limpeza automática
     */
    private startAutoCleanup(): void {
        this.cleanupIntervalId = setInterval(() => {
            this.cleanupExpiredSessions();
        }, this.config.cleanupInterval);

        this.logger.info('Auto cleanup started', {
            interval: this.config.cleanupInterval,
        });
    }

    /**
     * Parar limpeza automática
     */
    stopAutoCleanup(): void {
        if (this.cleanupIntervalId) {
            clearInterval(this.cleanupIntervalId);
            this.cleanupIntervalId = undefined;
            this.logger.info('Auto cleanup stopped');
        }
    }

    /**
     * ✅ NEW: Ensure initialization
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initializeStorage();
        }
    }

    /**
     * Cleanup completo
     */
    async cleanup(): Promise<void> {
        this.stopAutoCleanup();

        // ✅ PERSIST: Final sync if persistent mode
        if (this.config.persistent && this.storage) {
            // Persist all active sessions before cleanup
            const persistPromises = Array.from(this.sessions.values()).map(
                (session) => this.storage!.storeSession(session),
            );
            await Promise.allSettled(persistPromises);

            // Cleanup storage
            await this.storage.cleanup();
        }

        // Cleanup all sessions
        this.sessions.clear();
        this.sessionStateManagers.clear();

        this.logger.info('SessionService cleanup completed');
    }

    // ============================================================================
    // EXECUTION MANAGEMENT (NEW)
    // ============================================================================

    /**
     * Start a new execution within a session
     */
    async startExecution(
        sessionId: string,
        agentName: string,
    ): Promise<string | null> {
        try {
            const session = await this.getSession(sessionId);
            if (!session) {
                this.logger.warn(
                    'Attempted to start execution for non-existent session',
                    {
                        context: SessionService.name,
                        metadata: {
                            sessionId,
                            agentName,
                        },
                    },
                );
                return null;
            }

            // Check for existing execution
            if (session.currentExecutionId) {
                this.logger.warn(
                    'Attempted to start an execution while another is already in progress.',
                    {
                        context: SessionService.name,
                        metadata: {
                            sessionId,
                            existingExecutionId: session.currentExecutionId,
                            agentName,
                            tenantId: session.tenantId,
                        },
                    },
                );
                return null;
            }

            const executionId = IdGenerator.executionId();

            session.currentExecutionId = executionId;
            session.lastActivity = Date.now();

            // ✅ SYNC: Persist changes if enabled
            if (this.config.persistent && this.storage) {
                await this.storage.storeSession(session);
            }

            this.logger.info('Execution started successfully', {
                context: SessionService.name,
                metadata: {
                    sessionId,
                    executionId,
                    agentName,
                    tenantId: session.tenantId,
                    sessionStatus: session.status,
                },
            });

            return executionId;
        } catch (error) {
            this.logger.error('Failed to start execution', error as Error, {
                context: SessionService.name,
                metadata: {
                    sessionId,
                    agentName,
                    errorMessage:
                        error instanceof Error ? error.message : String(error),
                },
            });
            return null;
        }
    }

    /**
     * End current execution in session
     */
    async endExecution(sessionId: string): Promise<boolean> {
        try {
            const session = await this.getSession(sessionId);
            if (!session) {
                this.logger.warn(
                    'Attempted to end execution for non-existent session',
                    {
                        context: SessionService.name,
                        metadata: {
                            sessionId,
                        },
                    },
                );
                return false;
            }

            if (!session.currentExecutionId) {
                this.logger.warn(
                    'Attempted to end an execution, but none was in progress.',
                    {
                        context: SessionService.name,
                        metadata: {
                            sessionId,
                            tenantId: session.tenantId,
                        },
                    },
                );
                return false;
            }

            const executionId = session.currentExecutionId;
            session.currentExecutionId = undefined;
            session.lastActivity = Date.now();

            // ✅ SYNC: Persist changes if enabled
            if (this.config.persistent && this.storage) {
                await this.storage.storeSession(session);
            }

            this.logger.info('Execution ended successfully', {
                context: SessionService.name,
                metadata: {
                    sessionId,
                    executionId,
                    tenantId: session.tenantId,
                    sessionStatus: session.status,
                },
            });

            return true;
        } catch (error) {
            this.logger.error('Failed to end execution', error as Error, {
                context: SessionService.name,
                metadata: {
                    sessionId,
                    errorMessage:
                        error instanceof Error ? error.message : String(error),
                },
            });
            return false;
        }
    }

    /**
     * Get current execution ID for a session
     */
    async getCurrentExecutionId(sessionId: string): Promise<string | null> {
        const session = await this.getSession(sessionId);
        return session?.currentExecutionId || null;
    }

    /**
     * Add message to conversation history
     */
    async addMessage(
        sessionId: string,
        role: 'user' | 'assistant' | 'tool' | 'system',
        content: string,
        metadata?: ConversationMessage['metadata'],
        tenantId?: string,
    ): Promise<boolean> {
        if (!content || typeof content !== 'string') {
            this.logger.warn('Invalid message content', {
                sessionId,
                role,
                content,
            });
            return false;
        }

        const session = await this.getSession(sessionId);
        if (!session) {
            this.logger.warn('Session not found for adding message', {
                sessionId,
            });
            return false;
        }

        // Security: Validate session belongs to tenant
        if (tenantId && session.tenantId !== tenantId) {
            throw new Error(
                `Session ${sessionId} does not belong to tenant ${tenantId}`,
            );
        }

        const message: ConversationMessage = {
            role,
            content,
            timestamp: Date.now(),
            metadata: metadata || {},
        };

        // Add to conversation history
        session.conversationHistory.push(message);

        // Apply max history limit
        const maxHistory = this.config.maxConversationHistory || 100;
        if (session.conversationHistory.length > maxHistory) {
            session.conversationHistory.shift();
        }

        // Update last activity
        session.lastActivity = Date.now();

        // Save to storage if persistent
        if (this.config.persistent && this.storage) {
            try {
                await this.storage.storeSession(session);
            } catch (error) {
                this.logger.warn(
                    'Failed to persist session after adding message',
                    {
                        sessionId,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                );
            }
        }

        return true;
    }

    /**
     * Get conversation history for a session
     */
    async getConversationHistory(
        sessionId: string,
        tenantId?: string,
    ): Promise<ConversationHistory> {
        const session = await this.getSession(sessionId);
        if (!session) {
            return [];
        }

        // Security: Validate session belongs to tenant
        if (tenantId && session.tenantId !== tenantId) {
            throw new Error(
                `Session ${sessionId} does not belong to tenant ${tenantId}`,
            );
        }

        return session.conversationHistory || [];
    }
}

/**
 * Default session service instance
 */
export const sessionService = new SessionService();
