import {
    SpanOptions,
    SpanStatus,
    Tracer as KodusTracer,
    Span as KodusSpan,
    LooseOtelSpan,
    LooseOtelAPI,
    UnknownRecord,
    SpanKind,
    SpanContext,
} from '../core/types/allTypes.js';
import { createLogger } from './logger.js';

class OtelSpanWrapper implements KodusSpan {
    private readonly span: LooseOtelSpan;

    constructor(span: LooseOtelSpan) {
        this.span = span;
    }

    setAttribute(key: string, value: string | number | boolean): KodusSpan {
        this.span.setAttribute(key, value);
        return this;
    }

    setAttributes(
        attributes: Record<string, string | number | boolean>,
    ): KodusSpan {
        for (const [k, v] of Object.entries(attributes)) {
            this.span.setAttribute(k, v);
        }
        return this;
    }

    setStatus(status: SpanStatus): KodusSpan {
        // 2=ERROR, 1=OK (alinhado ao OTEL)
        this.span.setStatus({
            code: status.code === 'error' ? 2 : 1,
            message: status.message,
        });
        return this;
    }

    recordException(exception: Error): KodusSpan {
        this.span.recordException(exception);
        this.setStatus({ code: 'error', message: exception.message });
        return this;
    }

    addEvent(name: string, attributes?: Record<string, unknown>): KodusSpan {
        this.span.addEvent(name, attributes);
        return this;
    }

    end(endTime?: number): void {
        this.span.end(endTime);
    }

    getSpanContext() {
        return this.span.spanContext();
    }

    isRecording(): boolean {
        return this.span.isRecording();
    }
}

export class OtelTracerAdapter implements KodusTracer {
    private otel: LooseOtelAPI;
    private logger: ReturnType<typeof createLogger>;

    constructor(otelApi: LooseOtelAPI) {
        this.otel = otelApi;
        this.logger = createLogger('otel-adapter');
    }

    // ✅ MELHORIA 1: Mapeamento de SpanKind
    private mapSpanKind(kind: SpanKind): number {
        const kindMap: Record<SpanKind, number> = {
            internal: 0,
            server: 1,
            client: 2,
            producer: 3,
            consumer: 4,
        };
        return kindMap[kind] || 0;
    }

    // ✅ MELHORIA 2: Validação de entrada
    private validateSpanOptions(name: string, options?: SpanOptions): void {
        if (!name || typeof name !== 'string') {
            throw new Error('Span name must be a non-empty string');
        }

        if (name.trim().length === 0) {
            throw new Error('Span name cannot be empty or whitespace');
        }

        if (options?.startTime && typeof options.startTime !== 'number') {
            throw new Error('Span startTime must be a number');
        }

        if (options?.attributes && typeof options.attributes !== 'object') {
            throw new Error('Span attributes must be an object');
        }

        if (
            options?.kind &&
            !['internal', 'server', 'client', 'producer', 'consumer'].includes(
                options.kind,
            )
        ) {
            throw new Error(
                `Invalid span kind: ${options.kind}. Must be one of: internal, server, client, producer, consumer`,
            );
        }
    }

    // ✅ MELHORIA 3: Criação de contexto com logging estruturado
    private createOtelContext(spanContext: SpanContext): unknown {
        try {
            const otelSpanContext = {
                traceId: spanContext.traceId,
                spanId: spanContext.spanId,
                traceFlags: spanContext.traceFlags,
            };

            const mockSpan = {
                spanContext: () => otelSpanContext,
                isRecording: () => true,
            };

            const ctx = this.otel.trace.setSpan(
                this.otel.context.active(),
                mockSpan as any,
            );

            this.logger.debug('OTEL context created successfully', {
                traceId: spanContext.traceId,
                spanId: spanContext.spanId,
                traceFlags: spanContext.traceFlags,
            });

            return ctx;
        } catch (error) {
            this.logger.warn(
                'Failed to create OTEL context, using active context',
                {
                    error:
                        error instanceof Error ? error.message : String(error),
                    spanContext: {
                        traceId: spanContext.traceId,
                        spanId: spanContext.spanId,
                        traceFlags: spanContext.traceFlags,
                    },
                },
            );
            return this.otel.context.active();
        }
    }

