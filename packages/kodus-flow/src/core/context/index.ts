/**
 * Context Module - Clean and Essential
 *
 * Core context management for agents and workflows
 */

// ===== MAIN ENTRY POINT =====
export {
    ContextBuilder,
    contextBuilder,
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
