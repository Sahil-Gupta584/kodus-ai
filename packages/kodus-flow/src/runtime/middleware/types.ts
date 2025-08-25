/**
 * Middleware Type Definitions
 *
 * Provides strict type safety for middleware composition and chaining
 */

import type { Event } from '../../core/types/events.js';
import type { EventHandler } from '../../core/types/common-types.js';
import type { AnyEvent } from '../../core/types/events.js';
import type { ObservabilitySystem } from '../../observability/index.js';

/**
 * TrackedEventHandler interface for runtime tracking integration
 */
export interface TrackedEventHandler<TEvent extends Event = Event>
    extends EventHandler<TEvent> {
    _handlerId?: string;
    _lastUsed?: number;
    _isActive?: boolean;
}

/**
 * Type guard to check if handler is a TrackedEventHandler
 */
export function isTrackedEventHandler<TEvent extends Event = Event>(
    handler: EventHandler<TEvent>,
): handler is TrackedEventHandler<TEvent> {
    return (
        typeof handler === 'function' &&
        ('_handlerId' in handler ||
            '_lastUsed' in handler ||
            '_isActive' in handler)
    );
}

/**
 * Utility type to make specific properties optional in tracked handlers
 */
export type OptionalTrackedProperties<T> = T &
    Partial<
        Pick<TrackedEventHandler, '_handlerId' | '_lastUsed' | '_isActive'>
    >;

/**
 * Type-safe property copier for tracked handlers
 */
export function copyTrackedProperties<TEvent extends Event = Event>(
    source: EventHandler<TEvent>,
    target: EventHandler<TEvent>,
): void {
    if (isTrackedEventHandler(source)) {
        const targetWithTracking = target as OptionalTrackedProperties<
            EventHandler<TEvent>
        >;

        if (source._handlerId !== undefined) {
            targetWithTracking._handlerId = source._handlerId;
        }
        if (source._isActive !== undefined) {
            targetWithTracking._isActive = source._isActive;
        }
        if (source._lastUsed !== undefined) {
            targetWithTracking._lastUsed = source._lastUsed;
        }
    }
}

/**
 * Type-safe tracking updater
 */
export function updateTrackedHandler<TEvent extends Event = Event>(
    handler: EventHandler<TEvent>,
): void {
    if (isTrackedEventHandler(handler)) {
        handler._lastUsed = Date.now();
    }
}

/**
 * Base middleware function type
 * A middleware takes a handler and returns an enhanced handler
 */
export type MiddlewareKind = 'pipeline' | 'handler';

export type Middleware<TEvent extends Event = Event> = ((
    handler: EventHandler<TEvent>,
) => EventHandler<TEvent>) & {
    kind?: MiddlewareKind;
    /**
     * DO NOT write to Function.name at runtime (read-only in many environments).
     * Use displayName for custom labeling, and keep name as the intrinsic function name.
     */
    name?: string;
    displayName?: string;
};

/**
 * Configurable middleware factory
 * Takes configuration and returns a middleware
 */
export type MiddlewareFactoryType<TConfig, TEvent extends Event = Event> = (
    config: TConfig,
) => Middleware<TEvent>;

/**
 * Composable middleware chain
 */
export type MiddlewareChain<TEvent extends Event = Event> = {
    use<TMiddleware extends Middleware<TEvent>>(
        middleware: TMiddleware,
    ): MiddlewareChain<TEvent>;

    apply(handler: EventHandler<TEvent>): EventHandler<TEvent>;
};

/**
 * Type-safe middleware composition
 */
export function composeMiddleware<TEvent extends Event = Event>(
    ...middlewares: Array<Middleware<TEvent>>
): Middleware<TEvent> {
    return (handler: EventHandler<TEvent>) => {
        return middlewares.reduceRight(
            (acc, middleware) => middleware(acc),
            handler,
        );
    };
}

/**
 * Create a middleware chain builder
 */
export function createMiddlewareChain<
    TEvent extends Event = Event,
>(): MiddlewareChain<TEvent> {
    const middlewares: Array<Middleware<TEvent>> = [];

    return {
        use(middleware: Middleware<TEvent>) {
            middlewares.push(middleware);
            return this;
        },

        apply(handler: EventHandler<TEvent>) {
            return composeMiddleware(...middlewares)(handler);
        },
    };
}

