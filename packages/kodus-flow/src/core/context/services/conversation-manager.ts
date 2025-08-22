import { createLogger } from '../../../observability/index.js';

export interface ConversationMessage {
    role: 'user' | 'assistant' | 'system';
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

export interface ConversationConfig {
    maxHistory?: number;
    persistent?: boolean;
    storageAdapter?: ConversationStorageAdapter;
}

/**
 * Optional persistence adapter for conversations
 */
export interface ConversationStorageAdapter {
    storeConversation(
        sessionId: string,
        history: ConversationHistory,
    ): Promise<void>;
    loadConversation(sessionId: string): Promise<ConversationHistory | null>;
    deleteConversation(sessionId: string): Promise<boolean>;
}

/**
 * Manages conversation history for sessions
 */
export class ConversationManager {
    private conversations = new Map<string, ConversationHistory>();
    private sessionTenantMap = new Map<string, string>();
    private logger = createLogger('conversation-manager');
    private config: Required<Omit<ConversationConfig, 'storageAdapter'>> & {
        storageAdapter?: ConversationStorageAdapter;
    };
    private storageAdapter?: ConversationStorageAdapter;

    constructor(config: ConversationConfig = {}) {
        this.config = {
            maxHistory: config.maxHistory || 100,
            persistent: config.persistent ?? false,
            storageAdapter: config.storageAdapter,
        };
        this.storageAdapter = config.storageAdapter;
    }

    /**
     * SECURITY: Validate session belongs to tenant
     */
    private validateSessionTenant(
        sessionId: string,
        expectedTenantId?: string,
    ): void {
        const sessionTenant = this.sessionTenantMap.get(sessionId);

        if (!sessionTenant) {
            throw new Error(
                `Session ${sessionId} not found or not properly initialized`,
            );
        }

        if (expectedTenantId && sessionTenant !== expectedTenantId) {
            throw new Error(
                `Session ${sessionId} does not belong to tenant ${expectedTenantId}`,
            );
        }
    }

    async addMessage(
        sessionId: string,
        role: 'user' | 'assistant' | 'system',
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

        if (tenantId) {
            this.validateSessionTenant(sessionId, tenantId);
        }

        const message: ConversationMessage = {
            role,
            content,
            timestamp: Date.now(),
            metadata: metadata || {},
        };

        let history = this.conversations.get(sessionId);
        if (!history) {
            history = [];
            this.conversations.set(sessionId, history);
        }

        history.push(message);

        if (history.length > this.config.maxHistory) {
            history.shift();
        }

        // Optional persistence
        if (this.config.persistent && this.storageAdapter) {
            try {
                await this.storageAdapter.storeConversation(sessionId, history);
            } catch (error) {
                this.logger.warn('Failed to persist conversation', {
                    sessionId,
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            }
        }

        return true;
    }

    /**
     * Get conversation history for a session
     */
    async getHistory(
        sessionId: string,
        tenantId?: string,
    ): Promise<ConversationHistory> {
        if (tenantId) {
            this.validateSessionTenant(sessionId, tenantId);
        }

        // Check in-memory first
        let history = this.conversations.get(sessionId);

        // If not in memory and persistence enabled, try loading from storage
        if (!history && this.config.persistent && this.storageAdapter) {
            try {
                const loadedHistory =
                    await this.storageAdapter.loadConversation(sessionId);
                if (loadedHistory) {
                    history = loadedHistory;
                    this.conversations.set(sessionId, history);
                    // Associate with tenant if provided
                    if (tenantId) {
                        this.sessionTenantMap.set(sessionId, tenantId);
                    }
                }
            } catch (error) {
                this.logger.warn('Failed to load conversation from storage', {
                    sessionId,
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            }
        }

        return history || [];
    }

    /**
     * Initialize conversation history for a session
     * SECURITY: Associate session with tenant for validation
     */
    initializeSession(
        sessionId: string,
        history: ConversationHistory = [],
        tenantId?: string,
    ): void {
        this.conversations.set(sessionId, history);
        if (tenantId) {
            this.sessionTenantMap.set(sessionId, tenantId);
        }
    }

    /**
     * Clear conversation history for a session
     */
    clearSession(sessionId: string): void {
        this.conversations.delete(sessionId);
        this.sessionTenantMap.delete(sessionId);
    }

    /**
     * Update existing conversation history
     */
    updateHistory(sessionId: string, history: ConversationHistory): void {
        this.conversations.set(sessionId, history);
    }

    /**
     * Get all session IDs with conversations
     */
    getSessionIds(): string[] {
        return Array.from(this.conversations.keys());
    }

    /**
     * Clear all conversations
     */
    clearAll(): void {
        this.conversations.clear();
        this.sessionTenantMap.clear();
    }
}
