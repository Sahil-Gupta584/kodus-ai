/**
 * @module engine/core/multi-kernel-handler
 * @description Multi-Kernel Handler for proper separation of concerns
 *
 * Replaces the single-kernel KernelHandler with a multi-kernel approach:
 * - Observability kernel (no persistence, fire-and-forget)
 * - Agent kernel (with persistence, snapshots, recovery)
 * - Automatic routing based on event type namespace
 */

/**
 * Simple mutex implementation for thread-safe operations
 */
class SimpleMutex {
    private locked = false;
    private queue: (() => void)[] = [];

    async acquire(): Promise<void> {
        return new Promise<void>((resolve) => {
            if (!this.locked) {
                this.locked = true;
                resolve();
            } else {
                this.queue.push(resolve);
            }
        });
    }

    release(): void {
        if (this.queue.length > 0) {
            const next = this.queue.shift()!;
            process.nextTick(next);
        } else {
            this.locked = false;
        }
    }

    async withLock<T>(operation: () => Promise<T>): Promise<T> {
        await this.acquire();
        try {
            return await operation();
        } finally {
            this.release();
        }
    }
}

import {
    MultiKernelManager,
    createMultiKernelManager,
    createObservabilityKernelSpec,
    createAgentKernelSpec,
    type MultiKernelConfig,
    type KernelSpec,
} from '../../kernel/multi-kernel-manager.js';
import { createLogger } from '../../observability/index.js';
import { createWorkflow } from '../../core/types/common-types.js';
import type {
    EventType,
    EventPayloads,
    AnyEvent,
} from '../../core/types/events.js';
import type { EventHandler, Workflow } from '../../core/types/common-types.js';
import type { ExecutionId } from '../../core/types/base-types.js';
import type { Middleware } from '../../runtime/middleware/types.js';

/**
 * Multi-Kernel Handler Configuration
 */
export interface MultiKernelHandlerConfig {
    tenantId: string;
    debug?: boolean;
    monitor?: boolean;

    // Observability kernel configuration
    observability?: {
        enabled?: boolean;
        workflow?: Workflow;
        performance?: {
            enableBatching?: boolean;
            enableLazyLoading?: boolean;
        };
    };

    // Agent kernel configuration
    agent?: {
        enabled?: boolean;
        workflow?: Workflow;
        quotas?: {
            maxEvents?: number;
            maxDuration?: number;
            maxMemory?: number;
        };
        runtimeConfig?: {
            queueSize?: number;
            batchSize?: number;
            middleware?: Middleware[];
        };
        performance?: {
            enableBatching?: boolean;
            enableCaching?: boolean;
        };
    };

    // Global configuration
    global?: {
        persistorType?: 'memory' | 'mongodb' | 'redis' | 'temporal';
        persistorOptions?: Record<string, unknown>;
        enableCrossKernelLogging?: boolean;
    };

    // Infinite loop protection
    loopProtection?: {
        enabled?: boolean;
        maxEventCount?: number;
        maxEventRate?: number;
        windowSize?: number;
    };
}

/**
 * Execution result for multi-kernel operations
 */
export interface MultiKernelExecutionResult<T = unknown> {
    status: 'completed' | 'failed' | 'paused';
    data?: T;
    error?: {
        message: string;
        details?: unknown;
    };
    metadata: {
        executionId: ExecutionId;
        duration: number;
        kernelsUsed: string[];
        agentEventCount: number;
        observabilityEventCount: number;
        snapshotId?: string;
    };
}

/**
 * Multi-Kernel Handler - Proper separation between observability and agent kernels
 */
export class MultiKernelHandler {
    private readonly config: MultiKernelHandlerConfig;
    private readonly logger: ReturnType<typeof createLogger>;
    private multiKernelManager: MultiKernelManager | null = null;
    private initialized = false;

    // Event routing tracking
    private eventCounts = {
        agent: 0,
        observability: 0,
        crossKernel: 0,
    };

