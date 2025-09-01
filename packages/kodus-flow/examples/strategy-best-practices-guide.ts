/**
 * 🎯 GUIA DEFINITIVO: Melhores Práticas para Camada Strategies
 *
 * Este guia consolida todas as melhores práticas para trabalhar
 * corretamente com a nova camada de strategies do Kodus Flow.
 */

import {
    StrategyExecutionContext,
    ExecutionResult,
} from '../src/engine/strategies/index.js';

// =============================================================================
// 📋 PRINCÍPIOS FUNDAMENTAIS
// =============================================================================

/**
 * 🎯 Princípios Orientadores
 */
export const StrategyPrinciples = {
    /**
     * 1. Separação Clara de Responsabilidades
     */
    separationOfConcerns: {
        rule: 'Cada estratégia deve ter responsabilidade única e bem definida',
        react: 'Responsável por: Pensar → Agir → Observar (iterativo)',
        rewoo: 'Responsável por: Planejar → Executar → Sintetizar (estruturado)',
        context: 'Responsável por: Gerenciar estado runtime e enriquecer dados',
    },

    /**
     * 2. Context First
     */
    contextFirst: {
        rule: 'Sempre enriqueça o context antes da execução',
        required: [
            'Agent identity e permissions',
            'Session state e history',
            'Runtime metrics e health',
            'Tool availability e validation',
            'Kernel state e memory',
        ],
        benefits: [
            'Execuções mais inteligentes',
            'Melhores decisões de estratégia',
            'Context-aware responses',
            'Debugging mais fácil',
        ],
    },

    /**
     * 3. Strategy Selection Intelligence
     */
    strategySelection: {
        rule: 'Escolha estratégia baseada em dados, não em opinião',
        criteria: {
            complexity: {
                low: 'ReAct (≤ 3)',
                medium: 'ReAct ou ReWoo (4-6)',
                high: 'ReWoo (≥ 7)',
            },
            tools: {
                few: 'ReAct (≤ 5 tools)',
                many: 'ReWoo (≥ 6 tools)',
            },
            history: {
                none: 'ReAct (exploratory)',
                rich: 'ReAct (contextual)',
                complex: 'ReWoo (structured)',
            },
        },
    },

    /**
     * 4. Error Handling Robustness
     */
    errorHandling: {
        rule: 'Trate erros graceful e forneça recovery paths',
        strategies: [
            'Retry com estratégia alternativa',
            'Fallback para estratégia mais simples',
            'Partial results quando possível',
            'Detailed error context para debugging',
        ],
    },
};

// =============================================================================
// 🏗️ ARQUITETURA RECOMENDADA
// =============================================================================

/**
 * 📁 Estrutura de Arquivos Recomendada
 */
export const RecommendedArchitecture = {
    structure: {
        'src/engine/strategies/': {
            'index.ts': 'Exports públicos e tipos',
            'strategy-interface.ts': 'Contratos base (BaseExecutionStrategy)',
            'react-strategy.ts': 'Implementação ReAct completa',
            'rewoo-strategy.ts': 'Implementação ReWoo completa',
            'strategy-factory.ts': 'Factory para criação de estratégias',
            'shared-methods.ts': 'Métodos comuns (LLM, Tools, Analysis)',
            'stop-conditions.ts': 'Condições de parada configuráveis',
            'types.ts': 'Tipos TypeScript específicos',
            'prompts/': {
                'react/': {
                    'system-prompt.ts': 'Prompt base ReAct',
                    'user-templates.ts': 'Templates parametrizáveis',
                    'examples.ts': 'Exemplos de uso',
                    'validation.ts': 'Regras de validação',
                },
                'rewoo/': {
                    'planner-prompts.ts': 'Prompts de planejamento',
                    'executor-prompts.ts': 'Prompts de execução',
                    'organizer-prompts.ts': 'Prompts de síntese',
                    'examples.ts': 'Exemplos complexos',
                },
                'shared/': {
                    'context-formatters.ts': 'Formatadores de context',
                    'tool-descriptions.ts': 'Descrições de ferramentas',
                    'validation-rules.ts': 'Regras de validação comuns',
                },
            },
        },
        'src/core/context/': {
            'strategy-context-manager.ts': 'Gerenciador de context específico',
            'runtime-enricher.ts': 'Enriquecedor de dados runtime',
            'context-validators.ts': 'Validadores de context',
        },
    },

    benefits: [
        '🔍 Localização fácil de código',
        '🔧 Manutenibilidade clara',
        '📊 Separação de responsabilidades',
        '🚀 Escalabilidade horizontal',
        '👥 Colaboração em equipe',
    ],
};

// =============================================================================
// 🎯 MELHORES PRÁTICAS POR COMPONENTE
// =============================================================================

