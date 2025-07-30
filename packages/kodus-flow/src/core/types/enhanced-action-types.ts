/**
 * @module core/types/enhanced-action-types
 * @description Enhanced Action Types para Multi-Agent Coordination
 *
 * FEATURES:
 * ✅ Backward compatible com AgentAction existente
 * ✅ New action types: delegate, collaborate, route, plan, pause, broadcast
 * ✅ Type-safe multi-agent coordination
 * ✅ Event-driven architecture support
 */

// Import base action types
export type { AgentAction as BaseAgentAction } from './common-types.js';

// ──────────────────────────────────────────────────────────────────────────────
// 🧩 ENHANCED MULTI-AGENT ACTION TYPES
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Base Agent Actions (existing)
 * Mantemos 100% backward compatibility
 */
export type CoreAgentAction<TContent = unknown> =
    | { type: 'tool_call'; toolName: string; input: unknown }
    | { type: 'final_answer'; content: TContent }
    | { type: 'need_more_info'; question: string };

/**
 * ✨ NEW: Multi-Agent Coordination Actions
 * Extended actions para coordenação entre agents
 */
export type MultiAgentAction =
    // Agent Delegation
    | {
          type: 'delegate';
          targetAgent: string;
          input: unknown;
          reason?: string;
          timeout?: number;
          priority?: 'low' | 'medium' | 'high' | 'critical';
      }

    // Multi-Agent Collaboration
    | {
          type: 'collaborate';
          agents: string[];
          strategy: 'parallel' | 'sequential' | 'conditional';
          input: unknown;
          coordination?: {
              aggregation?: 'merge' | 'vote' | 'first' | 'custom';
              timeout?: number;
              failureMode?: 'fail_fast' | 'continue' | 'retry';
          };
      }

    // Intelligent Routing
    | {
          type: 'route';
          routerName: string;
          input: unknown;
          strategy?: string;
          options?: {
              fallback?: string;
              retries?: number;
              timeout?: number;
          };
      }

    // Planning & Goal Setting
    | {
          type: 'plan';
          plannerName: string;
          goal: string;
          context?: unknown;
          constraints?: {
              maxSteps?: number;
              timeout?: number;
              resources?: string[];
          };
      }

    // Workflow Control
    | {
          type: 'pause';
          reason: string;
          resumeCondition?: {
              type: 'event' | 'time' | 'manual' | 'condition';
              data?: unknown;
          };
      }

    // Event Broadcasting
    | {
          type: 'broadcast';
          event: string;
          data: unknown;
          recipients?: string[] | 'all';
          options?: {
              async?: boolean;
              timeout?: number;
              acknowledgment?: boolean;
          };
      }

    // Agent Discovery
    | {
          type: 'discover';
          criteria: {
              capability?: string;
              specialization?: string;
              availability?: boolean;
              workload?: 'low' | 'medium' | 'high';
          };
          limit?: number;
      }

    // State Synchronization
    | {
          type: 'sync_state';
          target: string | string[];
          data: unknown;
          merge?: boolean;
      };

/**
 * ✨ Enhanced AgentAction com multi-agent support
 * Union type que mantém backward compatibility + novos actions
 */
export type EnhancedAgentAction<TContent = unknown> =
    | CoreAgentAction<TContent>
    | MultiAgentAction;

/**
 * Export as default AgentAction para drop-in replacement
 */
export type AgentAction<TContent = unknown> = EnhancedAgentAction<TContent>;

// ──────────────────────────────────────────────────────────────────────────────
// 🔧 ACTION TYPE UTILITIES & GUARDS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Type guards para action types
 */
export function isToolCallAction(
    action: AgentAction,
): action is Extract<AgentAction, { type: 'tool_call' }> {
    return action.type === 'tool_call';
}

export function isFinalAnswerAction(
    action: AgentAction,
): action is Extract<AgentAction, { type: 'final_answer' }> {
    return action.type === 'final_answer';
}

