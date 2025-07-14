import type { AgentDefinition } from '../core/types/agent-types.js';
import type { AgentEngine } from '../engine/agents/agent-engine.js';
import type { AgentExecutor } from '../engine/agents/agent-executor.js';

/**
 * Agent data structure for orchestrator
 */
export interface AgentData {
    instance: AgentEngine | AgentExecutor;
    definition: AgentDefinition;
    config: {
        executionMode: 'simple' | 'workflow';
        simpleConfig?: Record<string, unknown>;
        workflowConfig?: Record<string, unknown>;
        hooks?: {
            onStart?: (
                input: unknown,
                context: Record<string, unknown>,
            ) => Promise<void>;
            onFinish?: (
                result: unknown,
                context: Record<string, unknown>,
            ) => Promise<void>;
            onError?: (
                error: Error,
                context: Record<string, unknown>,
            ) => Promise<void>;
        };
    };
}
