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
                    discoveryCount: analysis.discoveries.length,
                    primaryFindings: analysis.discoveries.slice(0, 3),
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
        const discoveries: string[] = [];
        const errors: string[] = [];
        const warnings: string[] = [];
        let hasAmbiguousResults = false;

        // Analisar cada resultado
        context.executionResults.forEach((result, resultIndex) => {
            if (isErrorResult(result)) {
                const errorMsg = getResultError(result);
                if (errorMsg) {
                    errors.push(`Step ${resultIndex + 1}: ${errorMsg}`);
                }
            } else {
                const content = getResultContent(result);
                if (content) {
                    const discovery = this.extractDiscoveryFromResult(
                        content,
                        resultIndex + 1,
                    );
                    if (discovery) {
                        discoveries.push(discovery);
                    }
                }
            }
        });

        // Analisar steps do plano (se disponível)
        if (context.planSteps) {
            context.planSteps.forEach((step) => {
                if (step.status === 'failed') {
                    errors.push(`Failed: ${step.description}`);
                } else if (step.status === 'completed' && step.result) {
                    const discovery = this.extractDiscoveryFromResult(
                        step.result,
                        step.description,
                    );
                    if (discovery) {
                        discoveries.push(discovery);
                    }
                }
            });
        }

        // Detectar ambiguidade
        if (discoveries.length === 0 && errors.length === 0) {
            hasAmbiguousResults = true;
            warnings.push('No clear results or discoveries found');
        }

        return {
            discoveries,
            errors,
            warnings,
            hasErrors: errors.length > 0,
            hasAmbiguousResults,
            successRate:
                context.metadata.completedSteps / context.metadata.totalSteps,
        };
    }

    /**
     * Extrai descoberta relevante de um resultado
     */
    private extractDiscoveryFromResult(
        result: unknown,
        context: string | number,
    ): string | null {
        if (!result) return null;

        // Se é string, usar diretamente (mas resumir se muito longo)
        if (typeof result === 'string') {
            return result.length > 200
                ? `${result.substring(0, 200)}...`
                : result;
        }

        // Se é objeto, tentar extrair informação útil
        if (typeof result === 'object') {
            const obj = result as Record<string, unknown>;

            // Procurar por campos informativos comuns
            const infoFields = [
                'summary',
                'result',
                'data',
                'content',
                'message',
                'output',
            ];
            for (const field of infoFields) {
                if (obj[field] && typeof obj[field] === 'string') {
                    return `${context}: ${obj[field]}`;
                }
            }

            // Se tem múltiplas propriedades, criar resumo
            const properties = Object.keys(obj);
            if (properties.length > 0) {
                return `${context}: Found ${properties.length} items (${properties.slice(0, 3).join(', ')})`;
            }
        }

        return `${context}: Completed successfully`;
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
        const prompt = `Você é um assistente inteligente que ajuda usuários a entender resultados de análises.

CONTEXTO DA CONVERSA:
Pergunta Original: "${context.originalQuery}"
Planner Usado: ${context.plannerType}
Steps Executados: ${context.metadata.completedSteps} de ${context.metadata.totalSteps}

RESULTADOS DA ANÁLISE:
${
    analysis.discoveries.length > 0
        ? `
Descobertas Principais:
${analysis.discoveries.map((d, i) => `${i + 1}. ${d}`).join('\n')}
`
        : ''
}

${
    analysis.errors.length > 0
        ? `
Problemas Encontrados:
${analysis.errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}
`
        : ''
}

${
    analysis.warnings.length > 0
        ? `
Avisos:
${analysis.warnings.join(', ')}
`
        : ''
}

INSTRUÇÕES:
1. Crie uma resposta conversacional e natural
2. Conecte a pergunta original com os resultados encontrados
3. Explique o que foi descoberto de forma clara e útil
4. Se houve erros, explique de forma construtiva
5. Use tom profissional mas amigável
6. Foque no valor entregue para o usuário

Responda de forma direta e útil, como se estivesse conversando com o usuário:`;

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
        let response = `Baseado na sua pergunta "${context.originalQuery}", aqui está o resumo dos resultados:\n\n`;

        if (analysis.discoveries.length > 0) {
            response += `## 🔍 Principais Descobertas:\n`;
            analysis.discoveries.forEach((discovery, discoveryIndex) => {
                response += `${discoveryIndex + 1}. ${discovery}\n`;
            });
            response += '\n';
        }

        if (analysis.errors.length > 0) {
            response += `## ⚠️ Problemas Encontrados:\n`;
            analysis.errors.forEach((error, errorIndex) => {
                response += `${errorIndex + 1}. ${error}\n`;
            });
            response += '\n';
        }

        response += `## 📊 Resumo da Execução:\n`;
        response += `- Steps executados: ${context.metadata.completedSteps}/${context.metadata.totalSteps}\n`;
        response += `- Taxa de sucesso: ${Math.round(analysis.successRate * 100)}%\n`;

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
        let response = `Analisando "${context.originalQuery}":\n\n`;

        if (analysis.errors.length > 0) {
            response += `## 🚨 Problemas Identificados:\n`;
            analysis.errors.forEach((error, errorIdx) => {
                response += `**${errorIdx + 1}.** ${error}\n`;
            });
            response += '\n';
        }

        if (analysis.discoveries.length > 0) {
            response += `## ✅ Soluções/Descobertas:\n`;
            analysis.discoveries.forEach((discovery, discoveryIdx) => {
                response += `**${discoveryIdx + 1}.** ${discovery}\n`;
            });
            response += '\n';
        }

        response += `## 🎯 Próximos Passos Recomendados:\n`;
        if (analysis.errors.length > 0) {
            response += `- Resolver os problemas identificados acima\n`;
        }
        if (analysis.successRate < 1) {
            response += `- Verificar steps que não foram completados\n`;
        }
        response += `- Aplicar as descobertas encontradas\n`;

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

        if (analysis.discoveries.length > 0) {
            response += `### Results:\n`;
            analysis.discoveries.forEach((discovery) => {
                response += `- ${discovery}\n`;
            });
            response += '\n';
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
        let response = `Sobre "${context.originalQuery}":\n\n`;

        if (analysis.discoveries.length > 0) {
            response += `Principais resultados:\n`;
            analysis.discoveries.forEach((discovery) => {
                response += `• ${discovery}\n`;
            });
        }

        if (analysis.errors.length > 0) {
            response += `\nProblemas encontrados:\n`;
            analysis.errors.forEach((error, _i) => {
                response += `• ${error}\n`;
            });
        }

        response += `\nExecução: ${context.metadata.completedSteps}/${context.metadata.totalSteps} steps completados.`;

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

        // Sugestões baseadas em descobertas
        if (analysis.discoveries.length > 0) {
            suggestions.push('Posso explicar melhor algum desses pontos?');
            suggestions.push('Quer que eu detalhe alguma dessas descobertas?');
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

        // Bonus por descobertas
        confidence += Math.min(analysis.discoveries.length * 0.1, 0.3);

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
