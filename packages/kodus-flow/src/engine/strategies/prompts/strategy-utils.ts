/**
 * 🎯 STRATEGY UTILS - Versão Simplificada
 *
 * Utilitários essenciais para estratégias de execução.
 * Foco na funcionalidade sem complexidade desnecessária.
 */

import { StrategyFormatters } from './strategy-formatters.js';

/**
 * Utilitários essenciais para estratégias
 */
export class StrategyUtils {
    private readonly formatters: StrategyFormatters;

    constructor(formatters?: StrategyFormatters) {
        this.formatters = formatters || new StrategyFormatters();
    }

    /**
     * Formatação de ferramentas com validação
     */
    formatTools(tools: any[]): string {
        return this.formatters.formatToolsList(tools);
    }

    /**
     * Formatação de contexto adicional
     */
    formatContext(context: Record<string, unknown>): string {
        return this.formatters.formatAdditionalContext(context);
    }

    /**
     * Formatação de contexto do agente
     */
    formatAgent(agentContext: any): string {
        return this.formatters.formatAgentContext(agentContext);
    }

    /**
     * Estimativa de complexidade
     */
    estimateComplexity(input: string, tools: any[]): number {
        return this.formatters.estimateComplexity(input, tools);
    }
}

// =============================================================================
// 🎯 HELPERS DE FORMATAÇÃO
// =============================================================================

/**
 * Helpers estáticos para formatação comum
 */
export class FormattingHelpers {
    /**
     * Formata duração em formato legível
     */
    static formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        return `${minutes}m ${seconds % 60}s`;
    }

    /**
     * Formata número com separadores
     */
    static formatNumber(num: number): string {
        return new Intl.NumberFormat('en-US').format(num);
    }

    /**
     * Formata porcentagem
     */
    static formatPercentage(value: number, decimals = 1): string {
        return `${(value * 100).toFixed(decimals)}%`;
    }

    /**
     * Format data size
     */
    static formatDataSize(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(1)}${units[unitIndex]}`;
    }

    /**
     * Formata tempo relativo
     */
    static formatRelativeTime(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMinutes < 1) return 'just now';
        if (diffMinutes < 60) return `${diffMinutes}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    }

    /**
     * Sanitiza texto para uso em prompts
     */
    static sanitizeForPrompt(text: string): string {
        return text
            .replace(/[\r\n]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Trunca texto inteligentemente
     */
    static smartTruncate(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;

        const ellipsis = '...';
        const keepLength = maxLength - ellipsis.length;

        // Tenta quebrar em limite de palavra
        const truncated = text.substring(0, keepLength);
        const lastSpace = truncated.lastIndexOf(' ');

        if (lastSpace > keepLength * 0.8) {
            return truncated.substring(0, lastSpace) + ellipsis;
        }

        return truncated + ellipsis;
    }
}

export default StrategyUtils;
