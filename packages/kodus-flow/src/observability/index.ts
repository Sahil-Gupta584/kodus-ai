import type { Event } from '../core/types/events.js';
import { BaseSDKError, type ErrorCode } from '../core/errors.js';
import { IdGenerator } from '../utils/id-generator.js';
import dns from 'dns';

export * from './telemetry.js';
export * from './monitoring.js';
export * from './debugging.js';
export { createOtelTracerAdapter, OtelTracerAdapter } from './otel-adapter.js';
export {
    startAgentSpan,
    startToolSpan,
    startLLMSpan,
    type AgentPhase,
    type AgentSpanAttributes,
    type ToolSpanAttributes,
    type LLMSpanAttributes,
} from './telemetry.js';

export type { LogLevel, LogContext } from './logger.js';
export { createLogger, type Logger } from './logger.js';

import {
    createLogger,
    type Logger,
    type LogLevel,
    type LogContext,
    setLogContextProvider,
} from './logger.js';
import {
    getTelemetry,
    type TelemetrySystem,
    type TelemetryConfig,
} from './telemetry.js';
import {
    getLayeredMetricsSystem,
    type LayeredMetricsSystem as ResourceMonitor,
    type MetricsConfig as MonitoringConfig,
    type SystemMetrics as ResourceMetrics,
} from './monitoring.js';
import {
    getGlobalDebugSystem,
    type DebugSystem,
    type DebugConfig,
    type DebugReport,
} from './debugging.js';

/**
 * OpenTelemetry-compatible context
 */
export interface OtelContext {
    traceId?: string;
    spanId?: string;
    parentSpanId?: string;
    correlationId?: string;
    [key: string]: unknown;
}

/**
 * Unified observability configuration
 */
export interface ObservabilityConfig {
    enabled: boolean;
    environment: 'development' | 'production' | 'test';
    debug: boolean;
    logging?: {
        enabled?: boolean;
        level?: LogLevel;
        outputs?: string[];
        filePath?: string;
    };
    telemetry?: Partial<TelemetryConfig>;
    monitoring?: Partial<MonitoringConfig>;
    debugging?: Partial<DebugConfig>;
    mongodb?: {
        type: 'mongodb';
        connectionString?: string;
        database?: string;
        collections?: {
            logs?: string;
            telemetry?: string;
            metrics?: string;
            errors?: string;
        };
        batchSize?: number;
        flushIntervalMs?: number;
        ttlDays?: number;
        enableObservability?: boolean;
    };
    correlation?: {
        enabled: boolean;
        generateIds: boolean;
        propagateContext: boolean;
    };
}

/**
 * Observability context for correlated operations
 */
export interface ObservabilityContext extends OtelContext {
    tenantId?: string;
    executionId?: string;
    metadata?: Record<string, unknown>;
}

/**
 * Resource leak information
 */
interface ResourceLeak {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    timestamp: number;
}

/**
 * Unified observability interface
 */
export interface ObservabilityInterface {
    logger: Logger;
    telemetry: TelemetrySystem;
    monitor: ResourceMonitor | null;
    debug: DebugSystem;
    createContext(correlationId?: string): ObservabilityContext;
    setContext(context: ObservabilityContext): void;
    getContext(): ObservabilityContext | undefined;
    clearContext(): void;

    trace<T>(
        name: string,
        fn: () => T | Promise<T>,
        context?: Partial<ObservabilityContext>,
    ): Promise<T>;
    measure<T>(
        name: string,
        fn: () => T | Promise<T>,
        category?: string,
    ): Promise<{ result: T; duration: number }>;

    logError(
        error: Error | BaseSDKError,
        message: string,
        context?: Partial<ObservabilityContext>,
    ): void;
    wrapAndLogError(
        error: unknown,
        code: ErrorCode,
        message?: string,
        context?: Partial<ObservabilityContext>,
    ): BaseSDKError;

    getHealthStatus(): HealthStatus;
    generateReport(): UnifiedReport;

    updateConfig(config: Partial<ObservabilityConfig>): void;

    flush(): Promise<void>;
    dispose(): Promise<void>;
}

/**
 * Health status interface
 */