export function isDelegateAction(
    action: AgentAction,
): action is Extract<AgentAction, { type: 'delegate' }> {
    return action.type === 'delegate';
}

export function isCollaborateAction(
    action: AgentAction,
): action is Extract<AgentAction, { type: 'collaborate' }> {
    return action.type === 'collaborate';
}

export function isRouteAction(
    action: AgentAction,
): action is Extract<AgentAction, { type: 'route' }> {
    return action.type === 'route';
}

export function isPlanAction(
    action: AgentAction,
): action is Extract<AgentAction, { type: 'plan' }> {
    return action.type === 'plan';
}

export function isBroadcastAction(
    action: AgentAction,
): action is Extract<AgentAction, { type: 'broadcast' }> {
    return action.type === 'broadcast';
}

export function isPauseAction(
    action: AgentAction,
): action is Extract<AgentAction, { type: 'pause' }> {
    return action.type === 'pause';
}

export function isDiscoverAction(
    action: AgentAction,
): action is Extract<AgentAction, { type: 'discover' }> {
    return action.type === 'discover';
}

export function isSyncStateAction(
    action: AgentAction,
): action is Extract<AgentAction, { type: 'sync_state' }> {
    return action.type === 'sync_state';
}

/**
 * Verifica se é um multi-agent action (vs. core action)
 */
export function isMultiAgentAction(
    action: AgentAction,
): action is MultiAgentAction {
    return [
        'delegate',
        'collaborate',
        'route',
        'plan',
        'pause',
        'broadcast',
        'discover',
        'sync_state',
    ].includes(action.type);
}

/**
 * Verifica se é um core action (original)
 */
