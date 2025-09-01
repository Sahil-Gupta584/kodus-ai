/**
 * 🎯 EXEMPLO COMPLETO: Como trabalhar com a nova camada Strategies
 *
 * Este arquivo demonstra como:
 * 1. Organizar prompts específicos por estratégia
 * 2. Integrar com context runtime
 * 3. Usar as estratégias corretamente
 * 4. Seguir as regras de arquitetura
 */

import {
    StrategyFactory,
    ReActStrategy,
    ReWooStrategy,
    StrategyExecutionContext,
    ExecutionResult,
    createStopConditions,
} from '../src/engine/strategies/index.js';
import { createLogger } from '../src/observability/index.js';
import { LLMAdapter, AgentContext, Tool } from '../src/core/types/allTypes.js';

// =============================================================================
// 🎯 1. ORGANIZAÇÃO DE PROMPTS POR ESTRATÉGIA
// =============================================================================

/**
 * 📝 Sistema de Prompts Organizado por Estratégia
 * Cada estratégia tem seus próprios prompts especializados
 */
class StrategyPromptManager {
    private logger = createLogger('strategy-prompts');

    /**
     * Prompts específicos para ReAct Strategy
     */
    getReActPrompts() {
        return {
            system: `
Você é um agente inteligente que usa o padrão ReAct (Reasoning + Acting).

Seu processo de pensamento deve ser:
1. **OBSERVAR** o contexto e entrada do usuário
2. **PENSAR** sobre qual ação tomar
3. **AGIR** executando a ação
4. **OBSERVAR** o resultado
5. Repetir até alcançar o objetivo

Seja conciso mas completo em suas reflexões.
            `.trim(),

            userTemplate: (context: StrategyExecutionContext) =>
                `
## CONTEXTO ATUAL
${context.input}

## FERRAMENTAS DISPONÍVEIS
${context.tools.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n')}

## HISTÓRICO DE EXECUÇÃO
${context.history
    .map(
        (step) =>
            `${step.type.toUpperCase()}: ${step.thought?.reasoning || 'N/A'}`,
    )
    .join('\n')}

Qual é sua próxima ação?
            `.trim(),
        };
    }

    /**
     * Prompts específicos para ReWoo Strategy
     */
    getReWooPrompts() {
        return {
            planner: `
Você é o PLANEJADOR em uma estratégia ReWoo (Reasoning Without Observation).

Sua tarefa é:
1. **ANALISAR** o objetivo do usuário
2. **DECOMPOR** em passos independentes
3. **IDENTIFICAR** ferramentas necessárias
4. **CRIAR** um plano executável

IMPORTANTE: Foque apenas no PLANEJAMENTO, não na execução.
            `.trim(),

            sketchTemplate: (context: StrategyExecutionContext) =>
                `
OBJETIVO: ${context.input}

FERRAMENTAS DISPONÍVEIS:
${context.tools.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n')}

CONTEXTO ADICIONAL:
${JSON.stringify(context.agentContext, null, 2)}

CRIE UM PLANO ESTRUTURADO:
1. Identifique sub-tarefas independentes
2. Para cada sub-tarefa, indique qual ferramenta usar
3. Especifique os parâmetros necessários
4. Mostre dependências entre tarefas
            `.trim(),

            organizer: `
Você é o ORGANIZADOR final em ReWoo.

Sua tarefa é:
1. **RECEBER** resultados de todas as execuções
2. **SINTETIZAR** uma resposta coerente
3. **CITAR** fontes dos dados usados
4. **FORNECER** resposta final ao usuário

IMPORTANTE: Use apenas dados dos resultados executados.
            `.trim(),

            organizeTemplate: (goal: string, evidences: any[]) =>
                `
OBJETIVO ORIGINAL: ${goal}

RESULTADOS EXECUTADOS:
${evidences.map((ev, i) => `[E${i + 1}] ${ev.toolName}: ${JSON.stringify(ev.output)}`).join('\n')}

SINTETIZE uma resposta final baseada APENAS nestes dados.
Cite as evidências [E1], [E2], etc. quando usar informações.
            `.trim(),
        };
    }
}

// =============================================================================
// 🎯 2. CONTEXT RUNTIME MANAGER
// =============================================================================

/**
 * 📊 Gerenciador de Context Runtime
 * Centraliza toda a lógica de context para strategies
 */
class StrategyContextManager {
    private logger = createLogger('strategy-context');

