/**
 * @module core/context/namespace-constants
 * @description Centralized namespace constants for the context layer
 *
 * These constants define the standard namespaces used across:
 * - State management (ContextStateService)
 * - Session tracking (StepExecution)
 * - Memory operations (ContextManager)
 * - AI SDK integrations
 */

/**
 * Standard state namespaces used by ContextStateService
 * Maps to documented conventions in state-service.ts
 */
export const STATE_NAMESPACES = {
    // Core system namespaces
    SYSTEM: 'system',
    RUNTIME: 'runtime',
    EXECUTION: 'execution',

    // User and session data
    USER: 'user',
    SESSION: 'session',

    // AI/LLM specific namespaces
    PLANNER: 'planner',
    AI_SDK: 'ai_sdk',

    // Tool and action namespaces
    TOOLS: 'tools',
    ACTIONS: 'actions',

    // Memory and context namespaces
    MEMORY: 'memory',
    CONTEXT: 'context',

    // Workflow and orchestration
    WORKFLOW: 'workflow',
    ORCHESTRATION: 'orchestration',
} as const;

/**
 * Session type constants for tracking different types of session entries
 * Used by StepExecution and session management
 */
export const SESSION_TYPES = {
    MESSAGE: 'message',
    TOOL_CALL: 'tool_call',
    PLANNER_STEP: 'planner_step',
    ERROR: 'error',
    ENHANCED_CONTEXT: 'enhanced-context',
} as const;

/**
 * Memory type constants for different categories of stored memories
 * Used by ContextManager and memory operations
 */
export const MEMORY_TYPES = {
    CONVERSATION: 'conversation',
    USER_PREFERENCES: 'user-preferences',
    EXECUTION_HINTS: 'execution-hints',
    LEARNING_CONTEXT: 'learning-context',
    RELEVANT_MEMORIES: 'relevant-memories',
} as const;

/**
 * Context operation types for tracking operations across layers
 */
export const CONTEXT_OPERATION_TYPES = {
    // State operations
    STATE_GET: 'state_get',
    STATE_SET: 'state_set',
    STATE_DELETE: 'state_delete',
    STATE_CLEAR: 'state_clear',

    // Session operations
    SESSION_CREATE: 'session_create',
    SESSION_UPDATE: 'session_update',
    SESSION_ADD_ENTRY: 'session_add_entry',

    // Memory operations
    MEMORY_STORE: 'memory_store',
    MEMORY_SEARCH: 'memory_search',
    MEMORY_RETRIEVE: 'memory_retrieve',
} as const;

// Type exports for type safety
export type StateNamespace =
    (typeof STATE_NAMESPACES)[keyof typeof STATE_NAMESPACES];
export type SessionType = (typeof SESSION_TYPES)[keyof typeof SESSION_TYPES];
export type MemoryType = (typeof MEMORY_TYPES)[keyof typeof MEMORY_TYPES];
export type ContextOperationType =
    (typeof CONTEXT_OPERATION_TYPES)[keyof typeof CONTEXT_OPERATION_TYPES];

/**
 * Utility function to validate namespace strings
 */
export function isValidStateNamespace(
    namespace: string,
): namespace is StateNamespace {
    return Object.values(STATE_NAMESPACES).includes(
        namespace as StateNamespace,
    );
}

/**
 * Utility function to validate session types
 */
export function isValidSessionType(type: string): type is SessionType {
    return Object.values(SESSION_TYPES).includes(type as SessionType);
}

/**
 * Utility function to validate memory types
 */
export function isValidMemoryType(type: string): type is MemoryType {
    return Object.values(MEMORY_TYPES).includes(type as MemoryType);
}
