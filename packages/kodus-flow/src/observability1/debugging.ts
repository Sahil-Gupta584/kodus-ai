/**
 * @module observability1/debugging
 * @description Production-ready debugging with Ring Buffer and proper error handling
 *
 * IMPROVEMENTS:
 * - ✅ Ring Buffer prevents memory leaks
 * - ✅ Circuit breaker for output resilience
 * - ✅ Dependency injection for testability
 * - ✅ Type-safe debug outputs
 * - ✅ Performance measurements with context
 */

import { RingBuffer, CircuitBreaker } from './telemetry.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Debug entry interface
 */
export interface DebugEntry {
    id: string;
    timestamp: number;
    level: LogLevel;
    category: 'event' | 'performance' | 'state' | 'error' | 'custom';
    source: string;
    message: string;
    data?: Record<string, unknown>;
    correlationId?: string;
    tags?: string[];
}

/**
 * Performance measurement
 */
export interface PerformanceMeasurement {
    id: string;
    name: string;
    category: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    correlationId?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
}

/**
 * State snapshot
 */
export interface StateSnapshot {
    id: string;
    entityName: string;
    entityType: string;
    timestamp: number;
    state: Record<string, unknown>;
    correlationId?: string;
    tags?: string[];
}

/**
 * Event trace
 */
export interface EventTrace {
    id: string;
    eventType: string;
    timestamp: number;
    duration?: number;
    status: 'pending' | 'completed' | 'failed';
    input?: unknown;
    output?: unknown;
    error?: {
        name: string;
        message: string;
        stack?: string;
    };
    correlationId?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
}

/**
 * Debug output interface for dependency injection
 */
export interface DebugOutput {
    name: string;
    write(entry: DebugEntry): void | Promise<void>;
    flush?(): void | Promise<void>;
}

/**
 * Console debug output
 */
export class ConsoleDebugOutput implements DebugOutput {
    name = 'console';

