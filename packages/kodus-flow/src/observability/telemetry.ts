/**
 * @module observability/telemetry
 * @description OpenTelemetry-compatible tracing and metrics for distributed observability
 *
 * Purpose: Distributed tracing, metrics collection, external observability integration
 * Use cases: APM integration, distributed tracing, performance metrics, OTEL compliance
 * Integration: Works with Jaeger, Zipkin, DataDog, New Relic, etc.
 */

import type { Event } from '../core/types/events.js';
import { IdGenerator } from '../utils/id-generator.js';

/**
 * Telemetry configuration
 */
export interface TelemetryConfig {
    enabled: boolean;
    serviceName: string;
    serviceVersion?: string;
    environment?: string;

    // Sampling configuration
    sampling: {
        rate: number; // 0.0 to 1.0
        strategy: 'probabilistic' | 'rate-limiting' | 'parent-based';
    };

    // Custom attributes applied to all spans
    globalAttributes?: Record<string, string | number | boolean>;

    // Feature flags
    features: {
        traceEvents: boolean;
        traceKernel: boolean;
        traceSnapshots: boolean;
        tracePersistence: boolean;
        metricsEnabled: boolean;
    };

    // External tracer integration
    externalTracer?: Tracer;
}

/**
 * OpenTelemetry-compatible span interface
 */
export interface Span {
    // Core span operations
    setAttribute(key: string, value: string | number | boolean): Span;
    setAttributes(attributes: Record<string, string | number | boolean>): Span;
    setStatus(status: SpanStatus): Span;
    recordException(exception: Error): Span;
    addEvent(name: string, attributes?: Record<string, unknown>): Span;
    end(endTime?: number): void;

    // Span context
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
 * Span context for correlation
 */
export interface SpanContext {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    traceFlags: number;
}

/**
 * OpenTelemetry-compatible tracer interface
 */
export interface Tracer {
    startSpan(name: string, options?: SpanOptions): Span;
    createSpanContext(traceId: string, spanId: string): SpanContext;
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

/**
 * Span kinds following OTEL specification
 */
export type SpanKind =
    | 'internal'
    | 'server'
    | 'client'
    | 'producer'
    | 'consumer';

/**
 * Metrics interface
 */
export interface Metrics {
    counter(
        name: string,
        value: number,
        attributes?: Record<string, string>,
    ): void;
    histogram(
        name: string,
        value: number,
        attributes?: Record<string, string>,
    ): void;
    gauge(
        name: string,
        value: number,
        attributes?: Record<string, string>,
    ): void;
}

/**
 * High-performance in-memory tracer implementation
 */
class InMemoryTracer implements Tracer {
    private activeSpans = new Map<string, InMemorySpan>();
    private completedSpans: InMemorySpan[] = [];
    private maxSpanHistory = 1000;
    private spanTimeouts = new Map<string, NodeJS.Timeout>();
    private readonly maxSpanDuration = 5 * 60 * 1000; // 5 minutes

    startSpan(name: string, options?: SpanOptions): Span {
        const spanId = this.generateSpanId();
        const traceId = options?.parent?.traceId || this.generateTraceId();

        // Validate inputs
        if (!name || typeof name !== 'string') {
            throw new Error('Span name must be a non-empty string');
        }

        const span = new InMemorySpan({
            name,
            spanId,
            traceId,
            parentSpanId: options?.parent?.spanId,
            kind: options?.kind || 'internal',
            startTime: options?.startTime || Date.now(),
            attributes: options?.attributes || {},
            onEnd: (span) => this.onSpanEnd(span),
        });

        this.activeSpans.set(spanId, span);

        // Set timeout to prevent spans from staying active forever
        const timeout = setTimeout(() => {
            if (this.activeSpans.has(spanId)) {
                span.setStatus({ code: 'timeout', message: 'Span timed out' });
                span.end();
            }
        }, this.maxSpanDuration);

        this.spanTimeouts.set(spanId, timeout);

        return span;
    }