export interface HealthStatus {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    components: {
        logging: { status: 'ok' | 'warning' | 'error'; message?: string };
        telemetry: { status: 'ok' | 'warning' | 'error'; message?: string };
        monitoring: { status: 'ok' | 'warning' | 'error'; message?: string };
        debugging: { status: 'ok' | 'warning' | 'error'; message?: string };
    };
    lastCheck: number;
}

/**
 * Unified observability report
 */
export interface UnifiedReport {
    timestamp: number;
    environment: string;
    health: HealthStatus;

    // Summary insights
    insights: {
        warnings: string[];
        recommendations: string[];
        criticalIssues: string[];
    };
}

/**
 * Default observability configuration
 */
const DEFAULT_CONFIG: ObservabilityConfig = {
    enabled: true,
    environment: 'development',
    debug: false,

    logging: {
        enabled: true,
        level: 'warn',
        outputs: ['console'],
    },

    telemetry: {
        enabled: true,
        serviceName: 'kodus-flow',
        sampling: { rate: 1.0, strategy: 'probabilistic' },
        features: {
            traceEvents: true,
            traceKernel: true,
            traceSnapshots: false,
            tracePersistence: false,
            metricsEnabled: true,
        },
    },

    monitoring: {
        enabled: true,
        collectionIntervalMs: 30000,
        retentionPeriodMs: 24 * 60 * 60 * 1000, // 24 hours
        enableRealTime: true,
        enableHistorical: true,
        maxMetricsHistory: 1000,
        exportFormats: ['json'] as ('json' | 'prometheus' | 'statsd')[],
    },

    debugging: {
        enabled: false, // Disabled by default
        level: 'debug',
        features: {
            eventTracing: true,
            performanceProfiling: true,
            stateInspection: true,
            errorAnalysis: true,
        },
    },

    correlation: {
        enabled: true,
        generateIds: true,
        propagateContext: true,
    },
};

/**
 * Main observability system
 */
export class ObservabilitySystem implements ObservabilityInterface {
    private config: ObservabilityConfig;
    private currentContext?: ObservabilityContext;

    // Component instances
    public readonly logger: Logger;
    public readonly telemetry: TelemetrySystem;
    public readonly monitor: ResourceMonitor | null = null;
    private setMonitor(system: ResourceMonitor | null): void {
        (this as unknown as { monitor: ResourceMonitor | null }).monitor =
            system;
    }
    public readonly debug: DebugSystem;

    constructor(config: Partial<ObservabilityConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Auto-detect environment
        if (!config.environment) {
            this.config.environment = this.detectEnvironment();
        }

        // Adjust configuration based on environment
        this.adjustConfigForEnvironment();

        // Initialize components
        this.logger = createLogger('observability', this.config.logging?.level);
        this.telemetry = getTelemetry(this.config.telemetry);
        // Propagar contexto para atributos default de spans
        this.telemetry.setContextProvider(() => {
            const ctx = this.getContext();
            return ctx
                ? {
                      tenantId: ctx.tenantId,
                      correlationId: ctx.correlationId,
                      executionId: ctx.executionId,
                  }
                : undefined;
        });
        // Auto-init metrics if enabled and not present (DX)
        if (this.config.monitoring?.enabled) {
            const existing = getLayeredMetricsSystem();
            if (existing) {
                this.setMonitor(existing);
            } else {
                // Lazy schedule init to avoid await in ctor
                this.setMonitor(null);
                const doInit = async () => {
                    try {
                        const { ensureMetricsSystem } = await import(
                            './monitoring.js'
                        );
                        this.setMonitor(
                            ensureMetricsSystem({
                                enabled: true,
                                collectionIntervalMs:
                                    this.config.monitoring
                                        ?.collectionIntervalMs ?? 30000,
                                retentionPeriodMs:
                                    this.config.monitoring?.retentionPeriodMs ??
                                    24 * 60 * 60 * 1000,
                                enableRealTime:
                                    this.config.monitoring?.enableRealTime ??
                                    true,
                                enableHistorical:
                                    this.config.monitoring?.enableHistorical ??
                                    true,
                                maxMetricsHistory:
                                    this.config.monitoring?.maxMetricsHistory ??
                                    1000,
                                exportFormats: this.config.monitoring
                                    ?.exportFormats ?? ['json'],
                            }),
                        );
                    } catch {
                        // ignore
                    }
                };
                void doInit();
            }
        } else {
            this.setMonitor(null);
        }
        this.debug = getGlobalDebugSystem(this.config.debugging);

        // Inject automatic correlation into logs
        setLogContextProvider(() => {
            const ctx = this.getContext();
            if (!ctx) return undefined;
            return {
                correlationId: ctx.correlationId,
                tenantId: ctx.tenantId,
                executionId: ctx.executionId,
            };
        });

        this.logger.info('Observability system initialized', {
            environment: this.config.environment,
            enabled: this.config.enabled,
            components: {
                logging: this.config.logging?.enabled,
                telemetry: this.config.telemetry?.enabled,
                monitoring: this.config.monitoring?.enabled,
                debugging: this.config.debugging?.enabled,
            },
        } as LogContext);
    }