/**
 * Type guard for middleware configuration
 */
export function isMiddlewareConfig<T>(
    value: unknown,
    validator: (v: unknown) => v is T,
): value is T {
    return validator(value);
}

/**
 * Middleware error with context
 */
export class MiddlewareError extends Error {
    constructor(
        public readonly middleware: string,
        message: string,
        public readonly context?: Record<string, unknown>,
    ) {
        super(`[${middleware}] ${message}`);
        this.name = 'MiddlewareError';
    }
}

/**
 * Type-safe middleware wrapper with error handling and tracking integration
 */
export function safeMiddleware<TEvent extends Event = Event>(
    name: string,
    middleware: Middleware<TEvent>,
): Middleware<TEvent> {
    return (handler: EventHandler<TEvent>) => {
        const enhancedHandler = async (event: TEvent) => {
            const startTime = Date.now();

            try {
                const wrappedHandler = middleware(handler);
                const result = await wrappedHandler(event);

                // Update tracking if handler is TrackedEventHandler
                updateTrackedHandler(handler);

                return result;
            } catch (error) {
                // Update error tracking if handler is TrackedEventHandler
                updateTrackedHandler(handler);

                throw new MiddlewareError(
                    name,
                    error instanceof Error ? error.message : String(error),
                    {
                        event,
                        originalError: error,
                        executionTime: Date.now() - startTime,
                        middleware: name,
                    },
                );
            }
        };

        // Copy tracking properties if original handler has them
        copyTrackedProperties(handler, enhancedHandler);

        return enhancedHandler;
    };
}

/**
 * Utility type to extract event type from handler
 */
export type ExtractEventType<T> = T extends EventHandler<infer E> ? E : never;

/**
 * Utility type to extract return type from handler
 */
export type ExtractReturnType<T> =
    T extends EventHandler<Event, infer R> ? R : never;

/**
 * Advanced middleware composition types for type-safe chaining
 */

/**
 * Conditional middleware type that applies only to specific event types
 */
// Removido definição duplicada de ConditionalMiddleware

/**
 * Transform middleware that changes event type
 */
export type TransformMiddleware<TInput extends Event, TOutput extends Event> = (
    handler: EventHandler<TOutput>,
) => EventHandler<TInput>;

/**
 * Async middleware for handling promises and async operations
 */
export type AsyncMiddleware<TEvent extends Event = Event> = (
    handler: EventHandler<TEvent>,
) => EventHandler<TEvent, Promise<Event | void>>;

/**
 * Middleware with context support for sharing data between middleware
 */
export interface MiddlewareContext {
    readonly startTime: number;
    readonly middlewareChain: string[];
    data: Record<string, unknown>;
    event: AnyEvent;
    observability: ObservabilitySystem;
    metadata?: Record<string, unknown>;
}

export type ContextAwareMiddleware<TEvent extends Event = Event> = (
    handler: EventHandler<TEvent>,
    context: MiddlewareContext,
) => EventHandler<TEvent>;

/**
 * Pipeline of typed middleware with context
 */
export class MiddlewarePipelineClass<TEvent extends Event = Event> {
    private middlewares: Array<{
        name: string;
        middleware: Middleware<TEvent> | ContextAwareMiddleware<TEvent>;
        isContextAware: boolean;
    }> = [];

    add<TMid extends Middleware<TEvent>>(name: string, middleware: TMid): this;
    add<TMid extends ContextAwareMiddleware<TEvent>>(
        name: string,
        middleware: TMid,
    ): this;
    add(
        name: string,
        middleware: Middleware<TEvent> | ContextAwareMiddleware<TEvent>,
    ): this {
        const isContextAware = middleware.length > 1;
        this.middlewares.push({ name, middleware, isContextAware });
        return this;
    }

    build(): Middleware<TEvent> {
        return (handler: EventHandler<TEvent>) => {
            const context: MiddlewareContext = {
                startTime: Date.now(),
                middlewareChain: this.middlewares.map((m) => m.name),
                data: {},
                event: {} as AnyEvent,
                observability: {} as ObservabilitySystem,
            };

            return this.middlewares.reduceRight<EventHandler<TEvent>>(
                (acc, { middleware, isContextAware }) => {
                    if (isContextAware) {
                        return (middleware as ContextAwareMiddleware<TEvent>)(
                            acc,
                            context,
                        );
                    } else {
                        return (middleware as Middleware<TEvent>)(acc);
                    }
                },
                handler,
            );
        };
    }
}