    createSpanContext(traceId: string, spanId: string): SpanContext {
        // Validate inputs
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

    /**
     * Cleanup all active spans and timeouts
     */
    dispose(): void {
        // Clear all timeouts
        for (const timeout of this.spanTimeouts.values()) {
            clearTimeout(timeout);
        }
        this.spanTimeouts.clear();

        // End all active spans
        for (const span of this.activeSpans.values()) {
            span.setStatus({ code: 'error', message: 'Tracer disposed' });
            span.end();
        }
        this.activeSpans.clear();
        this.completedSpans = [];
    }

    private onSpanEnd(span: InMemorySpan): void {
        const spanId = span.getSpanContext().spanId;
        this.activeSpans.delete(spanId);

        // Clear timeout
        const timeout = this.spanTimeouts.get(spanId);
        if (timeout) {
            clearTimeout(timeout);
            this.spanTimeouts.delete(spanId);
        }

        this.completedSpans.unshift(span);

        if (this.completedSpans.length > this.maxSpanHistory) {
            this.completedSpans.pop();
        }
    }

    private generateTraceId(): string {
        // Use IdGenerator for consistency
        return IdGenerator.correlationId().replace('corr_', 'trace_');
    }

    private generateSpanId(): string {
        // Use IdGenerator for consistency
        return IdGenerator.callId().replace('call_', 'span_');
    }

    getCompletedSpans(): ReadonlyArray<InMemorySpan> {
        return this.completedSpans;
    }

    getActiveSpans(): ReadonlyArray<InMemorySpan> {
        return Array.from(this.activeSpans.values());
    }
}

/**
 * In-memory span implementation
 */
class InMemorySpan implements Span {
    private context: SpanContext;
    private name: string;
    private kind: SpanKind;
    private startTime: number;
    private endTime?: number;
    private attributes: Record<string, string | number | boolean> = {};
    private events: Array<{
        name: string;
        timestamp: number;
        attributes?: Record<string, unknown>;
    }> = [];
    private status: SpanStatus = { code: 'ok' };
    private onEndCallback?: (span: InMemorySpan) => void;

    constructor(options: {
        name: string;
        spanId: string;
        traceId: string;
        parentSpanId?: string;
        kind: SpanKind;
        startTime: number;
        attributes: Record<string, string | number | boolean>;
        onEnd?: (span: InMemorySpan) => void;
    }) {
        this.name = options.name;
        this.kind = options.kind;
        this.startTime = options.startTime;
        this.attributes = { ...options.attributes };
        this.onEndCallback = options.onEnd;

        this.context = {
            traceId: options.traceId,
            spanId: options.spanId,
            parentSpanId: options.parentSpanId,
            traceFlags: 1,
        };
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
        this.endTime = endTime || Date.now();
        this.onEndCallback?.(this);
    }

    getSpanContext(): SpanContext {
        return this.context;
    }

    isRecording(): boolean {
        return this.endTime === undefined;
    }

    // Additional methods for debugging/inspection
    getName(): string {
        return this.name;
    }

    getKind(): SpanKind {
        return this.kind;
    }

    getDuration(): number | undefined {
        return this.endTime ? this.endTime - this.startTime : undefined;
    }

    getAttributes(): Record<string, string | number | boolean> {
        return { ...this.attributes };
    }

    getEvents(): ReadonlyArray<{
        name: string;
        timestamp: number;
        attributes?: Record<string, unknown>;
    }> {
        return this.events;
    }

    getStatus(): SpanStatus {
        return this.status;
    }
}

/**
 * In-memory metrics implementation
 */
class InMemoryMetrics implements Metrics {
    private counters = new Map<string, number>();
    private histograms = new Map<string, number[]>();
    private gauges = new Map<string, number>();

    counter(
        name: string,
        value: number,
        attributes?: Record<string, string>,
    ): void {
        const key = this.getMetricKey(name, attributes);
        this.counters.set(key, (this.counters.get(key) || 0) + value);
    }

    histogram(
        name: string,
        value: number,
        attributes?: Record<string, string>,
    ): void {
        const key = this.getMetricKey(name, attributes);
        const values = this.histograms.get(key) || [];
        values.push(value);
        this.histograms.set(key, values);
    }

    gauge(
        name: string,
        value: number,
        attributes?: Record<string, string>,
    ): void {
        const key = this.getMetricKey(name, attributes);
        this.gauges.set(key, value);
    }

    private getMetricKey(
        name: string,
        attributes?: Record<string, string>,
    ): string {
        if (!attributes || Object.keys(attributes).length === 0) {
            return name;
        }
        const attrStr = Object.entries(attributes)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join(',');
        return `${name}{${attrStr}}`;
    }

    getCounters(): Map<string, number> {
        return new Map(this.counters);
    }

    getHistograms(): Map<string, number[]> {
        return new Map(this.histograms);
    }

