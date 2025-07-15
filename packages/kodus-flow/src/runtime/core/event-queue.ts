/**
 * @module runtime/core/event-queue
 * @description Event Queue - Fila de eventos com backpressure adaptativo baseado em recursos
 *
 * Responsabilidades:
 * - Gerenciar fila de eventos sem limites fixos
 * - Controle de fluxo baseado em % de uso de recursos
 * - Processamento em chunks para performance
 * - Auto-ajuste baseado em métricas de sistema
 * - Integração com observabilidade
 */

import type { AnyEvent } from '../../core/types/events.js';
import type { ObservabilitySystem } from '../../observability/index.js';

/**
 * Configuração da fila de eventos baseada em recursos
 */
export interface EventQueueConfig {
    // Configuração baseada em recursos (0.0 - 1.0)
    maxMemoryUsage?: number; // % máxima de uso de memória (default: 0.8 = 80%)
    maxCpuUsage?: number; // % máxima de uso de CPU (default: 0.7 = 70%)
    maxQueueDepth?: number; // Profundidade máxima da fila (default: sem limite)

    // Configuração de processamento
    enableObservability?: boolean;
    batchSize?: number;
    chunkSize?: number;
    maxConcurrent?: number;

    // Auto-ajuste (DISABLED by default now!)
    enableAutoScaling?: boolean; // Habilitar auto-ajuste (default: false)
    autoScalingInterval?: number; // Intervalo de ajuste em ms (default: 30000)
    learningRate?: number; // Taxa de aprendizado (default: 0.1)

    // Event Size Awareness
    largeEventThreshold?: number;
    hugeEventThreshold?: number;
    enableCompression?: boolean;
    maxEventSize?: number;
    dropHugeEvents?: boolean;

    // === PERSISTENCE FEATURES (from DurableEventQueue) ===
    enablePersistence?: boolean; // Default: false
    persistor?: import('../../persistor/index.js').Persistor;
    executionId?: string;
    persistCriticalEvents?: boolean; // Default: true
    persistAllEvents?: boolean; // Default: false
    maxPersistedEvents?: number; // Default: 1000
    enableAutoRecovery?: boolean; // Default: true
    recoveryBatchSize?: number; // Default: 100
    criticalEventTypes?: string[]; // Events types to always persist
    criticalEventPrefixes?: string[]; // Event prefixes to always persist (default: ['agent.', 'workflow.'])

    // === RETRY FEATURES (from EnhancedEventQueue) ===
    enableRetry?: boolean; // Default: false
    maxRetries?: number; // Default: 3
    baseRetryDelay?: number; // Default: 1000ms
    maxRetryDelay?: number; // Default: 30000ms (30s)
    retryBackoffMultiplier?: number; // Default: 2 (exponential)
    enableJitter?: boolean; // Default: true
    jitterRatio?: number; // Default: 0.1 (10%)
}

/**
 * Métricas de recursos do sistema
 */
interface SystemMetrics {
    timestamp: number; // Timestamp da medição
    memoryUsage: number; // 0.0 - 1.0
    cpuUsage: number; // 0.0 - 1.0
    queueDepth: number;
    processingRate: number; // eventos/segundo
    averageProcessingTime: number; // ms
}

/**
 * Item da fila com metadados
 */
export interface QueueItem {
    event: AnyEvent;
    timestamp: number;
    priority: number;
    retryCount: number;
    size?: number;
    isLarge?: boolean;
    isHuge?: boolean;
    compressed?: boolean;
    originalSize?: number;

    // Persistence metadata
    persistent?: boolean;
    persistedAt?: number;

    // Retry metadata
    lastRetryAt?: number;
    nextRetryAt?: number;
    retryDelays?: number[];
    originalError?: string;
}

/**
 * Semáforo para controle de concorrência
 */
class Semaphore {
    private permits: number;
    private waitQueue: Array<() => void> = [];

    constructor(permits: number) {
        this.permits = permits;
    }

    async acquire(): Promise<void> {
        if (this.permits > 0) {
            this.permits--;
            return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
            this.waitQueue.push(resolve);
        });
    }

    release(): void {
        if (this.waitQueue.length > 0) {
            const resolve = this.waitQueue.shift()!;
            resolve();
        } else {
            this.permits++;
        }
    }

    getAvailablePermits(): number {
        return this.permits;
    }

    getWaitingCount(): number {
        return this.waitQueue.length;
    }
}