/**
 * Type-safe middleware factory with configuration validation
 */
export function createTypedMiddlewareFactory<
    TConfig,
    TEvent extends Event = Event,
>(
    name: string,
    configValidator: ConfigValidator<TConfig>,
    factory: (config: TConfig) => Middleware<TEvent>,
): MiddlewareFactoryType<TConfig, TEvent> {
    return (config: TConfig) => {
        if (!configValidator.validate(config)) {
            throw new MiddlewareError(name, 'Invalid configuration provided', {
                config,
            });
        }

        const parsedConfig = configValidator.parse(config);
        return safeMiddleware(name, factory(parsedConfig));
    };
}

/**
 * Type-safe middleware config validator
 */
export interface ConfigValidator<T> {
    validate(config: unknown): config is T;
    parse(config: unknown): T;
}

/**
 * Create a config validator
 */
export function createConfigValidator<T>(schema: {
    validate: (value: unknown) => boolean;
    parse: (value: unknown) => T;
}): ConfigValidator<T> {
    return {
        validate: (config): config is T => schema.validate(config),
        parse: (config) => schema.parse(config),
    };
}

/**
 * Advanced TypeScript utility types for middleware system
 */

/**
 * Branded type for middleware identification
 */
export type Brand<T, B> = T & { readonly __brand: B };

/**
 * Middleware execution priority
 */
export type MiddlewarePriority = Brand<number, 'MiddlewarePriority'>;

export const createPriority = (value: number): MiddlewarePriority => {
    if (value < 0 || value > 100) {
        throw new Error('Middleware priority must be between 0 and 100');
    }
    return value as MiddlewarePriority;
};

/**
 * Middleware metadata for advanced composition
 */
export interface MiddlewareMetadata {
    readonly name: string;
    readonly version: string;
    readonly priority: MiddlewarePriority;
    readonly eventTypes: readonly string[];
    readonly dependencies: readonly string[];
    readonly tags: readonly string[];
}

/**
 * Tagged middleware with metadata
 */
export interface TaggedMiddleware<TEvent extends Event = Event> {
    readonly metadata: MiddlewareMetadata;
    readonly middleware: Middleware<TEvent>;
}

/**
 * Middleware registry with dependency resolution
 */
export class MiddlewareRegistry<TEvent extends Event = Event> {
    private registry = new Map<string, TaggedMiddleware<TEvent>>();

    register(tagged: TaggedMiddleware<TEvent>): void {
        if (this.registry.has(tagged.metadata.name)) {
            throw new MiddlewareError(
                'Registry',
                `Middleware '${tagged.metadata.name}' is already registered`,
            );
        }

        this.registry.set(tagged.metadata.name, tagged);
    }

    resolve(names: string[]): Middleware<TEvent>[] {
        const resolved = new Set<string>();
        const result: TaggedMiddleware<TEvent>[] = [];

        const resolveDeps = (name: string): void => {
            if (resolved.has(name)) return;

            const middleware = this.registry.get(name);
            if (!middleware) {
                throw new MiddlewareError(
                    'Registry',
                    `Middleware '${name}' not found`,
                );
            }

            // Resolve dependencies first
            for (const dep of middleware.metadata.dependencies) {
                resolveDeps(dep);
            }

            resolved.add(name);
            result.push(middleware);
        };

        names.forEach(resolveDeps);

        // Sort by priority (higher priority first)
        result.sort((a, b) => b.metadata.priority - a.metadata.priority);

        return result.map((m) => m.middleware);
    }

    findByTag(tag: string): TaggedMiddleware<TEvent>[] {
        return Array.from(this.registry.values()).filter((m) =>
            m.metadata.tags.includes(tag),
        );
    }

    findByEventType(eventType: string): TaggedMiddleware<TEvent>[] {
        return Array.from(this.registry.values()).filter(
            (m) =>
                m.metadata.eventTypes.includes(eventType) ||
                m.metadata.eventTypes.includes('*'),
        );
    }
}

