import { BaseSDKError } from '../core/errors.js';
import { IdGenerator } from '../utils/id-generator.js';

export * from './telemetry.js';
export { createOtelTracerAdapter, OtelTracerAdapter } from './otel-adapter.js';
export {
    startAgentSpan,
    startToolSpan,
    startLLMSpan,
    getActiveSpan,
} from './telemetry.js';

export { createLogger } from './logger.js';
export * from './execution-tracker.js';
export * from './optimized-spans.js';

import { getTelemetry, TelemetrySystem } from './telemetry.js';
import {
    DEFAULT_CONFIG,
    SILENT_CONFIG,
    LogContext,
    Logger,
    ObservabilityConfig,
    ObservabilityContext,
    ObservabilityInterface,
    ErrorCode,
} from '../core/types/allTypes.js';
import { createLogger, setLogContextProvider } from './logger.js';

export class ObservabilitySystem implements ObservabilityInterface {
    private config: ObservabilityConfig;
    private currentContext?: ObservabilityContext;

    // Component instances essenciais
    public readonly logger: Logger;
    public readonly telemetry: TelemetrySystem;
    private mongodbExporter: {
        initialize(): Promise<void>;
        exportTelemetry(item: unknown): void;
        exportLog(
            level: 'debug' | 'info' | 'warn' | 'error',
            message: string,
            component: string,
            context?: LogContext,
            error?: Error,
        ): void;
        exportError(
            error: Error,
            context?: {
                correlationId?: string;
                tenantId?: string;
                executionId?: string;
                [key: string]: unknown;
            },
        ): void;
        flush(): Promise<void>;
        dispose(): Promise<void>;
    } | null = null;

    constructor(config: Partial<ObservabilityConfig> = {}) {
        // 🔇 OPÇÃO PARA CONFIGURAÇÃO SILENCIOSA
        const baseConfig = (config as any)?.silentMode
            ? SILENT_CONFIG
            : DEFAULT_CONFIG;
        this.config = { ...baseConfig, ...config };

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

        // Initialize MongoDB Exporter if configured (legacy or via storage)
        this.logger.info('Checking MongoDB configuration...', {
            hasMongoDBConfig: !!this.config.mongodb,
            configKeys: Object.keys(this.config),
            mongodbKeys: this.config.mongodb
                ? Object.keys(this.config.mongodb)
                : [],
        });

        if (this.config.mongodb) {
            this.logger.info(
                'MongoDB config detected, initializing exporter...',
                {
                    hasConfig: !!this.config.mongodb,
                    connectionString: this.config.mongodb.connectionString,
                    database: this.config.mongodb.database,
                },
            );
            void this.initializeMongoDBExporter();
        } else {
            this.logger.info(
                'No MongoDB config detected, skipping exporter initialization',
                {
                    config: this.config,
                },
            );
        }

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

        // Setup global error handling
        this.setupGlobalErrorHandling();

        this.logger.info('Observability system initialized', {
            environment: this.config.environment,
            enabled: this.config.enabled,
            components: {
                logging: this.config.logging?.enabled,
                telemetry: this.config.telemetry?.enabled,
            },
        } as LogContext);
    }

    /**
     * Create a new observability context
     */
    createContext(correlationId?: string): ObservabilityContext {
        const context: ObservabilityContext = {
            correlationId: correlationId || this.generateCorrelationId(),
            tenantId: '',
            startTime: Date.now(),
            // ✅ NEW: Initialize executionId - will be populated by SessionService when needed
            executionId: undefined,
        };

        this.logger.debug('Observability context created', {
            correlationId: context.correlationId,
            executionId: context.executionId,
        } as LogContext);

        return context;
    }

    /**
     * Set the current observability context
     */
    setContext(context: ObservabilityContext): void {
        this.currentContext = context;

        // Context set successfully

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
    }

