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

export {
    StorageAdapterFactory,
    getGlobalStorageAdapter,
    setGlobalStorageAdapter,
    resetGlobalStorageAdapter,
} from './factory.js';

export type { StorageType, StorageAdapterConfig } from './factory.js';

export { InMemoryStorageAdapter } from './adapters/in-memory-adapter.js';
export { MongoDBStorageAdapter } from './adapters/mongodb-adapter.js';
