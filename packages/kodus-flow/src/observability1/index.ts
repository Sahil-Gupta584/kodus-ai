/**
 * @module observability1/index
 * @description Production-ready observability system with dependency injection
 *
 * IMPROVEMENTS FROM ORIGINAL:
 * - ✅ Dependency injection for testability
 * - ✅ Ring buffers prevent memory leaks
 * - ✅ Circuit breakers for resilience
 * - ✅ Real CPU metrics (no Math.random!)
 * - ✅ Factory pattern replaces globals
 * - ✅ Type-safe configuration
 * - ✅ Proper error handling
 * - ✅ Configurable sampling strategies
 */

// ============================================================================
// EXPORTS - Clean API
// ============================================================================

// Core interfaces
import type { Logger, LogLevel, LoggerOutput } from './logger.js';

import type { Span, SpanOptions, TelemetryConfig } from './telemetry.js';

import type {
    HealthStatus,
    MetricsExportFormat,
    MonitoringConfig,
    ApplicationMetricsCollector,
} from './monitoring.js';

import type {
    PerformanceMeasurement,
    DebugOutput,
    DebugConfig,
    DebugReport,
} from './debugging.js';

import {
    LoggerFactory,
    ConsoleLoggerOutput,
    FileLoggerOutput,
} from './logger.js';

import {
    TelemetryFactory,
    TelemetrySystem,
    ProbabilisticSampling,
} from './telemetry.js';

import { MonitoringFactory, MonitoringSystem } from './monitoring.js';

import {
    DebugFactory,
    DebugSystem,
    ConsoleDebugOutput,
    FileDebugOutput,
} from './debugging.js';

export type {
    Logger,
    LogLevel,
    LogContext,
    LogEntry,
    LoggerOutput,
    LoggerConfig,
} from './logger.js';

export type {
    Tracer,
    Span,
    SpanStatus,
    SpanContext,
    SpanOptions,
    SpanProcessor,
    SpanData,
    SamplingStrategy,
    TelemetryConfig,
} from './telemetry.js';

export type {
    SystemMetrics,
    HealthStatus,
    MetricsCollector,
    MonitoringConfig,
    MetricsExportFormat,
    ApplicationMetricsCollector,
} from './monitoring.js';

export type {
    DebugEntry,
    PerformanceMeasurement,
    StateSnapshot,
    EventTrace,
    DebugOutput,
    DebugConfig,
    DebugReport,
} from './debugging.js';

// Factories
export {
    LoggerFactory,
    createLogger,
    createLoggerFactory,
    setDefaultLoggerFactory,
    ConsoleLoggerOutput,
    FileLoggerOutput,
} from './logger.js';

export {
    TelemetryFactory,
    InMemoryTracer,
    TelemetrySystem,
    ProbabilisticSampling,
    AlwaysOnSampling,
    AlwaysOffSampling,
    RingBuffer,
    CircuitBreaker,
} from './telemetry.js';

export {
    MonitoringFactory,
    MonitoringSystem,
    ProcessMetricsCollector,
    EventLoopMetricsCollector,
} from './monitoring.js';

export {
    DebugFactory,
    DebugSystem,
    ConsoleDebugOutput,
    MemoryDebugOutput,
    FileDebugOutput,
} from './debugging.js';

// ============================================================================
// UNIFIED OBSERVABILITY SYSTEM
// ============================================================================

/**
 * Unified observability configuration
 */
export interface ObservabilityConfig {
    // Environment
    environment: 'development' | 'staging' | 'production';
    serviceName: string;
    serviceVersion?: string;

    // Logging
    logging: {
        enabled: boolean;
        level: LogLevel;
        enableFile?: boolean;
        filePath?: string;
    };

    // Telemetry
    telemetry: {
        enabled: boolean;
        samplingRate: number;
        maxSpanHistory?: number;
        spanTimeoutMs?: number;
        globalAttributes?: Record<string, string | number | boolean>;
    };

    // Monitoring
    monitoring: {
        enabled: boolean;
        collectionIntervalMs?: number;
        historySize?: number;
        healthThresholds?: {
            memory?: { warning: number; critical: number };
            cpu?: { warning: number; critical: number };
            eventLoopLag?: { warning: number; critical: number };
            errorRate?: { warning: number; critical: number };
        };
    };