/**
 * 📝 Prompts: Como Organizar Corretamente
 */
export const PromptBestPractices = {
    /**
     * Estrutura de Prompt Base
     */
    baseStructure: {
        system: {
            required: ['Role definition', 'Process explanation', 'Constraints'],
            optional: ['Examples', 'Edge cases', 'Performance tips'],
            format: 'Clear, structured, actionable',
        },
        user: {
            required: ['Context', 'Task', 'Constraints'],
            optional: ['Examples', 'History', 'Preferences'],
            format: 'Conversational, specific, bounded',
        },
    },

    /**
     * Estratégia de Parametrização
     */
    parametrization: {
        rules: [
            'Use placeholders para dados variáveis',
            'Valide parâmetros obrigatórios',
            'Forneça defaults sensatos',
            'Documente formato esperado',
        ],
        examples: {
            bad: 'Execute a tarefa: {{task}}',
            good: 'Execute a tarefa: {{task}}\nContexto: {{context}}\nRestrições: {{constraints}}',
        },
    },

    /**
     * Gestão de Versões
     */
    versioning: {
        strategy: 'Semantic versioning por estratégia',
        storage: 'Database com histórico de versões',
        migration: 'Scripts para upgrade gradual',
        testing: 'Testes de regressão por versão',
    },

    /**
     * Validação e Testes
     */
    validation: {
        structure: 'JSON Schema para validar formato',
        content: 'Regras de negócio específicas',
        performance: 'Testes de token count e latency',
        accuracy: 'Testes de output quality',
    },
};

/**
 * 🔧 Context: Como Gerenciar Runtime
 */
export const ContextBestPractices = {
    /**
     * Enriquecimento Obrigatório
     */
    enrichment: {
        kernel: ['State', 'Memory usage', 'Active processes'],
        memory: ['Recent items', 'Categories', 'Access patterns'],
        session: ['Duration', 'Interactions', 'Metadata'],
        observability: ['Metrics', 'Traces', 'Health checks'],
    },

    /**
     * Validação de Context
     */
    validation: {
        required: ['Agent identity', 'Session info', 'Tool permissions'],
        optional: ['Runtime metrics', 'Historical data', 'Preferences'],
        types: 'TypeScript strict mode sempre',
        runtime: 'Validação em tempo de execução',
    },

    /**
     * Cache Strategy
     */
    caching: {
        levels: ['Memory', 'Redis', 'Database'],
        ttl: {
            kernel: '30s',
            memory: '5m',
            session: '1h',
            tools: '10m',
        },
        invalidation: 'Event-driven cache invalidation',
    },
};

/**
 * ⚙️ Estratégias: Como Implementar
 */
export const StrategyImplementationBestPractices = {
    /**
     * ReAct Strategy
     */
    react: {
        principles: [
            'Iterative thinking process',
            'Action validation before execution',
            'Observation-based learning',
            'Graceful degradation on errors',
        ],
        patterns: {
            thinking: 'Structured reasoning format',
            acting: 'Tool selection and parameter binding',
            observing: 'Result analysis and feedback',
            deciding: 'Stop condition evaluation',
        },
        antiPatterns: [
            'Infinite loops without proper stopping',
            'Tool execution without validation',
            'Ignoring observation results',
            'Hardcoded decision logic',
        ],
    },

    /**
     * ReWoo Strategy
     */
    rewoo: {
        principles: [
            'Planning-first approach',
            'Independent task decomposition',
            'Parallel execution when possible',
            'Structured result synthesis',
        ],
        patterns: {
            planning: 'Task decomposition and dependency analysis',
            executing: 'Independent task execution',
            organizing: 'Result aggregation and synthesis',
            validating: 'Consistency and completeness checks',
        },
        antiPatterns: [
            'Sequential execution of independent tasks',
            'Over-planning simple problems',
            'Ignoring task dependencies',
            'Incomplete result synthesis',
        ],
    },
};

/**
 * 🧪 Testes: Estratégia Completa
 */
export const TestingBestPractices = {
    /**
     * Pirâmide de Testes
     */
    pyramid: {
        unit: {
            scope: 'Individual functions and methods',
            coverage: '80%+ line coverage',
            mocks: 'External dependencies (LLM, Tools)',
            focus: 'Logic correctness',
        },
        integration: {
            scope: 'Strategy execution with real context',
            coverage: 'Key execution paths',
            mocks: 'Only external services',
            focus: 'End-to-end correctness',
        },
        e2e: {
            scope: 'Complete execution with real LLM',
            coverage: 'Critical user scenarios',
            mocks: 'None',
            focus: 'Real-world behavior',
        },
    },

    /**
     * Test Data Strategy
     */
    testData: {
        fixtures: 'Realistic but deterministic data',
        factories: 'Flexible test data generation',
        snapshots: 'Expected output validation',
        parameterization: 'Multiple scenarios per test',
    },

    /**
     * Performance Testing
     */
    performance: {
        benchmarks: 'Execution time, memory usage, token count',
        load: 'Concurrent strategy executions',
        stress: 'High complexity scenarios',
        monitoring: 'Resource usage patterns',
    },
};

