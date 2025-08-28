/**
 * 🍃 MONGODB SESSION SERVICE - SIMPLIFIED & EFFICIENT
 *
 * Clean MongoDB implementation following the recommended JSON structure
 * Focus: Fast runtime access + efficient recovery
 */

import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import {
    AgentRuntimeContext,
    SessionManager,
    ChatMessage,
    ExecutionSnapshot,
    EntityRef,
    ConnectionStatus,
    isValidRuntimeContext,
    isValidChatMessage,
    isRecoveryNeeded,
} from '../types/context-types.js';

// ===============================================
// 🗄️ MONGODB DOCUMENTS
// ===============================================

/**
 * Session document - stores active runtime context
 */
interface SessionDocument {
    _id: ObjectId;
    sessionId: string;
    userId: string;
    status: 'active' | 'completed';

    // Runtime context (frequently updated)
    runtime: AgentRuntimeContext;

    // Metadata
    createdAt: Date;
    lastActivityAt: Date; // TTL index for cleanup
}

/**
 * Execution snapshot document - for recovery/audit
 */
interface SnapshotDocument extends ExecutionSnapshot {
    _id: ObjectId;
    createdAt: Date;
    expiresAt: Date; // TTL for auto-cleanup
}

// ===============================================
// 🏗️ MONGODB SESSION SERVICE
// ===============================================

export class MongoDBSessionService implements SessionManager {
    private client: MongoClient;
    private db: Db;
    private sessions: Collection<SessionDocument>;
    private snapshots: Collection<SnapshotDocument>;

    constructor(connectionString: string, dbName: string = 'kodus-flow') {
        this.client = new MongoClient(connectionString);
        this.db = this.client.db(dbName);
        this.sessions = this.db.collection('sessions');
        this.snapshots = this.db.collection('execution_snapshots');

        this.createIndexes();
    }

    private async createIndexes(): Promise<void> {
        // Sessions indexes
        await this.sessions.createIndex({ sessionId: 1 }, { unique: true });
        await this.sessions.createIndex({ userId: 1 });
        await this.sessions.createIndex(
            {
                lastActivityAt: 1,
            },
            {
                expireAfterSeconds: 86400, // Auto-delete after 24h inactive
            },
        );

        // Snapshots indexes
        await this.snapshots.createIndex({ sessionId: 1 });
        await this.snapshots.createIndex({ executionId: 1 });
        await this.snapshots.createIndex(
            {
                expiresAt: 1,
            },
            {
                expireAfterSeconds: 0, // Use document field for TTL
            },
        );
    }

    // ===== SESSION MANAGEMENT =====

    async getOrCreateSession(
        sessionId: string,
        userId: string,
    ): Promise<AgentRuntimeContext> {
        const existingSession = await this.sessions.findOne({ sessionId });

        if (existingSession) {
            // Update last activity
            await this.sessions.updateOne(
                { sessionId },
                {
                    $set: {
                        'lastActivityAt': new Date(),
                        'runtime.timestamp': new Date().toISOString(),
                    },
                },
            );
            return existingSession.runtime;
        }

        // Create new session
        const newRuntime: AgentRuntimeContext = {
            sessionId,
            executionId: this.generateExecutionId(),
            userId,
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
                replanCount: 0,
            },

            availableTools: [],
            activeConnections: {},
        };

        const sessionDoc: SessionDocument = {
            _id: new ObjectId(),
            sessionId,
            userId,
            status: 'active',
            runtime: newRuntime,
            createdAt: new Date(),
            lastActivityAt: new Date(),
        };

