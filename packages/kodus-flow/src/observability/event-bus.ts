/**
 * @module observability/event-bus
 * @description Event Bus centralizado para observabilidade
 *
 * Sistema central que:
 * - Processa TODOS os eventos do sistema
 * - Integra logging, timeline, telemetry e monitoring
 * - Correlação automática de eventos
 * - Performance otimizada
 * - Event-driven architecture total
 */

import { EventEmitter } from 'node:events';
import { CoreLogger, getGlobalLogger } from './core-logger.js';
import { getTimelineManager } from './execution-timeline.js';
import { getTelemetry } from './telemetry.js';
import { getLayeredMetricsSystem } from './monitoring.js';
import { getGlobalDebugSystem } from './debugging.js';
import {
    EVENT_TYPES,
    type EventType,
    type AnyEvent,
} from '../core/types/events.js';
import { IdGenerator } from '../utils/id-generator.js';

// ============================================================================
// 1️⃣ TIPOS PARA EVENT BUS
// ============================================================================

/**
 * Configuração do Event Bus
 */
export interface EventBusConfig {
    // Performance
    maxListeners: number;
    bufferSize: number;
    flushInterval: number;

    // Integração com componentes
    enableLogging: boolean;
    enableTimeline: boolean;
    enableTelemetry: boolean;
    enableMonitoring: boolean;
    enableDebugging: boolean;

    // Filtering
    eventFilters: string[];
    componentFilters: string[];

    // Error handling
    errorThreshold: number;
    errorHandler?: (error: Error, event: AnyEvent) => void;
}

/**
 * Contexto de processamento de evento
 */
export interface EventProcessingContext {
    correlationId: string;
    traceId: string;
    spanId: string;
    startTime: number;
    component: string;
    operation: string;
    metadata: Record<string, unknown>;
}

/**
 * Estatísticas do Event Bus
 */
export interface EventBusStats {
    totalEvents: number;
    eventsPerSecond: number;
    errorRate: number;
    avgProcessingTime: number;
    bufferUsage: number;
    activeListeners: number;
}

/**
 * Listener para eventos
 */
export type EventListener<T extends AnyEvent = AnyEvent> = (
    event: T,
    context: EventProcessingContext,
) => Promise<void> | void;

// ============================================================================
// 2️⃣ EVENT BUS PRINCIPAL
// ============================================================================

/**
 * Event Bus centralizado para observabilidade
 */
export class ObservabilityEventBus extends EventEmitter {
    private config: EventBusConfig;
    private logger: CoreLogger;
    private timelineManager = getTimelineManager();
    private telemetry = getTelemetry();
    private monitoring = getLayeredMetricsSystem();
    private debugging = getGlobalDebugSystem();

    // Performance tracking
    private eventBuffer: Array<{
        event: AnyEvent;
        context: EventProcessingContext;
    }> = [];
    private stats: EventBusStats = {
        totalEvents: 0,
        eventsPerSecond: 0,
        errorRate: 0,
        avgProcessingTime: 0,
        bufferUsage: 0,
        activeListeners: 0,
    };

    // Timers e intervals
    private flushTimer: NodeJS.Timeout | undefined;
    private statsTimer: NodeJS.Timeout | undefined;
    private recentProcessingTimes: number[] = [];
    private errorCount = 0;

    constructor(config: Partial<EventBusConfig> = {}) {
        super();

        this.config = {
            maxListeners: 100,
            bufferSize: 1000,
            flushInterval: 100,
            enableLogging: true,
            enableTimeline: true,
            enableTelemetry: true,
            enableMonitoring: true,
            enableDebugging: false,
            eventFilters: [],
            componentFilters: [],
            errorThreshold: 10,
            ...config,
        };

        this.logger = getGlobalLogger();
        this.setMaxListeners(this.config.maxListeners);

        this.setupInternalListeners();
        this.startPeriodicFlush();
        this.startStatsCollection();
    }

    // ========================================================================
    // 3️⃣ CORE EVENT PROCESSING
    // ========================================================================

