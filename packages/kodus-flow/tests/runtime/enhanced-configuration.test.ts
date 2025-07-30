/**
 * @file enhanced-configuration.test.ts
 * @description Tests for Enhanced Event Queue configuration validation and behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRuntime } from '../../src/runtime/index.js';
import { createPersistorFromConfig } from '../../src/persistor/factory.js';
import { getObservability } from '../../src/observability/index.js';
import type { WorkflowContext } from '../../src/core/types/workflow-types.js';
import { ContextStateService } from '../../src/core/context/index.js';

describe('Enhanced Event Queue Configuration', () => {
    let observability: ReturnType<typeof getObservability>;
    let workflowContext: WorkflowContext;

    beforeEach(() => {
        observability = getObservability({ environment: 'test' });
        // persistor removed as it's not used

        workflowContext = {
            workflowName: 'test-workflow',
            executionId: 'test-execution',
            stateManager: new ContextStateService({}),
            data: {},
            currentSteps: [],
            completedSteps: [],
            failedSteps: [],
            metadata: {},
            tenantId: 'test-tenant',
            signal: new AbortController().signal,
            isPaused: false,
            cleanup: async () => {},
            startTime: Date.now(),
            status: 'RUNNING' as const,
        };
    });

    afterEach(async () => {
        // Cleanup any created runtimes
    });

    describe('Default Enhanced Configuration', () => {
        it('should enable enhanced queue by default', () => {
            const runtime = createRuntime(workflowContext, observability);

            const stats = runtime.getStats() as {
                runtime: { enhancedQueue: boolean };
            };
            expect(stats.runtime).toBeTruthy();
            expect(stats.runtime.enhancedQueue).toBe(true);

            runtime.cleanup();
        });

        it('should use sensible defaults for enhanced features', () => {
            const runtime = createRuntime(workflowContext, observability);

            const enhancedQueue = runtime.getEnhancedQueue?.();
            expect(enhancedQueue).toBeTruthy();

            const stats = enhancedQueue!.getStats();
            expect(stats.retry).toBeTruthy();
            expect(stats.retry.maxRetries).toBe(3);
            expect(stats.retry.baseRetryDelay).toBe(1000);
            expect(stats.retry.maxRetryDelay).toBe(30000);

            expect(stats.dlq).toBeTruthy();

            runtime.cleanup();
        });

        it('should create runtime with auto-generated execution ID', () => {
            const runtime = createRuntime(workflowContext, observability);

            const stats = runtime.getStats() as {
                runtime: { executionId: string };
            };
            expect(stats.runtime.executionId).toBeTruthy();
            expect(typeof stats.runtime.executionId).toBe('string');
            expect(stats.runtime.executionId).toMatch(
                /^runtime_\d+_[a-z0-9]+$/,
            );

            runtime.cleanup();
        });
    });

    describe('Custom Enhanced Configuration', () => {
        it('should accept custom enhanced queue configuration', () => {
            const runtime = createRuntime(workflowContext, observability, {
                enableEnhancedQueue: true,
                enhancedQueue: {
                    maxRetries: 5,
                    baseRetryDelay: 2000,
                    maxRetryDelay: 60000,
                    enableJitter: false,
                    enableDLQ: true,
                    dlq: {
                        maxDLQSize: 100,
                        enablePersistence: true,
                    },
                },
                executionId: 'custom-execution-id',
            });

            const enhancedQueue = runtime.getEnhancedQueue?.();
            expect(enhancedQueue).toBeTruthy();

            const stats = enhancedQueue!.getStats();
            expect(stats.retry.maxRetries).toBe(5);
            expect(stats.retry.baseRetryDelay).toBe(2000);
            expect(stats.retry.maxRetryDelay).toBe(60000);

            const runtimeStats = runtime.getStats() as {
                runtime: { executionId: string };
            };
            expect(runtimeStats.runtime.executionId).toBe(
                'custom-execution-id',
            );

            runtime.cleanup();
        });

        it('should accept custom persistor', () => {
            const customPersistor = createPersistorFromConfig({
                type: 'memory',
                maxSnapshots: 1000,
                enableCompression: true,
                enableDeltaCompression: true,
                cleanupInterval: 300000,
                maxMemoryUsage: 100 * 1024 * 1024,
            });

            const runtime = createRuntime(workflowContext, observability, {
                persistor: customPersistor,
                executionId: 'persistor-test',
            });

            const stats = runtime.getStats() as {
                runtime: { persistorType: string };
            };
            expect(stats.runtime.persistorType).toBe('StoragePersistorAdapter');

            runtime.cleanup();
        });

        it('should fall back to basic queue when enhanced is disabled', () => {
            const runtime = createRuntime(workflowContext, observability, {
                enableEnhancedQueue: false,
            });

            const enhancedQueue = runtime.getEnhancedQueue?.();
            expect(enhancedQueue).toBeNull();

            const stats = runtime.getStats() as {
                runtime: { enhancedQueue: boolean };
                queue: unknown;
            };
            expect(stats.runtime.enhancedQueue).toBe(false);

            // Should still have basic queue functionality
            expect(stats.queue).toBeTruthy();

            runtime.cleanup();
        });
    });

    describe('Enhanced Queue Feature Flags', () => {
        it('should configure DLQ settings correctly', () => {
            const runtime = createRuntime(workflowContext, observability, {
                enhancedQueue: {
                    enableDLQ: true,
                    dlq: {
                        enablePersistence: true,
                        maxDLQSize: 50,
                        enableDetailedLogging: true,
                        alertThreshold: 25,
                        maxRetentionDays: 3,
                    },
                },
            });

            const enhancedQueue = runtime.getEnhancedQueue?.();
            expect(enhancedQueue).toBeTruthy();

            const dlq = enhancedQueue!.getDLQ();
            expect(dlq).toBeTruthy();

            const dlqStats = dlq.getDLQStats();
            expect(dlqStats).toBeTruthy();
            expect(dlqStats.totalItems).toBe(0);

            runtime.cleanup();
        });

        it('should configure circuit breaker when enabled', () => {
            const runtime = createRuntime(workflowContext, observability, {
                enhancedQueue: {
                    enableCircuitBreaker: true,
                    circuitBreakerThreshold: 5,
                    circuitBreakerTimeout: 30000,
                },
            });

            const enhancedQueue = runtime.getEnhancedQueue?.();
            expect(enhancedQueue).toBeTruthy();

            const stats = enhancedQueue!.getStats() as {
                circuitBreaker: {
                    threshold: number;
                    timeout: number;
                    state: string;
                };
            };
            expect(stats.circuitBreaker).toBeTruthy();
            expect(stats.circuitBreaker.threshold).toBe(5);
            expect(stats.circuitBreaker.timeout).toBe(30000);
            expect(stats.circuitBreaker.state).toBe('closed');

            runtime.cleanup();
        });

        it('should configure persistence settings', () => {
            const runtime = createRuntime(workflowContext, observability, {
                enhancedQueue: {
                    persistCriticalEvents: true,
                    enableAutoRecovery: true,
                    maxPersistedEvents: 500,
                    criticalEventPrefixes: ['custom.', 'important.'],
                },
            });

            const enhancedQueue = runtime.getEnhancedQueue?.();
            expect(enhancedQueue).toBeTruthy();

            const stats = enhancedQueue!.getStats();
            expect(stats.persistence).toBeTruthy();

            runtime.cleanup();
        });
    });

    describe('Runtime Interface Enhanced Methods', () => {
        let runtime: ReturnType<typeof createRuntime>;

        beforeEach(() => {
            runtime = createRuntime(workflowContext, observability, {
                enableEnhancedQueue: true,
                enhancedQueue: {
                    enableDLQ: true,
                },
            });
        });

        afterEach(() => {
            runtime.cleanup();
        });

        it('should provide enhanced queue access methods', () => {
            expect(runtime.getEnhancedQueue).toBeInstanceOf(Function);
            expect(runtime.reprocessFromDLQ).toBeInstanceOf(Function);
            expect(runtime.reprocessDLQByCriteria).toBeInstanceOf(Function);
        });

        it('should return enhanced queue instance', () => {
            const enhancedQueue = runtime.getEnhancedQueue?.();
            expect(enhancedQueue).toBeTruthy();
            expect(enhancedQueue!.getStats).toBeInstanceOf(Function);
            expect(enhancedQueue!.getDLQ).toBeInstanceOf(Function);
        });

        it('should handle DLQ reprocessing methods', async () => {
            // Test empty DLQ reprocessing
            const reprocessResult = await runtime.reprocessDLQByCriteria?.({
                limit: 5,
            });

            expect(reprocessResult).toEqual({
                reprocessedCount: 0,
                events: [],
            });

            // Test individual event reprocessing
            const individualResult =
                await runtime.reprocessFromDLQ?.('non-existent-id');
            expect(individualResult).toBe(false);
        });
    });

    describe('Configuration Validation', () => {
        it('should handle invalid configuration gracefully', () => {
            // Should not throw even with potentially invalid config
            const runtime = createRuntime(workflowContext, observability, {
                enhancedQueue: {
                    maxRetries: -1, // Invalid, should use default
                    baseRetryDelay: 0, // Invalid, should use default
                    enableDLQ: true,
                },
            });

            const enhancedQueue = runtime.getEnhancedQueue?.();
            expect(enhancedQueue).toBeTruthy();

            // Should fall back to sensible defaults
            const stats = enhancedQueue!.getStats();
            expect(stats.retry.maxRetries).toBeGreaterThan(0);
            expect(stats.retry.baseRetryDelay).toBeGreaterThan(0);

            runtime.cleanup();
        });

        it('should merge configuration with defaults correctly', () => {
            const runtime = createRuntime(workflowContext, observability, {
                enhancedQueue: {
                    // Only specify some options
                    maxRetries: 7,
                    enableDLQ: true,
                    // Other options should use defaults
                },
            });

            const enhancedQueue = runtime.getEnhancedQueue?.();
            const stats = enhancedQueue!.getStats();

            // Custom values
            expect(stats.retry.maxRetries).toBe(7);

            // Default values should be preserved
            expect(stats.retry.baseRetryDelay).toBe(1000);
            expect(stats.retry.maxRetryDelay).toBe(30000);

            runtime.cleanup();
        });
    });

    describe('Multi-tenant Configuration', () => {
        it('should support tenant-specific configuration', () => {
            const runtime = createRuntime(workflowContext, observability, {
                tenantId: 'tenant-123',
                enableEnhancedQueue: true,
                enhancedQueue: {
                    dlq: {
                        maxDLQSize: 200, // Tenant-specific DLQ size
                    },
                },
            });

            const stats = runtime.getStats();
            expect(stats.runtime).toBeTruthy();

            const tenantRuntime = runtime.forTenant('tenant-456');
            expect(tenantRuntime).toBeTruthy();
            expect(tenantRuntime).not.toBe(runtime); // Should be different instance

            runtime.cleanup();
            tenantRuntime.cleanup();
        });

        it('should isolate configuration between tenants', () => {
            const tenant1Runtime = createRuntime(
                workflowContext,
                observability,
                {
                    tenantId: 'tenant-1',
                    enhancedQueue: { maxRetries: 3 },
                },
            );

            const tenant2Runtime = createRuntime(
                { ...workflowContext, tenantId: 'tenant-2' },
                observability,
                {
                    tenantId: 'tenant-2',
                    enhancedQueue: { maxRetries: 5 },
                },
            );

            const stats1 = tenant1Runtime.getEnhancedQueue?.()?.getStats();
            const stats2 = tenant2Runtime.getEnhancedQueue?.()?.getStats();

            expect(stats1?.retry.maxRetries).toBe(3);
            expect(stats2?.retry.maxRetries).toBe(5);

            tenant1Runtime.cleanup();
            tenant2Runtime.cleanup();
        });
    });
});
