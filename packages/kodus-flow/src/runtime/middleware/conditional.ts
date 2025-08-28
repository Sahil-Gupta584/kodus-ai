import {
    ConcurrencyConfig,
    ConditionalMiddleware,
    ConditionUtils,
    MiddlewareCondition,
    MiddlewareConfig,
    MiddlewareContext,
    MiddlewareFactory,
    MiddlewareFunction,
    ObservabilityConfig,
    RetryConfig,
    TimeoutConfig,
    ValidationConfig,
} from '@/core/types/allTypes.js';
import type { ObservabilitySystem } from '../../observability/index.js';

/**
 * Utilitários para criar condições de middleware
 */
export class ConditionUtilsImpl implements ConditionUtils {
    /**
     * Aplicar middleware apenas para tipos específicos de evento
     */
    forEventTypes(types: string[]): MiddlewareCondition {
        return (context: MiddlewareContext) => {
            return types.includes(context.event.type);
        };
    }

    /**
     * Aplicar middleware apenas para eventos com prioridade específica
     */
    forPriority(
        minPriority: number,
        maxPriority?: number,
    ): MiddlewareCondition {
        return (context: MiddlewareContext) => {
            const priority =
                ((context.event.data as Record<string, unknown>)
                    ?.priority as number) ||
                (context.metadata?.priority as number) ||
                0;
            if (maxPriority !== undefined) {
                return priority >= minPriority && priority <= maxPriority;
            }
            return priority >= minPriority;
        };
    }

    /**
     * Aplicar middleware apenas para eventos com tamanho específico
     */
    forEventSize(minSize: number, maxSize?: number): MiddlewareCondition {
        return (context: MiddlewareContext) => {
            const eventSize = JSON.stringify(context.event).length;
            if (maxSize !== undefined) {
                return eventSize >= minSize && eventSize <= maxSize;
            }
            return eventSize >= minSize;
        };
    }

    /**
     * Aplicar middleware apenas para eventos com metadata específica
     */
    forMetadata(key: string, value: unknown): MiddlewareCondition {
        return (context: MiddlewareContext) => {
            return context.metadata?.[key] === value;
        };
    }

    /**
     * Aplicar middleware apenas para eventos com contexto específico
     */
    forContext(
        predicate: (context: MiddlewareContext) => boolean,
    ): MiddlewareCondition {
        return predicate;
    }

    /**
     * Aplicar middleware apenas em horários específicos
     */
    forTimeWindow(startHour: number, endHour: number): MiddlewareCondition {
        return () => {
            const now = new Date();
            const currentHour = now.getHours();
            return currentHour >= startHour && currentHour <= endHour;
        };
    }

    /**
     * Aplicar middleware apenas para eventos com origem específica
     */
    forOrigin(origins: string[]): MiddlewareCondition {
        return (context: MiddlewareContext) => {
            const origin =
                ((context.event.data as Record<string, unknown>)
                    ?.origin as string) || (context.metadata?.origin as string);
            return Boolean(origin && origins.includes(origin));
        };
    }

    /**
     * Aplicar middleware apenas para eventos com tenant específico
     */
    forTenant(tenants: string[]): MiddlewareCondition {
        return (context: MiddlewareContext) => {
            const tenant =
                ((context.event.data as Record<string, unknown>)
                    ?.tenant as string) || (context.metadata?.tenant as string);
            return Boolean(tenant && tenants.includes(tenant));
        };
    }

    /**
     * Combinar múltiplas condições com AND
     */
    and(...conditions: MiddlewareCondition[]): MiddlewareCondition {
        return async (context: MiddlewareContext) => {
            for (const condition of conditions) {
                const result = await condition(context);
                if (!result) return false;
            }
            return true;
        };
    }

    /**
     * Combinar múltiplas condições com OR
     */
    or(...conditions: MiddlewareCondition[]): MiddlewareCondition {
        return async (context: MiddlewareContext) => {
            for (const condition of conditions) {
                const result = await condition(context);
                if (result) return true;
            }
            return false;
        };
    }

    /**
     * Negar uma condição
     */
    not(condition: MiddlewareCondition): MiddlewareCondition {
        return async (context: MiddlewareContext) => {
            const result = await condition(context);
            return !result;
        };
    }

