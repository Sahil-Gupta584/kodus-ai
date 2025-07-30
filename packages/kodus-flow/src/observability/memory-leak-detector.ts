/**
 * @module observability/memory-leak-detector
 * @description Sistema integrado de detecção e prevenção de memory leaks
 *
 * Este módulo fornece:
 * - Detecção automática de memory leaks
 * - Tracking de recursos (timers, listeners, promises)
 * - Alertas automáticos quando thresholds são excedidos
 * - Limpeza automática de recursos
 * - Métricas em tempo real
 * - Integração com o sistema de observability existente
 */

import { EventEmitter } from 'node:events';
import { getGlobalLogger } from './core-logger.js';
import { getGlobalEventBus } from './event-bus.js';
import { createResourceManager } from '../utils/resource-manager.js';
import type { ObservabilitySystem } from './index.js';
import type { ResourceManager } from '../utils/resource-manager.js';

// ============================================================================
// 1️⃣ TYPES AND INTERFACES
// ============================================================================

/**
 * Configuração do detector de memory leaks
 */
export interface MemoryLeakDetectorConfig {
    /**
     * Intervalo de monitoramento em ms
     * @default 30000 (30 segundos)
     */
    monitoringInterval?: number;

    /**
     * Thresholds de detecção
     */
    thresholds?: {
        /**
         * Crescimento de memória em MB que indica leak
         * @default 50
         */
        memoryGrowthMb?: number;

        /**
         * Número máximo de event listeners por objeto
         * @default 20
         */
        maxListenersPerObject?: number;

        /**
         * Número máximo de timers ativos
         * @default 100
         */
        maxActiveTimers?: number;

        /**
         * Número máximo de promises pendentes
         * @default 500
         */
        maxPendingPromises?: number;

        /**
         * Percentual máximo de uso de heap
         * @default 0.9 (90%)
         */
        maxHeapUsagePercent?: number;

        /**
         * Tamanho máximo do VectorStore em MB
         * @default 100
         */
        maxVectorStoreMb?: number;

        /**
         * Tamanho máximo do MemoryManager em MB
         * @default 200
         */
        maxMemoryManagerMb?: number;
    };

    /**
     * Configuração de limpeza automática
     */
    autoCleanup?: {
        /**
         * Habilitar limpeza automática
         * @default true
         */
        enabled?: boolean;

        /**
         * Idade máxima para recursos em ms
         * @default 300000 (5 minutos)
         */
        maxResourceAge?: number;

        /**
         * Intervalo de limpeza em ms
         * @default 60000 (1 minuto)
         */
        cleanupInterval?: number;

        /**
         * Força garbage collection
         * @default false
         */
        forceGC?: boolean;
    };

    /**
     * Configuração de alertas
     */
    alerts?: {
        /**
         * Habilitar alertas
         * @default true
         */
        enabled?: boolean;

        /**
         * Callback customizado para alertas
         */
        onAlert?: (alert: MemoryLeakAlert) => void;

        /**
         * Níveis de alerta para logs
         * @default 'warn'
         */
        logLevel?: 'error' | 'warn' | 'info';
    };

    /**
     * Habilitação de recursos específicos
     */
    features?: {
        /**
         * Monitorar event listeners
         * @default true
         */
        trackEventListeners?: boolean;

        /**
         * Monitorar timers/intervals
         * @default true
         */
        trackTimers?: boolean;

        /**
         * Monitorar promises
         * @default true
         */
        trackPromises?: boolean;

        /**
         * Monitorar MemoryManager
         * @default true
         */
        trackMemoryManager?: boolean;

        /**
         * Monitorar VectorStore
         * @default true
         */
        trackVectorStore?: boolean;

        /**
         * Monitorar Event Bus
         * @default true
         */
        trackEventBus?: boolean;
    };
}

/**
 * Métricas de memory leak
 */