    /**
     * ✅ NEW: Update current context with executionId
     * (Used by SessionService when starting execution)
     */
    updateContextWithExecution(
        executionId: string,
        sessionId?: string,
        tenantId?: string,
    ): void {
        if (this.currentContext) {
            this.currentContext.executionId = executionId;
            if (sessionId) this.currentContext.sessionId = sessionId;
            if (tenantId) this.currentContext.tenantId = tenantId;

            this.logger.debug('Observability context updated with execution', {
                correlationId: this.currentContext.correlationId,
                executionId,
                sessionId,
                tenantId,
            } as LogContext);
        }
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

        const span = this.telemetry.startSpan(name, {
            attributes: {
                correlationId: execContext?.correlationId || 'unknown',
                executionId: execContext?.executionId || 'unknown',
            },
        });

        try {
            const result = await this.telemetry.withSpan(span, fn);
            span.setStatus({ code: 'ok' });

            this.logger.debug('Trace completed', {
                name,
                correlationId: execContext?.correlationId,
                success: true,
            } as LogContext);

            return result;
        } catch (error) {
            span.recordException(error as Error);

            this.logger.error(
                'Trace failed',
                error as Error,
                {
                    name,
                    correlationId: execContext?.correlationId,
                } as LogContext,
            );

            throw error;
        }
    }

    /**
     * ✅ Salva ciclo completo de execução do agente (do início ao fim)
     * Compatível com OpenTelemetry e MongoDB
     */
    async saveAgentExecutionCycle(cycle: any): Promise<void> {
        // Handle both old and new format for backward compatibility
        const agentName = cycle.agentName || cycle.agentName;
        const executionId = cycle.executionId || cycle.executionId;
        const duration =
            cycle.totalDuration ||
            (cycle.endTime ? cycle.endTime - cycle.startTime : 0);
        const hasError =
            cycle.status === 'error' ||
            !!(cycle.errors && cycle.errors.length > 0);
        const stepCount = cycle.steps
            ? cycle.steps.length
            : cycle.actions
              ? cycle.actions.length
              : 0;

        const span = this.telemetry.startSpan(`agent.${agentName}.execution`, {
            attributes: {
                agentName,
                executionId,
                cycleDuration: duration,
                actionsCount: stepCount,
                hasErrors: hasError,
                status: cycle.status || (hasError ? 'error' : 'completed'),
                correlationId: cycle.correlationId || 'unknown',
                tenantId:
                    cycle.metadata?.tenantId ||
                    this.currentContext?.tenantId ||
                    'unknown',
            },
        });

        try {
            // Structured logging of complete execution cycle
            this.logger.info('Agent execution cycle completed', {
                agentName,
                executionId,
                correlationId: cycle.correlationId,
                duration,
                stepCount,
                status: cycle.status,
                hasError,
                metadata: cycle.metadata,
                ...(cycle.error && {
                    error: {
                        name: cycle.error.name,
                        message: cycle.error.message,
                    },
                }),
            });

            // Export to MongoDB if available (maintained compatibility)
            if (this.mongodbExporter) {
                await this.mongodbExporter.exportTelemetry({
                    type: 'agent-execution-cycle',
                    agentName,
                    executionId,
                    cycle: {
                        ...cycle,
                        steps: cycle.steps || [],
                        duration,
                        status:
                            cycle.status || (hasError ? 'error' : 'completed'),
                    },
                    timestamp: Date.now(),
                    correlationId:
                        cycle.correlationId ||
                        this.currentContext?.correlationId,
                    tenantId:
                        cycle.metadata?.tenantId ||
                        this.currentContext?.tenantId,
                });
            }

            span.setStatus({ code: hasError ? 'error' : 'ok' });
        } catch (error) {
            span.recordException(error as Error);
            span.setStatus({
                code: 'error',
                message: 'Failed to save execution cycle',
            });
            throw error;
        } finally {
            span.end();
        }
    }

    /**
     * Get overall health status
     */

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
        // Get actual CPU usage without artificial work
        const usage = process.cpuUsage();
        const totalCpu = (usage.user + usage.system) / 1000000; // Convert to seconds
        const uptime = process.uptime();

        // Calculate CPU percentage (rough estimate)
        const cpuPercent = uptime > 0 ? (totalCpu / uptime) * 100 : 0;

        const isHealthy = cpuPercent < 80; // 80% threshold

        if (!isHealthy) {
            this.logger.warn('CPU usage high', {
                cpuPercent: `${cpuPercent.toFixed(1)}%`,
                totalCpuTime: `${totalCpu.toFixed(2)}s`,
                uptime: `${uptime.toFixed(0)}s`,
            });
        }

