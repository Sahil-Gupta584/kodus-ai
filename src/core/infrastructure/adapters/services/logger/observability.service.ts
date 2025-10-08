import { Injectable } from '@nestjs/common';
import { ConnectionString } from 'connection-string';
import { getObservability, IdGenerator } from '@kodus/flow';
import type { DatabaseConnection } from '@/config/types';
import { TokenTrackingHandler } from '@kodus/kodus-common/llm';

export type TokenUsage = {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    model?: string;
    runId?: string;
    parentRunId?: string;
    output_reasoning_tokens?: number;
    runName?: string;
};

export interface ObservabilityConfig {
    serviceName: string;
    correlationId?: string;
    threadId?: string;
    enableCollections?: boolean;
    customCollections?: {
        logs?: string;
        telemetry?: string;
        errors?: string;
    };
    customSettings?: {
        batchSize?: number;
        flushIntervalMs?: number;
        ttlDays?: number;
        samplingRate?: number;
        spanTimeoutMs?: number;
    };
}

@Injectable()
export class ObservabilityService {
    private readonly instances = new Map<
        string,
        ReturnType<typeof getObservability>
    >();

    private static readonly DEFAULT_COLLECTIONS = {
        logs: 'observability_logs',
        telemetry: 'observability_telemetry',
        errors: 'observability_errors',
    };

    private static readonly DEFAULT_SETTINGS = {
        batchSize: 150,
        flushIntervalMs: 5000,
        ttlDays: 0,
        samplingRate: 1,
        spanTimeoutMs: 10 * 60 * 1000,
    };

    // ---------- bootstrap ----------

    createObservabilityConfig(
        config: DatabaseConnection,
        options: ObservabilityConfig,
    ) {
        const uri = this.buildConnectionString(config);

        const collections =
            options.enableCollections !== false
                ? {
                      logs:
                          options.customCollections?.logs ??
                          ObservabilityService.DEFAULT_COLLECTIONS.logs,
                      telemetry:
                          options.customCollections?.telemetry ??
                          ObservabilityService.DEFAULT_COLLECTIONS.telemetry,
                      errors:
                          options.customCollections?.errors ??
                          ObservabilityService.DEFAULT_COLLECTIONS.errors,
                  }
                : undefined;

        return {
            logging: { enabled: true },
            mongodb: {
                type: 'mongodb' as const,
                connectionString: uri,
                database: config.database,
                ...(collections && { collections }),
                batchSize:
                    options.customSettings?.batchSize ??
                    ObservabilityService.DEFAULT_SETTINGS.batchSize,
                flushIntervalMs:
                    options.customSettings?.flushIntervalMs ??
                    ObservabilityService.DEFAULT_SETTINGS.flushIntervalMs,
                ttlDays:
                    options.customSettings?.ttlDays ??
                    ObservabilityService.DEFAULT_SETTINGS.ttlDays,
                enableObservability: true,
            },
            telemetry: {
                enabled: true,
                serviceName: options.serviceName,
                sampling: {
                    rate:
                        options.customSettings?.samplingRate ??
                        ObservabilityService.DEFAULT_SETTINGS.samplingRate,
                    strategy: 'probabilistic' as const,
                },
                privacy: { includeSensitiveData: false },
                ...(options.customSettings?.spanTimeoutMs && {
                    spanTimeouts: {
                        enabled: true,
                        maxDurationMs: options.customSettings.spanTimeoutMs,
                    },
                }),
            },
        };
    }

    async initializeObservability(
        config: DatabaseConnection,
        options: ObservabilityConfig,
    ) {
        const correlationId =
            options.correlationId || this.generateCorrelationId();
        const key = this.makeKey(config, options.serviceName);

        let obs = this.instances.get(key);
        if (!obs) {
            const obsConfig = this.createObservabilityConfig(config, options);
            obs = getObservability(obsConfig);
            try {
                await obs.initialize();
            } catch {
                // segue sem derrubar a app; console ainda recebe logs
            }
            this.instances.set(key, obs);
        }

        if (correlationId) {
            const ctx = obs.createContext(correlationId);
            if (options.threadId) {
                // threadId -> sessionId para correlação
                (ctx as any).sessionId = options.threadId;
            }
            obs.setContext(ctx);
        }

        return obs;
    }