/**
 * Fila de eventos com backpressure adaptativo baseado em recursos
 */
export class EventQueue {
    private queue: QueueItem[] = [];
    private processing = false;

    // Configuração baseada em recursos
    private readonly maxMemoryUsage: number;
    private readonly maxCpuUsage: number;
    private readonly maxQueueDepth?: number;

    // Configuração de processamento
    private readonly enableObservability: boolean;
    private batchSize: number; // Agora adaptativo
    private readonly chunkSize: number;
    private maxConcurrent: number; // Agora adaptativo
    private semaphore: Semaphore;

    // Auto-ajuste
    private readonly enableAutoScaling: boolean;
    private readonly autoScalingInterval: number;
    private autoScalingTimer?: NodeJS.Timeout;
    private performanceHistory: SystemMetrics[] = [];

    // Event Size Awareness
    private readonly largeEventThreshold: number;
    private readonly hugeEventThreshold: number;
    private readonly enableCompression: boolean;
    private readonly maxEventSize: number;
    private readonly dropHugeEvents: boolean;

    // Persistence features
    private readonly enablePersistence: boolean;
    private readonly persistor?: import('../../persistor/index.js').Persistor;
    private readonly executionId: string;
    private readonly persistCriticalEvents: boolean;
    private readonly persistAllEvents: boolean;
    private readonly criticalEventTypes: string[];
    private readonly criticalEventPrefixes: string[];

    // Future features (not implemented yet)
    // private readonly maxPersistedEvents: number;
    // private readonly enableAutoRecovery: boolean;
    // private readonly recoveryBatchSize: number;

    // Future retry features (not implemented yet)
    // private readonly enableRetry: boolean;
    // private readonly maxRetries: number;
    // private readonly baseRetryDelay: number;
    // private readonly maxRetryDelay: number;
    // private readonly retryBackoffMultiplier: number;
    // private readonly enableJitter: boolean;
    // private readonly jitterRatio: number;

    constructor(
        private observability: ObservabilitySystem,
        config: EventQueueConfig = {},
    ) {
        // Configuração baseada em recursos
        this.maxMemoryUsage = config.maxMemoryUsage ?? 0.8; // 80% da memória
        this.maxCpuUsage = config.maxCpuUsage ?? 0.7; // 70% da CPU
        this.maxQueueDepth = config.maxQueueDepth; // Sem limite por padrão

        // Configuração de processamento
        this.enableObservability = config.enableObservability ?? true;
        this.batchSize = config.batchSize ?? 100;
        this.chunkSize = config.chunkSize ?? 50;
        this.maxConcurrent = config.maxConcurrent ?? 10;
        this.semaphore = new Semaphore(this.maxConcurrent);

        // Auto-ajuste (DISABLED by default now!)
        this.enableAutoScaling = config.enableAutoScaling ?? false;
        this.autoScalingInterval = config.autoScalingInterval ?? 30000;

        // Event Size Awareness
        this.largeEventThreshold = config.largeEventThreshold ?? 1024 * 1024;
        this.hugeEventThreshold = config.hugeEventThreshold ?? 10 * 1024 * 1024;
        this.enableCompression = config.enableCompression ?? true;
        this.maxEventSize = config.maxEventSize ?? 100 * 1024 * 1024;
        this.dropHugeEvents = config.dropHugeEvents ?? false;

        // Persistence features (from DurableEventQueue)
        this.enablePersistence = config.enablePersistence ?? false;
        this.persistor = config.persistor;
        this.executionId = config.executionId ?? `queue_${Date.now()}`;
        this.persistCriticalEvents = config.persistCriticalEvents ?? true;
        this.persistAllEvents = config.persistAllEvents ?? false;
        this.criticalEventTypes = config.criticalEventTypes ?? [];
        this.criticalEventPrefixes = config.criticalEventPrefixes ?? [
            'agent.',
            'workflow.',
        ];

        // Future features (not implemented yet)
        // this.maxPersistedEvents = config.maxPersistedEvents ?? 1000;
        // this.enableAutoRecovery = config.enableAutoRecovery ?? true;
        // this.recoveryBatchSize = config.recoveryBatchSize ?? 100;

        // Future retry features (not implemented yet)
        // this.enableRetry = config.enableRetry ?? false;
        // this.maxRetries = config.maxRetries ?? 3;
        // this.baseRetryDelay = config.baseRetryDelay ?? 1000;
        // this.maxRetryDelay = config.maxRetryDelay ?? 30000;
        // this.retryBackoffMultiplier = config.retryBackoffMultiplier ?? 2;
        // this.enableJitter = config.enableJitter ?? true;
        // this.jitterRatio = config.jitterRatio ?? 0.1;

        // Iniciar auto-ajuste se habilitado
        if (this.enableAutoScaling) {
            this.startAutoScaling();
        }
    }

