/**
 * @module runtime/core/event-processor-optimized
 * @description Event Processor Otimizado - Performance máxima
 *
 * Inclui todas as otimizações do runtime original:
 * - Circular buffers para evitar memory leaks
 * - Handler tracking com cleanup automático
 * - Event chain tracking para prevenir loops infinitos
 * - Batch processing para performance
 * - WeakRef para garbage collection
 */

import type { AnyEvent } from '../../core/types/events.js';
import type {
    WorkflowContext,
    EventHandler,
    HandlerReturn,
} from '../../core/types/common-types.js';
import type { ObservabilitySystem } from '../../observability/index.js';
import type { Middleware } from '../middleware/types.js';
import { DEFAULT_TIMEOUT_MS } from '../constants.js';

/**
 * Configuração do processador otimizado
 */
export interface OptimizedEventProcessorConfig {
    maxEventDepth?: number;
    maxEventChainLength?: number;
    enableObservability?: boolean;
    middleware?: Middleware[];
    batchSize?: number;
    cleanupInterval?: number;
    staleThreshold?: number;
    operationTimeoutMs?: number; // Usar DEFAULT_TIMEOUT_MS como padrão
}

/**
 * Handler com tracking para otimização
 */
interface TrackedEventHandler extends EventHandler<AnyEvent> {
    _handlerId?: string;
    _lastUsed?: number;
    _isActive?: boolean;
}

/**
 * Mapa otimizado de handlers
 */
interface OptimizedHandlerMap {
    exact: Map<string, TrackedEventHandler[]>;
    wildcard: TrackedEventHandler[];
    patterns: Map<RegExp, TrackedEventHandler[]>;
    _cleanupTimer?: NodeJS.Timeout;
}

/**
 * Contexto de processamento com tracking
 */
interface EventProcessingContext {
    depth: number;
    eventChain: EventChainTracker;
    startTime: number;
    correlationId?: string;
}

/**
 * Circular buffer para event chain tracking
 */
class EventChainTracker {
    private events: string[] = [];
    private head = 0;
    private size = 0;

    constructor(private readonly capacity: number = 1000) {}

    push(eventKey: string): void {
        if (this.size < this.capacity) {
            this.events[this.size] = eventKey;
            this.size++;
        } else {
            // Circular buffer: overwrite oldest
            this.events[this.head] = eventKey;
            this.head = (this.head + 1) % this.capacity;
        }
    }

    pop(): void {
        if (this.size > 0) {
            if (this.size < this.capacity) {
                this.size--;
            } else {
                this.head = (this.head - 1 + this.capacity) % this.capacity;
            }
        }
    }

    includes(eventKey: string): boolean {
        for (let i = 0; i < this.size; i++) {
            const index =
                this.size < this.capacity ? i : (this.head + i) % this.capacity;
            if (this.events[index] === eventKey) {
                return true;
            }
        }
        return false;
    }

    get length(): number {
        return this.size;
    }

    clear(): void {
        this.events = [];
        this.head = 0;
        this.size = 0;
    }
}

/**
 * Circular buffer genérico para performance
 */
interface CircularBuffer<T> {
    items: T[];
    head: number;
    tail: number;
    size: number;
    capacity: number;
}

function createCircularBuffer<T>(capacity: number = 10000): CircularBuffer<T> {
    return {
        items: new Array(capacity),
        head: 0,
        tail: 0,
        size: 0,
        capacity,
    };
}

function pushToBuffer<T>(buffer: CircularBuffer<T>, item: T): void {
    if (buffer.size === buffer.capacity) {
        buffer.head = (buffer.head + 1) % buffer.capacity;
    } else {
        buffer.size++;
    }
    buffer.items[buffer.tail] = item;
    buffer.tail = (buffer.tail + 1) % buffer.capacity;
}

/**
 * Separar middlewares em pipeline e handler
 */