export function isCoreAction(action: AgentAction): action is CoreAgentAction {
    return ['tool_call', 'final_answer', 'need_more_info'].includes(
        action.type,
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// 📋 ACTION METADATA & CAPABILITIES
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Metadata sobre action capabilities
 */
export interface ActionCapability {
    name: string;
    description: string;
    requiresTarget: boolean;
    supportsAsync: boolean;
    requiresPermission?: string;
    estimatedDuration?: number;
}

/**
 * Registry de capabilities por action type
 */
export const ACTION_CAPABILITIES: Record<string, ActionCapability> = {
    toolCall: {
        name: 'Tool Execution',
        description: 'Execute external tools and services',
        requiresTarget: false,
        supportsAsync: true,
    },
    finalAnswer: {
        name: 'Final Response',
        description: 'Provide final answer to the user',
        requiresTarget: false,
        supportsAsync: false,
    },
    needMoreInfo: {
        name: 'Information Request',
        description: 'Request additional information from user',
        requiresTarget: false,
        supportsAsync: false,
    },
    delegate: {
        name: 'Agent Delegation',
        description: 'Delegate task to another agent',
        requiresTarget: true,
        supportsAsync: true,
        requiresPermission: 'agent.delegate',
        estimatedDuration: 5000,
    },
    collaborate: {
        name: 'Multi-Agent Collaboration',
        description: 'Coordinate multiple agents on a task',
        requiresTarget: true,
        supportsAsync: true,
        requiresPermission: 'agent.collaborate',
        estimatedDuration: 10000,
    },
    route: {
        name: 'Intelligent Routing',
        description: 'Route request through intelligent router',
        requiresTarget: true,
        supportsAsync: true,
        estimatedDuration: 2000,
    },
    plan: {
        name: 'Goal Planning',
        description: 'Create execution plan for complex goal',
        requiresTarget: true,
        supportsAsync: true,
        estimatedDuration: 3000,
    },
    pause: {
        name: 'Execution Pause',
        description: 'Pause execution with resume condition',
        requiresTarget: false,
        supportsAsync: false,
    },
    broadcast: {
        name: 'Event Broadcasting',
        description: 'Broadcast event to multiple agents',
        requiresTarget: false,
        supportsAsync: true,
        requiresPermission: 'agent.broadcast',
    },
    discover: {
        name: 'Agent Discovery',
        description: 'Discover available agents by criteria',
        requiresTarget: false,
        supportsAsync: true,
    },
    syncState: {
        name: 'State Synchronization',
        description: 'Synchronize state with other agents',
        requiresTarget: true,
        supportsAsync: true,
        requiresPermission: 'agent.sync',
    },
};

/**
 * Get action capability by type
 */
export function getActionCapability(
    actionType: string,
): ActionCapability | undefined {
    return ACTION_CAPABILITIES[actionType];
}

/**
 * Get all available action types
 */
export function getAvailableActionTypes(): string[] {
    return Object.keys(ACTION_CAPABILITIES);
}

/**
 * Filter actions by capability requirements
 */
export function filterActionsByCapability(
    requirements: Partial<ActionCapability>,
): string[] {
    return Object.entries(ACTION_CAPABILITIES)
        .filter(([, capability]) => {
            return Object.entries(requirements).every(([key, value]) => {
                return capability[key as keyof ActionCapability] === value;
            });
        })
        .map(([actionType]) => actionType);
}

// ──────────────────────────────────────────────────────────────────────────────
// 🚀 ACTION BUILDERS & FACTORIES
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Builder pattern para criar actions de forma type-safe
 */
export class ActionBuilder {
    /**
     * Create delegate action
     */
    static delegate(
        targetAgent: string,
        input: unknown,
        options?: {
            reason?: string;
            timeout?: number;
            priority?: 'low' | 'medium' | 'high' | 'critical';
        },
    ): Extract<AgentAction, { type: 'delegate' }> {
        return {
            type: 'delegate',
            targetAgent,
            input,
            ...options,
        };
    }

    /**
     * Create collaborate action
     */
    static collaborate(
        agents: string[],
        strategy: 'parallel' | 'sequential' | 'conditional',
        input: unknown,
        coordination?: {
            aggregation?: 'merge' | 'vote' | 'first' | 'custom';
            timeout?: number;
            failureMode?: 'fail_fast' | 'continue' | 'retry';
        },
    ): Extract<AgentAction, { type: 'collaborate' }> {
        return {
            type: 'collaborate',
            agents,
            strategy,
            input,
            coordination,
        };
    }

    /**
     * Create route action
     */
    static route(
        routerName: string,
        input: unknown,
        options?: {
            strategy?: string;
            fallback?: string;
            retries?: number;
            timeout?: number;
        },
    ): Extract<AgentAction, { type: 'route' }> {
        return {
            type: 'route',
            routerName,
            input,
            strategy: options?.strategy,
            options: options
                ? {
                      fallback: options.fallback,
                      retries: options.retries,
                      timeout: options.timeout,
                  }
                : undefined,
        };
    }

    /**
     * Create broadcast action
     */
    static broadcast(
        event: string,
        data: unknown,
        options?: {
            recipients?: string[] | 'all';
            async?: boolean;
            timeout?: number;
            acknowledgment?: boolean;
        },
    ): Extract<AgentAction, { type: 'broadcast' }> {
        return {
            type: 'broadcast',
            event,
            data,
            recipients: options?.recipients,
            options: options
                ? {
                      async: options.async,
                      timeout: options.timeout,
                      acknowledgment: options.acknowledgment,
                  }
                : undefined,
        };
    }
}

/**
 * Factory functions para backward compatibility
 */
export function createToolCallAction(
    toolName: string,
    input: unknown,
): Extract<AgentAction, { type: 'tool_call' }> {
    return { type: 'tool_call', toolName, input };
}

export function createFinalAnswerAction<T>(
    content: T,
): Extract<AgentAction, { type: 'final_answer' }> {
    return { type: 'final_answer', content };
}

export function createNeedMoreInfoAction(
    question: string,
): Extract<AgentAction, { type: 'need_more_info' }> {
    return { type: 'need_more_info', question };
}

// Re-export tudo para facilitar imports
export { ActionBuilder as Actions };
