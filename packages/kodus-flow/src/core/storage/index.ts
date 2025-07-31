/**
 * @module core/storage/index
 * @description Unified storage system for Persistor and Memory Manager
 */

// Export base types and interfaces
export type {
    BaseStorage,
    BaseStorageItem,
    BaseQueryFilters,
    BaseStorageStats,
    BaseStorageConfig,
} from '../types/base-storage.js';

export {
    baseStorageItemSchema,
    baseQueryFiltersSchema,
    baseStorageStatsSchema,
    baseStorageConfigSchema,
} from '../types/base-storage.js';

// Export factory and configuration
export {
    StorageAdapterFactory,
    getGlobalStorageAdapter,
    setGlobalStorageAdapter,
    resetGlobalStorageAdapter,
} from './factory.js';

export type { StorageType, StorageAdapterConfig } from './factory.js';

// Export adapters
export { InMemoryStorageAdapter } from './adapters/in-memory-adapter.js';
export { MongoDBStorageAdapter } from './adapters/mongodb-adapter.js';