    // Loop protection
    private loopProtection: {
        enabled: boolean;
        maxEventCount: number;
        maxEventRate: number;
        windowSize: number;
        eventHistory: Array<{
            timestamp: number;
            type: string;
            kernel: string;
        }>;
    };

    // Thread safety mutexes
    private eventCountsMutex = new SimpleMutex();
    private loopProtectionMutex = new SimpleMutex();

    constructor(config: MultiKernelHandlerConfig) {
        this.config = {
            debug: false,
            monitor: false,
            observability: { enabled: true },
            agent: { enabled: true },
            global: { persistorType: 'memory' },
            ...config,
        };

        this.logger = createLogger(`multi-kernel-handler:${config.tenantId}`);

        // Initialize loop protection
        const loopConfig = config.loopProtection || {};
        this.loopProtection = {
            enabled: loopConfig.enabled ?? true,
            maxEventCount: loopConfig.maxEventCount ?? 100,
            maxEventRate: loopConfig.maxEventRate ?? 50,
            windowSize: loopConfig.windowSize ?? 5000,
            eventHistory: [],
        };

        this.logger.info('MultiKernelHandler created', {
            tenantId: config.tenantId,
            observabilityEnabled: this.config.observability?.enabled,
            agentEnabled: this.config.agent?.enabled,
            loopProtection: this.loopProtection.enabled,
        });
    }

    /**
     * Initialize multi-kernel architecture
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            this.logger.warn('MultiKernelHandler already initialized');
            return;
        }

        try {
            const kernelSpecs: KernelSpec[] = [];

            // 1. Create observability kernel (if enabled)
            if (this.config.observability?.enabled) {
                const obsWorkflow =
                    this.config.observability.workflow ||
                    this.createObservabilityWorkflow();

                kernelSpecs.push(
                    createObservabilityKernelSpec('observability', obsWorkflow),
                );

                this.logger.info('Observability kernel spec created', {
                    needsPersistence: false,
                    needsSnapshots: false,
                });
            }

            // 2. Create agent kernel (if enabled)
            if (this.config.agent?.enabled) {
                const agentWorkflow =
                    this.config.agent.workflow || this.createAgentWorkflow();

                kernelSpecs.push(
                    createAgentKernelSpec(
                        'agent-execution',
                        agentWorkflow,
                        this.config.agent.quotas,
                    ),
                );

                this.logger.info('Agent kernel spec created', {
                    needsPersistence: true,
                    needsSnapshots: true,
                    quotas: this.config.agent.quotas,
                });
            }

            // 3. Create multi-kernel configuration
            const multiKernelConfig: MultiKernelConfig = {
                tenantId: this.config.tenantId,
                kernels: kernelSpecs,
                bridges: [
                    // Agent → Observability (metrics, traces, logs)
                    {
                        fromNamespace: 'agent',
                        toNamespace: 'obs',
                        eventPattern: 'agent.metrics.*',
                        enableLogging: this.config.debug,
                    },
                    {
                        fromNamespace: 'agent',
                        toNamespace: 'obs',
                        eventPattern: 'agent.trace.*',
                        enableLogging: this.config.debug,
                    },
                    {
                        fromNamespace: 'agent',
                        toNamespace: 'obs',
                        eventPattern: 'agent.log.*',
                        enableLogging: this.config.debug,
                    },
                    // Observability → Agent (alerts, health checks)
                    {
                        fromNamespace: 'obs',
                        toNamespace: 'agent',
                        eventPattern: 'obs.alert.*',
                        enableLogging: this.config.debug,
                    },
                    {
                        fromNamespace: 'obs',
                        toNamespace: 'agent',
                        eventPattern: 'obs.health.*',
                        enableLogging: this.config.debug,
                    },
                ],
                global: this.config.global,
            };

            // 4. Create and initialize multi-kernel manager
            this.multiKernelManager =
                createMultiKernelManager(multiKernelConfig);
            await this.multiKernelManager.initialize();

            this.initialized = true;

            this.logger.info('MultiKernelHandler initialized successfully', {
                tenantId: this.config.tenantId,
                kernelCount: kernelSpecs.length,
                bridges: multiKernelConfig.bridges?.length || 0,
            });
        } catch (error) {
            this.logger.error(
                'Failed to initialize MultiKernelHandler',
                error as Error,
            );
            throw error;
        }
    }

    /**
     * Check if initialized
     */
    isInitialized(): boolean {
        return this.initialized && this.multiKernelManager !== null;
    }

