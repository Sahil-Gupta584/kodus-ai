/**
 * @module core/context/namespace-constants
 * @description Core namespace constants for state management
 */

/**
 * Standard state namespaces for ContextStateService
 */
export const STATE_NAMESPACES = {
    EXECUTION: 'execution',
} as const;

export type StateNamespace =
    (typeof STATE_NAMESPACES)[keyof typeof STATE_NAMESPACES];