    /**
     * Aplicar middleware com probabilidade específica
     */
    withProbability(probability: number): MiddlewareCondition {
        return () => {
            return Math.random() < probability;
        };
    }

    /**
     * Aplicar middleware apenas para eventos críticos
     */
    forCriticalEvents(): MiddlewareCondition {
        return (context: MiddlewareContext) => {
            const priority =
                ((context.event.data as Record<string, unknown>)
                    ?.priority as number) ||
                (context.metadata?.priority as number) ||
                0;
            const isCritical = context.metadata?.critical === true;
            return priority >= 8 || isCritical;
        };
    }

    /**
     * Aplicar middleware apenas para eventos de debug
     */
    forDebugEvents(): MiddlewareCondition {
        return (context: MiddlewareContext) => {
            return (
                context.event.type.includes('debug') ||
                context.metadata?.debug === true
            );
        };
    }

    /**
     * Aplicar middleware apenas para eventos de produção
     */
    forProductionEvents(): MiddlewareCondition {
        return (context: MiddlewareContext) => {
            const environment = context.metadata?.environment || 'development';
            return environment === 'production';
        };
    }
}

/**
 * Factory para middlewares condicionais
 */
export class ConditionalMiddlewareFactory implements MiddlewareFactory {
    private conditions: ConditionUtils;
    private observability: ObservabilitySystem;

    constructor(observability: ObservabilitySystem) {
        this.conditions = new ConditionUtilsImpl();
        this.observability = observability;
    }

