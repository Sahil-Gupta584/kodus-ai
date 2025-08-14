/**
 * @module runtime/core/dlq-handler
 * @description Dead Letter Queue Handler
 *
 * Handles events that have failed processing after multiple retry attempts.
 * Provides persistence, reprocessing capabilities, and comprehensive monitoring.
 */

import type { AnyEvent, Snapshot } from '../../core/types/common-types.js';
import type { Persistor } from '../../persistor/index.js';
import type { ObservabilitySystem } from '../../observability/index.js';
import { createHash } from 'crypto';

/**
 * Configuration for Dead Letter Queue
 */
export interface DLQConfig {
    // Persistence settings
    enablePersistence?: boolean; // Default: true
    maxDLQSize?: number; // Default: 1000

    // Retention settings
    maxRetentionDays?: number; // Default: 7 days
    enableAutoCleanup?: boolean; // Default: true
    cleanupInterval?: number; // Default: 1 hour

    // Monitoring settings
    enableDetailedLogging?: boolean; // Default: true
    alertThreshold?: number; // Alert when DLQ size exceeds this (default: 100)
}

/**
 * Dead Letter Queue item with comprehensive metadata
 */
export interface DLQItem {
    id: string;
    event: AnyEvent;
    errors: Array<{
        message: string;
        stack?: string;
        timestamp: number;
        attempt: number;
    }>;
    attempts: number;
    firstFailedAt: number;
    lastFailedAt: number;
    dlqTimestamp: number;
    originalPriority: number;
    processingContext?: {
        handlerName?: string;
        correlationId?: string;
        traceId?: string;
        agentId?: string;
        workflowId?: string;
    };
    tags?: string[]; // For categorization
    canReprocess?: boolean; // Default: true
}

/**
 * DLQ Statistics for monitoring
 */
export interface DLQStats {
    totalItems: number;
    itemsByEventType: Record<string, number>;
    itemsByErrorType: Record<string, number>;
    averageAttempts: number;
    oldestItem?: {
        id: string;
        age: number; // in milliseconds
        eventType: string;
    };
    recentItems: Array<{
        id: string;
        eventType: string;
        errorMessage: string;
        attempts: number;
        age: number;
    }>;
}

/**
 * Dead Letter Queue Handler
 *
 * Manages failed events with persistence, monitoring, and reprocessing capabilities.
 */
export class DeadLetterQueue {
    private dlqItems: Map<string, DLQItem> = new Map();
    private cleanupTimer?: NodeJS.Timeout;

    constructor(
        private observability: ObservabilitySystem,
        private persistor?: Persistor,
        private xcId?: string,
        private config: DLQConfig = {},
    ) {
        this.config = {
            enablePersistence: true,
            maxDLQSize: 1000,
            maxRetentionDays: 7,
            enableAutoCleanup: true,
            cleanupInterval: 60 * 60 * 1000, // 1 hour
            enableDetailedLogging: true,
            alertThreshold: 100,
            ...config,
        };

        // Start auto-cleanup if enabled
        if (this.config.enableAutoCleanup) {
            this.startAutoCleanup();
        }

        // Load persisted DLQ items if persistence is enabled
        if (this.config.enablePersistence && this.persistor && this.xcId) {
            void this.loadPersistedDLQItems();
        }
    }

    /**
     * Send an event to the Dead Letter Queue
     */
    async sendToDLQ(
        event: AnyEvent,
        error: Error,
        attempts: number,
        context?: {
            handlerName?: string;
            correlationId?: string;
            traceId?: string;
            agentId?: string;
            workflowId?: string;
            originalPriority?: number;
        },
    ): Promise<void> {
        // Check DLQ size limit
        if (this.dlqItems.size >= this.config.maxDLQSize!) {
            await this.enforceMaxSize();
        }

        const existingItem = this.dlqItems.get(event.id);
        const now = Date.now();

        const dlqItem: DLQItem = {
            id: event.id,
            event,
            errors: [
                ...(existingItem?.errors || []),
                {
                    message: error.message,
                    stack: error.stack,
                    timestamp: now,
                    attempt: attempts,
                },
            ],
            attempts,
            firstFailedAt: existingItem?.firstFailedAt || now,
            lastFailedAt: now,
            dlqTimestamp: existingItem?.dlqTimestamp || now,
            originalPriority: context?.originalPriority || 0,
            processingContext: context,
            tags: this.generateTags(event, error),
            canReprocess: true,
        };

        this.dlqItems.set(event.id, dlqItem);

        // Persist if enabled
        if (this.config.enablePersistence && this.persistor && this.xcId) {
            await this.persistDLQItem(dlqItem);
        }

        // Log with appropriate level
        if (this.config.enableDetailedLogging) {
            this.observability.logger.error('Event sent to DLQ', error, {
                eventType: event.type,
                eventId: event.id,
                attempts,
                dlqSize: this.dlqItems.size,
                correlationId: context?.correlationId,
                traceId: context?.traceId,
                tags: dlqItem.tags,
            });
        }

        // Check alert threshold
        if (this.dlqItems.size >= this.config.alertThreshold!) {
            this.observability.logger.warn('DLQ size threshold exceeded', {
                dlqSize: this.dlqItems.size,
                threshold: this.config.alertThreshold,
                xcId: this.xcId,
            });
        }

        // Emit DLQ metrics
        await this.emitDLQMetrics();
    }

