/**
 * @module core
 * @description Core types and utilities for the Kodus Flow SDK
 */

// ===== CORE TYPES =====
export type {
    // Base types
    BaseContext,
    BaseDefinition,
    BaseExecutionResult,
    BaseEngineConfig,
    Metadata,

    // Tool types
    ToolDefinition,
    ToolContext,
    ToolEngineConfig,
    ToolExecutionOptions,
    ToolExecutionResult,

    // Workflow types
    WorkflowContext,
} from './types/index.js';

// ===== VALIDATION =====
export {
    validateToolId,
    validateAgentId,
    validateExecutionId,
    validateTenantId,
    validateCorrelationId,
    createToolId,
    createAgentId,
} from './types/validation.js';

// ===== TOOL UTILITIES =====
export { defineTool, fromMCPTool } from './types/tool-types.js';

// ===== ERRORS =====
export {
    BaseSDKError,
    KernelError,
    RuntimeError,
    EngineError,
    MiddlewareError,
    isErrorRecoverable,
    isErrorRetryable,
    wrapError,
} from './errors.js';
