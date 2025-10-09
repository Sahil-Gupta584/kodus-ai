import pino from 'pino';
import { LogLevel, LogContext, LogProcessor } from './types.js';

/**
 * Simple and robust logger implementation
 */

let pinoLogger: pino.Logger | null = null;
let globalLogProcessors: LogProcessor[] = [];
let spanContextProvider:
    | (() => { traceId: string; spanId: string } | undefined)
    | null = null;
let observabilityContextProvider:
    | (() =>
          | {
                correlationId?: string;
                tenantId?: string;
                sessionId?: string;
            }
          | undefined)
    | null = null;

/**
 * Get or create Pino logger instance
 */
function getPinoLogger(): pino.Logger {
    if (!pinoLogger) {
        // Determine if we should use pretty printing
        const usePretty =
            process.env.NODE_ENV === 'development' ||
            process.env.LOG_FORMAT === 'pretty';

        const loggerConfig: pino.LoggerOptions = {
            level: process.env.LOG_LEVEL || 'info',
            formatters: {
                level: (label) => ({ level: label }),
            },
            serializers: {
                error: pino.stdSerializers.err,
                err: pino.stdSerializers.err,
                req: pino.stdSerializers.req,
                res: pino.stdSerializers.res,
            },
            redact: {
                paths: [
                    'password',
                    'token',
                    'secret',
                    'apiKey',
                    'authorization',
                    '*.password',
                    '*.token',
                    '*.secret',
                    '*.apiKey',
                    '*.authorization',
                    'req.headers.authorization',
                    'req.headers["x-api-key"]',
                ],
                censor: '[REDACTED]',
            },
            timestamp: pino.stdTimeFunctions.isoTime,
        };

        // Use pretty printing in development
        if (usePretty) {
            pinoLogger = pino({
                ...loggerConfig,
                transport: {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        translateTime: 'SYS:standard',
                        ignore: 'pid,hostname',
                    },
                },
            });
        } else {
            // Production: JSON format with performance optimizations
            pinoLogger = pino({
                ...loggerConfig,
                // Performance optimizations for production
                base: {
                    pid: process.pid,
                    hostname: undefined, // Remove hostname for smaller logs
                },
            });
        }
    }
    return pinoLogger;
}

/**
 * Simple logger class with Pino integration
 */
export class SimpleLogger {
    private logger: pino.Logger;
    private component: string;

    constructor(component: string) {
        this.component = component;
        this.logger = getPinoLogger().child({
            component,
            service: 'kodus-observability',
        });
    }

    debug(message: string, context?: LogContext): void {
        const mergedContext = this.mergeContext(context);
        this.logger.debug(mergedContext, message);
        this.processLog('debug', message, mergedContext);
    }

    info(message: string, context?: LogContext): void {
        const mergedContext = this.mergeContext(context);
        this.logger.info(mergedContext, message);
        this.processLog('info', message, mergedContext);
    }

    warn(message: string, context?: LogContext): void {
        const mergedContext = this.mergeContext(context);
        this.logger.warn(mergedContext, message);
        this.processLog('warn', message, mergedContext);
    }

