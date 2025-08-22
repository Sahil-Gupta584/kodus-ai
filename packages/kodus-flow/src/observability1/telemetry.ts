/**
 * @module observability1/telemetry
 * @description Production-ready telemetry with Ring Buffer and dependency injection
 *
 * IMPROVEMENTS:
 * - ✅ Ring Buffer prevents memory leaks
 * - ✅ Dependency injection for testability
 * - ✅ Circuit breaker for resilience
 * - ✅ Proper error handling
 * - ✅ Configurable sampling with strategies
 */

/**
 * Ring Buffer implementation for fixed-size collections
 */
export class RingBuffer<T> {
    private buffer: (T | undefined)[];
    private index = 0;
    private count = 0;

    constructor(private readonly maxSize: number) {
        this.buffer = new Array(maxSize);
    }

    push(item: T): void {
        this.buffer[this.index] = item;
        this.index = (this.index + 1) % this.maxSize;
        if (this.count < this.maxSize) {
            this.count++;
        }
    }

    toArray(): T[] {
        const result: T[] = [];
        const start = this.count < this.maxSize ? 0 : this.index;

        for (let i = 0; i < this.count; i++) {
            const idx = (start + i) % this.maxSize;
            const item = this.buffer[idx];
            if (item !== undefined) {
                result.push(item);
            }
        }

        return result;
    }

    getSize(): number {
        return this.count;
    }

    clear(): void {
        this.buffer.fill(undefined);
        this.index = 0;
        this.count = 0;
    }
}

/**
 * OpenTelemetry-compatible span interface
 */
export interface Span {
    setAttribute(key: string, value: string | number | boolean): Span;
    setAttributes(attributes: Record<string, string | number | boolean>): Span;
    setStatus(status: SpanStatus): Span;
    recordException(exception: Error): Span;
    addEvent(name: string, attributes?: Record<string, unknown>): Span;
    end(endTime?: number): void;
    getSpanContext(): SpanContext;
    isRecording(): boolean;
}

/**
 * Span status
 */
export interface SpanStatus {
    code: 'ok' | 'error' | 'timeout';
    message?: string;
}

/**
 * Span context
 */
export interface SpanContext {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    traceFlags: number;
}

/**
 * Span creation options
 */
export interface SpanOptions {
    kind?: SpanKind;
    parent?: SpanContext;
    attributes?: Record<string, string | number | boolean>;
    startTime?: number;
}

export type SpanKind =
    | 'internal'
    | 'server'
    | 'client'
    | 'producer'
    | 'consumer';

/**
 * Tracer interface
 */
export interface Tracer {
    startSpan(name: string, options?: SpanOptions): Span;
    createSpanContext(traceId: string, spanId: string): SpanContext;
}

/**
 * Span processor for handling completed spans
 */
export interface SpanProcessor {
    name: string;
    process(spans: SpanData[]): void | Promise<void>;
}

/**
 * Span data for processing
 */
export interface SpanData {
    name: string;
    context: SpanContext;
    kind: SpanKind;
    startTime: number;
    endTime: number;
    duration: number;
    status: SpanStatus;
    attributes: Record<string, string | number | boolean>;
    events: Array<{
        name: string;
        timestamp: number;
        attributes?: Record<string, unknown>;
    }>;
}

/**
 * Sampling strategy interface
 */
export interface SamplingStrategy {
    shouldSample(traceId: string, spanName: string): boolean;
}

/**
 * Probabilistic sampling strategy
 */
export class ProbabilisticSampling implements SamplingStrategy {
    constructor(private readonly rate: number) {
        if (rate < 0 || rate > 1) {
            throw new Error('Sampling rate must be between 0 and 1');
        }
    }

    shouldSample(): boolean {
        return Math.random() < this.rate;
    }
}

/**
 * Always on sampling (for development)
 */
export class AlwaysOnSampling implements SamplingStrategy {
    shouldSample(): boolean {
        return true;
    }
}

/**
 * Always off sampling (for tests)
 */
export class AlwaysOffSampling implements SamplingStrategy {
    shouldSample(): boolean {
        return false;
    }
}

/**
 * Circuit breaker for span processors
 */
export class CircuitBreaker {
    private failures = 0;
    private lastFailureTime = 0;
    private state: 'closed' | 'open' | 'half-open' = 'closed';

    constructor(
        private readonly maxFailures: number = 5,
        private readonly resetTimeout: number = 60000, // 1 minute
    ) {}

    async execute<T>(operation: () => Promise<T>): Promise<T | undefined> {
        if (this.state === 'open') {
            if (Date.now() - this.lastFailureTime > this.resetTimeout) {
                this.state = 'half-open';
            } else {
                return undefined; // Fail fast
            }
        }

        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    private onSuccess(): void {
        this.failures = 0;
        this.state = 'closed';
    }

    private onFailure(): void {
        this.failures++;
        this.lastFailureTime = Date.now();

        if (this.failures >= this.maxFailures) {
            this.state = 'open';
        }
    }

    getState(): 'closed' | 'open' | 'half-open' {
        return this.state;
    }
}

/**
 * In-memory span implementation with automatic cleanup
 */
class InMemorySpan implements Span {
    private context: SpanContext;
    private startTime: number;
    private endTime?: number;
    private attributes: Record<string, string | number | boolean> = {};
    private events: Array<{
        name: string;
        timestamp: number;
        attributes?: Record<string, unknown>;
    }> = [];
    private status: SpanStatus = { code: 'ok' };
    private timeout?: NodeJS.Timeout;