    /**
     * Create a new observability context
     */
    createContext(correlationId?: string): ObservabilityContext {
        const context: ObservabilityContext = {
            correlationId: correlationId || this.generateCorrelationId(),
        };

        this.logger.debug('Observability context created', {
            correlationId: context.correlationId,
        } as LogContext);

        return context;
    }

    /**
     * Set the current observability context
     */
    setContext(context: ObservabilityContext): void {
        this.currentContext = context;

        // Propagate to debug system
        this.debug.setCorrelationId(context.correlationId || 'unknown');

        this.logger.debug('Observability context set', {
            correlationId: context.correlationId,
            tenantId: context.tenantId,
            executionId: context.executionId,
        } as LogContext);
    }

    /**
     * Get the current observability context
     */
    getContext(): ObservabilityContext | undefined {
        return this.currentContext;
    }

    /**
     * Clear the current observability context
     */
    clearContext(): void {
        if (this.currentContext) {
            this.logger.debug('Observability context cleared', {
                correlationId: this.currentContext.correlationId,
            } as LogContext);
        }

        this.currentContext = undefined;
        this.debug.clearCorrelationId();
    }

    /**
     * Trace a function with unified observability
     */
    async trace<T>(
        name: string,
        fn: () => T | Promise<T>,
        context?: Partial<ObservabilityContext>,
    ): Promise<T> {
        // Create or use existing context
        const execContext = context
            ? { ...this.currentContext, ...context }
            : this.currentContext;
        if (execContext) {
            this.setContext(execContext as ObservabilityContext);
        }

        // Start telemetry span
        const rootAttributes: Record<string, string | number | boolean> = {};
        if (execContext?.correlationId)
            rootAttributes['correlation.id'] = execContext.correlationId;
        if (execContext?.tenantId)
            rootAttributes['tenant.id'] = execContext.tenantId;
        if (execContext?.executionId)
            rootAttributes['execution.id'] = execContext.executionId;
        const span = this.telemetry.startSpan(name, {
            attributes: rootAttributes,
        });

        // Start debug measurement
        const measurementId = this.debug.startMeasurement(name, 'trace', {
            correlationId: execContext?.correlationId,
        });

        const startTime = Date.now();

        try {
            const result = await this.telemetry.withSpan(span, async () => {
                const r = await fn();
                span.setStatus({ code: 'ok' });
                return r;
            });

            const duration = Date.now() - startTime;
            this.debug.endMeasurement(measurementId);

            this.logger.debug('Trace completed', {
                name,
                duration,
                correlationId: execContext?.correlationId,
                success: true,
            } as LogContext);

            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            this.debug.endMeasurement(measurementId);

            span.recordException(error as Error);

            this.logger.error(
                'Trace failed',
                error as Error,
                {
                    name,
                    duration,
                    correlationId: execContext?.correlationId,
                } as LogContext,
            );

            throw error;
        }
    }

    /**
     * Measure a function execution with unified metrics
     */
    async measure<T>(
        name: string,
        fn: () => T | Promise<T>,
        category: string = 'general',
    ): Promise<{ result: T; duration: number }> {
        const { result, measurement } = await this.debug.measure(
            name,
            fn,
            category,
            {
                correlationId: this.currentContext?.correlationId,
            },
        );

        // Record in telemetry
        if (measurement && typeof measurement.duration === 'number') {
            this.telemetry.recordMetric(
                'histogram',
                `measurement.${category}`,
                measurement.duration,
                {
                    name,
                },
            );
        }

        return { result, duration: (measurement && measurement.duration) ?? 0 };
    }

