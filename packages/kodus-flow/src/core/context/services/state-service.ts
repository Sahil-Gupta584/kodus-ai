/**
 * State Service Interface
 */

export interface StateService {
    get<T = unknown>(key: string): T | undefined;
    set<T = unknown>(key: string, value: T): void;
    delete(key: string): boolean;
    clear(): void;
    has(key: string): boolean;
    keys(): string[];
    values(): unknown[];
    entries(): Array<[string, unknown]>;
}

/**
 * State Service Implementation
 *
 * Provides namespaced state management with WeakMap-based isolation
 * Implements the StateManager interface from thread-safe-state.ts
 *
 * Uses centralized namespace constants from namespace-constants.ts to ensure
 * consistency across the context layer.
 *
 * **Boas Práticas:**
 * 1. Sempre validar namespace/key antes de usar
 * 2. Usar TTL para dados temporários quando possível
 * 3. Documentar a estrutura de dados em cada namespace
 * 4. Evitar nested objects profundos - prefira flatten
 * 5. Use tipos TypeScript para garantir consistency
 */

import type { StateManager } from '../../../utils/thread-safe-state.js';
import { createLogger } from '../../../observability/index.js';
import {
    STATE_NAMESPACES,
    isValidStateNamespace,
} from '../namespace-constants.js';

/**
 * Optional persistence adapter interface
 */
export interface StatePersistenceAdapter {
    /**
     * Load state from persistent storage
     */
    load(
        contextId: string,
    ): Promise<Record<string, Record<string, unknown>> | null>;

    /**
     * Save state to persistent storage
     */
    save(
        contextId: string,
        state: Record<string, Record<string, unknown>>,
    ): Promise<void>;

    /**
     * Delete state from persistent storage
     */
    delete(contextId: string): Promise<boolean>;

    /**
     * Check if state exists in persistent storage
     */
    exists(contextId: string): Promise<boolean>;
}

/**
 * State Service Metrics for observability
 */
export interface StateMetrics {
    totalOperations: number;
    getOperations: number;
    setOperations: number;
    deleteOperations: number;
    clearOperations: number;
    namespacesCreated: number;
    keysCreated: number;
    errorsEncountered: number;
    averageOperationTime: number;
    peakNamespaceCount: number;
    peakNamespaceSize: number;
    memoryUsageEstimate: number;
}

/**
 * Context-based state service using WeakMap for automatic cleanup
 * Enhanced with observability, metrics, and thread safety
 */
export class ContextStateService implements StateManager {
    private readonly stateMap = new WeakMap<
        object,
        Map<string, Map<string, unknown>>
    >();
    private readonly maxNamespaceSize: number;
    private readonly maxNamespaces: number;
    private readonly logger = createLogger('context-state-service');

    // Thread safety: Lock mechanism for complex operations
    private readonly operationLocks = new Map<string, Promise<void>>();

    // Optional persistence
    private readonly persistenceAdapter?: StatePersistenceAdapter;
    private readonly contextId?: string;
    private autoSaveTimer?: NodeJS.Timeout;
    private isDirty = false;

    // Metrics tracking
    private metrics: StateMetrics = {
        totalOperations: 0,
        getOperations: 0,
        setOperations: 0,
        deleteOperations: 0,
        clearOperations: 0,
        namespacesCreated: 0,
        keysCreated: 0,
        errorsEncountered: 0,
        averageOperationTime: 0,
        peakNamespaceCount: 0,
        peakNamespaceSize: 0,
        memoryUsageEstimate: 0,
    };

    private operationTimes: number[] = [];
    private readonly maxOperationTimesSamples = 100;

    constructor(
        private readonly contextKey: object,
        options: {
            maxNamespaceSize?: number;
            maxNamespaces?: number;
            persistenceAdapter?: StatePersistenceAdapter;
            contextId?: string;
            autoSaveInterval?: number; // minutes
        } = {},
    ) {
        this.maxNamespaceSize = options.maxNamespaceSize ?? 1000; // Prevent namespace from growing too large
        this.maxNamespaces = options.maxNamespaces ?? 100; // Prevent too many namespaces
        this.persistenceAdapter = options.persistenceAdapter;
        this.contextId = options.contextId;

        // Setup auto-save if persistence is enabled
        if (
            this.persistenceAdapter &&
            this.contextId &&
            options.autoSaveInterval
        ) {
            this.autoSaveTimer = setInterval(
                () => this.autoSave(),
                options.autoSaveInterval * 60 * 1000, // Convert minutes to milliseconds
            );
        }

        this.logger.debug('ContextStateService initialized', {
            maxNamespaceSize: this.maxNamespaceSize,
            maxNamespaces: this.maxNamespaces,
            contextKey: typeof this.contextKey,
            persistenceEnabled: !!this.persistenceAdapter,
            contextId: this.contextId,
            autoSaveInterval: options.autoSaveInterval,
        });

        // Load state from persistence if available
        void this.loadFromPersistence();
    }