    getGauges(): Map<string, number> {
        return new Map(this.gauges);
    }
}

/**
 * Main telemetry system
 */
export class TelemetrySystem {
    private config: TelemetryConfig;
    private tracer: Tracer;
    private metrics: Metrics;
    private currentSpan?: Span;

    constructor(config: Partial<TelemetryConfig> = {}) {
        this.config = {
            enabled: true,
            serviceName: 'kodus-flow',
            sampling: { rate: 1.0, strategy: 'probabilistic' },
            features: {
                traceEvents: true,
                traceKernel: true,
                traceSnapshots: true,
                tracePersistence: true,
                metricsEnabled: true,
            },
            ...config,
        };

        this.tracer = config.externalTracer || new InMemoryTracer();
        this.metrics = new InMemoryMetrics();
    }

    /**
     * Check if telemetry is enabled and should be sampled
     */
    isEnabled(): boolean {
        if (!this.config.enabled) return false;

        // Apply sampling
        if (this.config.sampling.strategy === 'probabilistic') {
            return Math.random() < this.config.sampling.rate;
        }

        return true;
    }

    /**
     * Start a new span
     */
    startSpan(name: string, options?: SpanOptions): Span {
        if (!this.isEnabled()) {
            return createNoOpSpan();
        }

        const span = this.tracer.startSpan(name, {
            ...options,
            attributes: {
                serviceName: this.config.serviceName,
                serviceVersion: this.config.serviceVersion || 'unknown',
                environment: this.config.environment || 'development',
                ...this.config.globalAttributes,
                ...options?.attributes,
            },
        });

        return span;
    }

    /**
     * Trace an event execution
     */
    traceEvent<T>(event: Event, handler: () => T | Promise<T>): Promise<T> {
        if (!this.config.features.traceEvents) {
            return Promise.resolve(handler());
        }

        const span = this.startSpan(`event.${event.type}`, {
            kind: 'internal',
            attributes: {
                eventType: event.type,
                eventTimestamp: event.ts,
            },
        });

        return this.withSpan(span, async () => {
            try {
                const result = await handler();
                span.setStatus({ code: 'ok' });
                return result;
            } catch (error) {
                span.recordException(error as Error);
                throw error;
            }
        });
    }

    /**
     * Execute a function within a span context
     */
    async withSpan<T>(span: Span, fn: () => T | Promise<T>): Promise<T> {
        const previousSpan = this.currentSpan;
        this.currentSpan = span;

        try {
            const result = await fn();
            return result;
        } finally {
            span.end();
            this.currentSpan = previousSpan;
        }
    }

    /**
     * Get the current active span
     */
    getCurrentSpan(): Span | undefined {
        return this.currentSpan;
    }

    /**
     * Record a metric
     */
    recordMetric(
        type: 'counter' | 'histogram' | 'gauge',
        name: string,
        value: number,
        attributes?: Record<string, string>,
    ): void {
        if (!this.config.features.metricsEnabled) return;

        this.metrics[type](name, value, attributes);
    }

    /**
     * Get the underlying tracer
     */
    getTracer(): Tracer {
        return this.tracer;
    }

    /**
     * Get the underlying metrics
     */
    getMetrics(): Metrics {
        return this.metrics;
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<TelemetryConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Get current configuration
     */
    getConfig(): TelemetryConfig {
        return { ...this.config };
    }
}

/**
 * Create a no-op span for when telemetry is disabled
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
 * Global telemetry instance
 */
let globalTelemetry: TelemetrySystem | undefined;

/**
 * Get or create global telemetry system
 */
export function getTelemetry(
    config?: Partial<TelemetryConfig>,
): TelemetrySystem {
    if (!globalTelemetry) {
        globalTelemetry = new TelemetrySystem(config);
    } else if (config) {
        globalTelemetry.updateConfig(config);
    }
    return globalTelemetry;
}

/**
 * Convenience function to trace a function execution
 */
export function withTelemetry<T>(
    name: string,
    fn: () => T | Promise<T>,
    options?: SpanOptions,
): Promise<T> {
    const telemetry = getTelemetry();
    const span = telemetry.startSpan(name, options);
    return telemetry.withSpan(span, fn);
}

/**
 * Get the active span from global telemetry
 */
export function getActiveSpan(): Span | undefined {
    return globalTelemetry?.getCurrentSpan();
}

/**
 * Add attribute to current span
 */
export function addSpanAttribute(
    key: string,
    value: string | number | boolean,
): void {
    const span = getActiveSpan();
    if (span) {
        span.setAttribute(key, value);
    }
}