    constructor(
        private readonly name: string,
        private readonly kind: SpanKind,
        context: SpanContext,
        options: {
            startTime?: number;
            attributes?: Record<string, string | number | boolean>;
            onEnd?: (span: InMemorySpan) => void;
            timeoutMs?: number;
        } = {},
    ) {
        this.context = context;
        this.startTime = options.startTime || Date.now();
        this.attributes = { ...options.attributes };

        // Set timeout to prevent spans from staying active forever
        if (options.timeoutMs) {
            this.timeout = setTimeout(() => {
                if (!this.endTime) {
                    this.setStatus({
                        code: 'timeout',
                        message: 'Span timed out',
                    });
                    this.end();
                }
            }, options.timeoutMs);
        }

        // Call onEnd when span ends
        if (options.onEnd) {
            const originalEnd = this.end.bind(this);
            this.end = (endTime?: number) => {
                originalEnd(endTime);
                options.onEnd!(this);
            };
        }
    }

    setAttribute(key: string, value: string | number | boolean): Span {
        this.attributes[key] = value;
        return this;
    }

    setAttributes(attributes: Record<string, string | number | boolean>): Span {
        Object.assign(this.attributes, attributes);
        return this;
    }

    setStatus(status: SpanStatus): Span {
        this.status = status;
        return this;
    }

    recordException(exception: Error): Span {
        this.addEvent('exception', {
            exceptionType: exception.name,
            exceptionMessage: exception.message,
            exceptionStacktrace: exception.stack,
        });
        this.setStatus({ code: 'error', message: exception.message });
        return this;
    }

    addEvent(name: string, attributes?: Record<string, unknown>): Span {
        this.events.push({
            name,
            timestamp: Date.now(),
            attributes,
        });
        return this;
    }

    end(endTime?: number): void {
        if (this.endTime) return; // Already ended

        this.endTime = endTime || Date.now();

        // Clear timeout
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
    }

    getSpanContext(): SpanContext {
        return this.context;
    }

    isRecording(): boolean {
        return this.endTime === undefined;
    }

    // Additional methods for internal use
    getName(): string {
        return this.name;
    }

    getKind(): SpanKind {
        return this.kind;
    }

    getStartTime(): number {
        return this.startTime;
    }

    getEndTime(): number | undefined {
        return this.endTime;
    }

    getDuration(): number | undefined {
        return this.endTime ? this.endTime - this.startTime : undefined;
    }

    getStatus(): SpanStatus {
        return this.status;
    }

    getAttributes(): Record<string, string | number | boolean> {
        return { ...this.attributes };
    }

    getEvents(): Array<{
        name: string;
        timestamp: number;
        attributes?: Record<string, unknown>;
    }> {
        return [...this.events];
    }

    toSpanData(): SpanData {
        return {
            name: this.name,
            context: this.context,
            kind: this.kind,
            startTime: this.startTime,
            endTime: this.endTime || Date.now(),
            duration: this.getDuration() || 0,
            status: this.status,
            attributes: this.getAttributes(),
            events: this.getEvents(),
        };
    }
}

/**
 * Production-ready tracer with Ring Buffer
 */
export class InMemoryTracer implements Tracer {
    private activeSpans = new Map<string, InMemorySpan>();
    private completedSpans: RingBuffer<SpanData>;
    private spanProcessors: Array<{
        processor: SpanProcessor;
        circuitBreaker: CircuitBreaker;
    }> = [];

    constructor(
        private readonly config: {
            maxSpanHistory?: number;
            spanTimeoutMs?: number;
            enableCircuitBreaker?: boolean;
        } = {},
    ) {
        this.completedSpans = new RingBuffer(config.maxSpanHistory || 1000);
    }

    startSpan(name: string, options: SpanOptions = {}): Span {
        const spanId = this.generateSpanId();
        const traceId = options.parent?.traceId || this.generateTraceId();

        if (!name || typeof name !== 'string') {
            throw new Error('Span name must be a non-empty string');
        }

        const context: SpanContext = {
            traceId,
            spanId,
            parentSpanId: options.parent?.spanId,
            traceFlags: 1,
        };

        const span = new InMemorySpan(
            name,
            options.kind || 'internal',
            context,
            {
                startTime: options.startTime,
                attributes: options.attributes,
                timeoutMs: this.config.spanTimeoutMs,
                onEnd: (span) => this.onSpanEnd(span),
            },
        );

        this.activeSpans.set(spanId, span);
        return span;
    }

