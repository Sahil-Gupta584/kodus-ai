// Add module-level re-entrancy guard

import {
    LogContext,
    LogContextProvider,
    Logger,
    LogLevel,
    LogProcessor,
} from '@/core/types/allTypes.js';

// Global state for logging
export let globalLogContextProvider: LogContextProvider | undefined;
export let globalLogProcessors: LogProcessor[] = [];
export let isProcessingLog = false;

export function setLogContextProvider(
    provider: LogContextProvider | undefined,
): void {
    globalLogContextProvider = provider;
}

/**
 * Add a global log processor
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

function mergeContext(context?: LogContext): LogContext | undefined {
    try {
        const base = globalLogContextProvider?.();
        if (!base) return context;
        return { ...base, ...context };
    } catch {
        return context;
    }
}

/**
 * Process log through global processors
 */
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
        // Fail silently to prevent infinite loops
        console.warn('Log processor failed:', processorError);
    } finally {
        isProcessingLog = false;
    }
}

class SimpleLogger implements Logger {
    private componentName: string;
    private level: LogLevel;

    constructor(name: string, level: LogLevel = 'info') {
        this.componentName = name;
        this.level = level;
    }

    private shouldLog(level: LogLevel): boolean {
        const levels: Record<LogLevel, number> = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3,
        };
        return levels[level] >= levels[this.level];
    }

    private formatMessage(
        level: LogLevel,
        message: string,
        _context?: LogContext,
    ): string {
        const timestamp = new Date().toISOString();
        const levelUpper = level.toUpperCase();
        return `[${timestamp}] [${levelUpper}] [${this.componentName}] ${message}`;
    }

    debug(message: string, context?: LogContext): void {
        if (!this.shouldLog('debug')) return;
        const formattedMessage = this.formatMessage('debug', message);
        console.debug(formattedMessage, mergeContext(context));
        processLog('debug', message, this.componentName, context);
    }

    info(message: string, context?: LogContext): void {
        if (!this.shouldLog('info')) return;
        const formattedMessage = this.formatMessage('info', message);
        console.log(formattedMessage, mergeContext(context));
        processLog('info', message, this.componentName, context);
    }

    warn(message: string, context?: LogContext): void {
        if (!this.shouldLog('warn')) return;
        const formattedMessage = this.formatMessage('warn', message);
        console.warn(formattedMessage, mergeContext(context));
        processLog('warn', message, this.componentName, context);
    }

    error(message: string, error?: Error, context?: LogContext): void {
        if (!this.shouldLog('error')) return;
        const formattedMessage = this.formatMessage('error', message);

        const errorContext = {
            ...context,
            ...(error && {
                errorName: error.name,
                errorMessage: error.message,
                errorStack: error.stack,
            }),
        };

        console.error(formattedMessage, mergeContext(errorContext));
        processLog('error', message, this.componentName, errorContext, error);
    }
}

export function createLogger(name: string, level?: LogLevel): Logger {
    return new SimpleLogger(name, level);
}

export const logger = createLogger('kodus-flow');