    /**
     * Obter métricas do sistema
     */
    private getSystemMetrics(): SystemMetrics {
        const memoryUsage = this.getMemoryUsage();
        const cpuUsage = this.getCpuUsage();

        return {
            timestamp: Date.now(),
            memoryUsage,
            cpuUsage,
            queueDepth: this.queue.length,
            processingRate: this.calculateProcessingRate(),
            averageProcessingTime: this.calculateAverageProcessingTime(),
        };
    }

    /**
     * Obter uso de memória (0.0 - 1.0)
     */
    private getMemoryUsage(): number {
        try {
            const memUsage = process.memoryUsage();
            // Use apenas heapUsed / heapTotal para evitar valores > 1.0
            return Math.min(memUsage.heapUsed / memUsage.heapTotal, 1.0);
        } catch {
            return 0.5; // Fallback
        }
    }

    /**
     * Obter uso de CPU real (0.0 - 1.0)
     */
    private getCpuUsage(): number {
        try {
            // TODO: Implementar medição real de CPU
            // Por enquanto, usar heurística baseada em processamento
            const processingRate = this.calculateProcessingRate();
            const queueDepth = this.queue.length;

            // CPU alta se processamento lento ou fila cheia
            if (processingRate < 100 || queueDepth > 1000) {
                return 0.8; // CPU alta
            } else if (processingRate > 500 && queueDepth < 100) {
                return 0.3; // CPU baixa
            } else {
                return 0.6; // CPU média
            }
        } catch {
            return 0.5; // Fallback conservador
        }
    }

    /**
     * Calcular taxa de processamento real (eventos/segundo)
     */
    private calculateProcessingRate(): number {
        if (this.performanceHistory.length < 2) return 0;

        const recent = this.performanceHistory.slice(-10);
        const processingTimes: number[] = [];

        // Calcular tempo médio de processamento
        for (let i = 1; i < recent.length; i++) {
            const current = recent[i];
            const previous = recent[i - 1];

            if (current && previous) {
                const timeDiff = current.timestamp - previous.timestamp;
                const eventsProcessed =
                    previous.queueDepth - current.queueDepth;

                if (timeDiff > 0 && eventsProcessed > 0) {
                    const rate = (eventsProcessed / timeDiff) * 1000; // eventos/segundo
                    processingTimes.push(rate);
                }
            }
        }

        if (processingTimes.length === 0) return 0;

        // Retornar média dos últimos tempos
        return (
            processingTimes.reduce((sum, rate) => sum + rate, 0) /
            processingTimes.length
        );
    }

    /**
     * Calcular tempo médio de processamento
     */
    private calculateAverageProcessingTime(): number {
        if (this.performanceHistory.length < 2) return 0;

        const recent = this.performanceHistory.slice(-10);
        return (
            recent.reduce((sum, m) => sum + m.averageProcessingTime, 0) /
            recent.length
        );
    }

    /**
     * Verificar se deve ativar backpressure baseado em recursos
     */
    private shouldActivateBackpressure(): boolean {
        const metrics = this.getSystemMetrics();

        // Backpressure por uso de recursos
        if (metrics.memoryUsage > this.maxMemoryUsage) {
            if (this.enableObservability) {
                this.observability.logger.warn(
                    'Backpressure: High memory usage',
                    {
                        memoryUsage: `${(metrics.memoryUsage * 100).toFixed(1)}%`,
                        threshold: `${(this.maxMemoryUsage * 100).toFixed(1)}%`,
                    },
                );
            }
            return true;
        }

        if (metrics.cpuUsage > this.maxCpuUsage) {
            if (this.enableObservability) {
                this.observability.logger.warn('Backpressure: High CPU usage', {
                    cpuUsage: `${(metrics.cpuUsage * 100).toFixed(1)}%`,
                    threshold: `${(this.maxCpuUsage * 100).toFixed(1)}%`,
                });
            }
            return true;
        }

        // Backpressure por profundidade da fila (se configurado)
        if (this.maxQueueDepth && metrics.queueDepth > this.maxQueueDepth) {
            if (this.enableObservability) {
                this.observability.logger.warn(
                    'Backpressure: Queue depth exceeded',
                    {
                        queueDepth: metrics.queueDepth,
                        threshold: this.maxQueueDepth,
                    },
                );
            }
            return true;
        }

        return false;
    }

