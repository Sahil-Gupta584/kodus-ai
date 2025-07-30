/**
 * @module observability/timeline-viewer
 * @description Visualizador funcional para timeline de execução
 *
 * Fornece interfaces para visualizar o timeline de execução:
 * - Visualização ASCII para terminal
 * - Relatórios detalhados
 * - Formato compacto para logs
 * - Análise de performance
 *
 * Design: Funções puras para formatação e análise
 */

import type { ExecutionState, TimelineEntry } from './execution-timeline.js';
import { analyzeTimeline, getTimelineManager } from './execution-timeline.js';

// ────────────────────────────────────────────────────────────────────────────────
// 🎨 TIMELINE VIEWER CLASS
// ────────────────────────────────────────────────────────────────────────────────

export class TimelineViewer {
    private timelineManager = getTimelineManager();

    /**
     * Mostra timeline visual ASCII
     */
    showTimeline(
        correlationId: string,
        options: {
            format?: 'ascii' | 'detailed' | 'compact';
            showData?: boolean;
            showPerformance?: boolean;
            maxEvents?: number;
        } = {},
    ): string {
        const timeline = this.timelineManager.getTimeline(correlationId);
        if (!timeline) {
            return '📭 No timeline found for this execution\n';
        }

        const events = timeline.entries;
        const format = options.format || 'ascii';
        const showData = options.showData || false;
        const showPerformance = options.showPerformance || false;
        const maxEvents = options.maxEvents || 100;

        if (events.length === 0) {
            return '📭 No events found for this execution\n';
        }

        // Limit events if needed
        const displayEvents = events.slice(0, maxEvents);

        if (format === 'ascii') {
            return this.renderAsciiTimeline(displayEvents, {
                showData,
                showPerformance,
            });
        } else if (format === 'detailed') {
            return this.renderDetailedTimeline(displayEvents, {
                showData,
                showPerformance,
            });
        } else {
            return this.renderCompactTimeline(displayEvents, {
                showData,
                showPerformance,
            });
        }
    }

    /**
     * Renderiza timeline ASCII visual
     */
    private renderAsciiTimeline(
        events: TimelineEntry[],
        options: {
            showData: boolean;
            showPerformance: boolean;
        },
    ): string {
        const output: string[] = [];
        const startTime = events[0]?.timestamp || Date.now();

        output.push('🕐 EXECUTION TIMELINE');
        output.push('═'.repeat(80));
        output.push('');

        events.forEach((event, index) => {
            const relativeTime = event.timestamp - startTime;
            const timeStr = this.formatDuration(relativeTime);
            const stateIcon = this.getStateIcon(event.state);
            const eventIcon = this.getEventIcon(event.eventType);

            // Main event line
            const mainLine = `${index.toString().padStart(3, ' ')} │ ${timeStr.padStart(8, ' ')} │ ${stateIcon} ${event.state.padEnd(12, ' ')} │ ${eventIcon} ${event.eventType}`;
            output.push(mainLine);

            // Source and metadata
            const metaLine = `    │ ${''.padStart(8, ' ')} │ ${' '.repeat(15)} │ 📍 ${event.correlationId || 'unknown'}`;
            output.push(metaLine);

            // Agent/Tool info
            if (event.metadata?.agentName || event.metadata?.toolName) {
                const agentTool =
                    event.metadata.agentName || event.metadata.toolName || '';
                const label = event.metadata.agentName ? '🤖' : '🔧';
                const infoLine = `    │ ${''.padStart(8, ' ')} │ ${' '.repeat(15)} │ ${label} ${agentTool}`;
                output.push(infoLine);
            }

            // Performance info
            if (options.showPerformance && event.duration) {
                const perfLine = `    │ ${''.padStart(8, ' ')} │ ${' '.repeat(15)} │ ⏱️  ${this.formatDuration(event.duration)}`;
                output.push(perfLine);
            }

            // Data preview
            if (
                options.showData &&
                event.eventData &&
                typeof event.eventData === 'object'
            ) {
                const dataPreview =
                    JSON.stringify(event.eventData).substring(0, 50) + '...';
                const dataLine = `    │ ${''.padStart(8, ' ')} │ ${' '.repeat(15)} │ 📋 ${dataPreview}`;
                output.push(dataLine);
            }

            // Separator
            if (index < events.length - 1) {
                output.push('    │');
            }
        });

        output.push('');
        output.push('═'.repeat(80));

        return output.join('\n');
    }