    /**
     * Get overall health status
     */
    getHealthStatus(): HealthStatus {
        const monitorMetrics = this.monitor?.getSystemMetrics();
        const debugReport = this.debug.generateReport();

        // Calculate component health
        const components = {
            logging: this.checkLoggingHealth(),
            telemetry: this.checkTelemetryHealth(),
            monitoring: this.checkMonitoringHealth(monitorMetrics),
            debugging: this.checkDebuggingHealth(debugReport),
        };

        // Calculate overall health
        const healthScores = Object.values(components).map((c) =>
            c.status === 'ok' ? 100 : c.status === 'warning' ? 70 : 30,
        );
        const overallScore = Math.floor(
            healthScores.reduce((a, b) => a + b, 0) / healthScores.length,
        );

        let overall: 'healthy' | 'degraded' | 'unhealthy';
        if (overallScore >= 80) overall = 'healthy';
        else if (overallScore >= 60) overall = 'degraded';
        else overall = 'unhealthy';

        return {
            overall,
            components,
            lastCheck: Date.now(),
        };
    }

    /**
     * Run basic health checks
     */
    async runHealthChecks(): Promise<{
        memory: boolean;
        cpu: boolean;
        connectivity: boolean;
        overall: boolean;
    }> {
        const checks = {
            memory: this.checkMemoryHealth(),
            cpu: this.checkCpuHealth(),
            connectivity: await this.checkConnectivityHealth(),
        };

        const overall = Object.values(checks).every((check) => check);

        // Log health check results
        this.logger.info('Health checks completed', {
            checks,
            overall,
            timestamp: Date.now(),
        });

        return { ...checks, overall };
    }

    /**
     * Check memory health
     */
    private checkMemoryHealth(): boolean {
        const used = process.memoryUsage();
        const heapUsed = used.heapUsed / 1024 / 1024; // MB
        const heapTotal = used.heapTotal / 1024 / 1024; // MB
        const usagePercent = (heapUsed / heapTotal) * 100;

        const isHealthy = usagePercent < 80;

        if (!isHealthy) {
            this.logger.warn('Memory usage high', {
                heapUsed: `${heapUsed.toFixed(2)}MB`,
                heapTotal: `${heapTotal.toFixed(2)}MB`,
                usagePercent: `${usagePercent.toFixed(1)}%`,
            });
        }

        return isHealthy;
    }

    /**
     * Check CPU health
     */
    private checkCpuHealth(): boolean {
        // Simple CPU check - in production you'd want more sophisticated monitoring
        const startUsage = process.cpuUsage();

        // Simulate some work to measure CPU
        for (let i = 0; i < 1000000; i++) {
            Math.random();
        }

        const endUsage = process.cpuUsage(startUsage);
        const cpuPercent = (endUsage.user + endUsage.system) / 1000000; // Seconds

        const isHealthy = cpuPercent < 0.1; // 100ms max

        if (!isHealthy) {
            this.logger.warn('CPU usage high', {
                cpuTime: `${cpuPercent.toFixed(3)}s`,
            });
        }

        return isHealthy;
    }

    /**
     * Check connectivity health
     */
    private async checkConnectivityHealth(): Promise<boolean> {
        // Simple connectivity check - in production you'd check actual endpoints
        try {
            // Check if we can resolve DNS
            return new Promise<boolean>((resolve) => {
                dns.lookup('google.com', (err: Error | null) => {
                    resolve(!err);
                });
            });
        } catch {
            // If DNS check fails, assume connectivity is OK for now
            return true;
        }
    }

