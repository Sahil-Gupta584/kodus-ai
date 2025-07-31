/**
 * Core types index
 *
 * This file exports all types from the core types directory for easy importing.
 * These are the fundamental types that the entire system uses.
 */

// Base types (foundation)
export * from './base-types.js';

// Common types (shared across all modules) - avoiding conflicts
export type {
    // Agent types
    AgentContext,
    AgentDefinition,
    AgentAction,
    AgentThought,
    AgentExecutionResult,

    // Tool types
    ToolDefinition,
    ToolContext,
    ToolExecutionResult,

    // Workflow types
    WorkflowContext,
    WorkflowDefinition,
    StepContext,
    StepDefinition,

    // Other common types
    Thread,

    // Schemas
    sessionIdSchema,
    entityIdSchema,
} from './common-types.js';

// Tool types (core tool definitions)
export * from './tool-types.js';

// Workflow types (core workflow definitions) - avoiding conflicts
export type {
    WorkflowEngineConfig,
    WorkflowExecutionOptions,
    WorkflowExecutionResult,
    Workflow,
    StepType,
    StepStatus,
    WorkflowExecutionId,
} from './workflow-types.js';

// Event types (core event system)
// Note: event-types.js and events.js have conflicts with common-types.js
// Import specific types when needed: import { SpecificEventType } from './event-types.js'

// Context types (agent context)
// Note: context-types.js has conflicts with common-types.js
// Import specific types when needed: import { SpecificContextType } from './context-types.js'

// State types (state management)
export * from './state-types.js';

// Memory types (memory management)
export * from './memory-types.js';

// Enhanced types (advanced features)
// Note: enhanced-types.js and enhanced-action-types.js have conflicts with common-types.js
// Import specific types when needed: import { SpecificEnhancedType } from './enhanced-types.js'

// Error types (error handling)
export * from './error-types.js';

// Retry types (retry mechanisms)
export * from './retry-types.js';

// Logging types (observability)
export * from './logging-types.js';
