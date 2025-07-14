/**
 * @fileoverview Built-in Planners Registry
 *
 * Presets pré-configurados para planners que funcionam automaticamente
 * sem necessidade de configuração complexa pelo usuário.
 */

// Extend PlanningStrategy to include 'multi' and LLM techniques for built-ins
type ExtendedPlanningStrategy =
    | 'cot'
    | 'tot'
    | 'graph'
    | 'multi'
    | 'react'
    | 'ooda'
    | 'llm_hybrid';

export interface BuiltInPlannerConfig {
    type: ExtendedPlanningStrategy;
    maxSteps?: number;
    maxBranches?: number;
    maxDepth?: number;
    enableIntelligence?: boolean;
    cache?: boolean;
    autoSelect?: boolean;
    strategies?: ExtendedPlanningStrategy[];
    complexityThreshold?: number;
    description?: string;
    useCase?: string;
    // NEW: LLM integration
    llmTechnique?: 'cot' | 'tot' | 'react' | 'ooda';
    enableLLM?: boolean;
    llmFallback?: boolean;
}

/**
 * Registry de planners built-in com configurações otimizadas
 */
export const BUILT_IN_PLANNERS: Record<string, BuiltInPlannerConfig> = {
    /**
     * Smart Planner - Auto-seleciona estratégia baseada na complexidade
     * Uso: Agentes que precisam de adaptação automática
     */
    smart: {
        type: 'multi',
        strategies: ['cot', 'tot', 'graph', 'react'],
        autoSelect: true,
        enableIntelligence: true,
        cache: true,
        complexityThreshold: 0.5,
        enableLLM: true,
        llmTechnique: 'cot',
        llmFallback: true,
        description:
            'Auto-selects best strategy based on input complexity with LLM intelligence',
        useCase: 'General purpose agents that need adaptive planning',
    },

    /**
     * Simple Planner - Chain-of-thought básico e rápido
     * Uso: Agentes simples, tasks lineares, protótipos
     */
    simple: {
        type: 'cot',
        maxSteps: 5,
        enableIntelligence: false,
        cache: true,
        description: 'Fast linear planning for simple tasks',
        useCase: 'Simple agents, linear workflows, prototypes',
    },

    /**
     * Exploratory Planner - Tree-of-thought para exploração
     * Uso: Agentes que precisam explorar múltiplas abordagens
     */
    exploratory: {
        type: 'tot',
        maxBranches: 3,
        maxDepth: 4,
        enableIntelligence: true,
        cache: true,
        description: 'Explores multiple approaches with tree-based reasoning',
        useCase: 'Research agents, creative tasks, problem-solving',
    },

    /**
     * Complex Planner - Graph-of-thought para tasks complexas
     * Uso: Agentes com dependências complexas, workflows avançados
     */
    complex: {
        type: 'graph',
        maxSteps: 15,
        enableIntelligence: true,
        cache: true,
        description: 'Handles complex dependencies with graph-based planning',
        useCase: 'Advanced agents, complex workflows, multi-step processes',
    },

    /**
     * Fast Planner - Mínima configuração para máxima velocidade
     * Uso: Agentes em produção com alta performance
     */
    fast: {
        type: 'cot',
        maxSteps: 3,
        enableIntelligence: false,
        cache: false,
        description: 'Minimal overhead for maximum speed',
        useCase: 'High-performance production agents',
    },

    /**
     * Comprehensive Planner - Máxima funcionalidade
     * Uso: Agentes que precisam do melhor resultado possível
     */
    comprehensive: {
        type: 'graph',
        maxSteps: 20,
        maxBranches: 5,
        maxDepth: 6,
        enableIntelligence: true,
        cache: true,
        autoSelect: true,
        strategies: ['cot', 'tot', 'graph'],
        complexityThreshold: 0.3,
        description: 'Maximum functionality with all features enabled',
        useCase: 'Mission-critical agents requiring best possible results',
    },

    /**
     * LLM Chain-of-Thought Planner - Pure LLM reasoning
     * Uso: Agentes que precisam de raciocínio natural do LLM
     */
    llmCot: {
        type: 'llm_hybrid',
        enableLLM: true,
        llmTechnique: 'cot',
        llmFallback: false,
        maxSteps: 10,
        cache: true,
        description: 'Uses LLM Chain-of-Thought for natural reasoning',
        useCase: 'Natural language processing, complex reasoning tasks',
    },

    /**
     * LLM Tree-of-Thoughts Planner - Explores multiple reasoning paths
     * Uso: Agentes que precisam explorar alternativas com LLM
     */
    llmTot: {
        type: 'llm_hybrid',
        enableLLM: true,
        llmTechnique: 'tot',
        llmFallback: false,
        maxSteps: 15,
        maxBranches: 3,
        cache: true,
        description: 'Uses LLM Tree-of-Thoughts for multi-path reasoning',
        useCase: 'Creative tasks, research, problem-solving with alternatives',
    },

    /**
     * LLM ReAct Planner - Reasoning + Acting iteratively
     * Uso: Agentes que precisam de ciclo pensamento-ação
     */
    llmReact: {
        type: 'llm_hybrid',
        enableLLM: true,
        llmTechnique: 'react',
        llmFallback: false,
        maxSteps: 12,
        cache: true,
        description: 'Uses LLM ReAct for iterative reasoning and acting',
        useCase: 'Interactive agents, step-by-step problem solving',
    },

    /**
     * LLM OODA Planner - Military-inspired decision cycles
     * Uso: Agentes que precisam de ciclo decisório estruturado
     */
    llmOoda: {
        type: 'llm_hybrid',
        enableLLM: true,
        llmTechnique: 'ooda',
        llmFallback: false,
        maxSteps: 8,
        cache: true,
        description: 'Uses LLM OODA Loop for structured decision making',
        useCase: 'Strategic planning, tactical decisions, adaptive responses',
    },

    /**
     * Hybrid Planner - Combines programmatic and LLM planning
     * Uso: Agentes que precisam de flexibilidade máxima
     */
    hybrid: {
        type: 'llm_hybrid',
        strategies: ['cot', 'tot', 'react', 'ooda'],
        enableLLM: true,
        llmTechnique: 'cot',
        llmFallback: true,
        autoSelect: true,
        maxSteps: 15,
        cache: true,
        description: 'Combines programmatic planning with LLM intelligence',
        useCase:
            'Advanced agents needing both structured logic and natural reasoning',
    },
};