    /**
     * Renderiza timeline detalhado
     */
    private renderDetailedTimeline(
        events: TimelineEntry[],
        options: {
            showData: boolean;
            showPerformance: boolean;
        },
    ): string {
        const output: string[] = [];
        const startTime = events[0]?.timestamp || Date.now();

        output.push('📊 DETAILED EXECUTION TIMELINE');
        output.push('═'.repeat(80));
        output.push('');

        events.forEach((event, index) => {
            const relativeTime = event.timestamp - startTime;
            const timeStr = this.formatDuration(relativeTime);
            const stateIcon = this.getStateIcon(event.state);
            const eventIcon = this.getEventIcon(event.eventType);

            output.push(`┌─ Event #${index + 1} ─ ${event.id}`);
            output.push(
                `│ 🕐 Time: ${timeStr} (${new Date(event.timestamp).toISOString()})`,
            );
            output.push(`│ ${stateIcon} State: ${event.state}`);
            output.push(`│ ${eventIcon} Type: ${event.eventType}`);
            output.push(
                `│ 📍 Correlation: ${event.correlationId || 'unknown'}`,
            );

            if (event.metadata?.agentName) {
                output.push(`│ 🤖 Agent: ${event.metadata.agentName}`);
            }

            if (event.metadata?.plannerType) {
                output.push(`│ 🧠 Planner: ${event.metadata.plannerType}`);
            }

            if (event.metadata?.toolName) {
                output.push(`│ 🔧 Tool: ${event.metadata.toolName}`);
            }

            if (event.metadata?.iteration) {
                output.push(`│ 🔄 Iteration: ${event.metadata.iteration}`);
            }

            if (options.showPerformance && event.duration) {
                output.push(
                    `│ ⏱️  Duration: ${this.formatDuration(event.duration)}`,
                );
            }

            // Data preview
            if (
                options.showData &&
                event.eventData &&
                typeof event.eventData === 'object'
            ) {
                const dataPreview =
                    JSON.stringify(event.eventData).substring(0, 100) + '...';
                output.push(`│ 📋 Data: ${dataPreview}`);
            }

            output.push('└─');
            output.push('');
        });

        return output.join('\n');
    }

    /**
     * Renderiza timeline compacto
     */
    private renderCompactTimeline(
        events: TimelineEntry[],
        _options: {
            showData: boolean;
            showPerformance: boolean;
        },
    ): string {
        const output: string[] = [];
        const startTime = events[0]?.timestamp || Date.now();

        output.push('📋 COMPACT EXECUTION TIMELINE');
        output.push('═'.repeat(80));

        events.forEach((event, _index) => {
            const relativeTime = event.timestamp - startTime;
            const timeStr = this.formatDuration(relativeTime);
            const stateIcon = this.getStateIcon(event.state);
            const eventIcon = this.getEventIcon(event.eventType);

            const line = `${timeStr.padStart(8, ' ')} │ ${stateIcon} ${event.state.padEnd(12, ' ')} │ ${eventIcon} ${event.eventType}`;
            output.push(line);
        });

        return output.join('\n');
    }

