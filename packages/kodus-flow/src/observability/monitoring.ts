import {
    EngineMetrics,
    KernelMetrics,
    MetricsConfig,
    MetricValue,
    RuntimeMetrics,
    SystemMetrics,
} from '@/core/types/allTypes.js';
import { createLogger } from './logger.js';

export class LayeredMetricsSystem {
    private config: MetricsConfig;
    private logger: ReturnType<typeof createLogger>;

    // Métricas por camada
    private kernelMetrics: KernelMetrics;
    private runtimeMetrics: RuntimeMetrics;
    private engineMetrics: EngineMetrics;

    // Histórico de métricas
    private metricsHistory: SystemMetrics[] = [];
    private collectionTimer: NodeJS.Timeout | null = null;

    constructor(config: MetricsConfig) {
        this.config = config;
        this.logger = createLogger('layered-metrics');

        // Inicializar métricas
        this.kernelMetrics = this.initializeKernelMetrics();
        this.runtimeMetrics = this.initializeRuntimeMetrics();
        this.engineMetrics = this.initializeEngineMetrics();

        // Iniciar coleta se habilitado
        if (this.config.enabled) {
            this.startCollection();
        }

        this.logger.info('LayeredMetricsSystem initialized', {
            enabled: this.config.enabled,
            collectionIntervalMs: this.config.collectionIntervalMs,
        });
    }

    /**
     * Inicializar métricas do Kernel
     */
    private initializeKernelMetrics(): KernelMetrics {
        return {
            lifecycle: {
                startTime: Date.now(),
                status: 'initialized',
                eventCount: 0,
                pauseCount: 0,
                resumeCount: 0,
            },
        };
    }

    /**
     * Inicializar métricas do Runtime
     */
    private initializeRuntimeMetrics(): RuntimeMetrics {
        return {
            eventProcessing: {
                totalEvents: 0,
                processedEvents: 0,
                failedEvents: 0,
                averageProcessingTimeMs: 0,
            },
            performance: {
                memoryUsageBytes: 0,
                cpuUsagePercent: 0,
            },
        };
    }

    /**
     * Inicializar métricas do Engine
     */
    private initializeEngineMetrics(): EngineMetrics {
        return {
            agentOperations: {
                totalAgents: 0,
                activeAgents: 0,
                agentExecutions: 0,
                agentSuccesses: 0,
                agentFailures: 0,
                averageAgentExecutionTimeMs: 0,
            },
            toolOperations: {
                totalTools: 0,
                activeTools: 0,
                toolCalls: 0,
                toolSuccesses: 0,
                toolFailures: 0,
                averageToolExecutionTimeMs: 0,
            },
            workflowOperations: {
                totalWorkflows: 0,
                activeWorkflows: 0,
                workflowExecutions: 0,
                workflowSuccesses: 0,
                workflowFailures: 0,
                averageWorkflowExecutionTimeMs: 0,
            },
        };
    }

    /**
     * Registrar métrica do Kernel
     */
    recordKernelMetric<K extends keyof KernelMetrics>(
        category: K,
        metric: keyof KernelMetrics[K],
        value: MetricValue,
    ): void {
        if (!this.config.enabled) return;

        try {
            const categoryMetrics = this.kernelMetrics[category] as Record<
                string,
                unknown
            >;
            if (categoryMetrics && typeof categoryMetrics === 'object') {
                (categoryMetrics as Record<string, unknown>)[metric as string] =
                    value;
            }
        } catch (error) {
            this.logger.error(
                'Failed to record kernel metric',
                error as Error,
                {
                    category,
                    metric,
                    value,
                },
            );
        }
    }

    /**
     * Registrar métrica do Runtime
     */
    recordRuntimeMetric<K extends keyof RuntimeMetrics>(
        category: K,
        metric: keyof RuntimeMetrics[K],
        value: MetricValue,
    ): void {
        if (!this.config.enabled) return;

        try {
            const categoryMetrics = this.runtimeMetrics[category] as Record<
                string,
                unknown
            >;
            if (categoryMetrics && typeof categoryMetrics === 'object') {
                (categoryMetrics as Record<string, unknown>)[metric as string] =
                    value;
            }
        } catch (error) {
            this.logger.error(
                'Failed to record runtime metric',
                error as Error,
                {
                    category,
                    metric,
                    value,
                },
            );
        }
    }

