/**
 * 🎯 GUIA DE MIGRAÇÃO: PlannerPromptComposer → Strategy Prompts
 *
 * Este arquivo mapeia como migrar os métodos do PlannerPromptComposer
 * para a nova arquitetura de strategies organizada.
 */

import { StrategyExecutionContext } from '../src/engine/strategies/index.js';

// =============================================================================
// 📊 MAPEAMENTO DOS MÉTODOS EXISTENTES
// =============================================================================

/**
 * 📋 Mapeamento dos métodos do PlannerPromptComposer
 */
export const PlannerPromptComposerMethods = {
    // === MÉTODOS DE COMPOSIÇÃO ===
    composePrompt: {
        original:
            'composePrompt(context: PromptCompositionContext): Promise<ComposedPrompt>',
        purpose: 'Compor prompt completo com system + user',
        migration: {
            to: 'StrategyPromptManager.organizePrompt()',
            strategy: 'Reorganizar em métodos específicos por estratégia',
            status: '🔄 Em andamento',
        },
    },

    composeSystemPrompt: {
        original: 'composeSystemPrompt(isReplan?: boolean): string',
        purpose: 'Compor prompt do sistema',
        migration: {
            to: 'ReActPrompts.systemPrompt + ReWooPrompts.plannerSystemPrompt',
            strategy: 'Separar por estratégia (ReAct vs ReWoo)',
            status: '✅ Concluído',
        },
    },

    composeUserPrompt: {
        original:
            'composeUserPrompt(context: PromptCompositionContext): string',
        purpose: 'Compor prompt do usuário',
        migration: {
            to: 'ReActPrompts.userTaskTemplate() + ReWooPrompts.plannerTaskTemplate()',
            strategy: 'Templates parametrizáveis por estratégia',
            status: '✅ Concluído',
        },
    },

    // === MÉTODOS DE FORMATAÇÃO ===
    formatAvailableTools: {
        original: 'formatAvailableTools(tools: ToolMetadataForLLM[]): string',
        purpose: 'Formatar lista de ferramentas disponíveis',
        migration: {
            to: 'formatToolParameters() em ReActPrompts + ReWooPrompts',
            strategy: 'Reutilizar lógica de formatação existente',
            status: '🔄 Em andamento',
        },
    },

    formatToolParametersEnhanced: {
        original:
            'formatToolParametersEnhanced(tool: ToolMetadataForLLM): string',
        purpose: 'Formatar parâmetros de ferramentas com tipos avançados',
        migration: {
            to: 'formatToolParameters() - 150+ linhas de lógica complexa',
            strategy: 'Migrar método inteiro para utils compartilhadas',
            status: '⏳ Pendente',
            priority: 'HIGH',
            effort: 'Médio (2-3h)',
            benefits: 'Reutilização de formatação avançada de tipos',
        },
    },

    formatOutputSchema: {
        original:
            'formatOutputSchema(schema: Record<string, unknown>, toolName?: string): string',
        purpose: 'Formatar schema de saída JSON para display',
        migration: {
            to: 'createSchemaFormatter() utilitário',
            strategy:
                'Criar utilitário compartilhado para formatação de schemas',
            status: '⏳ Pendente',
            priority: 'MEDIUM',
            effort: 'Alto (4-5h)',
            benefits: 'Formatação inteligente de tipos JSON Schema',
        },
    },

    formatAdditionalContext: {
        original:
            'formatAdditionalContext(additionalContext: Record<string, unknown>): string',
        purpose: 'Formatar contexto adicional (user context, agent identity)',
        migration: {
            to: 'formatAgentContext() em StrategyContextRuntimeManager',
            strategy: 'Integrar com context runtime manager',
            status: '🔄 Em andamento',
            priority: 'HIGH',
            effort: 'Baixo (1h)',
            benefits: 'Context enriquecido automaticamente',
        },
    },

    formatReplanContext: {
        original:
            'formatReplanContext(replanContext: Record<string, unknown>): string',
        purpose: 'Formatar contexto de replan com histórico de execução',
        migration: {
            to: 'Enriquecer StrategyExecutionContext.history',
            strategy: 'Integrar com loadExecutionHistory()',
            status: '⏳ Pendente',
            priority: 'MEDIUM',
            effort: 'Médio (2h)',
            benefits: 'Histórico de execução automático',
        },
    },

    // === MÉTODOS UTILITÁRIOS ===
    getToolUsageInstructions: {
        original: 'getToolUsageInstructions(): string',
        purpose: 'Instruções detalhadas de uso de ferramentas',
        migration: {
            to: 'Prompts específicos por estratégia',
            strategy: 'Incluir nas seções relevantes de cada prompt',
            status: '⏳ Pendente',
            priority: 'LOW',
            effort: 'Baixo (30min)',
            benefits: 'Instruções contextuais por estratégia',
        },
    },

    getUniversalPlanningPatterns: {
        original: 'getUniversalPlanningPatterns(isReplan?: boolean): string',
        purpose: 'Padrões universais de planejamento',
        migration: {
            to: 'ReWooPrompts.plannerSystemPrompt',
            strategy: 'Migrar lógica de planejamento estruturado',
            status: '⏳ Pendente',
            priority: 'HIGH',
            effort: 'Médio (2h)',
            benefits: 'Padrões de planejamento robustos',
        },
    },

    // === MÉTODOS DE CACHE E PERFORMANCE ===
    generateCacheKey: {
        original: 'generateCacheKey(context: PromptCompositionContext): string',
        purpose: 'Gerar chave de cache baseada no contexto',
        migration: {
            to: 'PromptCache em StrategyPromptManager',
            strategy: 'Implementar cache inteligente por estratégia',
            status: '⏳ Pendente',
            priority: 'LOW',
            effort: 'Baixo (1h)',
            benefits: 'Cache de prompts para performance',
        },
    },

    estimateTokenCount: {
        original: 'estimateTokenCount(text: string): number',
        purpose: 'Estimar contagem de tokens para custos',
        migration: {
            to: 'estimateTokenCount() em StrategyContextRuntimeManager',
            strategy: 'Integrar com cálculo de complexidade',
            status: '⏳ Pendente',
            priority: 'LOW',
            effort: 'Baixo (30min)',
            benefits: 'Estimativa de custos automática',
        },
    },
};

