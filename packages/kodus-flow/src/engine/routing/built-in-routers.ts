/**
 * @fileoverview Built-in Routers Registry
 *
 * Presets pré-configurados para routers e estratégias de execução de tools
 * que funcionam automaticamente sem configuração complexa.
 */

// Router strategies from RouterConfig (expanded with LLM strategies)
type RouterStrategy =
    | 'first_match'
    | 'best_match'
    | 'llm_decision'
    | 'custom_rules'
    | 'semantic_similarity'
    | 'llm_semantic'
    | 'llm_intelligent'
    | 'llm_contextual'
    | 'llmDecision'
    | 'llmSemantic'
    | 'llmIntelligent'
    | 'llmContextual';

export interface BuiltInRouterConfig {
    strategy: RouterStrategy;
    fallback?: RouterStrategy;
    cache?: boolean;
    metrics?: boolean;
    confidenceThreshold?: number;
    toolStrategy?: ToolExecutionStrategy;
    maxConcurrency?: number;
    timeout?: number;
    description?: string;
    useCase?: string;
    // NEW: LLM integration
    enableLLM?: boolean;
    llmStrategy?:
        | 'semantic_similarity'
        | 'llm_decision'
        | 'contextual_analysis';
    llmFallback?: boolean;
}

export type ToolExecutionStrategy =
    | 'auto'
    | 'parallel'
    | 'sequential'
    | 'adaptive'
    | 'conditional';

/**
 * Registry de routers built-in com configurações otimizadas
 */
export const BUILT_IN_ROUTERS: Record<string, BuiltInRouterConfig> = {
    /**
     * Smart Router - Auto-otimização com fallback e métricas
     * Uso: Agentes que precisam de roteamento inteligente
     */
    smart: {
        strategy: 'best_match',
        fallback: 'first_match',
        cache: true,
        metrics: true,
        confidenceThreshold: 0.8,
        toolStrategy: 'auto',
        maxConcurrency: 5,
        timeout: 60000, // ✅ 60s timeout
        description: 'Intelligent routing with auto-optimization and fallback',
        useCase: 'General purpose agents needing smart routing decisions',
    },

    /**
     * Simple Router - Mapeamento direto sem overhead
     * Uso: Agentes simples, routing determinístico
     */
    simple: {
        strategy: 'first_match',
        cache: false,
        metrics: false,
        toolStrategy: 'sequential',
        maxConcurrency: 1,
        timeout: 60000,
        description: 'Direct mapping without overhead for simple routing',
        useCase: 'Simple agents with deterministic routing needs',
    },

    /**
     * Semantic Router - Baseado em similaridade semântica
     * Uso: Agentes que trabalham com linguagem natural
     */
    semantic: {
        strategy: 'semantic_similarity',
        fallback: 'best_match',
        cache: true,
        metrics: true,
        confidenceThreshold: 0.7,
        toolStrategy: 'adaptive',
        maxConcurrency: 3,
        timeout: 60000,
        description: 'Semantic similarity-based routing for natural language',
        useCase: 'NLP agents, conversational systems, content analysis',
    },

    /**
     * Performance Router - Otimizado para alta performance
     * Uso: Agentes em produção com foco em velocidade
     */
    performance: {
        strategy: 'first_match',
        cache: true,
        metrics: false,
        toolStrategy: 'parallel',
        maxConcurrency: 10,
        timeout: 60000,
        description: 'Optimized for high-performance production environments',
        useCase: 'Production agents requiring maximum throughput',
    },

    /**
     * Reliable Router - Máxima confiabilidade com fallbacks
     * Uso: Agentes críticos que não podem falhar
     */
    reliable: {
        strategy: 'best_match',
        fallback: 'first_match',
        cache: true,
        metrics: true,
        confidenceThreshold: 0.9,
        toolStrategy: 'sequential',
        maxConcurrency: 2,
        timeout: 60000,
        description: 'Maximum reliability with comprehensive fallbacks',
        useCase: 'Mission-critical agents that cannot fail',
    },

    /**
     * Experimental Router - Para testes e desenvolvimento
     * Uso: Desenvolvimento, testes, experimentação
     */
    experimental: {
        strategy: 'custom_rules',
        fallback: 'best_match',
        cache: false,
        metrics: true,
        confidenceThreshold: 0.5,
        toolStrategy: 'conditional',
        maxConcurrency: 3,
        timeout: 60000,
        description: 'For testing and experimental features',
        useCase: 'Development, testing, feature experimentation',
    },

    /**
     * LLM Decision Router - Pure LLM-based routing decisions
     * Uso: Agentes que precisam de decisões inteligentes de roteamento
     */
    llmDecision: {
        strategy: 'llm_decision',
        fallback: 'best_match',
        cache: true,
        metrics: true,
        confidenceThreshold: 0.8,
        toolStrategy: 'adaptive',
        maxConcurrency: 3,
        timeout: 60000, // ✅ 60s timeout
        enableLLM: true,
        llmStrategy: 'llm_decision',
        llmFallback: true,
        description: 'Uses LLM for intelligent routing decisions',
        useCase: 'Complex routing scenarios requiring reasoning',
    },

    /**
     * LLM Semantic Router - Semantic similarity with LLM enhancement
     * Uso: Agentes que trabalham com linguagem natural avançada
     */
    llmSemantic: {
        strategy: 'llm_semantic',
        fallback: 'semantic_similarity',
        cache: true,
        metrics: true,
        confidenceThreshold: 0.75,
        toolStrategy: 'adaptive',
        maxConcurrency: 4,
        timeout: 60000,
        enableLLM: true,
        llmStrategy: 'semantic_similarity',
        llmFallback: true,
        description: 'Enhanced semantic similarity with LLM understanding',
        useCase: 'Advanced NLP tasks, contextual understanding',
    },

    /**
     * LLM Intelligent Router - Full LLM reasoning for routing
     * Uso: Agentes que precisam de raciocínio completo para roteamento
     */
    llmIntelligent: {
        strategy: 'llm_intelligent',
        fallback: 'llm_decision',
        cache: true,
        metrics: true,
        confidenceThreshold: 0.85,
        toolStrategy: 'adaptive',
        maxConcurrency: 2,
        timeout: 60000,
        enableLLM: true,
        llmStrategy: 'contextual_analysis',
        llmFallback: true,
        description: 'Full LLM reasoning for complex routing decisions',
        useCase: 'Complex multi-step processes requiring deep reasoning',
    },

    /**
     * LLM Contextual Router - Context-aware routing with LLM
     * Uso: Agentes que precisam entender contexto para rotear
     */
    llmContextual: {
        strategy: 'llm_contextual',
        fallback: 'llm_semantic',
        cache: true,
        metrics: true,
        confidenceThreshold: 0.8,
        toolStrategy: 'conditional',
        maxConcurrency: 3,
        timeout: 60000, // ✅ 60s timeout
        enableLLM: true,
        llmStrategy: 'contextual_analysis',
        llmFallback: true,
        description: 'Context-aware routing with LLM understanding',
        useCase: 'Conversational agents, context-dependent workflows',
    },

    /**
     * Hybrid Router - Combines traditional and LLM routing
     * Uso: Agentes que precisam de flexibilidade máxima
     */
    hybrid: {
        strategy: 'best_match',
        fallback: 'llm_decision',
        cache: true,
        metrics: true,
        confidenceThreshold: 0.8,
        toolStrategy: 'auto',
        maxConcurrency: 4,
        timeout: 60000, // ✅ 60s timeout
        enableLLM: true,
        llmStrategy: 'llm_decision',
        llmFallback: true,
        description: 'Combines traditional matching with LLM intelligence',
        useCase:
            'Advanced agents needing both structured and intelligent routing',
    },
};

