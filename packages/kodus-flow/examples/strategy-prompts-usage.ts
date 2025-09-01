/**
 * 🎯 EXEMPLO DE USO: Strategy Prompts Funcionais
 *
 * Demonstra como usar os novos prompts funcionais
 * que substituem os prompts comentados no ReWoo Strategy.
 */

import {
    StrategyPromptFactory,
    Tool,
    AgentContext,
    RewooEvidenceItem,
} from '../src/engine/strategies/index.js';

// =============================================================================
// 📝 EXEMPLO 1: USANDO REWOO PROMPTS FUNCIONAIS
// =============================================================================

/**
 * Exemplo completo de uso dos prompts ReWoo funcionais
 */
function exemploReWooPromptsFuncionais() {
    console.log('🎯 Exemplo ReWoo Prompts Funcionais\n');

    const promptFactory = new StrategyPromptFactory();

    // Contexto de exemplo
    const agentContext: AgentContext = {
        agentName: 'analista-rewoo',
        sessionId: 'session-rewoo-123',
        correlationId: 'corr-rewoo-456',
        tenantId: 'tenant-demo',
    };

    const tools: Tool[] = [
        {
            name: 'search_database',
            description: 'Busca dados no banco de dados',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Consulta SQL' },
                    limit: { type: 'number', default: 100 },
                },
                required: ['query'],
            },
        },
        {
            name: 'generate_report',
            description: 'Gera relatório baseado em dados',
            parameters: {
                type: 'object',
                properties: {
                    data: { type: 'array', items: { type: 'object' } },
                    format: { type: 'string', enum: ['pdf', 'excel'] },
                },
                required: ['data'],
            },
        },
    ];

    // === 1. PLANNER PROMPT ===
    console.log('📋 1. PLANNER PROMPT');
    const plannerPrompt = promptFactory.createReWooPrompt({
        goal: 'Analise as vendas do último trimestre e gere um relatório',
        tools,
        agentContext,
        mode: 'planner',
    });

    console.log('System Prompt:');
    console.log(plannerPrompt.systemPrompt.substring(0, 100) + '...\n');
    console.log('User Prompt:');
    console.log(plannerPrompt.userPrompt.substring(0, 200) + '...\n');

    // === 2. ORGANIZER PROMPT ===
    console.log('📋 2. ORGANIZER PROMPT');
    const evidences: RewooEvidenceItem[] = [
        {
            id: 'E1',
            sketchId: 'S1',
            toolName: 'search_database',
            input: { query: 'SELECT * FROM vendas WHERE trimestre = 4' },
            output: [
                { produto: 'Produto A', vendas: 15000 },
                { produto: 'Produto B', vendas: 22000 },
            ],
            latencyMs: 250,
        },
        {
            id: 'E2',
            sketchId: 'S2',
            toolName: 'generate_report',
            input: { data: [], format: 'pdf' },
            output: { reportUrl: 'report-123.pdf' },
            latencyMs: 500,
        },
    ];

    const organizerPrompt = promptFactory.createReWooPrompt({
        goal: 'Analise as vendas do último trimestre e gere um relatório',
        tools: [],
        agentContext,
        evidences,
        mode: 'organizer',
    });

    console.log('System Prompt:');
    console.log(organizerPrompt.systemPrompt.substring(0, 100) + '...\n');
    console.log('User Prompt:');
    console.log(organizerPrompt.userPrompt.substring(0, 200) + '...\n');

    // === 3. EXECUTOR PROMPT ===
    console.log('📋 3. EXECUTOR PROMPT');
    const step = {
        id: 'step-1',
        description: 'Buscar dados de vendas',
        tool: 'search_database',
        parameters: { query: 'SELECT * FROM vendas', limit: 50 },
    };

    const executorPrompt = promptFactory.createReWooPrompt({
        goal: '',
        tools: [],
        agentContext,
        mode: 'executor',
        step,
    });

    console.log('System Prompt:');
    console.log(executorPrompt.systemPrompt.substring(0, 100) + '...\n');
    console.log('User Prompt:');
    console.log(executorPrompt.userPrompt.substring(0, 150) + '...\n');
}

// =============================================================================
// 🔄 EXEMPLO 2: USANDO REACT PROMPTS FUNCIONAIS
// =============================================================================

/**
 * Exemplo de uso dos prompts ReAct funcionais
 */
function exemploReActPromptsFuncionais() {
    console.log('🔄 Exemplo ReAct Prompts Funcionais\n');

    const promptFactory = new StrategyPromptFactory();

    const agentContext: AgentContext = {
        agentName: 'assistente-react',
        sessionId: 'session-react-789',
        correlationId: 'corr-react-101',
        tenantId: 'tenant-demo',
    };

    const tools: Tool[] = [
        {
            name: 'calculator',
            description: 'Calculadora básica',
            parameters: {
                type: 'object',
                properties: {
                    expression: {
                        type: 'string',
                        description: 'Expressão matemática',
                    },
                },
                required: ['expression'],
            },
        },
    ];

    // Prompt completo para ReAct
    const reactPrompt = promptFactory.createReActPrompt({
        input: 'Calcule quanto é 15% de desconto sobre R$ 1000',
        tools,
        agentContext,
        history: [
            {
                type: 'think',
                thought: {
                    reasoning: 'Preciso calcular 15% de 1000',
                    action: { type: 'tool_call', toolName: 'calculator' },
                },
                action: { type: 'tool_call', toolName: 'calculator' },
                result: {
                    type: 'tool_result',
                    content: { result: 150 },
                    metadata: { toolName: 'calculator' },
                },
            },
        ],
    });

    console.log('System Prompt:');
    console.log(reactPrompt.systemPrompt.substring(0, 100) + '...\n');
    console.log('User Prompt:');
    console.log(reactPrompt.userPrompt.substring(0, 300) + '...\n');
}