    /**
     * Registrar métrica do Engine
     */
    recordEngineMetric<K extends keyof EngineMetrics>(
        category: K,
        metric: keyof EngineMetrics[K],
        value: MetricValue,
    ): void {
        if (!this.config.enabled) return;

        try {
            const categoryMetrics = this.engineMetrics[category] as Record<
                string,
                unknown
            >;
            if (categoryMetrics && typeof categoryMetrics === 'object') {
                (categoryMetrics as Record<string, unknown>)[metric as string] =
                    value;
            }
        } catch (error) {
            this.logger.error(
                'Failed to record engine metric',
                error as Error,
                {
                    category,
                    metric,
                    value,
                },
            );
        }
    }

    /**
     * Incrementar métrica do Kernel
     */
    incrementKernelMetric<K extends keyof KernelMetrics>(
        category: K,
        metric: keyof KernelMetrics[K],
        delta: number = 1,
    ): void {
        if (!this.config.enabled) return;

        try {
            const categoryMetrics = this.kernelMetrics[category] as Record<
                string,
                unknown
            >;
            if (categoryMetrics && typeof categoryMetrics === 'object') {
                const currentValue = (
                    categoryMetrics as Record<string, unknown>
                )[metric as string];
                if (typeof currentValue === 'number') {
                    (categoryMetrics as Record<string, unknown>)[
                        metric as string
                    ] = currentValue + delta;
                }
            }
        } catch (error) {
            this.logger.error(
                'Failed to increment kernel metric',
                error as Error,
                {
                    category,
                    metric,
                    delta,
                },
            );
        }
    }

    /**
     * Incrementar métrica do Runtime
     */
    incrementRuntimeMetric<K extends keyof RuntimeMetrics>(
        category: K,
        metric: keyof RuntimeMetrics[K],
        delta: number = 1,
    ): void {
        if (!this.config.enabled) return;

        try {
            const categoryMetrics = this.runtimeMetrics[category] as Record<
                string,
                unknown
            >;
            if (categoryMetrics && typeof categoryMetrics === 'object') {
                const currentValue = (
                    categoryMetrics as Record<string, unknown>
                )[metric as string];
                if (typeof currentValue === 'number') {
                    (categoryMetrics as Record<string, unknown>)[
                        metric as string
                    ] = currentValue + delta;
                }
            }
        } catch (error) {
            this.logger.error(
                'Failed to increment runtime metric',
                error as Error,
                {
                    category,
                    metric,
                    delta,
                },
            );
        }
    }

    /**
     * Incrementar métrica do Engine
     */
    incrementEngineMetric<K extends keyof EngineMetrics>(
        category: K,
        metric: keyof EngineMetrics[K],
        delta: number = 1,
    ): void {
        if (!this.config.enabled) return;

        try {
            const categoryMetrics = this.engineMetrics[category] as Record<
                string,
                unknown
            >;
            if (categoryMetrics && typeof categoryMetrics === 'object') {
                const currentValue = (
                    categoryMetrics as Record<string, unknown>
                )[metric as string];
                if (typeof currentValue === 'number') {
                    (categoryMetrics as Record<string, unknown>)[
                        metric as string
                    ] = currentValue + delta;
                }
            }
        } catch (error) {
            this.logger.error(
                'Failed to increment engine metric',
                error as Error,
                {
                    category,
                    metric,
                    delta,
                },
            );
        }
    }

    /**
     * Obter métricas consolidadas
     */
    getSystemMetrics(): SystemMetrics {
        const now = Date.now();

        return {
            kernel: { ...this.kernelMetrics },
            runtime: { ...this.runtimeMetrics },
            engine: { ...this.engineMetrics },
            health: {
                overallHealth: this.calculateOverallHealth(),
                lastHealthCheck: now,
                uptimeMs: now - this.kernelMetrics.lifecycle.startTime,
                memoryUsageBytes: process.memoryUsage().heapUsed,
                cpuUsagePercent: this.calculateCpuUsage(),
            },
        };
    }

    /**
     * Obter métricas específicas do Kernel
     */
    getKernelMetrics(): KernelMetrics {
        return { ...this.kernelMetrics };
    }

    /**
     * Obter métricas específicas do Runtime
     */
    getRuntimeMetrics(): RuntimeMetrics {
        return { ...this.runtimeMetrics };
    }

    /**
     * Obter métricas específicas do Engine
     */
    getEngineMetrics(): EngineMetrics {
        return { ...this.engineMetrics };
    }

    /**
     * Obter histórico de métricas
     */
    getMetricsHistory(): SystemMetrics[] {
        return [...this.metricsHistory];
    }

    /**
     * Iniciar coleta de métricas
     */
    private startCollection(): void {
        if (this.collectionTimer) {
            clearInterval(this.collectionTimer);
        }

        this.collectionTimer = setInterval(() => {
            this.collectMetrics();
        }, this.config.collectionIntervalMs);

        this.logger.info('Metrics collection started', {
            intervalMs: this.config.collectionIntervalMs,
        });
    }