    /**
     * Generate unified observability report
     */
    generateReport(): UnifiedReport {
        const health = this.getHealthStatus();
        const monitorMetrics = this.monitor?.getSystemMetrics();
        const debugReport = this.debug.generateReport();
        const leaks: ResourceLeak[] = []; // Mock leaks for now

        // Generate insights
        const insights = this.generateInsights(
            health,
            monitorMetrics,
            debugReport,
            leaks,
        );

        return {
            timestamp: Date.now(),
            environment: this.config.environment,
            health,

            insights,
        };
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<ObservabilityConfig>): void {
        this.config = { ...this.config, ...config };

        // Update component configurations
        if (config.telemetry) {
            this.telemetry.updateConfig(config.telemetry);
        }

        if (config.debugging) {
            this.debug.updateConfig(config.debugging);
        }

        this.logger.info('Observability configuration updated', {
            environment: this.config.environment,
        } as LogContext);
    }

    /**
     * Flush all components
     */
    async flush(): Promise<void> {
        await Promise.allSettled([
            this.debug.flush(),
            this.telemetry.forceFlush(),
        ]);

        this.logger.debug('Observability system flushed');
    }

    /**
     * Dispose all components
     */
    async dispose(): Promise<void> {
        this.logger.info('Disposing observability system');

        // Dispose telemetry tracer if it has dispose method
        const tracer = this.telemetry.getTracer();
        if ('dispose' in tracer && typeof tracer.dispose === 'function') {
            (tracer as { dispose(): void }).dispose();
        }

        await Promise.allSettled([this.debug.dispose(), this.flush()]);

        this.monitor?.stop?.();
        this.clearContext();
    }

    /**
     * Detect environment automatically
     */
    private detectEnvironment(): 'development' | 'production' | 'test' {
        if (process.env.NODE_ENV === 'test') return 'test';
        if (process.env.NODE_ENV === 'production') return 'production';
        return 'development';
    }

    /**
     * Adjust configuration based on environment
     */
    private adjustConfigForEnvironment(): void {
        if (this.config.environment === 'production') {
            // Production optimizations
            this.config.debugging = {
                ...this.config.debugging,
                enabled: false,
                features: {
                    eventTracing:
                        this.config.debugging?.features?.eventTracing ?? true,
                    performanceProfiling:
                        this.config.debugging?.features?.performanceProfiling ??
                        true,
                    stateInspection:
                        this.config.debugging?.features?.stateInspection ??
                        true,
                    errorAnalysis: true,
                },
            };

            this.config.telemetry = {
                ...this.config.telemetry,
                sampling: { rate: 0.1, strategy: 'probabilistic' }, // 10% sampling in production
            };
        } else if (this.config.environment === 'development') {
            // Development optimizations
            this.config.debugging = {
                ...this.config.debugging,
                enabled: true,
                features: {
                    eventTracing: true,
                    performanceProfiling: true,
                    stateInspection: true,
                    errorAnalysis: true,
                },
            };
        } else if (this.config.environment === 'test') {
            // Test optimizations
            this.config.monitoring = {
                ...this.config.monitoring,
                enabled: false, // Disable monitoring in tests
            };

            this.config.telemetry = {
                ...this.config.telemetry,
                enabled: false, // Disable telemetry in tests
            };
        }
    }

    /**
     * Generate correlation ID
     */
    private generateCorrelationId(): string {
        return IdGenerator.correlationId();
    }

    /**
     * Check logging health
     */
    private checkLoggingHealth(): {
        status: 'ok' | 'warning' | 'error';
        message?: string;
    } {
        // Simple health check - could be enhanced
        return { status: 'ok' };
    }

    /**
     * Check telemetry health
     */
    private checkTelemetryHealth(): {
        status: 'ok' | 'warning' | 'error';
        message?: string;
    } {
        const telemetryConfig = this.telemetry.getConfig();
        if (!telemetryConfig.enabled) {
            return { status: 'warning', message: 'Telemetry disabled' };
        }
        return { status: 'ok' };
    }

    /**
     * Check monitoring health
     */
    private checkMonitoringHealth(metrics?: ResourceMetrics): {
        status: 'ok' | 'warning' | 'error';
        message?: string;
    } {
        if (!metrics) {
            return { status: 'error', message: 'No metrics available' };
        }

        if (metrics.health.overallHealth === 'unhealthy') {
            return {
                status: 'error',
                message: `Health score: ${metrics.health.overallHealth}`,
            };
        }

        if (metrics.health.overallHealth === 'degraded') {
            return {
                status: 'warning',
                message: `Health score: ${metrics.health.overallHealth}`,
            };
        }

        return { status: 'ok' };
    }