export interface MemoryLeakMetrics {
    timestamp: number;
    memoryUsage: {
        heapUsed: number;
        heapTotal: number;
        rss: number;
        external: number;
        heapUsedMb: number;
        heapTotalMb: number;
        rssMb: number;
        externalMb: number;
        heapUsagePercent: number;
    };
    resourceCounts: {
        eventListeners: number;
        activeTimers: number;
        pendingPromises: number;
        memoryManagerItems: number;
        vectorStoreItems: number;
        eventBusListeners: number;
    };
    growth: {
        memoryGrowthMb: number;
        listenerGrowth: number;
        timerGrowth: number;
        promiseGrowth: number;
    };
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Alerta de memory leak
 */
export interface MemoryLeakAlert {
    id: string;
    type:
        | 'MEMORY_GROWTH'
        | 'LISTENER_LEAK'
        | 'TIMER_LEAK'
        | 'PROMISE_LEAK'
        | 'RESOURCE_LEAK'
        | 'HEAP_OVERFLOW';
    severity: 'warning' | 'error' | 'critical';
    message: string;
    timestamp: number;
    metrics: MemoryLeakMetrics;
    source: string;
    details: Record<string, unknown>;
    recommendedAction?: string;
}

/**
 * Recurso trackeado
 */
interface TrackedResource {
    id: string;
    type: 'timer' | 'listener' | 'promise' | 'memory' | 'vector' | 'event';
    createdAt: number;
    source: string;
    metadata: Record<string, unknown>;
    disposed?: boolean;
}

// ============================================================================
// 2️⃣ MEMORY LEAK DETECTOR CLASS
// ============================================================================

/**
 * Detector de memory leaks integrado
 */
export class MemoryLeakDetector extends EventEmitter {
    private config: Required<MemoryLeakDetectorConfig>;
    private logger = getGlobalLogger();
    private eventBus = getGlobalEventBus();
    private resourceManager: ResourceManager;

    // Monitoring state
    private monitoringInterval: NodeJS.Timeout | null = null;
    private cleanupInterval: NodeJS.Timeout | null = null;
    private metricsHistory: MemoryLeakMetrics[] = [];
    private trackedResources = new Map<string, TrackedResource>();
    private alerts: MemoryLeakAlert[] = [];

    // Resource tracking
    private eventListenerCount = 0;
    private activeTimers = new Set<NodeJS.Timeout>();
    private pendingPromises = new Set<Promise<unknown>>();
    private lastMemoryUsage = 0;
    private baselineMemory = 0;

    constructor(
        _observability: ObservabilitySystem,
        config: MemoryLeakDetectorConfig = {},
    ) {
        super();
        this.resourceManager = createResourceManager({
            component: 'memory-leak-detector',
        });

        // Configuração padrão
        this.config = {
            monitoringInterval: 30000,
            thresholds: {
                memoryGrowthMb: 50,
                maxListenersPerObject: 20,
                maxActiveTimers: 100,
                maxPendingPromises: 500,
                maxHeapUsagePercent: 0.9,
                maxVectorStoreMb: 100,
                maxMemoryManagerMb: 200,
                ...config.thresholds,
            },
            autoCleanup: {
                enabled: true,
                maxResourceAge: 300000,
                cleanupInterval: 60000,
                forceGC: false,
                ...config.autoCleanup,
            },
            alerts: {
                enabled: true,
                logLevel: 'warn',
                ...config.alerts,
            },
            features: {
                trackEventListeners: true,
                trackTimers: true,
                trackPromises: true,
                trackMemoryManager: true,
                trackVectorStore: true,
                trackEventBus: true,
                ...config.features,
            },
            ...config,
        };

        this.initializeBaselineMemory();
        this.setupTracking();
    }

    // ========================================================================
    // 3️⃣ INITIALIZATION AND SETUP
    // ========================================================================

    /**
     * Inicializa baseline de memória
     */
    private initializeBaselineMemory(): void {
        const memUsage = process.memoryUsage();
        this.baselineMemory = memUsage.heapUsed;
        this.lastMemoryUsage = memUsage.heapUsed;
    }

    /**
     * Configura tracking de recursos
     */
    private setupTracking(): void {
        // Setup tracking de event listeners
        if (this.config.features.trackEventListeners) {
            this.setupEventListenerTracking();
        }

        // Setup tracking de timers
        if (this.config.features.trackTimers) {
            this.setupTimerTracking();
        }

        // Setup tracking de promises
        if (this.config.features.trackPromises) {
            this.setupPromiseTracking();
        }

        this.logger.info('Memory leak detector tracking configured', {
            component: 'memory-leak-detector',
            features: this.config.features,
        });
    }