    /**
     * Coletar métricas atuais
     */
    private collectMetrics(): void {
        try {
            const metrics = this.getSystemMetrics();

            // Adicionar ao histórico
            if (this.config.enableHistorical) {
                this.metricsHistory.push(metrics);

                // Limitar tamanho do histórico
                if (
                    this.metricsHistory.length > this.config.maxMetricsHistory
                ) {
                    this.metricsHistory.shift();
                }
            }

            // Log em tempo real
            if (this.config.enableRealTime) {
                this.logger.debug('Metrics collected', {
                    timestamp: new Date().toISOString(),
                    kernelEventCount: metrics.kernel.lifecycle.eventCount,
                    runtimeProcessedEvents:
                        metrics.runtime.eventProcessing.processedEvents,
                    engineActiveAgents:
                        metrics.engine.agentOperations.activeAgents,
                    overallHealth: metrics.health.overallHealth,
                });
            }
        } catch (error) {
            this.logger.error(`Failed to collect metrics: ${String(error)}`);
        }
    }

    /**
     * Calcular saúde geral do sistema
     */
    private calculateOverallHealth(): 'healthy' | 'degraded' | 'unhealthy' {
        const errorRate = this.calculateErrorRate();
        const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // MB

        if (errorRate > 0.1 || memoryUsage > 1000) {
            return 'unhealthy';
        } else if (errorRate > 0.05 || memoryUsage > 500) {
            return 'degraded';
        } else {
            return 'healthy';
        }
    }

    /**
     * Calcular taxa de erro
     */
    private calculateErrorRate(): number {
        const totalEvents = this.runtimeMetrics.eventProcessing.totalEvents;
        const failedEvents = this.runtimeMetrics.eventProcessing.failedEvents;

        if (totalEvents === 0) return 0;
        return failedEvents / totalEvents;
    }

    /**
     * Calcular uso de CPU (simplificado)
     */
    private calculateCpuUsage(): number {
        // Get actual CPU usage
        const usage = process.cpuUsage();
        const totalCpu = (usage.user + usage.system) / 1000000; // Convert to seconds
        const uptime = process.uptime();

        // Calculate CPU percentage (rough estimate)
        return uptime > 0 ? Math.min(100, (totalCpu / uptime) * 100) : 0;
    }

    /**
     * Exportar métricas
     */
    exportMetrics(format: 'json' | 'prometheus' | 'statsd'): string {
        const metrics = this.getSystemMetrics();

        switch (format) {
            case 'json':
                return JSON.stringify(metrics, null, 2);
            case 'prometheus':
                return this.exportPrometheusFormat(metrics);
            case 'statsd':
                return this.exportStatsdFormat(metrics);
            default:
                return JSON.stringify(metrics, null, 2);
        }
    }

    /**
     * Exportar formato Prometheus
     */
    private exportPrometheusFormat(metrics: SystemMetrics): string {
        const lines: string[] = [];

        // Kernel metrics
        lines.push(`# Kernel Metrics`);
        lines.push(
            `kernel_lifecycle_status{status="${metrics.kernel.lifecycle.status}"} 1`,
        );
        lines.push(`kernel_event_count ${metrics.kernel.lifecycle.eventCount}`);
        lines.push(`kernel_pause_count ${metrics.kernel.lifecycle.pauseCount}`);
        lines.push(
            `kernel_resume_count ${metrics.kernel.lifecycle.resumeCount}`,
        );

        // Runtime metrics
        lines.push(`# Runtime Metrics`);
        lines.push(
            `runtime_total_events ${metrics.runtime.eventProcessing.totalEvents}`,
        );
        lines.push(
            `runtime_processed_events ${metrics.runtime.eventProcessing.processedEvents}`,
        );
        lines.push(
            `runtime_failed_events ${metrics.runtime.eventProcessing.failedEvents}`,
        );
        lines.push(
            `runtime_average_processing_time_ms ${metrics.runtime.eventProcessing.averageProcessingTimeMs}`,
        );
        lines.push(
            `runtime_memory_usage_bytes ${metrics.runtime.performance.memoryUsageBytes}`,
        );
        lines.push(
            `runtime_cpu_usage_percent ${metrics.runtime.performance.cpuUsagePercent}`,
        );

        // Engine metrics
        lines.push(`# Engine Metrics`);
        lines.push(
            `engine_total_agents ${metrics.engine.agentOperations.totalAgents}`,
        );
        lines.push(
            `engine_active_agents ${metrics.engine.agentOperations.activeAgents}`,
        );
        lines.push(
            `engine_agent_executions ${metrics.engine.agentOperations.agentExecutions}`,
        );
        lines.push(
            `engine_agent_successes ${metrics.engine.agentOperations.agentSuccesses}`,
        );
        lines.push(
            `engine_agent_failures ${metrics.engine.agentOperations.agentFailures}`,
        );
        lines.push(
            `engine_average_agent_execution_time_ms ${metrics.engine.agentOperations.averageAgentExecutionTimeMs}`,
        );

        // Health metrics
        lines.push(`# Health Metrics`);
        lines.push(`system_uptime_ms ${metrics.health.uptimeMs}`);
        lines.push(
            `system_memory_usage_bytes ${metrics.health.memoryUsageBytes}`,
        );
        lines.push(
            `system_cpu_usage_percent ${metrics.health.cpuUsagePercent}`,
        );

        return lines.join('\n');
    }