    /**
     * Criar middleware de retry condicional
     */
    createRetryMiddleware(config?: RetryConfig): ConditionalMiddleware {
        const retryMiddleware: MiddlewareFunction = async (context, next) => {
            const maxAttempts = config?.maxAttempts || 3;
            const backoffMs = config?.backoffMs || 1000;
            const maxBackoffMs = config?.maxBackoffMs || 180000;

            let lastError: Error;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    await next();
                    return;
                } catch (error) {
                    lastError = error as Error;

                    if (attempt === maxAttempts) {
                        throw lastError;
                    }

                    // Verificar se erro é retryable
                    if (config?.nonRetryableErrors?.includes(lastError.name)) {
                        throw lastError;
                    }

                    // Backoff exponencial
                    const delay = Math.min(
                        backoffMs * Math.pow(2, attempt - 1),
                        maxBackoffMs,
                    );
                    await new Promise((resolve) => setTimeout(resolve, delay));

                    this.observability.logger.warn('Retry attempt', {
                        attempt,
                        maxAttempts,
                        delay,
                        error: lastError.message,
                        eventType: context.event.type,
                    });
                }
            }
        };

        return {
            middleware: retryMiddleware,
            condition: config?.condition || this.conditions.forCriticalEvents(),
            name: config?.name || 'conditional-retry',
            priority: config?.priority || 1,
        };
    }

    /**
     * Criar middleware de timeout condicional
     */
    createTimeoutMiddleware(config?: TimeoutConfig): ConditionalMiddleware {
        const timeoutMiddleware: MiddlewareFunction = async (context, next) => {
            const timeoutMs = config?.timeoutMs || 180000;

            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(
                        new Error(
                            config?.errorMessage || 'Operation timed out',
                        ),
                    );
                }, timeoutMs);
            });

            try {
                await Promise.race([next(), timeoutPromise]);
            } catch (error) {
                this.observability.logger.error(
                    'Timeout error',
                    error as Error,
                    {
                        eventType: context.event.type,
                        timeoutMs,
                    },
                );
                throw error;
            }
        };

        return {
            middleware: timeoutMiddleware,
            condition:
                config?.condition ||
                this.conditions.forEventTypes(['api', 'external']),
            name: config?.name || 'conditional-timeout',
            priority: config?.priority || 2,
        };
    }

    /**
     * Criar middleware de concorrência condicional
     */
    createConcurrencyMiddleware(
        config?: ConcurrencyConfig,
    ): ConditionalMiddleware {
        const concurrencyMap = new Map<string, number>();
        const maxConcurrent = config?.maxConcurrent || 10;

        const concurrencyMiddleware: MiddlewareFunction = async (
            context,
            next,
        ) => {
            const key =
                typeof config?.key === 'function'
                    ? config.key(context)
                    : config?.key || 'default';

            const current = concurrencyMap.get(key) || 0;

            if (current >= maxConcurrent) {
                throw new Error('CONCURRENCY_LIMIT_EXCEEDED');
            }

            concurrencyMap.set(key, current + 1);

            try {
                await next();
            } finally {
                concurrencyMap.set(key, Math.max(0, current));
            }
        };

        return {
            middleware: concurrencyMiddleware,
            condition:
                config?.condition ||
                this.conditions.forEventTypes(['database', 'external']),
            name: config?.name || 'conditional-concurrency',
            priority: config?.priority || 3,
        };
    }

    /**
     * Criar middleware de validação condicional
     */
    createValidationMiddleware(
        config?: ValidationConfig,
    ): ConditionalMiddleware {
        const validationMiddleware: MiddlewareFunction = async (
            context,
            next,
        ) => {
            if (config?.schema && config.validateEvent) {
                try {
                    // Aqui você implementaria a validação com Zod
                    // const result = config.schema.parse(context.event);
                    this.observability.logger.debug('Event validated', {
                        eventType: context.event.type,
                        schema: config.schema,
                    });
                } catch (error) {
                    this.observability.logger.error(
                        'Validation failed',
                        error as Error,
                        {
                            eventType: context.event.type,
                        },
                    );
                    throw error;
                }
            }

            await next();
        };

        return {
            middleware: validationMiddleware,
            condition:
                config?.condition ||
                this.conditions.forEventTypes(['user-input', 'api']),
            name: config?.name || 'conditional-validation',
            priority: config?.priority || 0,
        };
    }

    /**
     * Criar middleware de observabilidade condicional
     */
    createObservabilityMiddleware(
        config?: ObservabilityConfig,
    ): ConditionalMiddleware {
        const observabilityMiddleware: MiddlewareFunction = async (
            context,
            next,
        ) => {
            const startTime = Date.now();
            const logLevel = config?.logLevel || 'info';

            try {
                this.observability.logger[logLevel](
                    'Middleware execution started',
                );

                await next();

                this.observability.logger[logLevel](
                    'Middleware execution completed',
                );
            } catch (error) {
                const executionTime = Date.now() - startTime;
                this.observability.logger.error(
                    'Middleware execution failed',
                    error as Error,
                    {
                        middleware: config?.name || 'observability',
                        eventType: context.event.type,
                        executionTime,
                        stack: config?.includeStack
                            ? (error as Error).stack
                            : undefined,
                        metadata: config?.includeMetadata
                            ? context.metadata
                            : undefined,
                    },
                );
                throw error;
            }
        };

        return {
            middleware: observabilityMiddleware,
            condition:
                config?.condition || this.conditions.withProbability(0.1), // 10% dos eventos
            name: config?.name || 'conditional-observability',
            priority: config?.priority || 10,
        };
    }

    /**
     * Criar middleware customizado condicional
     */
    createCustomMiddleware(
        middleware: MiddlewareFunction,
        config?: MiddlewareConfig,
    ): ConditionalMiddleware {
        return {
            middleware,
            condition: config?.condition || (() => true), // Sempre aplica se não especificado
            name: config?.name || 'custom-conditional',
            priority: config?.priority || 5,
        };
    }

    // Implementações stub para os outros métodos
    createCacheMiddleware(): ConditionalMiddleware {
        // TODO: Implementar cache middleware com TTL e chave customizável
        throw new Error('Cache middleware not implemented yet');
    }

    createRateLimitMiddleware(): ConditionalMiddleware {
        // TODO: Implementar rate limiting com token bucket ou sliding window
        throw new Error('Rate limit middleware not implemented yet');
    }

    createCircuitBreakerMiddleware(): ConditionalMiddleware {
        // TODO: Implementar circuit breaker com estados open/closed/half-open
        throw new Error('Circuit breaker middleware not implemented yet');
    }

    createCompressionMiddleware(): ConditionalMiddleware {
        // TODO: Implementar compressão de eventos grandes (gzip/brotli)
        throw new Error('Compression middleware not implemented yet');
    }

    createEncryptionMiddleware(): ConditionalMiddleware {
        // TODO: Implementar criptografia de eventos sensíveis (AES-256)
        throw new Error('Encryption middleware not implemented yet');
    }

    createTransformMiddleware(): ConditionalMiddleware {
        // TODO: Implementar transformação de eventos (formatação, validação)
        throw new Error('Transform middleware not implemented yet');
    }

    createMonitoringMiddleware(): ConditionalMiddleware {
        // TODO: Implementar monitoramento de métricas e alertas
        throw new Error('Monitoring middleware not implemented yet');
    }

    createSecurityMiddleware(): ConditionalMiddleware {
        // TODO: Implementar validação de segurança e sanitização
        throw new Error('Security middleware not implemented yet');
    }

    createPerformanceMiddleware(): ConditionalMiddleware {
        // TODO: Implementar profiling de performance e otimizações
        throw new Error('Performance middleware not implemented yet');
    }

    createResilienceMiddleware(): ConditionalMiddleware {
        // TODO: Implementar padrões de resiliência (bulkhead, timeout, fallback)
        throw new Error('Resilience middleware not implemented yet');
    }
}