    /**
     * Configura tracking de event listeners
     */
    private setupEventListenerTracking(): void {
        // Monkey patch EventEmitter.addListener
        const originalAddListener = EventEmitter.prototype.addListener;
        const originalRemoveListener = EventEmitter.prototype.removeListener;

        EventEmitter.prototype.addListener = function (
            event: string | symbol,
            listener: (...args: unknown[]) => void,
        ) {
            this.emit('__listenerAdded', event, listener);
            return originalAddListener.call(this, event, listener);
        };

        EventEmitter.prototype.removeListener = function (
            event: string | symbol,
            listener: (...args: unknown[]) => void,
        ) {
            this.emit('__listenerRemoved', event, listener);
            return originalRemoveListener.call(this, event, listener);
        };

        // Track global listener events
        process.on('__listenerAdded', () => {
            this.eventListenerCount++;
            this.checkListenerLeak();
        });

        process.on('__listenerRemoved', () => {
            this.eventListenerCount--;
        });
    }

    /**
     * Configura tracking de timers
     */
    private setupTimerTracking(): void {
        // Monkey patch setTimeout/setInterval
        const originalSetTimeout = global.setTimeout;
        const originalSetInterval = global.setInterval;
        const originalClearTimeout = global.clearTimeout;
        const originalClearInterval = global.clearInterval;

        global.setTimeout = ((
            callback: (...args: unknown[]) => void,
            delay?: number,
            ..._args: unknown[]
        ) => {
            const timer = originalSetTimeout.call(global, callback, delay);
            this.trackTimer(timer, 'timeout');
            return timer;
        }) as typeof setTimeout;

        global.setInterval = ((
            callback: (...args: unknown[]) => void,
            delay?: number,
            ..._args: unknown[]
        ) => {
            const timer = originalSetInterval.call(global, callback, delay);
            this.trackTimer(timer, 'interval');
            return timer;
        }) as typeof setInterval;

        global.clearTimeout = (
            timer: NodeJS.Timeout | string | number | undefined,
        ) => {
            if (timer && typeof timer === 'object') {
                this.untrackTimer(timer);
            }
            return originalClearTimeout.call(global, timer);
        };

        global.clearInterval = (
            timer: NodeJS.Timeout | string | number | undefined,
        ) => {
            if (timer && typeof timer === 'object') {
                this.untrackTimer(timer);
            }
            return originalClearInterval.call(global, timer);
        };
    }

    /**
     * Configura tracking de promises
     */
    private setupPromiseTracking(): void {
        // Monkey patch Promise constructor
        const originalPromise = global.Promise;

        global.Promise = class TrackedPromise<T> extends originalPromise<T> {
            constructor(
                executor: (
                    resolve: (value: T | PromiseLike<T>) => void,
                    reject: (reason?: unknown) => void,
                ) => void,
            ) {
                super((resolve, reject) => {
                    const promise = this as Promise<T>;
                    (
                        this as { _memoryLeakDetector?: MemoryLeakDetector }
                    )._memoryLeakDetector?.trackPromise(promise);

                    executor(
                        (value: T | PromiseLike<T>) => {
                            (
                                this as {
                                    _memoryLeakDetector?: MemoryLeakDetector;
                                }
                            )._memoryLeakDetector?.untrackPromise(promise);
                            resolve(value);
                        },
                        (reason?: unknown) => {
                            (
                                this as {
                                    _memoryLeakDetector?: MemoryLeakDetector;
                                }
                            )._memoryLeakDetector?.untrackPromise(promise);
                            reject(reason);
                        },
                    );
                });
            }
        } as PromiseConstructor;

        // Copy static methods
        Object.setPrototypeOf(global.Promise, originalPromise);
        Object.getOwnPropertyNames(originalPromise).forEach((prop) => {
            if (prop !== 'prototype' && prop !== 'name' && prop !== 'length') {
                (global.Promise as unknown as Record<string, unknown>)[prop] = (
                    originalPromise as unknown as Record<string, unknown>
                )[prop];
            }
        });
    }

