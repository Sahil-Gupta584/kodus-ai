/**
 * @module engine/state-sync-handler
 * @description State Synchronization Handler para sync entre agents
 *
 * FEATURES:
 * ✅ State sync entre agents
 * ✅ Merge strategies (replace, merge, append)
 * ✅ Conflict resolution
 * ✅ Event-driven sync
 * ✅ Performance monitoring
 */

import { createLogger } from '../../observability/index.js';
import { EngineError } from '../../core/errors.js';
import type { Event } from '../../core/types/events.js';
import type { AgentContext } from '../../core/types/common-types.js';
import { StateManager } from '../../utils/thread-safe-state.js';

// ──────────────────────────────────────────────────────────────────────────────
// 🔄 STATE SYNC TYPES & INTERFACES
// ──────────────────────────────────────────────────────────────────────────────

/**
 * State sync strategies
 */
export type SyncStrategy = 'replace' | 'merge' | 'append' | 'custom';

/**
 * State sync operation
 */
export interface StateSyncOperation {
    sourceAgent: string;
    targetAgents: string[];
    data: unknown;
    strategy: SyncStrategy;
    namespace?: string;
    key?: string;
    timestamp: number;
    correlationId: string;
}

/**
 * State sync result
 */
export interface StateSyncResult {
    success: boolean;
    syncedAgents: string[];
    failedAgents: string[];
    conflicts?: Array<{
        agent: string;
        key: string;
        conflict: 'version' | 'type' | 'access';
        resolution: 'source_wins' | 'target_wins' | 'merged';
    }>;
    duration: number;
}

/**
 * Agent state provider interface
 */
export interface AgentStateProvider {
    getAgentStateManager(agentName: string): StateManager | undefined;
    getAgentContext(agentName: string): AgentContext | undefined;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🔄 STATE SYNCHRONIZATION HANDLER
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Handler para sincronização de state entre agents
 */
export class StateSyncHandler {
    private logger = createLogger('state-sync');
    private syncStats = {
        totalSyncs: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
        conflictsResolved: 0,
        averageDuration: 0,
    };

    constructor(private stateProvider: AgentStateProvider) {}

    /**
     * Handle state synchronization request
     */
    async handleStateSync(event: Event): Promise<Event> {
        const startTime = Date.now();
        this.syncStats.totalSyncs++;

        try {
            const {
                target,
                data,
                merge = true,
                fromAgent,
                correlationId,
                executionId,
                namespace = 'default',
                key,
                strategy = 'merge',
            } = event.data as {
                target: string | string[];
                data: unknown;
                merge?: boolean;
                fromAgent: string;
                correlationId: string;
                executionId: string;
                namespace?: string;
                key?: string;
                strategy?: SyncStrategy;
            };

            this.logger.debug('Processing state synchronization', {
                fromAgent,
                target,
                strategy,
                namespace,
                correlationId,
            });

            // Normalize target to array
            const targetAgents = Array.isArray(target) ? target : [target];

            // Create sync operation
            const syncOp: StateSyncOperation = {
                sourceAgent: fromAgent,
                targetAgents,
                data,
                strategy: merge ? strategy : 'replace',
                namespace,
                key,
                timestamp: Date.now(),
                correlationId,
            };

            // Execute synchronization
            const result = await this.executeSynchronization(syncOp);

            // Update stats
            if (result.success) {
                this.syncStats.successfulSyncs++;
            } else {
                this.syncStats.failedSyncs++;
            }

            if (result.conflicts) {
                this.syncStats.conflictsResolved += result.conflicts.length;
            }

            this.updateAverageDuration(Date.now() - startTime);

            this.logger.info('State synchronization completed', {
                fromAgent,
                syncedAgents: result.syncedAgents.length,
                failedAgents: result.failedAgents.length,
                conflicts: result.conflicts?.length || 0,
                duration: result.duration,
                correlationId,
            });

            return {
                id: 'sync-completed-' + Date.now(),
                type: 'agent.sync_state.completed',
                threadId: `sync-${Date.now()}`,
                data: {
                    result,
                    fromAgent,
                    correlationId,
                    executionId,
                },
                ts: Date.now(),
            };
        } catch (error) {
            this.syncStats.failedSyncs++;
            this.updateAverageDuration(Date.now() - startTime);

            this.logger.error('State synchronization failed', error as Error);

            throw new EngineError(
                'AGENT_ERROR',
                'State synchronization failed',
                {
                    context: {
                        originalError: error,
                        operation: 'state_sync',
                    },
                },
            );
        }
    }

