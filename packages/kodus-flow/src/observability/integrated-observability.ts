/**
 * @module observability/integrated-observability
 * @description Módulo integrador para observabilidade completa
 *
 * Este módulo conecta todos os componentes centrais:
 * - CoreLogger (Pino-based high-performance logging)
 * - EventBus (centralized event processing)
 * - UnifiedConfig (environment-based configuration)
 * - Existing components (timeline, telemetry, monitoring, debugging)
 *
 * Fornece uma interface unificada para todo o sistema de observabilidade
 */

import {
    CoreLogger,
    getGlobalLogger,
    configureGlobalLogger,
} from './core-logger.js';
import {
    ObservabilityEventBus,
    getGlobalEventBus,
    configureGlobalEventBus,
    publishEvent,
    subscribeToEvent,
    subscribeToAllEvents,
    type EventBusConfig,
    EventProcessingContext,
} from './event-bus.js';
import {
    createAutoConfig,
    createObservabilityConfig,
    getEnvironmentConfig,
    validateConfig,
    optimizeConfigForPerformance,
    configureForDebug,
    type UnifiedObservabilityConfig,
    type Environment,
    CONFIGS,
} from './unified-config.js';
import { getTimelineManager } from './execution-timeline.js';
import { getTelemetry } from './telemetry.js';
import { getLayeredMetricsSystem } from './monitoring.js';
import { getGlobalDebugSystem } from './debugging.js';
import { TimelineViewer, createTimelineViewer } from './timeline-viewer.js';
import {
    MemoryLeakDetector,
    configureGlobalMemoryLeakDetector,
    type MemoryLeakDetectorConfig,
    type MemoryLeakMetrics,
    type MemoryLeakAlert,
} from './memory-leak-detector.js';
import type { ObservabilitySystem } from './index.js';
import type { AnyEvent, EventType } from '../core/types/events.js';
import type { BaseSDKError } from '../core/errors.js';

// ============================================================================
// 1️⃣ INTEGRATED OBSERVABILITY SYSTEM
// ============================================================================

/**
 * Sistema integrado de observabilidade
 * Conecta todos os componentes em uma interface unificada
 */
export class IntegratedObservabilitySystem {
    private config: UnifiedObservabilityConfig;
    private logger: CoreLogger;
    private eventBus: ObservabilityEventBus;
    private memoryLeakDetector: MemoryLeakDetector | null = null;
    private initialized = false;

    constructor(config?: Partial<UnifiedObservabilityConfig>) {
        this.config = config
            ? createObservabilityConfig('development', config)
            : createAutoConfig();
        this.logger = getGlobalLogger();
        this.eventBus = getGlobalEventBus();
    }

    // ========================================================================
    // 2️⃣ INITIALIZATION
    // ========================================================================

    /**
     * Inicializa sistema integrado
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        // Validar configuração
        const validation = validateConfig(this.config);
        if (!validation.valid) {
            throw new Error(
                `Invalid configuration: ${validation.errors.join(', ')}`,
            );
        }

        // Configurar logger global
        configureGlobalLogger(this.config.logger);
        this.logger = getGlobalLogger();

        // Configurar event bus global
        configureGlobalEventBus(this.config.eventBus);
        this.eventBus = getGlobalEventBus();

        // Configurar memory leak detector
        this.initializeMemoryLeakDetector();

        // Setup integration listeners
        this.setupIntegrationListeners();

        // Log initialization
        this.logger.info('Integrated observability system initialized', {
            component: 'integrated-observability',
            environment: this.config.environment,
            config: {
                logging: this.config.logger.level,
                eventBus: {
                    bufferSize: this.config.eventBus.bufferSize,
                    flushInterval: this.config.eventBus.flushInterval,
                },
                performance: this.config.performance.enableHighPerformanceMode,
            },
        });

        this.initialized = true;
    }

    /**
     * Inicializa o detector de memory leaks
     */
    private initializeMemoryLeakDetector(): void {
        const memoryLeakConfig: MemoryLeakDetectorConfig = {
            monitoringInterval:
                this.config.environment === 'production' ? 60000 : 30000,
            thresholds: {
                memoryGrowthMb:
                    this.config.environment === 'production' ? 100 : 50,
                maxHeapUsagePercent:
                    this.config.environment === 'production' ? 0.85 : 0.8,
                maxActiveTimers:
                    this.config.environment === 'production' ? 200 : 100,
                maxPendingPromises:
                    this.config.environment === 'production' ? 1000 : 500,
            },
            autoCleanup: {
                enabled: true,
                maxResourceAge:
                    this.config.environment === 'production' ? 600000 : 300000,
                cleanupInterval:
                    this.config.environment === 'production' ? 120000 : 60000,
                forceGC: this.config.environment === 'production',
            },
            alerts: {
                enabled: true,
                logLevel:
                    this.config.environment === 'production' ? 'error' : 'warn',
                onAlert: (alert: MemoryLeakAlert) => {
                    this.handleMemoryLeakAlert(alert);
                },
            },
            features: {
                trackEventListeners: true,
                trackTimers: true,
                trackPromises: true,
                trackMemoryManager: true,
                trackVectorStore: true,
                trackEventBus: true,
            },
        };

        this.memoryLeakDetector = configureGlobalMemoryLeakDetector(
            this as unknown as ObservabilitySystem,
            memoryLeakConfig,
        );

        // Iniciar monitoramento
        this.memoryLeakDetector.start();

        this.logger.info('Memory leak detector initialized', {
            component: 'integrated-observability',
            config: memoryLeakConfig,
        });
    }