    /**
     * Cria context completo para execução de estratégia
     */
    async createExecutionContext(
        input: string,
        agentContext: AgentContext,
        tools: Tool[],
        metadata?: Record<string, unknown>,
    ): Promise<StrategyExecutionContext> {
        // 🔍 Enriquecer context com dados runtime
        const enrichedContext = await this.enrichWithRuntimeData(agentContext);

        return {
            input,
            tools,
            agentContext: enrichedContext,
            config: {
                executionStrategy: 'react', // ou 'rewoo'
                maxIterations: 10,
                maxToolCalls: 20,
                maxExecutionTime: 300000,
            },
            history: [], // Inicialmente vazio
            metadata: {
                strategy: 'react',
                complexity: this.calculateComplexity(input, tools),
                startTime: Date.now(),
                endTime: undefined,
                agentName: agentContext.agentName,
                sessionId: agentContext.sessionId,
                correlationId: agentContext.correlationId,
                ...metadata,
            },
        };
    }

    /**
     * Enriquece context com dados runtime (Kernel, Memory, etc.)
     */
    private async enrichWithRuntimeData(
        agentContext: AgentContext,
    ): Promise<AgentContext> {
        // Aqui você integraria com:
        // - Kernel Handler para estado atual
        // - Memory Manager para contexto histórico
        // - Session Manager para dados da sessão
        // - Observability para métricas

        return {
            ...agentContext,
            // Adicionar dados runtime aqui
            runtime: {
                kernelState: 'active',
                memorySize: 150,
                sessionDuration: Date.now() - (agentContext as any).startTime,
                toolUsage: {
                    totalCalls: 15,
                    successRate: 0.87,
                    averageLatency: 245,
                },
            },
        };
    }

    /**
     * Calcula complexidade da tarefa
     */
    private calculateComplexity(input: string, tools: Tool[]): number {
        let complexity = 0;

        // Base complexity
        complexity += tools.length;

        // Input complexity
        if (input.length > 100) complexity += 1;
        if (input.length > 500) complexity += 2;

        // Keyword complexity
        const complexKeywords =
            /analyze|create|generate|build|integrate|workflow|plan/i;
        if (complexKeywords.test(input)) complexity += 2;

        // Multiple actions
        const actionKeywords = /and|then|after|before|while|until/i;
        if (actionKeywords.test(input)) complexity += 1;

        return complexity;
    }
}

// =============================================================================
// 🎯 3. STRATEGY EXECUTOR INTEGRADO
// =============================================================================

/**
 * 🚀 Executor Integrado de Estratégias
 * Gerencia todo o ciclo de vida da execução
 */
class StrategyExecutor {
    private logger = createLogger('strategy-executor');
    private promptManager = new StrategyPromptManager();
    private contextManager = new StrategyContextManager();

    constructor(private llmAdapter: LLMAdapter) {}

    /**
     * Executa estratégia com ReAct
     */
    async executeWithReAct(
        input: string,
        agentContext: AgentContext,
        tools: Tool[],
    ): Promise<ExecutionResult> {
        this.logger.info('🎯 Executing with ReAct strategy', {
            agentName: agentContext.agentName,
            inputLength: input.length,
            toolsCount: tools.length,
        });

        // 1. Criar context de execução
        const context = await this.contextManager.createExecutionContext(
            input,
            agentContext,
            tools,
            { strategy: 'react' },
        );

        // 2. Obter prompts específicos
        const prompts = this.promptManager.getReActPrompts();

        // 3. Criar estratégia
        const strategy = StrategyFactory.create('react', this.llmAdapter, {
            maxIterations: 10,
            maxToolCalls: 20,
        });

        // 4. Configurar stop conditions
        const stopConditions = createStopConditions.react({
            maxTurns: 10,
            maxToolCalls: 20,
            maxTimeMs: 300000,
        });

        // 5. Executar estratégia
        const result = await strategy.execute(context);

        this.logger.info('✅ ReAct execution completed', {
            success: result.success,
            steps: result.steps.length,
            executionTime: result.executionTime,
        });

        return result;
    }

