/**
 * 📝 GUIA COMPLETO: Como Organizar Prompts por Estratégia
 *
 * Este arquivo demonstra a organização CORRETA de prompts para:
 * - ReAct Strategy (Reasoning + Acting)
 * - ReWoo Strategy (Reasoning Without Observation)
 */

import { StrategyExecutionContext } from '../src/engine/strategies/index.js';

// =============================================================================
// 🎯 ESTRUTURA RECOMENDADA PARA PROMPTS
// =============================================================================

/**
 * 📁 Estrutura de arquivos recomendada:
 *
 * src/engine/strategies/prompts/
 * ├── react/
 * │   ├── system-prompt.ts
 * │   ├── user-templates.ts
 * │   ├── examples.ts
 * │   └── validation.ts
 * ├── rewoo/
 * │   ├── planner-prompts.ts
 * │   ├── executor-prompts.ts
 * │   ├── organizer-prompts.ts
 * │   └── examples.ts
 * └── shared/
 *     ├── context-formatters.ts
 *     ├── tool-descriptions.ts
 *     └── validation-rules.ts
 */

// =============================================================================
// 🔄 REACT STRATEGY PROMPTS
// =============================================================================

/**
 * 🎯 ReAct: Prompts para estratégia iterativa
 * Padrão: Think → Act → Observe → Repeat
 */
export const ReActPrompts = {
    /**
     * System Prompt Base para ReAct
     * Define o comportamento geral da estratégia
     */
    systemPrompt: `
Você é um agente inteligente que usa o padrão ReAct (Reasoning + Acting).

SEU PROCESSO DEVE SER:

1. **OBSERVAR** o contexto atual e entrada do usuário
2. **PENSAR** sobre qual é a melhor ação a tomar
3. **AGIR** executando a ação escolhida
4. **OBSERVAR** o resultado da ação
5. **REPETIR** o ciclo até alcançar o objetivo

REGRAS IMPORTANTES:
- Seja conciso mas completo em suas reflexões
- Sempre explique seu raciocínio antes de agir
- Use ferramentas apenas quando necessário
- Pare quando alcançar o objetivo ou resposta final
- Admita quando não souber algo

FORMATO DE RESPOSTA:
Pensamento: [Sua análise e raciocínio]
Ação: [Nome da ferramenta ou "final_answer"]
Parâmetros: [Se aplicável, em JSON]
    `.trim(),

    /**
     * Template para prompts específicos de tarefa
     */
    userTaskTemplate: (context: StrategyExecutionContext) =>
        `
## CONTEXTO DA TAREFA
**Objetivo:** ${context.input}

## FERRAMENTAS DISPONÍVEIS
${context.tools
    .map(
        (tool, index) =>
            `${index + 1}. **${tool.name}**
   - Descrição: ${tool.description}
   - Parâmetros: ${formatToolParameters(tool)}`,
    )
    .join('\n')}

## CONTEXTO ADICIONAL
${formatAgentContext(context.agentContext)}

## HISTÓRICO DE EXECUÇÃO
${
    context.history.length > 0
        ? context.history
              .map(
                  (step, i) =>
                      `**Passo ${i + 1}:** ${step.type.toUpperCase()}
        ${step.thought ? `- Pensamento: ${step.thought.reasoning}` : ''}
        ${step.action ? `- Ação: ${step.action.type}` : ''}
        ${step.result ? `- Resultado: ${JSON.stringify(step.result.content)}` : ''}`,
              )
              .join('\n\n')
        : 'Nenhum passo executado ainda.'
}

## SUA VEZ
Analise a situação atual e decida qual é a próxima ação mais apropriada.

Lembre-se:
- Use ferramentas apenas quando necessário
- Seja específico nos parâmetros
- Foque no objetivo principal
- Pare quando tiver a resposta final

Qual é sua próxima ação?
    `.trim(),

    /**
     * Prompt para reflexão intermediária
     */
    intermediateReflectionPrompt: `
Com base no resultado da ação anterior, reflita sobre:

1. **O que foi aprendido?** (dados novos, insights)
2. **O progresso feito** (quão perto estamos do objetivo)
3. **Próximos passos necessários** (ações adicionais)
4. **Se devemos continuar** (mais ações ou resposta final)

Seja objetivo e focado nos fatos observados.
    `.trim(),

    /**
     * Prompt para decisão de parada
     */
    finalDecisionPrompt: `
Avalie se você tem informações suficientes para fornecer uma resposta final:

✅ **SUFICIENTE se:**
- Você tem todos os dados necessários
- O objetivo foi claramente alcançado
- Não há mais ações produtivas a tomar

❌ **INSUFICIENTE se:**
- Ainda falta informação importante
- Mais dados são necessários para completar a tarefa
- Há passos óbvios que ainda não foram executados

Decida: Continuar explorando ou fornecer resposta final?
    `.trim(),
};