/**
 * Tool execution strategy configurations
 */
export const TOOL_EXECUTION_STRATEGIES = {
    auto: {
        description: 'Automatically choose best strategy based on tools',
        defaultConcurrency: 3,
        adaptToLoad: true,
    },
    parallel: {
        description: 'Execute tools in parallel for maximum speed',
        defaultConcurrency: 5,
        adaptToLoad: false,
    },
    sequential: {
        description: 'Execute tools one by one for reliability',
        defaultConcurrency: 1,
        adaptToLoad: false,
    },
    adaptive: {
        description: 'Adapt strategy based on context and performance',
        defaultConcurrency: 3,
        adaptToLoad: true,
    },
    conditional: {
        description: 'Execute tools based on conditions and dependencies',
        defaultConcurrency: 2,
        adaptToLoad: true,
    },
};

/**
 * Get built-in router configuration by name
 */
export function getBuiltInRouter(name: string): BuiltInRouterConfig | null {
    return BUILT_IN_ROUTERS[name] || null;
}

/**
 * List all available built-in routers
 */
export function listBuiltInRouters(): Array<{
    name: string;
    config: BuiltInRouterConfig;
}> {
    return Object.entries(BUILT_IN_ROUTERS).map(([name, config]) => ({
        name,
        config,
    }));
}

/**
 * Validate if a router name is a built-in
 */
export function isBuiltInRouter(name: string): boolean {
    return name in BUILT_IN_ROUTERS;
}

/**
 * Get router recommendation based on use case
 */
export function recommendRouter(
    useCase: 'simple' | 'semantic' | 'performance' | 'reliable' | 'smart',
): string {
    const recommendations = {
        simple: 'simple',
        semantic: 'semantic',
        performance: 'performance',
        reliable: 'reliable',
        smart: 'smart',
    };

    return recommendations[useCase] || 'smart';
}

/**
 * Get tool strategy recommendation based on scenario
 */
export function recommendToolStrategy(
    scenario: 'speed' | 'reliability' | 'balanced' | 'adaptive',
): ToolExecutionStrategy {
    const recommendations: Record<string, ToolExecutionStrategy> = {
        speed: 'parallel',
        reliability: 'sequential',
        balanced: 'auto',
        adaptive: 'adaptive',
    };

    return recommendations[scenario] || 'auto';
}

/**
 * Type definitions for built-in router names
 */
export type BuiltInRouterName =
    | 'smart'
    | 'simple'
    | 'semantic'
    | 'performance'
    | 'reliable'
    | 'experimental'
    | 'llmDecision'
    | 'llmSemantic'
    | 'llmIntelligent'
    | 'llmContextual'
    | 'hybrid';

/**
 * Default router for when no configuration is provided
 */
export const DEFAULT_ROUTER: BuiltInRouterName = 'smart';

/**
 * Default tool strategy for when no configuration is provided
 */
export const DEFAULT_TOOL_STRATEGY: ToolExecutionStrategy = 'auto';
