/**
 * @module kernel
 * @description Kernel - Central orchestration layer
 */

// Core kernel functionality
export {
    ExecutionKernel,
    createKernel,
    type KernelConfig,
    type KernelState,
} from './kernel.js';

// Snapshot functionality
export {
    createSnapshot,
    restoreSnapshot,
    validateSnapshot,
    validateDeltaSnapshot,
    diffSnapshot,
    stableHash,
    type Snapshot,
    type DeltaSnapshot,
} from './snapshot.js';

// Persistor functionality
export {
    createPersistor,
    getPersistor,
    setPersistor,
    BasePersistor,
} from './persistor.js';