// =============================================================================
// 🏗️ REWOO STRATEGY PROMPTS
// =============================================================================

/**
 * 🎯 ReWoo: Prompts para estratégia estruturada
 * Padrão: Plan → Execute → Synthesize
 */
export const ReWooPrompts = {
    /**
     * PLANNER: Cria o plano estratégico
     */
    plannerSystemPrompt: `
Você é o PLANEJADOR em uma estratégia ReWoo (Reasoning Without Observation).

Sua tarefa é DECOMPOR problemas complexos em passos independentes executáveis.

PROCESSO:
1. **ANALISAR** o objetivo geral
2. **DECOMPOR** em sub-tarefas independentes
3. **IDENTIFICAR** ferramentas necessárias para cada sub-tarefa
4. **DEFINIR** parâmetros e dependências
5. **CRIAR** plano estruturado

REGRAS IMPORTANTES:
- Cada passo deve ser INDEPENDENTE quando possível
- Use ferramentas apropriadas para cada tarefa
- Defina parâmetros específicos e realistas
- Considere dependências entre passos
- Mantenha passos concisos e focados

NÃO EXECUTE ações, apenas PLANEJE!
    `.trim(),

    /**
     * Template para planejamento
     */
    plannerTaskTemplate: (context: StrategyExecutionContext) =>
        `
## OBJETIVO GERAL
${context.input}

## FERRAMENTAS DISPONÍVEIS
${context.tools
    .map(
        (tool, index) =>
            `${index + 1}. **${tool.name}**
   - Descrição: ${tool.description}
   - Parâmetros: ${formatToolParameters(tool)}`,
    )
    .join('\n')}

## CONTEXTO ATUAL
${formatAgentContext(context.agentContext)}

## TAREFAS DE PLANEJAMENTO

1. **Análise do Objetivo**
   - Que resultado final é esperado?
   - Quais informações são necessárias?
   - Que restrições existem?

2. **Decomposição em Passos**
   - Identifique sub-tarefas independentes
   - Agrupe tarefas relacionadas
   - Considere execução paralela quando possível

3. **Atribuição de Ferramentas**
   - Para cada sub-tarefa, qual ferramenta usar?
   - Quais parâmetros são necessários?
   - Como os resultados serão usados?

4. **Dependências e Ordem**
   - Que passos dependem de outros?
   - Qual é a ordem lógica de execução?
   - Há paralelização possível?

CRIE UM PLANO DETALHADO seguindo este formato:

**PLANO ESTRUTURADO:**
1. **Passo 1: [Nome descritivo]**
   - Ferramenta: [nome_da_ferramenta]
   - Parâmetros: [JSON específico]
   - Dependências: [nenhuma | passo X, passo Y]

2. **Passo 2: [Nome descritivo]**
   - Ferramenta: [nome_da_ferramenta]
   - Parâmetros: [JSON específico]
   - Dependências: [passo 1]
    `.trim(),

    /**
     * EXECUTOR: Executa passos individuais
     */
    executorSystemPrompt: `
Você é o EXECUTOR em ReWoo.

Sua tarefa é EXECUTAR passos individuais do plano usando ferramentas específicas.

PROCESSO:
1. **RECEBER** instruções específicas de um passo
2. **VALIDAR** que tem todos os parâmetros necessários
3. **EXECUTAR** a ferramenta apropriada
4. **RETORNAR** apenas o resultado da execução

REGRAS IMPORTANTES:
- Execute apenas o passo solicitado
- Use exatamente os parâmetros fornecidos
- Não faça interpretação adicional
- Retorne apenas dados objetivos
- Foque na execução precisa
    `.trim(),

    /**
     * Template para execução de passo
     */
    executorStepTemplate: (step: any, context: StrategyExecutionContext) =>
        `
## PASSO A EXECUTAR
**Nome:** ${step.name}
**Ferramenta:** ${step.tool}
**Parâmetros:** ${JSON.stringify(step.parameters, null, 2)}

## CONTEXTO DE EXECUÇÃO
${formatAgentContext(context.agentContext)}

## TAREFAS DO EXECUTOR

1. **Validar Parâmetros**
   - Todos os parâmetros obrigatórios estão presentes?
   - Os valores fazem sentido para a ferramenta?
   - Há alguma inconsistência?

2. **Preparar Execução**
   - Formatar parâmetros corretamente
   - Considerar contexto adicional se necessário
   - Preparar para possíveis erros

3. **Executar Ferramenta**
   - Use a ferramenta especificada
   - Passe os parâmetros corretos
   - Capture o resultado completo

EXECUTE apenas este passo e retorne o resultado.
    `.trim(),

    /**
     * ORGANIZER: Sintetiza resultados finais
     */
    organizerSystemPrompt: `
Você é o ORGANIZADOR FINAL em ReWoo.

Sua tarefa é SINTETIZAR todos os resultados em uma resposta coerente para o usuário.

PROCESSO:
1. **RECEBER** resultados de todos os passos executados
2. **ANALISAR** dados coletados de cada ferramenta
3. **SINTETIZAR** informação relevante em resposta clara
4. **CITAR** fontes quando apropriado

REGRAS IMPORTANTES:
- Use apenas dados dos resultados fornecidos
- Não invente ou assuma informações
- Seja claro e objetivo na resposta
- Cite fontes quando usar dados específicos
- Foque no objetivo original do usuário
    `.trim(),

    /**
     * Template para síntese final
     */
    organizerSynthesisTemplate: (goal: string, results: any[]) =>
        `
## OBJETIVO ORIGINAL
${goal}

## RESULTADOS EXECUTADOS
${results
    .map(
        (result, index) =>
            `**Resultado ${index + 1}: ${result.stepName}**
   - Ferramenta usada: ${result.toolName}
   - Dados retornados: ${JSON.stringify(result.data, null, 2)}
   - Status: ${result.success ? 'Sucesso' : 'Falhou'}
   ${result.error ? `- Erro: ${result.error}` : ''}`,
    )
    .join('\n\n')}

## TAREFAS DE SÍNTESE

1. **Análise dos Dados**
   - Que informações foram coletadas?
   - Há inconsistências ou gaps?
   - Todos os dados necessários estão presentes?

2. **Síntese da Resposta**
   - Combine informações relevantes
   - Foque no objetivo do usuário
   - Seja claro e direto

3. **Formatação Final**
   - Estruture de forma lógica
   - Use citações quando apropriado
   - Forneça resposta completa

BASEADO APENAS nos resultados acima, forneça uma resposta final clara e objetiva.
    `.trim(),
};

