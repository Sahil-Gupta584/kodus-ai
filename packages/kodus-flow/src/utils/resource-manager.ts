/**
 * Resource Manager Implementation
 *
 * Provides automatic cleanup of timers, intervals, and other resources
 * to prevent memory leaks in multi-tenant environments
 */

import { ContextStateService } from '../core/context/services/state-service.js';
import { createLogger } from '../observability/index.js';

// ── Context Management ────────────────────────────────────────────────────
export interface ResourceManager {
    addTimer: (timer: NodeJS.Timeout) => void;
    addInterval: (interval: NodeJS.Timeout) => void;
    addCleanupCallback: (callback: () => void | Promise<void>) => void;
    removeTimer: (timer: NodeJS.Timeout) => boolean;
    removeInterval: (interval: NodeJS.Timeout) => boolean;
    removeCleanupCallback: (callback: () => void | Promise<void>) => boolean;
    dispose: () => Promise<void>;
    getStats: () => {
        timers: number;
        intervals: number;
        cleanupCallbacks: number;
        isDisposed: boolean;
    };
    disposed: boolean;
}

/**
 * Implementation of ResourceManager for automatic resource cleanup
 */
export class DefaultResourceManager implements ResourceManager {
    private timers = new Set<NodeJS.Timeout>();
    private intervals = new Set<NodeJS.Timeout>();
    private cleanupCallbacks = new Set<() => void | Promise<void>>();
    private isDisposed = false;
    private stateService: ContextStateService;
    private logger = createLogger('resource-manager');

    constructor(contextKey: object = {}) {
        // CRÍTICO: Usar ContextStateService para tracking de recursos
        this.stateService = new ContextStateService(contextKey, {
            maxNamespaceSize: 100,
            maxNamespaces: 10,
        });
    }

    /**
     * Add a timer to be tracked and cleaned up
     */
    addTimer(timer: NodeJS.Timeout): void {
        // CRÍTICO: Validação de timer
        if (!timer || typeof timer !== 'object') {
            throw new Error('Invalid timer provided');
        }

        if (this.isDisposed) {
            clearTimeout(timer);
            return;
        }

        this.timers.add(timer);

        // CRÍTICO: Track no state service
        this.stateService
            .set('timers', timer.toString(), {
                type: 'timer',
                createdAt: Date.now(),
                disposed: false,
            })
            .catch((error: unknown) => {
                this.logger.error(
                    'Failed to track timer in state service',
                    error as Error,
                );
            });
    }

    /**
     * Add an interval to be tracked and cleaned up
     */
    addInterval(interval: NodeJS.Timeout): void {
        // CRÍTICO: Validação de interval
        if (!interval || typeof interval !== 'object') {
            throw new Error('Invalid interval provided');
        }

        if (this.isDisposed) {
            clearInterval(interval);
            return;
        }

        this.intervals.add(interval);

        // CRÍTICO: Track no state service
        this.stateService
            .set('intervals', interval.toString(), {
                type: 'interval',
                createdAt: Date.now(),
                disposed: false,
            })
            .catch((error: unknown) => {
                this.logger.error(
                    'Failed to track interval in state service',
                    error as Error,
                );
            });
    }

    /**
     * Add a cleanup callback to be executed on disposal
     */
    addCleanupCallback(callback: () => void | Promise<void>): void {
        if (this.isDisposed) {
            // Execute immediately if already disposed
            try {
                const result = callback();
                if (result instanceof Promise) {
                    result.catch((error) => {
                        this.logger.error(
                            'Cleanup callback error during disposal',
                            error as Error,
                        );
                    });
                }
            } catch (error) {
                this.logger.error(
                    'Cleanup callback error during disposal',
                    error as Error,
                );
            }
            return;
        }

        this.cleanupCallbacks.add(callback);

        // CRÍTICO: Track no state service
        this.stateService
            .set('callbacks', callback.toString(), {
                type: 'callback',
                createdAt: Date.now(),
                disposed: false,
            })
            .catch((error: unknown) => {
                this.logger.error(
                    'Failed to track callback in state service',
                    error as Error,
                );
            });
    }

    /**
     * Remove a timer from tracking (and clear it)
     */
    removeTimer(timer: NodeJS.Timeout): boolean {
        const existed = this.timers.delete(timer);
        if (existed) {
            clearTimeout(timer);

            // CRÍTICO: Update state service
            this.stateService
                .set('timers', timer.toString(), {
                    type: 'timer',
                    disposed: true,
                    disposedAt: Date.now(),
                })
                .catch((error: unknown) => {
                    this.logger.error(
                        'Failed to update timer state',
                        error as Error,
                    );
                });
        }
        return existed;
    }

