/**
 * @module observability/core-logger
 * @description High-performance logger baseado em Pino com event-driven architecture
 *
 * Este é o CORE do sistema de observabilidade:
 * - Usa Pino para máxima performance
 * - Structured logging com correlação automática
 * - Event-driven para tudo
 * - Otimizado para produção
 * - Centraliza TODOS os eventos do sistema
 */

import pino from 'pino';
import { IdGenerator } from '../utils/id-generator.js';
import { type EventType, type AnyEvent } from '../core/types/events.js';
import { BaseSDKError } from '../core/errors.js';

// ============================================================================
// 1️⃣ TIPOS CORE DO LOGGER
// ============================================================================

/**
 * Níveis de log otimizados para performance
 */
export type LogLevel =
    | 'fatal'
    | 'error'
    | 'warn'
    | 'info'
    | 'debug'
    | 'trace'
    | 'silent';

/**
 * Contexto estruturado para logs
 */
export interface LogContext {
    // Identificadores
    correlationId?: string;
    traceId?: string;
    spanId?: string;
    executionId?: string;
    sessionId?: string;

    // Componentes
    component?: string;
    operation?: string;
    agentName?: string;
    toolName?: string;

    // Performance
    duration?: number;
    startTime?: number;
    endTime?: number;

    // Dados específicos
    eventType?: EventType;
    eventData?: unknown;
    metadata?: Record<string, unknown>;

    // Error context
    errorCode?: string;
    errorType?: string;
    recoverable?: boolean;
    retryable?: boolean;

    // Extensível
    [key: string]: unknown;
}

/**
 * Configuração do logger
 */
export interface LoggerConfig {
    level: LogLevel;
    prettyPrint?: boolean;
    destination?: string;
    redact?: string[];
    serializers?: Record<string, (value: unknown) => unknown>;
    formatters?: {
        level?(label: string, number: number): Record<string, unknown>;
        bindings?(bindings: Record<string, unknown>): Record<string, unknown>;
        log?(object: Record<string, unknown>): Record<string, unknown>;
    };
}

/**
 * Event log entry estruturado
 */
export interface EventLogEntry {
    timestamp: number;
    level: LogLevel;
    message: string;
    context: LogContext;
    event?: {
        id: string;
        type: EventType;
        data?: unknown;
    };
    error?: {
        name: string;
        message: string;
        stack?: string;
        code?: string;
    };
}

// ============================================================================
// 2️⃣ CONFIGURAÇÕES POR AMBIENTE
// ============================================================================

/**
 * Configurações otimizadas por ambiente
 */
const ENVIRONMENT_CONFIGS: Record<string, LoggerConfig> = {
    development: {
        level: 'debug',
        prettyPrint: true,
        formatters: {
            level: (label: string) => ({ level: label }),
            bindings: (bindings: Record<string, unknown>) => ({
                pid: bindings.pid,
                hostname: bindings.hostname,
                service: 'kodus-flow',
            }),
        },
    },

    production: {
        level: 'info',
        prettyPrint: false,
        redact: ['password', 'token', 'secret', 'key'],
        formatters: {
            level: (_label: string, number: number) => ({ level: number }),
            bindings: (_bindings: Record<string, unknown>) => ({
                service: 'kodus-flow',
                version: process.env.npm_package_version || '1.0.0',
            }),
        },
    },

    test: {
        level: 'silent',
        prettyPrint: false,
    },
};

// ============================================================================
// 3️⃣ CORE LOGGER CLASS
// ============================================================================

/**
 * High-performance logger baseado em Pino
 */
export class CoreLogger {
    private pino: pino.Logger;
    private config: LoggerConfig;
    private correlationId: string | undefined;
    private contextStack: LogContext[] = [];

