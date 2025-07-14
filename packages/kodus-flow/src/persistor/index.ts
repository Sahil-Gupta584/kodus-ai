/**
 * @module persistor/index
 * @description Defines the interface for persisting and loading execution snapshots.
 * This abstraction allows for different storage backends (e.g., in-memory, database, S3).
 *
 * Now uses unified storage system with BaseStorage interface.
 */

import type {
    Snapshot,
    SnapshotOptions,
    PersistorStats,
} from '../core/types/common-types.js';

/**
 * Defines the contract for a snapshot persistence layer.
 * Implementations of this interface are responsible for storing and retrieving
 * snapshots of execution contexts.
 */
export interface Persistor {
    /**
     * Appends a snapshot to the persistent store.
     *
     * @param s - The snapshot to append.
     * @param options - Optional parameters for snapshot persistence.
     * @returns A promise that resolves when the operation is complete.
     */
    append(s: Snapshot, options?: SnapshotOptions): Promise<void>;

    /**
     * Loads all snapshots associated with a given execution context ID.
     * Snapshots should be iterable in the order they were appended.
     *
     * @param xcId - The execution context ID.
     * @returns An async iterable of snapshots.
     */
    load(xcId: string): AsyncIterable<Snapshot>;

    /**
     * Checks if a snapshot with the given hash already exists in the store.
     * This can be used to avoid storing duplicate snapshots.
     *
     * @param hash - The deterministic hash of the snapshot's content.
     * @returns A promise that resolves to `true` if the snapshot exists, `false` otherwise.
     */
    has(hash: string): Promise<boolean>;

    /**
     * Load a specific snapshot by hash.
     * Optional method for enhanced functionality.
     *
     * @param hash - The hash of the snapshot to load.
     * @returns The snapshot or null if not found.
     */
    getByHash?(hash: string): Promise<Snapshot | null>;

    /**
     * List all snapshot hashes for an execution context.
     * Optional method for enhanced functionality.
     *
     * @param xcId - The execution context ID.
     * @returns Array of snapshot hashes.
     */
    listHashes?(xcId: string): Promise<string[]>;

    /**
     * Get storage statistics.
     * Optional method for monitoring and debugging.
     *
     * @returns Storage statistics.
     */
    getStats?(): Promise<PersistorStats>;
}

// Export implementations
export { StoragePersistorAdapter } from './storage-adapter.js';

// Export configuration
export type {
    PersistorConfig,
    PersistorType,
    MemoryPersistorConfig,
    // SQLitePersistorConfig removed,
    RedisPersistorConfig,
    TemporalPersistorConfig,
} from './config.js';

export {
    createPersistorConfig,
    validatePersistorConfig,
    defaultPersistorConfigs,
} from './config.js';

// Export factory
export {
    createPersistorFromConfig,
    createPersistor,
    getGlobalPersistor,
    setGlobalPersistor,
    resetGlobalPersistor,
} from './factory.js';