    /**
     * Acquire a lock for thread-safe complex operations
     */
    private async acquireLock(lockKey: string): Promise<() => void> {
        const existingLock = this.operationLocks.get(lockKey);
        if (existingLock) {
            await existingLock;
        }

        let releaseLock: () => void;
        const lockPromise = new Promise<void>((resolve) => {
            releaseLock = resolve;
        });

        this.operationLocks.set(lockKey, lockPromise);

        return () => {
            this.operationLocks.delete(lockKey);
            releaseLock();
        };
    }

    /**
     * Execute a function with exclusive lock
     */
    private async withLock<T>(
        lockKey: string,
        operation: () => Promise<T> | T,
    ): Promise<T> {
        const releaseLock = await this.acquireLock(lockKey);
        try {
            return await operation();
        } finally {
            releaseLock();
        }
    }

    /**
     * Record operation metrics and timing
     */
    private recordOperation(
        operation: string,
        startTime: number,
        success: boolean = true,
    ): void {
        const duration = Date.now() - startTime;

        this.metrics.totalOperations++;
        this.metrics[`${operation}Operations` as keyof StateMetrics] =
            (this.metrics[
                `${operation}Operations` as keyof StateMetrics
            ] as number) + 1;

        if (!success) {
            this.metrics.errorsEncountered++;
        }

        // Track operation times for average calculation
        this.operationTimes.push(duration);
        if (this.operationTimes.length > this.maxOperationTimesSamples) {
            this.operationTimes.shift();
        }

        // Update average operation time
        this.metrics.averageOperationTime =
            this.operationTimes.reduce((sum, time) => sum + time, 0) /
            this.operationTimes.length;

        // Update memory usage estimate
        this.updateMemoryEstimate();
    }

    /**
     * Update memory usage estimate
     */
    private updateMemoryEstimate(): void {
        const namespaces = this.stateMap.get(this.contextKey);
        if (!namespaces) {
            this.metrics.memoryUsageEstimate = 0;
            return;
        }

        let totalKeys = 0;
        let maxNamespaceSize = 0;

        for (const [, namespaceMap] of namespaces) {
            totalKeys += namespaceMap.size;
            maxNamespaceSize = Math.max(maxNamespaceSize, namespaceMap.size);
        }

        // Update peak metrics
        this.metrics.peakNamespaceCount = Math.max(
            this.metrics.peakNamespaceCount,
            namespaces.size,
        );
        this.metrics.peakNamespaceSize = Math.max(
            this.metrics.peakNamespaceSize,
            maxNamespaceSize,
        );

        // Rough memory estimate (bytes):
        // namespace names + keys + estimated value size
        this.metrics.memoryUsageEstimate =
            namespaces.size * 50 + // namespace names
            totalKeys * 100 + // key names + estimated value overhead
            totalKeys * 200; // estimated average value size
    }

    /**
     * Get a value from a specific namespace
     */
    async get<T>(namespace: string, key: string): Promise<T | undefined> {
        const startTime = Date.now();
        let success = true;

        try {
            const namespaces = this.stateMap.get(this.contextKey);

            if (!namespaces) {
                return undefined;
            }

            const namespaceMap = namespaces.get(namespace);
            if (!namespaceMap) {
                return undefined;
            }

            const value = namespaceMap.get(key) as T | undefined;
            return value;
        } catch (error) {
            success = false;
            this.logger.error(
                'Failed to get state value: ' +
                    (error instanceof Error ? error.message : String(error)),
            );
            throw error;
        } finally {
            this.recordOperation('get', startTime, success);
        }
    }