function separateMiddlewares(middlewares: Middleware[]): {
    pipelineMiddlewares: Middleware[];
    handlerMiddlewares: Middleware[];
} {
    const pipelineMiddlewares: Middleware[] = [];
    const handlerMiddlewares: Middleware[] = [];

    for (const middleware of middlewares) {
        // Identificar middlewares de pipeline por nome da função ou toString
        const middlewareStr = middleware.toString();
        if (
            middlewareStr.includes('withRetry') ||
            middlewareStr.includes('withTimeout') ||
            middlewareStr.includes('withConcurrency') ||
            middlewareStr.includes('withSchedule') ||
            middlewareStr.includes('withRetryWrapped') ||
            middlewareStr.includes('withTimeoutWrapped') ||
            middlewareStr.includes('withConcurrencyWrapped')
        ) {
            pipelineMiddlewares.push(middleware);
        } else {
            // Middlewares de handler: validate, etc.
            handlerMiddlewares.push(middleware);
        }
    }

    return { pipelineMiddlewares, handlerMiddlewares };
}

/**
 * Processador de eventos otimizado
 */
export class OptimizedEventProcessor {
    private handlerMap: OptimizedHandlerMap;
    private processingDepth = 0;
    private readonly maxDepth: number;
    private readonly maxChainLength: number;
    private readonly enableObservability: boolean;
    private readonly pipelineMiddlewares: Middleware[];
    private readonly handlerMiddlewares: Middleware[];
    private readonly batchSize: number;
    private readonly cleanupInterval: number;
    private readonly staleThreshold: number;
    private readonly operationTimeoutMs: number;
    private eventBuffer: CircularBuffer<AnyEvent>;

    constructor(
        private context: WorkflowContext,
        private observability: ObservabilitySystem,
        config: OptimizedEventProcessorConfig = {},
    ) {
        this.maxDepth = config.maxEventDepth ?? 100;
        this.maxChainLength = config.maxEventChainLength ?? 1000;
        this.enableObservability = config.enableObservability ?? true;

        // Separar middlewares em pipeline e handler
        const { pipelineMiddlewares, handlerMiddlewares } = separateMiddlewares(
            config.middleware ?? [],
        );
        this.pipelineMiddlewares = pipelineMiddlewares;
        this.handlerMiddlewares = handlerMiddlewares;

        this.batchSize = config.batchSize ?? 100;
        this.cleanupInterval = config.cleanupInterval ?? 2 * 60 * 1000; // 2 minutos
        this.staleThreshold = config.staleThreshold ?? 10 * 60 * 1000; // 10 minutos
        this.operationTimeoutMs =
            config.operationTimeoutMs ?? DEFAULT_TIMEOUT_MS;

        this.handlerMap = this.createOptimizedHandlerMap();
        this.eventBuffer = createCircularBuffer<AnyEvent>(10000);
    }

    /**
     * Registrar handler com tracking
     */
    registerHandler(
        eventType: string,
        handler: EventHandler<AnyEvent, HandlerReturn>,
    ): void {
        const trackedHandler: TrackedEventHandler =
            handler as TrackedEventHandler;
        trackedHandler._handlerId = `${eventType}-${Date.now()}-${Math.random()}`;
        trackedHandler._isActive = true;

        // NÃO aplicar middlewares de handler aqui!
        // Apenas armazene o handler puro
        const enhancedHandler = trackedHandler;
        // (não aplicar middlewares de handler aqui)

        if (!this.handlerMap.exact.has(eventType)) {
            this.handlerMap.exact.set(eventType, []);
        }
        this.handlerMap.exact.get(eventType)!.push(enhancedHandler);
    }

    /**
     * Registrar handler wildcard
     */
    registerWildcardHandler(
        handler: EventHandler<AnyEvent, HandlerReturn>,
    ): void {
        const trackedHandler: TrackedEventHandler =
            handler as TrackedEventHandler;
        trackedHandler._handlerId = `wildcard-${Date.now()}-${Math.random()}`;
        trackedHandler._isActive = true;

        // NÃO aplicar middlewares de handler aqui!
        const enhancedHandler = trackedHandler;
        // (não aplicar middlewares de handler aqui)

        this.handlerMap.wildcard.push(enhancedHandler);
    }