    constructor(config?: Partial<LoggerConfig>) {
        const env = process.env.NODE_ENV || 'development';
        this.config = {
            ...ENVIRONMENT_CONFIGS[env],
            ...config,
        } as LoggerConfig;

        this.pino = pino.default({
            level: this.config.level,
            ...(this.config.prettyPrint && {
                transport: {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        translateTime: 'HH:MM:ss Z',
                        ignore: 'pid,hostname',
                    },
                },
            }),
            redact: this.config.redact,
            serializers: this.config.serializers,
            formatters: this.config.formatters,
            base: {
                service: 'kodus-flow',
                version: process.env.npm_package_version || '1.0.0',
            },
        });
    }

    // ========================================================================
    // 4️⃣ CONTEXT MANAGEMENT
    // ========================================================================

    /**
     * Define correlation ID para todos os logs subsequentes
     */
    setCorrelationId(correlationId: string): void {
        this.correlationId = correlationId;
    }

    /**
     * Obtém correlation ID atual
     */
    getCorrelationId(): string | undefined {
        return this.correlationId;
    }

    /**
     * Limpa correlation ID
     */
    clearCorrelationId(): void {
        this.correlationId = undefined;
    }

    /**
     * Adiciona contexto ao stack
     */
    pushContext(context: Partial<LogContext>): void {
        this.contextStack.push(context as LogContext);
    }

    /**
     * Remove contexto do stack
     */
    popContext(): LogContext | undefined {
        return this.contextStack.pop();
    }

    /**
     * Obtém contexto atual (merged)
     */
    private getCurrentContext(): LogContext {
        const baseContext: LogContext = {
            correlationId: this.correlationId,
            timestamp: Date.now(),
        };

        // Merge all contexts in stack
        return this.contextStack.reduce(
            (merged, context) => ({ ...merged, ...context }),
            baseContext,
        );
    }

    // ========================================================================
    // 5️⃣ LOGGING METHODS
    // ========================================================================

    /**
     * Log fatal - sistema não pode continuar
     */
    fatal(
        message: string,
        error?: Error | BaseSDKError,
        context?: LogContext,
    ): void {
        this.log('fatal', message, error, context);
    }

    /**
     * Log error - erros que afetam operação
     */
    error(
        message: string,
        error?: Error | BaseSDKError,
        context?: LogContext,
    ): void {
        this.log('error', message, error, context);
    }

    /**
     * Log warn - situações que requerem atenção
     */
    warn(message: string, context?: LogContext): void {
        this.log('warn', message, undefined, context);
    }

    /**
     * Log info - informações gerais
     */
    info(message: string, context?: LogContext): void {
        this.log('info', message, undefined, context);
    }

    /**
     * Log debug - informações detalhadas
     */
    debug(message: string, context?: LogContext): void {
        this.log('debug', message, undefined, context);
    }

    /**
     * Log trace - informações muito detalhadas
     */
    trace(message: string, context?: LogContext): void {
        this.log('trace', message, undefined, context);
    }

    // ========================================================================
    // 6️⃣ EVENT-DRIVEN LOGGING
    // ========================================================================

    /**
     * Log evento do sistema
     */
    logEvent(event: AnyEvent, context?: LogContext): void {
        const logContext: LogContext = {
            ...this.getCurrentContext(),
            ...context,
            eventType: event.type,
            eventData: event.data,
            metadata: event.metadata,
        };

        this.log('info', `Event: ${event.type}`, undefined, logContext);
    }

    /**
     * Log início de operação
     */
    logOperationStart(operation: string, context?: LogContext): void {
        const logContext: LogContext = {
            ...this.getCurrentContext(),
            ...context,
            operation,
            startTime: Date.now(),
        };

        this.log(
            'debug',
            `Operation started: ${operation}`,
            undefined,
            logContext,
        );
    }

    /**
     * Log fim de operação
     */
    logOperationEnd(
        operation: string,
        startTime: number,
        context?: LogContext,
    ): void {
        const endTime = Date.now();
        const duration = endTime - startTime;

        const logContext: LogContext = {
            ...this.getCurrentContext(),
            ...context,
            operation,
            startTime,
            endTime,
            duration,
        };

        this.log(
            'debug',
            `Operation completed: ${operation}`,
            undefined,
            logContext,
        );
    }

    /**
     * Log erro de operação
     */
    logOperationError(
        operation: string,
        error: Error | BaseSDKError,
        startTime: number,
        context?: LogContext,
    ): void {
        const endTime = Date.now();
        const duration = endTime - startTime;

        const logContext: LogContext = {
            ...this.getCurrentContext(),
            ...context,
            operation,
            startTime,
            endTime,
            duration,
            errorCode: 'code' in error ? error.code : undefined,
            errorType: error.name,
            recoverable: 'recoverable' in error ? error.recoverable : false,
            retryable: 'retryable' in error ? error.retryable : false,
        };

        this.log('error', `Operation failed: ${operation}`, error, logContext);
    }

    /**
     * Log performance metric
     */
    logPerformance(
        metric: string,
        value: number,
        unit: string = 'ms',
        context?: LogContext,
    ): void {
        const logContext: LogContext = {
            ...this.getCurrentContext(),
            ...context,
            metric,
            value,
            unit,
        };

        this.log(
            'info',
            `Performance: ${metric} = ${value}${unit}`,
            undefined,
            logContext,
        );
    }

    // ========================================================================
    // 7️⃣ INTERNAL LOGGING
    // ========================================================================

    /**
     * Método interno de log
     */
    private log(
        level: LogLevel,
        message: string,
        error?: Error | BaseSDKError,
        context?: LogContext,
    ): void {
        if (level === 'silent') return;

        const logContext: LogContext = {
            ...this.getCurrentContext(),
            ...context,
        };

        const logEntry: Record<string, unknown> = {
            ...logContext,
            message,
        };

        if (error) {
            logEntry.error = {
                name: error.name,
                message: error.message,
                stack: error.stack,
                ...(error instanceof BaseSDKError && {
                    code: error.code,
                    recoverable: error.recoverable,
                    retryable: error.retryable,
                    context: error.context,
                }),
            };
        }

        this.pino[
            level as 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
        ](logEntry, message);
    }

    // ========================================================================
    // 8️⃣ UTILITIES
    // ========================================================================

    /**
     * Cria child logger com contexto fixo
     */
    child(context: LogContext): CoreLogger {
        const childLogger = new CoreLogger(this.config);
        childLogger.correlationId = this.correlationId;
        childLogger.contextStack = [...this.contextStack, context];
        return childLogger;
    }

    /**
     * Flush logs (importante para shutdown)
     */
    async flush(): Promise<void> {
        return new Promise((resolve) => {
            this.pino.flush(() => resolve());
        });
    }

    /**
     * Obtém configuração atual
     */
    getConfig(): LoggerConfig {
        return { ...this.config };
    }

    /**
     * Atualiza configuração
     */
    updateConfig(config: Partial<LoggerConfig>): void {
        this.config = { ...this.config, ...config };
        // Note: Pino não permite alterar configuração dinamicamente
        // Seria necessário recriar a instância
    }
}