    /**
     * Remove an interval from tracking (and clear it)
     */
    removeInterval(interval: NodeJS.Timeout): boolean {
        const existed = this.intervals.delete(interval);
        if (existed) {
            clearInterval(interval);

            // CRÍTICO: Update state service
            this.stateService
                .set('intervals', interval.toString(), {
                    type: 'interval',
                    disposed: true,
                    disposedAt: Date.now(),
                })
                .catch((error: unknown) => {
                    this.logger.error(
                        'Failed to update interval state',
                        error as Error,
                    );
                });
        }
        return existed;
    }

    /**
     * Remove a cleanup callback from the list
     */
    removeCleanupCallback(callback: () => void | Promise<void>): boolean {
        const existed = this.cleanupCallbacks.delete(callback);
        if (existed) {
            // CRÍTICO: Update state service
            this.stateService
                .set('callbacks', callback.toString(), {
                    type: 'callback',
                    disposed: true,
                    disposedAt: Date.now(),
                })
                .catch((error: unknown) => {
                    this.logger.error(
                        'Failed to update callback state',
                        error as Error,
                    );
                });
        }
        return existed;
    }

    /**
     * Dispose all resources and execute cleanup callbacks
     */
    async dispose(): Promise<void> {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;

        // Clear all timers
        for (const timer of this.timers) {
            clearTimeout(timer);
        }
        this.timers.clear();

        // Clear all intervals
        for (const interval of this.intervals) {
            clearInterval(interval);
        }
        this.intervals.clear();

        // Execute all cleanup callbacks with timeout
        const cleanupPromises: Promise<void>[] = [];
        const CLEANUP_TIMEOUT = 5000; // 5 seconds timeout

        for (const callback of this.cleanupCallbacks) {
            try {
                const result = callback();
                if (result instanceof Promise) {
                    // CRÍTICO: Timeout para evitar cleanup callbacks pendentes
                    const timeoutPromise = new Promise<void>((_, reject) => {
                        setTimeout(
                            () => reject(new Error('Cleanup timeout')),
                            CLEANUP_TIMEOUT,
                        );
                    });

                    cleanupPromises.push(
                        Promise.race([result, timeoutPromise]).catch(
                            (error) => {
                                this.logger.error(
                                    'Cleanup callback error during disposal',
                                    error as Error,
                                );
                            },
                        ),
                    );
                }
            } catch (error) {
                this.logger.error(
                    'Cleanup callback error during disposal',
                    error as Error,
                );
            }
        }

        // Wait for all async cleanup callbacks to complete
        if (cleanupPromises.length > 0) {
            await Promise.allSettled(cleanupPromises);
        }

        this.cleanupCallbacks.clear();

        // CRÍTICO: Clear state service
        try {
            await this.stateService.clear();
        } catch (error) {
            this.logger.error(
                'Failed to clear state service during disposal',
                error as Error,
            );
        }
    }

    /**
     * Get statistics about tracked resources
     */
    getStats(): {
        timers: number;
        intervals: number;
        cleanupCallbacks: number;
        isDisposed: boolean;
    } {
        return {
            timers: this.timers.size,
            intervals: this.intervals.size,
            cleanupCallbacks: this.cleanupCallbacks.size,
            isDisposed: this.isDisposed,
        };
    }

    /**
     * Check if the resource manager has been disposed
     */
    get disposed(): boolean {
        return this.isDisposed;
    }

    /**
     * Get detailed resource tracking from state service
     */
    async getDetailedStats(): Promise<{
        timers: Record<string, unknown>;
        intervals: Record<string, unknown>;
        callbacks: Record<string, unknown>;
    }> {
        try {
            return {
                timers: this.stateService.getNamespace('timers'),
                intervals: this.stateService.getNamespace('intervals'),
                callbacks: this.stateService.getNamespace('callbacks'),
            };
        } catch (error) {
            this.logger.error('Failed to get detailed stats', error as Error);
            return {
                timers: {},
                intervals: {},
                callbacks: {},
            };
        }
    }
}

/**
 * Factory function to create a new resource manager
 */
export function createResourceManager(contextKey?: object): ResourceManager {
    return new DefaultResourceManager(contextKey);
}

/**
 * Default resource manager instance
 */
export const defaultResourceManager = new DefaultResourceManager();