    /**
     * Reprocess an event from the DLQ
     */
    async reprocessFromDLQ(eventId: string): Promise<AnyEvent | null> {
        const dlqItem = this.dlqItems.get(eventId);
        if (!dlqItem) {
            return null;
        }

        if (!dlqItem.canReprocess) {
            this.observability.logger.warn(
                'Attempted to reprocess non-reprocessable DLQ item',
                {
                    eventId,
                    eventType: dlqItem.event.type,
                },
            );
            return null;
        }

        // Remove from DLQ
        this.dlqItems.delete(eventId);

        // Remove from persistence if enabled
        if (this.config.enablePersistence && this.persistor && this.xcId) {
            await this.removeDLQItemFromPersistence(eventId);
        }

        this.observability.logger.info('Event reprocessed from DLQ', {
            eventId,
            eventType: dlqItem.event.type,
            originalAttempts: dlqItem.attempts,
            timeInDLQ: Date.now() - dlqItem.dlqTimestamp,
        });

        return dlqItem.event;
    }

    /**
     * Bulk reprocess events by criteria
     */
    async reprocessByCriteria(criteria: {
        eventType?: string;
        errorType?: string;
        tag?: string;
        maxAge?: number; // in milliseconds
        limit?: number;
    }): Promise<AnyEvent[]> {
        const reprocessedEvents: AnyEvent[] = [];
        const itemsToReprocess: DLQItem[] = [];

        for (const item of this.dlqItems.values()) {
            if (!item.canReprocess) continue;

            let matches = true;

            // Check event type
            if (criteria.eventType && item.event.type !== criteria.eventType) {
                matches = false;
            }

            // Check error type
            if (
                criteria.errorType &&
                !item.errors.some((e) =>
                    e.message.includes(criteria.errorType!),
                )
            ) {
                matches = false;
            }

            // Check tag
            if (criteria.tag && !item.tags?.includes(criteria.tag)) {
                matches = false;
            }

            // Check age - items older than maxAge should match
            if (
                criteria.maxAge &&
                Date.now() - item.dlqTimestamp < criteria.maxAge
            ) {
                matches = false;
            }

            if (matches) {
                itemsToReprocess.push(item);

                // Apply limit
                if (
                    criteria.limit &&
                    itemsToReprocess.length >= criteria.limit
                ) {
                    break;
                }
            }
        }

        // Reprocess matched items
        for (const item of itemsToReprocess) {
            const event = await this.reprocessFromDLQ(item.id);
            if (event) {
                reprocessedEvents.push(event);
            }
        }

        this.observability.logger.info('Bulk reprocess completed', {
            criteria,
            reprocessedCount: reprocessedEvents.length,
            totalEvaluated: this.dlqItems.size,
        });

        return reprocessedEvents;
    }

    /**
     * Mark an event as non-reprocessable (poison message)
     */
    async markAsPoison(eventId: string, reason: string): Promise<void> {
        const dlqItem = this.dlqItems.get(eventId);
        if (!dlqItem) {
            return;
        }

        dlqItem.canReprocess = false;
        dlqItem.tags = [...(dlqItem.tags || []), 'poison'];

        // Add poison reason to errors
        dlqItem.errors.push({
            message: `Marked as poison: ${reason}`,
            timestamp: Date.now(),
            attempt: -1, // Special marker for poison
        });

        // Update persistence
        if (this.config.enablePersistence && this.persistor && this.xcId) {
            await this.persistDLQItem(dlqItem);
        }

        this.observability.logger.warn('Event marked as poison message', {
            eventId,
            eventType: dlqItem.event.type,
            reason,
            originalAttempts: dlqItem.attempts,
        });
    }

