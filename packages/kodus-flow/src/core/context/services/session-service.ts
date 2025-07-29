/**
 * Session Service - Gerenciamento robusto de sessões de usuário
 *
 * RESPONSABILIDADES:
 * - Criar e gerenciar sessões de usuário
 * - Persistir contexto entre execuções
 * - Gerenciar lifecycle das sessões
 * - Integração com memory e state
 */

import { IdGenerator } from '../../../utils/id-generator.js';
import { createLogger } from '../../../observability/index.js';
import { ContextStateService } from './state-service.js';
import { SessionId, ThreadId, TenantId } from '@/core/types/base-types.js';

export type ConversationHistory = Array<{
    timestamp: number;
    input: unknown;
    output: unknown;
    agentName?: string;
    metadata?: Record<string, unknown>;
}>;

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
};

export interface SessionConfig {
    maxSessions?: number;
    sessionTimeout?: number; // ms
    maxConversationHistory?: number;
    enableAutoCleanup?: boolean;
    cleanupInterval?: number; // ms
}

export interface SessionContext {
    id: SessionId;
    threadId: ThreadId;
    tenantId: TenantId;
    stateManager: ContextStateService;
    // TODO
    //memoryService?: MemoryService;
    conversationHistory: Session['conversationHistory'];
    metadata: Record<string, unknown>;
}

export class SessionService {
    private sessions = new Map<string, Session>();
    private sessionStateManagers = new Map<string, ContextStateService>();
    private logger = createLogger('session-service');
    private config: Required<SessionConfig>;
    private cleanupIntervalId?: NodeJS.Timeout;

    constructor(config: SessionConfig = {}) {
        this.config = {
            maxSessions: config.maxSessions || 1000,
            sessionTimeout: config.sessionTimeout || 30 * 60 * 1000, // 30 min
            maxConversationHistory: config.maxConversationHistory || 100,
            enableAutoCleanup: config.enableAutoCleanup !== false,
            cleanupInterval: config.cleanupInterval || 5 * 60 * 1000, // 5 min
        };

        if (this.config.enableAutoCleanup) {
            this.startAutoCleanup();
        }

        this.logger.info('SessionService initialized', this.config);
    }

    /**
     * Criar nova sessão
     */
    createSession(
        tenantId: string,
        threadId: string,
        metadata: Record<string, unknown> = {},
    ): Session {
        // ✅ ADD: Log detalhado para debug
        console.log('🔧 SESSION SERVICE - CREATE SESSION START', {
            tenantId,
            threadId,
            metadataKeys: Object.keys(metadata),
            totalSessionsBefore: this.sessions.size,
            trace: {
                source: 'session-service',
                step: 'create-session-start',
                timestamp: Date.now(),
            },
        });

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

        this.sessions.set(sessionId, session);
        this.sessionStateManagers.set(sessionId, stateManager);

        // Enforce max sessions limit
        this.enforceMaxSessions();

        // ✅ ADD: Log após criação bem-sucedida
        console.log('🔧 SESSION SERVICE - SESSION CREATED SUCCESS', {
            sessionId,
            threadId,
            tenantId,
            totalSessionsAfter: this.sessions.size,
            stateManagersCount: this.sessionStateManagers.size,
            trace: {
                source: 'session-service',
                step: 'create-session-success',
                timestamp: Date.now(),
            },
        });

        this.logger.info('Session created', {
            sessionId,
            threadId,
            tenantId,
            totalSessions: this.sessions.size,
        });

        return session;
    }

    /**
     * Obter sessão existente
     */
    getSession(sessionId: string): Session | undefined {
        // ✅ ADD: Log detalhado para debug
        console.log('🔧 SESSION SERVICE - GET SESSION', {
            sessionId,
            totalSessions: this.sessions.size,
            sessionExists: this.sessions.has(sessionId),
            stateManagerExists: this.sessionStateManagers.has(sessionId),
            trace: {
                source: 'session-service',
                step: 'get-session-start',
                timestamp: Date.now(),
            },
        });

        const session = this.sessions.get(sessionId);

        if (session) {
            // Verificar se sessão expirou ANTES de atualizar lastActivity
            if (this.isSessionExpired(session)) {
                session.status = 'expired';
                // CRÍTICO: Limpar state manager quando sessão expira
                this.sessionStateManagers.delete(sessionId);
                console.log('🔧 SESSION SERVICE - SESSION EXPIRED', {
                    sessionId,
                    sessionAge: Date.now() - session.createdAt,
                    trace: {
                        source: 'session-service',
                        step: 'session-expired',
                        timestamp: Date.now(),
                    },
                });
                this.logger.warn('Session expired', { sessionId });
                return undefined;
            }

            // Atualizar última atividade apenas se sessão não expirou
            session.lastActivity = Date.now();

            // ✅ ADD: Log após get bem-sucedido
            console.log('🔧 SESSION SERVICE - GET SESSION SUCCESS', {
                sessionId,
                sessionStatus: session.status,
                sessionAge: Date.now() - session.createdAt,
                lastActivity: session.lastActivity,
                trace: {
                    source: 'session-service',
                    step: 'get-session-success',
                    timestamp: Date.now(),
                },
            });
        } else {
            console.log('🔧 SESSION SERVICE - GET SESSION NOT FOUND', {
                sessionId,
                availableSessions: Array.from(this.sessions.keys()),
                trace: {
                    source: 'session-service',
                    step: 'get-session-not-found',
                    timestamp: Date.now(),
                },
            });
        }

        return session;
    }

