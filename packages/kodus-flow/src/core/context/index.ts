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
    createAgentBaseContext,
} from './context-factory.js';

export type {
    BaseContextConfig,
    AgentContextConfig,
    ContextState,
} from './context-factory.js';
