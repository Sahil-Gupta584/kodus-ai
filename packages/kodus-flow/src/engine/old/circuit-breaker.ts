/**
 * @module engine/circuit-breaker
 * @description Circuit Breaker pattern para fault tolerance em multi-agent systems
 *
 * FEATURES:
 * ✅ Automatic failure detection
 * ✅ Service degradation quando threshold é atingido
 * ✅ Auto-recovery após cool-down period
 * ✅ Configurable thresholds e timeouts
 * ✅ Per-agent e per-service circuit breakers
 * ✅ Fallback strategies
 */

import { createLogger } from '../../observability/index.js';
import { EngineError } from '../../core/errors.js';
import type { Event } from '../../core/types/events.js';

// ──────────────────────────────────────────────────────────────────────────────
// 🔌 CIRCUIT BREAKER TYPES & INTERFACES
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Circuit breaker states
 */
export enum CircuitState {
    CLOSED = 'CLOSED', // Normal operation
    OPEN = 'OPEN', // Failing, reject requests
    HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
    // Failure thresholds
    failureThreshold: number; // Number of failures before opening
    failureRateThreshold: number; // Failure rate (0-1) before opening
    requestVolumeThreshold: number; // Min requests before evaluating

    // Timing configuration
    timeout: number; // Request timeout in ms
    resetTimeout: number; // Time before trying half-open
    cooldownPeriod: number; // Time to wait after opening

    // Recovery configuration
    successThreshold: number; // Successes needed to close from half-open
    slowCallDurationThreshold: number; // Ms to consider a call "slow"
    slowCallRateThreshold: number; // Rate of slow calls to open

    // Fallback
    fallbackFunction?: (error: Error) => Promise<unknown>;
}

/**
 * Circuit breaker metrics
 */
export interface CircuitBreakerMetrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    rejectedRequests: number;
    slowRequests: number;
    averageResponseTime: number;
    lastFailureTime?: number;
    lastSuccessTime?: number;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    state: CircuitState;
    stateChanges: Array<{
        from: CircuitState;
        to: CircuitState;
        timestamp: number;
        reason: string;
    }>;
}

/**
 * Request context for circuit breaker
 */
export interface CircuitBreakerContext {
    resourceName: string;
    operation: string;
    metadata?: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🔌 CIRCUIT BREAKER IMPLEMENTATION
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Circuit breaker for fault tolerance
 */
export class CircuitBreaker {
    private logger = createLogger('circuit-breaker');
    private state: CircuitState = CircuitState.CLOSED;
    private metrics: CircuitBreakerMetrics;
    private lastStateChange: number = Date.now();
    private halfOpenTestInProgress = false;

    constructor(
        private name: string,
        private config: CircuitBreakerConfig,
    ) {
        this.metrics = this.initializeMetrics();
    }