    createAgentObservabilityConfig(
        config: DatabaseConnection,
        serviceName: string,
        correlationId?: string,
    ) {
        return this.createObservabilityConfig(config, {
            serviceName,
            correlationId,
            enableCollections: true,
        });
    }

    createPipelineObservabilityConfig(
        config: DatabaseConnection,
        serviceName: string,
        correlationId?: string,
    ) {
        return this.createObservabilityConfig(config, {
            serviceName,
            correlationId,
            enableCollections: true,
            customSettings: { spanTimeoutMs: 15 * 60 * 1000 },
        });
    }

    buildConnectionString(config: DatabaseConnection): string {
        if (!config?.host) {
            throw new Error(
                'ObservabilityService: host inválido ou ausente em DatabaseConnection',
            );
        }

        const protocol = config.port ? 'mongodb' : 'mongodb+srv';

        const hostItems = String(config.host)
            .split(',')
            .map((raw) => raw.trim())
            .filter(Boolean)
            .map((h) => ({ name: h, port: config.port }));

        return new ConnectionString('', {
            user: config.username,
            password: config.password,
            protocol,
            hosts:
                hostItems.length > 0
                    ? hostItems
                    : [{ name: config.host, port: config.port }],
        }).toString();
    }

    generateCorrelationId(): string {
        return IdGenerator.correlationId();
    }

    async ensureContext(
        config: DatabaseConnection,
        serviceName: string,
        correlationId?: string,
    ) {
        return this.initializeObservability(config, {
            serviceName,
            correlationId: correlationId || this.generateCorrelationId(),
        });
    }

    private makeKey(config: DatabaseConnection, serviceName: string): string {
        return JSON.stringify({
            h: config.host,
            p: config.port ?? null,
            db: config.database ?? null,
            s: serviceName,
        });
    }

    // ---------- spans (API simples e reutilizável) ----------

    /** Abre um span e aplica atributos iniciais (se informados). */
    startSpan(name: string, attributes?: Record<string, any>) {
        const obs = getObservability();
        const span = obs.startSpan(name);
        if (attributes && typeof span?.setAttributes === 'function') {
            span.setAttributes(attributes);
        }
        return span;
    }

    /**
     * Executa uma função dentro de um span (com fechamento garantido).
     * Ideal pra blocos curtos sem try/finally no chamador.
     */
    async runInSpan<T>(
        name: string,
        fn: (span: any) => Promise<T> | T,
        attributes?: Record<string, any>,
    ): Promise<T> {
        const obs = getObservability();
        const span = this.startSpan(name, {
            ...(attributes ?? {}),
            correlationId: obs.getContext()?.correlationId || '',
        });

        return obs.withSpan(span, async () => {
            try {
                const result = await fn(span);
                return result;
            } catch (err: any) {
                span?.setAttributes?.({
                    'error': true,
                    'exception.type': err?.name || 'Error',
                    'exception.message': err?.message || String(err),
                });
                throw err;
            }
        });
    }

    // ---------- LLM tracking integrado ----------

