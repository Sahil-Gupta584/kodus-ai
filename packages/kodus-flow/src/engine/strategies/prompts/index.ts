/**
 * 🎯 STRATEGY PROMPTS & UTILS
 *
 * Utilitários completos para composição de prompts e formatação
 * na nova arquitetura de strategies.
 */

// Formatadores principais
export {
    StrategyFormatters,
    ToolParameterFormatter,
    ContextFormatter,
    SchemaFormatter,
    EstimationUtils,
} from './strategy-formatters.js';

// Sistema de prompts
export {
    StrategyPromptFactory,
    ReWooPrompts,
    ReActPrompts,
} from './strategy-prompts.js';

// Default export
export { default as StrategyPrompts } from './strategy-prompts.js';

// Re-export de tipos
export type { AgentContext } from '../../../core/types/allTypes.js';

// Interfaces locais
export interface Tool {
    name: string;
    description?: string;
    parameters?: {
        type: string;
        properties?: Record<string, any>;
        required?: string[];
    };
    outputSchema?: Record<string, unknown>;
}

export interface RewooEvidenceItem {
    id: string;
    sketchId: string;
    toolName: string;
    input?: any;
    output?: any;
    error?: string;
    latencyMs?: number;
}
