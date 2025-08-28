import {
    SpanOptions,
    SpanStatus,
    Tracer as KodusTracer,
    Span as KodusSpan,
    LooseOtelSpan,
    LooseOtelAPI,
    UnknownRecord,
} from '@/core/types/allTypes.js';

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

    constructor(otelApi: LooseOtelAPI) {
        this.otel = otelApi;
    }

    startSpan(name: string, options?: SpanOptions): KodusSpan {
        const tracer = this.otel.trace.getTracer('kodus-flow');
        const ctx = options?.parent
            ? this.otel.trace.setSpan(
                  this.otel.context.active(),
                  options.parent,
              )
            : undefined;

        const span = tracer.startSpan(
            name,
            {
                kind: 0, // INTERNAL
                startTime: options?.startTime,
                attributes: options?.attributes as UnknownRecord | undefined,
            },
            ctx,
        );

        return new OtelSpanWrapper(span);
    }

    createSpanContext(traceId: string, spanId: string) {
        return { traceId, spanId, traceFlags: 1 };
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