    write(entry: DebugEntry): void {
        const timestamp = new Date(entry.timestamp).toISOString();
        const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.category.toUpperCase()}] [${entry.source}]`;

        let message = `${prefix} ${entry.message}`;
        if (entry.correlationId) {
            message += ` [${entry.correlationId}]`;
        }

        const logFn = this.getLogFunction(entry.level);

        if (entry.data && Object.keys(entry.data).length > 0) {
            logFn(message, entry.data);
        } else {
            logFn(message);
        }
    }

    private getLogFunction(level: LogLevel): (...args: unknown[]) => void {
        switch (level) {
            case 'error':
                return console.error;
            case 'warn':
                return console.warn;
            case 'debug':
                return console.debug;
            default:
                return console.log;
        }
    }
}

/**
 * Memory debug output for testing
 */
export class MemoryDebugOutput implements DebugOutput {
    name = 'memory';
    private entries: RingBuffer<DebugEntry>;

    constructor(maxEntries: number = 10000) {
        this.entries = new RingBuffer(maxEntries);
    }

    write(entry: DebugEntry): void {
        this.entries.push(entry);
    }

    flush(): void {
        // No-op for memory output
    }

    getEntries(): DebugEntry[] {
        return this.entries.toArray();
    }

    getEntriesByCategory(category: string): DebugEntry[] {
        return this.entries
            .toArray()
            .filter((entry) => entry.category === category);
    }

    getEntriesByLevel(level: LogLevel): DebugEntry[] {
        return this.entries.toArray().filter((entry) => entry.level === level);
    }

    getEntriesBySource(source: string): DebugEntry[] {
        return this.entries
            .toArray()
            .filter((entry) => entry.source === source);
    }

    getEntriesInTimeRange(startTime: number, endTime: number): DebugEntry[] {
        return this.entries
            .toArray()
            .filter(
                (entry) =>
                    entry.timestamp >= startTime && entry.timestamp <= endTime,
            );
    }

    clear(): void {
        this.entries.clear();
    }
}

/**
 * File debug output with circuit breaker
 */
export class FileDebugOutput implements DebugOutput {
    name = 'file';
    private writeStream?: {
        write: (data: string) => void;
        end: (callback?: () => void) => void;
    };
    private circuitBreaker = new CircuitBreaker();

    constructor(private filePath: string) {
        void this.initializeStream();
    }

    private async initializeStream(): Promise<void> {
        try {
            const fs = await import('fs');
            const path = await import('path');

            // Ensure directory exists
            const dir = path.dirname(this.filePath);
            await fs.promises.mkdir(dir, { recursive: true });

            this.writeStream = fs.createWriteStream(this.filePath, {
                flags: 'a',
                encoding: 'utf8',
            });
        } catch (error) {
            console.error('Failed to initialize file debug output:', error);
        }
    }

    async write(entry: DebugEntry): Promise<void> {
        if (!this.writeStream) return;

        await this.circuitBreaker.execute(async () => {
            const logEntry = JSON.stringify(entry) + '\n';
            this.writeStream!.write(logEntry);
        });
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
 * Debug configuration
 */
export interface DebugConfig {
    enabled: boolean;
    level: LogLevel;
    features: {
        eventTracing: boolean;
        performanceProfiling: boolean;
        stateInspection: boolean;
        errorAnalysis: boolean;
    };
    outputs: DebugOutput[];
    historyLimits: {
        maxEntries: number;
        maxMeasurements: number;
        maxSnapshots: number;
        maxTraces: number;
    };
    autoFlush: {
        enabled: boolean;
        intervalMs: number;
    };
}

/**
 * Debug report interface
 */
export interface DebugReport {
    timestamp: number;
    summary: {
        totalEntries: number;
        totalMeasurements: number;
        totalSnapshots: number;
        totalTraces: number;
        errorCount: number;
        performanceInsights: {
            slowestOperations: Array<{
                name: string;
                duration: number;
                category: string;
            }>;
            averageDurations: Record<string, number>;
            recommendations: string[];
        };
    };
    recentErrors: Array<{
        timestamp: number;
        source: string;
        message: string;
        correlationId?: string;
    }>;
    categoryDistribution: Record<string, number>;
    levelDistribution: Record<LogLevel, number>;
}

/**
 * Production-ready debugging system
 */
export class DebugSystem {
    private entries: RingBuffer<DebugEntry>;
    private measurements = new Map<string, PerformanceMeasurement>();
    private completedMeasurements: RingBuffer<PerformanceMeasurement>;
    private stateSnapshots: RingBuffer<StateSnapshot>;
    private eventTraces: RingBuffer<EventTrace>;

    private outputs: Array<{
        output: DebugOutput;
        circuitBreaker: CircuitBreaker;
    }> = [];

    private flushTimer?: NodeJS.Timeout;

    constructor(private readonly config: DebugConfig) {
        this.entries = new RingBuffer(config.historyLimits.maxEntries);
        this.completedMeasurements = new RingBuffer(
            config.historyLimits.maxMeasurements,
        );
        this.stateSnapshots = new RingBuffer(config.historyLimits.maxSnapshots);
        this.eventTraces = new RingBuffer(config.historyLimits.maxTraces);

        // Setup outputs with circuit breakers
        for (const output of config.outputs) {
            this.outputs.push({
                output,
                circuitBreaker: new CircuitBreaker(),
            });
        }

        // Start auto-flush if enabled
        if (config.autoFlush.enabled) {
            this.startAutoFlush();
        }
    }

    isEnabled(): boolean {
        return this.config.enabled;
    }

    isFeatureEnabled(feature: keyof DebugConfig['features']): boolean {
        return this.config.enabled && this.config.features[feature];
    }

    private shouldLog(level: LogLevel): boolean {
        const levels: Record<LogLevel, number> = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3,
        };
        return levels[level] >= levels[this.config.level];
    }

    /**
     * Log debug entry
     */
    log(
        level: LogLevel,
        category: DebugEntry['category'],
        source: string,
        message: string,
        data?: Record<string, unknown>,
        correlationId?: string,
        tags?: string[],
    ): string {
        if (!this.isEnabled() || !this.shouldLog(level)) {
            return '';
        }

        const id = this.generateId();
        const entry: DebugEntry = {
            id,
            timestamp: Date.now(),
            level,
            category,
            source,
            message,
            data,
            correlationId,
            tags,
        };

        this.entries.push(entry);
        void this.writeToOutputs(entry);

        return id;
    }

    /**
     * Start performance measurement
     */
    startMeasurement(
        name: string,
        category: string = 'general',
        metadata?: Record<string, unknown>,
        correlationId?: string,
        tags?: string[],
    ): string {
        if (!this.isFeatureEnabled('performanceProfiling')) {
            return '';
        }

        const id = this.generateId();
        const measurement: PerformanceMeasurement = {
            id,
            name,
            category,
            startTime: performance.now(),
            correlationId,
            metadata,
            tags,
        };

        this.measurements.set(id, measurement);

        this.log(
            'debug',
            'performance',
            'measurement',
            `Started: ${name}`,
            {
                measurementId: id,
                category,
                metadata,
            },
            correlationId,
            tags,
        );

        return id;
    }

    /**
     * End performance measurement
     */
    endMeasurement(measurementId: string): PerformanceMeasurement | undefined {
        if (!this.isFeatureEnabled('performanceProfiling')) {
            return undefined;
        }

        const measurement = this.measurements.get(measurementId);
        if (!measurement) {
            this.log(
                'warn',
                'performance',
                'measurement',
                `Measurement not found: ${measurementId}`,
            );
            return undefined;
        }

        measurement.endTime = performance.now();
        measurement.duration = measurement.endTime - measurement.startTime;

        this.completedMeasurements.push(measurement);
        this.measurements.delete(measurementId);

        this.log(
            'debug',
            'performance',
            'measurement',
            `Completed: ${measurement.name}`,
            {
                measurementId,
                duration: measurement.duration,
                category: measurement.category,
            },
            measurement.correlationId,
            measurement.tags,
        );

        return measurement;
    }

    /**
     * Measure operation with function
     */
    async measure<T>(
        name: string,
        fn: () => T | Promise<T>,
        options: {
            category?: string;
            metadata?: Record<string, unknown>;
            correlationId?: string;
            tags?: string[];
        } = {},
    ): Promise<{ result: T; measurement: PerformanceMeasurement }> {
        const measurementId = this.startMeasurement(
            name,
            options.category || 'general',
            options.metadata,
            options.correlationId,
            options.tags,
        );

        try {
            const result = await fn();
            const measurement = this.endMeasurement(measurementId);
            return { result, measurement: measurement! };
        } catch (error) {
            this.endMeasurement(measurementId);
            this.log(
                'error',
                'error',
                'measurement',
                `Measurement failed: ${name}`,
                {
                    measurementId,
                    error:
                        error instanceof Error ? error.message : String(error),
                },
                options.correlationId,
                options.tags,
            );
            throw error;
        }
    }

    /**
     * Capture state snapshot
     */
    captureStateSnapshot(
        entityName: string,
        entityType: string,
        state: Record<string, unknown>,
        correlationId?: string,
        tags?: string[],
    ): string {
        if (!this.isFeatureEnabled('stateInspection')) {
            return '';
        }

        const id = this.generateId();
        const snapshot: StateSnapshot = {
            id,
            entityName,
            entityType,
            timestamp: Date.now(),
            state,
            correlationId,
            tags,
        };

        this.stateSnapshots.push(snapshot);

        this.log(
            'debug',
            'state',
            'snapshot',
            `Captured: ${entityName}`,
            {
                snapshotId: id,
                entityType,
                stateKeys: Object.keys(state),
            },
            correlationId,
            tags,
        );

        return id;
    }

    /**
     * Start event trace
     */
    startEventTrace(
        eventType: string,
        input?: unknown,
        correlationId?: string,
        metadata?: Record<string, unknown>,
        tags?: string[],
    ): string {
        if (!this.isFeatureEnabled('eventTracing')) {
            return '';
        }

        const id = this.generateId();
        const trace: EventTrace = {
            id,
            eventType,
            timestamp: Date.now(),
            status: 'pending',
            input,
            correlationId,
            metadata,
            tags,
        };

        this.eventTraces.push(trace);

        this.log(
            'debug',
            'event',
            'trace',
            `Started: ${eventType}`,
            {
                traceId: id,
                hasInput: input !== undefined,
                metadata,
            },
            correlationId,
            tags,
        );

        return id;
    }

    /**
     * Complete event trace
     */
    completeEventTrace(traceId: string, output?: unknown, error?: Error): void {
        if (!this.isFeatureEnabled('eventTracing')) {
            return;
        }

        const traces = this.eventTraces.toArray();
        const trace = traces.find((t) => t.id === traceId);

        if (!trace) {
            this.log('warn', 'event', 'trace', `Trace not found: ${traceId}`);
            return;
        }

        trace.duration = Date.now() - trace.timestamp;
        trace.status = error ? 'failed' : 'completed';
        trace.output = output;

        if (error) {
            trace.error = {
                name: error.name,
                message: error.message,
                stack: error.stack,
            };
        }

        this.log(
            error ? 'error' : 'debug',
            'event',
            'trace',
            `${error ? 'Failed' : 'Completed'}: ${trace.eventType}`,
            {
                traceId,
                duration: trace.duration,
                hasOutput: output !== undefined,
                error: error ? error.message : undefined,
            },
            trace.correlationId,
            trace.tags,
        );
    }

    /**
     * Get debug entries
     */
    getEntries(): DebugEntry[] {
        return this.entries.toArray();
    }

    /**
     * Get performance measurements
     */
    getCompletedMeasurements(): PerformanceMeasurement[] {
        return this.completedMeasurements.toArray();
    }

    /**
     * Get state snapshots
     */
    getStateSnapshots(): StateSnapshot[] {
        return this.stateSnapshots.toArray();
    }

    /**
     * Get event traces
     */
    getEventTraces(): EventTrace[] {
        return this.eventTraces.toArray();
    }

    /**
     * Generate debug report
     */
    generateReport(): DebugReport {
        const entries = this.getEntries();
        const measurements = this.getCompletedMeasurements();
        const snapshots = this.getStateSnapshots();
        const traces = this.getEventTraces();

        // Calculate insights
        const performanceInsights =
            this.calculatePerformanceInsights(measurements);
        const recentErrors = this.getRecentErrors(entries);
        const categoryDistribution =
            this.calculateCategoryDistribution(entries);
        const levelDistribution = this.calculateLevelDistribution(entries);

        return {
            timestamp: Date.now(),
            summary: {
                totalEntries: entries.length,
                totalMeasurements: measurements.length,
                totalSnapshots: snapshots.length,
                totalTraces: traces.length,
                errorCount: entries.filter((e) => e.level === 'error').length,
                performanceInsights,
            },
            recentErrors,
            categoryDistribution,
            levelDistribution,
        };
    }

    /**
     * Flush all outputs
     */
    async flush(): Promise<void> {
        const flushPromises = this.outputs.map(
            async ({ output, circuitBreaker }) => {
                if (output.flush) {
                    await circuitBreaker.execute(async () => output.flush!());
                }
            },
        );

        await Promise.allSettled(flushPromises);
    }

    /**
     * Dispose debug system
     */
    async dispose(): Promise<void> {
        this.stopAutoFlush();
        await this.flush();

        this.entries.clear();
        this.measurements.clear();
        this.completedMeasurements.clear();
        this.stateSnapshots.clear();
        this.eventTraces.clear();
        this.outputs = [];
    }

    private async writeToOutputs(entry: DebugEntry): Promise<void> {
        const writes = this.outputs.map(async ({ output, circuitBreaker }) => {
            try {
                await circuitBreaker.execute(async () => output.write(entry));
            } catch (error) {
                // Log locally but don't throw - debugging shouldn't break the app
                console.error(`Debug output ${output.name} failed:`, error);
            }
        });

        await Promise.allSettled(writes);
    }

    private startAutoFlush(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        this.flushTimer = setInterval(() => {
            this.flush().catch((error) => {
                console.error('Auto-flush failed:', error);
            });
        }, this.config.autoFlush.intervalMs);
    }

    private stopAutoFlush(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = undefined;
        }
    }

    private generateId(): string {
        return 'debug_' + Math.random().toString(36).substr(2, 16);
    }

    private calculatePerformanceInsights(
        measurements: PerformanceMeasurement[],
    ): DebugReport['summary']['performanceInsights'] {
        if (measurements.length === 0) {
            return {
                slowestOperations: [],
                averageDurations: {},
                recommendations: [],
            };
        }

        // Find slowest operations
        const slowestOperations = measurements
            .filter((m) => m.duration !== undefined)
            .sort((a, b) => (b.duration || 0) - (a.duration || 0))
            .slice(0, 5)
            .map((m) => ({
                name: m.name,
                duration: m.duration || 0,
                category: m.category,
            }));

        // Calculate average durations by category
        const categoryDurations = new Map<string, number[]>();
        for (const measurement of measurements) {
            if (measurement.duration !== undefined) {
                if (!categoryDurations.has(measurement.category)) {
                    categoryDurations.set(measurement.category, []);
                }
                categoryDurations
                    .get(measurement.category)!
                    .push(measurement.duration);
            }
        }

        const averageDurations: Record<string, number> = {};
        for (const [category, durations] of categoryDurations) {
            const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
            averageDurations[category] = avg;
        }

        // Generate recommendations
        const recommendations: string[] = [];
        const slowThreshold = 1000; // 1 second

        if (slowestOperations.some((op) => op.duration > slowThreshold)) {
            recommendations.push(
                `Found operations taking over ${slowThreshold}ms. Consider optimization.`,
            );
        }

        for (const [category, avg] of Object.entries(averageDurations)) {
            if (avg > slowThreshold) {
                recommendations.push(
                    `Category '${category}' has high average duration: ${avg.toFixed(1)}ms`,
                );
            }
        }

        return { slowestOperations, averageDurations, recommendations };
    }

    private getRecentErrors(
        entries: DebugEntry[],
    ): DebugReport['recentErrors'] {
        return entries
            .filter((entry) => entry.level === 'error')
            .slice(-10) // Last 10 errors
            .map((entry) => ({
                timestamp: entry.timestamp,
                source: entry.source,
                message: entry.message,
                correlationId: entry.correlationId,
            }));
    }

    private calculateCategoryDistribution(
        entries: DebugEntry[],
    ): Record<string, number> {
        const distribution: Record<string, number> = {};
        for (const entry of entries) {
            distribution[entry.category] =
                (distribution[entry.category] || 0) + 1;
        }
        return distribution;
    }

    private calculateLevelDistribution(
        entries: DebugEntry[],
    ): Record<LogLevel, number> {
        const distribution: Record<LogLevel, number> = {
            debug: 0,
            info: 0,
            warn: 0,
            error: 0,
        };

        for (const entry of entries) {
            distribution[entry.level]++;
        }

        return distribution;
    }
}

/**
 * Debug factory for dependency injection
 */
export class DebugFactory {
    createDebugSystem(config: Partial<DebugConfig> = {}): DebugSystem {
        const defaultConfig: DebugConfig = {
            enabled: true,
            level: 'debug',
            features: {
                eventTracing: true,
                performanceProfiling: true,
                stateInspection: true,
                errorAnalysis: true,
            },
            outputs: [new ConsoleDebugOutput()],
            historyLimits: {
                maxEntries: 10000,
                maxMeasurements: 5000,
                maxSnapshots: 1000,
                maxTraces: 5000,
            },
            autoFlush: {
                enabled: true,
                intervalMs: 60000, // 1 minute
            },
        };

        const finalConfig = { ...defaultConfig, ...config };
        return new DebugSystem(finalConfig);
    }

    createMemoryOutput(maxEntries?: number): MemoryDebugOutput {
        return new MemoryDebugOutput(maxEntries);
    }

    createFileOutput(filePath: string): FileDebugOutput {
        return new FileDebugOutput(filePath);
    }
}
