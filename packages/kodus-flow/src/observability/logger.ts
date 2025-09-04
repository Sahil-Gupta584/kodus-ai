import pino from 'pino';
import {
    LogContext,
    LogContextProvider,
    Logger,
    LogLevel,
    LogProcessor,
} from '../core/types/allTypes.js';

export let globalLogContextProvider: LogContextProvider | undefined;
export let globalLogProcessors: LogProcessor[] = [];
export let isProcessingLog = false;

export function setLogContextProvider(
    provider: LogContextProvider | undefined,
): void {
    globalLogContextProvider = provider;
}

export function addLogProcessor(processor: LogProcessor): void {
    globalLogProcessors.push(processor);
}

export function removeLogProcessor(processor: LogProcessor): void {
    const index = globalLogProcessors.indexOf(processor);
    if (index > -1) {
        globalLogProcessors.splice(index, 1);
    }
}

export function clearLogProcessors(): void {
    globalLogProcessors = [];
}

function mergeContext(context?: LogContext): LogContext | undefined {
    try {
        const base = globalLogContextProvider?.();
        if (!base) {
            return context;
        }
        return { ...base, ...context };
    } catch {
        return context;
    }
}

function processLog(
    level: LogLevel,
    message: string,
    component: string,
    context?: LogContext,
    error?: Error,
): void {
    if (isProcessingLog || globalLogProcessors.length === 0) {
        return;
    }

    isProcessingLog = true;
    try {
        const mergedContext = mergeContext(context);
        for (const processor of globalLogProcessors) {
            processor(level, message, component, mergedContext, error);
        }
    } catch (processorError) {
        console.warn('Log processor failed:', processorError);
    } finally {
        isProcessingLog = false;
    }
}

// Pino logger instance (singleton)
let pinoLogger: pino.Logger | null = null;

function getPinoLogger(): pino.Logger {
    if (!pinoLogger) {
        // Configure Pino with optimized settings for performance
        pinoLogger = pino({
            level: process.env.LOG_LEVEL || 'info',
            formatters: {
                level: (label) => ({ level: label }),
            },
            serializers: {
                error: pino.stdSerializers.err,
                err: pino.stdSerializers.err,
            },
            // Performance optimizations
            redact: [
                'password',
                'token',
                'secret',
                '*.password',
                '*.token',
                '*.secret',
            ],
            timestamp: pino.stdTimeFunctions.isoTime,
        });
    }
    return pinoLogger;
}

class PinoLogger implements Logger {
    private componentName: string;
    private logger: pino.Logger;

    constructor(name: string, _level?: LogLevel) {
        this.componentName = name;
        this.logger = getPinoLogger().child({ component: name });
    }

    debug(message: string, context?: LogContext): void {
        const mergedContext = mergeContext(context);
        this.logger.debug(mergedContext || {}, message);
        processLog('debug', message, this.componentName, mergedContext);
    }

    info(message: string, context?: LogContext): void {
        const mergedContext = mergeContext(context);
        this.logger.info(mergedContext || {}, message);
        processLog('info', message, this.componentName, mergedContext);
    }

    warn(message: string, context?: LogContext): void {
        const mergedContext = mergeContext(context);
        this.logger.warn(mergedContext || {}, message);
        processLog('warn', message, this.componentName, mergedContext);
    }

    error(message: string, error?: Error, context?: LogContext): void {
        const mergedContext = mergeContext(context);

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
            processLog(
                'error',
                message,
                this.componentName,
                errorContext,
                error,
            );
        } else {
            this.logger.error(mergedContext || {}, message);
            processLog('error', message, this.componentName, mergedContext);
        }
    }
}

export function createLogger(name: string, level?: LogLevel): Logger {
    return new PinoLogger(name, level);
}

export const logger = createLogger('kodus-flow');