// =============================================================================
// 🔧 UTILITÁRIOS PARA FORMATAÇÃO
// =============================================================================

/**
 * Formatar parâmetros de ferramenta para display
 */
function formatToolParameters(tool: any): string {
    if (!tool.parameters?.properties) {
        return 'Nenhum parâmetro específico';
    }

    const params = Object.entries(tool.parameters.properties)
        .map(([name, config]: [string, any]) => {
            const required = tool.parameters?.required?.includes(name)
                ? ' (obrigatório)'
                : ' (opcional)';
            const type = config.type || 'unknown';
            const desc = config.description ? ` - ${config.description}` : '';
            return `${name}: ${type}${required}${desc}`;
        })
        .join(', ');

    return params || 'Parâmetros dinâmicos';
}

/**
 * Formatar contexto do agente para display
 */
function formatAgentContext(agentContext: any): string {
    if (!agentContext) return 'Nenhum contexto adicional';

    const contextParts = [];

    if (agentContext.agentName) {
        contextParts.push(`**Agente:** ${agentContext.agentName}`);
    }

    if (agentContext.sessionId) {
        contextParts.push(`**Sessão:** ${agentContext.sessionId}`);
    }

    if (agentContext.correlationId) {
        contextParts.push(`**Correlação:** ${agentContext.correlationId}`);
    }

    if (agentContext.tenantId) {
        contextParts.push(`**Tenant:** ${agentContext.tenantId}`);
    }

    // Adicionar dados runtime se disponíveis
    if (agentContext.runtime) {
        const runtime = agentContext.runtime;
        if (runtime.kernelState) {
            contextParts.push(`**Estado do Kernel:** ${runtime.kernelState}`);
        }
        if (runtime.memorySize) {
            contextParts.push(`**Memória:** ${runtime.memorySize} itens`);
        }
    }

    return contextParts.join('\n');
}

