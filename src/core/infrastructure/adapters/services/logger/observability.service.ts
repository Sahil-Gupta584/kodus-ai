import { Injectable } from '@nestjs/common';
import { ConnectionString } from 'connection-string';
import { getObservability, IdGenerator } from '@kodus/flow';
import { DatabaseConnection } from '@/config/types';
import { TokenTrackingHandler, TokenUsage } from '@kodus/kodus-common/llm';

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
        batchSize: 100,
        flushIntervalMs: 5000,
        ttlDays: 0,
        samplingRate: 1,
        spanTimeoutMs: 10 * 60 * 1000,
    };

    createObservabilityConfig(
        config: DatabaseConnection,
        options: ObservabilityConfig,
    ) {
        const uri = this.buildConnectionString(config);

        const collections =
            options.enableCollections !== false
                ? {
                      logs:
                          options.customCollections?.logs ||
                          ObservabilityService.DEFAULT_COLLECTIONS.logs,
                      telemetry:
                          options.customCollections?.telemetry ||
                          ObservabilityService.DEFAULT_COLLECTIONS.telemetry,
                      errors:
                          options.customCollections?.errors ||
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
            } catch (e) {
                // segue operação sem derrubar a app; logs ainda vão ao console
            }
            this.instances.set(key, obs);
        }

        if (correlationId) {
            const ctx = obs.createContext(correlationId);
            if (options.threadId) {
                // mapear threadId para sessionId para facilitar correlação
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
            customSettings: {
                spanTimeoutMs: 15 * 60 * 1000, // 15 minutos para pipelines
            },
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

    startSpan(name: string) {
        const obs = getObservability();
        return obs.startSpan(name);
    }

    endSpan(
        tokenTracker?: TokenTrackingHandler,
        metadata?: Record<string, any>,
        reset: boolean = false,
    ) {
        const obs = getObservability();
        const span = obs.getCurrentSpan();

        if (span) {
            obs.withSpan(span, () => {
                if (tokenTracker) {
                    const targetRunName =
                        typeof metadata?.runName === 'string'
                            ? (metadata.runName as string)
                            : undefined;
                    const { runKey, runName, usages } =
                        tokenTracker.consumeCompletedRunUsages(targetRunName);

                    type TokenSummary = {
                        totalTokens: number;
                        inputTokens: number;
                        outputTokens: number;
                        reasoningTokens: number;
                        models: Set<string>;
                        runIds: Set<string>;
                        parentRunIds: Set<string>;
                        runNames: Set<string>;
                        details: TokenUsage[];
                    };

                    const summary = usages.reduce<TokenSummary>(
                        (acc, usage) => {
                            const input = usage.input_tokens ?? 0;
                            const output = usage.output_tokens ?? 0;
                            const reasoning =
                                usage.output_reasoning_tokens ?? 0;
                            const total = usage.total_tokens ?? input + output;

                            if (usage.model) acc.models.add(usage.model);
                            if (usage.runId) acc.runIds.add(usage.runId);
                            if (usage.parentRunId)
                                acc.parentRunIds.add(usage.parentRunId);
                            if (usage.runName) acc.runNames.add(usage.runName);

                            acc.totalTokens += total;
                            acc.inputTokens += input;
                            acc.outputTokens += output;
                            acc.reasoningTokens += reasoning;
                            acc.details.push(usage);

                            return acc;
                        },
                        {
                            totalTokens: 0,
                            inputTokens: 0,
                            outputTokens: 0,
                            reasoningTokens: 0,
                            models: new Set<string>(),
                            runIds: new Set<string>(),
                            parentRunIds: new Set<string>(),
                            runNames: new Set<string>(),
                            details: [],
                        },
                    );

                    const models = Array.from(summary.models);
                    const runIds = Array.from(summary.runIds);
                    const parentRunIds = Array.from(summary.parentRunIds);
                    const runNames = Array.from(summary.runNames);

                    const attributes: Record<
                        string,
                        string | number | boolean
                    > = {
                        'gen_ai.usage.total_tokens': summary.totalTokens,
                        'gen_ai.usage.input_tokens': summary.inputTokens,
                        'gen_ai.usage.output_tokens': summary.outputTokens,
                        ...(summary.reasoningTokens > 0
                            ? {
                                  'gen_ai.usage.reasoning_tokens':
                                      summary.reasoningTokens,
                              }
                            : {}),
                        ...(models.length
                            ? {
                                  'gen_ai.response.model': models.join(','),
                              }
                            : {}),
                        ...(runKey ? { 'gen_ai.run.id': runKey } : {}),
                        ...(runName ? { 'gen_ai.run.name': runName } : {}),
                        ...(runIds.length ? { runIds: runIds.join(',') } : {}),
                        ...(parentRunIds.length
                            ? { parentRunIds: parentRunIds.join(',') }
                            : {}),
                        ...(runNames.length
                            ? { runNames: runNames.join(',') }
                            : {}),
                        ...(metadata || {}),
                    };

                    span.setAttributes(attributes);

                    if (reset) {
                        tokenTracker.reset(runKey ?? undefined);
                    }
                } else {
                    span.setAttributes({ ...(metadata || {}) });
                }
            });
        }
    }
}

// llmTracking.ts

type FinalizeOptions = {
    metadata?: Record<string, any>;
    runName?: string;
    reset?: boolean;
};

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
        const reasoning = u.output_reasoning_tokens ?? 0;
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

export function createLLMTracking(runName?: string) {
    const tracker = new TokenTrackingHandler();

    async function finalize({
        metadata,
        runName: explicitName,
        reset,
    }: FinalizeOptions = {}) {
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
                    'gen_ai.run.name': explicitName ?? runName ?? resolvedName,
                }),
                ...(s.runIdsArr.length && { runIds: s.runIdsArr.join(',') }),
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

        return { runKey, runName: resolvedName ?? runName, usages, summary: s };
    }

    return {
        callbacks: [tracker],
        tracker,
        finalize,
    };
}
