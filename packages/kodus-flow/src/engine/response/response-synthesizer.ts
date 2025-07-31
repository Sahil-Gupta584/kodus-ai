/**
 * @module engine/response/response-synthesizer
 * @description Sistema para transformar resultados técnicos de execução em respostas conversacionais
 *
 * OBJETIVO:
 * Fechar o loop de conversa conectando a pergunta original do usuário com os resultados
 * da execução, criando uma resposta natural e útil.
 */

import { createLogger } from '../../observability/index.js';
import type { LLMAdapter } from '../../adapters/llm/index.js';
import type { ActionResult } from '../planning/planner-factory.js';
import {
    isErrorResult,
    getResultError,
    getResultContent,
} from '../planning/planner-factory.js';

// const logger = createLogger('response-synthesizer');

// ==================== TYPES ====================

export interface ResponseSynthesisContext {
    /** Pergunta/input original do usuário */
    originalQuery: string;

    /** Tipo de planner usado (plan-execute, react, etc.) */
    plannerType: string;

    /** Todos os resultados da execução */
    executionResults: ActionResult[];

    /** Steps do plano (se disponível) */
    planSteps?: Array<{
        id: string;
        description: string;
        status: 'completed' | 'failed' | 'skipped';
        result?: unknown;
    }>;

    /** Metadata adicional sobre a execução */
    metadata: {
        totalSteps: number;
        completedSteps: number;
        failedSteps: number;
        executionTime?: number;
        iterationCount?: number;
        [key: string]: unknown;
    };
}

export interface SynthesizedResponse {
    /** Resposta final conversacional para o usuário */
    content: string;

    /** Confiança na qualidade da resposta (0.0-1.0) */
    confidence: number;

    /** Sugestões de follow-up para continuar a conversa */
    followUpSuggestions: string[];

    /** Se precisa de mais clarificação do usuário */
    needsClarification: boolean;

    /** Se a resposta inclui erros que o usuário deve saber */
    includesError: boolean;

    /** Metadata sobre a synthesis */
    metadata: {
        synthesisStrategy: string;
        discoveryCount: number;
        primaryFindings: string[];
        [key: string]: unknown;
    };
}

export type SynthesisStrategy =
    | 'conversational'
    | 'summary'
    | 'problem-solution'
    | 'technical';

// ==================== CORE SYNTHESIZER ====================

export class ResponseSynthesizer {
    private logger = createLogger('response-synthesizer');

    constructor(private llmAdapter: LLMAdapter) {
        this.logger.info('Response Synthesizer initialized', {
            llmProvider: llmAdapter.getProvider?.()?.name || 'unknown',
            supportsStructured:
                llmAdapter.supportsStructuredGeneration?.() || false,
        });
    }

    /**
     * 🎯 Método principal: transforma resultados em resposta conversacional
     */
    async synthesize(
        context: ResponseSynthesisContext,
        strategy: SynthesisStrategy = 'conversational',
    ): Promise<SynthesizedResponse> {
        const startTime = Date.now();

        this.logger.info('Starting response synthesis', {
            originalQuery: context.originalQuery.substring(0, 100),
            plannerType: context.plannerType,
            resultsCount: context.executionResults.length,
            strategy,
            stepsExecuted: context.metadata.completedSteps,
        });

        try {
            // 1. Analisar resultados para extrair descobertas principais
            const analysis = this.analyzeExecutionResults(context);

            // 2. Aplicar estratégia de synthesis
            const synthesizedContent = await this.applySynthesisStrategy(
                strategy,
                context,
                analysis,
            );

            // 3. Gerar follow-up suggestions
            const followUps = this.generateFollowUpSuggestions(
                context,
                analysis,
            );

            // 4. Calcular confiança na resposta
            const confidence = this.calculateResponseConfidence(
                context,
                analysis,
            );

            const response: SynthesizedResponse = {
                content: synthesizedContent,
                confidence,
                followUpSuggestions: followUps,
                needsClarification: analysis.hasAmbiguousResults,
                includesError: analysis.hasErrors,
                metadata: {
                    synthesisStrategy: strategy,
                    discoveryCount: analysis.rawResults.length,
                    primaryFindings: analysis.rawResults
                        .slice(0, 3)
                        .map((r) =>
                            typeof r === 'string'
                                ? r
                                : JSON.stringify(r).substring(0, 100),
                        ),
                    synthesisTime: Date.now() - startTime,
                },
            };

            this.logger.info('Response synthesis completed', {
                confidence: response.confidence,
                contentLength: response.content.length,
                followUpsCount: response.followUpSuggestions.length,
                includesError: response.includesError,
                synthesisTime: Date.now() - startTime,
            });

            return response;
        } catch (error) {
            this.logger.error('Response synthesis failed', error as Error, {
                originalQuery: context.originalQuery.substring(0, 100),
                strategy,
            });

            // Fallback: resposta básica
            return this.createFallbackResponse(context, error as Error);
        }
    }