/**
 * Conditional type for middleware applicability
 */
export type MiddlewareApplicableFor<TMiddleware, TEvent extends Event> =
    TMiddleware extends Middleware<infer E>
        ? TEvent extends E
            ? TMiddleware
            : never
        : never;

/**
 * Type-level middleware composition validation
 */
export type ValidMiddlewareChain<
    TEvent extends Event,
    TMiddlewares extends readonly Middleware<TEvent>[],
> = {
    readonly [K in keyof TMiddlewares]: MiddlewareApplicableFor<
        TMiddlewares[K],
        TEvent
    >;
};

/**
 * Higher-order type for creating typed middleware builders
 */
export interface MiddlewareBuilder<TEvent extends Event = Event> {
    withMetadata(metadata: Omit<MiddlewareMetadata, 'name'>): this;
    withPriority(priority: number): this;
    withDependencies(...deps: string[]): this;
    withTags(...tags: string[]): this;
    build(
        name: string,
        middleware: Middleware<TEvent>,
    ): TaggedMiddleware<TEvent>;
}

/**
 * Create a middleware builder
 */
export function createMiddlewareBuilder<
    TEvent extends Event = Event,
>(): MiddlewareBuilder<TEvent> {
    const metadata: {
        version: string;
        priority: MiddlewarePriority;
        eventTypes: string[];
        dependencies: string[];
        tags: string[];
    } = {
        version: '1.0.0',
        priority: createPriority(50),
        eventTypes: ['*'],
        dependencies: [],
        tags: [],
    };

    return {
        withMetadata(meta) {
            Object.assign(metadata, meta);
            return this;
        },

        withPriority(priority) {
            metadata.priority = createPriority(priority);
            return this;
        },

        withDependencies(...deps) {
            metadata.dependencies.length = 0;
            metadata.dependencies.push(...deps);
            return this;
        },

        withTags(...tags) {
            metadata.tags.length = 0;
            metadata.tags.push(...tags);
            return this;
        },

        build(name, middleware) {
            return {
                metadata: {
                    name,
                    version: metadata.version,
                    priority: metadata.priority,
                    eventTypes: [...metadata.eventTypes],
                    dependencies: [...metadata.dependencies],
                    tags: [...metadata.tags],
                },
                middleware,
            };
        },
    };
}

/**
 * @module runtime/middleware/types
 * @description Tipos para middlewares do runtime
 */

/**
 * Função do middleware
 */
export type MiddlewareFunction = (
    context: MiddlewareContext,
    next: () => Promise<void>,
) => Promise<void>;

/**
 * Condição para aplicar middleware
 */
export type MiddlewareCondition = (
    context: MiddlewareContext,
) => boolean | Promise<boolean>;

/**
 * Middleware com condição
 */
export interface ConditionalMiddleware {
    middleware: MiddlewareFunction;
    condition: MiddlewareCondition;
    name?: string;
    priority?: number; // Prioridade de execução (menor = maior prioridade)
}

/**
 * Configuração do middleware
 */
export interface MiddlewareConfig {
    name?: string;
    enabled?: boolean;
    condition?: MiddlewareCondition;
    priority?: number;
    metadata?: Record<string, unknown>;
}

/**
 * Pipeline de middlewares
 */
export type MiddlewarePipeline = (MiddlewareFunction | ConditionalMiddleware)[];

/**
 * Resultado da execução do middleware
 */
export interface MiddlewareResult {
    success: boolean;
    error?: Error;
    metadata?: Record<string, unknown>;
    executionTime?: number;
    middlewareName?: string;
}

/**
 * Estatísticas do middleware
 */
export interface MiddlewareStats {
    name: string;
    executions: number;
    errors: number;
    avgExecutionTime: number;
    lastExecution?: Date;
    conditions?: {
        applied: number;
        skipped: number;
    };
}

/**
 * Configuração de retry
 */
export interface RetryConfig extends MiddlewareConfig {
    maxAttempts?: number;
    backoffMs?: number;
    maxBackoffMs?: number;
    retryableErrors?: string[];
    nonRetryableErrors?: string[];
}

/**
 * Configuração de timeout
 */
export interface TimeoutConfig extends MiddlewareConfig {
    timeoutMs?: number;
    errorMessage?: string;
}