/**
 * Get built-in planner configuration by name
 */
export function getBuiltInPlanner(name: string): BuiltInPlannerConfig | null {
    return BUILT_IN_PLANNERS[name] || null;
}

/**
 * List all available built-in planners
 */
export function listBuiltInPlanners(): Array<{
    name: string;
    config: BuiltInPlannerConfig;
}> {
    return Object.entries(BUILT_IN_PLANNERS).map(([name, config]) => ({
        name,
        config,
    }));
}

/**
 * Validate if a planner name is a built-in
 */
export function isBuiltInPlanner(name: string): boolean {
    return name in BUILT_IN_PLANNERS;
}

/**
 * Get planner recommendation based on use case
 */
export function recommendPlanner(
    useCase: 'simple' | 'exploratory' | 'complex' | 'fast' | 'smart',
): string {
    const recommendations = {
        simple: 'simple',
        exploratory: 'exploratory',
        complex: 'complex',
        fast: 'fast',
        smart: 'smart',
    };

    return recommendations[useCase] || 'smart';
}

/**
 * Type definitions for built-in planner names
 */
export type BuiltInPlannerName =
    | 'smart'
    | 'simple'
    | 'exploratory'
    | 'complex'
    | 'fast'
    | 'comprehensive'
    | 'llmCot'
    | 'llmTot'
    | 'llmReact'
    | 'llmOoda'
    | 'hybrid';

/**
 * Default planner for when no configuration is provided
 */
export const DEFAULT_PLANNER: BuiltInPlannerName = 'smart';