    /**
     * Set a value in a specific namespace
     */
    async set(namespace: string, key: string, value: unknown): Promise<void> {
        const startTime = Date.now();
        let success = true;
        let newNamespace = false;
        let newKey = false;

        try {
            // Validate inputs for security
            if (!namespace || typeof namespace !== 'string') {
                throw new Error('Namespace must be a non-empty string');
            }
            if (!key || typeof key !== 'string') {
                throw new Error('Key must be a non-empty string');
            }

            // Optional: Warn about non-standard namespace usage
            if (!isValidStateNamespace(namespace)) {
                this.logger.warn('Using non-standard namespace', {
                    namespace,
                    standardNamespaces: Object.values(STATE_NAMESPACES),
                });
            }

            // CRÍTICO: Operação atômica para evitar race conditions
            let namespaces = this.stateMap.get(this.contextKey);

            if (!namespaces) {
                namespaces = new Map();
                this.stateMap.set(this.contextKey, namespaces);
            }

            // Check namespace limit ANTES de criar novo namespace
            if (
                !namespaces.has(namespace) &&
                namespaces.size >= this.maxNamespaces
            ) {
                throw new Error(
                    `Maximum number of namespaces (${this.maxNamespaces}) exceeded`,
                );
            }

            let namespaceMap = namespaces.get(namespace);

            if (!namespaceMap) {
                namespaceMap = new Map();
                namespaces.set(namespace, namespaceMap);
                newNamespace = true;
                this.metrics.namespacesCreated++;
            }

            // Check namespace size limit ANTES de adicionar nova key
            if (
                !namespaceMap.has(key) &&
                namespaceMap.size >= this.maxNamespaceSize
            ) {
                throw new Error(
                    `Maximum namespace size (${this.maxNamespaceSize}) exceeded for namespace '${namespace}'`,
                );
            }

            if (!namespaceMap.has(key)) {
                newKey = true;
                this.metrics.keysCreated++;
            }

            namespaceMap.set(key, value);

            // Mark as dirty for persistence
            this.isDirty = true;

            this.logger.debug('State value set', {
                namespace,
                key,
                newNamespace,
                newKey,
                valueType: typeof value,
            });
        } catch (error) {
            success = false;
            this.logger.error(
                'Failed to set state value: ' +
                    (error instanceof Error ? error.message : String(error)),
            );
            throw error;
        } finally {
            this.recordOperation('set', startTime, success);
        }
    }

    /**
     * Delete a specific key from a namespace
     */
    async delete(namespace: string, key: string): Promise<boolean> {
        const startTime = Date.now();
        let success = true;
        let result = false;

        try {
            const namespaces = this.stateMap.get(this.contextKey);

            if (!namespaces) {
                return false;
            }

            const namespaceMap = namespaces.get(namespace);

            if (!namespaceMap) {
                return false;
            }

            result = namespaceMap.delete(key);

            if (result) {
                // Mark as dirty for persistence
                this.isDirty = true;
                this.logger.debug('State key deleted', { namespace, key });
            }

            return result;
        } catch (error) {
            success = false;
            this.logger.error(
                'Failed to delete state key: ' +
                    (error instanceof Error ? error.message : String(error)),
            );
            throw error;
        } finally {
            this.recordOperation('delete', startTime, success);
        }
    }

    /**
     * Clear all keys in a namespace, or all namespaces if none specified
     */
    async clear(namespace?: string): Promise<void> {
        const startTime = Date.now();
        let success = true;

        try {
            const namespaces = this.stateMap.get(this.contextKey);

            if (!namespaces) {
                return;
            }

            if (namespace) {
                const namespaceMap = namespaces.get(namespace);
                if (namespaceMap) {
                    const keyCount = namespaceMap.size;
                    namespaceMap.clear();
                    // Mark as dirty for persistence
                    this.isDirty = true;
                    this.logger.debug('Namespace cleared', {
                        namespace,
                        keysRemoved: keyCount,
                    });
                }
            } else {
                const namespaceCount = namespaces.size;
                namespaces.clear();
                // Mark as dirty for persistence
                this.isDirty = true;
                this.logger.debug('All namespaces cleared', {
                    namespacesRemoved: namespaceCount,
                });
            }
        } catch (error) {
            success = false;
            this.logger.error(
                'Failed to clear state: ' +
                    (error instanceof Error ? error.message : String(error)),
            );
            throw error;
        } finally {
            this.recordOperation('clear', startTime, success);
        }
    }

    /**
     * Check if a key exists in a namespace
     */
    async has(namespace: string, key: string): Promise<boolean> {
        const namespaces = this.stateMap.get(this.contextKey);
        if (!namespaces) {
            return false;
        }

        const namespaceMap = namespaces.get(namespace);
        if (!namespaceMap) {
            return false;
        }

        return namespaceMap.has(key);
    }

