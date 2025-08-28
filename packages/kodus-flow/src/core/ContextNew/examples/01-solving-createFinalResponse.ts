/**
 * 🎯 EXEMPLO 1: RESOLVENDO O PROBLEMA createFinalResponse
 *
 * Este exemplo mostra como o ContextBridge resolve o problema principal:
 * Quando chegamos em createFinalResponse, não sabemos o que foi planejado,
 * executado, quais sucessos/falhas ocorreram, se é replan, etc.
 */

import type {
    ContextBridgeService,
    FinalResponseContext,
    ExecutionContextAggregate,
    RelevantMemoryContext,
    StateContextSummary,
} from '../index.js';

import type { PlannerExecutionContext } from '../../types/allTypes.js';

// ===============================================
// 🚨 PROBLEMA ATUAL - createFinalResponse sem contexto
// ===============================================

/**
 * PROBLEMA: Método createFinalResponse atual não tem contexto suficiente
 */
function createFinalResponseProblematic(
    plannerContext: PlannerExecutionContext,
) {
    // ❌ NÃO SABEMOS:
    // - O que foi planejado até agora?
    // - Quantos steps foram executados?
    // - Quais falharam? Quais tiveram sucesso?
    // - Se estamos em um replan? Por que replan?
    // - Qual o histórico de execuções anteriores?
    // - Que padrões de sucesso podemos aplicar?
    // - Qual contexto de memória é relevante?

    return {
        response: 'Não tenho contexto suficiente para uma resposta rica',
        reasoning: 'Contexto limitado',
        confidence: 0.3,
    };
}

// ===============================================
// ✅ SOLUÇÃO - ContextBridge com contexto completo
// ===============================================

/**
 * SOLUÇÃO: ContextBridge fornece contexto completo para createFinalResponse
 */
export class ExampleContextBridgeUsage {
    async demonstrateContextBridgePower(
        contextBridge: ContextBridgeService,
        plannerContext: PlannerExecutionContext,
    ) {
        console.log(
            '🎯 EXEMPLO: Resolvendo createFinalResponse com ContextBridge\n',
        );

        // ===== PASSO 1: Obter contexto completo =====
        const finalResponseContext =
            await contextBridge.buildFinalResponseContext(plannerContext);

        console.log('📊 CONTEXTO OBTIDO:');
        console.log(
            `- Execuções realizadas: ${finalResponseContext.executionSummary.totalExecutions}`,
        );
        console.log(
            `- Taxa de sucesso: ${finalResponseContext.executionSummary.successRate}%`,
        );
        console.log(
            `- Replans realizados: ${finalResponseContext.executionSummary.replanCount}`,
        );
        console.log(
            `- Contexto de memória: ${finalResponseContext.memoryContext.recentInteractions.length} interações`,
        );

        // ===== PASSO 2: Análise do contexto de execução =====
        const executionContext = finalResponseContext.executionContext;

        if (executionContext.currentExecution) {
            console.log('\n⚡ EXECUÇÃO ATUAL:');
            console.log(
                `- Plan ID: ${executionContext.currentExecution.planId}`,
            );
            console.log(
                `- Status: ${executionContext.currentExecution.status}`,
            );
            console.log(
                `- Steps completados: ${executionContext.stepRegistry.completedSteps.length}`,
            );
            console.log(
                `- Steps falharam: ${executionContext.stepRegistry.failedSteps.length}`,
            );
        }

        // ===== PASSO 3: Análise de replan =====
        if (executionContext.replanContext) {
            console.log('\n🔄 CONTEXTO DE REPLAN:');
            console.log(`- Razão: ${executionContext.replanContext.reason}`);
            console.log(
                `- Tentativa: ${executionContext.replanContext.attemptCount}`,
            );
            console.log(
                `- Estratégia: ${executionContext.replanContext.strategy}`,
            );
        }

        // ===== PASSO 4: Padrões de sucesso identificados =====
        if (executionContext.successPatterns.length > 0) {
            console.log('\n✅ PADRÕES DE SUCESSO IDENTIFICADOS:');
            executionContext.successPatterns.forEach((pattern) => {
                console.log(
                    `- ${pattern.description} (taxa: ${pattern.successRate}%)`,
                );
            });
        }

        // ===== PASSO 5: Análise de falhas =====
        if (executionContext.failureAnalysis) {
            console.log('\n❌ ANÁLISE DE FALHAS:');
            console.log(
                `- Falhas comuns: ${executionContext.failureAnalysis.commonFailures.length}`,
            );
            console.log(
                `- Taxa de recuperação: ${executionContext.failureAnalysis.recoveryRate}%`,
            );
        }

        // ===== PASSO 6: Contexto de memória relevante =====
        const memoryContext = finalResponseContext.memoryContext;

        console.log('\n🧠 CONTEXTO DE MEMÓRIA:');
        console.log(
            `- Interações recentes: ${memoryContext.recentInteractions.length}`,
        );
        console.log(
            `- Padrões aprendidos: ${memoryContext.learnedPatterns.length}`,
        );
        console.log(
            `- Execuções similares: ${memoryContext.similarPastExecutions.length}`,
        );
        console.log(
            `- Intent atual: ${memoryContext.conversationContext.userIntent}`,
        );

        // ===== PASSO 7: Geração de resposta rica =====
        return this.generateRichFinalResponse(finalResponseContext);
    }