// =============================================================================
// 🚀 PADRÕES DE USO RECOMENDADOS
// =============================================================================

/**
 * 🎯 Padrões de Execução por Cenário
 */
export const UsagePatterns = {
    /**
     * Cenário: Tarefa Simples
     */
    simpleTask: {
        strategy: 'react',
        config: {
            maxIterations: 5,
            maxToolCalls: 3,
            timeout: 30000,
        },
        context: 'minimal',
        monitoring: 'basic',
    },

    /**
     * Cenário: Tarefa Complexa
     */
    complexTask: {
        strategy: 'rewoo',
        config: {
            maxIterations: 15,
            maxToolCalls: 25,
            timeout: 300000,
        },
        context: 'full',
        monitoring: 'detailed',
    },

    /**
     * Cenário: Sistema Interativo
     */
    interactiveSystem: {
        strategy: 'react',
        config: {
            maxIterations: 10,
            maxToolCalls: 15,
            timeout: 120000,
            streaming: true,
        },
        context: 'session-aware',
        monitoring: 'real-time',
    },

    /**
     * Cenário: Processamento em Lote
     */
    batchProcessing: {
        strategy: 'rewoo',
        config: {
            maxIterations: 20,
            maxToolCalls: 50,
            timeout: 600000,
            parallel: true,
        },
        context: 'optimized',
        monitoring: 'aggregated',
    },
};

/**
 * 🔄 Padrões de Transição
 */
export const TransitionPatterns = {
    /**
     * Migração Gradual
     */
    gradualMigration: {
        phase1: 'Paralelo com sistema antigo',
        phase2: 'Feature flags para novo sistema',
        phase3: 'A/B testing de estratégias',
        phase4: 'Full migration com rollback plan',
    },

    /**
     * Rollback Strategy
     */
    rollback: {
        triggers: ['Error rate > 5%', 'Performance degradation > 20%'],
        process: 'Feature flag disable + monitoring',
        recovery: 'Automatic fallback to old system',
    },

    /**
     * Feature Flags
     */
    featureFlags: {
        strategy: 'strategy-selection-method',
        prompts: 'prompt-version-selection',
        context: 'context-enrichment-level',
        monitoring: 'metrics-collection-level',
    },
};

// =============================================================================
// 📊 MONITORAMENTO E OBSERVABILIDADE
// =============================================================================

/**
 * 📈 Métricas Essenciais
 */
export const EssentialMetrics = {
    /**
     * Performance Metrics
     */
    performance: {
        executionTime: 'Average, p95, p99',
        tokenEfficiency: 'Tokens per second',
        memoryUsage: 'Peak and average',
        throughput: 'Executions per minute',
    },

    /**
     * Quality Metrics
     */
    quality: {
        successRate: 'Successful executions %',
        errorRate: 'Error breakdown by type',
        accuracy: 'Output quality scores',
        userSatisfaction: 'User feedback scores',
    },

    /**
     * Strategy Metrics
     */
    strategy: {
        selectionAccuracy: 'Correct strategy selection %',
        completionRate: 'Tasks completed successfully %',
        iterationEfficiency: 'Average iterations per task',
        toolUtilization: 'Tools used per execution',
    },

    /**
     * Context Metrics
     */
    context: {
        enrichmentTime: 'Context enrichment latency',
        enrichmentSuccess: 'Successful enrichment %',
        cacheHitRate: 'Context cache efficiency',
        dataFreshness: 'Context data age',
    },
};

/**
 * 🚨 Alertas e Thresholds
 */
export const AlertsAndThresholds = {
    critical: {
        errorRate: '> 5%',
        executionTime: '> 300s',
        memoryUsage: '> 1GB',
    },

    warning: {
        successRate: '< 95%',
        cacheHitRate: '< 80%',
        tokenEfficiency: '< 50 tokens/s',
    },

    info: {
        strategySelection: 'Log all auto-selections',
        contextEnrichment: 'Log enrichment failures',
        performanceDegradation: 'Compare with baselines',
    },
};

// =============================================================================
// 🛠️ FERRAMENTAS DE DESENVOLVIMENTO
// =============================================================================

/**
 * 🧰 Development Tools
 */