    /**
     * Get all keys in a namespace (required by StateManager interface)
     */
    async keys(namespace: string): Promise<string[]> {
        const namespaces = this.stateMap.get(this.contextKey);
        if (!namespaces) {
            return [];
        }

        const namespaceMap = namespaces.get(namespace);
        if (!namespaceMap) {
            return [];
        }

        return Array.from(namespaceMap.keys());
    }

    /**
     * Get size of a namespace or total size (required by StateManager interface)
     */
    async size(namespace?: string): Promise<number> {
        const namespaces = this.stateMap.get(this.contextKey);
        if (!namespaces) {
            return 0;
        }

        if (namespace) {
            const namespaceMap = namespaces.get(namespace);
            return namespaceMap ? namespaceMap.size : 0;
        } else {
            let total = 0;
            for (const namespaceMap of namespaces.values()) {
                total += namespaceMap.size;
            }
            return total;
        }
    }

    /**
     * Get all data from a specific namespace
     */
    getNamespace(namespace: string): Record<string, unknown> {
        const namespaces = this.stateMap.get(this.contextKey);

        if (!namespaces) {
            return {};
        }

        const namespaceMap = namespaces.get(namespace);
        if (!namespaceMap) {
            return {};
        }

        const result: Record<string, unknown> = {};
        for (const [key, value] of namespaceMap) {
            result[key] = value;
        }

        return result;
    }

    /**
     * Get all namespaces and their data
     */
    getAllNamespaces(): Record<string, Record<string, unknown>> {
        const namespaces = this.stateMap.get(this.contextKey);

        if (!namespaces) {
            return {};
        }

        const result: Record<string, Record<string, unknown>> = {};
        for (const [namespace, namespaceMap] of namespaces) {
            result[namespace] = {};

            for (const [key, value] of namespaceMap) {
                result[namespace][key] = value;
            }
        }

        return result;
    }

    /**
     * Check if a namespace exists
     */
    hasNamespace(namespace: string): boolean {
        const namespaces = this.stateMap.get(this.contextKey);

        if (!namespaces) {
            return false;
        }

        return namespaces.has(namespace);
    }

    /**
     * Get size of a namespace
     */
    getNamespaceSize(namespace: string): number {
        const namespaces = this.stateMap.get(this.contextKey);
        if (!namespaces) {
            return 0;
        }

        const namespaceMap = namespaces.get(namespace);
        if (!namespaceMap) {
            return 0;
        }

        return namespaceMap.size;
    }

    /**
     * List all namespace names
     */
    getNamespaceNames(): string[] {
        const namespaces = this.stateMap.get(this.contextKey);

        if (!namespaces) {
            return [];
        }

        return Array.from(namespaces.keys());
    }

    /**
     * Get comprehensive metrics about state usage
     */
    getMetrics(): StateMetrics {
        // Update memory estimate before returning metrics
        this.updateMemoryEstimate();
        return { ...this.metrics };
    }

    /**
     * Get detailed state statistics
     */
    getStateStatistics(): {
        namespaceCount: number;
        totalKeys: number;
        namespaceSizes: Record<string, number>;
        memoryUsageEstimate: number;
        metrics: StateMetrics;
    } {
        const namespaces = this.stateMap.get(this.contextKey);

        if (!namespaces) {
            return {
                namespaceCount: 0,
                totalKeys: 0,
                namespaceSizes: {},
                memoryUsageEstimate: 0,
                metrics: this.getMetrics(),
            };
        }

        const namespaceSizes: Record<string, number> = {};
        let totalKeys = 0;

        for (const [namespaceName, namespaceMap] of namespaces) {
            namespaceSizes[namespaceName] = namespaceMap.size;
            totalKeys += namespaceMap.size;
        }

        return {
            namespaceCount: namespaces.size,
            totalKeys,
            namespaceSizes,
            memoryUsageEstimate: this.metrics.memoryUsageEstimate,
            metrics: this.getMetrics(),
        };
    }

    /**
     * Reset metrics (useful for testing or periodic resets)
     */
    resetMetrics(): void {
        this.metrics = {
            totalOperations: 0,
            getOperations: 0,
            setOperations: 0,
            deleteOperations: 0,
            clearOperations: 0,
            namespacesCreated: 0,
            keysCreated: 0,
            errorsEncountered: 0,
            averageOperationTime: 0,
            peakNamespaceCount: 0,
            peakNamespaceSize: 0,
            memoryUsageEstimate: 0,
        };
        this.operationTimes = [];

        this.logger.info('State metrics reset');
    }