    // ==================== ANALYSIS METHODS ====================

    /**
     * Analisa todos os resultados para extrair insights principais
     */
    private analyzeExecutionResults(context: ResponseSynthesisContext) {
        const rawResults: unknown[] = [];
        const errors: string[] = [];
        const warnings: string[] = [];
        let hasAmbiguousResults = false;

        // Coletar resultados brutos
        context.executionResults.forEach((result, resultIndex) => {
            if (isErrorResult(result)) {
                const errorMsg = getResultError(result);
                if (errorMsg) {
                    errors.push(`Step ${resultIndex + 1}: ${errorMsg}`);
                }
            } else {
                const content = getResultContent(result);
                if (content) {
                    rawResults.push(content);
                }
            }
        });

        // Coletar resultados dos steps do plano
        if (context.planSteps) {
            context.planSteps.forEach((step) => {
                if (step.status === 'failed') {
                    errors.push(`Failed: ${step.description}`);
                } else if (step.status === 'completed' && step.result) {
                    rawResults.push(step.result);
                }
            });
        }

        // Detectar ambiguidade
        if (rawResults.length === 0 && errors.length === 0) {
            hasAmbiguousResults = true;
            warnings.push('No clear results found');
        }

        return {
            rawResults,
            errors,
            warnings,
            hasErrors: errors.length > 0,
            hasAmbiguousResults,
            successRate:
                context.metadata.completedSteps / context.metadata.totalSteps,
        };
    }

    // ==================== SYNTHESIS STRATEGIES ====================

    /**
     * Aplica estratégia de synthesis escolhida
     */
    private async applySynthesisStrategy(
        strategy: SynthesisStrategy,
        context: ResponseSynthesisContext,
        analysis: ReturnType<
            typeof ResponseSynthesizer.prototype.analyzeExecutionResults
        >,
    ): Promise<string> {
        switch (strategy) {
            case 'conversational':
                return this.conversationalSynthesis(context, analysis);
            case 'summary':
                return this.summarySynthesis(context, analysis);
            case 'problem-solution':
                return this.problemSolutionSynthesis(context, analysis);
            case 'technical':
                return this.technicalSynthesis(context, analysis);
            default:
                return this.conversationalSynthesis(context, analysis);
        }
    }

    /**
     * 🗣️ Estratégia Conversational: Resposta natural e fluida
     */
    private async conversationalSynthesis(
        context: ResponseSynthesisContext,
        analysis: ReturnType<
            typeof ResponseSynthesizer.prototype.analyzeExecutionResults
        >,
    ): Promise<string> {
        const prompt = `Given the user's request and the execution results, provide a clear and helpful response.

USER REQUEST: "${context.originalQuery}"

EXECUTION RESULTS:
${analysis.rawResults.length > 0 ? JSON.stringify(analysis.rawResults, null, 2) : 'No data found.'}
${analysis.errors.length > 0 ? `\nERRORS:\n${analysis.errors.join('\n')}` : ''}

INSTRUCTIONS:
- Answer in the same language as the user's request
- Extract and present the relevant information from the results
- Be direct and specific about what was found
- If there are errors, explain them simply
- Focus on answering the user's question with the actual data

Response:`;

        try {
            const response = await this.llmAdapter.call({
                messages: [{ role: 'user', content: prompt }],
            });

            return (
                response.content || this.createBasicResponse(context, analysis)
            );
        } catch (error) {
            this.logger.warn('LLM synthesis failed, using basic response', {
                error: (error as Error).message,
            });
            return this.createBasicResponse(context, analysis);
        }
    }

