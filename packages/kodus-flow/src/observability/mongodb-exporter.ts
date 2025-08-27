import {
    LogContext,
    MongoDBErrorItem,
    MongoDBExporterConfig,
    MongoDBLogItem,
    MongoDBMetricsItem,
    MongoDBTelemetryItem,
    ObservabilityStorageConfig,
    SystemMetrics,
    TraceItem,
} from '@/core/types/allTypes.js';
import { createLogger } from './logger.js';

export class MongoDBExporter {
    private config: MongoDBExporterConfig;
    private logger: ReturnType<typeof createLogger>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private client: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private db: any = null;
    private collections: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logs: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        telemetry: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metrics: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        errors: any;
    } | null = null;

    // Buffers para batch processing
    private logBuffer: MongoDBLogItem[] = [];
    private telemetryBuffer: MongoDBTelemetryItem[] = [];
    private metricsBuffer: MongoDBMetricsItem[] = [];
    private errorBuffer: MongoDBErrorItem[] = [];

    // Flush timers
    private logFlushTimer: NodeJS.Timeout | null = null;
    private telemetryFlushTimer: NodeJS.Timeout | null = null;
    private metricsFlushTimer: NodeJS.Timeout | null = null;
    private errorFlushTimer: NodeJS.Timeout | null = null;

    private isInitialized = false;

    constructor(config: Partial<MongoDBExporterConfig> = {}) {
        this.config = {
            connectionString: 'mongodb://localhost:27017/kodus',
            database: 'kodus',
            collections: {
                logs: 'observability_logs',
                telemetry: 'observability_telemetry',
                metrics: 'observability_metrics',
                errors: 'observability_errors',
            },
            batchSize: 100,
            flushIntervalMs: 5000,
            maxRetries: 3,
            ttlDays: 30,
            enableObservability: true,
            ...config,
        };

        this.logger = createLogger('mongodb-exporter');
    }

    /**
     * Inicializar conexão com MongoDB
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Dynamic import para evitar dependência obrigatória
            const { MongoClient: mongoClient } = await import('mongodb');

            this.client = new mongoClient(this.config.connectionString, {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 10000,
                socketTimeoutMS: 45000,
            });

            await this.client.connect();
            this.db = this.client.db(this.config.database);

            // Inicializar collections
            this.collections = {
                logs: this.db.collection(this.config.collections.logs),
                telemetry: this.db.collection(
                    this.config.collections.telemetry,
                ),
                metrics: this.db.collection(this.config.collections.metrics),
                errors: this.db.collection(this.config.collections.errors),
            };

            // Criar índices para performance
            await this.createIndexes();

            // Configurar TTL para limpeza automática
            await this.setupTTL();

            // Iniciar timers de flush
            this.startFlushTimers();

            this.isInitialized = true;

            this.logger.info('MongoDB Exporter initialized', {
                database: this.config.database,
                collections: this.config.collections,
                batchSize: this.config.batchSize,
                flushIntervalMs: this.config.flushIntervalMs,
            });
        } catch (error) {
            this.logger.error(
                'Failed to initialize MongoDB Exporter',
                error as Error,
            );
            throw error;
        }
    }

    /**
     * Criar índices para performance
     */
    private async createIndexes(): Promise<void> {
        if (!this.collections) return;

        try {
            // Logs indexes
            await this.collections.logs.createIndex({ timestamp: 1 });
            await this.collections.logs.createIndex({ correlationId: 1 });
            await this.collections.logs.createIndex({ tenantId: 1 });
            await this.collections.logs.createIndex({ level: 1 });
            await this.collections.logs.createIndex({ component: 1 });

            // Telemetry indexes
            await this.collections.telemetry.createIndex({ timestamp: 1 });
            await this.collections.telemetry.createIndex({ correlationId: 1 });
            await this.collections.telemetry.createIndex({ tenantId: 1 });
            await this.collections.telemetry.createIndex({ name: 1 });
            await this.collections.telemetry.createIndex({ agentName: 1 });
            await this.collections.telemetry.createIndex({ toolName: 1 });
            await this.collections.telemetry.createIndex({ phase: 1 });

            // Metrics indexes
            await this.collections.metrics.createIndex({ timestamp: 1 });
            await this.collections.metrics.createIndex({ correlationId: 1 });
            await this.collections.metrics.createIndex({ tenantId: 1 });

            // Errors indexes
            await this.collections.errors.createIndex({ timestamp: 1 });
            await this.collections.errors.createIndex({ correlationId: 1 });
            await this.collections.errors.createIndex({ tenantId: 1 });
            await this.collections.errors.createIndex({ errorName: 1 });

            this.logger.info('Performance indexes created successfully');
        } catch (error) {
            this.logger.warn(
                'Failed to create performance indexes, continuing without indexes',
                {
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            );
            // Não falhar a inicialização por causa dos índices
        }
    }

    /**
     * Configurar TTL para limpeza automática
     */
    private async setupTTL(): Promise<void> {
        if (!this.collections) return;

        // Só criar TTL se ttlDays estiver configurado e for maior que 0
        if (!this.config.ttlDays || this.config.ttlDays <= 0) {
            this.logger.info('TTL not configured, skipping TTL setup');
            return;
        }

        const ttlSeconds = this.config.ttlDays * 24 * 60 * 60;

        try {
            // TTL para logs
            await this.collections.logs.createIndex(
                { createdAt: 1 },
                { expireAfterSeconds: ttlSeconds },
            );

            // TTL para telemetry
            await this.collections.telemetry.createIndex(
                { createdAt: 1 },
                { expireAfterSeconds: ttlSeconds },
            );

            // TTL para metrics
            await this.collections.metrics.createIndex(
                { createdAt: 1 },
                { expireAfterSeconds: ttlSeconds },
            );

            // TTL para errors
            await this.collections.errors.createIndex(
                { createdAt: 1 },
                { expireAfterSeconds: ttlSeconds },
            );

            this.logger.info('TTL indexes created successfully', {
                ttlDays: this.config.ttlDays,
                ttlSeconds,
            });
        } catch (error) {
            this.logger.warn(
                'Failed to create TTL indexes, continuing without TTL',
                {
                    error:
                        error instanceof Error ? error.message : String(error),
                    ttlDays: this.config.ttlDays,
                },
            );
            // Não falhar a inicialização por causa do TTL
        }
    }

    /**
     * Iniciar timers de flush
     */
    private startFlushTimers(): void {
        this.logFlushTimer = setInterval(
            () => this.flushLogs(),
            this.config.flushIntervalMs,
        );

        this.telemetryFlushTimer = setInterval(
            () => this.flushTelemetry(),
            this.config.flushIntervalMs,
        );

        this.metricsFlushTimer = setInterval(
            () => this.flushMetrics(),
            this.config.flushIntervalMs,
        );

        this.errorFlushTimer = setInterval(
            () => this.flushErrors(),
            this.config.flushIntervalMs,
        );
    }

    /**
     * Exportar log
     */
    exportLog(
        level: 'debug' | 'info' | 'warn' | 'error',
        message: string,
        component: string,
        context?: LogContext,
        error?: Error,
    ): void {
        if (!this.isInitialized) return;

        const logItem: MongoDBLogItem = {
            timestamp: new Date(),
            level,
            message,
            component,
            correlationId: context?.correlationId as string | undefined,
            tenantId: context?.tenantId as string | undefined,
            executionId: context?.executionId as string | undefined,
            sessionId: context?.sessionId as string | undefined, // ✅ NEW: Extract sessionId from context
            metadata: context,
            error: error
                ? {
                      name: error.name,
                      message: error.message,
                      stack: error.stack,
                  }
                : undefined,
            createdAt: new Date(),
        };

        this.logBuffer.push(logItem);

        // Flush se buffer cheio
        if (this.logBuffer.length >= this.config.batchSize) {
            void this.flushLogs();
        }
    }

    /**
     * Exportar telemetry
     */
    exportTelemetry(item: TraceItem): void {
        if (!this.isInitialized) return;

        const duration = item.endTime - item.startTime;
        const correlationId = item.attributes['correlation.id'] as string;
        const tenantId = item.attributes['tenant.id'] as string;
        const executionId = item.attributes['execution.id'] as string; // ✅ Extract from attributes
        const sessionId = item.attributes['session.id'] as string; // ✅ Extract from attributes
        const agentName = item.attributes['agent.name'] as string;
        const toolName = item.attributes['tool.name'] as string;
        const phase = item.attributes['agent.phase'] as
            | 'think'
            | 'act'
            | 'observe';

        const telemetryItem: MongoDBTelemetryItem = {
            timestamp: new Date(item.startTime),
            name: item.name,
            duration,
            correlationId,
            tenantId,
            executionId, // ✅ Now properly extracted from trace attributes
            sessionId, // ✅ Link to session for proper hierarchy
            agentName,
            toolName,
            phase,
            attributes: item.attributes,
            status: 'ok', // Assumir OK por padrão
            error: undefined, // Não disponível no TraceItem
            createdAt: new Date(),
        };

        this.telemetryBuffer.push(telemetryItem);

        // Flush se buffer cheio
        if (this.telemetryBuffer.length >= this.config.batchSize) {
            void this.flushTelemetry();
        }
    }

    /**
     * Exportar métricas
     */
    exportMetrics(
        metrics: SystemMetrics,
        context?: {
            correlationId?: string;
            tenantId?: string;
            executionId?: string;
        },
    ): void {
        if (!this.isInitialized) return;

        const metricsItem: MongoDBMetricsItem = {
            timestamp: new Date(),
            correlationId: context?.correlationId,
            tenantId: context?.tenantId,
            executionId: context?.executionId,
            metrics,
            createdAt: new Date(),
        };

        this.metricsBuffer.push(metricsItem);

        // Flush se buffer cheio
        if (this.metricsBuffer.length >= this.config.batchSize) {
            void this.flushMetrics();
        }
    }

    /**
     * Exportar erro
     */
    exportError(
        error: Error,
        context?: {
            correlationId?: string;
            tenantId?: string;
            executionId?: string;
            [key: string]: unknown;
        },
    ): void {
        if (!this.isInitialized) return;

        const errorItem: MongoDBErrorItem = {
            timestamp: new Date(),
            correlationId: context?.correlationId,
            tenantId: context?.tenantId,
            executionId: context?.executionId,
            sessionId: context?.sessionId as string | undefined, // ✅ NEW: Extract sessionId from context
            errorName: error.name,
            errorMessage: error.message,
            errorStack: error.stack,
            context: context || {},
            createdAt: new Date(),
        };

        this.errorBuffer.push(errorItem);

        // Flush se buffer cheio
        if (this.errorBuffer.length >= this.config.batchSize) {
            void this.flushErrors();
        }
    }

    /**
     * Flush logs para MongoDB
     */
    private async flushLogs(): Promise<void> {
        if (!this.collections || this.logBuffer.length === 0) return;

        const logsToFlush = [...this.logBuffer];
        this.logBuffer = [];

        try {
            await this.collections.logs.insertMany(logsToFlush);

            if (this.config.enableObservability) {
                this.logger.debug('Logs flushed to MongoDB', {
                    count: logsToFlush.length,
                    collection: this.config.collections.logs,
                });
            }
        } catch (error) {
            this.logger.error(
                'Failed to flush logs to MongoDB',
                error as Error,
            );
            // Re-add to buffer for retry
            this.logBuffer.unshift(...logsToFlush);
        }
    }

    /**
     * Flush telemetry para MongoDB
     */
    private async flushTelemetry(): Promise<void> {
        if (!this.collections || this.telemetryBuffer.length === 0) return;

        const telemetryToFlush = [...this.telemetryBuffer];
        this.telemetryBuffer = [];

        try {
            await this.collections.telemetry.insertMany(telemetryToFlush);

            if (this.config.enableObservability) {
                this.logger.debug('Telemetry flushed to MongoDB', {
                    count: telemetryToFlush.length,
                    collection: this.config.collections.telemetry,
                });
            }
        } catch (error) {
            this.logger.error(
                'Failed to flush telemetry to MongoDB',
                error as Error,
            );
            // Re-add to buffer for retry
            this.telemetryBuffer.unshift(...telemetryToFlush);
        }
    }

    /**
     * Flush métricas para MongoDB
     */
    private async flushMetrics(): Promise<void> {
        if (!this.collections || this.metricsBuffer.length === 0) return;

        const metricsToFlush = [...this.metricsBuffer];
        this.metricsBuffer = [];

        try {
            await this.collections.metrics.insertMany(metricsToFlush);

            if (this.config.enableObservability) {
                this.logger.debug('Metrics flushed to MongoDB', {
                    count: metricsToFlush.length,
                    collection: this.config.collections.metrics,
                });
            }
        } catch (error) {
            this.logger.error(
                'Failed to flush metrics to MongoDB',
                error as Error,
            );
            // Re-add to buffer for retry
            this.metricsBuffer.unshift(...metricsToFlush);
        }
    }

    /**
     * Flush erros para MongoDB
     */
    private async flushErrors(): Promise<void> {
        if (!this.collections || this.errorBuffer.length === 0) return;

        const errorsToFlush = [...this.errorBuffer];
        this.errorBuffer = [];

        try {
            await this.collections.errors.insertMany(errorsToFlush);

            if (this.config.enableObservability) {
                this.logger.debug('Errors flushed to MongoDB', {
                    count: errorsToFlush.length,
                    collection: this.config.collections.errors,
                });
            }
        } catch (error) {
            this.logger.error(
                'Failed to flush errors to MongoDB',
                error as Error,
            );
            // Re-add to buffer for retry
            this.errorBuffer.unshift(...errorsToFlush);
        }
    }

    /**
     * Flush todos os buffers
     */
    async flush(): Promise<void> {
        await Promise.allSettled([
            this.flushLogs(),
            this.flushTelemetry(),
            this.flushMetrics(),
            this.flushErrors(),
        ]);
    }

    /**
     * Dispose do exporter
     */
    async dispose(): Promise<void> {
        // Parar timers
        if (this.logFlushTimer) clearInterval(this.logFlushTimer);
        if (this.telemetryFlushTimer) clearInterval(this.telemetryFlushTimer);
        if (this.metricsFlushTimer) clearInterval(this.metricsFlushTimer);
        if (this.errorFlushTimer) clearInterval(this.errorFlushTimer);

        // Flush final
        await this.flush();

        // Fechar conexão
        if (this.client) {
            await this.client.close();
        }

        this.isInitialized = false;
        this.logger.info('MongoDB Exporter disposed');
    }
}

/**
 * Converter configuração de storage para MongoDB Exporter
 */
export function createMongoDBExporterFromStorage(
    storageConfig: ObservabilityStorageConfig,
): MongoDBExporter {
    const config: Partial<MongoDBExporterConfig> = {
        connectionString: storageConfig.connectionString,
        database: storageConfig.database,
        collections: {
            logs: storageConfig.collections?.logs || 'observability_logs',
            telemetry:
                storageConfig.collections?.telemetry ||
                'observability_telemetry',
            metrics:
                storageConfig.collections?.metrics || 'observability_metrics',
            errors: storageConfig.collections?.errors || 'observability_errors',
        },
        batchSize: storageConfig.batchSize || 100,
        flushIntervalMs: storageConfig.flushIntervalMs || 5000,
        maxRetries: 3,
        ttlDays: storageConfig.ttlDays || 30,
        enableObservability: storageConfig.enableObservability ?? true,
    };

    return new MongoDBExporter(config);
}

/**
 * Factory para criar MongoDB Exporter
 */
export function createMongoDBExporter(
    config?: Partial<MongoDBExporterConfig>,
): MongoDBExporter {
    return new MongoDBExporter(config);
}