// ============================================================================
// 9️⃣ DECORATORS E UTILITIES
// ============================================================================

/**
 * Decorator para log automático de métodos
 */
export function logOperation(operationName?: string) {
    return function (
        target: object,
        propertyKey: string,
        descriptor: PropertyDescriptor,
    ) {
        const originalMethod = descriptor.value;
        const opName =
            operationName ||
            `${(target as { constructor: { name: string } }).constructor.name}.${propertyKey}`;

        descriptor.value = async function (...args: unknown[]) {
            const logger = getGlobalLogger();
            const startTime = Date.now();

            logger.logOperationStart(opName, {
                component: (target as { constructor: { name: string } })
                    .constructor.name,
                operation: propertyKey,
            });

            try {
                const result = await originalMethod.apply(this, args);
                logger.logOperationEnd(opName, startTime);
                return result;
            } catch (error) {
                logger.logOperationError(opName, error as Error, startTime);
                throw error;
            }
        };

        return descriptor;
    };
}

/**
 * Wrapper funcional para operações
 */
export function withLogging<T extends unknown[], R>(
    fn: (...args: T) => R | Promise<R>,
    operationName: string,
    context?: LogContext,
): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
        const logger = getGlobalLogger();
        const startTime = Date.now();

        logger.logOperationStart(operationName, context);

        try {
            const result = await fn(...args);
            logger.logOperationEnd(operationName, startTime, context);
            return result;
        } catch (error) {
            logger.logOperationError(
                operationName,
                error as Error,
                startTime,
                context,
            );
            throw error;
        }
    };
}

// ============================================================================
// 🔟 INSTÂNCIA GLOBAL
// ============================================================================

/**
 * Instância global do logger
 */
let globalLogger: CoreLogger | undefined;

/**
 * Obtém logger global
 */
export function getGlobalLogger(): CoreLogger {
    if (!globalLogger) {
        globalLogger = new CoreLogger();
    }
    return globalLogger;
}

/**
 * Configura logger global
 */
export function configureGlobalLogger(config: Partial<LoggerConfig>): void {
    globalLogger = new CoreLogger(config);
}

/**
 * Cria logger específico
 */
export function createLogger(context?: LogContext): CoreLogger {
    const logger = new CoreLogger();
    if (context) {
        logger.pushContext(context);
    }
    return logger;
}

// ============================================================================
// 1️⃣1️⃣ MIDDLEWARE PARA CORRELAÇÃO AUTOMÁTICA
// ============================================================================

/**
 * Middleware para correlação automática
 */
export function createCorrelationMiddleware<T extends AnyEvent>() {
    return function correlationMiddleware(
        handler: (event: T) => Promise<unknown> | unknown,
        context?: LogContext,
    ) {
        return async function correlatedHandler(event: T) {
            const logger = getGlobalLogger();
            const correlationId =
                event.metadata?.correlationId || IdGenerator.correlationId();

            logger.setCorrelationId(correlationId);

            if (context) {
                logger.pushContext(context);
            }

            try {
                logger.logEvent(event, {
                    component: 'event-handler',
                    operation: 'handle',
                });

                const result = await handler(event);

                return result;
            } finally {
                if (context) {
                    logger.popContext();
                }
                logger.clearCorrelationId();
            }
        };
    };
}

// ============================================================================
// 1️⃣2️⃣ EXPORTS PARA RETROCOMPATIBILIDADE
// ============================================================================

/**
 * Interface compatível com logger antigo
 */
export interface CompatibleLogger {
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(
        message: string,
        error?: Error,
        context?: Record<string, unknown>,
    ): void;
}

/**
 * Cria logger compatível
 */
export function createCompatibleLogger(component: string): CompatibleLogger {
    const logger = getGlobalLogger();
    const componentContext = { component };

    return {
        debug: (message: string, context?: Record<string, unknown>) => {
            logger.debug(message, { ...componentContext, ...context });
        },
        info: (message: string, context?: Record<string, unknown>) => {
            logger.info(message, { ...componentContext, ...context });
        },
        warn: (message: string, context?: Record<string, unknown>) => {
            logger.warn(message, { ...componentContext, ...context });
        },
        error: (
            message: string,
            error?: Error,
            context?: Record<string, unknown>,
        ) => {
            logger.error(message, error, { ...componentContext, ...context });
        },
    };
}