    /**
     * 📋 Estratégia Summary: Lista organizada de descobertas
     */
    private async summarySynthesis(
        context: ResponseSynthesisContext,
        analysis: ReturnType<
            typeof ResponseSynthesizer.prototype.analyzeExecutionResults
        >,
    ): Promise<string> {
        let response = `Based on your question "${context.originalQuery}", here is the summary of results:\n\n`;

        if (analysis.rawResults.length > 0) {
            response += `## 🔍 Results:\n`;
            response += `\`\`\`json\n${JSON.stringify(analysis.rawResults, null, 2)}\n\`\`\`\n\n`;
        }

        if (analysis.errors.length > 0) {
            response += `## ⚠️ Issues Found:\n`;
            analysis.errors.forEach((error, errorIndex) => {
                response += `${errorIndex + 1}. ${error}\n`;
            });
            response += '\n';
        }

        response += `## 📊 Execution Summary:\n`;
        response += `- Steps executed: ${context.metadata.completedSteps}/${context.metadata.totalSteps}\n`;
        response += `- Success rate: ${Math.round(analysis.successRate * 100)}%\n`;

        return response;
    }

    /**
     * 🔧 Estratégia Problem-Solution: Foca em problemas e soluções
     */
    private async problemSolutionSynthesis(
        context: ResponseSynthesisContext,
        analysis: ReturnType<
            typeof ResponseSynthesizer.prototype.analyzeExecutionResults
        >,
    ): Promise<string> {
        let response = `Analyzing "${context.originalQuery}":\n\n`;

        if (analysis.errors.length > 0) {
            response += `## 🚨 Issues Identified:\n`;
            analysis.errors.forEach((error, errorIdx) => {
                response += `**${errorIdx + 1}.** ${error}\n`;
            });
            response += '\n';
        }

        if (analysis.rawResults.length > 0) {
            response += `## ✅ Results:\n`;
            response += `\`\`\`json\n${JSON.stringify(analysis.rawResults, null, 2)}\n\`\`\`\n\n`;
        }

        response += `## 🎯 Recommended Next Steps:\n`;
        if (analysis.errors.length > 0) {
            response += `- Resolve the issues identified above\n`;
        }
        if (analysis.successRate < 1) {
            response += `- Check steps that were not completed\n`;
        }
        response += `- Apply the discoveries found\n`;

        return response;
    }

    /**
     * 🔬 Estratégia Technical: Detalhes técnicos completos
     */
    private async technicalSynthesis(
        context: ResponseSynthesisContext,
        analysis: ReturnType<
            typeof ResponseSynthesizer.prototype.analyzeExecutionResults
        >,
    ): Promise<string> {
        let response = `## Technical Analysis Report\n\n`;
        response += `**Query:** ${context.originalQuery}\n`;
        response += `**Planner:** ${context.plannerType}\n`;
        response += `**Execution Stats:** ${context.metadata.completedSteps}/${context.metadata.totalSteps} steps (${Math.round(analysis.successRate * 100)}% success rate)\n\n`;

        if (context.planSteps) {
            response += `### Execution Steps:\n`;
            context.planSteps.forEach((step) => {
                const status =
                    step.status === 'completed'
                        ? '✅'
                        : step.status === 'failed'
                          ? '❌'
                          : '⏸️';
                response += `${status} **${step.id}:** ${step.description}\n`;
            });
            response += '\n';
        }

        if (analysis.rawResults.length > 0) {
            response += `### Results:\n`;
            response += `\`\`\`json\n${JSON.stringify(analysis.rawResults, null, 2)}\n\`\`\`\n\n`;
        }

        if (analysis.errors.length > 0) {
            response += `### Errors:\n`;
            analysis.errors.forEach((error) => {
                response += `- ${error}\n`;
            });
        }

        return response;
    }

    // ==================== HELPER METHODS ====================