    /**
     * Emit event with automatic kernel routing based on event type
     */
    async emit<T extends EventType>(
        eventType: T,
        data?: EventPayloads[T],
    ): Promise<void> {
        this.ensureInitialized();

        // Check for infinite loop protection (thread-safe)
        if (this.loopProtection.enabled) {
            await this.checkForInfiniteLoopSafe(eventType);
        }

        // Route event to appropriate kernel based on event type
        const targetKernel = this.determineTargetKernel(eventType);

        try {
            await this.multiKernelManager!.emitToNamespace(
                targetKernel,
                eventType,
                data,
            );

            // Thread-safe update of event counts and loop protection history
            await Promise.all([
                this.updateEventCountsSafe(targetKernel),
                this.updateLoopProtectionHistorySafe(eventType, targetKernel),
            ]);

            this.logger.debug('Event routed successfully', {
                eventType,
                targetKernel,
                eventCounts: this.eventCounts,
            });
        } catch (error) {
            this.logger.error('Failed to emit event', error as Error, {
                eventType,
                targetKernel,
            });
            throw error;
        }
    }

    /**
     * Emit event with delivery guarantee information
     * Similar to runtime.emitAsync() but through kernel layer
     */
    async emitAsync<T extends EventType>(
        eventType: T,
        data?: EventPayloads[T],
        options?: {
            deliveryGuarantee?:
                | 'at-most-once'
                | 'at-least-once'
                | 'exactly-once';
            correlationId?: string;
            timeout?: number;
        },
    ): Promise<{
        success: boolean;
        eventId: string;
        queued: boolean;
        error?: Error;
        correlationId?: string;
    }> {
        const correlationId =
            options?.correlationId || `corr_${Date.now()}_${Math.random()}`;
        const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

        try {
            // Add correlationId to event data
            const enrichedData = data
                ? {
                      ...data,
                      correlationId,
                      eventId,
                  }
                : ({
                      correlationId,
                      eventId,
                  } as EventPayloads[T]);

            await this.emit(eventType, enrichedData);

            // Process events immediately to ensure handlers run
            await this.processEvents();

            return {
                success: true,
                eventId,
                queued: true,
                correlationId,
            };
        } catch (error) {
            return {
                success: false,
                eventId,
                queued: false,
                error: error as Error,
                correlationId,
            };
        }
    }

    /**
     * Register event handler on appropriate kernel
     */
    registerHandler(
        eventType: EventType,
        handler: EventHandler<AnyEvent>,
    ): void {
        this.ensureInitialized();

        // Determine which kernel should handle this event type
        const targetKernel = this.determineTargetKernel(eventType);
        const kernelId =
            targetKernel === 'agent' ? 'agent-execution' : 'observability';

        this.multiKernelManager!.registerHandler(kernelId, eventType, handler);

        this.logger.debug('Handler registered', {
            eventType,
            targetKernel,
            kernelId,
        });
    }

    /**
     * Process events for all kernels
     */
    async processEvents(): Promise<void> {
        this.ensureInitialized();
        await this.multiKernelManager!.processAllKernels();
    }

    /**
     * Pause all kernels (only agent kernel creates snapshots)
     */
    async pause(
        reason: string = 'manual',
    ): Promise<Map<string, string | null>> {
        this.ensureInitialized();

        const results = await this.multiKernelManager!.pauseAll();

        this.logger.info('All kernels paused', {
            reason,
            results: Array.from(results.entries()),
        });

        return results;
    }

