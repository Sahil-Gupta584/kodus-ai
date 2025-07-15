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
    /** @deprecated Use process(true) instead */
    processWithAcks(): Promise<{
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
        ackTimeout = 30000,
        maxRetries = 3,
        tenantId,
        persistor,
        executionId,
        queueConfig = {},
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

    // Event Queue - Single unified queue with simplified configuration
    const eventQueue = new EventQueue(observability, {
        // Basic settings
        maxQueueDepth: queueSize,
        enableObservability,
        batchSize,
        enableAutoScaling: false, // ALWAYS disabled to prevent memory loops

        // Persistence (enabled by default with in-memory persistor)
        enablePersistence: !!persistor,
        persistor: runtimePersistor,
        executionId: runtimeExecutionId,
        persistCriticalEvents: true,
        criticalEventPrefixes: ['agent.', 'workflow.', 'kernel.'],

        // Retry settings (sensible defaults)
        enableRetry: true,
        maxRetries,
        baseRetryDelay: 1000,
        maxRetryDelay: 30000,
        enableJitter: true,

        // Override with any specific queue config provided
        ...queueConfig,
    });

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

    // ACK tracking para delivery guarantees
    const pendingAcks = new Map<
        string,
        { event: AnyEvent; timestamp: number; retries: number }
    >();

    // Cleanup de ACKs expirados
    const ackCleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [eventId, ackInfo] of pendingAcks.entries()) {
            if (now - ackInfo.timestamp > ackTimeout) {
                if (ackInfo.retries < maxRetries) {
                    // Re-enfileirar para retry
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
    }, 5000);

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
            const event = createEvent(eventType, data);
            const correlationId =
                options.correlationId || `corr_${Date.now()}_${Math.random()}`;

            try {
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

                const queued = await eventQueue.enqueue(
                    event,
                    options.priority || 0,
                );

                return {
                    success: queued,
                    eventId: event.id,
                    queued,
                    correlationId,
                };
            } catch (error) {
                if (enableObservability) {
                    observability.logger.error(
                        'Failed to enqueue event',
                        error as Error,
                        {
                            eventType,
                            data,
                            correlationId,
                        },
                    );
                }

                return {
                    success: false,
                    eventId: event.id,
                    queued: false,
                    error: error as Error,
                    correlationId,
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
                await eventQueue.processAll(async (event) => {
                    await eventProcessor.processEvent(event);
                });
                return;
            }

            // Modo com estatísticas
            let processed = 0;
            let acked = 0;
            let failed = 0;

            await eventQueue.processAll(async (event) => {
                try {
                    await eventProcessor.processEvent(event);
                    processed++;

                    // Auto-ACK se habilitado
                    if (enableAcks && event.metadata?.correlationId) {
                        await this.ack(event.id);
                        acked++;
                    }
                } catch (error) {
                    failed++;
                    if (enableAcks && event.metadata?.correlationId) {
                        await this.nack(event.id, error as Error);
                    }
                    throw error;
                }
            });

            return { processed, acked, failed };
        },

        /** @deprecated Use process(true) instead */
        async processWithAcks(): Promise<{
            processed: number;
            acked: number;
            failed: number;
        }> {
            return (await this.process(true)) as {
                processed: number;
                acked: number;
                failed: number;
            };
        },

        async ack(eventId: string): Promise<void> {
            const ackInfo = pendingAcks.get(eventId);
            if (ackInfo) {
                pendingAcks.delete(eventId);
                if (enableObservability) {
                    observability.logger.debug('Event acknowledged', {
                        eventId,
                    });
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
                        observability.logger.warn('Event nacked, retrying', {
                            eventId,
                            retries: ackInfo.retries,
                            error: error?.message,
                        });
                    }
                } else {
                    // Máximo de retries atingido
                    pendingAcks.delete(eventId);
                    if (enableObservability) {
                        observability.logger.error(
                            'Event max retries exceeded',
                            error,
                            { eventId },
                        );
                    }
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
        },
    };
}