    /**
     * Executa estratégia com ReWoo
     */
    async executeWithReWoo(
        input: string,
        agentContext: AgentContext,
        tools: Tool[],
    ): Promise<ExecutionResult> {
        this.logger.info('🎯 Executing with ReWoo strategy', {
            agentName: agentContext.agentName,
            inputLength: input.length,
            toolsCount: tools.length,
        });

        // 1. Criar context de execução
        const context = await this.contextManager.createExecutionContext(
            input,
            agentContext,
            tools,
            { strategy: 'rewoo' },
        );

        // 2. Obter prompts específicos
        const prompts = this.promptManager.getReWooPrompts();

        // 3. Criar estratégia
        const strategy = StrategyFactory.create('rewoo', this.llmAdapter, {
            maxIterations: 15,
            maxToolCalls: 30,
        });

        // 4. Configurar stop conditions
        const stopConditions = createStopConditions.rewoo({
            maxPlanSteps: 15,
            maxToolCalls: 30,
            maxTimeMs: 300000,
        });

        // 5. Executar estratégia
        const result = await strategy.execute(context);

        this.logger.info('✅ ReWoo execution completed', {
            success: result.success,
            steps: result.steps.length,
            executionTime: result.executionTime,
        });

        return result;
    }

    /**
     * Escolhe estratégia automaticamente baseada na complexidade
     */
    async executeAuto(
        input: string,
        agentContext: AgentContext,
        tools: Tool[],
    ): Promise<ExecutionResult> {
        // Calcular complexidade para decidir estratégia
        const context = await this.contextManager.createExecutionContext(
            input,
            agentContext,
            tools,
        );

        const complexity = context.metadata.complexity;

        this.logger.info('🤖 Auto-selecting strategy', {
            complexity,
            agentName: agentContext.agentName,
        });

        // Estratégia baseada em complexidade
        if (complexity >= 5) {
            // Tarefas complexas → ReWoo (planejamento estruturado)
            return this.executeWithReWoo(input, agentContext, tools);
        } else {
            // Tarefas simples → ReAct (iterativo e adaptativo)
            return this.executeWithReAct(input, agentContext, tools);
        }
    }
}

// =============================================================================
// 🎯 4. EXEMPLO DE USO COMPLETO
// =============================================================================

/**
 * 📚 Exemplos de como usar as estratégias
 */
export class StrategyUsageExamples {
    private executor: StrategyExecutor;

    constructor(llmAdapter: LLMAdapter) {
        this.executor = new StrategyExecutor(llmAdapter);
    }

    /**
     * Exemplo 1: Tarefa Simples → ReAct
     */
    async exemploTarefaSimples() {
        const agentContext: AgentContext = {
            agentName: 'assistente-simples',
            sessionId: 'session-123',
            correlationId: 'corr-456',
            tenantId: 'tenant-789',
        };

        const tools: Tool[] = [
            {
                name: 'search_database',
                description: 'Busca informações no banco de dados',
                parameters: { query: 'string' },
            },
        ];

        const result = await this.executor.executeWithReAct(
            'Encontre o email do usuário João Silva',
            agentContext,
            tools,
        );

        console.log('Resultado ReAct:', result.output);
    }

    /**
     * Exemplo 2: Tarefa Complexa → ReWoo
     */
    async exemploTarefaComplexa() {
        const agentContext: AgentContext = {
            agentName: 'analista-avancado',
            sessionId: 'session-789',
            correlationId: 'corr-101',
            tenantId: 'tenant-202',
        };

        const tools: Tool[] = [
            {
                name: 'analyze_data',
                description: 'Analisa conjunto de dados',
                parameters: { dataset: 'string', filters: 'object' },
            },
            {
                name: 'generate_report',
                description: 'Gera relatório baseado em análise',
                parameters: { analysis: 'object', format: 'string' },
            },
            {
                name: 'send_notification',
                description: 'Envia notificação por email',
                parameters: {
                    to: 'string',
                    subject: 'string',
                    content: 'string',
                },
            },
        ];

        const result = await this.executor.executeWithReWoo(
            'Analise as vendas do último trimestre, gere um relatório e envie para o gerente',
            agentContext,
            tools,
        );

        console.log('Resultado ReWoo:', result.output);
    }

    /**
     * Exemplo 3: Escolha Automática de Estratégia
     */
    async exemploAutoSelecao() {
        const agentContext: AgentContext = {
            agentName: 'assistente-inteligente',
            sessionId: 'session-auto',
            correlationId: 'corr-auto',
            tenantId: 'tenant-demo',
        };

        const tools: Tool[] = [
            { name: 'calculator', description: 'Calculadora básica' },
            { name: 'search_web', description: 'Busca na web' },
        ];

        // Estratégia será escolhida automaticamente baseada na complexidade
        const result = await this.executor.executeAuto(
            'Calcule 15% de desconto sobre R$ 1000',
            agentContext,
            tools,
        );

        console.log('Resultado Auto:', result.output);
    }
}