    /**
     * Agora podemos criar uma resposta final RICA baseada em contexto completo
     */
    private generateRichFinalResponse(context: FinalResponseContext) {
        const response = {
            // Resposta principal baseada em execução
            response: this.buildContextualResponse(context),

            // Reasoning rico baseado em histórico
            reasoning: this.buildContextualReasoning(context),

            // Confidence baseada em padrões
            confidence: this.calculateConfidenceFromPatterns(context),

            // Insights baseados em memória
            insights: this.extractMemoryInsights(context),

            // Recommendations baseadas em análise
            recommendations: this.generateRecommendations(context),

            // Metadata rica
            metadata: {
                executionSummary: context.executionSummary,
                patternsApplied: context.executionContext.successPatterns.map(
                    (p) => p.patternId,
                ),
                memoryUtilized: context.memoryContext.selectionCriteria,
                replanContext: context.executionContext.replanContext,
            },
        };

        console.log('\n🎯 RESPOSTA FINAL RICA GERADA:');
        console.log(`- Confidence: ${response.confidence}`);
        console.log(`- Insights: ${response.insights.length}`);
        console.log(`- Recommendations: ${response.recommendations.length}`);

        return response;
    }

    private buildContextualResponse(context: FinalResponseContext): string {
        const execution = context.executionContext;

        if (execution.replanContext) {
            return (
                `Após ${execution.replanContext.attemptCount} replans por ${execution.replanContext.reason}, ` +
                `executei ${execution.stepRegistry.completedSteps.length} steps com sucesso. ` +
                `Baseado em ${context.memoryContext.similarPastExecutions.length} execuções similares, ` +
                `a estratégia ${execution.replanContext.strategy} mostrou ${context.executionSummary.successRate}% de efetividade.`
            );
        }

        return (
            `Executei ${execution.stepRegistry.completedSteps.length} steps com ${context.executionSummary.successRate}% de sucesso. ` +
            `Aplicando padrões aprendidos de ${context.memoryContext.learnedPatterns.length} experiências anteriores.`
        );
    }

    private buildContextualReasoning(context: FinalResponseContext): string {
        const patterns = context.executionContext.successPatterns;
        const memory = context.memoryContext;

        return (
            `Reasoning baseado em ${patterns.length} padrões de sucesso identificados, ` +
            `${memory.relevantHistoricalContext.length} contextos históricos relevantes, ` +
            `e análise de ${context.executionSummary.totalExecutions} execuções anteriores.`
        );
    }

    private calculateConfidenceFromPatterns(
        context: FinalResponseContext,
    ): number {
        const successRate = context.executionSummary.successRate;
        const patternCount = context.executionContext.successPatterns.length;
        const memoryRelevance = context.memoryContext.relevanceScores;

        // Confidence baseada em padrões reais
        return Math.min(
            0.95,
            (successRate / 100) * 0.7 + (patternCount / 10) * 0.2 + 0.1,
        );
    }

    private extractMemoryInsights(context: FinalResponseContext): string[] {
        const insights: string[] = [];
        const memory = context.memoryContext;

        // Insights baseados em padrões aprendidos
        memory.learnedPatterns.forEach((pattern) => {
            insights.push(
                `Padrão ${pattern.category}: ${pattern.description} (confiança: ${pattern.confidence})`,
            );
        });

        // Insights baseados em execuções similares
        memory.similarPastExecutions.forEach((execution) => {
            execution.insights.forEach((insight) => insights.push(insight));
        });

        return insights;
    }