        await this.sessions.insertOne(sessionDoc);
        return newRuntime;
    }

    async addMessage(sessionId: string, message: ChatMessage): Promise<void> {
        if (!isValidChatMessage(message)) {
            throw new Error('Invalid chat message format');
        }

        const updates: any = {
            'lastActivityAt': new Date(),
            'runtime.timestamp': new Date().toISOString(),
        };

        // Add message (keep only last 6)
        await this.sessions.updateOne(
            { sessionId },
            {
                $push: {
                    'runtime.messages': {
                        $each: [message],
                        $slice: -6, // Keep only last 6 messages
                    },
                },
                $set: updates,
            },
        );

        // If user message, update intent
        if (message.role === 'user') {
            const intent = this.inferIntent(message.content);
            await this.sessions.updateOne(
                { sessionId },
                {
                    $set: {
                        'runtime.state.lastUserIntent': intent,
                    },
                },
            );
        }
    }

    async addEntities(
        sessionId: string,
        entities: Partial<AgentRuntimeContext['entities']>,
    ): Promise<void> {
        const updateFields: any = {};

        // Add entities to existing arrays
        Object.entries(entities).forEach(([key, value]) => {
            if (Array.isArray(value) && value.length > 0) {
                updateFields[`runtime.entities.${key}`] = {
                    $each: value,
                    $slice: -10, // Keep max 10 per entity type
                };
            } else if (typeof value === 'object' && value !== null) {
                // For toolResults object
                Object.entries(value).forEach(([subKey, subValue]) => {
                    updateFields[`runtime.entities.${key}.${subKey}`] =
                        subValue;
                });
            }
        });

        if (Object.keys(updateFields).length > 0) {
            const updateDoc: any = { $set: { lastActivityAt: new Date() } };

            Object.entries(updateFields).forEach(([key, value]) => {
                if (value && typeof value === 'object' && '$each' in value) {
                    updateDoc.$addToSet = updateDoc.$addToSet || {};
                    updateDoc.$addToSet[key] = value;
                } else {
                    updateDoc.$set = updateDoc.$set || {};
                    updateDoc.$set[key] = value;
                }
            });

            await this.sessions.updateOne({ sessionId }, updateDoc);
        }
    }

    async updateExecution(
        sessionId: string,
        execution: Partial<AgentRuntimeContext['execution']>,
    ): Promise<void> {
        const updateFields: any = {};

        Object.entries(execution).forEach(([key, value]) => {
            updateFields[`runtime.execution.${key}`] = value;
        });

        await this.sessions.updateOne(
            { sessionId },
            {
                $set: {
                    ...updateFields,
                    lastActivityAt: new Date(),
                },
            },
        );
    }

    async saveSnapshot(
        sessionId: string,
        snapshot: ExecutionSnapshot,
    ): Promise<void> {
        const snapshotDoc: SnapshotDocument = {
            _id: new ObjectId(),
            ...snapshot,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        };

        await this.snapshots.insertOne(snapshotDoc);
    }

    // ===== RECOVERY =====

    async recoverSession(sessionId: string): Promise<{
        context: AgentRuntimeContext;
        wasRecovered: boolean;
        gapDuration: number;
        inferences: Record<string, string>;
    }> {
        const session = await this.sessions.findOne({ sessionId });

        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        const lastActivity = session.lastActivityAt.getTime();
        const gapDuration = Date.now() - lastActivity;
        const needsRecovery = isRecoveryNeeded(lastActivity);

        let inferences: Record<string, string> = {};

        if (needsRecovery) {
            // Get latest snapshot for context
            const latestSnapshot = await this.snapshots.findOne(
                { sessionId },
                { sort: { createdAt: -1 } },
            );

            if (latestSnapshot) {
                // Build inferences from recovery context
                inferences = this.buildInferences(
                    session.runtime,
                    latestSnapshot,
                );
            }

            console.log(
                `🔄 Session recovered after ${Math.round(gapDuration / 1000)}s gap`,
            );
        }

        return {
            context: session.runtime,
            wasRecovered: needsRecovery,
            gapDuration,
            inferences,
        };
    }

    // ===== UTILITY METHODS =====

    private generateExecutionId(): string {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 6);
        return `exec_${timestamp}_${random}`;
    }

    private inferIntent(message: string): string {
        const lower = message.toLowerCase();

        // Common patterns
        if (lower.includes('criar') || lower.includes('create')) {
            if (lower.includes('regra') || lower.includes('rule'))
                return 'create-kody-rule';
            if (lower.includes('card') || lower.includes('jira'))
                return 'create-jira-card';
            return 'create';
        }

        if (
            lower.includes('validar') ||
            lower.includes('validate') ||
            lower.includes('check')
        ) {
            if (lower.includes('pr') || lower.includes('pull request'))
                return 'validate-pr';
            return 'validate';
        }

        if (lower.includes('atualizar') || lower.includes('update')) {
            if (lower.includes('card') || lower.includes('jira'))
                return 'update-jira-card';
            if (lower.includes('notion')) return 'update-notion';
            return 'update';
        }

        if (lower.includes('ajuda') || lower.includes('help')) return 'help';

        // Default intent
        return 'general-assistance';
    }

    private buildInferences(
        runtime: AgentRuntimeContext,
        snapshot: SnapshotDocument,
    ): Record<string, string> {
        const inferences: Record<string, string> = {};
        const lastMessage =
            runtime.messages[runtime.messages.length - 1]?.content || '';

        // Resolve common references
        if (
            lastMessage.includes('esse card') ||
            lastMessage.includes('aquele card')
        ) {
            const lastCard =
                runtime.entities.jiraCards?.[
                    runtime.entities.jiraCards.length - 1
                ];
            if (lastCard) {
                inferences['esse card'] = lastCard.id;
                inferences['aquele card'] = lastCard.id;
            }
        }

        if (
            lastMessage.includes('essa regra') ||
            lastMessage.includes('aquela regra')
        ) {
            const lastRule =
                runtime.entities.kodyRules?.[
                    runtime.entities.kodyRules.length - 1
                ];
            if (lastRule) {
                inferences['essa regra'] = lastRule.id;
                inferences['aquela regra'] = lastRule.id;
            }
        }

        if (
            lastMessage.includes('esse PR') ||
            lastMessage.includes('aquele PR')
        ) {
            const lastPR =
                runtime.entities.pullRequests?.[
                    runtime.entities.pullRequests.length - 1
                ];
            if (lastPR) {
                inferences['esse PR'] = lastPR.id;
                inferences['aquele PR'] = lastPR.id;
            }
        }

        // Use recovery context from snapshot
        if (snapshot.recoveryContext?.entities) {
            Object.entries(snapshot.recoveryContext.entities).forEach(
                ([entityType, entities]) => {
                    if (entities.length > 0) {
                        const latest = entities[entities.length - 1];
                        inferences[`last_${entityType}`] = latest.id;
                    }
                },
            );
        }

        return inferences;
    }

    // ===== ANALYTICS (optional) =====

    async getSessionStats(userId: string): Promise<{
        totalSessions: number;
        activeSessions: number;
        averageSessionDuration: number;
        totalExecutions: number;
    }> {
        const stats = await this.sessions
            .aggregate([
                { $match: { userId } },
                {
                    $group: {
                        _id: null,
                        totalSessions: { $sum: 1 },
                        activeSessions: {
                            $sum: {
                                $cond: [{ $eq: ['$status', 'active'] }, 1, 0],
                            },
                        },
                        avgDuration: {
                            $avg: {
                                $subtract: ['$lastActivityAt', '$createdAt'],
                            },
                        },
                        totalExecutions: {
                            $sum: {
                                $size: {
                                    $ifNull: [
                                        '$runtime.execution.completedSteps',
                                        [],
                                    ],
                                },
                            },
                        },
                    },
                },
            ])
            .toArray();

        if (stats.length === 0) {
            return {
                totalSessions: 0,
                activeSessions: 0,
                averageSessionDuration: 0,
                totalExecutions: 0,
            };
        }

        return {
            totalSessions: stats[0].totalSessions,
            activeSessions: stats[0].activeSessions,
            averageSessionDuration: stats[0].avgDuration,
            totalExecutions: stats[0].totalExecutions,
        };
    }

    // ===== CLEANUP =====

    async cleanup(): Promise<void> {
        // Cleanup old snapshots (older than 30 days)
        await this.snapshots.deleteMany({
            createdAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        });

        // Cleanup completed sessions (older than 7 days)
        await this.sessions.deleteMany({
            status: 'completed',
            lastActivityAt: {
                $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
        });
    }

    async close(): Promise<void> {
        await this.client.close();
    }
}
