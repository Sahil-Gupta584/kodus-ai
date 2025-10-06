import { Injectable } from '@nestjs/common';
import { ConnectionString } from 'connection-string';
import { getObservability, IdGenerator } from '@kodus/flow';
import type { TokenTrackingHandler } from '@kodus/kodus-common/llm';
import { DatabaseConnection } from '@/config/types';

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
        ttlDays: 30,
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
                    options.customSettings?.batchSize ||
                    ObservabilityService.DEFAULT_SETTINGS.batchSize,
                flushIntervalMs:
                    options.customSettings?.flushIntervalMs ||
                    ObservabilityService.DEFAULT_SETTINGS.flushIntervalMs,
                ttlDays:
                    options.customSettings?.ttlDays ||
                    ObservabilityService.DEFAULT_SETTINGS.ttlDays,
                enableObservability: true,
            },
            telemetry: {
                enabled: true,
                serviceName: options.serviceName,
                sampling: {
                    rate:
                        options.customSettings?.samplingRate ||
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

    initializeObservability(
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
            obs.initialize();
            this.instances.set(key, obs);
        }

        if (correlationId) {
            const ctx = obs.createContext(correlationId);
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

    ensureContext(
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
        reset: boolean = true,
    ) {
        const obs = getObservability();
        const span = obs.getCurrentSpan();
        if (span) {
            obs.withSpan(span, () => {
                if (tokenTracker) {
                    const tokenUsages = tokenTracker.getTokenUsages() as any;
                    if (reset) {
                        tokenTracker.reset();
                    }

                    span.setAttributes({
                        tokenUsages,
                        ...(metadata || {}),
                    });
                } else {
                    span.setAttributes({ ...(metadata || {}) });
                }
            });
        }
    }
}
