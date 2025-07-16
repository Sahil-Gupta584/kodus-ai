/**
 * @module core/types/execution-context
 * @description Clean execution context for agents
 *
 * PRINCIPLES:
 * - Context is about WHERE and WHEN execution happens
 * - Services are injected, not part of context
 * - Clear separation between request info and runtime
 */

import type { AgentRuntime } from '../services/service-registry.js';

import type { CoreIdentifiers } from './agent-types.js';

/**
 * Request information - WHO is executing and WHERE
 * Uses unified CoreIdentifiers for consistency
 */
export interface RequestInfo extends CoreIdentifiers {
    /**
     * Parent execution ID (for nested executions)
     */
    parentId?: string;

    /**
     * User-provided metadata
     */
    metadata?: Record<string, unknown>;
}

/**
 * Execution metrics and state
 */
export interface ExecutionState {
    /**
     * Start time of execution
     */
    startTime: number;

    /**
     * Current status
     */
    status: 'starting' | 'running' | 'completed' | 'failed' | 'cancelled';

    /**
     * Current iteration (for agents with loops)
     */
    iteration?: number;

    /**
     * Error if failed
     */
    error?: Error;
}

/**
 * Clean execution context
 * Contains only execution-specific information
 */
export interface ExecutionContext {
    /**
     * Request information
     */
    request: RequestInfo;

    /**
     * Runtime environment (services + resources)
     */
    runtime: AgentRuntime;

    /**
     * Execution state
     */
    state: ExecutionState;

    /**
     * Cleanup function
     */
    cleanup?: () => Promise<void>;
}

/**
 * Agent-specific execution context
 * Extends base context with agent-specific info
 */
export interface AgentExecutionContext extends ExecutionContext {
    /**
     * Agent name being executed
     */
    agentName: string;

    /**
     * Agent invocation ID
     */
    invocationId: string;
}

/**
 * Create execution context
 */
export function createExecutionContext(
    request: RequestInfo,
    runtime: AgentRuntime,
): ExecutionContext {
    return {
        request,
        runtime,
        state: {
            startTime: Date.now(),
            status: 'starting',
            iteration: 0,
        },
    };
}

/**
 * Create agent execution context
 */
export function createAgentExecutionContext(
    agentName: string,
    request: RequestInfo,
    runtime: AgentRuntime,
): AgentExecutionContext {
    return {
        ...createExecutionContext(request, runtime),
        agentName,
        invocationId: `${agentName}-${request.executionId}`,
    };
}