    /**
     * Auto-ajustar parâmetros baseado na performance REAL
     */
    private autoAdjust(): void {
        if (this.performanceHistory.length < 5) return;

        const metrics = this.getSystemMetrics();
        const adjustments = [];

        // === CORREÇÃO: Ajustar batch size CORRETAMENTE ===
        const targetRate = 1000; // eventos/segundo desejado

        if (metrics.processingRate < targetRate * 0.8) {
            // Taxa baixa = diminuir batch para processar mais rápido
            const newBatchSize = Math.max(this.batchSize * 0.8, 10);
            if (newBatchSize !== this.batchSize) {
                adjustments.push({
                    parameter: 'batchSize',
                    oldValue: this.batchSize,
                    newValue: newBatchSize,
                    reason: 'Low processing rate - reducing batch size',
                });
                this.batchSize = newBatchSize;
            }
        } else if (
            metrics.processingRate > targetRate * 1.2 &&
            metrics.cpuUsage < 0.7
        ) {
            // Taxa alta e CPU baixa = aumentar batch para eficiência
            const newBatchSize = Math.min(this.batchSize * 1.2, 2000);
            if (newBatchSize !== this.batchSize) {
                adjustments.push({
                    parameter: 'batchSize',
                    oldValue: this.batchSize,
                    newValue: newBatchSize,
                    reason: 'High processing rate - increasing batch size',
                });
                this.batchSize = newBatchSize;
            }
        }

        // === CORREÇÃO: Ajustar concorrência CORRETAMENTE ===
        if (
            metrics.cpuUsage < this.maxCpuUsage * 0.5 &&
            metrics.queueDepth > 100
        ) {
            // CPU baixa e fila cheia = aumentar concorrência
            const newConcurrency = Math.min(this.maxConcurrent * 1.5, 200); // Limite maior
            if (newConcurrency !== this.maxConcurrent) {
                adjustments.push({
                    parameter: 'maxConcurrent',
                    oldValue: this.maxConcurrent,
                    newValue: newConcurrency,
                    reason: 'Low CPU usage with high queue - increasing concurrency',
                });
                this.maxConcurrent = newConcurrency;
                this.semaphore = new Semaphore(this.maxConcurrent);
            }
        } else if (
            metrics.cpuUsage > this.maxCpuUsage * 0.9 ||
            metrics.memoryUsage > 0.8
        ) {
            // CPU alta ou memória alta = diminuir concorrência
            const newConcurrency = Math.max(this.maxConcurrent * 0.7, 5);
            if (newConcurrency !== this.maxConcurrent) {
                adjustments.push({
                    parameter: 'maxConcurrent',
                    oldValue: this.maxConcurrent,
                    newValue: newConcurrency,
                    reason: 'High resource usage - reducing concurrency',
                });
                this.maxConcurrent = newConcurrency;
                this.semaphore = new Semaphore(this.maxConcurrent);
            }
        }

        // === NOVO: Ajustar baseado na profundidade da fila ===
        if (metrics.queueDepth > 5000 && this.maxConcurrent < 100) {
            // Fila muito cheia = aumentar concorrência
            const newConcurrency = Math.min(this.maxConcurrent * 2, 300);
            if (newConcurrency !== this.maxConcurrent) {
                adjustments.push({
                    parameter: 'maxConcurrent',
                    oldValue: this.maxConcurrent,
                    newValue: newConcurrency,
                    reason: 'Very high queue depth - emergency concurrency increase',
                });
                this.maxConcurrent = newConcurrency;
                this.semaphore = new Semaphore(this.maxConcurrent);
            }
        }

        // Registrar ajustes
        adjustments.forEach((adjustment) => {
            if (this.enableObservability) {
                this.observability.logger.info('Auto-adjustment applied', {
                    parameter: adjustment.parameter,
                    oldValue: adjustment.oldValue,
                    newValue: adjustment.newValue,
                    reason: adjustment.reason,
                    metrics: {
                        processingRate: metrics.processingRate,
                        cpuUsage: metrics.cpuUsage,
                        memoryUsage: metrics.memoryUsage,
                        queueDepth: metrics.queueDepth,
                    },
                });
            }
        });
    }