    /**
     * Trata alertas de memory leak
     */
    private handleMemoryLeakAlert(alert: MemoryLeakAlert): void {
        // Publish event to event bus
        this.publishEvent(
            'system.memory.leak.detected',
            alert,
            'memory-leak-detector',
            {
                severity: alert.severity,
                type: alert.type,
                source: alert.source,
            },
        );

        // Log critical alerts
        if (alert.severity === 'critical') {
            this.logger.error('Critical memory leak detected', undefined, {
                component: 'memory-leak-detector',
                alertId: alert.id,
                type: alert.type,
                message: alert.message,
                recommendedAction: alert.recommendedAction,
            });
        }
    }

    /**
     * Setup listeners para integração automática
     */
    private setupIntegrationListeners(): void {
        // Auto-correlação de eventos
        if (this.config.integration.autoCorrelation) {
            this.eventBus.subscribeAll(async (_event, context) => {
                this.logger.setCorrelationId(context.correlationId);
            });
        }

        // Auto-publish de eventos críticos
        if (this.config.integration.autoPublishEvents) {
            // Capturar erros não tratados
            process.on('uncaughtException', (error) => {
                this.publishSystemEvent('system.error', {
                    error: error.message,
                    stack: error.stack,
                    type: 'uncaughtException',
                });
            });

            process.on('unhandledRejection', (reason) => {
                this.publishSystemEvent('system.error', {
                    error: String(reason),
                    type: 'unhandledRejection',
                });
            });
        }
    }

    // ========================================================================
    // 3️⃣ UNIFIED INTERFACE
    // ========================================================================

    /**
     * Publish evento com correlação automática
     */
    async publishEvent(
        eventType: EventType,
        data: unknown,
        component: string = 'unknown',
        metadata?: Record<string, unknown>,
    ): Promise<void> {
        const event: AnyEvent = {
            id: `${Date.now()}-${Math.random()}`,
            type: eventType,
            data,
            ts: Date.now(),
            threadId: 'main',
            metadata: {
                ...metadata,
                correlationId: this.logger.getCorrelationId(),
            },
        };

        await this.eventBus.publish(event, component);
    }

    /**
     * Publish evento do sistema
     */
    private async publishSystemEvent(
        eventType: string,
        data: unknown,
        metadata?: Record<string, unknown>,
    ): Promise<void> {
        await this.publishEvent(
            eventType as EventType,
            data,
            'integrated-observability',
            metadata,
        );
    }

    /**
     * Subscribe para eventos
     */
    subscribeToEvent<T extends AnyEvent>(
        eventType: EventType,
        listener: (
            event: T,
            context: EventProcessingContext,
        ) => Promise<void> | void,
    ): void {
        this.eventBus.subscribe(eventType, listener);
    }

    /**
     * Subscribe para todos os eventos
     */
    subscribeToAllEvents(
        listener: (
            event: AnyEvent,
            context: EventProcessingContext,
        ) => Promise<void> | void,
    ): void {
        this.eventBus.subscribeAll(listener);
    }

    /**
     * Log com contexto integrado
     */
    log(
        level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace',
        message: string,
        context?: Record<string, unknown>,
        error?: Error | BaseSDKError,
    ): void {
        if (error && 'code' in error) {
            this.logger[level](message, { ...error }, context);
        } else if (error) {
            this.logger[level](message, undefined, {
                ...context,
                errorMessage: error.message,
                errorStack: error.stack,
            });
        } else {
            this.logger[level](message, undefined, context);
        }
    }

    /**
     * Log evento automaticamente
     */
    logEvent(event: AnyEvent, context?: Record<string, unknown>): void {
        this.logger.logEvent(event, context);
    }

