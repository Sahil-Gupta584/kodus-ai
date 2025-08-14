/**
 * Context Module - Clean and Essential
 *
 * Core context management for agents and workflows
 */

// ===== MAIN ENTRY POINT =====
export {
    ContextBuilder,
    createAgentContext,
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
} from './services/session-service.js';

// ===== ENHANCED CONTEXT INTEGRATION (AI SDK INSPIRED) =====
export {
    EnhancedContextBuilder,
    createEnhancedContext,
    withContext,
    type EnhancedContextConfig,
    type ContextLayer,
    type ContextOperation,
    type ContextEntry,
    type ContextQuery,
} from './enhanced-context-builder.js';

// ===== AI SDK COMPONENTS =====
export {
    StepExecution,
    EnhancedMessageContext,
    ContextManager,
    type AgentStepResult,
    type MessageEntry,
} from './step-execution.js';