// =============================================================================
// 🎯 EXEMPLOS PRÁTICOS DE USO
// =============================================================================

/**
 * Exemplos de como usar os prompts organizados
 */
export const PromptUsageExamples = {
    /**
     * Exemplo completo: ReAct para tarefa simples
     */
    reactSimpleTask: (context: StrategyExecutionContext) => ({
        systemPrompt: ReActPrompts.systemPrompt,
        userPrompt: ReActPrompts.userTaskTemplate(context),
        metadata: {
            strategy: 'react',
            complexity: context.metadata.complexity,
            expectedSteps: Math.min(context.metadata.complexity + 1, 5),
        },
    }),

    /**
     * Exemplo completo: ReWoo para tarefa complexa
     */
    rewooComplexTask: (context: StrategyExecutionContext) => ({
        planner: {
            systemPrompt: ReWooPrompts.plannerSystemPrompt,
            userPrompt: ReWooPrompts.plannerTaskTemplate(context),
        },
        executor: {
            systemPrompt: ReWooPrompts.executorSystemPrompt,
            stepTemplate: ReWooPrompts.executorStepTemplate,
        },
        organizer: {
            systemPrompt: ReWooPrompts.organizerSystemPrompt,
            synthesisTemplate: ReWooPrompts.organizerSynthesisTemplate,
        },
        metadata: {
            strategy: 'rewoo',
            complexity: context.metadata.complexity,
            expectedSteps: Math.max(context.metadata.complexity * 2, 3),
        },
    }),

    /**
     * Estratégia de seleção automática baseada na complexidade
     */
    autoSelectStrategy: (context: StrategyExecutionContext) => {
        const complexity = context.metadata.complexity;

        if (complexity >= 5) {
            return PromptUsageExamples.rewooComplexTask(context);
        } else {
            return PromptUsageExamples.reactSimpleTask(context);
        }
    },
};

// =============================================================================
// 📊 MÉTRICAS E VALIDAÇÃO
// =============================================================================

/**
 * Validação de prompts por estratégia
 */