/**
 * Configuração de concorrência
 */
export interface ConcurrencyConfig extends MiddlewareConfig {
    maxConcurrent?: number;
    key?: string | ((context: MiddlewareContext) => string);
    queueTimeoutMs?: number;
    dropOnTimeout?: boolean;
}

/**
 * Configuração de validação
 */
export interface ValidationConfig extends MiddlewareConfig {
    schema?: unknown; // Zod schema
    validateEvent?: boolean;
    validateContext?: boolean;
    strict?: boolean;
}

/**
 * Configuração de observabilidade
 */
export interface ObservabilityConfig extends MiddlewareConfig {
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    includeMetadata?: boolean;
    includeStack?: boolean;
    customMetrics?: string[];
}

/**
 * Configuração de cache
 */
export interface CacheConfig extends MiddlewareConfig {
    ttlMs?: number;
    key?: string | ((context: MiddlewareContext) => string);
    storage?: 'memory' | 'custom';
    maxSize?: number;
}

/**
 * Configuração de rate limiting
 */
export interface RateLimitConfig extends MiddlewareConfig {
    maxRequests?: number;
    windowMs?: number;
    key?: string | ((context: MiddlewareContext) => string);
    strategy?: 'token-bucket' | 'leaky-bucket' | 'fixed-window';
}

/**
 * Configuração de circuit breaker
 */
export interface CircuitBreakerConfig extends MiddlewareConfig {
    failureThreshold?: number;
    recoveryTimeoutMs?: number;
    halfOpenMaxAttempts?: number;
    errorThreshold?: number;
}

/**
 * Configuração de compressão
 */
export interface CompressionConfig extends MiddlewareConfig {
    algorithm?: 'gzip' | 'brotli' | 'deflate';
    threshold?: number; // Tamanho mínimo para comprimir
    level?: number; // Nível de compressão
}

/**
 * Configuração de criptografia
 */
export interface EncryptionConfig extends MiddlewareConfig {
    algorithm?: 'aes-256-gcm' | 'chacha20-poly1305';
    key?: string | ((context: MiddlewareContext) => string);
    encryptFields?: string[];
    decryptFields?: string[];
}

/**
 * Configuração de transformação
 */
export interface TransformConfig extends MiddlewareConfig {
    transform?: (context: MiddlewareContext) => Promise<MiddlewareContext>;
    validate?: (context: MiddlewareContext) => Promise<boolean>;
    rollback?: (context: MiddlewareContext) => Promise<void>;
}

/**
 * Configuração de monitoramento
 */
export interface MonitoringConfig extends MiddlewareConfig {
    metrics?: string[];
    alerts?: {
        threshold: number;
        condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
        action: 'log' | 'alert' | 'callback';
    }[];
    healthCheck?: () => Promise<boolean>;
}

/**
 * Configuração de segurança
 */
export interface SecurityConfig extends MiddlewareConfig {
    sanitize?: boolean;
    validateOrigin?: boolean;
    rateLimit?: RateLimitConfig;
    encryption?: EncryptionConfig;
    audit?: boolean;
}

/**
 * Configuração de performance
 */
export interface PerformanceConfig extends MiddlewareConfig {
    profiling?: boolean;
    memoryTracking?: boolean;
    cpuTracking?: boolean;
    slowQueryThreshold?: number;
    optimization?: {
        enableCaching?: boolean;
        enableCompression?: boolean;
        enableBatching?: boolean;
    };
}

/**
 * Configuração de resiliência
 */
export interface ResilienceConfig extends MiddlewareConfig {
    retry?: RetryConfig;
    circuitBreaker?: CircuitBreakerConfig;
    timeout?: TimeoutConfig;
    fallback?: (context: MiddlewareContext) => Promise<void>;
}

/**
 * Configuração completa de middleware
 */
export interface CompleteMiddlewareConfig {
    retry?: RetryConfig;
    timeout?: TimeoutConfig;
    concurrency?: ConcurrencyConfig;
    validation?: ValidationConfig;
    observability?: ObservabilityConfig;
    cache?: CacheConfig;
    rateLimit?: RateLimitConfig;
    circuitBreaker?: CircuitBreakerConfig;
    compression?: CompressionConfig;
    encryption?: EncryptionConfig;
    transform?: TransformConfig;
    monitoring?: MonitoringConfig;
    security?: SecurityConfig;
    performance?: PerformanceConfig;
    resilience?: ResilienceConfig;
    custom?: Record<string, MiddlewareConfig>;
}