    createSpanContext(traceId: string, spanId: string): SpanContext {
        if (!traceId || typeof traceId !== 'string') {
            throw new Error('TraceId must be a non-empty string');
        }
        if (!spanId || typeof spanId !== 'string') {
            throw new Error('SpanId must be a non-empty string');
        }

        return {
            traceId,
            spanId,
            traceFlags: 1,
        };
    }

    addSpanProcessor(processor: SpanProcessor): void {
        this.spanProcessors.push({
            processor,
            circuitBreaker: new CircuitBreaker(),
        });
    }

    private onSpanEnd(span: InMemorySpan): void {
        const spanId = span.getSpanContext().spanId;
        this.activeSpans.delete(spanId);

        const spanData = span.toSpanData();
        this.completedSpans.push(spanData);

        // Process span through all processors
        void this.processSpan(spanData);
    }

    private async processSpan(spanData: SpanData): Promise<void> {
        const processes = this.spanProcessors.map(
            async ({ processor, circuitBreaker }) => {
                try {
                    await circuitBreaker.execute(async () => {
                        await processor.process([spanData]);
                    });
                } catch {}
            },
        );

        await Promise.allSettled(processes);
    }

    getCompletedSpans(): SpanData[] {
        return this.completedSpans.toArray();
    }

    getActiveSpans(): InMemorySpan[] {
        return Array.from(this.activeSpans.values());
    }

    dispose(): void {
        // Clear all timeouts
        for (const span of this.activeSpans.values()) {
            span.setStatus({ code: 'error', message: 'Tracer disposed' });
            span.end();
        }

        this.activeSpans.clear();
        this.completedSpans.clear();
    }

    private generateTraceId(): string {
        return 'trace_' + Math.random().toString(36).substr(2, 16);
    }

    private generateSpanId(): string {
        return 'span_' + Math.random().toString(36).substr(2, 16);
    }
}

/**
 * Telemetry configuration
 */
export interface TelemetryConfig {
    enabled: boolean;
    serviceName: string;
    serviceVersion?: string;
    sampling: SamplingStrategy;
    maxSpanHistory?: number;
    spanTimeoutMs?: number;
    globalAttributes?: Record<string, string | number | boolean>;
}

/**
 * Telemetry system with dependency injection
 */
export class TelemetrySystem {
    private currentSpan?: Span;

    constructor(
        private readonly tracer: Tracer,
        private readonly config: TelemetryConfig,
    ) {}

    isEnabled(): boolean {
        return this.config.enabled;
    }

    startSpan(name: string, options: SpanOptions = {}): Span {
        if (!this.isEnabled()) {
            return createNoOpSpan();
        }

        if (
            !this.config.sampling.shouldSample(
                options.parent?.traceId || '',
                name,
            )
        ) {
            return createNoOpSpan();
        }

        const finalAttributes = {
            serviceName: this.config.serviceName,
            serviceVersion: this.config.serviceVersion || 'unknown',
            ...this.config.globalAttributes,
            ...options.attributes,
        };

        const span = this.tracer.startSpan(name, {
            ...options,
            attributes: finalAttributes,
        });

        return span;
    }

    async withSpan<T>(span: Span, fn: () => T | Promise<T>): Promise<T> {
        const previousSpan = this.currentSpan;
        this.currentSpan = span;

        try {
            const result = await fn();
            span.setStatus({ code: 'ok' });
            return result;
        } catch (error) {
            span.recordException(error as Error);
            throw error;
        } finally {
            span.end();
            this.currentSpan = previousSpan;
        }
    }

    getCurrentSpan(): Span | undefined {
        return this.currentSpan;
    }

    getTracer(): Tracer {
        return this.tracer;
    }

    updateConfig(updates: Partial<TelemetryConfig>): void {
        Object.assign(this.config, updates);
    }
}

/**
 * No-op span for when telemetry is disabled
 */
function createNoOpSpan(): Span {
    return {
        setAttribute: () => createNoOpSpan(),
        setAttributes: () => createNoOpSpan(),
        setStatus: () => createNoOpSpan(),
        recordException: () => createNoOpSpan(),
        addEvent: () => createNoOpSpan(),
        end: () => {},
        getSpanContext: () => ({
            traceId: 'noop',
            spanId: 'noop',
            traceFlags: 0,
        }),
        isRecording: () => false,
    };
}

/**
 * Telemetry factory for dependency injection
 */
export class TelemetryFactory {
    createTelemetrySystem(
        config: TelemetryConfig,
        tracer?: Tracer,
    ): TelemetrySystem {
        const actualTracer =
            tracer ||
            new InMemoryTracer({
                maxSpanHistory: config.maxSpanHistory,
                spanTimeoutMs: config.spanTimeoutMs,
            });

        return new TelemetrySystem(actualTracer, config);
    }

    createTracer(config?: {
        maxSpanHistory?: number;
        spanTimeoutMs?: number;
    }): Tracer {
        return new InMemoryTracer(config);
    }
}