    /**
     * Execute function with circuit breaker protection
     */
    async execute<T>(
        fn: () => Promise<T>,
        context: CircuitBreakerContext,
    ): Promise<T> {
        // Check if circuit should reject immediately
        if (this.shouldRejectRequest()) {
            this.metrics.rejectedRequests++;
            this.logger.warn('Circuit breaker rejecting request', {
                circuitName: this.name,
                state: this.state,
                resource: context.resourceName,
                operation: context.operation,
            });

            if (this.config.fallbackFunction) {
                const error = new EngineError(
                    'AGENT_ERROR',
                    `Circuit breaker is ${this.state}`,
                    { context: { circuitName: this.name, ...context } },
                );
                return (await this.config.fallbackFunction(error)) as T;
            }

            throw new EngineError(
                'AGENT_ERROR',
                `Circuit breaker is ${this.state} for ${this.name}`,
                {
                    context: {
                        circuitName: this.name,
                        state: this.state,
                        metrics: this.getMetrics(),
                        ...context,
                    },
                },
            );
        }

        const startTime = Date.now();
        this.metrics.totalRequests++;

        try {
            // Create timeout promise
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(
                        new EngineError(
                            'EXECUTION_TIMEOUT',
                            `Request timeout after ${this.config.timeout}ms`,
                            {
                                context: {
                                    timeout: this.config.timeout,
                                    ...context,
                                },
                            },
                        ),
                    );
                }, this.config.timeout);
            });

            // Race between actual call and timeout
            const result = await Promise.race([fn(), timeoutPromise]);

            // Record success
            this.recordSuccess(Date.now() - startTime);

            return result;
        } catch (error) {
            // Record failure
            this.recordFailure(Date.now() - startTime, error as Error);

            // Try fallback if available
            if (this.config.fallbackFunction) {
                this.logger.debug('Executing fallback function', {
                    circuitName: this.name,
                    error: (error as Error).message,
                });
                return (await this.config.fallbackFunction(
                    error as Error,
                )) as T;
            }

            throw error;
        }
    }

    /**
     * Check if request should be rejected
     */
    private shouldRejectRequest(): boolean {
        // Always allow if closed
        if (this.state === CircuitState.CLOSED) {
            return false;
        }

        // Check if we should transition from OPEN to HALF_OPEN
        if (this.state === CircuitState.OPEN) {
            const timeSinceOpen = Date.now() - this.lastStateChange;
            if (timeSinceOpen >= this.config.resetTimeout) {
                this.transitionTo(
                    CircuitState.HALF_OPEN,
                    'Reset timeout reached',
                );
                return false; // Allow one test request
            }
            return true; // Still open, reject
        }

        // HALF_OPEN: Allow one request at a time
        if (this.state === CircuitState.HALF_OPEN) {
            if (this.halfOpenTestInProgress) {
                return true; // Reject while test in progress
            }
            this.halfOpenTestInProgress = true;
            return false; // Allow test request
        }

        return false;
    }

    /**
     * Record successful request
     */
    private recordSuccess(duration: number): void {
        this.metrics.successfulRequests++;
        this.metrics.lastSuccessTime = Date.now();
        this.metrics.consecutiveSuccesses++;
        this.metrics.consecutiveFailures = 0;

        // Update average response time
        this.updateAverageResponseTime(duration);

        // Check for slow call
        if (duration > this.config.slowCallDurationThreshold) {
            this.metrics.slowRequests++;
        }

        // Handle state transitions
        if (this.state === CircuitState.HALF_OPEN) {
            this.halfOpenTestInProgress = false;
            if (
                this.metrics.consecutiveSuccesses >=
                this.config.successThreshold
            ) {
                this.transitionTo(
                    CircuitState.CLOSED,
                    'Success threshold reached',
                );
            }
        }

        this.logger.debug('Request succeeded', {
            circuitName: this.name,
            duration,
            state: this.state,
            consecutiveSuccesses: this.metrics.consecutiveSuccesses,
        });
    }

    /**
     * Record failed request
     */
    private recordFailure(duration: number, error: Error): void {
        this.metrics.failedRequests++;
        this.metrics.lastFailureTime = Date.now();
        this.metrics.consecutiveFailures++;
        this.metrics.consecutiveSuccesses = 0;

        // Update average response time
        this.updateAverageResponseTime(duration);

        // Handle state transitions
        if (this.state === CircuitState.CLOSED) {
            if (this.shouldOpenCircuit()) {
                this.transitionTo(
                    CircuitState.OPEN,
                    `Failure threshold reached: ${error.message}`,
                );
            }
        } else if (this.state === CircuitState.HALF_OPEN) {
            this.halfOpenTestInProgress = false;
            this.transitionTo(
                CircuitState.OPEN,
                `Test request failed: ${error.message}`,
            );
        }

        this.logger.warn('Request failed', {
            circuitName: this.name,
            duration,
            state: this.state,
            consecutiveFailures: this.metrics.consecutiveFailures,
            error: error.message,
        });
    }

    /**
     * Check if circuit should open
     */
    private shouldOpenCircuit(): boolean {
        // Check minimum request volume
        if (this.metrics.totalRequests < this.config.requestVolumeThreshold) {
            return false;
        }

        // Check consecutive failures
        if (this.metrics.consecutiveFailures >= this.config.failureThreshold) {
            return true;
        }

        // Check failure rate
        const failureRate =
            this.metrics.failedRequests / this.metrics.totalRequests;
        if (failureRate >= this.config.failureRateThreshold) {
            return true;
        }

        // Check slow call rate
        const slowCallRate =
            this.metrics.slowRequests / this.metrics.totalRequests;
        if (slowCallRate >= this.config.slowCallRateThreshold) {
            return true;
        }

        return false;
    }

    /**
     * Transition to new state
     */
    private transitionTo(newState: CircuitState, reason: string): void {
        const oldState = this.state;
        this.state = newState;
        this.lastStateChange = Date.now();

        this.metrics.stateChanges.push({
            from: oldState,
            to: newState,
            timestamp: Date.now(),
            reason,
        });

        this.logger.info('Circuit breaker state transition', {
            circuitName: this.name,
            from: oldState,
            to: newState,
            reason,
        });

        // Reset counters on state change
        if (newState === CircuitState.CLOSED) {
            this.metrics.consecutiveFailures = 0;
        } else if (newState === CircuitState.OPEN) {
            this.metrics.consecutiveSuccesses = 0;
        }
    }

    /**
     * Update average response time
     */
    private updateAverageResponseTime(duration: number): void {
        const currentAvg = this.metrics.averageResponseTime;
        const totalRequests = this.metrics.totalRequests;
        this.metrics.averageResponseTime =
            (currentAvg * (totalRequests - 1) + duration) / totalRequests;
    }

    /**
     * Initialize metrics
     */
    private initializeMetrics(): CircuitBreakerMetrics {
        return {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            rejectedRequests: 0,
            slowRequests: 0,
            averageResponseTime: 0,
            consecutiveFailures: 0,
            consecutiveSuccesses: 0,
            state: CircuitState.CLOSED,
            stateChanges: [],
        };
    }

    /**
     * Get current metrics
     */
    getMetrics(): CircuitBreakerMetrics {
        return { ...this.metrics };
    }

    /**
     * Get current state
     */
    getState(): CircuitState {
        return this.state;
    }

    /**
     * Reset circuit breaker
     */
    reset(): void {
        this.state = CircuitState.CLOSED;
        this.metrics = this.initializeMetrics();
        this.lastStateChange = Date.now();
        this.halfOpenTestInProgress = false;

        this.logger.info('Circuit breaker reset', {
            circuitName: this.name,
        });
    }

    /**
     * Force open (for testing/emergency)
     */
    forceOpen(reason: string = 'Forced open'): void {
        this.transitionTo(CircuitState.OPEN, reason);
    }

    /**
     * Force closed (for testing/recovery)
     */
    forceClosed(reason: string = 'Forced closed'): void {
        this.transitionTo(CircuitState.CLOSED, reason);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 🔌 CIRCUIT BREAKER MANAGER
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Manages multiple circuit breakers
 */
export class CircuitBreakerManager {
    private logger = createLogger('circuit-breaker-manager');
    private breakers = new Map<string, CircuitBreaker>();
    private defaultConfig: CircuitBreakerConfig;

    constructor(defaultConfig?: Partial<CircuitBreakerConfig>) {
        this.defaultConfig = {
            failureThreshold: 5,
            failureRateThreshold: 0.5,
            requestVolumeThreshold: 10,
            timeout: 5000,
            resetTimeout: 30000,
            cooldownPeriod: 60000,
            successThreshold: 3,
            slowCallDurationThreshold: 3000,
            slowCallRateThreshold: 0.5,
            ...defaultConfig,
        };
    }

    /**
     * Get or create circuit breaker
     */
    getBreaker(
        name: string,
        config?: Partial<CircuitBreakerConfig>,
    ): CircuitBreaker {
        let breaker = this.breakers.get(name);

        if (!breaker) {
            const finalConfig = { ...this.defaultConfig, ...config };
            breaker = new CircuitBreaker(name, finalConfig);
            this.breakers.set(name, breaker);

            this.logger.info('Created new circuit breaker', {
                name,
                config: finalConfig,
            });
        }

        return breaker;
    }

    /**
     * Execute with circuit breaker
     */
    async executeWithBreaker<T>(
        breakerName: string,
        fn: () => Promise<T>,
        context: CircuitBreakerContext,
    ): Promise<T> {
        const breaker = this.getBreaker(breakerName);
        return await breaker.execute(fn, context);
    }

    /**
     * Get all circuit breakers
     */
    getAllBreakers(): Map<string, CircuitBreaker> {
        return new Map(this.breakers);
    }

    /**
     * Get metrics for all breakers
     */
    getAllMetrics(): Record<string, CircuitBreakerMetrics> {
        const metrics: Record<string, CircuitBreakerMetrics> = {};

        for (const [name, breaker] of this.breakers) {
            metrics[name] = breaker.getMetrics();
        }

        return metrics;
    }

    /**
     * Reset specific breaker
     */
    resetBreaker(name: string): void {
        const breaker = this.breakers.get(name);
        if (breaker) {
            breaker.reset();
        }
    }

    /**
     * Reset all breakers
     */
    resetAll(): void {
        for (const breaker of this.breakers.values()) {
            breaker.reset();
        }
    }

    /**
     * Remove circuit breaker
     */
    removeBreaker(name: string): boolean {
        return this.breakers.delete(name);
    }

    /**
     * Clear all breakers
     */
    clear(): void {
        this.breakers.clear();
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 🛠️ FACTORY & UTILITY FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Create circuit breaker with default config
 */
export function createCircuitBreaker(
    name: string,
    config?: Partial<CircuitBreakerConfig>,
): CircuitBreaker {
    const defaultConfig: CircuitBreakerConfig = {
        failureThreshold: 5,
        failureRateThreshold: 0.5,
        requestVolumeThreshold: 10,
        timeout: 5000,
        resetTimeout: 30000,
        cooldownPeriod: 60000,
        successThreshold: 3,
        slowCallDurationThreshold: 3000,
        slowCallRateThreshold: 0.5,
    };

    return new CircuitBreaker(name, { ...defaultConfig, ...config });
}

/**
 * Create circuit breaker manager
 */
export function createCircuitBreakerManager(
    defaultConfig?: Partial<CircuitBreakerConfig>,
): CircuitBreakerManager {
    return new CircuitBreakerManager(defaultConfig);
}

/**
 * Default fallback for agent operations
 */
export async function defaultAgentFallback(error: Error): Promise<Event> {
    return {
        id: `fallback-${Date.now()}`,
        type: 'agent.fallback',
        threadId: `fallback-${Date.now()}`,
        data: {
            error: error.message,
            fallbackReason: 'Circuit breaker open',
            timestamp: Date.now(),
        },
        ts: Date.now(),
    };
}

/**
 * Create agent-specific circuit breaker config
 */
export function createAgentBreakerConfig(
    overrides?: Partial<CircuitBreakerConfig>,
): CircuitBreakerConfig {
    return {
        failureThreshold: 3, // Agents can fail 3 times
        failureRateThreshold: 0.5, // 50% failure rate
        requestVolumeThreshold: 5, // Min 5 requests
        timeout: 30000, // 30s timeout for agents
        resetTimeout: 60000, // Try again after 1 minute
        cooldownPeriod: 120000, // 2 minute cooldown
        successThreshold: 2, // 2 successes to recover
        slowCallDurationThreshold: 10000, // 10s is slow for agents
        slowCallRateThreshold: 0.7, // 70% slow calls
        fallbackFunction: defaultAgentFallback,
        ...overrides,
    };
}
