import fs from 'fs';
import { getTelemetry } from './telemetry.js';
import { IdGenerator } from '../utils/index.js';
import { createLogger } from './logger.js';
import {
    DebugConfig,
    DebugContext,
    DebugEntry,
    DebugOutput,
    DebugReport,
    EventTrace,
    LogLevel,
    PerformanceInsights,
    PerformanceMeasurement,
    StateSnapshot,
} from '@/core/types/allTypes.js';

export class ConsoleDebugOutput implements DebugOutput {
    name = 'console';

    write(entry: DebugEntry): void {
        const timestamp = new Date(entry.timestamp).toISOString();
        const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.category.toUpperCase()}]`;

        const message = entry.correlationId
            ? `${prefix} [${entry.correlationId}] ${entry.message}`
            : `${prefix} ${entry.message}`;

        const logFn =
            entry.level === 'error'
                ? console.error
                : entry.level === 'warn'
                  ? console.warn
                  : entry.level === 'debug'
                    ? console.debug
                    : console.log;

        if (entry.data && Object.keys(entry.data).length > 0) {
            logFn(message, entry.data);
        } else {
            logFn(message);
        }
    }
}

/**
 * Memory debug output para testing
 */
export class MemoryDebugOutput implements DebugOutput {
    name = 'memory';
    private entries: DebugEntry[] = [];
    private maxEntries: number;

    constructor(maxEntries: number = 10000) {
        this.maxEntries = maxEntries;
    }

    write(entry: DebugEntry): void {
        this.entries.push(entry);

        if (this.entries.length > this.maxEntries) {
            this.entries.shift();
        }
    }

    flush(): void {
        // No-op for memory output
    }

    getEntries(): ReadonlyArray<DebugEntry> {
        return this.entries;
    }

    getEntriesByCategory(category: string): ReadonlyArray<DebugEntry> {
        return this.entries.filter((entry) => entry.category === category);
    }

    getEntriesByLevel(level: LogLevel): ReadonlyArray<DebugEntry> {
        return this.entries.filter((entry) => entry.level === level);
    }

    getEntriesInTimeRange(
        startTime: number,
        endTime: number,
    ): ReadonlyArray<DebugEntry> {
        return this.entries.filter(
            (entry) =>
                entry.timestamp >= startTime && entry.timestamp <= endTime,
        );
    }

    clear(): void {
        this.entries = [];
    }
}

/**
 * File debug output
 */
export class FileDebugOutput implements DebugOutput {
    name = 'file';
    private filePath: string;
    private writeStream?: {
        write: (data: string) => void;
        end: (callback?: () => void) => void;
    };
    private logger = createLogger('debug-file-output');

    constructor(filePath: string) {
        this.filePath = filePath;
        void this.initializeStream();
    }

    private async initializeStream(): Promise<void> {
        try {
            // Ensure directory exists
            const dir = this.filePath.substring(
                0,
                this.filePath.lastIndexOf('/'),
            );
            if (dir) {
                await fs.promises.mkdir(dir, { recursive: true });
            }

            this.writeStream = fs.createWriteStream(this.filePath, {
                flags: 'a',
                encoding: 'utf8',
            });
        } catch (error) {
            this.logger.error(
                'Failed to initialize file debug output',
                error as Error,
            );
        }
    }

    write(entry: DebugEntry): void {
        if (!this.writeStream) return;

        const timestamp = new Date(entry.timestamp).toISOString();
        const logEntry = {
            timestamp,
            level: entry.level,
            category: entry.category,
            message: entry.message,
            data: entry.data,
            correlationId: entry.correlationId,
        };

        this.writeStream.write(JSON.stringify(logEntry) + '\n');
    }

    async flush(): Promise<void> {
        if (this.writeStream) {
            return new Promise((resolve) => {
                this.writeStream!.end(resolve);
            });
        }
    }
}

/**
 * Sistema de debugging simplificado
 */
export class DebugSystem {
    private config: DebugConfig;
    private outputs: DebugOutput[] = [];
    private eventTraces: EventTrace[] = [];
    private measurements: Map<string, PerformanceMeasurement> = new Map();
    private completedMeasurements: PerformanceMeasurement[] = [];
    private stateSnapshots: StateSnapshot[] = [];
    private flushTimer?: NodeJS.Timeout;
    private currentCorrelationId?: string;

    constructor(config: Partial<DebugConfig> = {}) {
        this.config = {
            enabled: true,
            level: 'debug',
            features: {
                eventTracing: true,
                performanceProfiling: true,
                stateInspection: true,
                errorAnalysis: true,
            },
            outputs: [new ConsoleDebugOutput()],
            maxEventHistory: 1000,
            maxMeasurementHistory: 500,
            autoFlush: true,
            flushInterval: 60000,
            ...config,
        };

        this.outputs = this.config.outputs;

        if (this.config.autoFlush) {
            this.startAutoFlush();
        }
    }

    isEnabled(): boolean {
        return this.config.enabled;
    }

    isFeatureEnabled(feature: keyof DebugConfig['features']): boolean {
        return this.config.enabled && this.config.features[feature];
    }

    setCorrelationId(correlationId: string): void {
        this.currentCorrelationId = correlationId;
    }

    clearCorrelationId(): void {
        this.currentCorrelationId = undefined;
    }

    getCorrelationId(): string | undefined {
        return this.currentCorrelationId;
    }

    /**
     * Log básico
     */
    log(
        level: LogLevel,
        category: string,
        message: string,
        data?: Record<string, unknown>,
    ): void {
        if (!this.isEnabled()) return;

        const entry: DebugEntry = {
            timestamp: Date.now(),
            level,
            category: category as DebugEntry['category'],
            message,
            data,
            correlationId: this.currentCorrelationId,
        };

        void this.writeToOutputs(entry);
    }

    /**
     * Trace de evento
     */
    traceEvent(event: Event, source?: string): string {
        if (!this.isFeatureEnabled('eventTracing')) {
            return '';
        }

        const traceId = IdGenerator.correlationId();
        const trace: EventTrace = {
            id: traceId,
            event,
            timestamp: Date.now(),
            correlationId: this.currentCorrelationId || traceId,
        };

        this.eventTraces.push(trace);

        // Limitar histórico
        if (this.eventTraces.length > this.config.maxEventHistory) {
            this.eventTraces.shift();
        }

        this.log('debug', 'event', `Event traced: ${event.type}`, {
            traceId,
            eventType: event.type,
            source,
        });

        return traceId;
    }

    /**
     * Iniciar medição de performance
     */
    startMeasurement(
        name: string,
        category: string = 'general',
        metadata?: Record<string, unknown>,
    ): string {
        if (!this.isFeatureEnabled('performanceProfiling')) {
            return '';
        }

        const measurementId = IdGenerator.correlationId();
        const measurement: PerformanceMeasurement = {
            id: measurementId,
            name,
            startTime: Date.now(),
            category,
        };

        this.measurements.set(measurementId, measurement);

        this.log('debug', 'performance', `Measurement started: ${name}`, {
            measurementId,
            name,
            category,
            metadata,
        });

        return measurementId;
    }

    /**
     * Finalizar medição de performance
     */
    endMeasurement(measurementId: string): PerformanceMeasurement | undefined {
        if (!this.isFeatureEnabled('performanceProfiling')) {
            return undefined;
        }

        const measurement = this.measurements.get(measurementId);
        if (!measurement) {
            return undefined;
        }

        measurement.endTime = Date.now();
        measurement.duration = measurement.endTime - measurement.startTime;

        this.completedMeasurements.push(measurement);
        this.measurements.delete(measurementId);

        // Limitar histórico
        if (
            this.completedMeasurements.length >
            this.config.maxMeasurementHistory
        ) {
            this.completedMeasurements.shift();
        }

        // Registrar métrica de telemetry
        this.recordTelemetryMetric(measurement);

        this.log(
            'debug',
            'performance',
            `Measurement completed: ${measurement.name}`,
            {
                measurementId,
                name: measurement.name,
                duration: measurement.duration,
                category: measurement.category,
            },
        );

        return measurement;
    }

    /**
     * Medir operação com função
     */
    async measure<T>(
        name: string,
        fn: () => T | Promise<T>,
        category: string = 'general',
        metadata?: Record<string, unknown>,
    ): Promise<{ result: T; measurement: PerformanceMeasurement }> {
        const measurementId = this.startMeasurement(name, category, metadata);

        try {
            const result = await fn();
            const measurement = this.endMeasurement(measurementId);

            return {
                result,
                measurement: measurement!,
            };
        } catch (error) {
            this.endMeasurement(measurementId);
            throw error;
        }
    }

    /**
     * Capturar snapshot de estado
     */
    captureStateSnapshot(
        entityName: string,
        entityType: 'agent' | 'workflow' | 'system',
        state: Record<string, unknown>,
    ): string {
        if (!this.isFeatureEnabled('stateInspection')) {
            return '';
        }

        const snapshotId = IdGenerator.correlationId();
        const snapshot: StateSnapshot = {
            id: snapshotId,
            entityName,
            entityType,
            timestamp: Date.now(),
            state,
            correlationId: this.currentCorrelationId,
        };

        this.stateSnapshots.push(snapshot);

        this.log('debug', 'state', `State snapshot captured: ${entityName}`, {
            snapshotId,
            entityName,
            entityType,
            stateKeys: Object.keys(state),
        });

        return snapshotId;
    }

    /**
     * Obter traces de eventos
     */
    getEventTraces(): ReadonlyArray<EventTrace> {
        return this.eventTraces;
    }

    /**
     * Obter traces por tipo de evento
     */
    getEventTracesByType(eventType: string): ReadonlyArray<EventTrace> {
        return this.eventTraces.filter(
            (trace) => trace.event.type === eventType,
        );
    }

    /**
     * Obter medições completadas
     */
    getCompletedMeasurements(): ReadonlyArray<PerformanceMeasurement> {
        return this.completedMeasurements;
    }

    /**
     * Obter medições por categoria
     */
    getMeasurementsByCategory(
        category: string,
    ): ReadonlyArray<PerformanceMeasurement> {
        return this.completedMeasurements.filter(
            (measurement) => measurement.category === category,
        );
    }

    /**
     * Obter snapshots de estado
     */
    getStateSnapshots(): ReadonlyArray<StateSnapshot> {
        return this.stateSnapshots;
    }

    /**
     * Gerar relatório de debugging
     */
    generateReport(): DebugReport {
        const now = Date.now();

        return {
            timestamp: now,
            config: this.config,
            summary: {
                tracedEvents: this.eventTraces.length,
                completedMeasurements: this.completedMeasurements.length,
                stateSnapshots: this.stateSnapshots.length,
                activeMeasurements: this.measurements.size,
                avgEventProcessingTime:
                    this.calculateAverageEventProcessingTime(),
                avgMeasurementTime: this.calculateAverageMeasurementTime(),
            },
            eventTypeDistribution: this.calculateEventTypeDistribution(),
            recentErrors: this.getRecentErrors(),
            performanceInsights: this.generatePerformanceInsights(),
        };
    }

    /**
     * Atualizar configuração
     */
    updateConfig(config: Partial<DebugConfig>): void {
        this.config = { ...this.config, ...config };
        this.outputs = this.config.outputs;

        if (this.config.autoFlush) {
            this.startAutoFlush();
        } else {
            this.stopAutoFlush();
        }
    }

    /**
     * Flush de outputs
     */
    async flush(): Promise<void> {
        for (const output of this.outputs) {
            if (output.flush) {
                await output.flush();
            }
        }
    }

    /**
     * Dispose do sistema
     */
    async dispose(): Promise<void> {
        this.stopAutoFlush();
        await this.flush();
        this.eventTraces = [];
        this.measurements.clear();
        this.completedMeasurements = [];
        this.stateSnapshots = [];
    }

    /**
     * Escrever para outputs
     */
    private async writeToOutputs(entry: DebugEntry): Promise<void> {
        for (const output of this.outputs) {
            try {
                await output.write(entry);
            } catch (error) {
                const logger = createLogger('debug-system');
                logger.error(
                    `Failed to write to debug output ${output.name}`,
                    error as Error,
                );
            }
        }
    }

    /**
     * Iniciar auto-flush
     */
    private startAutoFlush(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        this.flushTimer = setInterval(() => {
            this.flush().catch((error) => {
                const logger = createLogger('debug-system');
                logger.error('Auto-flush failed', error as Error);
            });
        }, this.config.flushInterval);
    }

    /**
     * Parar auto-flush
     */
    private stopAutoFlush(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = undefined;
        }
    }

    /**
     * Registrar métrica de telemetry
     */
    private recordTelemetryMetric(measurement: PerformanceMeasurement): void {
        try {
            const telemetry = getTelemetry();
            if (telemetry && measurement.duration) {
                telemetry.recordMetric(
                    'histogram',
                    `debug.measurement.${measurement.category}.duration`,
                    measurement.duration,
                    {
                        name: measurement.name,
                        category: measurement.category,
                    },
                );
            }
        } catch {
            // Silently fail - telemetry is optional
        }
    }

    /**
     * Calcular tempo médio de processamento de eventos
     */
    private calculateAverageEventProcessingTime(): number {
        const tracesWithDuration = this.eventTraces.filter(
            (trace) => trace.processingDuration,
        );

        if (tracesWithDuration.length === 0) return 0;

        const totalDuration = tracesWithDuration.reduce(
            (sum, trace) => sum + (trace.processingDuration || 0),
            0,
        );

        return totalDuration / tracesWithDuration.length;
    }

    /**
     * Calcular tempo médio de medições
     */
    private calculateAverageMeasurementTime(): number {
        if (this.completedMeasurements.length === 0) return 0;

        const totalDuration = this.completedMeasurements.reduce(
            (sum, measurement) => sum + (measurement.duration || 0),
            0,
        );

        return totalDuration / this.completedMeasurements.length;
    }

    /**
     * Calcular distribuição de tipos de eventos
     */
    private calculateEventTypeDistribution(): Record<string, number> {
        const distribution: Record<string, number> = {};

        for (const trace of this.eventTraces) {
            const eventType = trace.event.type;
            distribution[eventType] = (distribution[eventType] || 0) + 1;
        }

        return distribution;
    }

    /**
     * Obter erros recentes
     */
    private getRecentErrors(): Array<{
        eventType: string;
        error: string;
        timestamp: number;
        traceId: string;
    }> {
        return this.eventTraces
            .filter((trace) => trace.error)
            .map((trace) => ({
                eventType: trace.event.type,
                error: trace.error!.message,
                timestamp: trace.timestamp,
                traceId: trace.id,
            }))
            .slice(-10); // Últimos 10 erros
    }

    /**
     * Gerar insights de performance
     */
    private generatePerformanceInsights(): PerformanceInsights {
        const measurements = this.completedMeasurements;

        // Operações lentas
        const slowOperations = measurements
            .filter((m) => (m.duration || 0) > 1000) // > 1s
            .sort((a, b) => (b.duration || 0) - (a.duration || 0))
            .slice(0, 5)
            .map((m) => ({
                name: m.name,
                duration: m.duration || 0,
                category: m.category,
            }));

        // Operações rápidas
        const fastOperations = measurements
            .filter((m) => (m.duration || 0) < 100) // < 100ms
            .sort((a, b) => (a.duration || 0) - (b.duration || 0))
            .slice(0, 5)
            .map((m) => ({
                name: m.name,
                duration: m.duration || 0,
                category: m.category,
            }));

        // Recomendações
        const recommendations: string[] = [];
        if (slowOperations.length > 0) {
            recommendations.push(
                `Found ${slowOperations.length} slow operations. Consider optimizing.`,
            );
        }

        const avgTime = this.calculateAverageMeasurementTime();
        if (avgTime > 500) {
            recommendations.push(
                'Average operation time is high. Consider performance optimization.',
            );
        }

        return {
            slowOperations,
            fastOperations,
            recommendations,
        };
    }
}

/**
 * Sistema global de debugging
 */
let globalDebugSystem: DebugSystem | null = null;

/**
 * Obter sistema global de debugging
 */
export function getGlobalDebugSystem(
    config?: Partial<DebugConfig>,
): DebugSystem {
    if (!globalDebugSystem) {
        globalDebugSystem = new DebugSystem(config);
    }
    return globalDebugSystem;
}

/**
 * Middleware de debugging
 */
export function withDebug(debugSystem?: DebugSystem) {
    const debug = debugSystem || getGlobalDebugSystem();

    return function debugMiddleware<E extends Event, R = Event | void>(
        handler: (ev: E) => Promise<R> | R,
        handlerName?: string,
    ) {
        return async function debuggedHandler(ev: E): Promise<R | void> {
            if (!debug.isFeatureEnabled('eventTracing')) {
                return await handler(ev);
            }

            const traceId = debug.traceEvent(ev, handlerName);
            const startTime = Date.now();

            try {
                const result = await handler(ev);
                const duration = Date.now() - startTime;

                debug.log('debug', 'event', 'Event processed successfully', {
                    traceId,
                    handlerName,
                    duration,
                    success: true,
                });

                return result;
            } catch (error) {
                const duration = Date.now() - startTime;

                debug.log('error', 'error', 'Event processing failed', {
                    traceId,
                    handlerName,
                    duration,
                    error: (error as Error).message,
                    success: false,
                });

                throw error;
            }
        };
    };
}

/**
 * Criar contexto de debugging
 */
export function createDebugContext(debugSystem?: DebugSystem): DebugContext {
    const debug = debugSystem || getGlobalDebugSystem();

    return {
        setCorrelationId: (id: string) => debug.setCorrelationId(id),
        clearCorrelationId: () => debug.clearCorrelationId(),

        log: (
            level: LogLevel,
            message: string,
            data?: Record<string, unknown>,
        ) => debug.log(level, 'general', message, data),
        trace: (event: Event, source?: string) =>
            debug.traceEvent(event, source),

        measure: <T>(
            name: string,
            fn: () => T | Promise<T>,
            metadata?: Record<string, unknown>,
        ) => debug.measure(name, fn, 'workflow', metadata),
        startMeasurement: (name: string, metadata?: Record<string, unknown>) =>
            debug.startMeasurement(name, 'workflow', metadata),
        endMeasurement: (id: string) => debug.endMeasurement(id),

        captureSnapshot: (
            entityName: string,
            entityType: 'agent' | 'workflow' | 'system',
            state: Record<string, unknown>,
        ) => debug.captureStateSnapshot(entityName, entityType, state),

        generateReport: () => debug.generateReport(),
    };
}