    startSpan(name: string, options?: SpanOptions): KodusSpan {
        // ✅ MELHORIA 1: Validação de entrada
        this.validateSpanOptions(name, options);

        const tracer = this.otel.trace.getTracer('kodus-flow');

        // ✅ MELHORIA 2: Criação de contexto com logging
        let ctx: unknown = this.otel.context.active();

        if (options?.parent) {
            ctx = this.createOtelContext(options.parent);
        }

        // ✅ MELHORIA 3: Mapeamento de SpanKind
        const spanKind = this.mapSpanKind(options?.kind || 'internal');

        const span = tracer.startSpan(
            name,
            {
                kind: spanKind,
                startTime: options?.startTime,
                attributes: options?.attributes as UnknownRecord | undefined,
            },
            ctx,
        );

        this.logger.debug('Span created successfully', {
            name,
            kind: options?.kind || 'internal',
            spanKind,
            hasParent: !!options?.parent,
            hasAttributes: !!options?.attributes,
        });

        return new OtelSpanWrapper(span);
    }

    createSpanContext(traceId: string, spanId: string) {
        // ✅ MELHORIA 1: Validação de entrada
        if (!traceId || typeof traceId !== 'string') {
            throw new Error('TraceId must be a non-empty string');
        }

        if (!spanId || typeof spanId !== 'string') {
            throw new Error('SpanId must be a non-empty string');
        }

        if (traceId.length !== 32) {
            this.logger.warn('TraceId length is not 32 characters', {
                traceId,
                length: traceId.length,
            });
        }

        if (spanId.length !== 16) {
            this.logger.warn('SpanId length is not 16 characters', {
                spanId,
                length: spanId.length,
            });
        }

        const context = { traceId, spanId, traceFlags: 1 };

        this.logger.debug('Span context created', {
            traceId,
            spanId,
            traceFlags: context.traceFlags,
        });

        return context;
    }
}

export async function createOtelTracerAdapter(): Promise<OtelTracerAdapter> {
    try {
        const otelApi = (await import(
            '@opentelemetry/api'
        )) as unknown as LooseOtelAPI;
        return new OtelTracerAdapter(otelApi);
    } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const hint =
            '@opentelemetry/api não encontrado. Instale no host: `yarn add @opentelemetry/api` (ou forneça um tracer externo).';
        error.message = `${error.message}\n${hint}`;
        throw error;
    }
}

// =============================================================================
// High-level helper para configurar OTEL + retornar adapter para TelemetrySystem
// =============================================================================

/**
 * Opções para configurar o SDK do OpenTelemetry (Node) com OTLP HTTP Exporter.
 * Mantemos os tipos leves para evitar dependência de tipos do OTEL no core.
 */
/* export interface SetupOtelTracingOptions {
    exporterUrl: string;
    headers?: string | Record<string, string>;
    serviceName?: string;
    serviceVersion?: string;
    environment?: string;
    resourceAttributes?: Record<string, string | number | boolean>;
    samplingRate?: number; // 0..1 (default recomendado produção: 0.1)
    maxQueueSize?: number; // default: 20480
    maxExportBatchSize?: number; // default: 512
    scheduledDelayMillis?: number; // default: 2000
    exportTimeoutMillis?: number; // default: 10000
} */

// (removido) parseHeaders

/**
 * Configura o SDK do OpenTelemetry em Node (Provider + BatchSpanProcessor + OTLP Exporter)
 * e retorna um OtelTracerAdapter para ser plugado no TelemetrySystem (externalTracer).
 *
 * Observação importante: Este helper faz imports dinâmicos para não acoplar dependências
 * de OTEL no core do framework. É necessário instalar os pacotes no host:
 *   yarn add @opentelemetry/api @opentelemetry/sdk-trace-node @opentelemetry/sdk-trace-base \
 *            @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources \
 *            @opentelemetry/semantic-conventions
 */