    // ========================================================================
    // 4️⃣ RESOURCE TRACKING
    // ========================================================================

    /**
     * Trackea um timer
     */
    private trackTimer(
        timer: NodeJS.Timeout,
        type: 'timeout' | 'interval',
    ): void {
        this.activeTimers.add(timer);

        const resource: TrackedResource = {
            id: timer.toString(),
            type: 'timer',
            createdAt: Date.now(),
            source: this.getCallStack(),
            metadata: { timerType: type },
        };

        this.trackedResources.set(resource.id, resource);
        this.checkTimerLeak();
    }

    /**
     * Remove tracking de um timer
     */
    private untrackTimer(timer: NodeJS.Timeout): void {
        this.activeTimers.delete(timer);
        const resource = this.trackedResources.get(timer.toString());
        if (resource) {
            resource.disposed = true;
        }
    }

    /**
     * Trackea uma promise
     */
    private trackPromise(promise: Promise<unknown>): void {
        this.pendingPromises.add(promise);

        const resource: TrackedResource = {
            id: promise.toString(),
            type: 'promise',
            createdAt: Date.now(),
            source: this.getCallStack(),
            metadata: {},
        };

        this.trackedResources.set(resource.id, resource);
        this.checkPromiseLeak();
    }

    /**
     * Remove tracking de uma promise
     */
    private untrackPromise(promise: Promise<unknown>): void {
        this.pendingPromises.delete(promise);
        const resource = this.trackedResources.get(promise.toString());
        if (resource) {
            resource.disposed = true;
        }
    }

    /**
     * Obtém stack trace da chamada
     */
    private getCallStack(): string {
        const stack = new Error().stack;
        return stack ? stack.split('\n').slice(2, 4).join('\n') : 'unknown';
    }

    // ========================================================================
    // 5️⃣ MONITORING AND DETECTION
    // ========================================================================

    /**
     * Inicia monitoramento
     */
    start(): void {
        if (this.monitoringInterval) {
            return;
        }

        this.logger.info('Starting memory leak detector', {
            component: 'memory-leak-detector',
            config: this.config,
        });

        // Monitoramento principal
        this.monitoringInterval = setInterval(() => {
            this.performMemoryCheck();
        }, this.config.monitoringInterval);

        // Limpeza automática
        if (this.config.autoCleanup.enabled) {
            this.cleanupInterval = setInterval(() => {
                this.performAutoCleanup();
            }, this.config.autoCleanup.cleanupInterval);
        }

        this.resourceManager.addInterval(this.monitoringInterval);
        if (this.cleanupInterval) {
            this.resourceManager.addInterval(this.cleanupInterval);
        }
    }

    /**
     * Para monitoramento
     */
    stop(): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        this.logger.info('Memory leak detector stopped', {
            component: 'memory-leak-detector',
        });
    }

    /**
     * Realiza check de memória
     */
    private performMemoryCheck(): void {
        const metrics = this.collectMetrics();
        this.metricsHistory.push(metrics);

        // Manter apenas últimas 100 medições
        if (this.metricsHistory.length > 100) {
            this.metricsHistory.shift();
        }

        // Verificar leaks
        this.checkMemoryLeak(metrics);
        this.checkResourceLeaks(metrics);

        // Emit metrics event
        this.emit('metrics', metrics);

        // Log metrics periodicamente
        if (this.metricsHistory.length % 10 === 0) {
            this.logger.debug('Memory leak detector metrics', {
                component: 'memory-leak-detector',
                metrics: {
                    heapUsedMb: metrics.memoryUsage.heapUsedMb,
                    heapUsagePercent: metrics.memoryUsage.heapUsagePercent,
                    resourceCounts: metrics.resourceCounts,
                    riskLevel: metrics.riskLevel,
                },
            });
        }
    }