    // Debugging
    debugging: {
        enabled: boolean;
        level?: LogLevel;
        features?: {
            eventTracing?: boolean;
            performanceProfiling?: boolean;
            stateInspection?: boolean;
            errorAnalysis?: boolean;
        };
        historyLimits?: {
            maxEntries?: number;
            maxMeasurements?: number;
            maxSnapshots?: number;
            maxTraces?: number;
        };
    };

    // Output configuration
    outputs?: {
        console?: boolean;
        file?: {
            enabled: boolean;
            basePath: string;
        };
        custom?: Array<{
            logger?: LoggerOutput;
            debug?: DebugOutput;
        }>;
    };
}

/**
 * Context provider for automatic context injection
 */
export interface ObservabilityContext {
    correlationId?: string;
    tenantId?: string;
    userId?: string;
    sessionId?: string;
    [key: string]: unknown;
}

/**
 * Context provider function
 */
export type ContextProvider = () => ObservabilityContext | undefined;

/**
 * Unified observability system with dependency injection
 */
export class ObservabilitySystem {
    private loggerFactory: LoggerFactory;
    private telemetryFactory: TelemetryFactory;
    private monitoringFactory: MonitoringFactory;
    private debugFactory: DebugFactory;

    private logger: Logger;
    private telemetry: TelemetrySystem;
    private monitoring: MonitoringSystem;
    private debug: DebugSystem;

    private contextProvider?: ContextProvider;

    constructor(
        private readonly config: ObservabilityConfig,
        dependencies?: {
            loggerFactory?: LoggerFactory;
            telemetryFactory?: TelemetryFactory;
            monitoringFactory?: MonitoringFactory;
            debugFactory?: DebugFactory;
            contextProvider?: ContextProvider;
        },
    ) {
        // Initialize factories (with DI support)
        this.loggerFactory =
            dependencies?.loggerFactory || this.createLoggerFactory();
        this.telemetryFactory =
            dependencies?.telemetryFactory || new TelemetryFactory();
        this.monitoringFactory =
            dependencies?.monitoringFactory || new MonitoringFactory();
        this.debugFactory = dependencies?.debugFactory || new DebugFactory();
        this.contextProvider = dependencies?.contextProvider;

        // Initialize systems
        this.logger = this.createLoggerSystem();
        this.telemetry = this.createTelemetrySystem();
        this.monitoring = this.createMonitoringSystem();
        this.debug = this.createDebugSystem();

        this.logger.info('ObservabilitySystem initialized', {
            environment: config.environment,
            serviceName: config.serviceName,
            components: {
                logging: config.logging.enabled,
                telemetry: config.telemetry.enabled,
                monitoring: config.monitoring.enabled,
                debugging: config.debugging.enabled,
            },
        });
    }

    // ========================================================================
    // Public API - Clean and Simple
    // ========================================================================

    /**
     * Get logger for component
     */
    getLogger(component: string): Logger {
        return this.logger.child(component);
    }

    /**
     * Get telemetry system
     */
    getTelemetry(): TelemetrySystem {
        return this.telemetry;
    }

    /**
     * Get monitoring system
     */
    getMonitoring(): MonitoringSystem {
        return this.monitoring;
    }

    /**
     * Get debug system
     */
    getDebug(): DebugSystem {
        return this.debug;
    }

    /**
     * Start a span with automatic context
     */
    startSpan(name: string, options?: SpanOptions): Span {
        const context = this.contextProvider?.();
        const attributes = context ? this.contextToAttributes(context) : {};

        return this.telemetry.startSpan(name, {
            ...options,
            attributes: { ...attributes, ...options?.attributes },
        });
    }

    /**
     * Execute function with span
     */
    async withSpan<T>(
        name: string,
        fn: (span: Span) => T | Promise<T>,
        options?: SpanOptions,
    ): Promise<T> {
        const span = this.startSpan(name, options);
        return this.telemetry.withSpan(span, () => fn(span));
    }

