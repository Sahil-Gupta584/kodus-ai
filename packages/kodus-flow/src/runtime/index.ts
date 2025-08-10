/**
 * @module runtime/index
 * @description Runtime - Sistema de processamento de eventos e workflows
 *
 * API principal para processamento de eventos com:
 * - Registro de handlers
 * - Emissão de eventos
 * - Processamento em batch
 * - Stream processing
 * - Middleware configurável
 * - Observabilidade integrada
 * - Garantias de delivery
 * - Suporte multi-tenant
 */

// Core components
import { EventQueue } from './core/event-queue.js';
import { OptimizedEventProcessor } from './core/event-processor-optimized.js';
import { createPersistorFromConfig } from '../persistor/factory.js';
import { StreamManager } from './core/stream-manager.js';
import { MemoryMonitor } from './core/memory-monitor.js';
import { createEvent } from '../core/types/events.js';
import { createEventStore, type EventStore } from './core/event-store.js';

// Types imports
import type {
    AnyEvent,
    EventType,
    EventPayloads,
    Event,
} from '../core/types/events.js';
import type { EventHandler, EventStream } from '../core/types/common-types.js';
import type { Middleware } from './middleware/types.js';
import type { ObservabilitySystem } from '../observability/index.js';
import type { WorkflowContext } from '../core/types/workflow-types.js';
import type { MemoryMonitorConfig } from './core/memory-monitor.js';
// Enhanced queue config type (now part of EventQueueConfig)
import type { Persistor } from '../persistor/index.js';

export { EventQueue } from './core/event-queue.js';
export type { EventQueueConfig, QueueItem } from './core/event-queue.js';

export { EventStore, createEventStore } from './core/event-store.js';
export type { EventStoreConfig } from './core/event-store.js';

// Import for internal use
import type { EventQueueConfig } from './core/event-queue.js';

export { OptimizedEventProcessor } from './core/event-processor-optimized.js';
export type { OptimizedEventProcessorConfig } from './core/event-processor-optimized.js';

export { StreamManager } from './core/stream-manager.js';
export { MemoryMonitor } from './core/memory-monitor.js';
export type {
    MemoryMonitorConfig,
    MemoryMetrics,
    MemoryAlert,
    MemoryMonitorStats,
} from './core/memory-monitor.js';
export {
    workflowEvent,
    isEventType,
    isEventTypeGroup,
    extractEventData,
} from './core/event-factory.js';

// Middleware
export * from './middleware/index.js';
export type { Middleware } from './middleware/types.js';

// Constants
export {
    DEFAULT_TIMEOUT_MS,
    DEFAULT_RETRY_CONFIG,
    DEFAULT_CONCURRENCY_OPTIONS,
} from './constants.js';

/**
 * Configuração do Runtime - Simplificada
 */
export interface RuntimeConfig {
    // Core settings
    queueSize?: number; // Default: 1000
    batchSize?: number; // Default: 100
    enableObservability?: boolean; // Default: true

    // Event processing limits
    maxEventDepth?: number; // Default: 100
    maxEventChainLength?: number; // Default: 1000

    // Memory management
    cleanupInterval?: number; // Default: 2min
    staleThreshold?: number; // Default: 10min
    memoryMonitor?: MemoryMonitorConfig;

    // Middleware pipeline
    middleware?: Middleware[];

    // Delivery guarantees (simplified)
    enableAcks?: boolean; // Default: true (controls ACK/NACK system)
    ackTimeout?: number; // Default: 30s
    maxRetries?: number; // Default: 3

    // Multi-tenant support
    tenantId?: string;

    // Persistence (unified configuration)
    persistor?: Persistor;
    executionId?: string;

    // Queue configuration (direct access to EventQueue config)
    queueConfig?: Partial<EventQueueConfig>;

    // Event Store configuration
    enableEventStore?: boolean; // Default: false
    eventStoreConfig?: {
        persistorType?: 'memory' | 'mongodb' | 'redis' | 'temporal';
        persistorOptions?: Record<string, unknown>;
        replayBatchSize?: number;
        maxStoredEvents?: number;
    };
}

/**
 * Opções de emissão de eventos
 */