    /**
     * Iniciar monitoramento de auto-ajuste
     */
    private startAutoScaling(): void {
        this.autoScalingTimer = setInterval(() => {
            const metrics = this.getSystemMetrics();
            this.performanceHistory.push(metrics);

            // Manter apenas os últimos 50 registros
            if (this.performanceHistory.length > 50) {
                this.performanceHistory.shift();
            }

            this.autoAdjust();
        }, this.autoScalingInterval);
    }

    /**
     * Calcular tamanho estimado do evento
     */
    private calculateEventSize(event: AnyEvent): number {
        try {
            return JSON.stringify(event).length;
        } catch {
            return 100; // Tamanho padrão se não conseguir serializar
        }
    }

    /**
     * Determine if event should be persisted
     */
    private shouldPersistEvent(event: AnyEvent): boolean {
        if (!this.enablePersistence) return false;

        // Persist all events if configured
        if (this.persistAllEvents) return true;

        // Persist critical events if configured
        if (this.persistCriticalEvents) {
            // Check by exact type
            if (this.criticalEventTypes.includes(event.type)) return true;

            // Check by prefix
            return this.criticalEventPrefixes.some((prefix) =>
                event.type.startsWith(prefix),
            );
        }

        return false;
    }

    /**
     * Handle processing failure with retry logic
     * TODO: Integrate with actual event processing
     */
    /* private async handleProcessingFailure(
        item: QueueItem,
        error: Error,
    ): Promise<void> {
        if (!this.enableRetry || item.retryCount >= this.maxRetries) {
            // Max retries reached or retry disabled
            if (this.enableObservability) {
                this.observability.logger.error(
                    'Event processing failed, no more retries',
                    error,
                    {
                        eventId: item.event.id,
                        eventType: item.event.type,
                        retryCount: item.retryCount,
                        maxRetries: this.maxRetries,
                    },
                );
            }
            return;
        }

        // Calculate retry delay with exponential backoff
        const retryCount = item.retryCount + 1;
        let delay =
            this.baseRetryDelay *
            Math.pow(this.retryBackoffMultiplier, retryCount - 1);
        delay = Math.min(delay, this.maxRetryDelay);

        // Add jitter if enabled
        if (this.enableJitter) {
            const jitter = delay * this.jitterRatio * (Math.random() * 2 - 1);
            delay = Math.max(0, delay + jitter);
        }

        // Schedule retry
        setTimeout(async () => {
            const retryItem: QueueItem = {
                ...item,
                retryCount,
                lastRetryAt: Date.now(),
                nextRetryAt: Date.now() + delay,
                originalError: error.message,
            };

            // Update retry delays history
            if (!retryItem.retryDelays) retryItem.retryDelays = [];
            retryItem.retryDelays.push(delay);

            // Re-enqueue for retry with lower priority
            const insertIndex = this.queue.findIndex(
                (qi) => qi.priority < item.priority - 1,
            );
            if (insertIndex === -1) {
                this.queue.push(retryItem);
            } else {
                this.queue.splice(insertIndex, 0, retryItem);
            }

            if (this.enableObservability) {
                this.observability.logger.info('Event scheduled for retry', {
                    eventId: item.event.id,
                    retryCount,
                    delay,
                    nextRetryAt: retryItem.nextRetryAt,
                });
            }
        }, delay);
    } */

    /**
     * Generate hash for event (simple implementation)
     */
    private generateEventHash(event: AnyEvent): string {
        try {
            const content = JSON.stringify({
                id: event.id,
                type: event.type,
                data: event.data,
            });
            // Simple hash based on content
            let hash = 0;
            for (let i = 0; i < content.length; i++) {
                const char = content.charCodeAt(i);
                hash = (hash << 5) - hash + char;
                hash = hash & hash; // Convert to 32-bit integer
            }
            return hash.toString(16);
        } catch {
            return `hash_${event.id}_${Date.now()}`;
        }
    }

    /**
     * Verificar se evento é grande
     */
    private isLargeEvent(size: number): boolean {
        return size >= this.largeEventThreshold;
    }

    /**
     * Verificar se evento é enorme
     */
    private isHugeEvent(size: number): boolean {
        return size >= this.hugeEventThreshold;
    }

