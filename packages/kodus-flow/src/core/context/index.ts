/**
 * Context Module - Simplified
 *
 * Core context management for agents and workflows
 */

// Core services
export { ContextStateService } from './services/state-service.js';
export { sessionService } from './services/session-service.js';
export type {
    Session,
    SessionConfig,
    SessionContext,
} from './services/session-service.js';

// Context factory
export {
    UnifiedContextFactory,
    createAgentContext,
    createWorkflowContext,
    createBaseContext,
    contextFactory,
} from './context-factory.js';

export type { ContextState } from './context-factory.js';

// ExecutionRuntime - Unified facade
export { ExecutionRuntime } from './execution-runtime.js';
export type {
    ExecutionRuntime as IExecutionRuntime,
    ContextSource,
    ContextData,
    ContextVersion,
    ExecutionEvent,
    ContextPath,
    ContextQuery,
    ContextResult,
    EnhancedPlannerExecutionContext,
    Pattern,
    FailurePattern,
    ExecutionStep,
    ExecutionResult,
    HealthStatus,
    StorageRoutingStrategy,
    UserPreferences,
    UserPattern,
    ConversationEntry,
    SessionMetadata,
    ToolUsagePattern,
    WorkingState,
} from './execution-runtime-types.js';

// Registry
export {
    RuntimeRegistry,
    getExecutionRuntimeByThread,
} from './runtime-registry.js';