    /**
     * Measure operation performance
     */
    async measure<T>(
        name: string,
        fn: () => T | Promise<T>,
        category: string = 'general',
    ): Promise<{ result: T; measurement: PerformanceMeasurement }> {
        const context = this.contextProvider?.();
        return this.debug.measure(name, fn, {
            category,
            correlationId: context?.correlationId as string,
        });
    }

    /**
     * Log with automatic context
     */
    log(
        level: LogLevel,
        message: string,
        data?: Record<string, unknown>,
    ): void {
        const context = this.contextProvider?.();
        const enrichedData = context ? { ...context, ...data } : data;

        switch (level) {
            case 'debug':
                this.logger.debug(message, enrichedData);
                break;
            case 'info':
                this.logger.info(message, enrichedData);
                break;
            case 'warn':
                this.logger.warn(message, enrichedData);
                break;
            case 'error':
                this.logger.error(message, data?.error as Error, enrichedData);
                break;
        }
    }

    /**
     * Record custom metric
     */
    recordMetric(name: string, value: number): void {
        const appCollector = this.findApplicationCollector();
        if (appCollector) {
            appCollector.setCustomMetric(name, value);
        }
    }

    /**
     * Increment counter metric
     */
    incrementMetric(name: string, delta: number = 1): void {
        const appCollector = this.findApplicationCollector();
        if (appCollector) {
            appCollector.incrementCustomMetric(name, delta);
        }
    }

    /**
     * Get current health status
     */
    getHealthStatus(): HealthStatus {
        return this.monitoring.calculateHealthStatus();
    }

    /**
     * Export metrics in format
     */
    exportMetrics(format: MetricsExportFormat): string {
        return this.monitoring.exportMetrics(format);
    }

    /**
     * Generate debug report
     */
    generateDebugReport(): DebugReport {
        return this.debug.generateReport();
    }

    /**
     * Set context provider
     */
    setContextProvider(provider: ContextProvider): void {
        this.contextProvider = provider;
    }

    /**
     * Update configuration
     */
    updateConfig(updates: Partial<ObservabilityConfig>): void {
        Object.assign(this.config, updates);

        // TODO: Propagate updates to subsystems
        this.logger.info('Configuration updated', { updates });
    }

    /**
     * Flush all systems
     */
    async flush(): Promise<void> {
        await Promise.allSettled([this.logger.flush(), this.debug.flush()]);
    }

    /**
     * Dispose all systems
     */
    async dispose(): Promise<void> {
        this.logger.info('Disposing ObservabilitySystem');

        await Promise.allSettled([
            this.logger.flush(),
            this.debug.dispose(),
            this.monitoring.dispose(),
        ]);
    }

    // ========================================================================
    // Private Implementation
    // ========================================================================

    private createLoggerFactory(): LoggerFactory {
        const outputs: LoggerOutput[] = [];

        if (this.config.outputs?.console !== false) {
            outputs.push(new ConsoleLoggerOutput());
        }

        if (this.config.logging.enableFile && this.config.logging.filePath) {
            outputs.push(new FileLoggerOutput(this.config.logging.filePath));
        }

        // Add custom outputs
        if (this.config.outputs?.custom) {
            for (const custom of this.config.outputs.custom) {
                if (custom.logger) {
                    outputs.push(custom.logger);
                }
            }
        }

        return new LoggerFactory({
            level: this.config.logging.level,
            outputs,
            contextProvider: this.contextProvider,
        });
    }

    private createLoggerSystem(): Logger {
        return this.loggerFactory.createLogger('observability');
    }

    private createTelemetrySystem(): TelemetrySystem {
        const sampling = new ProbabilisticSampling(
            this.config.telemetry.samplingRate,
        );

        const telemetryConfig: TelemetryConfig = {
            enabled: this.config.telemetry.enabled,
            serviceName: this.config.serviceName,
            serviceVersion: this.config.serviceVersion,
            sampling,
            maxSpanHistory: this.config.telemetry.maxSpanHistory,
            spanTimeoutMs: this.config.telemetry.spanTimeoutMs,
            globalAttributes: this.config.telemetry.globalAttributes,
        };

        return this.telemetryFactory.createTelemetrySystem(telemetryConfig);
    }