    /**
     * Exportar formato StatsD
     */
    private exportStatsdFormat(metrics: SystemMetrics): string {
        const lines: string[] = [];

        // Kernel metrics
        lines.push(
            `kernel.event_count:${metrics.kernel.lifecycle.eventCount}|c`,
        );
        lines.push(
            `kernel.pause_count:${metrics.kernel.lifecycle.pauseCount}|c`,
        );
        lines.push(
            `kernel.resume_count:${metrics.kernel.lifecycle.resumeCount}|c`,
        );

        // Runtime metrics
        lines.push(
            `runtime.total_events:${metrics.runtime.eventProcessing.totalEvents}|c`,
        );
        lines.push(
            `runtime.processed_events:${metrics.runtime.eventProcessing.processedEvents}|c`,
        );
        lines.push(
            `runtime.failed_events:${metrics.runtime.eventProcessing.failedEvents}|c`,
        );
        lines.push(
            `runtime.average_processing_time:${metrics.runtime.eventProcessing.averageProcessingTimeMs}|ms`,
        );
        lines.push(
            `runtime.memory_usage:${metrics.runtime.performance.memoryUsageBytes}|g`,
        );
        lines.push(
            `runtime.cpu_usage:${metrics.runtime.performance.cpuUsagePercent}|g`,
        );

        // Engine metrics
        lines.push(
            `engine.total_agents:${metrics.engine.agentOperations.totalAgents}|g`,
        );
        lines.push(
            `engine.active_agents:${metrics.engine.agentOperations.activeAgents}|g`,
        );
        lines.push(
            `engine.agent_executions:${metrics.engine.agentOperations.agentExecutions}|c`,
        );
        lines.push(
            `engine.agent_successes:${metrics.engine.agentOperations.agentSuccesses}|c`,
        );
        lines.push(
            `engine.agent_failures:${metrics.engine.agentOperations.agentFailures}|c`,
        );
        lines.push(
            `engine.average_agent_execution_time:${metrics.engine.agentOperations.averageAgentExecutionTimeMs}|ms`,
        );

        return lines.join('\n');
    }

    /**
     * Limpar métricas
     */
    clearMetrics(): void {
        this.kernelMetrics = this.initializeKernelMetrics();
        this.runtimeMetrics = this.initializeRuntimeMetrics();
        this.engineMetrics = this.initializeEngineMetrics();
        this.metricsHistory = [];

        this.logger.info('Metrics cleared');
    }

    /**
     * Parar coleta
     */
    stop(): void {
        if (this.collectionTimer) {
            clearInterval(this.collectionTimer);
            this.collectionTimer = null;
        }

        this.logger.info('Metrics collection stopped');
    }

    /**
     * Dispose do sistema
     */
    dispose(): void {
        this.stop();
        this.clearMetrics();
        this.logger.info('LayeredMetricsSystem disposed');
    }
}

/**
 * Criar sistema de métricas
 */
export function createLayeredMetricsSystem(
    config: MetricsConfig,
): LayeredMetricsSystem {
    return new LayeredMetricsSystem(config);
}

/**
 * Sistema global de métricas
 */
let globalMetricsSystem: LayeredMetricsSystem | null = null;

/**
 * Obter sistema global de métricas
 */
export function getLayeredMetricsSystem(): LayeredMetricsSystem | null {
    return globalMetricsSystem;
}

/**
 * Definir sistema global de métricas
 */
export function setLayeredMetricsSystem(system: LayeredMetricsSystem): void {
    globalMetricsSystem = system;
}

// Bootstrap simples: inicia sistema global se ainda não existir (DX)
export function ensureMetricsSystem(
    config: MetricsConfig,
): LayeredMetricsSystem {
    if (!globalMetricsSystem) {
        globalMetricsSystem = new LayeredMetricsSystem(config);
    }
    return globalMetricsSystem;
}