/**
 * Factory de middleware condicional
 */
export interface MiddlewareFactory {
    createRetryMiddleware(config?: RetryConfig): ConditionalMiddleware;
    createTimeoutMiddleware(config?: TimeoutConfig): ConditionalMiddleware;
    createConcurrencyMiddleware(
        config?: ConcurrencyConfig,
    ): ConditionalMiddleware;
    createValidationMiddleware(
        config?: ValidationConfig,
    ): ConditionalMiddleware;
    createObservabilityMiddleware(
        config?: ObservabilityConfig,
    ): ConditionalMiddleware;
    createCacheMiddleware(config?: CacheConfig): ConditionalMiddleware;
    createRateLimitMiddleware(config?: RateLimitConfig): ConditionalMiddleware;
    createCircuitBreakerMiddleware(
        config?: CircuitBreakerConfig,
    ): ConditionalMiddleware;
    createCompressionMiddleware(
        config?: CompressionConfig,
    ): ConditionalMiddleware;
    createEncryptionMiddleware(
        config?: EncryptionConfig,
    ): ConditionalMiddleware;
    createTransformMiddleware(config?: TransformConfig): ConditionalMiddleware;
    createMonitoringMiddleware(
        config?: MonitoringConfig,
    ): ConditionalMiddleware;
    createSecurityMiddleware(config?: SecurityConfig): ConditionalMiddleware;
    createPerformanceMiddleware(
        config?: PerformanceConfig,
    ): ConditionalMiddleware;
    createResilienceMiddleware(
        config?: ResilienceConfig,
    ): ConditionalMiddleware;
    createCustomMiddleware(
        middleware: MiddlewareFunction,
        config?: MiddlewareConfig,
    ): ConditionalMiddleware;
}

/**
 * Utilitários para condições
 */
export interface ConditionUtils {
    /**
     * Aplicar middleware apenas para tipos específicos de evento
     */
    forEventTypes(types: string[]): MiddlewareCondition;

    /**
     * Aplicar middleware apenas para eventos com prioridade específica
     */
    forPriority(minPriority: number, maxPriority?: number): MiddlewareCondition;

    /**
     * Aplicar middleware apenas para eventos com tamanho específico
     */
    forEventSize(minSize: number, maxSize?: number): MiddlewareCondition;

    /**
     * Aplicar middleware apenas para eventos com metadata específica
     */
    forMetadata(key: string, value: unknown): MiddlewareCondition;

    /**
     * Aplicar middleware apenas para eventos com contexto específico
     */
    forContext(
        predicate: (context: MiddlewareContext) => boolean,
    ): MiddlewareCondition;

    /**
     * Aplicar middleware apenas em horários específicos
     */
    forTimeWindow(startHour: number, endHour: number): MiddlewareCondition;

    /**
     * Aplicar middleware apenas para eventos com origem específica
     */
    forOrigin(origins: string[]): MiddlewareCondition;

    /**
     * Aplicar middleware apenas para eventos com tenant específico
     */
    forTenant(tenants: string[]): MiddlewareCondition;

    /**
     * Combinar múltiplas condições com AND
     */
    and(...conditions: MiddlewareCondition[]): MiddlewareCondition;

    /**
     * Combinar múltiplas condições com OR
     */
    or(...conditions: MiddlewareCondition[]): MiddlewareCondition;

    /**
     * Negar uma condição
     */
    not(condition: MiddlewareCondition): MiddlewareCondition;

    /**
     * Aplicar middleware com probabilidade específica
     */
    withProbability(probability: number): MiddlewareCondition;

    /**
     * Aplicar middleware apenas para eventos críticos
     */
    forCriticalEvents(): MiddlewareCondition;

    /**
     * Aplicar middleware apenas para eventos de debug
     */
    forDebugEvents(): MiddlewareCondition;

    /**
     * Aplicar middleware apenas para eventos de produção
     */
    forProductionEvents(): MiddlewareCondition;
}
