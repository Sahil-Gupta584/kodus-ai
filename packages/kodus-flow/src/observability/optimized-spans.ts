import { trace, Span, SpanStatusCode, context } from '@opentelemetry/api';

/**
 * Sampling configuration for intelligent span creation
 */
export interface SpanSamplingConfig {
    /** Enable sampling for this span type */
    enabled: boolean;
    /** Sample rate (0.0 to 1.0) */
    sampleRate: number;
    /** Minimum duration to create span (ms) */
    minDuration?: number;
    /** Skip spans for certain operations */
    skipPatterns?: string[];
}

/**
 * Default sampling configurations for different span types
 */
const DEFAULT_SAMPLING_CONFIGS: Record<string, SpanSamplingConfig> = {
    AGENT_EXECUTION: {
        enabled: true,
        sampleRate: 1.0, // Always sample agent executions
        minDuration: 100, // Only for executions > 100ms
    },
    AGENT_THINK: {
        enabled: true,
        sampleRate: 0.5, // Sample 50% of thinking operations
        minDuration: 50,
        skipPatterns: ['simple-validation'],
    },
    TOOL_EXECUTION: {
        enabled: true,
        sampleRate: 0.8, // Sample 80% of tool executions
        minDuration: 10,
    },
    LLM_CALL: {
        enabled: true,
        sampleRate: 0.7, // Sample 70% of LLM calls
        minDuration: 100,
    },
    DATABASE_QUERY: {
        enabled: false, // Disable database spans by default (too noisy)
        sampleRate: 0.1,
        minDuration: 5,
    },
};

/**
 * Optimized span manager with lazy loading and sampling
 */
export class OptimizedSpanManager {
    private static instance: OptimizedSpanManager;
    private activeSpans = new Map<string, OptimizedSpan>();
    private samplingConfigs = DEFAULT_SAMPLING_CONFIGS;

    private constructor() {}

    static getInstance(): OptimizedSpanManager {
        if (!OptimizedSpanManager.instance) {
            OptimizedSpanManager.instance = new OptimizedSpanManager();
        }
        return OptimizedSpanManager.instance;
    }

    /**
     * Create an optimized span with sampling and lazy loading
     */
    createSpan(
        name: string,
        options: {
            attributes?: Record<string, string | number | boolean>;
            parentSpan?: Span;
            spanType?: string;
            forceCreate?: boolean;
        } = {},
    ): OptimizedSpan | null {
        const {
            attributes = {},
            parentSpan,
            spanType,
            forceCreate = false,
        } = options;

        // Determine span type for sampling
        const type = spanType || this.inferSpanType(name);
        const config = this.samplingConfigs[type];

        // Get or create default config
        const finalConfig = config || {
            enabled: true,
            sampleRate: 1.0,
        };

        // Check if span should be skipped
        if (
            !forceCreate &&
            (!finalConfig.enabled || !this.shouldSample(finalConfig))
        ) {
            return null; // Don't create span
        }

        // Create span with optimized context
        const tracer = trace.getTracer('kodus-flow', '1.0.0');
        const spanContext = parentSpan
            ? trace.setSpan(context.active(), parentSpan)
            : undefined;
        const span = tracer.startSpan(
            name,
            {
                attributes: {
                    spanType: type,
                    spanSamplingRate: finalConfig.sampleRate,
                    ...attributes,
                },
            },
            spanContext,
        );

        const optimizedSpan = new OptimizedSpan(span, finalConfig);

        // Store for cleanup
        this.activeSpans.set(span.spanContext().spanId, optimizedSpan);

        return optimizedSpan;
    }

    /**
     * Infer span type from name
     */
    private inferSpanType(name: string): string {
        if (name.includes('agent') && name.includes('execution'))
            return 'AGENT_EXECUTION';
        if (name.includes('think') || name.includes('reasoning'))
            return 'AGENT_THINK';
        if (name.includes('tool')) return 'TOOL_EXECUTION';
        if (
            name.includes('llm') ||
            name.includes('openai') ||
            name.includes('anthropic')
        )
            return 'LLM_CALL';
        if (
            name.includes('database') ||
            name.includes('mongo') ||
            name.includes('query')
        )
            return 'DATABASE_QUERY';
        return 'GENERIC';
    }

    /**
     * Determine if span should be sampled
     */
    private shouldSample(config: SpanSamplingConfig): boolean {
        if (!config.enabled) return false;
        return Math.random() < config.sampleRate;
    }