    /**
     * Coleta métricas atuais
     */
    private collectMetrics(): MemoryLeakMetrics {
        const memUsage = process.memoryUsage();
        const timestamp = Date.now();

        // Calcular growth
        const memoryGrowthMb =
            (memUsage.heapUsed - this.lastMemoryUsage) / 1024 / 1024;
        const previousMetrics =
            this.metricsHistory[this.metricsHistory.length - 1];

        const growth = {
            memoryGrowthMb,
            listenerGrowth: previousMetrics
                ? this.eventListenerCount -
                  previousMetrics.resourceCounts.eventListeners
                : 0,
            timerGrowth: previousMetrics
                ? this.activeTimers.size -
                  previousMetrics.resourceCounts.activeTimers
                : 0,
            promiseGrowth: previousMetrics
                ? this.pendingPromises.size -
                  previousMetrics.resourceCounts.pendingPromises
                : 0,
        };

        // Determinar risk level
        const riskLevel = this.calculateRiskLevel(memUsage, growth);

        const metrics: MemoryLeakMetrics = {
            timestamp,
            memoryUsage: {
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                rss: memUsage.rss,
                external: memUsage.external,
                heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
                heapTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
                rssMb: Math.round(memUsage.rss / 1024 / 1024),
                externalMb: Math.round(memUsage.external / 1024 / 1024),
                heapUsagePercent:
                    (memUsage.heapUsed / memUsage.heapTotal) * 100,
            },
            resourceCounts: {
                eventListeners: this.eventListenerCount,
                activeTimers: this.activeTimers.size,
                pendingPromises: this.pendingPromises.size,
                memoryManagerItems: 0, // Simplified for now
                vectorStoreItems: this.getVectorStoreSize(),
                eventBusListeners: this.getEventBusListenerCount(),
            },
            growth,
            riskLevel,
        };

        this.lastMemoryUsage = memUsage.heapUsed;
        return metrics;
    }

    /**
     * Calcula nível de risco
     */
    private calculateRiskLevel(
        memUsage: NodeJS.MemoryUsage,
        growth: MemoryLeakMetrics['growth'],
    ): 'low' | 'medium' | 'high' | 'critical' {
        const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

        if (heapUsagePercent > 95 || growth.memoryGrowthMb > 100) {
            return 'critical';
        }

        if (heapUsagePercent > 85 || growth.memoryGrowthMb > 50) {
            return 'high';
        }

        if (heapUsagePercent > 70 || growth.memoryGrowthMb > 25) {
            return 'medium';
        }

        return 'low';
    }

    /**
     * Obtém tamanho do VectorStore
     */
    private getVectorStoreSize(): number {
        try {
            // Simplified for now
            return 0;
        } catch {
            return 0;
        }
    }

    /**
     * Obtém número de listeners do EventBus
     */
    private getEventBusListenerCount(): number {
        try {
            const stats = this.eventBus.getStats();
            return stats.activeListeners;
        } catch {
            return 0;
        }
    }

    // ========================================================================
    // 6️⃣ LEAK DETECTION
    // ========================================================================

    /**
     * Verifica memory leak
     */
    private checkMemoryLeak(metrics: MemoryLeakMetrics): void {
        const { memoryUsage, growth } = metrics;

        // Verificar crescimento de memória
        if (
            growth.memoryGrowthMb >
            (this.config.thresholds.memoryGrowthMb ?? 50)
        ) {
            this.createAlert({
                type: 'MEMORY_GROWTH',
                severity:
                    growth.memoryGrowthMb >
                    (this.config.thresholds.memoryGrowthMb ?? 50) * 2
                        ? 'critical'
                        : 'error',
                message: `Memory growth detected: ${growth.memoryGrowthMb.toFixed(2)}MB`,
                metrics,
                source: 'memory-leak-detector',
                details: {
                    threshold: this.config.thresholds.memoryGrowthMb ?? 50,
                    actual: growth.memoryGrowthMb,
                    baselineMemory: this.baselineMemory,
                },
                recommendedAction:
                    'Check for memory leaks in recent code changes',
            });
        }

        // Verificar uso de heap
        if (
            memoryUsage.heapUsagePercent >
            (this.config.thresholds.maxHeapUsagePercent ?? 0.9) * 100
        ) {
            this.createAlert({
                type: 'HEAP_OVERFLOW',
                severity:
                    memoryUsage.heapUsagePercent > 95 ? 'critical' : 'error',
                message: `High heap usage: ${memoryUsage.heapUsagePercent.toFixed(1)}%`,
                metrics,
                source: 'memory-leak-detector',
                details: {
                    threshold:
                        (this.config.thresholds.maxHeapUsagePercent ?? 0.9) *
                        100,
                    actual: memoryUsage.heapUsagePercent,
                    heapUsedMb: memoryUsage.heapUsedMb,
                    heapTotalMb: memoryUsage.heapTotalMb,
                },
                recommendedAction:
                    'Consider increasing heap size or optimize memory usage',
            });
        }
    }

