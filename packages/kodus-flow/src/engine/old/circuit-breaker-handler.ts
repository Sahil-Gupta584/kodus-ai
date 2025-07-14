/**
 * @module engine/circuit-breaker-handler
 * @description Handler para integrar Circuit Breakers com multi-agent system
 *
 * FEATURES:
 * ✅ Per-agent circuit breakers
 * ✅ Per-service circuit breakers (tools, routers, etc)
 * ✅ Automatic fallback strategies
 * ✅ Health monitoring
 * ✅ Graceful degradation
 */

import { createLogger } from '../../observability/index.js';
import { EngineError } from '../../core/errors.js';
import type { Event } from '../../core/types/events.js';
import type { AgentContext } from '../../core/types/common-types.js';
import {
    CircuitBreakerManager,
    createCircuitBreakerManager,
    createAgentBreakerConfig,
    type CircuitBreakerConfig,
    type CircuitBreakerMetrics,
    CircuitState,
} from './circuit-breaker.js';

// ──────────────────────────────────────────────────────────────────────────────
// 🔌 CIRCUIT BREAKER HANDLER TYPES
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Circuit breaker scopes
 */
export type BreakerScope = 'agent' | 'tool' | 'router' | 'planner' | 'custom';

/**
 * Circuit breaker event types
 */
export interface CircuitBreakerEvent extends Event {
    type:
        | 'circuit.open'
        | 'circuit.close'
        | 'circuit.halfopen'
        | 'circuit.metrics';
    data: {
        breakerName: string;
        scope: BreakerScope;
        state?: CircuitState;
        metrics?: CircuitBreakerMetrics;
        reason?: string;
        timestamp: number;
    };
}

/**
 * Fallback strategies
 */
export interface FallbackStrategy {
    type: 'default' | 'cache' | 'alternate' | 'custom';
    handler: (error: Error, context: AgentContext) => Promise<unknown>;
}

/**
 * Health status
 */
export interface HealthStatus {
    healthy: boolean;
    totalBreakers: number;
    openBreakers: number;
    halfOpenBreakers: number;
    closedBreakers: number;
    breakerStates: Record<
        string,
        {
            state: CircuitState;
            metrics: CircuitBreakerMetrics;
        }
    >;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🔌 CIRCUIT BREAKER HANDLER IMPLEMENTATION
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Handler for circuit breaker integration
 */
export class CircuitBreakerHandler {
    private logger = createLogger('circuit-breaker-handler');
    private manager: CircuitBreakerManager;
    private fallbackStrategies = new Map<string, FallbackStrategy>();
    private healthCheckInterval?: NodeJS.Timeout;

    constructor(
        defaultConfig?: Partial<CircuitBreakerConfig>,
        enableHealthCheck: boolean = true,
    ) {
        this.manager = createCircuitBreakerManager(defaultConfig);
        this.setupDefaultFallbacks();

        if (enableHealthCheck) {
            this.startHealthCheck();
        }
    }

    /**
     * Wrap agent execution with circuit breaker
     */
    async wrapAgentExecution<T>(
        agentName: string,
        execution: () => Promise<T>,
        context: AgentContext,
    ): Promise<T> {
        const breakerName = `agent:${agentName}`;
        const breaker = this.manager.getBreaker(
            breakerName,
            createAgentBreakerConfig(),
        );

        try {
            return await breaker.execute(execution, {
                resourceName: agentName,
                operation: 'agent_execution',
                metadata: {
                    correlationId: context.correlationId,
                    executionId: context.executionId,
                },
            });
        } catch (error) {
            // Check if we have a fallback strategy
            const fallback = this.fallbackStrategies.get(breakerName);
            if (fallback) {
                this.logger.warn('Using fallback strategy for agent', {
                    agentName,
                    error: (error as Error).message,
                    fallbackType: fallback.type,
                });
                return (await fallback.handler(error as Error, context)) as T;
            }
            throw error;
        }
    }

    /**
     * Wrap tool execution with circuit breaker
     */
    async wrapToolExecution<T>(
        toolName: string,
        execution: () => Promise<T>,
        context: AgentContext,
    ): Promise<T> {
        const breakerName = `tool:${toolName}`;
        const breaker = this.manager.getBreaker(breakerName, {
            failureThreshold: 5,
            timeout: 15000, // 15s for tools
            resetTimeout: 30000,
        });

        return await breaker.execute(execution, {
            resourceName: toolName,
            operation: 'tool_execution',
            metadata: {
                correlationId: context.correlationId,
                agentName: context.agentName,
            },
        });
    }