    /**
     * Get comprehensive DLQ statistics
     */
    getDLQStats(): DLQStats {
        const items = Array.from(this.dlqItems.values());
        const now = Date.now();

        // Group by event type
        const itemsByEventType: Record<string, number> = {};
        items.forEach((item) => {
            itemsByEventType[item.event.type] =
                (itemsByEventType[item.event.type] || 0) + 1;
        });

        // Group by error type
        const itemsByErrorType: Record<string, number> = {};
        items.forEach((item) => {
            item.errors.forEach((error) => {
                const errorType = this.extractErrorType(error.message);
                itemsByErrorType[errorType] =
                    (itemsByErrorType[errorType] || 0) + 1;
            });
        });

        // Calculate average attempts
        const totalAttempts = items.reduce(
            (sum, item) => sum + item.attempts,
            0,
        );
        const averageAttempts =
            items.length > 0 ? totalAttempts / items.length : 0;

        // Find oldest item
        let oldestItem;
        if (items.length > 0) {
            const oldest = items.reduce((oldest, item) =>
                item.dlqTimestamp < oldest.dlqTimestamp ? item : oldest,
            );
            oldestItem = {
                id: oldest.id,
                age: now - oldest.dlqTimestamp,
                eventType: oldest.event.type,
            };
        }

        // Get recent items (last 10)
        const recentItems = items
            .sort((a, b) => b.dlqTimestamp - a.dlqTimestamp)
            .slice(0, 10)
            .map((item) => ({
                id: item.id,
                eventType: item.event.type,
                errorMessage:
                    item.errors[item.errors.length - 1]?.message ||
                    'Unknown error',
                attempts: item.attempts,
                age: now - item.dlqTimestamp,
            }));

        return {
            totalItems: items.length,
            itemsByEventType,
            itemsByErrorType,
            averageAttempts,
            oldestItem,
            recentItems,
        };
    }

    /**
     * Clear all DLQ items (use with caution)
     */
    async clearDLQ(): Promise<number> {
        const clearedCount = this.dlqItems.size;
        this.dlqItems.clear();

        this.observability.logger.warn('DLQ cleared manually', {
            clearedCount,
            xcId: this.xcId,
        });

        return clearedCount;
    }

    /**
     * Generate tags for categorization
     */
    private generateTags(event: AnyEvent, error: Error): string[] {
        const tags: string[] = [];

        // Add event type prefix as tag
        const parts = event.type.split('.');
        if (parts.length > 0) {
            tags.push(`type:${parts[0]}`);
        }

        // Add error type as tag
        tags.push(`error:${this.extractErrorType(error.message)}`);

        // Add metadata-based tags
        if (event.metadata?.agentId) {
            tags.push(`agent:${event.metadata.agentId}`);
        }

        if (event.metadata?.workflowId) {
            tags.push(`workflow:${event.metadata.workflowId}`);
        }

        return tags;
    }

    /**
     * Extract error type from error message
     */
    private extractErrorType(errorMessage: string): string {
        // Simple error type extraction
        const patterns = [
            /TimeoutError/i,
            /ValidationError/i,
            /NetworkError/i,
            /AuthenticationError/i,
            /AuthorizationError/i,
            /ParseError/i,
            /ConfigurationError/i,
        ];

        for (const pattern of patterns) {
            if (pattern.test(errorMessage)) {
                return pattern.source.replace(/[^a-zA-Z]/g, '').toLowerCase();
            }
        }

        return 'unknown';
    }

    /**
     * Persist DLQ item to storage
     */
    private async persistDLQItem(dlqItem: DLQItem): Promise<void> {
        if (!this.persistor || !this.xcId) return;

        try {
            const snapshot: Snapshot = {
                xcId: this.xcId,
                hash: this.createDLQHash(dlqItem),
                ts: Date.now(),
                events: [dlqItem.event],
                state: {
                    type: 'dlq-item',
                    dlqItem,
                },
            };

            await this.persistor.append(snapshot);
        } catch (error) {
            this.observability.logger.error(
                'Failed to persist DLQ item',
                error as Error,
                {
                    eventId: dlqItem.id,
                    eventType: dlqItem.event.type,
                },
            );
        }
    }

