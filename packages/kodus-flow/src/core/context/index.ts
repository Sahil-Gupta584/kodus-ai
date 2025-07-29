/**
 * Context Module - Updated with New Architecture
 *
 * Core context management for agents and workflows
 * Now includes ContextBuilder as the main entry point
 */

// ===== NEW ARCHITECTURE (RECOMMENDED) =====
// Main entry point - use this for new code
export {
    ContextBuilder,
    contextBuilder,
    createAgentContext,
} from './context-builder.js';

// New execution runtime (pure lifecycle manager)
export { ExecutionRuntime as SimpleExecutionRuntime } from './execution-runtime-simple.js';

// ===== CORE SERVICES =====
// These services are used by ContextBuilder internally
export { ContextStateService } from './services/state-service.js';
export { SessionService } from './services/session-service.js';
export type {
    Session,
    SessionConfig,
    SessionContext,
} from './services/session-service.js';

// ===== TYPES =====
// Keep useful types, mark legacy ones
export type {
    // New architecture types
    ContextSource,
    ContextData,
    ContextVersion,
    ExecutionEvent,
    ContextPath,
    ContextQuery,
    ContextResult,

    // Enhanced types (still useful)
    EnhancedPlannerExecutionContext,
    Pattern,
    FailurePattern,
    ExecutionStep,
    ExecutionResult,

    // System types
    HealthStatus,
    StorageRoutingStrategy,

    // User/Session types
    UserPreferences,
    UserPattern,
    ConversationEntry,
    SessionMetadata,
    ToolUsagePattern,
    WorkingState,

    // Legacy interface (for backward compatibility)
    ExecutionRuntime as IExecutionRuntime,
} from './execution-runtime-types.js';
