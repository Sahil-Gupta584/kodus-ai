/**
 * @module core/memory/index
 * @description Memory management system with adapter support
 */

// Export types
export type {
    MemoryItem,
    MemoryQuery,
    MemoryVectorQuery,
    MemoryVectorSearchResult,
    MemoryManagerOptions,
    MemoryScope,
} from '../types/memory-types.js';

// Export memory managers
export {
    MemoryManager,
    getGlobalMemoryManager,
    setGlobalMemoryManager,
    resetGlobalMemoryManager,
} from './memory-manager.js';

// Export vector store
export { VectorStore } from './vector-store.js';

// Re-export for convenience
export * from '../types/memory-types.js';