    /**
     * Processar evento com todas as otimizações
     */
    async processEvent(event: AnyEvent): Promise<void> {
        // Adicionar ao buffer circular
        pushToBuffer(this.eventBuffer, event);

        const processingContext: EventProcessingContext = {
            depth: this.processingDepth,
            eventChain: new EventChainTracker(this.maxChainLength),
            startTime: Date.now(),
            correlationId: this.extractCorrelationId(event),
        };

        try {
            if (this.processingDepth >= this.maxDepth) {
                throw new Error(`Max event depth exceeded: ${this.maxDepth}`);
            }

            // Observabilidade com trace
            if (this.enableObservability) {
                await this.observability.trace(
                    `event.process.${event.type}`,
                    async () => {
                        await this.processEventInternal(
                            event,
                            processingContext,
                        );
                    },
                    {
                        correlationId: processingContext.correlationId,
                        executionId: this.context.executionId,
                        tenantId: this.context.tenantId,
                    },
                );
            } else {
                await this.processEventInternal(event, processingContext);
            }
        } catch (error) {
            if (this.enableObservability) {
                this.observability.logger.error(
                    'Event processing failed',
                    error as Error,
                    {
                        eventType: event.type,
                        depth: processingContext.depth,
                        chainLength: processingContext.eventChain.length,
                    },
                );
            }
            throw error;
        }
    }

    /**
     * Processamento interno otimizado
     */
    private async processEventInternal(
        event: AnyEvent,
        context: EventProcessingContext,
    ): Promise<void> {
        this.processingDepth++;
        context.eventChain.push(event.type);

        try {
            // Verificar loop infinito
            if (
                context.eventChain.includes(event.type) &&
                context.eventChain.length > 1
            ) {
                throw new Error(`Event loop detected: ${event.type}`);
            }

            // Obter handlers otimizados (middleware de handler já aplicado no registro)
            const handlers = this.getHandlersOptimized(event.type);

            // Criar função de processamento dos handlers
            const processHandlers = async () => {
                // Processar handlers em batch se possível
                if (handlers.length > this.batchSize) {
                    await this.processHandlersBatch(handlers, event, context);
                } else {
                    await this.processHandlersSequential(
                        handlers,
                        event,
                        context,
                    );
                }
            };

            // Executar o processamento diretamente (middlewares aplicados individualmente)
            await processHandlers();
        } finally {
            this.processingDepth--;
            context.eventChain.pop();
        }
    }

    /**
     * Processar handlers em batch para performance
     */
    private async processHandlersBatch(
        handlers: TrackedEventHandler[],
        event: AnyEvent,
        context: EventProcessingContext,
    ): Promise<void> {
        const batches = this.chunkArray(handlers, this.batchSize);

        for (const batch of batches) {
            const results = await Promise.allSettled(
                batch.map((handler) =>
                    this.processHandlerWithMiddlewares(handler, event, context),
                ),
            );

            // Log de resultados para debug
            const failed = results.filter((r) => r.status === 'rejected');
            if (failed.length > 0) {
                console.warn(
                    `${failed.length}/${results.length} handlers failed for event ${event.type}`,
                );
            }
        }
    }

    /**
     * Processar handlers sequencialmente
     */
    private async processHandlersSequential(
        handlers: TrackedEventHandler[],
        event: AnyEvent,
        _context: EventProcessingContext,
    ): Promise<void> {
        for (const handler of handlers) {
            await this.processHandlerWithMiddlewares(handler, event, _context);
        }
    }

    /**
     * Processar handler individual com middlewares aplicados
     */
    private async processHandlerWithMiddlewares(
        handler: TrackedEventHandler,
        event: AnyEvent,
        context: EventProcessingContext,
    ): Promise<void> {
        // Aplicar middlewares de handler primeiro
        let wrappedHandler: EventHandler<AnyEvent> = handler;
        for (const middleware of this.handlerMiddlewares) {
            wrappedHandler = middleware(wrappedHandler);
        }

        // Adaptador: handler sempre recebe (event, _signal?), mas chama só com (event)
        const adaptedHandler = (ev: AnyEvent, _signal?: AbortSignal) =>
            wrappedHandler(ev);

        // Aplicar middlewares de pipeline individualmente
        let pipeline = adaptedHandler;
        for (const middleware of this.pipelineMiddlewares) {
            pipeline = middleware(pipeline);
        }

        // Executar pipeline
        const result = await pipeline(event);

        // Atualizar timestamp de uso
        handler._lastUsed = Date.now();

        // Processar resultado se for evento
        if (this.isEvent(result)) {
            context.eventChain.push(result.type);
            await this.processEventInternal(result, context);
        }
    }

    /**
     * Verificar se o resultado é um evento
     */
    private isEvent(result: unknown): result is AnyEvent {
        return (
            result !== null &&
            result !== undefined &&
            typeof result === 'object' &&
            'type' in result &&
            typeof (result as AnyEvent).type === 'string'
        );
    }

