/**
 * 🍃 ENHANCED SESSION SERVICE - Using Existing Storage Pattern
 *
 * Leverages existing StorageAdapterFactory pattern (InMemory + MongoDB)
 * Follows same pattern as storage-session-adapter.ts
 * Adds: AgentRuntimeContext support, entity management, smart recovery
 */

import {
    AgentRuntimeContext,
    SessionManager,
    ChatMessage,
    ExecutionSnapshot,
    EntityRef,
    isValidRuntimeContext,
    isValidChatMessage,
    isRecoveryNeeded,
} from '../types/context-types.js';

// ✅ USE: Existing storage adapter pattern
import { StorageEnum, Thread } from '../../types/allTypes.js';

import { createLogger } from '../../../observability/logger.js';
import {
    StorageContextSessionAdapter,
    StorageSnapshotAdapter,
} from './storage-context-adapter.js';
import { IdGenerator } from '../../../utils/id-generator.js';

const logger = createLogger('enhanced-session-service');

// ===============================================
// 🏗️ ENHANCED SESSION SERVICE - Using Storage Adapters
// ===============================================

export class EnhancedSessionService implements SessionManager {
    private sessionsAdapter: StorageContextSessionAdapter;
    private snapshotsAdapter: StorageSnapshotAdapter;
    private isInitialized = false;
    private sessionCreationLocks = new Map<
        string,
        Promise<AgentRuntimeContext>
    >();