    /**
     * Load persisted DLQ items
     */
    private async loadPersistedDLQItems(): Promise<void> {
        if (!this.persistor || !this.xcId) return;

        try {
            let loadedCount = 0;

            for await (const snapshot of this.persistor.load(this.xcId)) {
                if (
                    snapshot.state &&
                    typeof snapshot.state === 'object' &&
                    'type' in snapshot.state &&
                    snapshot.state.type === 'dlq-item' &&
                    'dlqItem' in snapshot.state
                ) {
                    const dlqItem = (snapshot.state as { dlqItem: DLQItem })
                        .dlqItem;
                    this.dlqItems.set(dlqItem.id, dlqItem);
                    loadedCount++;
                }
            }

            if (loadedCount > 0) {
                this.observability.logger.info(
                    'DLQ items loaded from persistence',
                    {
                        loadedCount,
                        xcId: this.xcId,
                    },
                );
            }
        } catch (error) {
            this.observability.logger.error(
                'Failed to load persisted DLQ items',
                error as Error,
                {
                    xcId: this.xcId,
                },
            );
        }
    }

    /**
     * Remove DLQ item from persistence
     */
    private async removeDLQItemFromPersistence(eventId: string): Promise<void> {
        // Note: Current Persistor interface doesn't support item deletion
        // This would be implemented when we add delete capability
        this.observability.logger.debug(
            'DLQ item removal from persistence requested',
            {
                eventId,
                note: 'Deletion not implemented in current Persistor interface',
            },
        );
    }

    /**
     * Create hash for DLQ item
     */
    private createDLQHash(dlqItem: DLQItem): string {
        const hashData = {
            id: dlqItem.id,
            dlqTimestamp: dlqItem.dlqTimestamp,
            attempts: dlqItem.attempts,
        };

        return createHash('sha256')
            .update(`dlq-${JSON.stringify(hashData)}`)
            .digest('hex')
            .substring(0, 16);
    }

    /**
     * Enforce maximum DLQ size by removing oldest items
     */
    private async enforceMaxSize(): Promise<void> {
        const itemsToRemove = this.dlqItems.size - this.config.maxDLQSize! + 1;
        if (itemsToRemove <= 0) return;

        // Sort by dlqTimestamp (oldest first)
        const sortedItems = Array.from(this.dlqItems.entries()).sort(
            ([, a], [, b]) => a.dlqTimestamp - b.dlqTimestamp,
        );

        // Remove oldest items
        for (let i = 0; i < itemsToRemove; i++) {
            const item = sortedItems[i];
            if (item) {
                const [eventId] = item;
                this.dlqItems.delete(eventId);
            }
        }

        this.observability.logger.warn('DLQ size limit enforced', {
            removedItems: itemsToRemove,
            currentSize: this.dlqItems.size,
            maxSize: this.config.maxDLQSize,
        });
    }

    /**
     * Start automatic cleanup of old DLQ items
     */
    private startAutoCleanup(): void {
        this.cleanupTimer = setInterval(async () => {
            await this.cleanupOldItems();
        }, this.config.cleanupInterval);
    }

    /**
     * Clean up old DLQ items based on retention policy
     */
    private async cleanupOldItems(): Promise<void> {
        const retentionMs = this.config.maxRetentionDays! * 24 * 60 * 60 * 1000;
        const cutoffTime = Date.now() - retentionMs;
        let cleanedCount = 0;

        for (const [eventId, item] of this.dlqItems.entries()) {
            if (item.dlqTimestamp < cutoffTime) {
                this.dlqItems.delete(eventId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            this.observability.logger.info('DLQ cleanup completed', {
                cleanedCount,
                retentionDays: this.config.maxRetentionDays,
                remainingItems: this.dlqItems.size,
            });
        }
    }

    /**
     * Emit DLQ metrics for monitoring
     */
    private async emitDLQMetrics(): Promise<void> {
        const stats = this.getDLQStats();

        // Emit metrics (would integrate with observability metrics system)
        this.observability.logger.debug('DLQ metrics', {
            totalItems: stats.totalItems,
            averageAttempts: stats.averageAttempts,
            eventTypes: Object.keys(stats.itemsByEventType).length,
            errorTypes: Object.keys(stats.itemsByErrorType).length,
        });
    }

    /**
     * Cleanup resources
     */
    destroy(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }

        this.observability.logger.info('DLQ handler destroyed', {
            finalSize: this.dlqItems.size,
            xcId: this.xcId,
        });
    }
}