    /**
     * Execute synchronization operation
     */
    private async executeSynchronization(
        syncOp: StateSyncOperation,
    ): Promise<StateSyncResult> {
        const startTime = Date.now();
        const syncedAgents: string[] = [];
        const failedAgents: string[] = [];
        const conflicts: StateSyncResult['conflicts'] = [];

        for (const targetAgent of syncOp.targetAgents) {
            try {
                // Get target agent's state manager
                const targetStateManager =
                    this.stateProvider.getAgentStateManager(targetAgent);

                if (!targetStateManager) {
                    this.logger.warn('Target agent state manager not found', {
                        targetAgent,
                        sourceAgent: syncOp.sourceAgent,
                    });
                    failedAgents.push(targetAgent);
                    continue;
                }

                // Execute sync based on strategy
                const syncResult = await this.applySyncStrategy(
                    syncOp,
                    targetAgent,
                    targetStateManager,
                );

                if (syncResult.success) {
                    syncedAgents.push(targetAgent);
                    if (syncResult.conflicts) {
                        conflicts.push(...syncResult.conflicts);
                    }
                } else {
                    failedAgents.push(targetAgent);
                }
            } catch (error) {
                this.logger.error(
                    'Sync failed for target agent',
                    error as Error,
                    {
                        targetAgent,
                        sourceAgent: syncOp.sourceAgent,
                    },
                );
                failedAgents.push(targetAgent);
            }
        }

        return {
            success: failedAgents.length === 0,
            syncedAgents,
            failedAgents,
            conflicts: conflicts.length > 0 ? conflicts : undefined,
            duration: Date.now() - startTime,
        };
    }

    /**
     * Apply synchronization strategy
     */
    private async applySyncStrategy(
        syncOp: StateSyncOperation,
        targetAgent: string,
        targetStateManager: StateManager,
    ): Promise<{
        success: boolean;
        conflicts?: StateSyncResult['conflicts'];
    }> {
        const { strategy, data, namespace, key } = syncOp;

        try {
            switch (strategy) {
                case 'replace':
                    return await this.applyReplaceStrategy(
                        targetStateManager,
                        namespace!,
                        key,
                        data,
                    );

                case 'merge':
                    return await this.applyMergeStrategy(
                        targetStateManager,
                        namespace!,
                        key,
                        data,
                        targetAgent,
                    );

                case 'append':
                    return await this.applyAppendStrategy(
                        targetStateManager,
                        namespace!,
                        key,
                        data,
                    );

                default:
                    throw new Error(`Unsupported sync strategy: ${strategy}`);
            }
        } catch (error) {
            this.logger.error('Strategy application failed', error as Error, {
                strategy,
                targetAgent,
                namespace,
                key,
            });
            return { success: false };
        }
    }

    /**
     * Apply replace strategy
     */
    private async applyReplaceStrategy(
        stateManager: StateManager,
        namespace: string,
        key: string | undefined,
        data: unknown,
    ): Promise<{ success: boolean }> {
        if (key) {
            // Replace specific key
            await stateManager.set(namespace, key, data);
        } else {
            // Replace entire namespace
            const keys = await stateManager.keys(namespace);
            const namespaceData: Record<string, unknown> = {};
            for (const existingKey of keys) {
                namespaceData[existingKey] = await stateManager.get(
                    namespace,
                    existingKey,
                );
            }
            if (keys.length > 0) {
                // Clear current namespace
                for (const existingKey of keys) {
                    await stateManager.delete(namespace, existingKey);
                }
            }

            // Set new data
            if (typeof data === 'object' && data !== null) {
                for (const [dataKey, value] of Object.entries(
                    data as Record<string, unknown>,
                )) {
                    await stateManager.set(namespace, dataKey, value);
                }
            }
        }

        return { success: true };
    }