    constructor(
        connectionString?: string,
        options?: {
            adapterType?: StorageEnum;
            dbName?: string;
            sessionsCollection?: string; // 🎯 Customizável!
            snapshotsCollection?: string; // 🎯 Customizável!
            sessionTTL?: number; // Default 24h
            snapshotTTL?: number; // Default 7 days
        },
    ) {
        // ✅ FOLLOW PATTERN: Use existing storage adapters
        this.sessionsAdapter = new StorageContextSessionAdapter({
            adapterType:
                options?.adapterType ||
                (connectionString ? StorageEnum.MONGODB : StorageEnum.INMEMORY),
            connectionString,
            options: {
                database: options?.dbName || 'kodus-flow',
                collection:
                    options?.sessionsCollection || 'kodus-agent-sessions', // 🎯 Customizável!
            },
        });

        this.snapshotsAdapter = new StorageSnapshotAdapter({
            adapterType:
                options?.adapterType ||
                (connectionString ? StorageEnum.MONGODB : StorageEnum.INMEMORY),
            connectionString,
            options: {
                database: options?.dbName || 'kodus-flow',
                collection:
                    options?.snapshotsCollection || 'kodus-execution-snapshots', // 🎯 Customizável!
            },
        });

        logger.info('Enhanced Session Service configured', {
            adapterType:
                options?.adapterType ||
                (connectionString ? 'mongodb' : 'inmemory'),
            database: options?.dbName || 'kodus-flow',
        });
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        // Initialize both adapters
        await this.sessionsAdapter.initialize();
        await this.snapshotsAdapter.initialize();

        this.isInitialized = true;
        logger.info('Enhanced Session Service initialized');
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    // ===== SESSION MANAGEMENT =====

    async getOrCreateSession(
        threadId: Thread['id'],
        tenantId: string,
    ): Promise<AgentRuntimeContext> {
        await this.ensureInitialized();

        // Check if there's already a creation in progress for this thread (race condition protection)
        const existingLock = this.sessionCreationLocks.get(threadId);
        if (existingLock) {
            logger.info(
                `🔒 Waiting for existing session creation for thread: ${threadId}`,
            );
            return existingLock;
        }

        // Create a promise for this session creation
        const sessionPromise = this.doGetOrCreateSession(threadId, tenantId);
        this.sessionCreationLocks.set(threadId, sessionPromise);

        try {
            const result = await sessionPromise;
            return result;
        } finally {
            // Clean up the lock
            this.sessionCreationLocks.delete(threadId);
        }
    }

    private async doGetOrCreateSession(
        threadId: Thread['id'],
        tenantId: string,
    ): Promise<AgentRuntimeContext> {
        // Try to find existing session by threadId
        const existingSession =
            await this.sessionsAdapter.retrieveContextSessionByThreadId(
                threadId,
            );

        if (existingSession) {
            // Check if session is expired (older than TTL)
            const sessionAge = Date.now() - existingSession.lastActivityAt;
            const ttl = 24 * 60 * 60 * 1000; // 24 hours default

            if (sessionAge > ttl) {
                // Session expired, delete it and create new one
                logger.info(
                    `🗑️ Deleting expired session ${existingSession.sessionId} (age: ${Math.round(sessionAge / 1000 / 60)}min)`,
                );
                await this.sessionsAdapter.deleteContextSession(
                    existingSession.sessionId,
                );
                // Continue to create new session below
            } else {
                // Session still valid, update last activity
                await this.sessionsAdapter.storeContextSession(
                    existingSession.sessionId, // Use sessionId as primary key
                    existingSession.threadId, // Keep threadId for queries
                    existingSession.tenantId,
                    existingSession.status,
                    existingSession.runtime,
                    existingSession.createdAt,
                    Date.now(), // Update last activity
                );

                logger.info(
                    `♻️ Recovered session ${existingSession.sessionId} for thread: ${threadId}`,
                );
                return existingSession.runtime;
            }
        }

        // Generate unique sessionId using existing IdGenerator
        const sessionId = IdGenerator.sessionId();

        // Create new session with ContextNew runtime
        const newRuntime: AgentRuntimeContext = {
            sessionId,
            threadId,
            executionId: IdGenerator.executionId(),
            timestamp: new Date().toISOString(),

            state: {
                phase: 'planning',
                lastUserIntent: 'conversation',
                pendingActions: [],
            },

            messages: [],
            entities: {},

            execution: {
                completedSteps: [],
                failedSteps: [],
                skippedSteps: [],
                replanCount: 0,
            },

            // ✅ RUNTIME ONLY: These will be rebuilt from ToolEngine
            availableTools: [],
            activeConnections: {},
        };

        const now = Date.now();
        await this.sessionsAdapter.storeContextSession(
            sessionId, // Use sessionId as unique document ID
            threadId, // Keep threadId for queries
            tenantId,
            'active',
            newRuntime,
            now, // createdAt
            now, // lastActivityAt
        );

        logger.info(
            `🆕 Created session ${sessionId} for thread ${threadId} (tenant: ${tenantId})`,
        );
        return newRuntime;
    }

    async addMessage(threadId: string, message: ChatMessage): Promise<void> {
        await this.ensureInitialized();

        if (!isValidChatMessage(message)) {
            throw new Error('Invalid chat message format');
        }

        const session =
            await this.sessionsAdapter.retrieveContextSessionByThreadId(
                threadId,
            );
        if (!session) {
            throw new Error(`Session for thread ${threadId} not found`);
        }

        // Add message (keep only last 6 for performance)
        const messages = [...session.runtime.messages, message].slice(-6);

        // Update runtime with new message
        const updatedRuntime: AgentRuntimeContext = {
            ...session.runtime,
            messages,
            timestamp: new Date().toISOString(),
        };

        // If user message, infer and update intent
        if (message.role === 'user') {
            updatedRuntime.state.lastUserIntent = this.inferIntent(
                message.content,
            );
        }

        // Store updated session
        await this.sessionsAdapter.storeContextSession(
            session.sessionId, // Use sessionId as primary key
            session.threadId, // Keep threadId
            session.tenantId,
            session.status,
            updatedRuntime,
            session.createdAt,
            Date.now(),
        );

        logger.debug(`💬 Added ${message.role} message to thread ${threadId}`);
    }

    async addEntities(
        threadId: string,
        entities: Partial<AgentRuntimeContext['entities']>,
    ): Promise<void> {
        await this.ensureInitialized();

        const session =
            await this.sessionsAdapter.retrieveContextSessionByThreadId(
                threadId,
            );
        if (!session) {
            throw new Error(`Session for thread ${threadId} not found`);
        }

        // Smart entity updates with deduplication
        const updatedEntities = { ...session.runtime.entities };

        Object.entries(entities).forEach(([entityType, entityData]) => {
            if (Array.isArray(entityData) && entityData.length > 0) {
                const existing = updatedEntities[
                    entityType as keyof typeof updatedEntities
                ] as EntityRef[] | undefined;
                const merged = [...(existing || []), ...entityData];

                // Deduplicate by ID and keep max 10
                const deduped = merged
                    .filter(
                        (entity, index, arr) =>
                            arr.findIndex((e) => e.id === entity.id) === index,
                    )
                    .slice(-10);

                (updatedEntities as any)[entityType] = deduped;
            } else if (typeof entityData === 'object' && entityData !== null) {
                // For toolResults object
                const existing = updatedEntities[
                    entityType as keyof typeof updatedEntities
                ] as Record<string, unknown> | undefined;
                (updatedEntities as any)[entityType] = {
                    ...(existing || {}),
                    ...entityData,
                };
            }
        });

        // Update runtime with new entities
        const updatedRuntime: AgentRuntimeContext = {
            ...session.runtime,
            entities: updatedEntities,
            timestamp: new Date().toISOString(),
        };

        // Store updated session
        await this.sessionsAdapter.storeContextSession(
            session.sessionId, // Use sessionId as primary key
            session.threadId, // Keep threadId
            session.tenantId,
            session.status,
            updatedRuntime,
            session.createdAt,
            Date.now(),
        );

        logger.debug(
            `🏷️ Updated entities for thread ${threadId}: ${Object.keys(entities).join(', ')}`,
        );
    }

    async updateExecution(
        threadId: string,
        execution: Partial<AgentRuntimeContext['execution']>,
    ): Promise<void> {
        await this.ensureInitialized();

        const session =
            await this.sessionsAdapter.retrieveContextSessionByThreadId(
                threadId,
            );
        if (!session) {
            throw new Error(`Session for thread ${threadId} not found`);
        }

        // Update execution state
        const updatedRuntime: AgentRuntimeContext = {
            ...session.runtime,
            execution: {
                ...session.runtime.execution,
                ...execution,
            },
            timestamp: new Date().toISOString(),
        };

        // Store updated session
        await this.sessionsAdapter.storeContextSession(
            session.sessionId, // Use sessionId as primary key
            session.threadId, // Keep threadId
            session.tenantId,
            session.status,
            updatedRuntime,
            session.createdAt,
            Date.now(),
        );

        logger.debug(
            `⚙️ Updated execution for thread ${threadId}: ${Object.keys(execution).join(', ')}`,
        );
    }

    async saveSnapshot(
        _threadId: string,
        snapshot: ExecutionSnapshot,
    ): Promise<void> {
        await this.ensureInitialized();

        await this.snapshotsAdapter.storeExecutionSnapshot(snapshot, 7); // 7 days TTL

        logger.debug(`📸 Saved execution snapshot: ${snapshot.executionId}`);
    }

    // ===== RECOVERY =====

    async recoverSession(threadId: string): Promise<{
        context: AgentRuntimeContext;
        wasRecovered: boolean;
        gapDuration: number;
        inferences: Record<string, string>;
    }> {
        await this.ensureInitialized();

        const session =
            await this.sessionsAdapter.retrieveContextSessionByThreadId(
                threadId,
            );
        if (!session) {
            throw new Error(`Session for thread ${threadId} not found`);
        }

        const lastActivity = session.lastActivityAt;
        const gapDuration = Date.now() - lastActivity;
        const needsRecovery = isRecoveryNeeded(lastActivity);

        let inferences: Record<string, string> = {};

        if (needsRecovery) {
            // Get latest snapshot for enhanced recovery context
            const latestSnapshot =
                await this.snapshotsAdapter.retrieveLatestSnapshotForSession(
                    session.runtime.sessionId, // Use sessionId for snapshot retrieval
                );

            if (latestSnapshot) {
                inferences = this.buildInferences(
                    session.runtime,
                    latestSnapshot,
                );
            }

            logger.info(
                `🔄 Session recovered after ${Math.round(gapDuration / 1000)}s gap`,
            );
        }

        // Ensure runtime context is valid
        if (!isValidRuntimeContext(session.runtime)) {
            throw new Error(`Invalid runtime context for thread ${threadId}`);
        }

        return {
            context: session.runtime,
            wasRecovered: needsRecovery,
            gapDuration,
            inferences,
        };
    }

    // ===== ANALYTICS & UTILITIES =====

    async getSessionStats(
        _userId: string,
        _tenantId: string = 'default',
    ): Promise<{
        totalSessions: number;
        activeSessions: number;
        averageSessionDuration: number;
        totalExecutions: number;
        recentActivity: number;
    }> {
        await this.ensureInitialized();

        // This would require more complex querying - simplified for now
        const stats = await this.sessionsAdapter.getStats();

        return {
            totalSessions: stats.itemCount,
            activeSessions: 0, // Would need query support
            averageSessionDuration: 0, // Would need query support
            totalExecutions: 0, // Would need aggregation
            recentActivity: 0, // Would need query support
        };
    }

    // ===== PRIVATE UTILITIES =====

    private inferIntent(message: string): string {
        const lower = message.toLowerCase();

        // Generic intent detection patterns (framework agnostic)
        if (
            lower.includes('create') ||
            lower.includes('add') ||
            lower.includes('make')
        ) {
            return 'create';
        }

        if (
            lower.includes('update') ||
            lower.includes('edit') ||
            lower.includes('modify')
        ) {
            return 'update';
        }

        if (lower.includes('delete') || lower.includes('remove')) {
            return 'delete';
        }

        if (
            lower.includes('search') ||
            lower.includes('find') ||
            lower.includes('get')
        ) {
            return 'search';
        }

        if (
            lower.includes('validate') ||
            lower.includes('check') ||
            lower.includes('verify')
        ) {
            return 'validate';
        }

        if (lower.includes('help') || lower.includes('assist')) {
            return 'help';
        }

        return 'general-assistance';
    }

    private buildInferences(
        runtime: AgentRuntimeContext,
        snapshot: any,
    ): Record<string, string> {
        const inferences: Record<string, string> = {};
        const lastMessage =
            runtime.messages[runtime.messages.length - 1]?.content || '';

        // Generic reference resolution patterns (framework agnostic)
        const referencePatterns = [
            {
                patterns: ['this', 'that', 'the item', 'it'],
                entityType: 'items', // Generic fallback
            },
            {
                patterns: ['this one', 'that one', 'the current'],
                entityType: 'items',
            },
        ];

        referencePatterns.forEach(({ patterns, entityType }) => {
            patterns.forEach((pattern) => {
                if (lastMessage.includes(pattern)) {
                    const entities = runtime.entities[
                        entityType as keyof typeof runtime.entities
                    ] as EntityRef[] | undefined;
                    if (entities && entities.length > 0) {
                        const latestEntity = entities[entities.length - 1];
                        if (latestEntity) {
                            inferences[pattern] = latestEntity.id;
                        }
                    }
                }
            });
        });

        // Recovery context from snapshot
        if (snapshot.recoveryContext?.entities) {
            Object.entries(snapshot.recoveryContext.entities).forEach(
                ([entityType, entities]) => {
                    const entitiesArray = entities as any[];
                    if (entitiesArray && entitiesArray.length > 0) {
                        const latest = entitiesArray[entitiesArray.length - 1];
                        if (latest?.id) {
                            inferences[`last_${entityType}`] = latest.id;
                        }
                    }
                },
            );
        }

        return inferences;
    }

    // ===== CLEANUP =====

    async cleanup(): Promise<void> {
        try {
            await this.sessionsAdapter.cleanup();
            await this.snapshotsAdapter.cleanup();

            this.isInitialized = false;
            logger.info('🧹 Enhanced Session Service cleanup completed');
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            logger.error(`❌ Cleanup failed: ${errorMessage}`);
        }
    }
}