    /**
     * Resume all kernels (only agent kernel restores from snapshots)
     */
    async resume(snapshotIds?: Map<string, string>): Promise<void> {
        this.ensureInitialized();

        await this.multiKernelManager!.resumeAll(snapshotIds);

        this.logger.info('All kernels resumed', {
            snapshotIds: snapshotIds ? Array.from(snapshotIds.entries()) : [],
        });
    }

    /**
     * Get comprehensive status (thread-safe)
     */
    async getStatus(): Promise<{
        initialized: boolean;
        kernels: ReturnType<MultiKernelManager['getStatus']>;
        eventCounts: {
            agent: number;
            observability: number;
            crossKernel: number;
        };
        loopProtection: {
            enabled: boolean;
            eventCount: number;
            eventRate: number;
            recentEvents: Array<{
                timestamp: number;
                type: string;
                kernel: string;
            }>;
        };
    }> {
        if (!this.isInitialized()) {
            // Safe to access these without locks as they're read-only
            const eventCountsCopy = await this.eventCountsMutex.withLock(
                async () => ({
                    agent: this.eventCounts.agent,
                    observability: this.eventCounts.observability,
                    crossKernel: this.eventCounts.crossKernel,
                }),
            );

            return {
                initialized: false,
                kernels: {
                    tenantId: this.config.tenantId,
                    kernelCount: 0,
                    runningKernels: 0,
                    failedKernels: 0,
                    kernels: [],
                    crossKernelEvents: {
                        totalEvents: 0,
                        successfulEvents: 0,
                        failedEvents: 0,
                        recentEvents: [],
                    },
                },
                eventCounts: eventCountsCopy,
                loopProtection: {
                    enabled: this.loopProtection.enabled,
                    eventCount: 0,
                    eventRate: 0,
                    recentEvents: [],
                },
            };
        }

        // Thread-safe access to shared data
        const [eventCountsCopy, loopProtectionData] = await Promise.all([
            this.eventCountsMutex.withLock(async () => ({
                agent: this.eventCounts.agent,
                observability: this.eventCounts.observability,
                crossKernel: this.eventCounts.crossKernel,
            })),
            this.loopProtectionMutex.withLock(async () => {
                const now = Date.now();
                const cutoffTime = now - this.loopProtection.windowSize;
                const recentEvents = this.loopProtection.eventHistory
                    .filter((e) => e.timestamp > cutoffTime)
                    .map((e) => ({ ...e })); // Create copies

                return {
                    enabled: this.loopProtection.enabled,
                    eventCount: recentEvents.length,
                    eventRate:
                        recentEvents.length /
                        (this.loopProtection.windowSize / 1000),
                    recentEvents: recentEvents.slice(-10),
                };
            }),
        ]);

        return {
            initialized: true,
            kernels: this.multiKernelManager!.getStatus(),
            eventCounts: eventCountsCopy,
            loopProtection: loopProtectionData,
        };
    }

