/**
 * Context Module - Clean and Essential
 *
 * Core context management for agents and workflows
 */

// ===== MAIN ENTRY POINT =====
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
export { ConversationManager } from './services/conversation-manager.js';
export type {
    Session,
    SessionConfig,
    SessionContext,
    ConversationHistory,
    ConversationMessage,
} from './services/session-service.js';

// ===== AI SDK COMPONENTS =====
export {
    StepExecution,
    EnhancedMessageContext,
    ContextManager,
    type AgentStepResult,
    type MessageEntry,
} from './step-execution.js';

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