        return isHealthy;
    }

    /**
     * Check connectivity health
     */
    private async checkConnectivityHealth(): Promise<boolean> {
        // For now, just return true - connectivity checks should be done
        // at the application level with proper timeouts and specific endpoints
        return true;
    }

    /**
     * Generate unified observability report
     */

    /**
     * Flush all components
     */
    async flush(): Promise<void> {
        await Promise.allSettled([
            this.telemetry.forceFlush(),
            this.mongodbExporter?.flush(),
        ]);

        this.logger.debug('Observability system flushed');
    }

    /**
     * Dispose all components
     */
    async dispose(): Promise<void> {
        this.logger.info('Disposing observability system');

        // Clean up log processors
        try {
            const { clearLogProcessors } = await import('./logger.js');
            clearLogProcessors();
        } catch {
            // Ignore import errors during disposal
        }

        // Dispose telemetry tracer if it has dispose method
        const tracer = this.telemetry.getTracer();
        if ('dispose' in tracer && typeof tracer.dispose === 'function') {
            (tracer as { dispose(): void }).dispose();
        }

        await Promise.allSettled([
            this.mongodbExporter?.dispose(),
            this.flush(),
        ]);
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

            this.config.telemetry = {
                ...this.config.telemetry,
                sampling: { rate: 0.1, strategy: 'probabilistic' }, // 10% sampling in production
            };
        } else if (this.config.environment === 'development') {
            // Development optimizations
        } else if (this.config.environment === 'test') {
            this.config.telemetry = {
                ...this.config.telemetry,
                enabled: false, // Disable telemetry in tests
            };
        }
    }

    /**
     * Initialize MongoDB Exporter
     */
    private async initializeMongoDBExporter(): Promise<void> {
        this.logger.info('Starting MongoDB Exporter initialization...');

        try {
            const { createMongoDBExporter } = await import(
                './mongodb-exporter.js'
            );

            // Convert simple config to MongoDBExporterConfig
            const mongodbConfig = this.config.mongodb
                ? {
                      connectionString:
                          this.config.mongodb.connectionString ||
                          'mongodb://localhost:27017/kodus',
                      database: this.config.mongodb.database || 'kodus',
                      collections: {
                          logs:
                              this.config.mongodb.collections?.logs ||
                              'observability_logs',
                          telemetry:
                              this.config.mongodb.collections?.telemetry ||
                              'observability_telemetry',

                          errors:
                              this.config.mongodb.collections?.errors ||
                              'observability_errors',
                      },
                      batchSize: this.config.mongodb.batchSize || 100,
                      flushIntervalMs:
                          this.config.mongodb.flushIntervalMs || 5000,
                      maxRetries: 3,
                      ttlDays: this.config.mongodb.ttlDays || 30,
                      enableObservability:
                          this.config.mongodb.enableObservability ?? true,
                  }
                : undefined;

            this.logger.info('Creating MongoDB Exporter with config:', {
                connectionString: mongodbConfig?.connectionString,
                database: mongodbConfig?.database,
                collections: mongodbConfig?.collections,
            });

            this.mongodbExporter = await createMongoDBExporter(mongodbConfig);

            this.logger.info('Initializing MongoDB Exporter...');
            await this.mongodbExporter.initialize();

            // Add telemetry processor
            await this.telemetry.addTraceProcessor(async (items) => {
                this.logger.debug('Processing telemetry items for MongoDB:', {
                    itemCount: items.length,
                });
                for (const item of items) {
                    await this.mongodbExporter?.exportTelemetry(item);
                }
            });

            // Add log processor for MongoDB export
            const { addLogProcessor } = await import('./logger.js');
            addLogProcessor((level, message, component, context, error) => {
                this.mongodbExporter?.exportLog(
                    level,
                    message,
                    component,
                    context,
                    error,
                );

                // Export error to dedicated error collection when level is 'error'
                if (level === 'error' && error && this.mongodbExporter) {
                    const errorContext = {
                        correlationId: context?.correlationId as
                            | string
                            | undefined,
                        tenantId: context?.tenantId as string | undefined,
                        executionId: context?.executionId as string | undefined,
                        component,
                        logMessage: message,
                        ...context,
                    };
                    this.mongodbExporter.exportError(error, errorContext);
                }
            });

            this.logger.info(
                'MongoDB Exporter initialized and connected to telemetry, logging, and errors',
            );
        } catch (error) {
            this.logger.error(
                'Failed to initialize MongoDB Exporter',
                error as Error,
                {
                    errorMessage:
                        error instanceof Error ? error.message : String(error),
                } as LogContext,
            );
        }
    }

    /**
     * Setup global error handling to capture uncaught exceptions and unhandled rejections
     */
    private setupGlobalErrorHandling(): void {
        // Capture uncaught exceptions
        process.on('uncaughtException', (error: Error) => {
            this.logger.error(
                'Uncaught Exception: The process will now terminate.',
                error,
                {
                    source: 'global',
                    type: 'uncaughtException',
                },
            );

            // Log the error but don't exit - let the application decide
            // In production, you should handle this at the application level
        });

        // Capture unhandled promise rejections
        process.on(
            'unhandledRejection',
            (reason: unknown, promise: Promise<unknown>) => {
                const error =
                    reason instanceof Error
                        ? reason
                        : new Error(String(reason));

                this.logger.error(
                    'Unhandled Promise Rejection: The process will now terminate.',
                    error,
                    {
                        source: 'global',
                        type: 'unhandledRejection',
                        promise: promise.toString(),
                    },
                );
            },
        );

        this.logger.debug('Global error handling setup completed');
    }

    /**
     * Generate correlation ID
     */
    private generateCorrelationId(): string {
        return IdGenerator.correlationId();
    }

    /**
     * Check telemetry health
     */

    /**
     * Generate insights from all components
     */

    /**
     * Log an error with full observability integration
     */
    logError(
        error: Error | BaseSDKError,
        message: string,
        context?: Partial<ObservabilityContext>,
    ): void {
        const currentContext = this.getContext();
        const mergedContext = {
            ...context,
            correlationId: currentContext?.correlationId,
        };

        // Log the error
        this.logger.error(message, error, mergedContext);

        // Export to MongoDB errors collection if available
        if (this.mongodbExporter) {
            this.mongodbExporter.exportError(error, {
                correlationId: currentContext?.correlationId,
                tenantId: currentContext?.tenantId || context?.tenantId,
                executionId:
                    currentContext?.executionId || context?.executionId,
                source: 'application',
                type: 'manual',
                logMessage: message,
                ...context,
            });
        }
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

export function getObservability(
    config?: Partial<ObservabilityConfig>,
): ObservabilitySystem {
    if (!globalObservability) {
        globalObservability = new ObservabilitySystem(config);
    }
    return globalObservability;
}

/**
 * Convenience function to trace a function with observability
 */

/**
 * Middleware factory for automatic observability
 */

// ============================================================================
// AGENT EXECUTION CYCLE HELPERS
// ============================================================================

/**
 * ✅ Helper para salvar ciclo completo de execução do agente
 *
 * @example
 * ```typescript
 * import { saveAgentExecutionCycle } from '@kodus/flow/observability';
 *
 * const cycle = {
 *   startTime: Date.now(),
 *   input: userMessage,
 *   actions: [],
 *   errors: [],
 *   metadata: { version: '1.0' }
 * };
 *
 * // Durante execução
 * cycle.actions.push(agentAction);
 *
 * // Ao finalizar
 * cycle.endTime = Date.now();
 * cycle.output = result;
 *
 * await saveAgentExecutionCycle(
 *   observability,
 *   'my-agent',
 *   'exec-123',
 *   cycle
 * );
 * ```
 */

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

// ============================================================================
// HELPER FUNCTIONS (Simples e Essenciais)
// ============================================================================

/**
 * ✅ Helper simples para marcar span como bem-sucedido
 */
export function markSpanOk(
    span: any,
    attributes?: Record<string, string | number | boolean>,
): void {
    if (attributes) {
        span.setAttributes(attributes);
    }
    span.setStatus({ code: 'ok' });
}

/**
 * ✅ Helper simples para aplicar erro ao span
 */
export function applyErrorToSpan(
    span: any,
    error: Error,
    attributes?: Record<string, string | number | boolean>,
): void {
    if (attributes) {
        span.setAttributes(attributes);
    }
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
}