    /**
     * Health check for the state service
     */
    async healthCheck(): Promise<{
        healthy: boolean;
        issues: string[];
        metrics: StateMetrics;
        limits: {
            maxNamespaces: number;
            maxNamespaceSize: number;
            utilizationPercentage: number;
        };
    }> {
        const issues: string[] = [];
        const stats = this.getStateStatistics();

        // Check for potential issues
        if (stats.namespaceCount > this.maxNamespaces * 0.8) {
            issues.push(
                `Namespace count approaching limit: ${stats.namespaceCount}/${this.maxNamespaces}`,
            );
        }

        if (
            this.metrics.errorsEncountered >
            this.metrics.totalOperations * 0.1
        ) {
            issues.push(
                `High error rate: ${this.metrics.errorsEncountered}/${this.metrics.totalOperations}`,
            );
        }

        if (this.metrics.averageOperationTime > 100) {
            // > 100ms average
            issues.push(
                `Slow operation performance: ${this.metrics.averageOperationTime}ms average`,
            );
        }

        for (const [namespace, size] of Object.entries(stats.namespaceSizes)) {
            if (size > this.maxNamespaceSize * 0.8) {
                issues.push(
                    `Namespace '${namespace}' approaching size limit: ${size}/${this.maxNamespaceSize}`,
                );
            }
        }

        const utilizationPercentage = Math.max(
            (stats.namespaceCount / this.maxNamespaces) * 100,
            (Math.max(...Object.values(stats.namespaceSizes)) /
                this.maxNamespaceSize) *
                100,
        );

        return {
            healthy: issues.length === 0,
            issues,
            metrics: this.getMetrics(),
            limits: {
                maxNamespaces: this.maxNamespaces,
                maxNamespaceSize: this.maxNamespaceSize,
                utilizationPercentage,
            },
        };
    }

    /**
     * Thread-safe atomic increment operation
     */
    async atomicIncrement(
        namespace: string,
        key: string,
        increment: number = 1,
    ): Promise<number> {
        const lockKey = `${namespace}:${key}`;

        return this.withLock(lockKey, async () => {
            const currentValue = (await this.get<number>(namespace, key)) || 0;
            const newValue = currentValue + increment;
            await this.set(namespace, key, newValue);
            return newValue;
        });
    }

    /**
     * Thread-safe atomic decrement operation
     */
    async atomicDecrement(
        namespace: string,
        key: string,
        decrement: number = 1,
    ): Promise<number> {
        return this.atomicIncrement(namespace, key, -decrement);
    }

    /**
     * Thread-safe conditional set (set only if current value matches condition)
     */
    async conditionalSet(
        namespace: string,
        key: string,
        newValue: unknown,
        condition: (currentValue: unknown) => boolean,
    ): Promise<boolean> {
        const lockKey = `${namespace}:${key}`;

        return this.withLock(lockKey, async () => {
            const currentValue = await this.get(namespace, key);
            if (condition(currentValue)) {
                await this.set(namespace, key, newValue);
                return true;
            }
            return false;
        });
    }

    /**
     * Thread-safe get-or-set operation (get value, or set if not exists)
     */
    async getOrSet<T>(
        namespace: string,
        key: string,
        defaultValue: T | (() => T | Promise<T>),
    ): Promise<T> {
        const lockKey = `${namespace}:${key}`;

        return this.withLock(lockKey, async () => {
            const existingValue = await this.get<T>(namespace, key);
            if (existingValue !== undefined) {
                return existingValue;
            }

            const valueToSet =
                typeof defaultValue === 'function'
                    ? await (defaultValue as () => T | Promise<T>)()
                    : defaultValue;

            await this.set(namespace, key, valueToSet);
            return valueToSet;
        });
    }

    /**
     * Thread-safe batch operations on multiple keys in a namespace
     */
    async batchUpdate(
        namespace: string,
        updates: Record<string, unknown>,
    ): Promise<void> {
        const lockKey = `batch:${namespace}`;

        return this.withLock(lockKey, async () => {
            for (const [key, value] of Object.entries(updates)) {
                await this.set(namespace, key, value);
            }
        });
    }