// =============================================================================
// 🎯 5. MELHORES PRÁTICAS E RECOMENDAÇÕES
// =============================================================================

/**
 * 📋 Guia de Melhores Práticas para Strategies
 */
export const StrategyBestPractices = {
    /**
     * Quando usar ReAct vs ReWoo
     */
    strategySelection: {
        useReAct: [
            'Tarefas simples e diretas',
            'Quando você precisa de adaptabilidade',
            'Cenários exploratórios',
            'Interação com usuário necessária',
            'Poucos tools disponíveis',
        ],
        useReWoo: [
            'Tarefas complexas e estruturadas',
            'Múltiplas ferramentas independentes',
            'Processos bem definidos',
            'Execução paralela possível',
            'Cenários de produção',
        ],
    },

    /**
     * Organização de Prompts
     */
    promptOrganization: {
        principles: [
            'Separe prompts por estratégia',
            'Mantenha contexto específico',
            'Use templates para reusabilidade',
            'Inclua exemplos claros',
            'Documente constraints e regras',
        ],
        structure: `
prompts/
├── react/
│   ├── system-prompt.ts
│   ├── user-templates.ts
│   └── examples.ts
├── rewoo/
│   ├── planner-prompts.ts
│   ├── executor-prompts.ts
│   └── organizer-prompts.ts
└── shared/
    ├── context-formatters.ts
    └── validation-rules.ts
        `,
    },

    /**
     * Integração com Context Runtime
     */
    contextIntegration: {
        required: [
            'Agent Context (nome, sessão, tenant)',
            'Tool Registry (ferramentas disponíveis)',
            'History (passos anteriores)',
            'Configuration (limites e regras)',
            'Runtime State (kernel, memory)',
        ],
        enrichment: [
            'Adicionar métricas de performance',
            'Incluir estado do kernel',
            'Carregar contexto de memória',
            'Validar permissões',
            'Configurar observabilidade',
        ],
    },

    /**
     * Tratamento de Erros
     */
    errorHandling: {
        strategy: [
            'Validar inputs antes da execução',
            'Implementar timeouts apropriados',
            'Log detalhado de falhas',
            'Fallback para estratégias alternativas',
            'Retry com parâmetros ajustados',
        ],
        recovery: [
            'Salvar estado antes de falhas',
            'Permitir continuação de execuções',
            'Manter histórico de tentativas',
            'Alertar sobre falhas críticas',
        ],
    },
};

/**
 * 🚀 Como executar os exemplos
 */
export async function runStrategyExamples() {
    console.log('🚀 Executando exemplos de Strategies...\n');

    // Aqui você criaria o LLM Adapter real
    // const llmAdapter = createLLMAdapter(provider);
    // const examples = new StrategyUsageExamples(llmAdapter);

    // await examples.exemploTarefaSimples();
    // await examples.exemploTarefaComplexa();
    // await examples.exemploAutoSelecao();

    console.log('✅ Exemplos executados com sucesso!');
}

// =============================================================================
// 🎯 6. RESUMO DA MUDANÇA DE ARQUITETURA
// =============================================================================

/**
 * 📊 Resumo: Planning → Strategies
 *
 * ANTES (Planning Layer):
 * - Tudo misturado em PlannerHandler
 * - Prompts hardcoded no PlannerPromptComposer
 * - Context limitado
 * - Difícil reutilizar estratégias
 *
 * AGORA (Strategies Layer):
 * ✅ Separação clara de responsabilidades
 * ✅ Strategies reutilizáveis e testáveis
 * ✅ Prompts organizados por estratégia
 * ✅ Context runtime enriquecido
 * ✅ Factory pattern para criação
 * ✅ Stop conditions configuráveis
 * ✅ Melhor observabilidade
 *
 * MIGRAÇÃO RECOMENDADA:
 * 1. Mantenha PlannerHandler para coordenação
 * 2. Migre lógica de prompts para StrategyPromptManager
 * 3. Use StrategyContextManager para context
 * 4. Implemente StrategyExecutor como facade
 * 5. Gradualmente substitua chamadas antigas
 */

export default {
    StrategyPromptManager,
    StrategyContextManager,
    StrategyExecutor,
    StrategyUsageExamples,
    StrategyBestPractices,
};
