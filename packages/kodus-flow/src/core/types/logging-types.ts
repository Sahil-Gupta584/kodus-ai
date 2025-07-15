/**
 * Logging types used in the SDK
 *
 * These types define the logging system that provides observability
 * for the SDK's operations.
 */
import { z } from 'zod';
import { logLevelSchema } from '../../observability/debugging.js';

/**
 * Logger configuration schema and type
 */
export const loggerConfigSchema = z.object({
    minLevel: logLevelSchema.default('info'),
    enableConsole: z.boolean().default(true),
    enableTelemetry: z.boolean().default(false),
    context: z.record(z.string(), z.unknown()).optional(),
});
export type LoggerConfig = z.infer<typeof loggerConfigSchema>;

/**
 * Log entry schema and type
 */
export const logEntrySchema = z.object({
    timestamp: z.string().datetime(),
    level: logLevelSchema,
    message: z.string(),
    context: z.record(z.string(), z.unknown()).optional(),
    error: z
        .object({
            name: z.string().optional(),
            message: z.string().optional(),
            stack: z.string().optional(),
            cause: z.unknown().optional(),
        })
        .optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});
export type LogEntry = z.infer<typeof logEntrySchema>;

/**
 * Logger interface
 * Defines the contract for a logger implementation
 */
export interface ILogger {
    debug(message: string, data?: Record<string, unknown>): void;
    info(message: string, data?: Record<string, unknown>): void;
    warn(message: string, data?: Record<string, unknown>): void;
    error(
        message: string,
        error?: Error | unknown,
        data?: Record<string, unknown>,
    ): void;
    withContext(context: Record<string, unknown>): ILogger;
}

/**
 * Log transport interface
 * Defines the contract for a log transport implementation
 */
export interface ILogTransport {
    log(entry: LogEntry): void;
    flush(): Promise<void>;
}

/**
 * Console log transport options schema and type
 */
export const consoleTransportOptionsSchema = z.object({
    format: z.enum(['simple', 'json', 'pretty']).default('simple'),
    colors: z.boolean().default(true),
});
export type ConsoleTransportOptions = z.infer<
    typeof consoleTransportOptionsSchema
>;

/**
 * OpenTelemetry log transport options schema and type
 */
export const otelTransportOptionsSchema = z.object({
    serviceName: z.string(),
    serviceVersion: z.string().optional(),
    resourceAttributes: z.record(z.string(), z.unknown()).optional(),
});
export type OtelTransportOptions = z.infer<typeof otelTransportOptionsSchema>;