    /**
     * Wrap router execution with circuit breaker
     */
    async wrapRouterExecution<T>(
        routerName: string,
        execution: () => Promise<T>,
        context: AgentContext,
    ): Promise<T> {
        const breakerName = `router:${routerName}`;
        const breaker = this.manager.getBreaker(breakerName, {
            failureThreshold: 3,
            timeout: 10000, // 10s for routing
            resetTimeout: 20000,
        });

        return await breaker.execute(execution, {
            resourceName: routerName,
            operation: 'router_execution',
            metadata: {
                correlationId: context.correlationId,
            },
        });
    }

    /**
     * Handle circuit breaker events
     */
    async handleCircuitBreakerEvent(event: Event): Promise<Event> {
        const { operation, breakerName } = event.data as {
            operation: 'status' | 'reset' | 'forceOpen' | 'forceClosed';
            breakerName?: string;
            scope?: BreakerScope;
            reason?: string;
        };

        switch (operation) {
            case 'status':
                return this.getStatusEvent(breakerName);

            case 'reset':
                return this.resetBreaker(breakerName);

            case 'forceOpen':
                return this.forceOpenBreaker(
                    breakerName || '',
                    (event.data as { reason?: string }).reason,
                );

            case 'forceClosed':
                return this.forceClosedBreaker(
                    breakerName || '',
                    (event.data as { reason?: string }).reason,
                );

            default:
                throw new EngineError(
                    'AGENT_ERROR',
                    `Unknown circuit breaker operation: ${operation}`,
                );
        }
    }

    /**
     * Get status event
     */
    private getStatusEvent(breakerName?: string): Event {
        if (breakerName) {
            const breaker = this.manager.getAllBreakers().get(breakerName);
            if (!breaker) {
                throw new EngineError(
                    'AGENT_ERROR',
                    `Circuit breaker not found: ${breakerName}`,
                );
            }

            return {
                id: 'circuit.metrics-' + Date.now(),
                type: 'circuit.metrics',
                threadId: `circuit-${breakerName}-${Date.now()}`,
                data: {
                    breakerName,
                    scope: this.getScopeFromName(breakerName),
                    state: breaker.getState(),
                    metrics: breaker.getMetrics(),
                    timestamp: Date.now(),
                },
                ts: Date.now(),
            };
        }

        // Return all breakers status
        const health = this.getHealthStatus();
        return {
            id: 'circuit.health-' + Date.now(),
            type: 'circuit.health',
            threadId: `circuit-health-${Date.now()}`,
            data: health,
            ts: Date.now(),
        };
    }

    /**
     * Reset breaker
     */
    private resetBreaker(breakerName?: string): Event {
        if (breakerName) {
            this.manager.resetBreaker(breakerName);
        } else {
            this.manager.resetAll();
        }

        return {
            id: 'circuit.reset-' + Date.now(),
            type: 'circuit.reset',
            threadId: `circuit-reset-${Date.now()}`,
            data: {
                breakerName: breakerName || 'all',
                success: true,
                timestamp: Date.now(),
            },
            ts: Date.now(),
        };
    }

    /**
     * Force open breaker
     */
    private forceOpenBreaker(breakerName: string, reason?: string): Event {
        const breaker = this.manager.getAllBreakers().get(breakerName);
        if (!breaker) {
            throw new EngineError(
                'AGENT_ERROR',
                `Circuit breaker not found: ${breakerName}`,
            );
        }

        breaker.forceOpen(reason);

        return {
            id: 'circuit.open-' + Date.now(),
            type: 'circuit.open',
            threadId: `circuit-${breakerName}-${Date.now()}`,
            data: {
                breakerName,
                scope: this.getScopeFromName(breakerName),
                state: CircuitState.OPEN,
                reason: reason || 'Forced open',
                timestamp: Date.now(),
            },
            ts: Date.now(),
        };
    }

    /**
     * Force closed breaker
     */
    private forceClosedBreaker(breakerName: string, reason?: string): Event {
        const breaker = this.manager.getAllBreakers().get(breakerName);
        if (!breaker) {
            throw new EngineError(
                'AGENT_ERROR',
                `Circuit breaker not found: ${breakerName}`,
            );
        }

        breaker.forceClosed(reason);

        return {
            id: 'circuit.close-' + Date.now(),
            type: 'circuit.close',
            threadId: `circuit-${breakerName}-${Date.now()}`,
            data: {
                breakerName,
                scope: this.getScopeFromName(breakerName),
                state: CircuitState.CLOSED,
                reason: reason || 'Forced closed',
                timestamp: Date.now(),
            },
            ts: Date.now(),
        };
    }