    /**
     * Log operação com timing
     */
    async logOperation<T>(
        operation: string,
        fn: () => Promise<T> | T,
        context?: Record<string, unknown>,
    ): Promise<T> {
        const startTime = Date.now();

        this.logger.logOperationStart(operation, context);

        try {
            const result = await fn();
            this.logger.logOperationEnd(operation, startTime, context);
            return result;
        } catch (error) {
            this.logger.logOperationError(
                operation,
                error as Error,
                startTime,
                context,
            );
            throw error;
        }
    }

    // ========================================================================
    // 4️⃣ COMPONENT ACCESS
    // ========================================================================

    /**
     * Obtém logger
     */
    getLogger(): CoreLogger {
        return this.logger;
    }

    /**
     * Obtém event bus
     */
    getEventBus(): ObservabilityEventBus {
        return this.eventBus;
    }

    /**
     * Obtém timeline manager
     */
    getTimelineManager() {
        return getTimelineManager();
    }

    /**
     * Obtém telemetry
     */
    getTelemetry() {
        return getTelemetry();
    }

    /**
     * Obtém monitoring
     */
    getMonitoring() {
        return getLayeredMetricsSystem();
    }

    /**
     * Obtém debugging
     */
    getDebugging() {
        return getGlobalDebugSystem();
    }

    /**
     * Obtém timeline viewer
     */
    getTimelineViewer(): TimelineViewer {
        return createTimelineViewer();
    }

    /**
     * Obtém memory leak detector
     */
    getMemoryLeakDetector(): MemoryLeakDetector | null {
        return this.memoryLeakDetector;
    }

    // ========================================================================
    // 5️⃣ CONFIGURATION MANAGEMENT
    // ========================================================================

    /**
     * Obtém configuração atual
     */
    getConfig(): UnifiedObservabilityConfig {
        return { ...this.config };
    }

    /**
     * Atualiza configuração
     */
    updateConfig(config: Partial<UnifiedObservabilityConfig>): void {
        this.config = { ...this.config, ...config };

        // Reconfigurar componentes
        if (config.logger) {
            configureGlobalLogger(this.config.logger);
            this.logger = getGlobalLogger();
        }

        if (config.eventBus) {
            this.eventBus.updateConfig(this.config.eventBus);
        }

        this.logger.info('Configuration updated', {
            component: 'integrated-observability',
            changes: Object.keys(config),
        });
    }

    /**
     * Otimiza para performance
     */
    optimizeForPerformance(): void {
        this.config = optimizeConfigForPerformance(this.config);
        this.updateConfig(this.config);
    }

    /**
     * Configura para debug
     */
    configureForDebug(): void {
        this.config = configureForDebug(this.config);
        this.updateConfig(this.config);
    }

    // ========================================================================
    // 6️⃣ HEALTH & MONITORING
    // ========================================================================

    /**
     * Health check do sistema
     */
    getHealthStatus(): {
        healthy: boolean;
        components: Record<string, { healthy: boolean; issues: string[] }>;
        overall: { issues: string[]; stats: unknown };
    } {
        const eventBusHealth = this.eventBus.getHealthStatus();
        const memoryLeakDetectorHealth = this.getMemoryLeakDetectorHealth();

        const components = {
            logger: { healthy: true, issues: [] },
            eventBus: {
                healthy: eventBusHealth.healthy,
                issues: eventBusHealth.issues,
            },
            memoryLeakDetector: memoryLeakDetectorHealth,
            timeline: { healthy: true, issues: [] },
            telemetry: { healthy: true, issues: [] },
            monitoring: { healthy: true, issues: [] },
            debugging: { healthy: true, issues: [] },
        };

        const allIssues = Object.values(components).flatMap((c) => c.issues);
        const overall = {
            issues: allIssues,
            stats: {
                eventBus: eventBusHealth.stats,
                memoryLeakDetector: this.memoryLeakDetector?.getStats(),
                config: {
                    environment: this.config.environment,
                    performance:
                        this.config.performance.enableHighPerformanceMode,
                },
            },
        };

        return {
            healthy: allIssues.length === 0,
            components,
            overall,
        };
    }

    /**
     * Obtém health status do memory leak detector
     */
    private getMemoryLeakDetectorHealth(): {
        healthy: boolean;
        issues: string[];
    } {
        if (!this.memoryLeakDetector) {
            return {
                healthy: false,
                issues: ['Memory leak detector not initialized'],
            };
        }

        const stats = this.memoryLeakDetector.getStats();
        const currentMetrics = this.memoryLeakDetector.getCurrentMetrics();
        const recentAlerts = this.memoryLeakDetector.getRecentAlerts(5);

        const issues: string[] = [];

        // Check if detector is running
        if (!stats.isRunning) {
            issues.push('Memory leak detector is not running');
        }

        // Check risk level
        if (currentMetrics.riskLevel === 'critical') {
            issues.push('Critical memory leak risk detected');
        } else if (currentMetrics.riskLevel === 'high') {
            issues.push('High memory leak risk detected');
        }

        // Check for recent critical alerts
        const criticalAlerts = recentAlerts.filter(
            (alert) => alert.severity === 'critical',
        );
        if (criticalAlerts.length > 0) {
            issues.push(
                `${criticalAlerts.length} critical memory leak alerts in last check`,
            );
        }

        // Check memory usage
        if (currentMetrics.memoryUsage.heapUsagePercent > 90) {
            issues.push('High heap usage detected');
        }

        // Check resource counts
        if (currentMetrics.resourceCounts.activeTimers > 500) {
            issues.push('High number of active timers detected');
        }

        if (currentMetrics.resourceCounts.pendingPromises > 1000) {
            issues.push('High number of pending promises detected');
        }

        return {
            healthy: issues.length === 0,
            issues,
        };
    }