    /**
     * Run execution with proper kernel routing
     */
    async run(startEvent: AnyEvent): Promise<MultiKernelExecutionResult> {
        this.ensureInitialized();

        const execId =
            `exec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}` as ExecutionId;
        const startTime = Date.now();
        const initialEventCounts = await this.eventCountsMutex.withLock(
            async () => ({
                agent: this.eventCounts.agent,
                observability: this.eventCounts.observability,
                crossKernel: this.eventCounts.crossKernel,
            }),
        );

        this.logger.info('MultiKernelHandler starting execution', {
            executionId: execId,
            eventType: startEvent.type,
            tenantId: this.config.tenantId,
        });

        try {
            // Emit the start event
            await this.emit(startEvent.type as EventType, startEvent.data);

            // Process all events
            await this.processEvents();

            const duration = Date.now() - startTime;
            const kernelsUsed = [];

            // Thread-safe read of current event counts
            const currentEventCounts = await this.eventCountsMutex.withLock(
                async () => ({
                    agent: this.eventCounts.agent,
                    observability: this.eventCounts.observability,
                    crossKernel: this.eventCounts.crossKernel,
                }),
            );

            if (currentEventCounts.agent > initialEventCounts.agent) {
                kernelsUsed.push('agent');
            }
            if (
                currentEventCounts.observability >
                initialEventCounts.observability
            ) {
                kernelsUsed.push('observability');
            }

            this.logger.info('MultiKernelHandler execution completed', {
                executionId: execId,
                duration,
                kernelsUsed,
                eventCounts: currentEventCounts,
            });

            return {
                status: 'completed',
                data: startEvent.data,
                metadata: {
                    executionId: execId,
                    duration,
                    kernelsUsed,
                    agentEventCount:
                        currentEventCounts.agent - initialEventCounts.agent,
                    observabilityEventCount:
                        currentEventCounts.observability -
                        initialEventCounts.observability,
                },
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : 'Unknown execution error';

            this.logger.error(
                'MultiKernelHandler execution failed',
                error as Error,
                {
                    executionId: execId,
                    duration,
                },
            );

            return {
                status: 'failed',
                error: {
                    message: errorMessage,
                    details: error,
                },
                metadata: {
                    executionId: execId,
                    duration,
                    kernelsUsed: [],
                    agentEventCount: 0,
                    observabilityEventCount: 0,
                },
            };
        }
    }

    /**
     * Cleanup all resources
     */
    async cleanup(): Promise<void> {
        if (!this.initialized) {
            return;
        }

        try {
            if (this.multiKernelManager) {
                await this.multiKernelManager.cleanup();
            }

            this.multiKernelManager = null;
            this.initialized = false;

            // Thread-safe reset of shared data
            await Promise.all([
                this.eventCountsMutex.withLock(async () => {
                    this.eventCounts = {
                        agent: 0,
                        observability: 0,
                        crossKernel: 0,
                    };
                }),
                this.loopProtectionMutex.withLock(async () => {
                    this.loopProtection.eventHistory = [];
                }),
            ]);

            this.logger.info('MultiKernelHandler cleaned up');
        } catch (error) {
            this.logger.error(
                'Failed to cleanup MultiKernelHandler',
                error as Error,
            );
            throw error;
        }
    }

    /**
     * Get multi-kernel manager (for advanced operations)
     */
    getMultiKernelManager(): MultiKernelManager | null {
        return this.multiKernelManager;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // 🚀 REQUEST-RESPONSE PATTERN (Using runtime ACK/NACK system)
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Send request using runtime's built-in ACK/NACK system
     */
    async request<TRequest = unknown, TResponse = unknown>(
        requestEventType: string,
        responseEventType: string,
        data: TRequest,
        options: {
            timeout?: number;
            correlationId?: string;
        } = {},
    ): Promise<TResponse> {
        this.ensureInitialized();

        const correlationId =
            options.correlationId || this.generateCorrelationId();
        const timeout = options.timeout || 30000;

        this.logger.debug('Sending request via runtime ACK/NACK', {
            requestEventType,
            responseEventType,
            correlationId,
            timeout,
        });

        // ✅ Use runtime's built-in emit with ACK system
        const targetKernel = this.determineTargetKernel(requestEventType);
        const kernel = this.multiKernelManager!.getKernel(
            targetKernel === 'agent' ? 'agent-execution' : 'observability',
        );

        if (!kernel) {
            throw new Error(`Target kernel not available: ${targetKernel}`);
        }

        // ✅ Get runtime instance from kernel and use its ACK/NACK system
        const runtime = kernel.getRuntime();
        if (!runtime) {
            throw new Error('Runtime not available from kernel');
        }

        return new Promise<TResponse>((resolve, reject) => {
            let responseReceived = false;
            const timeoutId = setTimeout(() => {
                if (!responseReceived) {
                    responseReceived = true;
                    reject(
                        new Error(
                            `Timeout waiting for ${responseEventType} (${timeout}ms)`,
                        ),
                    );
                }
            }, timeout);

            // ✅ Register response handler using existing patterns
            const responseHandler = (event: AnyEvent) => {
                if (
                    event.metadata?.correlationId === correlationId &&
                    !responseReceived
                ) {
                    responseReceived = true;
                    clearTimeout(timeoutId);

                    // ✅ Use runtime's ACK system
                    runtime.ack(event.id).catch((error) => {
                        this.logger.warn('Failed to ACK response event', {
                            error,
                            eventId: event.id,
                        });
                    });

                    if ((event.data as { error?: string })?.error) {
                        reject(
                            new Error(
                                (event.data as { error?: string }).error!,
                            ),
                        );
                    } else {
                        resolve(event.data as TResponse);
                    }
                }
            };

            // Register handler on the target kernel for response
            const responseKernel =
                this.determineTargetKernel(responseEventType);
            const responseKernelId =
                responseKernel === 'agent'
                    ? 'agent-execution'
                    : 'observability';

            this.multiKernelManager!.registerHandler(
                responseKernelId,
                responseEventType as EventType,
                responseHandler,
            );

            // ✅ Emit request using runtime's emitAsync (with built-in ACK tracking)
            runtime
                .emitAsync(
                    requestEventType as EventType,
                    {
                        ...data,
                        correlationId,
                        timestamp: Date.now(),
                    },
                    {
                        correlationId,
                        timeout: timeout,
                    },
                )
                .then(async (emitResult) => {
                    if (!emitResult.success) {
                        responseReceived = true;
                        clearTimeout(timeoutId);
                        reject(
                            emitResult.error ||
                                new Error('Failed to emit request'),
                        );
                    } else {
                        // ✅ Process events immediately after successful emit to ensure handlers can respond
                        try {
                            await this.processEvents();
                        } catch (processError) {
                            this.logger.error(
                                'Failed to process events after emit',
                                processError as Error,
                                {
                                    requestEventType,
                                    correlationId,
                                },
                            );
                            // Don't reject here - let the timeout handle it if no response comes
                        }
                    }
                })
                .catch((error) => {
                    responseReceived = true;
                    clearTimeout(timeoutId);
                    reject(error);
                });
        });
    }

    /**
     * Convenience method for tool execution requests
     */
    async requestToolExecution(
        toolName: string,
        input: unknown,
        options?: { timeout?: number; correlationId?: string },
    ): Promise<unknown> {
        return this.request(
            'tool.execute.request',
            'tool.execute.response',
            {
                toolName,
                input,
                timestamp: Date.now(),
            },
            options,
        );
    }

    /**
     * Convenience method for LLM planning requests
     */
    async requestLLMPlanning(
        goal: string,
        technique: string,
        context: {
            availableTools?: string[];
            agentIdentity?: Record<string, unknown>;
            previousPlans?: Array<Record<string, unknown>>;
        },
        options?: { timeout?: number; correlationId?: string },
    ): Promise<Record<string, unknown>> {
        return this.request(
            'llm.planning.request',
            'llm.planning.response',
            {
                goal,
                technique,
                context,
                timestamp: Date.now(),
            },
            options,
        );
    }

    /**
     * Generate correlation ID for request-response
     */
    private generateCorrelationId(): string {
        return `corr_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    // Private helper methods

    /**
     * Determine target kernel based on event type
     */
    private determineTargetKernel(eventType: string): 'agent' | 'obs' {
        // Observability events (logs, metrics, traces, alerts)
        if (
            eventType.startsWith('obs.') ||
            eventType.startsWith('log.') ||
            eventType.startsWith('metric.') ||
            eventType.startsWith('trace.') ||
            eventType.startsWith('alert.') ||
            eventType.startsWith('health.') ||
            eventType.includes('.log.') ||
            eventType.includes('.metric.') ||
            eventType.includes('.trace.')
        ) {
            return 'obs';
        }

        // Agent events (execution, tools, workflows, business logic)
        // Default to agent kernel for business events
        return 'agent';
    }

    /**
     * Create default observability workflow
     */
    private createObservabilityWorkflow(): Workflow {
        return createWorkflow(
            {
                name: 'observability-workflow',
                description:
                    'Fire-and-forget workflow for logs, metrics, and traces',
                steps: {},
                entryPoints: [],
            },
            {
                tenantId: this.config.tenantId,
            },
        );
    }

    /**
     * Create default agent workflow
     */
    private createAgentWorkflow(): Workflow {
        return createWorkflow(
            {
                name: 'agent-execution-workflow',
                description:
                    'Stateful workflow for agent execution with recovery',
                steps: {},
                entryPoints: [],
            },
            {
                tenantId: this.config.tenantId,
            },
        );
    }

    /**
     * Ensure handler is initialized
     */
    private ensureInitialized(): void {
        if (!this.isInitialized()) {
            throw new Error(
                'MultiKernelHandler not initialized. Call initialize() first.',
            );
        }
    }

    /**
     * Check for infinite loop patterns
     */
    /**
     * Thread-safe infinite loop check
     */
    private async checkForInfiniteLoopSafe(eventType: string): Promise<void> {
        return this.loopProtectionMutex.withLock(async () => {
            const now = Date.now();
            const cutoffTime = now - this.loopProtection.windowSize;

            // Clean up old events
            this.loopProtection.eventHistory =
                this.loopProtection.eventHistory.filter(
                    (event) => event.timestamp > cutoffTime,
                );

            // Check event count threshold
            if (
                this.loopProtection.eventHistory.length >
                this.loopProtection.maxEventCount
            ) {
                const error = new Error(
                    `Infinite loop detected: ${this.loopProtection.eventHistory.length} events in ${this.loopProtection.windowSize}ms window`,
                );
                this.logger.error('Infinite loop protection triggered', error, {
                    eventType,
                    eventCount: this.loopProtection.eventHistory.length,
                    recentEvents: this.loopProtection.eventHistory.slice(-10),
                });
                throw error;
            }

            // Check event rate threshold
            const eventRate =
                this.loopProtection.eventHistory.length /
                (this.loopProtection.windowSize / 1000);
            if (eventRate > this.loopProtection.maxEventRate) {
                this.logger.warn('High event rate detected', {
                    eventType,
                    eventRate: eventRate.toFixed(2),
                    maxEventRate: this.loopProtection.maxEventRate,
                });
            }
        });
    }

    /**
     * Thread-safe event counts update
     */
    private async updateEventCountsSafe(targetKernel: string): Promise<void> {
        return this.eventCountsMutex.withLock(async () => {
            if (targetKernel === 'agent') {
                this.eventCounts.agent++;
            } else if (targetKernel === 'obs') {
                this.eventCounts.observability++;
            }
        });
    }

    /**
     * Thread-safe loop protection history update
     */
    private async updateLoopProtectionHistorySafe(
        eventType: string,
        targetKernel: string,
    ): Promise<void> {
        return this.loopProtectionMutex.withLock(async () => {
            this.loopProtection.eventHistory.push({
                timestamp: Date.now(),
                type: eventType,
                kernel: targetKernel,
            });
        });
    }
}

/**
 * Create multi-kernel handler
 */
export function createMultiKernelHandler(
    config: MultiKernelHandlerConfig,
): MultiKernelHandler {
    return new MultiKernelHandler(config);
}

/**
 * Create multi-kernel handler with default configuration
 */
export function createDefaultMultiKernelHandler(
    tenantId: string,
    persistorConfig?: {
        type: 'memory' | 'mongodb' | 'redis' | 'temporal';
        options?: Record<string, unknown>;
    },
): MultiKernelHandler {
    return createMultiKernelHandler({
        tenantId,
        observability: { enabled: true },
        agent: { enabled: true },
        global: {
            persistorType: persistorConfig?.type || 'memory',
            persistorOptions: persistorConfig?.options || {},
        },
        loopProtection: { enabled: true },
    });
}