export const PromptValidation = {
    /**
     * Validar prompt ReAct
     */
    validateReActPrompt: (prompts: any) => {
        const errors = [];

        if (!prompts.systemPrompt?.includes('ReAct')) {
            errors.push('System prompt deve mencionar ReAct');
        }

        if (!prompts.userPrompt?.includes('Pensamento:')) {
            errors.push('User prompt deve incluir formato de pensamento');
        }

        if (!prompts.userPrompt?.includes('Ação:')) {
            errors.push('User prompt deve incluir formato de ação');
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    },

    /**
     * Validar prompt ReWoo
     */
    validateReWooPrompt: (prompts: any) => {
        const errors = [];

        if (!prompts.planner?.systemPrompt?.includes('PLANEJADOR')) {
            errors.push('Planner deve ser identificado como PLANEJADOR');
        }

        if (!prompts.executor?.systemPrompt?.includes('EXECUTOR')) {
            errors.push('Executor deve ser identificado como EXECUTOR');
        }

        if (!prompts.organizer?.systemPrompt?.includes('ORGANIZADOR')) {
            errors.push('Organizer deve ser identificado como ORGANIZADOR');
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    },

    /**
     * Métricas de qualidade do prompt
     */
    calculatePromptMetrics: (prompt: string) => {
        return {
            length: prompt.length,
            lines: prompt.split('\n').length,
            hasExamples: prompt.includes('Exemplo'),
            hasRules: prompt.includes('REGRAS') || prompt.includes('RULES'),
            hasStructure: prompt.includes('## ') || prompt.includes('### '),
            clarityScore: calculateClarityScore(prompt),
        };
    },
};

/**
 * Calcular score de clareza do prompt
 */
function calculateClarityScore(prompt: string): number {
    let score = 0;

    // Penalizar prompts muito longos
    if (prompt.length < 500) score += 2;
    else if (prompt.length < 1000) score += 1;

    // Premiar estrutura clara
    if (prompt.includes('## ')) score += 1;
    if (prompt.includes('### ')) score += 1;

    // Premiar exemplos
    if (prompt.includes('Exemplo')) score += 1;

    // Premiar regras claras
    if (prompt.includes('REGRAS') || prompt.includes('RULES')) score += 1;

    // Premiar formatação consistente
    const lines = prompt.split('\n');
    const hasConsistentFormatting = lines.every(
        (line) =>
            line.startsWith('## ') ||
            line.startsWith('### ') ||
            line.startsWith('- ') ||
            !line.trim().startsWith('#'),
    );
    if (hasConsistentFormatting) score += 1;

    return Math.min(score, 5); // Máximo 5 pontos
}

// =============================================================================
// 🎯 RESUMO E RECOMENDAÇÕES
// =============================================================================

/**
 * 📋 Guia Rápido para Organização de Prompts
 */
export const PromptOrganizationGuide = {
    /**
     * Estrutura recomendada por estratégia
     */
    structure: {
        react: {
            'system-prompt.ts': 'Prompt base que define o comportamento ReAct',
            'user-templates.ts': 'Templates para diferentes tipos de tarefa',
            'examples.ts': 'Exemplos de uso bem-sucedidos',
            'validation.ts': 'Regras de validação específicas',
        },
        rewoo: {
            'planner-prompts.ts': 'Prompts para fase de planejamento',
            'executor-prompts.ts': 'Prompts para execução de passos',
            'organizer-prompts.ts': 'Prompts para síntese final',
            'examples.ts': 'Exemplos de planos complexos',
        },
    },

    /**
     * Princípios de organização
     */
    principles: [
        '✅ Separe prompts por estratégia',
        '✅ Use templates parametrizáveis',
        '✅ Inclua exemplos claros',
        '✅ Documente constraints',
        '✅ Valide estrutura dos prompts',
        '✅ Mantenha consistência de formato',
        '✅ Permita personalização por contexto',
    ],

    /**
     * Benefícios da organização
     */
    benefits: [
        '🔧 Manutenibilidade: Fácil modificar prompts específicos',
        '🎯 Reutilização: Templates para diferentes contextos',
        '📊 Testabilidade: Validação automática de estrutura',
        '🚀 Performance: Cache inteligente de prompts',
        '👥 Colaboração: Estrutura clara para equipe',
        '🔍 Debugging: Rastreamento fácil de problemas',
    ],
};

export default {
    ReActPrompts,
    ReWooPrompts,
    PromptUsageExamples,
    PromptValidation,
    PromptOrganizationGuide,
};