    /**
     * Gera relatório de execução
     */
    generateReport(correlationId: string): string {
        const timeline = this.timelineManager.getTimeline(correlationId);
        if (!timeline) {
            return '📭 No timeline found for this execution\n';
        }

        const analysis = analyzeTimeline(timeline);
        const output: string[] = [];

        output.push('📊 EXECUTION REPORT');
        output.push('═'.repeat(80));
        output.push('');

        output.push(`🆔 Execution ID: ${timeline.executionId}`);
        output.push(`🔗 Correlation ID: ${timeline.correlationId}`);
        output.push(
            `⏱️  Total Duration: ${this.formatDuration(timeline.totalDuration || 0)}`,
        );
        output.push(
            `📊 Current State: ${this.getStateIcon(timeline.currentState)} ${timeline.currentState}`,
        );
        output.push(`📝 Total Events: ${timeline.entries.length}`);
        output.push(`🔄 Transitions: ${timeline.transitions.length}`);

        output.push('');
        output.push('📈 ANALYSIS');
        output.push('─'.repeat(40));

        output.push(`✅ Completed: ${analysis.isCompleted ? 'Yes' : 'No'}`);
        output.push(`❌ Failed: ${analysis.isFailed ? 'Yes' : 'No'}`);
        output.push(
            `⏱️  Average Duration: ${this.formatDuration(analysis.avgDuration)}`,
        );

        output.push('');
        output.push('📊 STATE DISTRIBUTION');
        output.push('─'.repeat(40));

        Object.entries(analysis.stateDistribution).forEach(([state, count]) => {
            const icon = this.getStateIcon(state as ExecutionState);
            output.push(`${icon} ${state}: ${count} events`);
        });

        return output.join('\n');
    }

    /**
     * Exporta timeline para JSON
     */
    exportToJSON(correlationId: string): string {
        const timeline = this.timelineManager.getTimeline(correlationId);
        if (!timeline) {
            return '{}';
        }

        return JSON.stringify(timeline, null, 2);
    }

    /**
     * Exporta timeline para CSV
     */
    exportToCSV(correlationId: string): string {
        const timeline = this.timelineManager.getTimeline(correlationId);
        if (!timeline) {
            return '';
        }

        const lines: string[] = [];
        lines.push('timestamp,id,type,state,correlationId,duration,metadata');

        timeline.entries.forEach((event) => {
            const metadata = event.metadata
                ? JSON.stringify(event.metadata)
                : '';
            const duration = event.duration || 0;
            const line = `${event.timestamp},${event.id},${event.eventType},${event.state},${event.correlationId || ''},${duration},"${metadata}"`;
            lines.push(line);
        });

        return lines.join('\n');
    }

    /**
     * Helpers para formatação
     */

    private getStateIcon(state: ExecutionState): string {
        const icons: Record<ExecutionState, string> = {
            initialized: '🔄',
            thinking: '🧠',
            acting: '⚡',
            observing: '👀',
            completed: '✅',
            failed: '❌',
            paused: '⏸️',
        };
        return icons[state] || '❓';
    }

    private getEventIcon(type: string): string {
        if (type.includes('orchestrator')) return '🎯';
        if (type.includes('agent')) return '🤖';
        if (type.includes('planner')) return '🧠';
        if (type.includes('llm')) return '🤖';
        if (type.includes('tool')) return '🔧';
        if (type.includes('error')) return '❌';
        if (type.includes('performance')) return '⚡';
        return '📝';
    }

    private formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }

    // private formatBytes(bytes: number): string {
    //     if (bytes < 1024) return `${bytes}B`;
    //     if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    //     if (bytes < 1024 * 1024 * 1024)
    //         return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    //     return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
    // }
}

// ────────────────────────────────────────────────────────────────────────────────
// 🚀 FACTORY FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────────

export function createTimelineViewer(): TimelineViewer {
    return new TimelineViewer();
}

/**
 * Quick helper para mostrar timeline
 */
export function showTimeline(
    correlationId: string,
    format: 'ascii' | 'detailed' | 'compact' = 'ascii',
): string {
    const viewer = new TimelineViewer();
    return viewer.showTimeline(correlationId, { format });
}

/**
 * Quick helper para gerar relatório
 */
export function generateExecutionReport(correlationId: string): string {
    const viewer = new TimelineViewer();
    return viewer.generateReport(correlationId);
}

/**
 * Quick helper para exportar JSON
 */
export function exportTimelineJSON(correlationId: string): string {
    const viewer = new TimelineViewer();
    return viewer.exportToJSON(correlationId);
}

/**
 * Quick helper para exportar CSV
 */
export function exportTimelineCSV(correlationId: string): string {
    const viewer = new TimelineViewer();
    return viewer.exportToCSV(correlationId);
}