    /**
     * Cria resposta básica quando LLM não está disponível
     */
    private createBasicResponse(
        context: ResponseSynthesisContext,
        analysis: ReturnType<
            typeof ResponseSynthesizer.prototype.analyzeExecutionResults
        >,
    ): string {
        let response = `About "${context.originalQuery}":\n\n`;

        if (analysis.rawResults.length > 0) {
            response += `Results:\n`;
            response += `\`\`\`json\n${JSON.stringify(analysis.rawResults, null, 2)}\n\`\`\`\n`;
        }

        if (analysis.errors.length > 0) {
            response += `\nIssues found:\n`;
            analysis.errors.forEach((error, _i) => {
                response += `• ${error}\n`;
            });
        }

        response += `\nExecution: ${context.metadata.completedSteps}/${context.metadata.totalSteps} steps completed.`;

        return response;
    }

    /**
     * Gera sugestões de follow-up baseadas no contexto
     */
    private generateFollowUpSuggestions(
        context: ResponseSynthesisContext,
        analysis: ReturnType<
            typeof ResponseSynthesizer.prototype.analyzeExecutionResults
        >,
    ): string[] {
        const suggestions: string[] = [];

        // Sugestões baseadas em resultados
        if (analysis.rawResults.length > 0) {
            suggestions.push('Posso explicar melhor algum desses resultados?');
            suggestions.push(
                'Quer que eu detalhe alguma informação específica?',
            );
        }

        // Sugestões baseadas em erros
        if (analysis.errors.length > 0) {
            suggestions.push('Posso ajudar a resolver esses problemas?');
            suggestions.push('Quer tentar uma abordagem diferente?');
        }

        // Sugestões genéricas baseadas no tipo de query
        const query = context.originalQuery.toLowerCase();
        if (query.includes('como')) {
            suggestions.push('Precisa de mais detalhes sobre a implementação?');
        }
        if (query.includes('problema') || query.includes('erro')) {
            suggestions.push(
                'Quer que eu analise mais profundamente o problema?',
            );
        }
        if (query.includes('melhorar') || query.includes('otimizar')) {
            suggestions.push('Posso sugerir outras melhorias?');
        }

        // Sempre ter uma sugestão genérica
        if (suggestions.length === 0) {
            suggestions.push('Tem mais alguma dúvida sobre isso?');
        }

        return suggestions.slice(0, 3); // Máximo 3 sugestões
    }

    /**
     * Calcula confiança na qualidade da resposta
     */
    private calculateResponseConfidence(
        context: ResponseSynthesisContext,
        analysis: ReturnType<
            typeof ResponseSynthesizer.prototype.analyzeExecutionResults
        >,
    ): number {
        let confidence = 0.5; // Base

        // Bonus por resultados
        confidence += Math.min(analysis.rawResults.length * 0.1, 0.3);

        // Bonus por alta taxa de sucesso
        confidence += analysis.successRate * 0.3;

        // Penalty por erros
        confidence -= Math.min(analysis.errors.length * 0.1, 0.2);

        // Penalty por resultados ambíguos
        if (analysis.hasAmbiguousResults) {
            confidence -= 0.2;
        }

        // Bonus se completou todos os steps
        if (context.metadata.completedSteps === context.metadata.totalSteps) {
            confidence += 0.1;
        }

        return Math.max(0.1, Math.min(1.0, confidence));
    }

    /**
     * Cria resposta de fallback em caso de erro
     */
    private createFallbackResponse(
        context: ResponseSynthesisContext,
        error: Error,
    ): SynthesizedResponse {
        return {
            content: `Executei a análise para "${context.originalQuery}" e completei ${context.metadata.completedSteps} de ${context.metadata.totalSteps} steps. Houve uma dificuldade na síntese final dos resultados, mas o processo foi executado. Posso tentar explicar os resultados de forma diferente se precisar.`,
            confidence: 0.3,
            followUpSuggestions: [
                'Posso tentar explicar os resultados novamente?',
                'Quer que eu foque em um aspecto específico?',
            ],
            needsClarification: true,
            includesError: true,
            metadata: {
                synthesisStrategy: 'fallback',
                discoveryCount: 0,
                primaryFindings: [],
                error: error.message,
            },
        };
    }
}

// ==================== FACTORY ====================

/**
 * Factory function para criar Response Synthesizer
 */
export function createResponseSynthesizer(
    llmAdapter: LLMAdapter,
): ResponseSynthesizer {
    return new ResponseSynthesizer(llmAdapter);
}