    /**
     * Check debugging health
     */
    private checkDebuggingHealth(report: DebugReport): {
        status: 'ok' | 'warning' | 'error';
        message?: string;
    } {
        if (!report.config.enabled) {
            return { status: 'ok', message: 'Debugging disabled' };
        }

        if (report.recentErrors.length > 5) {
            return {
                status: 'warning',
                message: `${report.recentErrors.length} recent errors`,
            };
        }

        return { status: 'ok' };
    }

    /**
     * Generate insights from all components
     */
    private generateInsights(
        health: HealthStatus,
        metrics?: ResourceMetrics,
        debugReport?: DebugReport,
        leaks?: ResourceLeak[],
    ): {
        warnings: string[];
        recommendations: string[];
        criticalIssues: string[];
    } {
        const warnings: string[] = [];
        const recommendations: string[] = [];
        const criticalIssues: string[] = [];

        // Health-based insights
        if (health.overall === 'unhealthy') {
            criticalIssues.push('System health is unhealthy');
        } else if (health.overall === 'degraded') {
            warnings.push('System health is degraded');
        }

        // Memory-based insights
        if (metrics && metrics.health.memoryUsageBytes > 1024 * 1024 * 1024) {
            // 1GB
            warnings.push('High memory utilization detected');
            recommendations.push(
                'Consider reducing memory usage or increasing heap size',
            );
        }

        // Leak detection insights
        if (leaks && leaks.length > 0) {
            criticalIssues.push(`${leaks.length} resource leak(s) detected`);
            recommendations.push(
                'Investigate resource cleanup in application code',
            );
        }

        // Error rate insights
        if (metrics && metrics.runtime.eventProcessing.failedEvents > 10) {
            warnings.push('High error rate detected');
            recommendations.push(
                'Review error logs and implement proper error handling',
            );
        }

        // Performance insights
        if (
            metrics &&
            metrics.runtime.eventProcessing.averageProcessingTimeMs > 1000
        ) {
            warnings.push('Slow event processing detected (avg > 1s)');
            recommendations.push(
                'Profile slow operations and optimize performance',
            );
        }

        // Debug insights
        if (debugReport && debugReport.recentErrors.length > 0) {
            warnings.push(
                `${debugReport.recentErrors.length} recent errors in debug trace`,
            );
        }

        return { warnings, recommendations, criticalIssues };
    }

    /**
     * Log an error with full observability integration
     */
    logError(
        error: Error | BaseSDKError,
        message: string,
        context?: Partial<ObservabilityContext>,
    ): void {
        this.logger.error(message, error, {
            ...context,
            correlationId: this.getContext()?.correlationId,
        });
    }

    /**
     * Wrap and observe an error with full tracing
     */
    wrapAndLogError(
        error: unknown,
        code: ErrorCode,
        message?: string,
        context?: Partial<ObservabilityContext>,
    ): BaseSDKError {
        // Create a simple error object since BaseSDKError is abstract
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        const wrappedError = new Error(
            message || `Error occurred: ${code}: ${errorMessage}`,
        ) as BaseSDKError & {
            code: ErrorCode;
            metadata?: Record<string, unknown>;
        };
        wrappedError.code = code;
        wrappedError.metadata = context?.metadata;

        this.logError(
            wrappedError,
            message || `Error occurred: ${code}`,
            context,
        );
        return wrappedError;
    }

    /**
     * Check if error should be retried with observability context
     */
    shouldRetryWithObservability(error: unknown): boolean {
        // Simple retry logic - can be enhanced
        return (
            error instanceof BaseSDKError && error.code !== 'PERMANENT_ERROR'
        );
    }

    /**
     * Handle silent errors with proper logging
     * Use this for errors that should be logged but not thrown
     */
    handleSilentError(
        error: unknown,
        context: string,
        additionalContext?: Record<string, unknown>,
    ): void {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        const errorName = error instanceof Error ? error.name : 'UnknownError';

        this.logger.warn(`Silent error in ${context}`, {
            errorName,
            errorMessage,
            ...additionalContext,
            correlationId: this.getContext()?.correlationId,
        });
    }
}

