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

import * as os from 'os';
import type { AnyEvent } from '../../core/types/events.js';
import type { ObservabilitySystem } from '../../observability/index.js';
import type { EventStore } from './event-store.js';

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

    // === EVENT STORE INTEGRATION ===
    enableEventStore?: boolean; // Default: false
    eventStore?: EventStore; // Event store instance

    // Global concurrency control (used when integrated via Runtime)
    enableGlobalConcurrency?: boolean; // Default: false

    // Processed events cache size (for dedup)
    maxProcessedEvents?: number; // Default: 10000
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

    // ✅ DEDUPLICATION: Track processed events to prevent duplicates
    private processedEvents = new Set<string>();
    private readonly maxProcessedEvents: number; // Prevent memory leaks

    // Configuração baseada em recursos
    private readonly maxMemoryUsage: number;
    private readonly maxCpuUsage: number;
    private readonly maxQueueDepth?: number;

    // Configuração de processamento
    private readonly enableObservability: boolean;
    private batchSize: number; // Agora adaptativo
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

    // CPU tracking for real measurement
    private lastCpuInfo?: { idle: number; total: number; timestamp: number };
    private lastCpuUsage?: number;
    private lastBackpressureActive: boolean = false;

    // Event Store integration
    private readonly enableEventStore: boolean;
    private readonly eventStore?: EventStore;
    private readonly useGlobalConcurrency: boolean;

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
        this.maxCpuUsage = config.maxCpuUsage ?? 0.85; // 85% da CPU (aumentado para evitar falsos positivos)
        this.maxQueueDepth = config.maxQueueDepth; // Sem limite por padrão

        // Configuração de processamento
        this.enableObservability = config.enableObservability ?? true;
        this.batchSize = config.batchSize ?? 20; // Reduzido de 100 para 20
        this.maxConcurrent = config.maxConcurrent ?? 25; // Aumentado de 10 para 25
        this.semaphore = new Semaphore(this.maxConcurrent);

        // Auto-ajuste (ENABLED by default for better performance!)
        this.enableAutoScaling = config.enableAutoScaling ?? false;
        this.autoScalingInterval = config.autoScalingInterval ?? 10000; // Reduzido de 30s para 10s

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

        // Event Store integration
        this.enableEventStore = config.enableEventStore ?? false;
        this.eventStore = config.eventStore;

        // Global concurrency (semaphore) only when explicitly enabled (Runtime integration)
        this.useGlobalConcurrency = config.enableGlobalConcurrency ?? false;

        // Processed events capacity
        this.maxProcessedEvents = config.maxProcessedEvents ?? 10000;

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

        // Adicionar limpeza automática no caso de garbage collection
        // Isso ajuda a prevenir vazamentos se destroy() não for chamado
        if (typeof FinalizationRegistry !== 'undefined') {
            const registry = new FinalizationRegistry(
                (timer: NodeJS.Timeout) => {
                    clearInterval(timer);
                },
            );

            if (this.autoScalingTimer) {
                registry.register(this, this.autoScalingTimer);
            }
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
            const totalMemory = os.totalmem();

            // Use RSS (Resident Set Size) dividido pela memória total do sistema
            // Isso dá uma medida real do uso de memória do processo
            return Math.min(memUsage.rss / totalMemory, 1.0);
        } catch {
            return 0.5; // Fallback
        }
    }

    /**
     * Obter uso de CPU real (0.0 - 1.0)
     */
    private getCpuUsage(): number {
        try {
            const cpus = os.cpus();
            if (!cpus || cpus.length === 0) {
                return 0.5; // Fallback if no CPU info
            }

            // Calculate average CPU usage across all cores
            let totalIdle = 0;
            let totalTick = 0;

            for (const cpu of cpus) {
                const times = cpu.times;
                totalIdle += times.idle;
                totalTick +=
                    times.user +
                    times.nice +
                    times.sys +
                    times.idle +
                    times.irq;
            }

            // Store previous values for delta calculation
            if (!this.lastCpuInfo) {
                this.lastCpuInfo = {
                    idle: totalIdle,
                    total: totalTick,
                    timestamp: Date.now(),
                };
                return 0.5; // First measurement, return average
            }

            // Calculate delta
            const deltaIdle = totalIdle - this.lastCpuInfo.idle;
            const deltaTotal = totalTick - this.lastCpuInfo.total;
            const deltaTime = Date.now() - this.lastCpuInfo.timestamp;

            // Update stored values
            this.lastCpuInfo = {
                idle: totalIdle,
                total: totalTick,
                timestamp: Date.now(),
            };

            // If not enough time passed, use previous value
            if (deltaTime < 100 || deltaTotal === 0) {
                return this.lastCpuUsage || 0.5;
            }

            // Calculate usage (1 - idle percentage)
            const usage = 1 - deltaIdle / deltaTotal;
            this.lastCpuUsage = Math.max(0, Math.min(1, usage));

            return this.lastCpuUsage;
        } catch (error) {
            if (this.enableObservability) {
                this.observability.logger.debug('Failed to get CPU usage', {
                    error,
                });
            }
            return this.lastCpuUsage || 0.5; // Use last known value or fallback
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
        const isActive =
            metrics.memoryUsage > this.maxMemoryUsage ||
            metrics.cpuUsage > this.maxCpuUsage ||
            (this.maxQueueDepth !== undefined
                ? metrics.queueDepth >= this.maxQueueDepth
                : false);

        // Cache state for lightweight stats reads
        this.lastBackpressureActive = isActive;

        if (this.enableObservability && isActive) {
            this.observability.logger.warn('⚠️ BACKPRESSURE ACTIVATED', {
                queueSize: this.queue.length,
                memoryUsage: `${(metrics.memoryUsage * 100).toFixed(1)}%`,
                cpuUsage: `${(metrics.cpuUsage * 100).toFixed(1)}%`,
                queueDepth: metrics.queueDepth,
                memoryThreshold: `${(this.maxMemoryUsage * 100).toFixed(1)}%`,
                cpuThreshold: `${(this.maxCpuUsage * 100).toFixed(1)}%`,
                queueThreshold: this.maxQueueDepth,
                processedEventsCount: this.processedEvents.size,
                trace: {
                    source: 'event-queue',
                    step: 'backpressure-activated',
                    timestamp: Date.now(),
                },
            });
        }

        return isActive;
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
        // Limpar timer existente primeiro para evitar vazamentos
        this.stopAutoScaling();

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
     * Parar monitoramento de auto-ajuste
     */
    private stopAutoScaling(): void {
        if (this.autoScalingTimer) {
            clearInterval(this.autoScalingTimer);
            this.autoScalingTimer = undefined;
        }
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
            // Non-intrusive: marcar compressão em metadata em vez de mutar data
            const compressed = { ...event } as AnyEvent & {
                metadata: Record<string, unknown> | undefined;
            };
            compressed.metadata = {
                ...(event.metadata || {}),
                compressed: true,
                originalSize: size,
                compressedAt: Date.now(),
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
        // Initial enqueue debug (reduced noise): rely on success log below

        // ✅ ADD: Log detalhado para detectar duplicação
        const isAlreadyProcessed = this.processedEvents.has(event.id);
        const isAlreadyInQueue = this.queue.some(
            (item) => item.event.id === event.id,
        );

        if (isAlreadyProcessed || isAlreadyInQueue) {
            if (this.enableObservability) {
                this.observability.logger.warn('🔄 DUAL EVENT', {
                    eventId: event.id,
                    eventType: event.type,
                    correlationId: event.metadata?.correlationId,
                    isAlreadyProcessed,
                    isAlreadyInQueue,
                    processedEventsCount: this.processedEvents.size,
                    queueSize: this.queue.length,
                });
            }
        }

        // Check if event is already processed (deduplication)
        if (isAlreadyProcessed) {
            if (this.enableObservability) {
                this.observability.logger.warn(
                    '🔄 EVENT ALREADY PROCESSED - SKIPPING',
                    {
                        eventId: event.id,
                        eventType: event.type,
                        processedEventsCount: this.processedEvents.size,
                    },
                );
            }
            return false;
        }

        // Check if event is already in queue (deduplication)
        if (isAlreadyInQueue) {
            if (this.enableObservability) {
                this.observability.logger.warn(
                    '🔄 EVENT ALREADY IN QUEUE - SKIPPING',
                    {
                        eventId: event.id,
                        eventType: event.type,
                        queueSize: this.queue.length,
                    },
                );
            }
            return false;
        }

        // Calculate event size
        const eventSize = this.calculateEventSize(event);
        const isLarge = this.isLargeEvent(eventSize);
        const isHuge = this.isHugeEvent(eventSize);

        // Verbose sizing log removed to reduce noise

        // Drop huge events if configured
        if (isHuge && this.dropHugeEvents) {
            if (this.enableObservability) {
                this.observability.logger.warn('🚫 HUGE EVENT DROPPED', {
                    eventId: event.id,
                    eventType: event.type,
                    eventSize,
                    hugeEventThreshold: this.hugeEventThreshold,
                    dropHugeEvents: this.dropHugeEvents,
                });
            }
            return false;
        }

        // Check queue depth limits
        if (
            this.maxQueueDepth !== undefined &&
            this.queue.length >= this.maxQueueDepth
        ) {
            if (this.enableObservability) {
                this.observability.logger.warn(
                    '🚫 QUEUE FULL - EVENT DROPPED',
                    {
                        eventId: event.id,
                        eventType: event.type,
                        queueSize: this.queue.length,
                        maxQueueDepth: this.maxQueueDepth,
                    },
                );
            }
            return false;
        }

        // Check resource limits
        if (this.shouldActivateBackpressure()) {
            // Backpressure already logged when activated; do not duplicate here
        }

        // Compress event if needed
        let compressedEvent = event;
        let compressed = false;
        let originalSize = eventSize;

        if (this.enableCompression && isLarge) {
            const compressionResult = await this.compressEvent(
                event,
                eventSize,
            );
            compressedEvent = compressionResult.event;
            compressed = compressionResult.compressed;
            originalSize = compressionResult.originalSize;

            // Compression details are logged by compressEvent(); skip duplicate log
        }

        // Create queue item
        const queueItem: QueueItem = {
            event: compressedEvent,
            timestamp: Date.now(),
            priority,
            retryCount: 0,
            size: this.calculateEventSize(compressedEvent),
            isLarge,
            isHuge,
            compressed,
            originalSize,
        };

        // Persist event if needed
        if (this.enablePersistence && this.persistor) {
            const shouldPersist = this.shouldPersistEvent(event);
            if (shouldPersist) {
                try {
                    // Create snapshot for persistence
                    const snapshot = {
                        xcId: this.executionId,
                        ts: Date.now(),
                        events: [event],
                        state: { eventId: event.id, eventType: event.type },
                        hash: this.generateEventHash(event),
                    };
                    await this.persistor.append(snapshot);
                    queueItem.persistent = true;
                    queueItem.persistedAt = Date.now();

                    if (this.enableObservability) {
                        this.observability.logger.info('💾 EVENT PERSISTED', {
                            eventId: event.id,
                            eventType: event.type,
                            persistent: true,
                            persistedAt: queueItem.persistedAt,
                        });
                    }
                } catch (error) {
                    if (this.enableObservability) {
                        this.observability.logger.error(
                            '❌ EVENT PERSISTENCE FAILED',
                            error as Error,
                            {
                                eventId: event.id,
                                eventType: event.type,
                            },
                        );
                    }
                }
            } else {
                if (this.enableObservability) {
                    this.observability.logger.debug(
                        '💾 EVENT NOT PERSISTED (not critical)',
                        {
                            eventId: event.id,
                            eventType: event.type,
                            shouldPersist,
                            persistCriticalEvents: this.persistCriticalEvents,
                            criticalEventTypes: this.criticalEventTypes,
                            criticalEventPrefixes: this.criticalEventPrefixes,
                        },
                    );
                }
            }
        }

        // Add to queue with priority
        // Inserir com prioridade (maior prioridade primeiro)
        const insertIndex = this.queue.findIndex(
            (qi) => qi.priority < priority,
        );
        if (insertIndex === -1) {
            this.queue.push(queueItem);
        } else {
            this.queue.splice(insertIndex, 0, queueItem);
        }

        // Success enqueue is logged via observability below

        if (this.enableObservability) {
            this.observability.logger.info('✅ EVENT ENQUEUED SUCCESSFULLY', {
                eventId: event.id,
                eventType: event.type,
                priority,
                newQueueSize: this.queue.length,
                processedEventsCount: this.processedEvents.size,
                correlationId: event.metadata?.correlationId,
                compressed,
                persistent: queueItem.persistent,
                insertIndex: insertIndex === -1 ? 'end' : insertIndex,
                trace: {
                    source: 'event-queue',
                    step: 'event-enqueued',
                    timestamp: Date.now(),
                },
            });
        }

        // Store in Event Store if enabled
        if (this.enableEventStore && this.eventStore) {
            try {
                await this.eventStore.appendEvents([event]);
                if (this.enableObservability) {
                    this.observability.logger.info('📚 EVENT STORED', {
                        eventId: event.id,
                        eventType: event.type,
                    });
                }
            } catch (error) {
                if (this.enableObservability) {
                    this.observability.logger.error(
                        '❌ EVENT STORE FAILED',
                        error as Error,
                        {
                            eventId: event.id,
                            eventType: event.type,
                        },
                    );
                }
            }
        }

        // Start auto-scaling if enabled
        if (this.enableAutoScaling && !this.autoScalingTimer) {
            this.startAutoScaling();
        }

        return true;
    }

    /**
     * Remover próximo item da fila (com metadata)
     */
    private dequeueItem(): QueueItem | undefined {
        const item = this.queue.shift();

        if (item && this.enableObservability) {
            this.observability.logger.debug('📤 EVENT DEQUEUED', {
                eventId: item.event.id,
                eventType: item.event.type,
                correlationId: item.event.metadata?.correlationId,
                priority: item.priority,
                remainingInQueue: this.queue.length,
                processedEventsCount: this.processedEvents.size,
                trace: {
                    source: 'event-queue',
                    step: 'event-dequeued',
                    timestamp: Date.now(),
                },
            });
        }

        return item;
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
    async processBatch(
        processor: (event: AnyEvent) => Promise<void>,
    ): Promise<number> {
        if (this.processing) {
            return 0;
        }

        this.processing = true;
        const batch: AnyEvent[] = [];

        // Coletar lote - processar todos os eventos disponíveis se for menor que batchSize
        const eventsToProcess = Math.min(
            this.batchSize || 10,
            this.queue.length,
        );
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
        try {
            const count = await this.processBatchWithBackpressure(
                batch,
                processor,
            );
            return count;
        } finally {
            this.processing = false;
        }
    }

    /**
     * Processar lote com controle de concorrência
     */
    private async processBatchWithBackpressure(
        batch: AnyEvent[],
        processor: (event: AnyEvent) => Promise<void>,
    ): Promise<number> {
        let successCount = 0;
        let errorCount = 0;

        // Logged via observability right below

        if (this.enableObservability) {
            this.observability.logger.info(
                '🔧 PROCESSING BATCH WITH BACKPRESSURE',
                {
                    batchSize: batch.length,
                    backpressureActive: this.shouldActivateBackpressure(),
                    trace: {
                        source: 'event-queue',
                        step: 'process-batch-with-backpressure-start',
                        timestamp: Date.now(),
                    },
                },
            );
        }

        // Processar eventos em chunks para evitar bloqueio
        const chunkSize = this.shouldActivateBackpressure()
            ? 1
            : Math.min(5, batch.length);

        for (let i = 0; i < batch.length; i += chunkSize) {
            const chunk = batch.slice(i, i + chunkSize);

            // Logged via observability debug below

            if (this.enableObservability) {
                this.observability.logger.debug('📋 PROCESSING CHUNK', {
                    chunkIndex: Math.floor(i / chunkSize),
                    chunkSize: chunk.length,
                    totalChunks: Math.ceil(batch.length / chunkSize),
                    chunkEventTypes: chunk.map((e) => e.type),
                    chunkEventIds: chunk.map((e) => e.id),
                    trace: {
                        source: 'event-queue',
                        step: 'processing-chunk',
                        timestamp: Date.now(),
                    },
                });
            }

            // Preserve priority order within chunk
            const chunkPromises = chunk.map(async (event) => {
                try {
                    // ✅ ADD: Log detalhado para debug de duplicação
                    const isAlreadyProcessed = this.processedEvents.has(
                        event.id,
                    );
                    // Logged via observability debug below

                    if (this.enableObservability) {
                        this.observability.logger.debug(
                            '🎯 PROCESSING INDIVIDUAL EVENT',
                            {
                                eventId: event.id,
                                eventType: event.type,
                                correlationId: event.metadata?.correlationId,
                                isAlreadyProcessed,
                                processedEventsCount: this.processedEvents.size,
                                queueSize: this.queue.length,
                                trace: {
                                    source: 'event-queue',
                                    step: 'processing-individual-event',
                                    timestamp: Date.now(),
                                },
                            },
                        );
                    }

                    if (this.useGlobalConcurrency) {
                        // concurrency control per event (global)
                        await this.semaphore.acquire();
                        try {
                            await processor(event);
                        } finally {
                            this.semaphore.release();
                        }
                    } else {
                        await processor(event);
                    }
                    successCount++;

                    // mark processed only after success (global, after handler)
                    this.processedEvents.add(event.id);
                    if (this.processedEvents.size > this.maxProcessedEvents) {
                        const firstEventId = this.processedEvents
                            .values()
                            .next().value as string | undefined;
                        if (firstEventId) {
                            this.processedEvents.delete(firstEventId);
                        }
                    }

                    // Logged via observability debug below

                    if (this.enableObservability) {
                        this.observability.logger.debug(
                            '✅ INDIVIDUAL EVENT PROCESSED SUCCESS',
                            {
                                eventId: event.id,
                                eventType: event.type,
                                correlationId: event.metadata?.correlationId,
                                successCount,
                                errorCount,
                                queueSize: this.queue.length,
                                processedEventsCount: this.processedEvents.size,
                                trace: {
                                    source: 'event-queue',
                                    step: 'individual-event-processed-success',
                                    batchSize: batch.length,
                                    chunkIndex: Math.floor(i / chunkSize),
                                },
                            },
                        );
                    }
                } catch (error) {
                    errorCount++;

                    // Logged via observability error below

                    if (this.enableObservability) {
                        this.observability.logger.error(
                            '❌ INDIVIDUAL EVENT PROCESSED ERROR',
                            error as Error,
                            {
                                eventId: event.id,
                                eventType: event.type,
                                successCount,
                                errorCount,
                                queueSize: this.queue.length,
                                processedEventsCount: this.processedEvents.size,
                                trace: {
                                    source: 'event-queue',
                                    step: 'individual-event-processed-error',
                                    batchSize: batch.length,
                                    chunkIndex: Math.floor(i / chunkSize),
                                },
                            },
                        );
                    }
                }
            });

            await Promise.all(chunkPromises);

            // Chunk completion logged at higher level
        }

        if (this.enableObservability) {
            this.observability.logger.info(
                '🔧 BATCH WITH BACKPRESSURE COMPLETED',
                {
                    batchSize: batch.length,
                    successCount,
                    errorCount,
                    finalQueueSize: this.queue.length,
                    finalProcessedEventsCount: this.processedEvents.size,
                },
            );
        }

        return successCount;
    }

    /**
     * Processar todos os eventos disponíveis com chunking
     */
    async processAll(
        processor: (event: AnyEvent) => Promise<void>,
    ): Promise<void> {
        if (this.processing) {
            // Already logged via observability warn
            if (this.enableObservability) {
                this.observability.logger.warn('🔄 QUEUE ALREADY PROCESSING', {
                    queueSize: this.queue.length,
                    processedEventsCount: this.processedEvents.size,
                    trace: {
                        source: 'event-queue',
                        step: 'process-all-already-processing',
                        timestamp: Date.now(),
                    },
                });
            }
            return;
        }

        this.processing = true;

        // Logged via observability info below

        if (this.enableObservability) {
            this.observability.logger.info(
                '🚀 EVENT QUEUE - Processing started',
                {
                    queueSize: this.queue.length,
                    processedEventsCount: this.processedEvents.size,
                    batchSize: this.batchSize || 10,
                    trace: {
                        source: 'event-queue',
                        step: 'processAll-start',
                        timestamp: Date.now(),
                    },
                },
            );
        }

        try {
            while (this.queue.length > 0) {
                const batch = this.queue.splice(0, this.batchSize || 10);

                // Logged via observability debug below

                if (this.enableObservability) {
                    this.observability.logger.debug(
                        '📦 EVENT QUEUE - Processing batch',
                        {
                            batchSize: batch.length,
                            remainingInQueue: this.queue.length,
                            batchEvents: batch.map((item) => ({
                                id: item.event.id,
                                type: item.event.type,
                            })),
                            processedEventsCount: this.processedEvents.size,
                            batchEventTypes: batch.map(
                                (item) => item.event.type,
                            ),
                            batchEventIds: batch.map((item) => item.event.id),
                            trace: {
                                source: 'event-queue',
                                step: 'process-batch',
                                timestamp: Date.now(),
                            },
                        },
                    );
                }

                const processedCount = await this.processBatchWithBackpressure(
                    batch.map((item) => item.event),
                    processor,
                );

                // Logged via observability info below

                if (this.enableObservability) {
                    this.observability.logger.info('✅ BATCH PROCESSED', {
                        batchSize: batch.length,
                        processedCount,
                        remainingInQueue: this.queue.length,
                        processedEventsCount: this.processedEvents.size,
                        trace: {
                            source: 'event-queue',
                            step: 'batch-processed',
                            timestamp: Date.now(),
                        },
                    });
                }

                // Small delay to prevent blocking
                if (this.queue.length > 0) {
                    await new Promise((resolve) => setTimeout(resolve, 1));
                }
            }

            // Logged via observability info below

            if (this.enableObservability) {
                this.observability.logger.info(
                    '🎉 QUEUE PROCESSING COMPLETED',
                    {
                        finalQueueSize: this.queue.length,
                        totalProcessedEvents: this.processedEvents.size,
                        trace: {
                            source: 'event-queue',
                            step: 'process-all-completed',
                            timestamp: Date.now(),
                        },
                    },
                );
            }
        } catch (error) {
            // Logged via observability error below

            if (this.enableObservability) {
                this.observability.logger.error(
                    '❌ QUEUE PROCESSING FAILED',
                    error as Error,
                    {
                        queueSize: this.queue.length,
                        processedEventsCount: this.processedEvents.size,
                        trace: {
                            source: 'event-queue',
                            step: 'process-all-failed',
                            timestamp: Date.now(),
                        },
                    },
                );
            }
            throw error;
        } finally {
            this.processing = false;
            if (this.enableObservability) {
                this.observability.logger.info('🏁 QUEUE PROCESSING FINISHED', {
                    finalQueueSize: this.queue.length,
                    finalProcessedEventsCount: this.processedEvents.size,
                    processing: this.processing,
                });
            }
        }
    }

    /**
     * Limpar fila
     */
    clear(): void {
        // Logged via observability info below

        this.queue = [];
        this.processedEvents.clear();

        // Logged via observability info below

        if (this.enableObservability) {
            this.observability.logger.info('Event queue cleared', {
                queueSize: 0,
                processedEventsCount: 0,
                trace: {
                    source: 'event-queue',
                    step: 'clear-queue',
                    timestamp: Date.now(),
                },
            });
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

        const stats = {
            size: this.queue.length,
            maxQueueDepth: this.maxQueueDepth,
            maxSize: this.maxQueueDepth, // Alias para compatibilidade
            processing: this.processing,
            avgEventSize: avgSize,
            totalEventSize: totalSize,
            backpressureActive: this.lastBackpressureActive,
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

            // Processed events tracking
            processedEventsCount: this.processedEvents.size,
            maxProcessedEvents: this.maxProcessedEvents,
        };

        // Stats are returned to caller; avoid console output in library

        return stats;
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
     * Configurar auto-scaling em runtime
     */
    setAutoScaling(enabled: boolean): void {
        if (enabled && this.enableAutoScaling) {
            this.startAutoScaling();
        } else {
            this.stopAutoScaling();
        }

        if (this.enableObservability) {
            this.observability.logger.info(
                'Auto-scaling configuration changed',
                {
                    enabled,
                    timerActive: !!this.autoScalingTimer,
                },
            );
        }
    }

    /**
     * Get Event Store instance (for replay operations)
     */
    getEventStore(): EventStore | undefined {
        return this.eventStore;
    }

    /**
     * Replay events from Event Store
     */
    async *replayEvents(
        fromTimestamp: number,
        options?: {
            toTimestamp?: number;
            onlyUnprocessed?: boolean;
            batchSize?: number;
        },
    ): AsyncGenerator<AnyEvent[]> {
        if (!this.enableEventStore || !this.eventStore) {
            if (this.enableObservability) {
                this.observability.logger.warn(
                    'Event Store not enabled or configured',
                );
            }
            return;
        }

        yield* this.eventStore.replayFromTimestamp(fromTimestamp, options);
    }

    /**
     * Limpar recursos da fila
     */
    destroy(): void {
        // Logged via observability info below

        // Parar auto-scaling usando método dedicado
        this.stopAutoScaling();

        // Limpar arrays e sets
        this.queue = [];
        this.performanceHistory = [];
        this.processedEvents.clear();

        // Logged via observability info below

        if (this.enableObservability) {
            this.observability.logger.info('Event queue destroyed', {
                hadAutoScalingTimer: !!this.autoScalingTimer,
                queueSize: 0,
                processedEventsCount: 0,
                trace: {
                    source: 'event-queue',
                    step: 'destroy-queue',
                    timestamp: Date.now(),
                },
            });
        }
    }
}