export const DevelopmentTools = {
    /**
     * Local Development
     */
    local: {
        promptTester: 'Test prompts with mock LLM',
        strategyDebugger: 'Step-through execution',
        contextInspector: 'Inspect enriched context',
        performanceProfiler: 'Execution performance analysis',
    },

    /**
     * Testing Tools
     */
    testing: {
        strategyValidator: 'Validate strategy outputs',
        promptComparator: 'Compare prompt versions',
        contextSimulator: 'Simulate different contexts',
        loadGenerator: 'Generate realistic load',
    },

    /**
     * Production Tools
     */
    production: {
        strategySwitcher: 'Runtime strategy switching',
        promptUpdater: 'Zero-downtime prompt updates',
        contextMonitor: 'Real-time context health',
        performanceDashboard: 'Strategy performance metrics',
    },
};

// =============================================================================
// 📚 CHECKLIST DE IMPLEMENTAÇÃO
// =============================================================================

/**
 * ✅ Checklist Completo para Nova Implementação
 */
export const ImplementationChecklist = {
    /**
     * Antes de Implementar
     */
    preImplementation: [
        { task: 'Definir requirements claros', status: 'required' },
        { task: 'Escolher estratégia apropriada', status: 'required' },
        { task: 'Designar arquitetura de context', status: 'required' },
        { task: 'Planejar estratégia de testes', status: 'required' },
        { task: 'Configurar monitoring básico', status: 'required' },
    ],

    /**
     * Durante Implementação
     */
    duringImplementation: [
        { task: 'Seguir princípios de separação', status: 'required' },
        { task: 'Implementar validações robustas', status: 'required' },
        { task: 'Adicionar logging detalhado', status: 'required' },
        { task: 'Escrever testes unitários', status: 'required' },
        { task: 'Testar integração completa', status: 'required' },
    ],

    /**
     * Após Implementação
     */
    postImplementation: [
        { task: 'Executar testes de performance', status: 'required' },
        { task: 'Configurar monitoring avançado', status: 'required' },
        { task: 'Documentar uso e limitações', status: 'required' },
        { task: 'Planejar estratégia de deployment', status: 'required' },
        { task: 'Estabelecer processo de rollback', status: 'required' },
    ],

    /**
     * Em Produção
     */
    production: [
        { task: 'Monitorar métricas essenciais', status: 'required' },
        { task: 'Configurar alertas automáticos', status: 'required' },
        { task: 'Implementar A/B testing', status: 'recommended' },
        { task: 'Coletar feedback de usuários', status: 'recommended' },
        { task: 'Otimizar performance bottlenecks', status: 'ongoing' },
    ],
};

// =============================================================================
// 🎯 CONCLUSÃO E RECOMENDAÇÕES FINAIS
// =============================================================================

/**
 * 🏆 Recomendações Finais
 */
export const FinalRecommendations = {
    /**
     * Comece Pequeno
     */
    startSmall: {
        advice: 'Implemente uma estratégia por vez',
        benefits: 'Aprendizado gradual, riscos menores',
        approach: 'ReAct primeiro, depois ReWoo',
    },

    /**
     * Mantenha Simplicidade
     */
    keepSimple: {
        advice: 'Não over-engineer soluções simples',
        principle: 'Complexidade deve corresponder ao problema',
        rule: 'Se ReAct resolve, não use ReWoo',
    },

    /**
     * Monitore Sempre
     */
    monitorAlways: {
        advice: 'Logging e métricas são essenciais',
        practice: 'Log everything, measure everything',
        tools: 'Use observability desde o início',
    },

    /**
     * Teste Extensivamente
     */
    testExtensively: {
        advice: 'Cobertura de testes alta é obrigatória',
        types: 'Unit, Integration, E2E, Performance',
        automation: 'CI/CD com testes automatizados',
    },

    /**
     * Aprenda e Itere
     */
    learnAndIterate: {
        advice: 'Use dados para melhorar continuamente',
        practice: 'A/B testing, user feedback, metrics analysis',
        mindset: 'Always be improving',
    },
};

/**
 * 🚀 Próximos Passos Recomendados
 */
export const NextSteps = [
    '1. Leia os exemplos de implementação',
    '2. Escolha uma estratégia para começar',
    '3. Implemente com testes abrangentes',
    '4. Configure monitoring básico',
    '5. Deploy com feature flags',
    '6. Monitore e otimize continuamente',
];

export default {
    StrategyPrinciples,
    RecommendedArchitecture,
    PromptBestPractices,
    ContextBestPractices,
    StrategyImplementationBestPractices,
    TestingBestPractices,
    UsagePatterns,
    TransitionPatterns,
    EssentialMetrics,
    AlertsAndThresholds,
    DevelopmentTools,
    ImplementationChecklist,
    FinalRecommendations,
    NextSteps,
};