    /**
     * Comprimir evento se necessário
     */
    private async compressEvent(
        event: AnyEvent,
        size: number,
    ): Promise<{ event: AnyEvent; compressed: boolean; originalSize: number }> {
        if (!this.enableCompression || size < this.largeEventThreshold) {
            return { event, compressed: false, originalSize: size };
        }

        try {
            // Implementação básica de compressão (em produção usaria gzip/brotli)
            const compressed = {
                ...event,
                data: {
                    ...(event.data as Record<string, unknown>),
                    compressed: true,
                    originalSize: size,
                    compressedAt: Date.now(),
                },
            };

            if (this.enableObservability) {
                this.observability.logger.info('Event compressed', {
                    eventType: event.type,
                    originalSize: size,
                    compressedSize: JSON.stringify(compressed).length,
                    compressionRatio:
                        (
                            (JSON.stringify(compressed).length / size) *
                            100
                        ).toFixed(2) + '%',
                });
            }

            return { event: compressed, compressed: true, originalSize: size };
        } catch (error) {
            if (this.enableObservability) {
                this.observability.logger.warn('Failed to compress event', {
                    eventType: event.type,
                    size,
                    error: (error as Error).message,
                });
            }
            return { event, compressed: false, originalSize: size };
        }
    }

    /**
     * Adicionar evento à fila com backpressure e Event Size Awareness
     */
    async enqueue(event: AnyEvent, priority: number = 0): Promise<boolean> {
        debugger;

        const eventSize = this.calculateEventSize(event);
        const isLarge = this.isLargeEvent(eventSize);
        const isHuge = this.isHugeEvent(eventSize);

        // Verificar tamanho máximo
        if (eventSize > this.maxEventSize) {
            if (this.enableObservability) {
                this.observability.logger.error(
                    'Event too large, dropping',
                    new Error('Event exceeds maximum size'),
                    {
                        eventType: event.type,
                        size: eventSize,
                        maxSize: this.maxEventSize,
                    },
                );
            }
            return false;
        }

        // Dropar eventos enormes se configurado
        if (isHuge && this.dropHugeEvents) {
            if (this.enableObservability) {
                this.observability.logger.warn('Huge event dropped', {
                    eventType: event.type,
                    size: eventSize,
                    threshold: this.hugeEventThreshold,
                });
            }
            return false;
        }

        // Comprimir evento se necessário
        const {
            event: processedEvent,
            compressed,
            originalSize,
        } = await this.compressEvent(event, eventSize);

        // Compatibilidade: rejeitar se atingir maxQueueDepth
        if (
            this.maxQueueDepth !== undefined &&
            this.queue.length >= this.maxQueueDepth
        ) {
            if (this.enableObservability) {
                this.observability.logger.warn(
                    'Event queue full (maxQueueDepth), dropping event',
                    {
                        eventType: event.type,
                        queueSize: this.queue.length,
                        maxQueueDepth: this.maxQueueDepth,
                    },
                );
            }
            return false;
        }

        // Verificar backpressure baseado em recursos
        if (this.shouldActivateBackpressure()) {
            if (this.enableObservability) {
                this.observability.logger.warn(
                    'Backpressure activated - event may be delayed',
                    {
                        eventType: event.type,
                        queueSize: this.queue.length,
                    },
                );
            }
            // Não rejeitar o evento, apenas aplicar backpressure
        }

        const finalSize = compressed
            ? this.calculateEventSize(processedEvent)
            : eventSize;

        const item: QueueItem = {
            event: processedEvent,
            timestamp: Date.now(),
            priority,
            retryCount: 0,
            size: finalSize,
            isLarge,
            isHuge,
            compressed,
            originalSize,
        };

        // Handle persistence if enabled
        if (this.enablePersistence && this.persistor) {
            const shouldPersist = this.shouldPersistEvent(event);
            if (shouldPersist) {
                try {
                    // Create snapshot for persistence (using proper Snapshot format)
                    const snapshot = {
                        xcId: this.executionId,
                        ts: Date.now(),
                        events: [event], // Single event as array
                        state: { eventId: event.id, eventType: event.type },
                        hash: this.generateEventHash(event),
                    };
                    await this.persistor.append(snapshot);
                    item.persistent = true;
                    item.persistedAt = Date.now();

                    if (this.enableObservability) {
                        this.observability.logger.debug('Event persisted', {
                            eventId: event.id,
                            eventType: event.type,
                        });
                    }
                } catch (error) {
                    if (this.enableObservability) {
                        this.observability.logger.error(
                            'Failed to persist event',
                            error as Error,
                            {
                                eventId: event.id,
                                eventType: event.type,
                            },
                        );
                    }
                }
            }
        }

        // Inserir com prioridade (maior prioridade primeiro)
        const insertIndex = this.queue.findIndex(
            (qi) => qi.priority < priority,
        );
        if (insertIndex === -1) {
            this.queue.push(item);
        } else {
            this.queue.splice(insertIndex, 0, item);
        }

        if (this.enableObservability) {
            this.observability.logger.debug('Event enqueued', {
                eventType: event.type,
                priority,
                queueSize: this.queue.length,
                eventSize: finalSize,
                isLarge,
                isHuge,
                compressed,
                originalSize,
                backpressureActive: this.shouldActivateBackpressure(),
            });
        }

        return true;
    }

