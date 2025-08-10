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

type LogContextProvider = () => LogContext | undefined;
let globalLogContextProvider: LogContextProvider | undefined;

export function setLogContextProvider(
    provider: LogContextProvider | undefined,
): void {
    globalLogContextProvider = provider;
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
        console.debug(formattedMessage, mergeContext(context));
    }

    info(message: string, context?: LogContext): void {
        if (!this.shouldLog('info')) return;
        const formattedMessage = this.formatMessage('info', message);
        console.log(formattedMessage, mergeContext(context));
    }

    warn(message: string, context?: LogContext): void {
        if (!this.shouldLog('warn')) return;
        const formattedMessage = this.formatMessage('warn', message);
        console.warn(formattedMessage, mergeContext(context));
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
    }
}

export type LoggerProvider = 'simple' | 'pino';
let currentLoggerProvider: LoggerProvider =
    process.env.KODUS_LOGGER === 'pino' ? 'pino' : 'simple';

export function setLoggerProvider(provider: LoggerProvider): void {
    currentLoggerProvider = provider;
}

/**
 * Criar logger para o framework
 */
export function createLogger(name: string, level?: LogLevel): Logger {
    if (currentLoggerProvider !== 'pino') {
        return new SimpleLogger(name, level);
    }

    // Start with simple and upgrade to pino asynchronously if available
    const simple = new SimpleLogger(name, level);
    let pinoLogger: {
        debug: (obj: unknown, msg: string) => void;
        info: (obj: unknown, msg: string) => void;
        warn: (obj: unknown, msg: string) => void;
        error: (obj: unknown, msg: string) => void;
    } | null = null;

    (async () => {
        try {
            const mod = (await import('pino')) as unknown;
            const factory =
                (
                    mod as {
                        default?: (opts: { name: string; level: string }) => {
                            debug: (obj: unknown, msg: string) => void;
                            info: (obj: unknown, msg: string) => void;
                            warn: (obj: unknown, msg: string) => void;
                            error: (obj: unknown, msg: string) => void;
                        };
                    }
                ).default ||
                (mod as (opts: { name: string; level: string }) => {
                    debug: (obj: unknown, msg: string) => void;
                    info: (obj: unknown, msg: string) => void;
                    warn: (obj: unknown, msg: string) => void;
                    error: (obj: unknown, msg: string) => void;
                });
            pinoLogger = factory({
                name,
                level: (level || 'info').toLowerCase(),
            });
        } catch {
            // keep simple
        }
    })().catch(() => {});

    const adapter: Logger = {
        debug: (message, context) =>
            pinoLogger
                ? pinoLogger.debug(context || {}, message)
                : simple.debug(message, context),
        info: (message, context) =>
            pinoLogger
                ? pinoLogger.info(context || {}, message)
                : simple.info(message, context),
        warn: (message, context) =>
            pinoLogger
                ? pinoLogger.warn(context || {}, message)
                : simple.warn(message, context),
        error: (message, error, context) =>
            pinoLogger
                ? pinoLogger.error(
                      {
                          ...(context || {}),
                          ...(error && {
                              errorName: error.name,
                              errorMessage: error.message,
                              errorStack: error.stack,
                          }),
                      },
                      message,
                  )
                : simple.error(message, error, context),
    };

    return adapter;
}

/**
 * Logger global para compatibilidade
 */
export const logger = createLogger('kodus-flow');