/* export async function setupOtelTracing(
    options: SetupOtelTracingOptions,
): Promise<OtelTracerAdapter> {
    const {
        exporterUrl,
        headers,
        serviceName = 'kodus-flow',
        serviceVersion,
        environment = process.env.NODE_ENV || 'development',
        resourceAttributes,
        samplingRate = 0.1,
        maxQueueSize = 20480,
        maxExportBatchSize = 512,
        scheduledDelayMillis = 2000,
        exportTimeoutMillis = 10000,
    } = options;

    try {
        // Imports dinâmicos (sem tipos para evitar acoplamento do core)
        const traceNodeMod = (await import(
            '@opentelemetry/' + 'sdk-trace-node'
        )) as unknown;
        const nodeTracerProviderCtor = (
            traceNodeMod as Record<string, unknown>
        )['NodeTracerProvider'] as new (args: unknown) => {
            addSpanProcessor: (p: unknown) => void;
            register: () => void;
        };

        const traceBaseMod = (await import(
            '@opentelemetry/' + 'sdk-trace-base'
        )) as unknown;
        const batchSpanProcessorCtor = (
            traceBaseMod as Record<string, unknown>
        )['BatchSpanProcessor'] as new (
            exporter: unknown,
            cfg?: unknown,
        ) => unknown;
        const parentBasedSamplerCtor = (
            traceBaseMod as Record<string, unknown>
        )['ParentBasedSampler'] as new (inner: unknown) => unknown;
        const traceIdRatioBasedSamplerCtor = (
            traceBaseMod as Record<string, unknown>
        )['TraceIdRatioBasedSampler'] as new (ratio: number) => unknown;
        const alwaysOnSamplerCtor = (traceBaseMod as Record<string, unknown>)[
            'AlwaysOnSampler'
        ] as new () => unknown;
        const alwaysOffSamplerCtor = (traceBaseMod as Record<string, unknown>)[
            'AlwaysOffSampler'
        ] as new () => unknown;

        const exporterMod = (await import(
            '@opentelemetry/' + 'exporter-trace-otlp-http'
        )) as unknown;
        const otlpTraceExporterCtor = (exporterMod as Record<string, unknown>)[
            'OTLPTraceExporter'
        ] as new (cfg: unknown) => unknown;

        const resourcesMod = (await import(
            '@opentelemetry/' + 'resources'
        )) as unknown;
        const resourceCtor = (resourcesMod as Record<string, unknown>)[
            'Resource'
        ] as new (attrs: unknown) => unknown;

        // Evitar dependência forte de semantic-conventions: usar chaves literais
        const SERVICE_NAME_ATTR = 'service.name';
        const DEPLOYMENT_ENVIRONMENT_ATTR = 'deployment.environment';
        const SERVICE_VERSION_ATTR = 'service.version';

        const sampler = (() => {
            if (samplingRate >= 1) return new alwaysOnSamplerCtor();
            if (samplingRate <= 0) return new alwaysOffSamplerCtor();
            return new parentBasedSamplerCtor(
                new traceIdRatioBasedSamplerCtor(samplingRate),
            );
        })();

        const baseAttrs: Record<string, unknown> = {};
        baseAttrs[SERVICE_NAME_ATTR] = serviceName;
        baseAttrs[DEPLOYMENT_ENVIRONMENT_ATTR] = environment;
        if (serviceVersion) {
            baseAttrs[SERVICE_VERSION_ATTR] = serviceVersion;
        }
        if (resourceAttributes) {
            Object.assign(baseAttrs, resourceAttributes);
        }

        const resource = new resourceCtor(baseAttrs);

        const provider = new nodeTracerProviderCtor({
            resource,
            sampler,
        });

        const exporter = new otlpTraceExporterCtor({
            url: exporterUrl,
            headers: parseHeaders(headers),
            timeoutMillis: exportTimeoutMillis,
        });

        const bsp = new batchSpanProcessorCtor(exporter, {
            maxQueueSize,
            maxExportBatchSize,
            scheduledDelayMillis,
            exportTimeoutMillis,
        });

        provider.addSpanProcessor(bsp);
        provider.register();

        // Retorna adapter para plugar no TelemetrySystem como externalTracer
        return await createOtelTracerAdapter();
    } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const hint =
            'Falha ao configurar OpenTelemetry. Instale as dependências no host:\n' +
            '  yarn add @opentelemetry/api @opentelemetry/sdk-trace-node @opentelemetry/sdk-trace-base \\\n' +
            '           @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources @opentelemetry/semantic-conventions';
        error.message = `${error.message}\n${hint}`;
        throw error;
    }
} */