    createLLMTracking(runName?: string) {
        const tracker = new TokenTrackingHandler();

        function summarize(usages: TokenUsage[]) {
            const acc = {
                totalTokens: 0,
                inputTokens: 0,
                outputTokens: 0,
                reasoningTokens: 0,
                models: new Set<string>(),
                runIds: new Set<string>(),
                parentRunIds: new Set<string>(),
                runNames: new Set<string>(),
                details: [] as TokenUsage[],
            };
            for (const u of usages) {
                const input = u.input_tokens ?? 0;
                const output = u.output_tokens ?? 0;
                const reasoning = (u as any).output_reasoning_tokens ?? 0;
                const total = u.total_tokens ?? input + output;
                if (u.model) acc.models.add(u.model);
                if (u.runId) acc.runIds.add(u.runId);
                if (u.parentRunId) acc.parentRunIds.add(u.parentRunId);
                if (u.runName) acc.runNames.add(u.runName);
                acc.totalTokens += total;
                acc.inputTokens += input;
                acc.outputTokens += output;
                acc.reasoningTokens += reasoning;
                acc.details.push(u);
            }
            return {
                ...acc,
                modelsArr: Array.from(acc.models),
                runIdsArr: Array.from(acc.runIds),
                parentRunIdsArr: Array.from(acc.parentRunIds),
                runNamesArr: Array.from(acc.runNames),
            };
        }

        const finalize = async ({
            metadata,
            runName: explicitName,
            reset,
        }: {
            metadata?: Record<string, any>;
            runName?: string;
            reset?: boolean;
        } = {}) => {
            const obs = getObservability();
            const span = obs.getCurrentSpan();

            const {
                runKey,
                runName: resolvedName,
                usages,
            } = tracker.consumeCompletedRunUsages(explicitName ?? runName);

            const s = summarize(usages);

            if (span) {
                span.setAttributes({
                    // OpenTelemetry GenAI semantic conventions
                    'gen_ai.usage.total_tokens': s.totalTokens,
                    'gen_ai.usage.input_tokens': s.inputTokens,
                    'gen_ai.usage.output_tokens': s.outputTokens,
                    ...(s.reasoningTokens > 0 && {
                        'gen_ai.usage.reasoning_tokens': s.reasoningTokens,
                    }),
                    ...(s.modelsArr.length && {
                        'gen_ai.response.model': s.modelsArr.join(','),
                    }),
                    ...(runKey && { 'gen_ai.run.id': runKey }),
                    ...((explicitName ?? runName ?? resolvedName) && {
                        'gen_ai.run.name':
                            explicitName ?? runName ?? resolvedName,
                    }),
                    ...(s.runIdsArr.length && {
                        runIds: s.runIdsArr.join(','),
                    }),
                    ...(s.parentRunIdsArr.length && {
                        parentRunIds: s.parentRunIdsArr.join(','),
                    }),
                    ...(s.runNamesArr.length && {
                        runNames: s.runNamesArr.join(','),
                    }),
                    ...(metadata ?? {}),
                });
            }

            if (reset) tracker.reset(runKey ?? undefined);

            return {
                runKey,
                runName: resolvedName ?? runName,
                usages,
                summary: s,
            };
        };

        return { callbacks: [tracker], tracker, finalize };
    }

    /**
     * Envolve a chamada de LLM num span, injeta callbacks de token e garante finalize + end() no finally.
     * `exec` recebe os callbacks para usar em `.addCallbacks(callbacks)`.
     */
    async runLLMInSpan<T>(params: {
        spanName: string;
        runName?: string;
        attrs?: Record<string, any>;
        exec: (callbacks: any[]) => Promise<T>; // tipo de callbacks do seu runner
    }): Promise<{ result: T; usage: any }> {
        const { spanName, runName, attrs, exec } = params;

        const obs = getObservability();
        const span = obs.startSpan(spanName);
        // atributos iniciais + correlação
        span?.setAttributes?.({
            ...(attrs ?? {}),
            correlationId: obs.getContext()?.correlationId || '',
        });

        const { callbacks, finalize } = this.createLLMTracking(runName);

        try {
            const result = await obs.withSpan(span, async () =>
                exec(callbacks),
            );
            return {
                result,
                usage: await finalize({ metadata: attrs, reset: true }),
            };
        } catch (err: any) {
            // marca erro no span (status + atributos)
            if (typeof span?.setStatus === 'function') {
                span.setStatus({
                    code: 'error',
                    message: err?.message || String(err),
                });
            }
            span?.setAttributes?.({
                'error': true,
                'exception.type': err?.name || 'Error',
                'exception.message': err?.message || String(err),
            });
            throw err;
        } finally {
            span?.end?.();
        }
    }

    /**
     * LEGADO/compat: consolida uso de tokens no span corrente a partir de um tracker fornecido.
     * Prefira `createLLMTracking(...).finalize(...)` para novos fluxos.
     */
    endSpan(
        tracker?: TokenTrackingHandler,
        metadata?: Record<string, any>,
        reset: boolean = false,
    ) {
        if (!tracker) {
            const span = getObservability().getCurrentSpan();
            span?.setAttributes?.({ ...(metadata || {}) });
            return;
        }
        const { finalize } = this.createLLMTracking(); // só para reaproveitar summarize + setAttributes
        // usa o mesmo tracker recebido
        (finalize as any)({ metadata, reset, tracker });
    }
}