    /**
     * Apply merge strategy
     */
    private async applyMergeStrategy(
        stateManager: StateManager,
        namespace: string,
        key: string | undefined,
        data: unknown,
        targetAgent: string,
    ): Promise<{
        success: boolean;
        conflicts?: StateSyncResult['conflicts'];
    }> {
        const conflicts: StateSyncResult['conflicts'] = [];

        if (key) {
            // Merge specific key
            const existingValue = stateManager.get(namespace, key);

            if (existingValue !== undefined) {
                // Detect conflicts and resolve
                const mergedValue = this.mergeValues(
                    existingValue,
                    data,
                    targetAgent,
                    key,
                    conflicts,
                );
                await stateManager.set(namespace, key, mergedValue);
            } else {
                // No existing value, just set
                await stateManager.set(namespace, key, data);
            }
        } else {
            // Merge entire namespace
            if (typeof data === 'object' && data !== null) {
                for (const [dataKey, value] of Object.entries(
                    data as Record<string, unknown>,
                )) {
                    const existingValue = stateManager.get(namespace, dataKey);

                    if (existingValue !== undefined) {
                        const mergedValue = this.mergeValues(
                            existingValue,
                            value,
                            targetAgent,
                            dataKey,
                            conflicts,
                        );
                        await stateManager.set(namespace, dataKey, mergedValue);
                    } else {
                        await stateManager.set(namespace, dataKey, value);
                    }
                }
            }
        }

        return {
            success: true,
            conflicts: conflicts.length > 0 ? conflicts : undefined,
        };
    }

    /**
     * Apply append strategy
     */
    private async applyAppendStrategy(
        stateManager: StateManager,
        namespace: string,
        key: string | undefined,
        data: unknown,
    ): Promise<{ success: boolean }> {
        if (!key) {
            throw new Error('Append strategy requires a specific key');
        }

        const existingValue = stateManager.get(namespace, key);

        if (Array.isArray(existingValue)) {
            // Append to array
            const newValue = Array.isArray(data)
                ? [...existingValue, ...data]
                : [...existingValue, data];
            await stateManager.set(namespace, key, newValue);
        } else if (existingValue === undefined) {
            // Create new array
            const newValue = Array.isArray(data) ? data : [data];
            await stateManager.set(namespace, key, newValue);
        } else {
            // Convert to array and append
            const newValue = Array.isArray(data)
                ? [existingValue, ...data]
                : [existingValue, data];
            await stateManager.set(namespace, key, newValue);
        }

        return { success: true };
    }

    /**
     * Merge two values with conflict detection
     */
    private mergeValues(
        existing: unknown,
        incoming: unknown,
        targetAgent: string,
        key: string,
        conflicts: StateSyncResult['conflicts'] = [],
    ): unknown {
        // Type conflict
        if (typeof existing !== typeof incoming) {
            conflicts.push({
                agent: targetAgent,
                key,
                conflict: 'type',
                resolution: 'source_wins',
            });
            return incoming; // Source wins
        }

        // Object merge
        if (
            typeof existing === 'object' &&
            existing !== null &&
            incoming !== null
        ) {
            return {
                ...(existing as Record<string, unknown>),
                ...(incoming as Record<string, unknown>),
            };
        }

        // Array merge
        if (Array.isArray(existing) && Array.isArray(incoming)) {
            return [...existing, ...incoming];
        }

        // Primitive merge (source wins)
        if (existing !== incoming) {
            conflicts.push({
                agent: targetAgent,
                key,
                conflict: 'version',
                resolution: 'source_wins',
            });
        }

        return incoming;
    }

    /**
     * Update average duration
     */
    private updateAverageDuration(duration: number): void {
        const currentAvg = this.syncStats.averageDuration;
        const total = this.syncStats.totalSyncs;
        this.syncStats.averageDuration =
            (currentAvg * (total - 1) + duration) / total;
    }

    /**
     * Get sync statistics
     */
    getSyncStats(): {
        totalSyncs: number;
        successfulSyncs: number;
        failedSyncs: number;
        successRate: number;
        conflictsResolved: number;
        averageDuration: number;
    } {
        return {
            ...this.syncStats,
            successRate:
                this.syncStats.totalSyncs > 0
                    ? this.syncStats.successfulSyncs / this.syncStats.totalSyncs
                    : 0,
        };
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 🛠️ FACTORY & UTILITY FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Create state sync handler
 */
export function createStateSyncHandler(
    stateProvider: AgentStateProvider,
): StateSyncHandler {
    return new StateSyncHandler(stateProvider);
}