    /**
     * Update sampling configuration
     */
    updateSamplingConfig(
        type: string,
        config: Partial<SpanSamplingConfig>,
    ): void {
        const existing = this.samplingConfigs[type] || {
            enabled: true,
            sampleRate: 1.0,
        };
        this.samplingConfigs[type] = {
            ...existing,
            ...config,
        };
    }

    /**
     * Get active span count for monitoring
     */
    getActiveSpanCount(): number {
        return this.activeSpans.size;
    }

    /**
     * Clean up completed spans
     */
    cleanupCompletedSpans(): void {
        for (const [spanId, optimizedSpan] of this.activeSpans.entries()) {
            if (optimizedSpan.isSpanEnded()) {
                this.activeSpans.delete(spanId);
            }
        }
    }
}

/**
 * Optimized span wrapper with lazy evaluation and automatic cleanup
 */
export class OptimizedSpan {
    private span: Span;
    private config: SpanSamplingConfig;
    private startTime: number;
    private lazyAttributes: Record<string, () => string | number | boolean> =
        {};
    private isEnded = false;

    constructor(span: Span, config: SpanSamplingConfig) {
        this.span = span;
        this.config = config;
        this.startTime = Date.now();
    }

    /**
     * Add attribute (immediate or lazy)
     */
    addAttribute(key: string, value: string | number | boolean): void;
    addAttribute(key: string, value: () => string | number | boolean): void;
    addAttribute(
        key: string,
        value: string | number | boolean | (() => string | number | boolean),
    ): void {
        if (typeof value === 'function') {
            // Lazy evaluation - only compute when span is actually used
            this.lazyAttributes[key] = value;
        } else {
            this.span.setAttribute(key, value);
        }
    }

    /**
     * Add multiple attributes
     */
    addAttributes(attributes: Record<string, string | number | boolean>): void {
        for (const [key, value] of Object.entries(attributes)) {
            this.addAttribute(key, value);
        }
    }

    /**
     * Set status
     */
    setStatus(code: SpanStatusCode, message?: string): void {
        this.span.setStatus({ code, message });
    }

    /**
     * Record exception
     */
    recordException(error: Error): void {
        this.span.recordException(error);
        this.setStatus(SpanStatusCode.ERROR, error.message);
    }

    /**
     * End span with automatic cleanup
     */
    end(): void {
        if (this.isEnded) return;

        const duration = Date.now() - this.startTime;

        // Check minimum duration requirement
        if (this.config.minDuration && duration < this.config.minDuration) {
            this.span.end();
            this.isEnded = true;
            return;
        }

        // Evaluate lazy attributes only now
        for (const [key, valueFn] of Object.entries(this.lazyAttributes)) {
            try {
                const value = valueFn();
                this.span.setAttribute(key, value);
            } catch (error) {
                console.warn(
                    `Failed to evaluate lazy attribute ${key}:`,
                    error,
                );
            }
        }

        // Add performance metrics
        this.span.setAttribute('span.duration_ms', duration);
        this.span.setAttribute('span.ended_at', Date.now());

        this.span.end();
        this.isEnded = true;
    }

    /**
     * Get underlying span (for advanced usage)
     */
    getSpan(): Span {
        return this.span;
    }

    /**
     * Check if span is ended
     */
    isSpanEnded(): boolean {
        return this.isEnded;
    }
}

/**
 * Helper functions for easy span creation
 */
export function createOptimizedSpan(
    name: string,
    options?: {
        attributes?: Record<string, string | number | boolean>;
        parentSpan?: Span;
        spanType?: string;
        forceCreate?: boolean;
    },
): OptimizedSpan | null {
    return OptimizedSpanManager.getInstance().createSpan(name, options);
}

export function createAgentExecutionSpan(
    agentName: string,
    executionId: string,
    correlationId: string,
): OptimizedSpan | null {
    return createOptimizedSpan(`agent.${agentName}.execution`, {
        attributes: {
            agentName,
            executionId,
            correlationId,
        },
        spanType: 'agent.execution',
        forceCreate: true, // Always create for agent executions
    });
}

export function createToolExecutionSpan(
    toolName: string,
    callId: string,
    correlationId: string,
): OptimizedSpan | null {
    return createOptimizedSpan(`tool.${toolName}.execution`, {
        attributes: {
            toolName,
            callId,
            correlationId,
        },
        spanType: 'tool.execution',
    });
}

export function createLLMSpan(
    modelName: string,
    callId: string,
    correlationId: string,
): OptimizedSpan | null {
    return createOptimizedSpan(`llm.${modelName}.call`, {
        attributes: {
            modelName,
            callId,
            correlationId,
        },
        spanType: 'llm.call',
    });
}

// Export singleton instance
export const optimizedSpanManager = OptimizedSpanManager.getInstance();