/**
 * Executor de middlewares condicionais
 */
export class ConditionalMiddlewareExecutor {
    private observability: ObservabilitySystem;
    private stats = new Map<
        string,
        { applied: number; skipped: number; errors: number }
    >();

    constructor(observability: ObservabilitySystem) {
        this.observability = observability;
    }

    /**
     * Executar pipeline de middlewares condicionais
     */
    async execute(
        middlewares: ConditionalMiddleware[],
        context: MiddlewareContext,
    ): Promise<void> {
        // Ordenar por prioridade (menor = maior prioridade)
        const sortedMiddlewares = [...middlewares].sort(
            (a, b) => (a.priority || 5) - (b.priority || 5),
        );

        let index = 0;
        const executeNext = async (): Promise<void> => {
            if (index >= sortedMiddlewares.length) {
                return;
            }

            const conditional = sortedMiddlewares[index++];
            if (!conditional) {
                return;
            }
            const middlewareName = conditional.name || 'anonymous';

            try {
                // Verificar condição
                const shouldApply = await conditional.condition(context);

                if (shouldApply) {
                    // Atualizar estatísticas
                    const stats = this.stats.get(middlewareName) || {
                        applied: 0,
                        skipped: 0,
                        errors: 0,
                    };
                    stats.applied++;
                    this.stats.set(middlewareName, stats);

                    this.observability.logger.debug(
                        'Applying conditional middleware',
                        {
                            middleware: middlewareName,
                            eventType: context.event.type,
                            priority: conditional.priority,
                        },
                    );

                    // Executar middleware
                    await conditional.middleware(context, executeNext);
                } else {
                    // Atualizar estatísticas
                    const stats = this.stats.get(middlewareName) || {
                        applied: 0,
                        skipped: 0,
                        errors: 0,
                    };
                    stats.skipped++;
                    this.stats.set(middlewareName, stats);

                    this.observability.logger.debug(
                        'Skipping conditional middleware',
                        {
                            middleware: middlewareName,
                            eventType: context.event.type,
                            reason: 'condition_not_met',
                        },
                    );

                    // Pular middleware e continuar
                    await executeNext();
                }
            } catch (error) {
                // Atualizar estatísticas
                const stats = this.stats.get(middlewareName) || {
                    applied: 0,
                    skipped: 0,
                    errors: 0,
                };
                stats.errors++;
                this.stats.set(middlewareName, stats);

                this.observability.logger.error(
                    'Conditional middleware error',
                    error as Error,
                    {
                        middleware: middlewareName,
                        eventType: context.event.type,
                    },
                );

                throw error;
            }
        };

        await executeNext();
    }

    /**
     * Obter estatísticas de execução
     */
    getStats() {
        return Object.fromEntries(this.stats);
    }

    /**
     * Limpar estatísticas
     */
    clearStats() {
        this.stats.clear();
    }
}

// Exportar instância global dos utilitários
export const conditionUtils = new ConditionUtilsImpl();
