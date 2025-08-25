export {
    ContextBuilder,
    createAgentContext,
    createBaseContext,
    UnifiedContextFactory,
    type ContextBuilderConfig,
} from './context-builder.js';

// ===== CORE SERVICES =====
export { ContextStateService } from './services/state-service.js';
export { SessionService } from './services/session-service.js';
export type {
    Session,
    SessionConfig,
    SessionContext,
    ConversationHistory,
    ConversationMessage,
} from './services/session-service.js';

// ===== EXECUTION TRACKING =====
export { ExecutionTracker, type StepResult } from './execution-tracker.js';

// ===== NAMESPACE CONSTANTS =====
export {
    STATE_NAMESPACES,
    SESSION_TYPES,
    MEMORY_TYPES,
    CONTEXT_OPERATION_TYPES,
    isValidStateNamespace,
    isValidSessionType,
    isValidMemoryType,
    type StateNamespace,
    type SessionType,
    type MemoryType,
    type ContextOperationType,
} from './namespace-constants.js';