    private generateRecommendations(context: FinalResponseContext): string[] {
        const recommendations: string[] = [];
        const execution = context.executionContext;

        // Recommendations baseadas em análise de falhas
        if (execution.failureAnalysis) {
            execution.failureAnalysis.preventionStrategies.forEach(
                (strategy) => {
                    recommendations.push(strategy);
                },
            );
        }

        // Recommendations baseadas em padrões de sucesso
        execution.successPatterns.forEach((pattern) => {
            pattern.recommendedActions.forEach((action) => {
                recommendations.push(action);
            });
        });

        return recommendations;
    }
}

// ===============================================
// 🚀 EXEMPLO DE USO PRÁTICO
// ===============================================

export async function demonstrateContextBridgeSolution() {
    console.log('🎯 DEMONSTRAÇÃO: Poder do ContextBridge\n');

    // Simular um PlannerExecutionContext típico (limitado)
    const plannerContext: PlannerExecutionContext = {
        sessionId: 'session-123',
        userMessage: 'Preciso analisar vendas do último trimestre',
        // ... outros campos limitados do contexto atual
    } as any;

    // ContextBridge mockado para demonstração
    const contextBridge: ContextBridgeService = {
        async buildFinalResponseContext(ctx) {
            // Simula agregação de contexto rico
            return {
                executionSummary: {
                    totalExecutions: 15,
                    successfulExecutions: 12,
                    failedExecutions: 3,
                    successRate: 80,
                    replanCount: 2,
                    averageExecutionTime: 45000,
                },
                executionContext: {
                    currentExecution: {
                        planId: 'plan-456',
                        status: 'completed',
                        startTime: Date.now() - 45000,
                        endTime: Date.now(),
                    },
                    stepRegistry: {
                        completedSteps: [
                            {
                                stepId: 'step-1',
                                name: 'Conectar base de dados',
                                status: 'completed',
                            },
                            {
                                stepId: 'step-2',
                                name: 'Extrair dados vendas Q4',
                                status: 'completed',
                            },
                            {
                                stepId: 'step-3',
                                name: 'Calcular métricas',
                                status: 'completed',
                            },
                        ],
                        failedSteps: [],
                        totalSteps: 3,
                    },
                    successPatterns: [
                        {
                            patternId: 'sales-analysis-success',
                            description:
                                'Análise de vendas com dados estruturados',
                            successRate: 85,
                            recommendedActions: [
                                'Validar dados antes de cálculos',
                                'Usar cache para queries repetidas',
                            ],
                        },
                    ],
                    replanContext: {
                        reason: 'Dados incompletos encontrados',
                        attemptCount: 1,
                        strategy: 'incremental-data-fetch',
                        previousFailures: ['timeout-database'],
                    },
                },
                memoryContext: {
                    recentInteractions: [
                        {
                            content:
                                'Usuário solicitou análise de vendas anteriormente',
                            timestamp: Date.now() - 3600000,
                        },
                    ],
                    learnedPatterns: [
                        {
                            category: 'behavioral',
                            description: 'Usuário prefere relatórios visuais',
                            confidence: 0.8,
                        },
                    ],
                    similarPastExecutions: [
                        {
                            scenario: 'Análise vendas Q3',
                            insights: [
                                'Dados de setembro foram inconsistentes',
                            ],
                            applicabilityScore: 0.9,
                        },
                    ],
                    conversationContext: {
                        userIntent: 'business-analytics',
                        conversationState: 'concluding',
                    },
                },
                stateContext: {
                    currentPhase: 'execution_complete',
                    stateHealth: {
                        overallHealth: 'healthy',
                        executionHealth: { status: 'healthy', score: 0.85 },
                        memoryHealth: { status: 'healthy', score: 0.9 },
                    },
                },
            } as FinalResponseContext;
        },
    } as any;

    // Demonstrar o poder
    const example = new ExampleContextBridgeUsage();
    const richResponse = await example.demonstrateContextBridgePower(
        contextBridge,
        plannerContext,
    );

    console.log('\n✅ RESULTADO FINAL:');
    console.log('Resposta:', richResponse.response);
    console.log('Confidence:', richResponse.confidence);
    console.log('Total insights:', richResponse.insights.length);
    console.log('Total recommendations:', richResponse.recommendations.length);
}

// Executar demonstração
// demonstrateContextBridgeSolution();