    /**
     * Publica evento no bus
     */
    async publish(
        event: AnyEvent,
        component: string = 'unknown',
    ): Promise<void> {
        const startTime = Date.now();

        // Criar contexto de processamento
        const context: EventProcessingContext = {
            correlationId:
                event.metadata?.correlationId || IdGenerator.correlationId(),
            traceId: IdGenerator.traceId(),
            spanId: IdGenerator.spanId(),
            startTime,
            component,
            operation: 'publish',
            metadata: {
                eventId: event.id,
                eventType: event.type,
                threadId: event.threadId,
                ...event.metadata,
            },
        };

        // Aplicar filtros
        if (this.shouldFilterEvent(event, context)) {
            return;
        }

        // Adicionar ao buffer para processamento
        this.eventBuffer.push({ event, context });

        // Flush se buffer cheio
        if (this.eventBuffer.length >= this.config.bufferSize) {
            await this.flush();
        }

        // Emit para listeners síncronos
        this.emit('event', event, context);
        this.emit(event.type, event, context);

        // Atualizar estatísticas
        this.updateStats(startTime);
    }

    /**
     * Processa buffer de eventos
     */
    private async processEventBuffer(): Promise<void> {
        if (this.eventBuffer.length === 0) return;

        const batch = this.eventBuffer.splice(0, this.config.bufferSize);

        // Processar em paralelo com limite de concorrência
        const promises = batch.map(({ event, context }) =>
            this.processEvent(event, context),
        );

        try {
            await Promise.allSettled(promises);
        } catch (error) {
            this.logger.error('Error processing event batch', error as Error, {
                batchSize: batch.length,
                component: 'event-bus',
            });
        }
    }

    /**
     * Processa evento individual
     */
    private async processEvent(
        event: AnyEvent,
        context: EventProcessingContext,
    ): Promise<void> {
        const startTime = Date.now();

        try {
            // Set correlation ID para todos os componentes
            this.logger.setCorrelationId(context.correlationId);

            // Logging (sempre primeiro)
            if (this.config.enableLogging) {
                this.logger.logEvent(event, {
                    component: context.component,
                    operation: context.operation,
                    correlationId: context.correlationId,
                    traceId: context.traceId,
                    spanId: context.spanId,
                });
            }

            // Timeline tracking
            if (this.config.enableTimeline) {
                this.timelineManager.trackEvent(
                    context.correlationId,
                    event.type,
                    event.data,
                    {
                        duration: Date.now() - startTime,
                        metadata: context.metadata,
                    },
                );
            }

            // Telemetry
            if (this.config.enableTelemetry) {
                const span = this.telemetry.startSpan(`event.${event.type}`, {
                    attributes: {
                        eventType: event.type,
                        eventId: event.id,
                        correlationId: context.correlationId,
                        component: context.component,
                    },
                });

                span.end();
            }

            // Monitoring
            if (this.config.enableMonitoring && this.monitoring) {
                this.monitoring.recordRuntimeMetric(
                    'eventProcessing',
                    'totalEvents',
                    1,
                );
                this.monitoring.recordRuntimeMetric(
                    'eventProcessing',
                    'processedEvents',
                    1,
                );
            }

            // Debugging
            if (this.config.enableDebugging) {
                this.debugging.traceEvent(event, context.component);
            }
        } catch (error) {
            this.handleProcessingError(error as Error, event, context);
        } finally {
            this.logger.clearCorrelationId();
        }
    }

    // ========================================================================
    // 4️⃣ LISTENERS E SUBSCRIPTIONS
    // ========================================================================

    /**
     * Subscribe para tipo específico de evento
     */
    subscribe<T extends AnyEvent>(
        eventType: EventType,
        listener: EventListener<T>,
    ): void {
        this.on(eventType, listener);
        this.stats.activeListeners++;
    }

    /**
     * Subscribe para todos os eventos
     */
    subscribeAll(listener: EventListener): void {
        this.on('event', listener);
        this.stats.activeListeners++;
    }

    /**
     * Unsubscribe de evento
     */
    unsubscribe(eventType: EventType, listener: EventListener): void {
        this.off(eventType, listener);
        this.stats.activeListeners--;
    }

    /**
     * Subscribe uma vez apenas
     */
    subscribeOnce<T extends AnyEvent>(
        eventType: EventType,
        listener: EventListener<T>,
    ): void {
        this.once(eventType, listener);
    }

    // ========================================================================
    // 5️⃣ FILTERING E CONFIGURATION
    // ========================================================================

