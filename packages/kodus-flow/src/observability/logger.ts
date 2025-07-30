/**
 * @module observability/logger
 * @description Logger simples e direto para o framework Kodus Flow
 *
 * Responsabilidades:
 * - Logging estruturado básico
 * - Contexto simples
 * - Performance mínima
 * - Compatibilidade com todo o framework
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
    [key: string]: unknown;
}

/**
 * Logger interface simples
 */
export interface Logger {
    debug(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, error?: Error, context?: LogContext): void;
}

/**
 * Logger simples para o framework
 */
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
        console.debug(formattedMessage, context);
    }

    info(message: string, context?: LogContext): void {
        if (!this.shouldLog('info')) return;
        const formattedMessage = this.formatMessage('info', message);
        console.log(formattedMessage, context);
    }

    warn(message: string, context?: LogContext): void {
        if (!this.shouldLog('warn')) return;
        const formattedMessage = this.formatMessage('warn', message);
        console.warn(formattedMessage, context);
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

        console.error(formattedMessage, errorContext);
    }
}

/**
 * Criar logger para o framework
 */
export function createLogger(name: string, level?: LogLevel): Logger {
    return new SimpleLogger(name, level);
}

/**
 * Logger global para compatibilidade
 */
export const logger = createLogger('kodus-flow');