// =============================================================================
// 🤖 EXEMPLO 3: INTEGRAÇÃO COM REWOO STRATEGY
// =============================================================================

/**
 * Exemplo mostrando como o ReWoo Strategy agora usa os prompts funcionais
 */
function exemploIntegracaoReWooStrategy() {
    console.log('🤖 Exemplo Integração com ReWoo Strategy\n');

    // Este é o código que agora funciona no ReWoo Strategy
    console.log('Código funcional no ReWoo Strategy:');
    console.log(`
private getPlannerPrompts(goal: string, tools: Tool[], agentContext: AgentContext) {
    return this.promptFactory.createReWooPrompt({
        goal,
        tools,
        agentContext,
        mode: 'planner'
    });
}

private getOrganizerPrompts(goal: string, evidences: RewooEvidenceItem[]) {
    return this.promptFactory.createReWooPrompt({
        goal,
        tools: [], // Não precisa de tools para organizer
        agentContext: {} as AgentContext, // Será preenchido pelo context
        evidences,
        mode: 'organizer'
    });
}

private getExecutorPrompts(step: any, context: Record<string, unknown>) {
    return this.promptFactory.createReWooPrompt({
        goal: '', // Não usado no executor
        tools: [], // Tools já foram selecionadas
        agentContext: context.agentContext as AgentContext || {} as AgentContext,
        mode: 'executor',
        step
    });
}
    `);

    console.log(
        '✅ Os prompts comentados foram substituídos por métodos funcionais!',
    );
    console.log('✅ Usa StrategyPromptFactory para composição inteligente');
    console.log('✅ Integra com os novos formatadores');
    console.log('✅ Pronto para produção\n');
}

// =============================================================================
// 📊 COMPARAÇÃO: ANTES vs DEPOIS
// =============================================================================

/**
 * Comparação entre os prompts antigos (comentados) e os novos funcionais
 */
function comparacaoAntesDepois() {
    console.log('📊 Comparação: Prompts Comentados vs Funcionais\n');

    console.log('❌ ANTES (Comentados):');
    console.log('```typescript');
    console.log('const SYSTEM_SKETCH = (tools: any[]) =>');
    console.log(
        '    `You are the PLANNER... [${tools.map(t => t.name).join(", ")}]`;',
    );
    console.log('```');
    console.log();

    console.log('✅ DEPOIS (Funcionais):');
    console.log('```typescript');
    console.log(
        'private getPlannerPrompts(goal: string, tools: Tool[], agentContext: AgentContext) {',
    );
    console.log('    return this.promptFactory.createReWooPrompt({');
    console.log('        goal,');
    console.log('        tools,');
    console.log('        agentContext,');
    console.log('        mode: "planner"');
    console.log('    });');
    console.log('}');
    console.log('```');
    console.log();

    console.log('🎯 VANTAGENS DOS NOVOS PROMPTS:');
    console.log('✅ Type-safe com TypeScript');
    console.log('✅ Formatadores inteligentes integrados');
    console.log('✅ Cache automático de performance');
    console.log('✅ Validação automática de estrutura');
    console.log('✅ Reutilização entre estratégias');
    console.log('✅ Manutenção centralizada');
    console.log('✅ Testabilidade melhorada');
}

// =============================================================================
// 🚀 EXECUÇÃO DOS EXEMPLOS
// =============================================================================

/**
 * Executa todos os exemplos
 */
export function runAllPromptExamples() {
    console.log('🚀 EXECUTANDO EXEMPLOS DE STRATEGY PROMPTS FUNCIONAIS\n');
    console.log('='.repeat(70));
    console.log();

    try {
        exemploReWooPromptsFuncionais();
        console.log('='.repeat(70));
        console.log();

        exemploReActPromptsFuncionais();
        console.log('='.repeat(70));
        console.log();

        exemploIntegracaoReWooStrategy();
        console.log('='.repeat(70));
        console.log();

        comparacaoAntesDepois();
        console.log('='.repeat(70));
        console.log();

        console.log('✅ TODOS OS EXEMPLOS EXECUTADOS COM SUCESSO!');
        console.log('🎉 Prompts funcionais estão prontos para uso!');
    } catch (error) {
        console.error('❌ ERRO na execução dos exemplos:', error);
    }
}

// =============================================================================
// 🎯 USO INDIVIDUAL
// =============================================================================

// Para executar apenas um exemplo específico:
// exemploReWooPromptsFuncionais();
// exemploReActPromptsFuncionais();
// exemploIntegracaoReWooStrategy();
// comparacaoAntesDepois();

// Para executar todos:
// runAllPromptExamples();

export {
    exemploReWooPromptsFuncionais,
    exemploReActPromptsFuncionais,
    exemploIntegracaoReWooStrategy,
    comparacaoAntesDepois,
    runAllPromptExamples,
};
