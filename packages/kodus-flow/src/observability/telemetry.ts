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
        strategy: 'probabilistic';
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

    // Privacy flags
    privacy?: {
        includeSensitiveData?: boolean;
    };

    // Span timeout behavior (apenas para InMemoryTracer)
    spanTimeouts?: {
        enabled?: boolean; // default: true
        maxDurationMs?: number; // default: 5m
    };
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
    private enableSpanTimeouts: boolean;
    private activeSpans = new Map<string, InMemorySpan>();
    private completedSpans: InMemorySpan[] = [];
    private maxSpanHistory = 1000;
    private spanTimeouts = new Map<string, NodeJS.Timeout>();
    private maxSpanDuration = 5 * 60 * 1000; // 5 minutes

    constructor(options?: { enabled?: boolean; maxDurationMs?: number }) {
        this.enableSpanTimeouts = options?.enabled ?? true;
        this.maxSpanDuration = options?.maxDurationMs ?? this.maxSpanDuration;
    }

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
        if (this.enableSpanTimeouts) {
            const timeout = setTimeout(() => {
                if (this.activeSpans.has(spanId)) {
                    span.setStatus({
                        code: 'timeout',
                        message: 'Span timed out',
                    });
                    span.end();
                }
            }, this.maxSpanDuration);
            this.spanTimeouts.set(spanId, timeout);
        }

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

    updateOptions(options: {
        enabled?: boolean;
        maxDurationMs?: number;
    }): void {
        if (typeof options.enabled === 'boolean') {
            this.enableSpanTimeouts = options.enabled;
        }
        if (typeof options.maxDurationMs === 'number') {
            this.maxSpanDuration = options.maxDurationMs;
        }
    }

    private generateIdWithPrefix(
        prefix: string,
        base: 'correlation' | 'call',
    ): string {
        const id =
            base === 'correlation'
                ? IdGenerator.correlationId()
                : IdGenerator.callId();
        const idx = id.indexOf('_');
        return idx > 0 ? `${prefix}${id.slice(idx)}` : `${prefix}_${id}`;
    }

    private generateTraceId(): string {
        return this.generateIdWithPrefix('trace', 'correlation');
    }

    private generateSpanId(): string {
        return this.generateIdWithPrefix('span', 'call');
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
    private static asyncContext?: import('node:async_hooks').AsyncLocalStorage<Span>;
    private contextProvider?: () =>
        | {
              tenantId?: string;
              correlationId?: string;
              executionId?: string;
          }
        | undefined;
    private spanInfo = new WeakMap<
        Span,
        {
            name: string;
            attributes: Record<string, string | number | boolean>;
            startTime: number;
        }
    >();
    private processors: Array<(items: TraceItem[]) => void | Promise<void>> =
        [];

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

        this.tracer =
            config.externalTracer ||
            new InMemoryTracer({
                enabled: config.spanTimeouts?.enabled ?? true,
                maxDurationMs:
                    config.spanTimeouts?.maxDurationMs ?? 5 * 60 * 1000,
            });
        // Async context for safer propagation (optional)
        // AsyncLocalStorage só no Node. Carregamento dinâmico ESM-friendly.
        (async () => {
            try {
                const asyncHooks = (await import(
                    'node:async_hooks'
                )) as typeof import('node:async_hooks');
                TelemetrySystem.asyncContext =
                    new asyncHooks.AsyncLocalStorage<Span>();
            } catch {
                // ambientes sem async_hooks (browser/workers) seguem com currentSpan simples
            }
        })().catch(() => {});
        this.metrics = new InMemoryMetrics();
    }

    /**
     * Check if telemetry is enabled and should be sampled
     */
    isEnabled(): boolean {
        if (!this.config.enabled) {
            return false;
        }

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

        const parentContext =
            options?.parent || this.currentSpan?.getSpanContext();

        const finalAttributes: Record<string, string | number | boolean> = {
            serviceName: this.config.serviceName,
            serviceVersion: this.config.serviceVersion || 'unknown',
            environment: this.config.environment || 'development',
            ...this.config.globalAttributes,
            ...options?.attributes,
        };

        const span = this.tracer.startSpan(name, {
            ...options,
            parent: parentContext,
            attributes: finalAttributes,
        });

        const startTime = options?.startTime || Date.now();
        this.spanInfo.set(span, {
            name,
            attributes: finalAttributes,
            startTime,
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
            const runner = async () => await fn();

            if (TelemetrySystem.asyncContext) {
                return await new Promise<T>((resolve, reject) => {
                    TelemetrySystem.asyncContext!.run(span, () => {
                        Promise.resolve().then(runner).then(resolve, reject);
                    });
                });
            }

            return await runner();
        } finally {
            span.end();
            this.currentSpan = previousSpan;

            // Dispatch to processors
            const info = this.spanInfo.get(span);

            if (info) {
                const item: TraceItem = {
                    name: info.name,
                    context: span.getSpanContext(),
                    attributes: info.attributes,
                    startTime: info.startTime,
                    endTime: Date.now(),
                };

                for (const proc of this.processors) {
                    try {
                        void proc([item]);
                    } catch {
                        // ignore
                    }
                }
                this.spanInfo.delete(span);
            }
        }
    }

    /**
     * Get the current active span
     */
    getCurrentSpan(): Span | undefined {
        return TelemetrySystem.asyncContext?.getStore() || this.currentSpan;
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
        if (!this.config.features.metricsEnabled) {
            return;
        }

        this.metrics[type](name, value, attributes);
    }

    /**
     * Get the underlying tracer
     */
    getTracer(): Tracer {
        return this.tracer;
    }

    getMetrics(): Metrics {
        return this.metrics;
    }

    setContextProvider(
        provider:
            | (() =>
                  | {
                        tenantId?: string;
                        correlationId?: string;
                        executionId?: string;
                    }
                  | undefined)
            | undefined,
    ): void {
        this.contextProvider = provider;
    }

    getContextAttributes(): Record<string, string | number | boolean> {
        const attributes: Record<string, string | number | boolean> = {};
        try {
            const ctx = this.contextProvider?.();

            if (ctx?.tenantId) {
                attributes['tenant.id'] = ctx.tenantId;
            }

            if (ctx?.correlationId) {
                attributes['correlation.id'] = ctx.correlationId;
            }

            if (ctx?.executionId) {
                attributes['execution.id'] = ctx.executionId;
            }
        } catch {
            // ignore provider errors
        }
        return attributes;
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

    /**
     * Add a trace processor (exporter-like)
     */
    addTraceProcessor(
        processor: (items: TraceItem[]) => void | Promise<void>,
    ): void {
        this.processors.push(processor);
    }

    /**
     * Replace trace processors
     */
    setTraceProcessors(
        processors: Array<(items: TraceItem[]) => void | Promise<void>>,
    ): void {
        this.processors = [...processors];
    }

    /**
     * Force flush (useful in serverless/browser)
     */
    async forceFlush(): Promise<void> {
        const tracerAny = this.tracer as unknown as {
            forceFlush?: () => Promise<void> | void;
            flush?: () => Promise<void> | void;
        };

        if (typeof tracerAny.forceFlush === 'function') {
            await Promise.resolve(tracerAny.forceFlush());
        } else if (typeof tracerAny.flush === 'function') {
            await Promise.resolve(tracerAny.flush());
        }
    }
}

// Public types for processors
export interface TraceItem {
    name: string;
    context: SpanContext;
    attributes: Record<string, string | number | boolean>;
    startTime: number;
    endTime: number;
}

// ============================================================================
// DOMAIN SPAN HELPERS (padronizam nomes e atributos)
// ============================================================================

export type AgentPhase = 'think' | 'act' | 'observe' | 'analyze' | 'synthesize';

export interface AgentSpanAttributes {
    agentName: string;
    tenantId?: string;
    correlationId?: string;
    iteration?: number;
    attributes?: Record<string, string | number | boolean>;
}

export function startAgentSpan(
    telemetry: TelemetrySystem,
    phase: AgentPhase,
    attrs: AgentSpanAttributes,
): Span {
    const attributes: Record<string, string | number | boolean> = {};
    attributes['agent.name'] = attrs.agentName;

    if (attrs.tenantId) {
        attributes['tenant.id'] = attrs.tenantId;
    }
    if (attrs.correlationId) {
        attributes['correlation.id'] = attrs.correlationId;
    }

    if (typeof attrs.iteration === 'number') {
        attributes['iteration'] = attrs.iteration;
    }

    if (attrs.attributes) {
        Object.assign(attributes, attrs.attributes);
    }

    return telemetry.startSpan(`agent.${phase}`, { attributes });
}

export interface ToolSpanAttributes {
    toolName: string;
    callId?: string;
    timeoutMs?: number;
    tenantId?: string;
    correlationId?: string;
    attributes?: Record<string, string | number | boolean>;
}

export function startToolSpan(
    telemetry: TelemetrySystem,
    attrs: ToolSpanAttributes,
): Span {
    const attributes: Record<string, string | number | boolean> = {
        ...telemetry.getContextAttributes(),
    };
    attributes['tool.name'] = attrs.toolName;

    if (attrs.callId) {
        attributes['callId'] = attrs.callId;
    }

    if (typeof attrs.timeoutMs === 'number') {
        attributes['timeoutMs'] = attrs.timeoutMs;
    }

    if (attrs.tenantId) {
        attributes['tenant.id'] = attrs.tenantId;
    }

    if (attrs.correlationId) {
        attributes['correlation.id'] = attrs.correlationId;
    }

    if (attrs.attributes) {
        Object.assign(attributes, attrs.attributes);
    }

    return telemetry.startSpan('tool.execute', { attributes });
}

export interface LLMSpanAttributes {
    model?: string;
    technique?: string;
    inputTokens?: number;
    outputTokens?: number;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    tenantId?: string;
    correlationId?: string;
    attributes?: Record<string, string | number | boolean>;
}

export function startLLMSpan(
    telemetry: TelemetrySystem,
    attrs: LLMSpanAttributes,
): Span {
    const attributes: Record<string, string | number | boolean> = {
        ...telemetry.getContextAttributes(),
    };

    // Convenções gen_ai.* (mantemos legacy também para compatibilidade)
    if (attrs.model) {
        attributes['gen_ai.model.name'] = attrs.model;
        attributes['model'] = attrs.model; // legacy
    }
    if (attrs.technique) {
        attributes['gen_ai.technique'] = attrs.technique;
        attributes['technique'] = attrs.technique; // legacy
    }
    if (typeof attrs.temperature === 'number') {
        attributes['gen_ai.request.temperature'] = attrs.temperature;
    }
    if (typeof attrs.topP === 'number') {
        attributes['gen_ai.request.top_p'] = attrs.topP;
    }
    if (typeof attrs.maxTokens === 'number') {
        attributes['gen_ai.request.max_tokens'] = attrs.maxTokens;
    }

    if (typeof attrs.inputTokens === 'number') {
        attributes['gen_ai.usage.input_tokens'] = attrs.inputTokens;
        attributes['inputTokens'] = attrs.inputTokens; // legacy
    }
    if (typeof attrs.outputTokens === 'number') {
        attributes['gen_ai.usage.output_tokens'] = attrs.outputTokens;
        attributes['outputTokens'] = attrs.outputTokens; // legacy
    }

    if (attrs.tenantId) {
        attributes['tenant.id'] = attrs.tenantId;
    }
    if (attrs.correlationId) {
        attributes['correlation.id'] = attrs.correlationId;
    }
    if (attrs.attributes) {
        Object.assign(attributes, attrs.attributes);
    }
    return telemetry.startSpan('llm.generation', { attributes });
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