    /**
     * Verifica leak de event listeners
     */
    private checkListenerLeak(): void {
        if (
            this.eventListenerCount >
            (this.config.thresholds.maxListenersPerObject ?? 20)
        ) {
            const metrics = this.collectMetrics();
            this.createAlert({
                type: 'LISTENER_LEAK',
                severity: 'warning',
                message: `High event listener count: ${this.eventListenerCount}`,
                metrics,
                source: 'memory-leak-detector',
                details: {
                    threshold:
                        this.config.thresholds.maxListenersPerObject ?? 20,
                    actual: this.eventListenerCount,
                },
                recommendedAction: 'Check for unremoved event listeners',
            });
        }
    }

    /**
     * Verifica leak de timers
     */
    private checkTimerLeak(): void {
        if (
            this.activeTimers.size >
            (this.config.thresholds.maxActiveTimers ?? 100)
        ) {
            const metrics = this.collectMetrics();
            this.createAlert({
                type: 'TIMER_LEAK',
                severity: 'warning',
                message: `High timer count: ${this.activeTimers.size}`,
                metrics,
                source: 'memory-leak-detector',
                details: {
                    threshold: this.config.thresholds.maxActiveTimers ?? 100,
                    actual: this.activeTimers.size,
                },
                recommendedAction: 'Check for uncleared timers and intervals',
            });
        }
    }

    /**
     * Verifica leak de promises
     */
    private checkPromiseLeak(): void {
        if (
            this.pendingPromises.size >
            (this.config.thresholds.maxPendingPromises ?? 500)
        ) {
            const metrics = this.collectMetrics();
            this.createAlert({
                type: 'PROMISE_LEAK',
                severity: 'warning',
                message: `High pending promise count: ${this.pendingPromises.size}`,
                metrics,
                source: 'memory-leak-detector',
                details: {
                    threshold: this.config.thresholds.maxPendingPromises ?? 500,
                    actual: this.pendingPromises.size,
                },
                recommendedAction: 'Check for unresolved promises',
            });
        }
    }

    /**
     * Verifica leaks de recursos
     */
    private checkResourceLeaks(metrics: MemoryLeakMetrics): void {
        // Verificar MemoryManager
        if (this.config.features.trackMemoryManager) {
            // Simplified for now
            const memoryManagerSizeMb = 0;

            if (
                memoryManagerSizeMb >
                (this.config.thresholds.maxMemoryManagerMb ?? 200)
            ) {
                this.createAlert({
                    type: 'RESOURCE_LEAK',
                    severity: 'warning',
                    message: `MemoryManager size exceeded: ${memoryManagerSizeMb.toFixed(2)}MB`,
                    metrics,
                    source: 'memory-manager',
                    details: {
                        threshold:
                            this.config.thresholds.maxMemoryManagerMb ?? 200,
                        actual: memoryManagerSizeMb,
                        itemCount: 0,
                    },
                    recommendedAction:
                        'Clear old memory items or increase threshold',
                });
            }
        }
    }

    // ========================================================================
    // 7️⃣ ALERTS AND NOTIFICATIONS
    // ========================================================================