    /**
     * Get session by thread ID (for ContextBuilder)
     */
    getSessionByThread(threadId: string): Session | undefined {
        for (const session of this.sessions.values()) {
            if (session.threadId === threadId && session.status === 'active') {
                return session;
            }
        }
        return undefined;
    }

    /**
     * Obter contexto completo da sessão
     */
    getSessionContext(sessionId: string): SessionContext | undefined {
        const session = this.getSession(sessionId);
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
            conversationHistory: session.conversationHistory,
            metadata: session.metadata,
        };
    }

    /**
     * Adicionar entrada na conversa
     */
    addConversationEntry(
        sessionId: string,
        input: unknown,
        output: unknown,
        agentName?: string,
        metadata: Record<string, unknown> = {},
    ): boolean {
        const session = this.getSession(sessionId);
        if (!session) return false;

        const entry = {
            timestamp: Date.now(),
            input,
            output,
            agentName,
            metadata,
        };

        session.conversationHistory.push(entry);

        // Enforce max conversation history
        if (
            session.conversationHistory.length >
            this.config.maxConversationHistory
        ) {
            session.conversationHistory.shift(); // Remove oldest entry
        }

        // Atualizar última atividade
        session.lastActivity = Date.now();

        this.logger.debug('Conversation entry added', {
            sessionId,
            agentName,
            historyLength: session.conversationHistory.length,
        });

        return true;
    }

    /**
     * Atualizar metadados da sessão
     */
    updateSessionMetadata(
        sessionId: string,
        updates: Record<string, unknown>,
    ): boolean {
        const session = this.getSession(sessionId);
        if (!session) return false;

        session.metadata = { ...session.metadata, ...updates };
        session.lastActivity = Date.now();

        return true;
    }

    /**
     * Atualizar dados de contexto da sessão
     */
    updateSessionContext(
        sessionId: string,
        updates: Record<string, unknown>,
    ): boolean {
        const session = this.getSession(sessionId);
        if (!session) return false;

        session.contextData = { ...session.contextData, ...updates };
        session.lastActivity = Date.now();

        return true;
    }

    /**
     * Pausar sessão
     */
    pauseSession(sessionId: string): boolean {
        const session = this.getSession(sessionId);
        if (!session) return false;

        session.status = 'paused';
        session.lastActivity = Date.now();

        this.logger.info('Session paused', { sessionId });
        return true;
    }

    /**
     * Resumir sessão
     */
    resumeSession(sessionId: string): boolean {
        const session = this.sessions.get(sessionId);
        if (!session) return false;

        session.status = 'active';
        session.lastActivity = Date.now();

        this.logger.info('Session resumed', { sessionId });
        return true;
    }

    /**
     * Fechar sessão
     */
    closeSession(sessionId: string): boolean {
        const session = this.sessions.get(sessionId);
        if (!session) return false;

        session.status = 'closed';
        session.lastActivity = Date.now();

        // Cleanup state manager
        this.sessionStateManagers.delete(sessionId);

        this.logger.info('Session closed', { sessionId });
        return true;
    }

    /**
     * Buscar sessões por critérios
     */
    findSessions(criteria: {
        threadId?: string;
        tenantId?: string;
        status?: Session['status'];
        activeSince?: number;
    }): Session[] {
        return Array.from(this.sessions.values()).filter((session) => {
            if (criteria.threadId && session.threadId !== criteria.threadId)
                return false;
            if (criteria.tenantId && session.tenantId !== criteria.tenantId)
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
     */
    findSessionByThread(
        threadId: string,
        tenantId?: string,
    ): Session | undefined {
        for (const session of this.sessions.values()) {
            if (
                session.threadId === threadId &&
                (!tenantId || session.tenantId === tenantId) &&
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
     * Cleanup completo
     */
    async cleanup(): Promise<void> {
        this.stopAutoCleanup();

        // Cleanup all sessions
        this.sessions.clear();
        this.sessionStateManagers.clear();

        this.logger.info('SessionService cleanup completed');
    }
}

/**
 * Default session service instance
 */
export const sessionService = new SessionService();