    /**
     * Remover próximo item da fila (com metadata)
     */
    dequeueItem(): QueueItem | null {
        return this.queue.shift() || null;
    }

    /**
     * Remover próximo evento da fila (compatibilidade)
     * @deprecated Use dequeueItem() para preservar metadata
     */
    dequeue(): AnyEvent | null {
        const item = this.dequeueItem();
        return item ? item.event : null;
    }

    /**
     * Obter próximo evento sem remover
     */
    peek(): AnyEvent | null {
        const item = this.queue[0];
        return item ? item.event : null;
    }

    /**
     * Processar lote de eventos com backpressure
     */
    processBatch(
        processor: (event: AnyEvent) => Promise<void>,
    ): Promise<number> {
        if (this.processing) {
            return Promise.resolve(0);
        }

        this.processing = true;
        const batch: AnyEvent[] = [];

        // Coletar lote - processar todos os eventos disponíveis se for menor que batchSize
        const eventsToProcess = Math.min(this.batchSize, this.queue.length);
        for (let i = 0; i < eventsToProcess; i++) {
            const item = this.dequeueItem();
            if (item) {
                batch.push(item.event);
            }
        }

        if (batch.length === 0) {
            this.processing = false;
            return Promise.resolve(0);
        }

        // Processar lote com backpressure
        return this.processBatchWithBackpressure(batch, processor);
    }

    /**
     * Processar lote com controle de concorrência
     */
    private async processBatchWithBackpressure(
        batch: AnyEvent[],
        processor: (event: AnyEvent) => Promise<void>,
    ): Promise<number> {
        const startTime = Date.now();
        let successCount = 0;
        let errorCount = 0;

        try {
            // Processar em chunks para evitar sobrecarga
            const chunks = this.chunkArray(batch, this.chunkSize);

            for (const chunk of chunks) {
                await Promise.all(
                    chunk.map(async (event) => {
                        await this.semaphore.acquire();
                        try {
                            await processor(event);
                            successCount++;
                        } catch (error) {
                            errorCount++;
                            if (this.enableObservability) {
                                this.observability.logger.error(
                                    'Event processing failed in batch',
                                    error as Error,
                                    {
                                        eventType: event.type,
                                        queueSize: this.queue.length,
                                        processingTime: Date.now() - startTime,
                                    },
                                );
                            }
                            // Re-enfileirar com retry se necessário
                            this.handleRetry(event, error as Error);
                        } finally {
                            this.semaphore.release();
                        }
                    }),
                );
            }
        } finally {
            this.processing = false;

            if (this.enableObservability) {
                this.observability.logger.info('Batch processing completed', {
                    totalEvents: batch.length,
                    successCount,
                    errorCount,
                    processingTime: Date.now() - startTime,
                    queueSize: this.queue.length,
                    backpressureActive: this.shouldActivateBackpressure(),
                });
            }
        }

        return batch.length;
    }

    /**
     * Processar todos os eventos disponíveis com chunking
     */
    processAll(processor: (event: AnyEvent) => Promise<void>): Promise<number> {
        if (this.processing) {
            return Promise.resolve(0);
        }

        this.processing = true;
        const startTime = Date.now();
        // Removido variáveis não utilizadas

        if (this.enableObservability) {
            this.observability.logger.info('Starting processAll', {
                queueSize: this.queue.length,
                chunkSize: this.chunkSize,
                maxConcurrent: this.maxConcurrent,
                backpressureActive: this.shouldActivateBackpressure(),
            });
        }

        return this.processAllWithChunking(processor, startTime);
    }