    error(message: string, error?: Error, context?: LogContext): void {
        const mergedContext = this.mergeContext(context);

        if (error) {
            const errorContext = {
                ...mergedContext,
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                },
            };
            this.logger.error(errorContext, message);
            this.processLog('error', message, errorContext, error);
        } else {
            this.logger.error(mergedContext, message);
            this.processLog('error', message, mergedContext);
        }
    }

    private mergeContext(context?: LogContext): LogContext | undefined {
        if (!context) {
            const base: LogContext = {} as any;
            return this.attachTracingContext(base);
        }

        const sanitized = this.sanitizeContext(context);

        const withDefaults: LogContext = {
            ...sanitized,
            ...(sanitized.component === undefined && this.component
                ? { component: this.component }
                : {}),
        } as any;

        return this.attachTracingContext(withDefaults);
    }

    private sanitizeContext(context: LogContext): LogContext {
        const sanitized: any = {};
        const sensitiveKeyPattern =
            /pass(word)?|token|secret|api[-_]?key|authorization|access[-_]?key|refresh[-_]?token|cookie|set-cookie|cpf|cnpj/i;

        for (const [key, value] of Object.entries(context)) {
            if (sensitiveKeyPattern.test(key)) {
                sanitized[key] = '[REDACTED]';
                continue;
            }

            if (typeof value === 'object' && value !== null) {
                if (key.toLowerCase() === 'headers') {
                    sanitized[key] = this.sanitizeHeaders(value as any);
                    continue;
                }
                sanitized[key] = this.truncateObject(value);
            } else if (typeof value === 'string') {
                sanitized[key] =
                    value.length > 1000
                        ? value.substring(0, 1000) + '...'
                        : value;
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    private sanitizeHeaders(
        headers: Record<string, unknown>,
    ): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        const redact = new Set([
            'authorization',
            'cookie',
            'set-cookie',
            'x-api-key',
            'x-access-token',
        ]);
        for (const [h, v] of Object.entries(headers || {})) {
            if (redact.has(h.toLowerCase())) {
                out[h] = '[REDACTED]';
            } else if (typeof v === 'string' && v.length > 500) {
                out[h] = v.substring(0, 500) + '...';
            } else {
                out[h] = v;
            }
        }
        return out;
    }

    private truncateObject(obj: any, depth = 0): any {
        if (depth > 3) return '[Object too deep]';

        if (Array.isArray(obj)) {
            return obj
                .slice(0, 10)
                .map((item) =>
                    typeof item === 'object'
                        ? this.truncateObject(item, depth + 1)
                        : item,
                );
        }

        if (typeof obj === 'object' && obj !== null) {
            const truncated: any = {};
            let count = 0;
            for (const [key, value] of Object.entries(obj)) {
                if (count >= 20) break; // Limit number of properties
                truncated[key] =
                    typeof value === 'object'
                        ? this.truncateObject(value, depth + 1)
                        : value;
                count++;
            }
            return truncated;
        }

        return obj;
    }

    private attachTracingContext(ctx: LogContext): LogContext {
        const out: any = { ...ctx };

        try {
            const sc = spanContextProvider ? spanContextProvider() : undefined;

            if (sc) {
                if (out.traceId === undefined) out.traceId = sc.traceId;
                if (out.spanId === undefined) out.spanId = sc.spanId;
            }
        } catch {}
        try {
            const oc = observabilityContextProvider
                ? observabilityContextProvider()
                : undefined;

            if (oc) {
                if (
                    out.correlationId === undefined &&
                    oc.correlationId !== undefined
                ) {
                    out.correlationId = oc.correlationId;

                    if (
                        out.tenantId === undefined &&
                        oc.tenantId !== undefined
                    ) {
                        out.tenantId = oc.tenantId;
                    }
                }

                if (out.sessionId === undefined && oc.sessionId !== undefined) {
                    out.sessionId = oc.sessionId;
                }
            }
        } catch {}
        return out;
    }

    /**
     * Log with structured performance timing
     */
    performance(
        operation: string,
        duration: number,
        context?: LogContext,
    ): void {
        this.info(`Performance: ${operation}`, {
            ...context,
            performance: {
                operation,
                duration,
                unit: 'ms',
            },
        });
    }

    /**
     * Log security-related events
     */
    security(message: string, context?: LogContext): void {
        this.warn(`SECURITY: ${message}`, {
            ...context,
            security: true,
            timestamp: new Date().toISOString(),
        });
    }

    /**
     * Log business metrics
     */
    business(event: string, data: Record<string, any>): void {
        this.info(`BUSINESS: ${event}`, {
            business: {
                event,
                ...data,
            },
        });
    }

    private processLog(
        level: LogLevel,
        message: string,
        context?: LogContext,
        error?: Error,
    ): void {
        if (context && (context as any).skipProcessors === true) {
            return; // allow internal logs without re-processing/exporting
        }
        for (const processor of globalLogProcessors) {
            try {
                processor.process(level, message, context, error);
            } catch (processorError) {
                console.error('Log processor failed:', processorError);
            }
        }
    }
}

/**
 * Create a logger instance
 */
export function createLogger(component: string): SimpleLogger {
    return new SimpleLogger(component);
}

/**
 * Add a log processor
 */
export function addLogProcessor(processor: LogProcessor): void {
    globalLogProcessors.push(processor);
}

/**
 * Remove a log processor
 */
export function removeLogProcessor(processor: LogProcessor): void {
    const index = globalLogProcessors.indexOf(processor);
    if (index > -1) {
        globalLogProcessors.splice(index, 1);
    }
}

/**
 * Clear all log processors
 */
export function clearLogProcessors(): void {
    globalLogProcessors = [];
}

/**
 * Allow ObservabilitySystem to control runtime log level
 */
export function setGlobalLogLevel(level: LogLevel | string): void {
    const logger = getPinoLogger();
    // Pino accepts broader levels; keep flexible
    logger.level = level as any;
}

/**
 * Allow ObservabilitySystem to provide current span context for log correlation
 */
export function setSpanContextProvider(
    provider: (() => { traceId: string; spanId: string } | undefined) | null,
): void {
    spanContextProvider = provider;
}

/**
 * Allow ObservabilitySystem to provide current observability context
 */
export function setObservabilityContextProvider(
    provider:
        | (() =>
              | {
                    correlationId?: string;
                    tenantId?: string;
                    sessionId?: string;
                }
              | undefined)
        | null,
): void {
    observabilityContextProvider = provider;
}