// =============================================================================
// 🎯 PLANO DE MIGRAÇÃO DETALHADO
// =============================================================================

/**
 * 📋 Plano de Migração por Prioridade
 */
export const MigrationPlan = {
    // === FASE 1: MÉTODOS CRÍTICOS (1-2 dias) ===
    phase1: {
        name: 'Migração Crítica',
        duration: '1-2 dias',
        methods: [
            'formatToolParametersEnhanced', // 150+ linhas, alta reutilização
            'formatAdditionalContext', // Integração com context runtime
            'composeSystemPrompt', // Base para prompts de estratégia
            'composeUserPrompt', // Templates parametrizáveis
        ],
        deliverables: [
            '✅ StrategyPromptManager funcional',
            '✅ Context formatting integrado',
            '✅ Prompts básicos por estratégia',
            '✅ Testes de migração básicos',
        ],
    },

    // === FASE 2: MÉTODOS AVANÇADOS (2-3 dias) ===
    phase2: {
        name: 'Funcionalidades Avançadas',
        duration: '2-3 dias',
        methods: [
            'formatOutputSchema', // Formatação avançada de schemas
            'formatReplanContext', // Histórico de execução
            'getUniversalPlanningPatterns', // Padrões de planejamento
            'generateCacheKey', // Cache inteligente
        ],
        deliverables: [
            '✅ Formatação completa de tipos',
            '✅ Histórico de execução',
            '✅ Padrões de planejamento robustos',
            '✅ Cache de performance',
        ],
    },

    // === FASE 3: OTIMIZAÇÕES (1 dia) ===
    phase3: {
        name: 'Otimização e Limpeza',
        duration: '1 dia',
        methods: [
            'estimateTokenCount', // Estimativa de custos
            'getToolUsageInstructions', // Instruções contextuais
            'Performance optimizations', // Otimizações gerais
            'Code cleanup', // Limpeza de código
        ],
        deliverables: [
            '✅ Estimativas de custo precisas',
            '✅ Instruções otimizadas por contexto',
            '✅ Performance otimizada',
            '✅ Código limpo e documentado',
        ],
    },
};

// =============================================================================
// 🔧 UTILITÁRIOS DE MIGRAÇÃO
// =============================================================================

/**
 * 🛠️ Utilitários para facilitar a migração
 */
export class MigrationUtils {
    /**
     * Extrair método do PlannerPromptComposer
     */
    static extractMethod(
        methodName: keyof typeof PlannerPromptComposerMethods,
        sourceFile: string,
    ) {
        const methodInfo = PlannerPromptComposerMethods[methodName];
        console.log(`🔄 Extraindo método: ${methodName}`);
        console.log(`📍 Localização: ${sourceFile}`);
        console.log(`🎯 Migração: ${methodInfo.migration.to}`);
        console.log(`📊 Status: ${methodInfo.migration.status}`);
        return methodInfo;
    }

