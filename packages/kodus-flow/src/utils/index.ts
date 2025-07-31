/**
 * @module utils/index
 * @description Utility classes and functions for Kodus Flow SDK
 */

// ID Generation utilities
export {
    IdGenerator,
    SequentialIdGenerator,
    HighThroughputIdGenerator,
} from './id-generator.js';

// Circuit Breaker pattern implementation (moved to engine/old)
// export {
//     CircuitBreaker,
//     CircuitBreakerRegistry,
//     CircuitBreakerError,
//     DEFAULT_CIRCUIT_BREAKER_CONFIGS,
//     type CircuitBreakerConfig,
//     type CircuitState,
//     type CircuitBreakerStats,
// } from './circuit-breaker.js';

// Thread-safe state management
export {
    ConcurrentStateManager,
    SimpleStateManager,
    StateManagerFactory,
    StateManagerError,
    type StateManager,
    type StateManagerStats,
} from './thread-safe-state.js';