export interface EmitOptions {
    deliveryGuarantee?: 'at-most-once' | 'at-least-once' | 'exactly-once';
    priority?: number;
    timeout?: number;
    retryPolicy?: {
        maxRetries: number;
        backoff: 'linear' | 'exponential';
        initialDelay: number;
    };
    correlationId?: string;
    tenantId?: string;
}

/**
 * Resultado da emissão
 */
export interface EmitResult {
    success: boolean;
    eventId: string;
    queued: boolean;
    error?: Error;
    correlationId?: string;
}

/**
 * Runtime - Interface principal
 */
export interface Runtime {
    // Event handling
    on(eventType: EventType, handler: EventHandler<AnyEvent>): void;
    emit<T extends EventType>(
        eventType: T,
        data?: EventPayloads[T],
        options?: EmitOptions,
    ): EmitResult;
    emitAsync<T extends EventType>(
        eventType: T,
        data?: EventPayloads[T],
        options?: EmitOptions,
    ): Promise<EmitResult>;
    off(eventType: EventType, handler: EventHandler<AnyEvent>): void;

    // Processing
    process(withStats?: boolean): Promise<void | {
        processed: number;
        acked: number;
        failed: number;
    }>;

    // ACK/NACK para delivery guarantees
    ack(eventId: string): Promise<void>;
    nack(eventId: string, error?: Error): Promise<void>;

    // Event factory
    createEvent<T extends EventType>(
        type: T,
        data?: EventPayloads[T],
    ): Event<T>;

    // Stream processing
    createStream<S extends AnyEvent>(
        generator: () => AsyncGenerator<S>,
    ): EventStream<S>;

    // Multi-tenant
    forTenant(tenantId: string): Runtime;

    // Statistics
    getStats(): Record<string, unknown>;

    // Enhanced queue access (if available)
    getEnhancedQueue?(): EventQueue | null;
    reprocessFromDLQ?(eventId: string): Promise<boolean>;
    reprocessDLQByCriteria?(criteria: {
        maxAge?: number;
        limit?: number;
        eventType?: string;
    }): Promise<{ reprocessedCount: number; events: AnyEvent[] }>;

    // Event Store access
    getEventStore?(): EventStore | null;
    replayEvents?(
        fromTimestamp: number,
        options?: {
            toTimestamp?: number;
            onlyUnprocessed?: boolean;
            batchSize?: number;
        },
    ): AsyncGenerator<AnyEvent[]>;

    // Cleanup
    clear(): void;
    cleanup(): Promise<void>;
}

/**
 * Criar Runtime - API principal
 */