    /**
     * Obtém estatísticas
     */
    getStats(): {
        system: unknown;
        eventBus: unknown;
        memoryLeakDetector: unknown;
        config: unknown;
    } {
        return {
            system: {
                initialized: this.initialized,
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
            },
            eventBus: this.eventBus.getStats(),
            memoryLeakDetector: this.memoryLeakDetector?.getStats() || null,
            config: {
                environment: this.config.environment,
                performance: this.config.performance,
                integration: this.config.integration,
            },
        };
    }

    // ========================================================================
    // 7️⃣ LIFECYCLE
    // ========================================================================

    /**
     * Shutdown graceful
     */
    async shutdown(): Promise<void> {
        this.logger.info('Shutting down integrated observability system', {
            component: 'integrated-observability',
        });

        // Shutdown memory leak detector
        if (this.memoryLeakDetector) {
            await this.memoryLeakDetector.shutdown();
        }

        // Shutdown event bus
        await this.eventBus.shutdown();

        // Flush logger
        await this.logger.flush();

        this.initialized = false;
    }
}

// ============================================================================
// 8️⃣ SINGLETON INSTANCE
// ============================================================================

/**
 * Instância global do sistema integrado
 */
let globalIntegratedObservability: IntegratedObservabilitySystem | undefined;

/**
 * Obtém sistema integrado global
 */
export function getIntegratedObservability(): IntegratedObservabilitySystem {
    if (!globalIntegratedObservability) {
        globalIntegratedObservability = new IntegratedObservabilitySystem();
    }
    return globalIntegratedObservability;
}

/**
 * Configura sistema integrado global
 */
export function configureIntegratedObservability(
    config: Partial<UnifiedObservabilityConfig>,
): void {
    globalIntegratedObservability = new IntegratedObservabilitySystem(config);
}

/**
 * Inicializa sistema global
 */
export async function initializeObservability(
    config?: Partial<UnifiedObservabilityConfig>,
): Promise<IntegratedObservabilitySystem> {
    if (config) {
        configureIntegratedObservability(config);
    }

    const system = getIntegratedObservability();
    await system.initialize();
    return system;
}

// ============================================================================
// 9️⃣ CONVENIENCE EXPORTS
// ============================================================================

/**
 * Re-export principais componentes
 */
export {
    CoreLogger,
    ObservabilityEventBus,
    TimelineViewer,
    MemoryLeakDetector,
    type UnifiedObservabilityConfig,
    type Environment,
    type EventBusConfig,
    type MemoryLeakDetectorConfig,
    type MemoryLeakMetrics,
    type MemoryLeakAlert,
    CONFIGS,
    createAutoConfig,
    createObservabilityConfig,
    getEnvironmentConfig,
    validateConfig,
    optimizeConfigForPerformance,
    configureForDebug,
};

/**
 * Re-export funções de conveniência
 */
export {
    publishEvent,
    subscribeToEvent,
    subscribeToAllEvents,
    getGlobalLogger,
    getGlobalEventBus,
    createTimelineViewer,
};

/**
 * Helper para quick setup
 */
export async function quickSetup(
    environment: Environment = 'development',
    overrides: Partial<UnifiedObservabilityConfig> = {},
): Promise<IntegratedObservabilitySystem> {
    const config = createObservabilityConfig(environment, overrides);
    return await initializeObservability(config);
}

/**
 * Helper para production setup
 */
export async function productionSetup(
    overrides: Partial<UnifiedObservabilityConfig> = {},
): Promise<IntegratedObservabilitySystem> {
    const config = optimizeConfigForPerformance(
        createObservabilityConfig('production', overrides),
    );
    return await initializeObservability(config);
}

/**
 * Helper para debug setup
 */
export async function debugSetup(
    overrides: Partial<UnifiedObservabilityConfig> = {},
): Promise<IntegratedObservabilitySystem> {
    const config = configureForDebug(
        createObservabilityConfig('development', overrides),
    );
    return await initializeObservability(config);
}
