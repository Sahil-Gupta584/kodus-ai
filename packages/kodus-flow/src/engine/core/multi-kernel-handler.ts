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
            autoSnapshot?: {
                enabled?: boolean;
                intervalMs?: number;
                eventInterval?: number;
                useDelta?: boolean;
            };
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

    // Request/response aggregation to avoid per-request handler leaks
    private pendingResponses = new Map<
        string,
        { resolve: (value: unknown) => void; reject: (error: Error) => void }
    >();
    private registeredResponseChannels = new Set<string>();

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

                const agentSpec = createAgentKernelSpec(
                    'agent-execution',
                    agentWorkflow,
                    this.config.agent.quotas,
                );

                // Propagar performance do handler (inclui autoSnapshot se fornecido)
                if (this.config.agent.performance) {
                    agentSpec.performance = {
                        ...agentSpec.performance,
                        ...this.config.agent.performance,
                    };
                }

                kernelSpecs.push(agentSpec);

                this.logger.info('Agent kernel spec created', {
                    needsPersistence: true,
                    needsSnapshots: true,
                    quotas: this.config.agent.quotas,
                    autoSnapshot:
                        this.config.agent.performance?.autoSnapshot || null,
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

        // ✅ ADD: Log detalhado para detectar duplicação
        const eventId =
            data && typeof data === 'object' && 'eventId' in data
                ? (data as { eventId: string }).eventId
                : `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

        this.logger.info('📤 EVENT EMISSION START', {
            eventType,
            eventId,
            hasData: !!data,
            dataKeys: data ? Object.keys(data as Record<string, unknown>) : [],
            correlationId:
                data && typeof data === 'object' && 'metadata' in data
                    ? (data as { metadata?: { correlationId?: string } })
                          .metadata?.correlationId
                    : undefined,
            trace: {
                source: 'multi-kernel-handler',
                step: 'event-emission-start',
                timestamp: Date.now(),
            },
        });

        // Check for infinite loop protection (thread-safe)
        if (this.loopProtection.enabled) {
            await this.checkForInfiniteLoopSafe(eventType);
        }

        // Route event to appropriate kernel based on event type
        const targetKernel = this.determineTargetKernel(eventType);

        this.logger.info('📤 EVENT EMISSION', {
            eventType,
            eventId,
            targetKernel,
            kernelId:
                targetKernel === 'agent' ? 'agent-execution' : 'observability',
            hasData: !!data,
            dataKeys: data ? Object.keys(data as Record<string, unknown>) : [],
            trace: {
                source: 'multi-kernel-handler',
                step: 'event-emission',
                timestamp: Date.now(),
            },
        });

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
                eventId,
                targetKernel,
                eventCounts: this.eventCounts,
            });
        } catch (error) {
            this.logger.error('Failed to emit event', error as Error, {
                eventType,
                eventId,
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

        // ✅ ADD: Log detalhado para detectar duplicação
        this.logger.info('📤 EMITASYNC START', {
            eventType,
            eventId,
            correlationId,
            hasData: !!data,
            dataKeys: data ? Object.keys(data as Record<string, unknown>) : [],
            deliveryGuarantee: options?.deliveryGuarantee || 'at-least-once',
            trace: {
                source: 'multi-kernel-handler',
                step: 'emitasync-start',
                timestamp: Date.now(),
            },
        });

        try {
            // ✅ CORREÇÃO: Não adicionar correlationId ao data (padrão Runtime)
            const enrichedData = data
                ? {
                      ...data,
                      eventId,
                  }
                : ({
                      eventId,
                  } as EventPayloads[T]);

            this.logger.info('📤 EMITASYNC CALLING EMIT', {
                eventType,
                eventId,
                correlationId,
                enrichedDataKeys: Object.keys(
                    enrichedData as Record<string, unknown>,
                ),
                trace: {
                    source: 'multi-kernel-handler',
                    step: 'emitasync-calling-emit',
                    timestamp: Date.now(),
                },
            });

            await this.emit(eventType, enrichedData);

            this.logger.info('📤 EMITASYNC EMIT COMPLETED', {
                eventType,
                eventId,
                correlationId,
                trace: {
                    source: 'multi-kernel-handler',
                    step: 'emitasync-emit-completed',
                    timestamp: Date.now(),
                },
            });

            // Process events immediately to ensure handlers run
            await this.processEvents();

            this.logger.info('📤 EMITASYNC PROCESS EVENTS COMPLETED', {
                eventType,
                eventId,
                correlationId,
                trace: {
                    source: 'multi-kernel-handler',
                    step: 'emitasync-process-events-completed',
                    timestamp: Date.now(),
                },
            });

            return {
                success: true,
                eventId,
                queued: true,
                correlationId,
            };
        } catch (error) {
            this.logger.error('📤 EMITASYNC FAILED', error as Error, {
                eventType,
                eventId,
                correlationId,
                trace: {
                    source: 'multi-kernel-handler',
                    step: 'emitasync-failed',
                    timestamp: Date.now(),
                },
            });

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

        this.logger.info('📝 HANDLER REGISTRATION', {
            eventType,
            targetKernel,
            kernelId,
            handlerRegistered: true,
            trace: {
                source: 'multi-kernel-handler',
                step: 'handler-registration',
                timestamp: Date.now(),
            },
        });
    }

    /**
     * Process events for all kernels
     */
    async processEvents(): Promise<void> {
        this.ensureInitialized();

        console.log('🔍 [DEBUG] MULTI-KERNEL: processEvents called', {
            timestamp: Date.now(),
            step: 'processEvents-start',
            stack: new Error().stack?.split('\n').slice(1, 4).join(' -> '),
        });

        this.logger.info('🔄 PROCESSING EVENTS', {
            trace: {
                source: 'multi-kernel-handler',
                step: 'process-events-start',
                timestamp: Date.now(),
            },
        });

        await this.multiKernelManager!.processAllKernels();

        console.log('🔍 [DEBUG] MULTI-KERNEL: processEvents completed', {
            timestamp: Date.now(),
            step: 'processEvents-complete',
        });

        this.logger.info('✅ EVENTS PROCESSED', {
            trace: {
                source: 'multi-kernel-handler',
                step: 'process-events-complete',
                timestamp: Date.now(),
            },
        });
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
                const recentEvents = (this.loopProtection.eventHistory || [])
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
        } catch (error) {
            this.logger.error(
                'Failed to cleanup MultiKernelHandler',
                error as Error,
            );
            throw error;
        }
    }

    /**
     * Clear events and resources (for testing or reset)
     */
    async clear(): Promise<void> {
        try {
            // Clear multi-kernel manager if exists
            if (this.multiKernelManager) {
                await this.multiKernelManager.cleanup();
            }

            // Reset state
            this.initialized = false;
            this.multiKernelManager = null;

            // Thread-safe clear of shared data
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
        } catch (error) {
            this.logger.error(
                'Failed to clear MultiKernelHandler',
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
     * Send request using event-driven communication (simplified)
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
        const timeout = options.timeout || 120000;

        const targetKernel = this.determineTargetKernel(requestEventType);
        const kernel = this.multiKernelManager!.getKernel(
            targetKernel === 'agent' ? 'agent-execution' : 'observability',
        );

        if (!kernel) {
            throw new Error(`Target kernel not available: ${targetKernel}`);
        }

        // ✅ SIMPLIFIED: Event-driven communication
        return this.emitAndWait<TRequest, TResponse>(
            kernel,
            requestEventType,
            responseEventType,
            data,
            correlationId,
            timeout,
        );
    }

    /**
     * Simplified event-driven communication (no manual timeout)
     */
    private async emitAndWait<TRequest, TResponse>(
        kernel: ReturnType<MultiKernelManager['getKernel']>,
        requestEventType: string,
        responseEventType: string,
        data: TRequest,
        correlationId: string,
        _timeout: number, // ✅ IGNORED: No manual timeout
    ): Promise<TResponse> {
        return new Promise<TResponse>((resolve, reject) => {
            // ✅ SIMPLIFIED: No manual timeout - let tool execute naturally
            const cleanup = () => {
                // No cleanup needed without timeout
            };

            // ✅ Registrar canal de respostas uma única vez por (kernel,eventType) e rotear por correlationId
            const responseKernel =
                this.determineTargetKernel(responseEventType);
            const responseKernelId =
                responseKernel === 'agent'
                    ? 'agent-execution'
                    : 'observability';

            const targetKernel =
                this.multiKernelManager?.getKernel(responseKernelId);

            if (!targetKernel) {
                const error = new Error(
                    `Response kernel not available: ${responseKernelId}`,
                );

                cleanup();
                reject(error);
                return;
            }

            const channelKey = `${responseKernelId}:${responseEventType}`;
            if (!this.registeredResponseChannels.has(channelKey)) {
                this.multiKernelManager!.registerHandler(
                    responseKernelId,
                    responseEventType as EventType,
                    (event: AnyEvent) => {
                        const eventCorrelationId =
                            event.metadata?.correlationId;
                        if (
                            eventCorrelationId &&
                            this.pendingResponses.has(eventCorrelationId)
                        ) {
                            const resolver =
                                this.pendingResponses.get(eventCorrelationId)!;
                            this.pendingResponses.delete(eventCorrelationId);

                            targetKernel.ackEvent(event.id).catch((error) => {
                                this.logger.warn(
                                    'Failed to ACK response event',
                                    { error, eventId: event.id },
                                );
                            });

                            if ((event.data as { error?: string })?.error) {
                                resolver.reject(
                                    new Error(
                                        (
                                            event.data as { error?: string }
                                        ).error!,
                                    ),
                                );
                            } else {
                                resolver.resolve(event.data as TResponse);
                            }
                        }
                    },
                );
                this.registeredResponseChannels.add(channelKey);
            }

            // Track pending resolver for this correlationId (cast to unknown to satisfy map type)
            this.pendingResponses.set(correlationId, {
                resolve: (value: unknown) => resolve(value as TResponse),
                reject: (error: Error) => reject(error),
            });

            // ✅ Emitir request via Kernel (ACK/NACK pelo Kernel/Runtime interno)
            console.log('🔍 [DEBUG] MULTI-KERNEL: About to emit event', {
                requestEventType,
                correlationId,
                timestamp: Date.now(),
                step: 'before-emit',
            });

            if (!kernel) {
                cleanup();
                this.pendingResponses.delete(correlationId);
                reject(new Error('Kernel is null'));
                return;
            }

            kernel
                .emitEventAsync(
                    requestEventType as EventType,
                    {
                        ...data,
                        timestamp: Date.now(),
                    } as EventPayloads[EventType],
                    {
                        correlationId,
                    },
                )
                .then(async (emitResult) => {
                    console.log(
                        '🔍 [DEBUG] MULTI-KERNEL: emitEventAsync completed',
                        {
                            requestEventType,
                            correlationId,
                            success: emitResult.success,
                            timestamp: Date.now(),
                            step: 'emit-completed',
                        },
                    );

                    if (!emitResult.success) {
                        cleanup();
                        this.pendingResponses.delete(correlationId);
                        const emitError =
                            emitResult.error ||
                            new Error('Failed to emit request');
                        this.logger.error(
                            '❌ MULTI-KERNEL EMIT FAILED',
                            emitError,
                            {
                                requestEventType,
                                correlationId,
                                trace: {
                                    source: 'multi-kernel-handler',
                                    step: 'emit-failed',
                                    timestamp: Date.now(),
                                },
                            },
                        );
                        reject(emitError);
                    } else {
                        console.log(
                            '🔍 [DEBUG] MULTI-KERNEL: About to call processEvents',
                            {
                                requestEventType,
                                correlationId,
                                timestamp: Date.now(),
                                step: 'before-processEvents',
                            },
                        );

                        try {
                            await this.processEvents();

                            console.log(
                                '🔍 [DEBUG] MULTI-KERNEL: processEvents completed',
                                {
                                    requestEventType,
                                    correlationId,
                                    timestamp: Date.now(),
                                    step: 'processEvents-completed',
                                },
                            );
                        } catch (processError) {
                            this.logger.error(
                                'Failed to process events after emit',
                                processError as Error,
                                {
                                    requestEventType,
                                    correlationId,
                                },
                            );
                        }
                    }
                })
                .catch((error) => {
                    cleanup();
                    this.pendingResponses.delete(correlationId);
                    this.logger.error(
                        '❌ MULTI-KERNEL REQUEST FAILED',
                        error as Error,
                        {
                            requestEventType,
                            correlationId,
                            trace: {
                                source: 'multi-kernel-handler',
                                step: 'request-failed',
                                timestamp: Date.now(),
                            },
                        },
                    );
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
        // ✅ ADD: Log detalhado para debug
        this.logger.debug('🎯 KERNEL ROUTING ANALYSIS', {
            eventType,
            startsWithObs: eventType.startsWith('obs.'),
            startsWithLog: eventType.startsWith('log.'),
            startsWithMetric: eventType.startsWith('metric.'),
            startsWithTrace: eventType.startsWith('trace.'),
            startsWithAlert: eventType.startsWith('alert.'),
            startsWithHealth: eventType.startsWith('health.'),
            includesLog: eventType.includes('.log.'),
            includesMetric: eventType.includes('.metric.'),
            includesTrace: eventType.includes('.trace.'),
            trace: {
                source: 'multi-kernel-handler',
                step: 'kernel-routing-analysis',
                timestamp: Date.now(),
            },
        });

        // ✅ ADD: Regra específica para eventos tool.execute.response
        if (eventType === 'tool.execute.response') {
            return 'agent';
        }

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

    // ──────────────────────────────────────────────────────────────────────────────
    // ✅ REFACTOR: ACK/NACK removido - agora é automático no Runtime
    // ──────────────────────────────────────────────────────────────────────────────
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