    private createMonitoringSystem(): MonitoringSystem {
        const monitoringConfig: Partial<MonitoringConfig> = {
            enabled: this.config.monitoring.enabled,
            collectionIntervalMs: this.config.monitoring.collectionIntervalMs,
            historySize: this.config.monitoring.historySize,
            healthThresholds: this.config.monitoring.healthThresholds
                ? {
                      memory: this.config.monitoring.healthThresholds
                          .memory || { warning: 75, critical: 90 },
                      cpu: this.config.monitoring.healthThresholds.cpu || {
                          warning: 80,
                          critical: 95,
                      },
                      eventLoopLag: this.config.monitoring.healthThresholds
                          .eventLoopLag || { warning: 100, critical: 500 },
                      errorRate: this.config.monitoring.healthThresholds
                          .errorRate || { warning: 5, critical: 10 },
                  }
                : {
                      memory: { warning: 75, critical: 90 },
                      cpu: { warning: 80, critical: 95 },
                      eventLoopLag: { warning: 100, critical: 500 },
                      errorRate: { warning: 5, critical: 10 },
                  },
        };

        return this.monitoringFactory.createMonitoringSystem(monitoringConfig);
    }

    private createDebugSystem(): DebugSystem {
        const outputs: DebugOutput[] = [];

        if (this.config.outputs?.console !== false) {
            outputs.push(new ConsoleDebugOutput());
        }

        if (
            this.config.outputs?.file?.enabled &&
            this.config.outputs.file.basePath
        ) {
            const debugFilePath = `${this.config.outputs.file.basePath}/debug.log`;
            outputs.push(new FileDebugOutput(debugFilePath));
        }

        // Add custom debug outputs
        if (this.config.outputs?.custom) {
            for (const custom of this.config.outputs.custom) {
                if (custom.debug) {
                    outputs.push(custom.debug);
                }
            }
        }

        const debugConfig: Partial<DebugConfig> = {
            enabled: this.config.debugging.enabled,
            level: this.config.debugging.level,
            features: this.config.debugging.features
                ? {
                      eventTracing:
                          this.config.debugging.features.eventTracing ?? true,
                      performanceProfiling:
                          this.config.debugging.features.performanceProfiling ??
                          true,
                      stateInspection:
                          this.config.debugging.features.stateInspection ??
                          true,
                      errorAnalysis:
                          this.config.debugging.features.errorAnalysis ?? true,
                  }
                : {
                      eventTracing: true,
                      performanceProfiling: true,
                      stateInspection: true,
                      errorAnalysis: true,
                  },
            outputs,
            historyLimits: this.config.debugging.historyLimits
                ? {
                      maxEntries:
                          this.config.debugging.historyLimits.maxEntries ??
                          10000,
                      maxMeasurements:
                          this.config.debugging.historyLimits.maxMeasurements ??
                          5000,
                      maxSnapshots:
                          this.config.debugging.historyLimits.maxSnapshots ??
                          1000,
                      maxTraces:
                          this.config.debugging.historyLimits.maxTraces ?? 5000,
                  }
                : {
                      maxEntries: 10000,
                      maxMeasurements: 5000,
                      maxSnapshots: 1000,
                      maxTraces: 5000,
                  },
        };

        return this.debugFactory.createDebugSystem(debugConfig);
    }

    private contextToAttributes(
        context: ObservabilityContext,
    ): Record<string, string | number | boolean> {
        const attributes: Record<string, string | number | boolean> = {};

        for (const [key, value] of Object.entries(context)) {
            if (
                typeof value === 'string' ||
                typeof value === 'number' ||
                typeof value === 'boolean'
            ) {
                attributes[key] = value;
            }
        }

        return attributes;
    }

    private findApplicationCollector():
        | ApplicationMetricsCollector
        | undefined {
        const collectors = (
            this.monitoring as unknown as { collectors: Map<string, unknown> }
        ).collectors; // Access private field
        if (collectors instanceof Map) {
            return collectors.get('application') as ApplicationMetricsCollector;
        }
        return undefined;
    }
}

// ============================================================================
// FACTORY AND CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Observability factory for dependency injection
 */