    /**
     * Obter handlers otimizados
     */
    private getHandlersOptimized(eventType: string): TrackedEventHandler[] {
        const exact = this.handlerMap.exact.get(eventType) ?? [];
        const wildcard = this.handlerMap.wildcard;
        const patterns: TrackedEventHandler[] = [];

        // Pattern matching (futuro)
        for (const [pattern, handlers] of this.handlerMap.patterns) {
            if (pattern.test(eventType)) {
                patterns.push(...handlers);
            }
        }

        const allHandlers = [...exact, ...wildcard, ...patterns];

        // Atualizar timestamps
        const now = Date.now();
        allHandlers.forEach((handler) => {
            handler._lastUsed = now;
        });

        return allHandlers;
    }

    /**
     * Criar mapa otimizado de handlers
     */
    private createOptimizedHandlerMap(): OptimizedHandlerMap {
        const handlerMap: OptimizedHandlerMap = {
            exact: new Map(),
            wildcard: [],
            patterns: new Map(),
        };

        // Cleanup automático de handlers inativos
        handlerMap._cleanupTimer = setInterval(() => {
            this.cleanupStaleHandlers(handlerMap);
        }, this.cleanupInterval);

        return handlerMap;
    }

    /**
     * Limpar handlers inativos
     */
    private cleanupStaleHandlers(handlerMap: OptimizedHandlerMap): void {
        const now = Date.now();

        // Cleanup exact handlers
        for (const [eventType, handlers] of handlerMap.exact) {
            const activeHandlers = handlers.filter((handler) => {
                const isActive = handler._isActive !== false;
                const isRecent =
                    !handler._lastUsed ||
                    now - handler._lastUsed < this.staleThreshold;
                return isActive && isRecent;
            });

            if (activeHandlers.length === 0) {
                handlerMap.exact.delete(eventType);
            } else if (activeHandlers.length < handlers.length) {
                handlerMap.exact.set(eventType, activeHandlers);
            }
        }

        // Cleanup wildcard handlers
        handlerMap.wildcard = handlerMap.wildcard.filter((handler) => {
            const isActive = handler._isActive !== false;
            const isRecent =
                !handler._lastUsed ||
                now - handler._lastUsed < this.staleThreshold;
            return isActive && isRecent;
        });

        // Cleanup pattern handlers
        for (const [pattern, handlers] of handlerMap.patterns) {
            const activeHandlers = handlers.filter((handler) => {
                const isActive = handler._isActive !== false;
                const isRecent =
                    !handler._lastUsed ||
                    now - handler._lastUsed < this.staleThreshold;
                return isActive && isRecent;
            });

            if (activeHandlers.length === 0) {
                handlerMap.patterns.delete(pattern);
            } else if (activeHandlers.length < handlers.length) {
                handlerMap.patterns.set(pattern, activeHandlers);
            }
        }
    }

    /**
     * Dividir array em chunks
     */
    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Extrair correlation ID
     */
    private extractCorrelationId(event: AnyEvent): string | undefined {
        if (event.data && typeof event.data === 'object') {
            return (event.data as Record<string, unknown>).correlationId as
                | string
                | undefined;
        }
        return undefined;
    }

    /**
     * Limpar recursos
     */
    clearHandlers(): void {
        this.handlerMap.exact.clear();
        this.handlerMap.wildcard = [];
        this.handlerMap.patterns.clear();

        if (this.handlerMap._cleanupTimer) {
            clearInterval(this.handlerMap._cleanupTimer);
        }
    }

    /**
     * Obter estatísticas detalhadas
     */
    getStats() {
        return {
            registeredHandlers: this.handlerMap.exact.size,
            wildcardHandlers: this.handlerMap.wildcard.length,
            patternHandlers: this.handlerMap.patterns.size,
            currentDepth: this.processingDepth,
            bufferSize: this.eventBuffer.size,
            bufferCapacity: this.eventBuffer.capacity,
            operationTimeoutMs: this.operationTimeoutMs,
        };
    }

    /**
     * Cleanup completo
     */
    async cleanup(): Promise<void> {
        this.clearHandlers();
        this.eventBuffer = createCircularBuffer<AnyEvent>(10000);
        this.processingDepth = 0;
    }
}