    /**
     * Verifica se evento deve ser filtrado
     */
    private shouldFilterEvent(
        event: AnyEvent,
        context: EventProcessingContext,
    ): boolean {
        // Filtro por tipo de evento
        if (this.config.eventFilters.length > 0) {
            if (!this.config.eventFilters.includes(event.type)) {
                return true;
            }
        }

        // Filtro por componente
        if (this.config.componentFilters.length > 0) {
            if (!this.config.componentFilters.includes(context.component)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Atualiza configuração
     */
    updateConfig(config: Partial<EventBusConfig>): void {
        this.config = { ...this.config, ...config };
        this.setMaxListeners(this.config.maxListeners);
    }

    // ========================================================================
    // 6️⃣ ERROR HANDLING
    // ========================================================================

    /**
     * Trata erro de processamento
     */
    private handleProcessingError(
        error: Error,
        event: AnyEvent,
        context: EventProcessingContext,
    ): void {
        this.errorCount++;

        this.logger.error('Event processing error', error, {
            eventType: event.type,
            eventId: event.id,
            correlationId: context.correlationId,
            component: context.component,
        });

        // Custom error handler
        if (this.config.errorHandler) {
            try {
                this.config.errorHandler(error, event);
            } catch (handlerError) {
                this.logger.error(
                    'Error in custom error handler',
                    handlerError as Error,
                );
            }
        }

        // Emit error event
        this.emit('error', error, event, context);

        // Check error threshold
        if (this.errorCount >= this.config.errorThreshold) {
            this.logger.warn('Event bus error threshold exceeded', {
                errorCount: this.errorCount,
                threshold: this.config.errorThreshold,
            });
        }
    }

    // ========================================================================
    // 7️⃣ STATISTICS E MONITORING
    // ========================================================================

    /**
     * Atualiza estatísticas
     */
    private updateStats(startTime: number): void {
        this.stats.totalEvents++;

        const processingTime = Date.now() - startTime;
        this.recentProcessingTimes.push(processingTime);

        // Manter apenas últimas 100 medições
        if (this.recentProcessingTimes.length > 100) {
            this.recentProcessingTimes.shift();
        }

        // Calcular média
        this.stats.avgProcessingTime =
            this.recentProcessingTimes.reduce((sum, time) => sum + time, 0) /
            this.recentProcessingTimes.length;

        // Buffer usage
        this.stats.bufferUsage =
            (this.eventBuffer.length / this.config.bufferSize) * 100;
    }

    /**
     * Obtém estatísticas
     */
    getStats(): EventBusStats {
        return { ...this.stats };
    }

    /**
     * Reset estatísticas
     */
    resetStats(): void {
        this.stats = {
            totalEvents: 0,
            eventsPerSecond: 0,
            errorRate: 0,
            avgProcessingTime: 0,
            bufferUsage: 0,
            activeListeners: this.listenerCount('event'),
        };
        this.recentProcessingTimes = [];
        this.errorCount = 0;
    }

    // ========================================================================
    // 8️⃣ PERIODIC TASKS
    // ========================================================================

    /**
     * Inicia flush periódico
     */
    private startPeriodicFlush(): void {
        this.flushTimer = setInterval(() => {
            this.flush().catch((error) => {
                this.logger.error('Error in periodic flush', error as Error);
            });
        }, this.config.flushInterval);
    }

    /**
     * Inicia coleta de estatísticas
     */
    private startStatsCollection(): void {
        let lastEventCount = 0;

        this.statsTimer = setInterval(() => {
            // Calcular events per second
            const currentEventCount = this.stats.totalEvents;
            this.stats.eventsPerSecond = currentEventCount - lastEventCount;
            lastEventCount = currentEventCount;

            // Calcular error rate
            this.stats.errorRate =
                this.stats.totalEvents > 0
                    ? (this.errorCount / this.stats.totalEvents) * 100
                    : 0;

            // Log estatísticas se necessário
            if (
                this.stats.totalEvents > 0 &&
                this.stats.totalEvents % 1000 === 0
            ) {
                this.logger.info('Event bus statistics', {
                    component: 'event-bus',
                    ...this.stats,
                });
            }
        }, 1000);
    }

    /**
     * Setup listeners internos
     */
    private setupInternalListeners(): void {
        // Listener para eventos de erro
        this.on(
            'error',
            (
                error: Error,
                event: AnyEvent,
                context: EventProcessingContext,
            ) => {
                this.logger.error('Event bus error', error, {
                    eventType: event.type,
                    eventId: event.id,
                    correlationId: context.correlationId,
                });
            },
        );

        // Listener para eventos do sistema
        this.on(
            EVENT_TYPES.SYSTEM_ERROR,
            (event: AnyEvent, context: EventProcessingContext) => {
                this.logger.error('System error event', undefined, {
                    eventType: event.type,
                    eventData: event.data,
                    correlationId: context.correlationId,
                });
            },
        );
    }

    // ========================================================================
    // 9️⃣ LIFECYCLE MANAGEMENT
    // ========================================================================

    /**
     * Flush buffer manualmente
     */
    async flush(): Promise<void> {
        await this.processEventBuffer();
    }

    /**
     * Shutdown graceful
     */
    async shutdown(): Promise<void> {
        this.logger.info('Shutting down event bus', {
            component: 'event-bus',
            pendingEvents: this.eventBuffer.length,
        });

        // Parar timers
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        if (this.statsTimer) {
            clearInterval(this.statsTimer);
        }

        // Processar eventos pendentes
        await this.flush();

        // Flush logger
        await this.logger.flush();

        // Remover todos os listeners
        this.removeAllListeners();

        this.logger.info('Event bus shutdown complete', {
            component: 'event-bus',
            finalStats: this.stats,
        });
    }

    /**
     * Health check
     */
    getHealthStatus(): {
        healthy: boolean;
        issues: string[];
        stats: EventBusStats;
    } {
        const issues: string[] = [];

        if (this.stats.bufferUsage > 90) {
            issues.push('Buffer usage high');
        }

        if (this.stats.errorRate > 5) {
            issues.push('Error rate high');
        }

        if (this.stats.avgProcessingTime > 1000) {
            issues.push('Average processing time high');
        }

        return {
            healthy: issues.length === 0,
            issues,
            stats: this.stats,
        };
    }
}

// ============================================================================
// 🔟 INSTÂNCIA GLOBAL
// ============================================================================

/**
 * Instância global do Event Bus
 */
let globalEventBus: ObservabilityEventBus | undefined;

/**
 * Obtém Event Bus global
 */
export function getGlobalEventBus(): ObservabilityEventBus {
    if (!globalEventBus) {
        globalEventBus = new ObservabilityEventBus();
    }
    return globalEventBus;
}

/**
 * Configura Event Bus global
 */
export function configureGlobalEventBus(config: Partial<EventBusConfig>): void {
    globalEventBus = new ObservabilityEventBus(config);
}

// ============================================================================
// 1️⃣1️⃣ HELPER FUNCTIONS
// ============================================================================

/**
 * Publica evento no bus global
 */
export async function publishEvent(
    event: AnyEvent,
    component?: string,
): Promise<void> {
    const eventBus = getGlobalEventBus();
    await eventBus.publish(event, component);
}

/**
 * Subscribe para evento no bus global
 */
export function subscribeToEvent<T extends AnyEvent>(
    eventType: EventType,
    listener: EventListener<T>,
): void {
    const eventBus = getGlobalEventBus();
    eventBus.subscribe(eventType, listener);
}

/**
 * Subscribe para todos os eventos no bus global
 */
export function subscribeToAllEvents(listener: EventListener): void {
    const eventBus = getGlobalEventBus();
    eventBus.subscribeAll(listener);
}

/**
 * Middleware para auto-publish de eventos
 */
export function createEventPublishMiddleware(component: string) {
    return function eventPublishMiddleware<T extends AnyEvent>(
        handler: (event: T) => Promise<unknown> | unknown,
    ) {
        return async function publishingHandler(event: T) {
            // Publish evento antes de processar
            await publishEvent(event, component);

            // Processar normalmente
            return await handler(event);
        };
    };
}

// ============================================================================
// 1️⃣2️⃣ INTEGRATION HELPERS
// ============================================================================

/**
 * Integra Event Bus com componente existente
 */
export function integrateWithEventBus<
    T extends { emit?: (event: AnyEvent) => void },
>(
    component: T,
    componentName: string,
): T & { publishEvent: (event: AnyEvent) => Promise<void> } {
    const eventBus = getGlobalEventBus();

    return {
        ...component,
        publishEvent: async (event: AnyEvent) => {
            await eventBus.publish(event, componentName);
        },
    };
}

/**
 * Adiciona funcionalidade de publish de eventos a um objeto
 */
export function addEventPublishing<T extends object>(
    target: T,
    componentName: string,
): T & { publishEvent: (event: AnyEvent) => Promise<void> } {
    return {
        ...target,
        publishEvent: async (event: AnyEvent): Promise<void> => {
            const eventBus = getGlobalEventBus();
            await eventBus.publish(event, componentName);
        },
    };
}