    /**
     * Thread-safe transaction: execute multiple operations atomically
     */
    async transaction<T>(
        namespace: string,
        operation: (state: {
            get: <U>(key: string) => Promise<U | undefined>;
            set: (key: string, value: unknown) => Promise<void>;
            delete: (key: string) => Promise<boolean>;
        }) => Promise<T>,
    ): Promise<T> {
        const lockKey = `transaction:${namespace}`;

        return this.withLock(lockKey, async () => {
            const transactionApi = {
                get: <U>(key: string) => this.get<U>(namespace, key),
                set: (key: string, value: unknown) =>
                    this.set(namespace, key, value),
                delete: (key: string) => this.delete(namespace, key),
            };

            return await operation(transactionApi);
        });
    }

    /**
     * Load state from persistent storage
     */
    private async loadFromPersistence(): Promise<void> {
        if (!this.persistenceAdapter || !this.contextId) {
            return;
        }

        try {
            const persistedState = await this.persistenceAdapter.load(
                this.contextId,
            );
            if (!persistedState) {
                this.logger.debug('No persisted state found', {
                    contextId: this.contextId,
                });
                return;
            }

            // Restore state from persistence
            const namespaces = new Map<string, Map<string, unknown>>();

            for (const [namespaceName, namespaceData] of Object.entries(
                persistedState,
            )) {
                const namespaceMap = new Map<string, unknown>();
                for (const [key, value] of Object.entries(namespaceData)) {
                    namespaceMap.set(key, value);
                }
                namespaces.set(namespaceName, namespaceMap);
            }

            this.stateMap.set(this.contextKey, namespaces);
            this.isDirty = false;

            this.logger.info('State loaded from persistence', {
                contextId: this.contextId,
                namespacesLoaded: Object.keys(persistedState).length,
            });
        } catch (error) {
            this.logger.error(
                'Failed to load state from persistence: ' +
                    (error instanceof Error ? error.message : String(error)),
            );
        }
    }

    /**
     * Save state to persistent storage
     */
    async saveToPersistence(): Promise<boolean> {
        if (!this.persistenceAdapter || !this.contextId || !this.isDirty) {
            return false;
        }

        try {
            const stateToSave = this.getAllNamespaces();
            await this.persistenceAdapter.save(this.contextId, stateToSave);
            this.isDirty = false;

            this.logger.debug('State saved to persistence', {
                contextId: this.contextId,
                namespacesCount: Object.keys(stateToSave).length,
            });

            return true;
        } catch (error) {
            this.logger.error(
                'Failed to save state to persistence: ' +
                    (error instanceof Error ? error.message : String(error)),
            );
            return false;
        }
    }

    /**
     * Auto-save handler for periodic persistence
     */
    private async autoSave(): Promise<void> {
        if (this.isDirty) {
            await this.saveToPersistence();
        }
    }

    /**
     * Cleanup resources and save state before destruction
     */
    async cleanup(): Promise<void> {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = undefined;
        }

        // Final save before cleanup
        await this.saveToPersistence();

        this.logger.debug('ContextStateService cleaned up', {
            contextId: this.contextId,
        });
    }

    /**
     * Force save state to persistence
     */
    async forceSave(): Promise<boolean> {
        this.isDirty = true; // Force save even if not dirty
        return await this.saveToPersistence();
    }

    /**
     * Check if state has unsaved changes
     */
    hasUnsavedChanges(): boolean {
        return this.isDirty;
    }
}

/**
 * Factory function to create a state service for a specific context
 */
export function createStateService(
    contextKey: object,
    options?: {
        maxNamespaceSize?: number;
        maxNamespaces?: number;
        persistenceAdapter?: StatePersistenceAdapter;
        contextId?: string;
        autoSaveInterval?: number;
    },
): StateManager {
    return new ContextStateService(contextKey, options);
}

/**
 * Simple in-memory persistence adapter for testing
 */
export class InMemoryPersistenceAdapter implements StatePersistenceAdapter {
    private storage = new Map<
        string,
        Record<string, Record<string, unknown>>
    >();

    async load(
        contextId: string,
    ): Promise<Record<string, Record<string, unknown>> | null> {
        return this.storage.get(contextId) || null;
    }

    async save(
        contextId: string,
        state: Record<string, Record<string, unknown>>,
    ): Promise<void> {
        this.storage.set(contextId, JSON.parse(JSON.stringify(state))); // Deep clone
    }

    async delete(contextId: string): Promise<boolean> {
        return this.storage.delete(contextId);
    }

    async exists(contextId: string): Promise<boolean> {
        return this.storage.has(contextId);
    }
}