export class ObservabilityFactory {
    createObservabilitySystem(
        config: ObservabilityConfig,
        dependencies?: {
            loggerFactory?: LoggerFactory;
            telemetryFactory?: TelemetryFactory;
            monitoringFactory?: MonitoringFactory;
            debugFactory?: DebugFactory;
            contextProvider?: ContextProvider;
        },
    ): ObservabilitySystem {
        return new ObservabilitySystem(config, dependencies);
    }

    createDefaultConfig(
        overrides: Partial<ObservabilityConfig> = {},
    ): ObservabilityConfig {
        const isProduction = process.env.NODE_ENV === 'production';

        const defaultConfig: ObservabilityConfig = {
            environment:
                (process.env.NODE_ENV as
                    | 'development'
                    | 'staging'
                    | 'production') || 'development',
            serviceName: 'kodus-flow',
            serviceVersion: '1.0.0',

            logging: {
                enabled: true,
                level: isProduction ? 'info' : 'debug',
                enableFile: isProduction,
                filePath: isProduction ? './logs/app.log' : undefined,
            },

            telemetry: {
                enabled: true,
                samplingRate: isProduction ? 0.1 : 1.0,
                maxSpanHistory: 1000,
                spanTimeoutMs: 5 * 60 * 1000, // 5 minutes
            },

            monitoring: {
                enabled: true,
                collectionIntervalMs: 30000, // 30 seconds
                historySize: 1000,
                healthThresholds: {
                    memory: { warning: 75, critical: 90 },
                    cpu: { warning: 80, critical: 95 },
                    eventLoopLag: { warning: 100, critical: 500 },
                    errorRate: { warning: 5, critical: 10 },
                },
            },

            debugging: {
                enabled: !isProduction,
                level: 'debug',
                features: {
                    eventTracing: true,
                    performanceProfiling: true,
                    stateInspection: !isProduction,
                    errorAnalysis: true,
                },
                historyLimits: {
                    maxEntries: isProduction ? 5000 : 10000,
                    maxMeasurements: 5000,
                    maxSnapshots: 1000,
                    maxTraces: 5000,
                },
            },

            outputs: {
                console: true,
                file: {
                    enabled: isProduction,
                    basePath: './logs',
                },
            },
        };

        return { ...defaultConfig, ...overrides };
    }
}

/**
 * Global observability instance (singleton for convenience)
 */
let globalObservability: ObservabilitySystem | undefined;

/**
 * Get or create global observability system
 */
export function getObservability(
    config?: Partial<ObservabilityConfig>,
): ObservabilitySystem {
    if (!globalObservability) {
        const factory = new ObservabilityFactory();
        const fullConfig = factory.createDefaultConfig(config);
        globalObservability = factory.createObservabilitySystem(fullConfig);
    }

    return globalObservability;
}

/**
 * Set global observability system (for testing)
 */
export function setObservability(system: ObservabilitySystem): void {
    globalObservability = system;
}

/**
 * Reset global observability system (for testing)
 */
export function resetObservability(): void {
    globalObservability = undefined;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Quick access functions using global instance
 */
export const observability = {
    getLogger: (component: string) => getObservability().getLogger(component),
    startSpan: (name: string, options?: SpanOptions) =>
        getObservability().startSpan(name, options),
    withSpan: <T>(
        name: string,
        fn: (span: Span) => T | Promise<T>,
        options?: SpanOptions,
    ) => getObservability().withSpan(name, fn, options),
    measure: <T>(name: string, fn: () => T | Promise<T>, category?: string) =>
        getObservability().measure(name, fn, category),
    log: (level: LogLevel, message: string, data?: Record<string, unknown>) =>
        getObservability().log(level, message, data),
    recordMetric: (name: string, value: number) =>
        getObservability().recordMetric(name, value),
    incrementMetric: (name: string, delta?: number) =>
        getObservability().incrementMetric(name, delta),
    getHealthStatus: () => getObservability().getHealthStatus(),
    exportMetrics: (format: MetricsExportFormat) =>
        getObservability().exportMetrics(format),
    generateDebugReport: () => getObservability().generateDebugReport(),
};

/**
 * Default export for convenience
 */
export default {
    observabilitySystem: ObservabilitySystem,
    observabilityFactory: ObservabilityFactory,
    getObservability,
    setObservability,
    resetObservability,
    observability,
};