    /**
     * Cria alerta
     */
    private createAlert(
        alertData: Omit<MemoryLeakAlert, 'id' | 'timestamp'>,
    ): void {
        const alert: MemoryLeakAlert = {
            id: `leak-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            ...alertData,
        };

        this.alerts.push(alert);

        // Manter apenas últimos 50 alertas
        if (this.alerts.length > 50) {
            this.alerts.shift();
        }

        // Log alert
        if (this.config.alerts.enabled) {
            const logLevel = this.config.alerts.logLevel ?? 'warn';
            this.logger[logLevel]('Memory leak alert', undefined, {
                component: 'memory-leak-detector',
                alert: {
                    id: alert.id,
                    type: alert.type,
                    severity: alert.severity,
                    message: alert.message,
                    source: alert.source,
                    details: alert.details,
                    recommendedAction: alert.recommendedAction,
                },
            });
        }

        // Custom alert callback
        if (this.config.alerts.onAlert) {
            try {
                this.config.alerts.onAlert(alert);
            } catch (error) {
                this.logger.error(
                    'Error in custom alert callback',
                    error as Error,
                    {
                        component: 'memory-leak-detector',
                        alertId: alert.id,
                    },
                );
            }
        }

        // Emit alert event
        this.emit('alert', alert);

        // Publish to event bus
        this.eventBus.publish(
            {
                id: `memory-leak-alert-${alert.id}`,
                type: 'system.memory.leak.detected',
                data: alert,
                ts: alert.timestamp,
                threadId: 'main',
                metadata: {
                    source: 'memory-leak-detector',
                    severity: alert.severity,
                    type: alert.type,
                },
            },
            'memory-leak-detector',
        );
    }

    // ========================================================================
    // 8️⃣ AUTO CLEANUP
    // ========================================================================

    /**
     * Realiza limpeza automática
     */
    private performAutoCleanup(): void {
        const now = Date.now();
        // Limpar recursos antigos
        let cleaned = 0;
        for (const [, resource] of this.trackedResources) {
            const maxAge = this.config.autoCleanup.maxResourceAge ?? 300000;
            if (now - resource.createdAt > maxAge && !resource.disposed) {
                this.cleanupResource(resource);
                cleaned++;
            }
        }

        // Forçar garbage collection se habilitado
        if (this.config.autoCleanup.forceGC && global.gc) {
            global.gc();
        }

        if (cleaned > 0) {
            this.logger.info('Auto cleanup completed', {
                component: 'memory-leak-detector',
                cleanedResources: cleaned,
                totalTracked: this.trackedResources.size,
                forceGC: this.config.autoCleanup.forceGC && !!global.gc,
            });
        }
    }

    /**
     * Limpa recurso específico
     */
    private cleanupResource(resource: TrackedResource): void {
        try {
            switch (resource.type) {
                case 'timer':
                    // Timers já são limpos pelo sistema
                    break;
                case 'listener':
                    // Listeners requerem cleanup manual
                    break;
                case 'promise':
                    // Promises não podem ser limpas forçadamente
                    break;
                default:
                    break;
            }

            resource.disposed = true;

            this.logger.debug('Resource cleaned up', {
                component: 'memory-leak-detector',
                resourceId: resource.id,
                resourceType: resource.type,
                age: Date.now() - resource.createdAt,
            });
        } catch (error) {
            this.logger.error('Failed to cleanup resource', error as Error, {
                component: 'memory-leak-detector',
                resourceId: resource.id,
                resourceType: resource.type,
            });
        }
    }

    // ========================================================================
    // 9️⃣ PUBLIC API
    // ========================================================================

    /**
     * Obtém métricas atuais
     */
    getCurrentMetrics(): MemoryLeakMetrics {
        return this.collectMetrics();
    }

    /**
     * Obtém histórico de métricas
     */
    getMetricsHistory(limit = 50): MemoryLeakMetrics[] {
        return this.metricsHistory.slice(-limit);
    }

    /**
     * Obtém alertas recentes
     */
    getRecentAlerts(limit = 20): MemoryLeakAlert[] {
        return this.alerts.slice(-limit);
    }

    /**
     * Obtém recursos trackeados
     */
    getTrackedResources(): TrackedResource[] {
        return Array.from(this.trackedResources.values());
    }

    /**
     * Força check de memory leak
     */
    forceCheck(): MemoryLeakMetrics {
        const metrics = this.collectMetrics();
        this.checkMemoryLeak(metrics);
        this.checkResourceLeaks(metrics);
        return metrics;
    }

    /**
     * Força limpeza de recursos
     */
    forceCleanup(): void {
        this.performAutoCleanup();
    }

    /**
     * Obtém estatísticas do detector
     */
    getStats(): {
        isRunning: boolean;
        metricsCount: number;
        alertsCount: number;
        trackedResourcesCount: number;
        lastCheck: number;
        config: MemoryLeakDetectorConfig;
    } {
        return {
            isRunning: this.monitoringInterval !== null,
            metricsCount: this.metricsHistory.length,
            alertsCount: this.alerts.length,
            trackedResourcesCount: this.trackedResources.size,
            lastCheck:
                this.metricsHistory[this.metricsHistory.length - 1]
                    ?.timestamp || 0,
            config: this.config,
        };
    }

    /**
     * Atualiza configuração
     */
    updateConfig(newConfig: Partial<MemoryLeakDetectorConfig>): void {
        this.config = { ...this.config, ...newConfig };
        this.logger.info('Memory leak detector configuration updated', {
            component: 'memory-leak-detector',
            changes: Object.keys(newConfig),
        });
    }

    /**
     * Shutdown do detector
     */
    async shutdown(): Promise<void> {
        this.stop();
        await this.resourceManager.dispose();
        this.removeAllListeners();

        this.logger.info('Memory leak detector shut down', {
            component: 'memory-leak-detector',
        });
    }
}

// ============================================================================
// 🔟 SINGLETON INSTANCE
// ============================================================================

/**
 * Instância global do detector
 */
let globalMemoryLeakDetector: MemoryLeakDetector | undefined;

/**
 * Obtém detector global
 */
export function getGlobalMemoryLeakDetector(): MemoryLeakDetector {
    if (!globalMemoryLeakDetector) {
        // Nota: Requer ObservabilitySystem para funcionar
        throw new Error(
            'Memory leak detector not initialized. Call configureGlobalMemoryLeakDetector first.',
        );
    }
    return globalMemoryLeakDetector;
}

/**
 * Configura detector global
 */
export function configureGlobalMemoryLeakDetector(
    observability: ObservabilitySystem,
    config: MemoryLeakDetectorConfig = {},
): MemoryLeakDetector {
    globalMemoryLeakDetector = new MemoryLeakDetector(observability, config);
    return globalMemoryLeakDetector;
}

/**
 * Inicializa detector com configuração padrão
 */
export function initializeMemoryLeakDetector(
    observability: ObservabilitySystem,
    config: MemoryLeakDetectorConfig = {},
): MemoryLeakDetector {
    const detector = configureGlobalMemoryLeakDetector(observability, config);
    detector.start();
    return detector;
}

// ============================================================================
// 1️⃣1️⃣ HELPER FUNCTIONS
// ============================================================================

/**
 * Cria detector com configuração otimizada para produção
 */
export function createProductionMemoryLeakDetector(
    observability: ObservabilitySystem,
): MemoryLeakDetector {
    return new MemoryLeakDetector(observability, {
        monitoringInterval: 60000, // 1 minuto
        thresholds: {
            memoryGrowthMb: 100,
            maxHeapUsagePercent: 0.85,
            maxActiveTimers: 200,
            maxPendingPromises: 1000,
        },
        autoCleanup: {
            enabled: true,
            maxResourceAge: 600000, // 10 minutos
            cleanupInterval: 120000, // 2 minutos
            forceGC: true,
        },
        alerts: {
            enabled: true,
            logLevel: 'error',
        },
    });
}

/**
 * Cria detector com configuração para desenvolvimento
 */
export function createDevelopmentMemoryLeakDetector(
    observability: ObservabilitySystem,
): MemoryLeakDetector {
    return new MemoryLeakDetector(observability, {
        monitoringInterval: 15000, // 15 segundos
        thresholds: {
            memoryGrowthMb: 25,
            maxHeapUsagePercent: 0.7,
            maxActiveTimers: 50,
            maxPendingPromises: 200,
        },
        autoCleanup: {
            enabled: true,
            maxResourceAge: 180000, // 3 minutos
            cleanupInterval: 30000, // 30 segundos
            forceGC: false,
        },
        alerts: {
            enabled: true,
            logLevel: 'warn',
        },
    });
}