export function createRuntime(
    context: WorkflowContext,
    observability: ObservabilitySystem,
    config: RuntimeConfig = {},
): Runtime {
    const {
        queueSize = 1000,
        batchSize = 100,
        enableObservability = true,
        maxEventDepth = 100,
        maxEventChainLength = 1000,
        cleanupInterval = 2 * 60 * 1000,
        staleThreshold = 10 * 60 * 1000,
        middleware = [],
        memoryMonitor,
        enableAcks = true,
        ackTimeout = 60000, // ✅ UNIFIED: 60s same as tool timeout
        maxRetries = 1,
        tenantId,
        persistor,
        executionId,
        queueConfig = {},
        enableEventStore = false,
        eventStoreConfig = {},
    } = config;

    // Create persistor if not provided
    const runtimePersistor =
        persistor ||
        createPersistorFromConfig({
            type: 'memory',
            maxSnapshots: 1000,
            enableCompression: true,
            enableDeltaCompression: true,
            cleanupInterval: 300000,
            maxMemoryUsage: 100 * 1024 * 1024,
        });
    const runtimeExecutionId =
        executionId ||
        `runtime_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // Event Store - Optional for replay capability
    let eventStore: EventStore | undefined;
    if (enableEventStore) {
        eventStore = createEventStore(observability, {
            executionId: runtimeExecutionId,
            enableReplay: true,
            persistorType: eventStoreConfig.persistorType || 'memory',
            persistorOptions: eventStoreConfig.persistorOptions,
            replayBatchSize: eventStoreConfig.replayBatchSize || 100,
            maxStoredEvents: eventStoreConfig.maxStoredEvents || 10000,
            enableObservability,
        });
    }

    // Event Queue - Single unified queue with simplified configuration
    const eventQueue = new EventQueue(observability, {
        // Basic settings
        maxQueueDepth: queueSize,
        enableObservability,
        batchSize,
        enableAutoScaling: false, // ensure stable behavior for tests and prod
        enableGlobalConcurrency: true,
        maxProcessedEvents: 10000,

        // Persistence (enabled by default with in-memory persistor)
        enablePersistence: !!persistor,
        persistor: runtimePersistor,
        executionId: runtimeExecutionId,
        persistCriticalEvents: true,
        criticalEventPrefixes: ['agent.', 'workflow.', 'kernel.'],

        // Retry settings removed from EventQueue (handled externally if needed)

        // Event Store integration
        enableEventStore,
        eventStore,

        // Override with any specific queue config provided
        ...queueConfig,
    });

    // Note: Schema validation will be applied at emit level, not in EventProcessor middleware
    // This is because EventProcessor uses Middleware (handler transformer) pattern
    // while Schema validation uses MiddlewareFunction (context/next) pattern

    // Event Processor with middleware
    const eventProcessor = new OptimizedEventProcessor(context, observability, {
        maxEventDepth,
        maxEventChainLength,
        enableObservability,
        batchSize,
        cleanupInterval,
        staleThreshold,
        middleware,
    });

    // Stream Manager
    const streamManager = new StreamManager();

    // Memory Monitor
    const memoryMonitorInstance = new MemoryMonitor(
        observability,
        memoryMonitor,
    );
    // Start memory monitor unless explicitly disabled
    if (memoryMonitor?.enabled !== false) {
        memoryMonitorInstance.start();
    }

    // ACK tracking para delivery guarantees
    const pendingAcks = new Map<
        string,
        { event: AnyEvent; timestamp: number; retries: number }
    >();

    // Cleanup de ACKs expirados
    const ackSweepIntervalMs = Math.max(
        100,
        Math.min(5000, Math.floor(ackTimeout / 2)),
    );
    const ackCleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [eventId, ackInfo] of pendingAcks.entries()) {
            if (now - ackInfo.timestamp > ackTimeout) {
                // ✅ CORREÇÃO: Não re-enfileirar eventos de resposta ou eventos críticos que falharam
                const event = ackInfo.event;
                const isResponseEvent =
                    event.type.includes('.response') ||
                    event.type.includes('.error') ||
                    event.type.includes('.success');
                const isCriticalError = event.metadata?.criticalError === true;
                const isToolExecutionTimeout =
                    event.type === 'tool.execute.request' &&
                    event.metadata?.timedOut === true;

                if (
                    isResponseEvent ||
                    isCriticalError ||
                    isToolExecutionTimeout
                ) {
                    // Não re-enfileirar eventos de resposta ou erros críticos
                    pendingAcks.delete(eventId);
                    observability.logger.warn(
                        'Event not re-enqueued due to critical error or response type',
                        {
                            eventId,
                            eventType: event.type,
                            isResponseEvent,
                            isCriticalError,
                            isToolExecutionTimeout,
                        },
                    );
                    continue;
                }

                if (ackInfo.retries < maxRetries) {
                    // Re-enfileirar para retry apenas eventos não-críticos
                    ackInfo.retries++;
                    ackInfo.timestamp = now;
                    eventQueue.enqueue(ackInfo.event, 1).catch((error) => {
                        observability.logger.error(
                            'Failed to re-enqueue expired event',
                            error,
                            { eventId },
                        );
                    });
                } else {
                    // Máximo de retries atingido
                    pendingAcks.delete(eventId);
                    observability.logger.error(
                        'Event max retries exceeded',
                        new Error('Max retries exceeded'),
                        { eventId },
                    );
                }
            }
        }
    }, ackSweepIntervalMs);

    return {
        // Event handling
        on(eventType: EventType, handler: EventHandler<AnyEvent>) {
            // Registrar handler no OptimizedEventProcessor para aplicar middlewares
            eventProcessor.registerHandler(eventType, handler);
        },

        emit<T extends EventType>(
            eventType: T,
            data?: EventPayloads[T],
            options: EmitOptions = {},
        ): EmitResult {
            const event = createEvent(eventType, data);
            const correlationId =
                options.correlationId || `corr_${Date.now()}_${Math.random()}`;

            // Adicionar metadados de delivery
            if (enableAcks) {
                event.metadata = {
                    ...event.metadata,
                    correlationId,
                    tenantId: options.tenantId || tenantId,
                    timestamp: Date.now(),
                };

                // Track para ACK
                pendingAcks.set(event.id, {
                    event,
                    timestamp: Date.now(),
                    retries: 0,
                });
            }

            // Enfileirar de forma não-bloqueante
            eventQueue.enqueue(event, options.priority || 0).catch((error) => {
                if (enableObservability) {
                    observability.logger.error(
                        'Failed to enqueue event',
                        error,
                        {
                            eventType,
                            data,
                            correlationId,
                        },
                    );
                }
            });

            return {
                success: true,
                eventId: event.id,
                queued: true,
                correlationId,
            };
        },

        async emitAsync<T extends EventType>(
            eventType: T,
            data?: EventPayloads[T],
            options: EmitOptions = {},
        ): Promise<EmitResult> {
            const event = createEvent(eventType, data); // event.metadata might already have correlationId from 'data'

            // Determine the final correlationId, prioritizing options, then existing metadata, then new generation
            const finalCorrelationId =
                options.correlationId ||
                event.metadata?.correlationId || // Check if createEvent already put one from 'data'
                `corr_${Date.now()}_${Math.random()}`;

            try {
                // Adicionar metadados de delivery
                if (enableAcks) {
                    event.metadata = {
                        ...event.metadata, // Preserve existing metadata from createEvent
                        correlationId: finalCorrelationId, // Use the determined final correlationId
                        tenantId: options.tenantId || tenantId,
                        timestamp: Date.now(),
                    };

                    // Track para ACK
                    pendingAcks.set(event.id, {
                        event,
                        timestamp: Date.now(),
                        retries: 0,
                    });
                }

                const queued = await eventQueue.enqueue(
                    event,
                    options.priority || 0,
                );

                return {
                    success: queued,
                    eventId: event.id,
                    queued,
                    correlationId: finalCorrelationId,
                };
            } catch (error) {
                if (enableObservability) {
                    observability.logger.error(
                        'Failed to enqueue event',
                        error as Error,
                        {
                            eventType,
                            data,
                            correlationId: finalCorrelationId,
                        },
                    );
                }

                return {
                    success: false,
                    eventId: event.id,
                    queued: false,
                    error: error as Error,
                    correlationId: finalCorrelationId,
                };
            }
        },

        off(eventType: EventType, handler: EventHandler<AnyEvent>) {
            // LIMITATION: OptimizedEventProcessor não suporta remoção de handlers específicos
            // Por enquanto, apenas logamos um warning
            if (enableObservability) {
                observability.logger.warn(
                    'off() method limitation: cannot remove specific handler, use clearHandlers() instead',
                    { eventType, handlerName: handler.name || 'anonymous' },
                );
            }

            // Para remover TODOS os handlers, descomente a linha abaixo:
            // eventProcessor.clearHandlers();
        },

        async process(withStats: boolean = false): Promise<void | {
            processed: number;
            acked: number;
            failed: number;
        }> {
            if (!withStats) {
                // Modo simples - sem estatísticas
                observability.logger.info('⚡ RUNTIME PROCESSING EVENTS', {
                    mode: 'simple',
                    trace: {
                        source: 'runtime',
                        step: 'process-start',
                        timestamp: Date.now(),
                    },
                });

                await eventQueue.processAll(async (event) => {
                    observability.logger.debug(
                        '💬 RUNTIME - Processing event',
                        {
                            eventType: event.type,
                            eventId: event.id,
                            trace: {
                                source: 'runtime',
                                step: 'process-event',
                                timestamp: Date.now(),
                            },
                        },
                    );
                    await eventProcessor.processEvent(event);
                });

                observability.logger.info('✅ RUNTIME EVENTS PROCESSED', {
                    mode: 'simple',
                    trace: {
                        source: 'runtime',
                        step: 'process-complete',
                        timestamp: Date.now(),
                    },
                });
                return;
            }

            // Modo com estatísticas
            let processed = 0;
            let acked = 0;
            let failed = 0;

            observability.logger.info(
                '⚡ RUNTIME PROCESSING EVENTS WITH STATS',
                {
                    mode: 'with-stats',
                    trace: {
                        source: 'runtime',
                        step: 'process-with-stats-start',
                        timestamp: Date.now(),
                    },
                },
            );

            await eventQueue.processAll(async (event) => {
                try {
                    observability.logger.debug(
                        '💬 RUNTIME - Processing event with stats',
                        {
                            eventType: event.type,
                            eventId: event.id,
                            hasCorrelationId: !!event.metadata?.correlationId,
                            enableAcks,
                            trace: {
                                source: 'runtime',
                                step: 'process-event-with-stats',
                                timestamp: Date.now(),
                            },
                        },
                    );

                    await eventProcessor.processEvent(event);
                    processed++;

                    // Auto-ACK se habilitado
                    if (enableAcks && event.metadata?.correlationId) {
                        observability.logger.debug(
                            '✅ RUNTIME - Auto-ACK event',
                            {
                                eventType: event.type,
                                eventId: event.id,
                                correlationId: event.metadata.correlationId,
                                trace: {
                                    source: 'runtime',
                                    step: 'auto-ack',
                                    timestamp: Date.now(),
                                },
                            },
                        );
                        await this.ack(event.id);
                        acked++;
                    }
                } catch (error) {
                    failed++;
                    observability.logger.error(
                        '❌ RUNTIME - Event processing failed',
                        error as Error,
                        {
                            eventType: event.type,
                            eventId: event.id,
                            enableAcks,
                            trace: {
                                source: 'runtime',
                                step: 'process-event-error',
                                timestamp: Date.now(),
                            },
                        },
                    );

                    if (enableAcks && event.metadata?.correlationId) {
                        await this.nack(event.id, error as Error);
                    }
                    throw error;
                }
            });

            observability.logger.info(
                '✅ RUNTIME EVENTS PROCESSED WITH STATS',
                {
                    mode: 'with-stats',
                    processed,
                    acked,
                    failed,
                    trace: {
                        source: 'runtime',
                        step: 'process-with-stats-complete',
                        timestamp: Date.now(),
                    },
                },
            );

            return { processed, acked, failed };
        },

        async ack(eventId: string): Promise<void> {
            const ackInfo = pendingAcks.get(eventId);
            if (ackInfo) {
                pendingAcks.delete(eventId);
                // Mark event as processed in EventStore if available
                if (eventStore) {
                    try {
                        await eventStore.markEventsProcessed([eventId]);
                    } catch (err) {
                        if (enableObservability) {
                            observability.logger.error(
                                'Failed to mark event as processed in EventStore',
                                err as Error,
                                { eventId },
                            );
                        }
                    }
                }
                if (enableObservability) {
                    observability.logger.debug(
                        '✅ RUNTIME - Event acknowledged (ACK)',
                        {
                            eventId,
                            eventType: ackInfo.event.type,
                            retries: ackInfo.retries,
                            pendingAcksCount: pendingAcks.size,
                            trace: {
                                source: 'runtime',
                                step: 'ack-event',
                                timestamp: Date.now(),
                            },
                        },
                    );
                }
            } else {
                if (enableObservability) {
                    observability.logger.warn(
                        '⚠️ RUNTIME - ACK for unknown event',
                        {
                            eventId,
                            pendingAcksCount: pendingAcks.size,
                            trace: {
                                source: 'runtime',
                                step: 'ack-unknown-event',
                                timestamp: Date.now(),
                            },
                        },
                    );
                }
            }
        },

        async nack(eventId: string, error?: Error): Promise<void> {
            const ackInfo = pendingAcks.get(eventId);
            if (ackInfo) {
                if (ackInfo.retries < maxRetries) {
                    // Re-enfileirar para retry
                    ackInfo.retries++;
                    ackInfo.timestamp = Date.now();
                    await eventQueue.enqueue(ackInfo.event, 1);

                    if (enableObservability) {
                        observability.logger.warn(
                            '❌ RUNTIME - Event NACK, retrying',
                            {
                                eventId,
                                eventType: ackInfo.event.type,
                                retries: ackInfo.retries,
                                maxRetries,
                                error: error?.message,
                                pendingAcksCount: pendingAcks.size,
                                trace: {
                                    source: 'runtime',
                                    step: 'nack-retry',
                                    timestamp: Date.now(),
                                },
                            },
                        );
                    }
                } else {
                    // Máximo de retries atingido
                    pendingAcks.delete(eventId);
                    if (enableObservability) {
                        observability.logger.error(
                            '❌ RUNTIME - Event max retries exceeded',
                            error,
                            {
                                eventId,
                                eventType: ackInfo.event.type,
                                maxRetries,
                                pendingAcksCount: pendingAcks.size,
                                trace: {
                                    source: 'runtime',
                                    step: 'nack-max-retries',
                                    timestamp: Date.now(),
                                },
                            },
                        );
                    }
                }
            } else {
                if (enableObservability) {
                    observability.logger.warn(
                        '⚠️ RUNTIME - NACK for unknown event',
                        {
                            eventId,
                            error: error?.message,
                            pendingAcksCount: pendingAcks.size,
                            trace: {
                                source: 'runtime',
                                step: 'nack-unknown-event',
                                timestamp: Date.now(),
                            },
                        },
                    );
                }
            }
        },

        // Event factory
        createEvent<T extends EventType>(
            type: T,
            data?: EventPayloads[T],
        ): Event<T> {
            return createEvent(type, data);
        },

        // Stream processing
        createStream: (generator) => streamManager.createStream(generator),

        // Multi-tenant
        forTenant(tenantId: string): Runtime {
            // Evitar recursão infinita criando config isolado
            const tenantConfig: RuntimeConfig = {
                queueSize,
                batchSize,
                enableObservability,
                maxEventDepth,
                maxEventChainLength,
                cleanupInterval,
                staleThreshold,
                middleware,
                memoryMonitor,
                enableAcks,
                ackTimeout,
                maxRetries,
                tenantId, // Novo tenant ID
                // Criar novo persistor para isolamento
                persistor: undefined,
                executionId: `tenant_${tenantId}_${Date.now()}`,
            };

            return createRuntime(context, observability, tenantConfig);
        },

        // Statistics
        getStats: () => {
            return {
                queue: eventQueue.getStats(),
                processor: eventProcessor.getStats(),
                stream: streamManager.getStats(),
                memory: memoryMonitorInstance.getStats(),
                delivery: {
                    pendingAcks: pendingAcks.size,
                    enableAcks,
                    ackTimeout,
                    maxRetries,
                },
                runtime: {
                    executionId: runtimeExecutionId,
                    persistorType: runtimePersistor?.constructor.name || 'none',
                    tenantId: tenantId || 'default',
                },
            };
        },

        // Enhanced queue access (unified EventQueue now)
        getEnhancedQueue: () => {
            return eventQueue;
        },

        // Event Store access
        getEventStore: () => {
            return eventStore || null;
        },

        // Event replay functionality
        replayEvents: async function* (
            fromTimestamp: number,
            options?: {
                toTimestamp?: number;
                onlyUnprocessed?: boolean;
                batchSize?: number;
            },
        ) {
            yield* eventQueue.replayEvents(fromTimestamp, options);
        },

        // reprocessFromDLQ: async (eventId: string) => {
        //     // DLQ functionality will be implemented later
        //     return false;
        // },

        // reprocessDLQByCriteria: async (criteria: {
        //     maxAge?: number;
        //     limit?: number;
        //     eventType?: string;
        // }) => {
        //     // DLQ functionality will be implemented later
        //     return { reprocessedCount: 0, events: [] };
        // },

        // Cleanup
        clear: () => {
            eventQueue.clear();
            eventProcessor.clearHandlers();
            pendingAcks.clear();
        },

        cleanup: async () => {
            clearInterval(ackCleanupInterval);
            memoryMonitorInstance.stop();
            await Promise.all([
                eventProcessor.cleanup(),
                streamManager.cleanup(),
            ]);
            // Ensure queue resources are released
            eventQueue.destroy();
        },
    };
}