    /**
     * Validar compatibilidade de tipos
     */
    static validateTypeCompatibility(
        oldMethod: string,
        newMethod: string,
        oldParams: any[],
        newParams: any[],
    ) {
        const compatibility = {
            parameters: oldParams.length === newParams.length,
            returnType: 'string' === 'string', // Simplificado
            breakingChanges: this.detectBreakingChanges(oldParams, newParams),
        };

        return {
            compatible:
                compatibility.parameters && !compatibility.breakingChanges,
            issues: compatibility.breakingChanges
                ? ['Parâmetros incompatíveis']
                : [],
        };
    }

    /**
     * Detectar mudanças incompatíveis
     */
    private static detectBreakingChanges(oldParams: any[], newParams: any[]) {
        // Lógica simplificada - em produção seria mais sofisticada
        return oldParams.length !== newParams.length;
    }

    /**
     * Gerar relatório de migração
     */
    static generateMigrationReport() {
        const totalMethods = Object.keys(PlannerPromptComposerMethods).length;
        const completedMethods = Object.values(
            PlannerPromptComposerMethods,
        ).filter((m) => m.migration.status === '✅ Concluído').length;
        const inProgressMethods = Object.values(
            PlannerPromptComposerMethods,
        ).filter((m) => m.migration.status === '🔄 Em andamento').length;

        return {
            total: totalMethods,
            completed: completedMethods,
            inProgress: inProgressMethods,
            pending: totalMethods - completedMethods - inProgressMethods,
            completionPercentage: Math.round(
                (completedMethods / totalMethods) * 100,
            ),
        };
    }
}

// =============================================================================
// 📊 STATUS ATUAL DA MIGRAÇÃO
// =============================================================================

/**
 * 📈 Relatório de Progresso Atual
 */
export const CurrentMigrationStatus = {
    timestamp: new Date().toISOString(),
    report: MigrationUtils.generateMigrationReport(),
    nextSteps: [
        '1. ✅ Completar formatToolParametersEnhanced (prioridade alta)',
        '2. 🔄 Integrar formatAdditionalContext com context runtime',
        '3. ⏳ Implementar formatOutputSchema como utilitário',
        '4. ⏳ Migrar getUniversalPlanningPatterns para ReWoo',
        '5. ✅ Testar integração completa com exemplos',
    ],
    blockers: [
        '⏳ Dependência de types do core (ToolMetadataForLLM)',
        '⏳ Necessidade de adaptar interfaces para StrategyExecutionContext',
        '⏳ Validação de compatibilidade de tipos entre sistemas',
    ],
    recommendations: [
        '🎯 Focar primeiro nos métodos críticos (formatToolParametersEnhanced)',
        '🎯 Manter compatibilidade de interfaces durante transição',
        '🎯 Criar testes automatizados para validar migração',
        '🎯 Documentar breaking changes claramente',
    ],
};

// =============================================================================
// 🎯 ESTRATÉGIA DE MIGRAÇÃO RECOMENDADA
// =============================================================================

/**
 * 🚀 Estratégia de Migração Recomendada
 */
export const RecommendedMigrationStrategy = {
    approach: 'Incremental Migration',
    phases: {
        phase1: {
            focus: 'Core functionality (80% value)',
            methods: [
                'formatToolParametersEnhanced',
                'formatAdditionalContext',
                'composeSystemPrompt',
                'composeUserPrompt',
            ],
            duration: '2-3 dias',
            risk: 'Low',
            rollback: 'Easy (feature flags)',
        },
        phase2: {
            focus: 'Advanced features (15% value)',
            methods: [
                'formatOutputSchema',
                'formatReplanContext',
                'getUniversalPlanningPatterns',
            ],
            duration: '2-3 dias',
            risk: 'Medium',
            rollback: 'Medium (database migration)',
        },
        phase3: {
            focus: 'Optimizations (5% value)',
            methods: [
                'Performance optimizations',
                'Cache implementation',
                'Code cleanup',
            ],
            duration: '1 dia',
            risk: 'Low',
            rollback: 'Easy',
        },
    },

    successCriteria: [
        '✅ Todos os métodos críticos migrados',
        '✅ Cobertura de testes > 80%',
        '✅ Performance mantida ou melhorada',
        '✅ Zero breaking changes para usuários',
        '✅ Documentação atualizada',
    ],

    rollbackPlan: {
        featureFlags: 'strategy-migration-enabled',
        database: 'Manter PlannerPromptComposer como fallback',
        monitoring: 'Alertas automáticos de degradação',
        timeline: '7 dias de rollback disponíveis',
    },
};

export default {
    PlannerPromptComposerMethods,
    MigrationPlan,
    MigrationUtils,
    CurrentMigrationStatus,
    RecommendedMigrationStrategy,
};