/**
 * Global observability instance
 */
let globalObservability: ObservabilitySystem | undefined;

/**
 * Get or create global observability system
 */
export function getObservability(
    config?: Partial<ObservabilityConfig>,
): ObservabilitySystem {
    if (!globalObservability) {
        globalObservability = new ObservabilitySystem(config);
    } else if (config) {
        globalObservability.updateConfig(config);
    }
    return globalObservability;
}

/**
 * Convenience function to trace a function with observability
 */
export function withObservability<T>(
    name: string,
    fn: () => T | Promise<T>,
    context?: Partial<ObservabilityContext>,
): Promise<T> {
    const obs = getObservability();
    return obs.trace(name, fn, context);
}

/**
 * Middleware factory for automatic observability
 */
export function createObservabilityMiddleware(
    config?: Partial<ObservabilityConfig>,
) {
    const obs = getObservability(config);

    return function observabilityMiddleware<E extends Event, R = Event | void>(
        handler: (ev: E) => Promise<R> | R,
        handlerName?: string,
    ) {
        return async function observedHandler(ev: E): Promise<R | void> {
            const context = obs.createContext();
            context.metadata = { eventType: ev.type, handlerName };
            obs.setContext(context);

            try {
                return await obs.trace(
                    `handler.${handlerName || 'anonymous'}`,
                    async () => {
                        return await handler(ev);
                    },
                    context,
                );
            } finally {
                obs.clearContext();
            }
        };
    };
}

/**
 * Gracefully shutdown observability (flush + dispose)
 */
export async function shutdownObservability(): Promise<void> {
    const obs = getObservability();
    try {
        await obs.flush();
    } finally {
        await obs.dispose();
    }
}

/**
 * Apply error details to a span with consistent attributes and status
 */
export function applyErrorToSpan(
    span: import('./telemetry.js').Span,
    error: unknown,
    attributes?: Record<string, string | number | boolean>,
): void {
    const err = error instanceof Error ? error : new Error(String(error));

    const errorAttributes: Record<string, string | number | boolean> = {
        ...(attributes || {}),
    };
    errorAttributes['error.name'] = err.name;
    errorAttributes['error.message'] = err.message;
    span.setAttributes(errorAttributes);
    span.recordException(err);
    span.setStatus({ code: 'error', message: err.message });
}

/**
 * Mark span as successful with optional attributes
 */
export function markSpanOk(
    span: import('./telemetry.js').Span,
    attributes?: Record<string, string | number | boolean>,
): void {
    if (attributes) span.setAttributes(attributes);
    span.setStatus({ code: 'ok' });
}

// ============================================================================
// INTEGRATED SYSTEM HELPERS
// ============================================================================

/**
 * Quick setup for integrated observability system
 *
 * @example
 * ```typescript
 * import { setupIntegratedObservability } from '@kodus/flow/observability';
 *
 * const obs = await setupIntegratedObservability('development');
 * obs.log('info', 'System initialized');
 * ```
 */
export async function setupIntegratedObservability(
    environment: 'development' | 'production' | 'test' = 'development',
    overrides?: Partial<ObservabilityConfig>,
) {
    const obs = getObservability({ environment, ...overrides });
    return obs;
}

/**
 * Production-ready setup with optimizations
 *
 * @example
 * ```typescript
 * import { setupProductionObservability } from '@kodus/flow/observability';
 *
 * const obs = await setupProductionObservability({
 *     logger: { level: 'warn' },
 *     performance: { enableHighPerformanceMode: true }
 * });
 * ```
 */
export async function setupProductionObservability(
    overrides?: Partial<ObservabilityConfig>,
) {
    const obs = getObservability({ environment: 'production', ...overrides });
    return obs;
}

/**
 * Development setup with full debugging
 *
 * @example
 * ```typescript
 * import { setupDebugObservability } from '@kodus/flow/observability';
 *
 * const obs = await setupDebugObservability({
 *     logger: { level: 'debug' },
 *     debugging: { enabled: true }
 * });
 * ```
 */
export async function setupDebugObservability(
    overrides?: Partial<ObservabilityConfig>,
) {
    const obs = getObservability({ environment: 'development', ...overrides });
    return obs;
}