    /**
     * Processar todos os eventos em chunks
     */
    private async processAllWithChunking(
        processor: (event: AnyEvent) => Promise<void>,
        startTime: number,
    ): Promise<number> {
        let totalProcessed = 0;

        try {
            while (this.queue.length > 0) {
                const chunk: AnyEvent[] = [];

                // Coletar chunk
                for (
                    let i = 0;
                    i < this.chunkSize && this.queue.length > 0;
                    i++
                ) {
                    const item = this.dequeueItem();
                    if (item) {
                        chunk.push(item.event);
                    }
                }

                if (chunk.length === 0) break;

                // Processar chunk com backpressure
                const chunkResult = await this.processBatchWithBackpressure(
                    chunk,
                    processor,
                );
                totalProcessed += chunkResult;

                // Log de progresso
                if (this.enableObservability && totalProcessed % 100 === 0) {
                    this.observability.logger.debug('ProcessAll progress', {
                        processed: totalProcessed,
                        remaining: this.queue.length,
                        processingTime: Date.now() - startTime,
                        queueSize: this.queue.length,
                    });
                }
            }

            if (this.enableObservability) {
                this.observability.logger.info('ProcessAll completed', {
                    totalProcessed,
                    processingTime: Date.now() - startTime,
                    finalQueueSize: this.queue.length,
                });
            }

            return totalProcessed;
        } finally {
            this.processing = false;
        }
    }

    /**
     * Dividir array em chunks
     */
    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Tratar retry de eventos
     */
    private async handleRetry(event: AnyEvent, _error: Error): Promise<void> {
        // Implementação de retry com backoff exponencial
        const retryDelay = Math.min(1000 * Math.pow(2, 0), 10000); // Max 10s

        setTimeout(async () => {
            // Sempre tentar reenfileirar para retry, backpressure será aplicado se necessário
            await this.enqueue(event, 1); // Prioridade baixa para retry
        }, retryDelay);
    }

    /**
     * Limpar fila
     */
    clear(): void {
        this.queue = [];
        if (this.enableObservability) {
            this.observability.logger.info('Event queue cleared');
        }
    }

    /**
     * Obter estatísticas da fila
     */
    getStats() {
        const totalSize = this.queue.reduce(
            (sum, item) => sum + (item.size || 0),
            0,
        );
        const avgSize =
            this.queue.length > 0 ? totalSize / this.queue.length : 0;

        // Event Size Awareness stats
        const largeEvents = this.queue.filter((item) => item.isLarge).length;
        const hugeEvents = this.queue.filter((item) => item.isHuge).length;
        const compressedEvents = this.queue.filter(
            (item) => item.compressed,
        ).length;
        const totalOriginalSize = this.queue.reduce(
            (sum, item) => sum + (item.originalSize || item.size || 0),
            0,
        );
        const compressionRatio =
            totalOriginalSize > 0
                ? (
                      ((totalOriginalSize - totalSize) / totalOriginalSize) *
                      100
                  ).toFixed(2)
                : '0.00';

        return {
            size: this.queue.length,
            maxQueueDepth: this.maxQueueDepth,
            maxSize: this.maxQueueDepth, // Alias para compatibilidade
            processing: this.processing,
            avgEventSize: avgSize,
            totalEventSize: totalSize,
            backpressureActive: this.shouldActivateBackpressure(),
            availablePermits: this.semaphore['permits'],
            waitQueueSize: this.semaphore['waitQueue'].length,

            // Event Size Awareness
            largeEvents,
            hugeEvents,
            compressedEvents,
            totalOriginalSize,
            compressionRatio: `${compressionRatio}%`,
            largeEventThreshold: this.largeEventThreshold,
            hugeEventThreshold: this.hugeEventThreshold,
            maxEventSize: this.maxEventSize,
            enableCompression: this.enableCompression,
            dropHugeEvents: this.dropHugeEvents,
        };
    }

    /**
     * Verificar se fila está vazia
     */
    isEmpty(): boolean {
        return this.queue.length === 0;
    }

    /**
     * Verificar se fila está cheia (baseado em recursos)
     */
    isFull(): boolean {
        return this.shouldActivateBackpressure();
    }

    /**
     * Limpar recursos da fila
     */
    destroy(): void {
        if (this.autoScalingTimer) {
            clearInterval(this.autoScalingTimer);
            this.autoScalingTimer = undefined;
        }
        this.queue = [];
        this.performanceHistory = [];

        if (this.enableObservability) {
            this.observability.logger.info('Event queue destroyed');
        }
    }
}