    /**
     * Setup default fallback strategies
     */
    private setupDefaultFallbacks(): void {
        // Default agent fallback
        this.registerFallback('agent:*', {
            type: 'default',
            handler: async (error: Error, context: AgentContext) => {
                return {
                    type: 'agent.fallback',
                    data: {
                        error: error.message,
                        agentName: context.agentName,
                        fallbackMessage:
                            'Agent temporarily unavailable, please try again later',
                        timestamp: Date.now(),
                    },
                    ts: Date.now(),
                };
            },
        });
    }

    /**
     * Register fallback strategy
     */
    registerFallback(pattern: string, strategy: FallbackStrategy): void {
        this.fallbackStrategies.set(pattern, strategy);
        this.logger.info('Registered fallback strategy', {
            pattern,
            type: strategy.type,
        });
    }

    /**
     * Get scope from breaker name
     */
    private getScopeFromName(breakerName: string): BreakerScope {
        const [scope] = breakerName.split(':');
        return (scope as BreakerScope) || 'custom';
    }

    /**
     * Get health status
     */
    getHealthStatus(): HealthStatus {
        const allBreakers = this.manager.getAllBreakers();
        const breakerStates: Record<
            string,
            { state: CircuitState; metrics: CircuitBreakerMetrics }
        > = {};

        let openCount = 0;
        let halfOpenCount = 0;
        let closedCount = 0;

        for (const [name, breaker] of allBreakers) {
            const state = breaker.getState();
            const metrics = breaker.getMetrics();

            breakerStates[name] = { state, metrics };

            switch (state) {
                case CircuitState.OPEN:
                    openCount++;
                    break;
                case CircuitState.HALF_OPEN:
                    halfOpenCount++;
                    break;
                case CircuitState.CLOSED:
                    closedCount++;
                    break;
            }
        }

        return {
            healthy: openCount === 0,
            totalBreakers: allBreakers.size,
            openBreakers: openCount,
            halfOpenBreakers: halfOpenCount,
            closedBreakers: closedCount,
            breakerStates,
        };
    }

    /**
     * Start health check monitoring
     */
    private startHealthCheck(): void {
        this.healthCheckInterval = setInterval(() => {
            const health = this.getHealthStatus();

            if (!health.healthy) {
                this.logger.warn('Circuit breakers unhealthy', {
                    openBreakers: health.openBreakers,
                    totalBreakers: health.totalBreakers,
                });
            }
        }, 30000); // Check every 30 seconds
    }

    /**
     * Stop health check monitoring
     */
    stopHealthCheck(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = undefined;
        }
    }

    /**
     * Get circuit breaker manager
     */
    getManager(): CircuitBreakerManager {
        return this.manager;
    }

    /**
     * Cleanup resources
     */
    async dispose(): Promise<void> {
        this.stopHealthCheck();
        this.manager.clear();
        this.fallbackStrategies.clear();
        this.logger.info('CircuitBreakerHandler disposed');
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 🛠️ FACTORY & UTILITY FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Create circuit breaker handler
 */
export function createCircuitBreakerHandler(
    config?: Partial<CircuitBreakerConfig>,
    enableHealthCheck: boolean = true,
): CircuitBreakerHandler {
    return new CircuitBreakerHandler(config, enableHealthCheck);
}

/**
 * Create cached fallback strategy
 */
export function createCachedFallback(
    cache: Map<string, { value: unknown; timestamp: number }>,
    ttl: number = 60000, // 1 minute default
): FallbackStrategy {
    return {
        type: 'cache',
        handler: async (error: Error, context: AgentContext) => {
            const cacheKey = `${context.agentName}:${context.correlationId}`;
            const cached = cache.get(cacheKey);

            if (cached && Date.now() - cached.timestamp < ttl) {
                return cached.value;
            }

            throw new EngineError(
                'AGENT_ERROR',
                'No cached value available for fallback',
                { context: { originalError: error } },
            );
        },
    };
}

/**
 * Create alternate agent fallback
 */
export function createAlternateAgentFallback(
    alternateAgent: string,
): FallbackStrategy {
    return {
        type: 'alternate',
        handler: async (_error: Error, context: AgentContext) => {
            return {
                type: 'agent.delegate',
                data: {
                    targetAgent: alternateAgent,
                    fromAgent: context.agentName,
                    reason: 'Primary agent circuit breaker open',
                    input: context,
                    correlationId: context.correlationId,
                    executionId: context.executionId,
                },
                ts: Date.now(),
            };
        },
    };
}
