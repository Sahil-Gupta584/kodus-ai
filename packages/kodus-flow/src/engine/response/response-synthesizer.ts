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

    /** ✅ FRAMEWORK PATTERN: Reasoning do planner (especialmente importante para empty plans) */
    plannerReasoning?: string;

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

            // 4. Calcular confiança na resposta
            const confidence = this.calculateResponseConfidence(
                context,
                analysis,
            );

            const response: SynthesizedResponse = {
                content: synthesizedContent,
                confidence,
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
     * ✅ REFACTORED: Summary synthesis using LLM
     */
    private async summarySynthesis(
        context: ResponseSynthesisContext,
        analysis: ReturnType<
            typeof ResponseSynthesizer.prototype.analyzeExecutionResults
        >,
    ): Promise<string> {
        const prompt = `Create a summary response for the user's request.

USER REQUEST: "${context.originalQuery}"

EXECUTION RESULTS:
${analysis.rawResults.length > 0 ? JSON.stringify(analysis.rawResults, null, 2) : 'No data found.'}

ERRORS (if any):
${analysis.errors.length > 0 ? analysis.errors.join('\n') : 'None'}

EXECUTION STATS:
- Steps completed: ${context.metadata.completedSteps}/${context.metadata.totalSteps}
- Success rate: ${Math.round(analysis.successRate * 100)}%

INSTRUCTIONS:
- Create a clear summary in the same language as the user's request
- Include the main findings from the results
- Mention any errors if they occurred
- Include execution statistics
- Format as a well-structured summary

Response:`;

        try {
            const response = await this.llmAdapter.call({
                messages: [{ role: 'user', content: prompt }],
            });
            return (
                response.content || this.createBasicResponse(context, analysis)
            );
        } catch (error) {
            this.logger.warn('LLM summary synthesis failed', {
                error: (error as Error).message,
            });
            return this.createBasicResponse(context, analysis);
        }
    }

    /**
     * ✅ REFACTORED: Problem-Solution synthesis using LLM
     */
    private async problemSolutionSynthesis(
        context: ResponseSynthesisContext,
        analysis: ReturnType<
            typeof ResponseSynthesizer.prototype.analyzeExecutionResults
        >,
    ): Promise<string> {
        const prompt = `Analyze the request and provide a problem-solution focused response.

USER REQUEST: "${context.originalQuery}"

RESULTS:
${analysis.rawResults.length > 0 ? JSON.stringify(analysis.rawResults, null, 2) : 'No results found.'}

ISSUES/ERRORS:
${analysis.errors.length > 0 ? analysis.errors.join('\n') : 'No issues found.'}

EXECUTION INFO:
- Success rate: ${Math.round(analysis.successRate * 100)}%
- Steps completed: ${context.metadata.completedSteps}/${context.metadata.totalSteps}

INSTRUCTIONS:
- Respond in the same language as the user's request
- Focus on problems found and their solutions
- Highlight any issues that need attention
- Suggest actionable next steps
- Be constructive and solution-oriented

Response:`;

        try {
            const response = await this.llmAdapter.call({
                messages: [{ role: 'user', content: prompt }],
            });
            return (
                response.content || this.createBasicResponse(context, analysis)
            );
        } catch (error) {
            this.logger.warn('LLM problem-solution synthesis failed', {
                error: (error as Error).message,
            });
            return this.createBasicResponse(context, analysis);
        }
    }

    /**
     * ✅ REFACTORED: Technical synthesis using LLM
     */
    private async technicalSynthesis(
        context: ResponseSynthesisContext,
        analysis: ReturnType<
            typeof ResponseSynthesizer.prototype.analyzeExecutionResults
        >,
    ): Promise<string> {
        const planStepsInfo = context.planSteps
            ? context.planSteps.map((step) => ({
                  id: step.id,
                  description: step.description,
                  status: step.status,
                  result: step.result,
              }))
            : [];

        const prompt = `Generate a technical analysis report for the execution.

USER REQUEST: "${context.originalQuery}"

EXECUTION DETAILS:
- Planner Type: ${context.plannerType}
- Steps Completed: ${context.metadata.completedSteps}/${context.metadata.totalSteps}
- Success Rate: ${Math.round(analysis.successRate * 100)}%
- Execution Time: ${context.metadata.executionTime || 'N/A'}ms

PLAN STEPS:
${planStepsInfo.length > 0 ? JSON.stringify(planStepsInfo, null, 2) : 'No plan steps available'}

RESULTS:
${analysis.rawResults.length > 0 ? JSON.stringify(analysis.rawResults, null, 2) : 'No results'}

ERRORS:
${analysis.errors.length > 0 ? analysis.errors.join('\n') : 'No errors'}

INSTRUCTIONS:
- Generate a detailed technical report in the same language as the user's request
- Include all execution details
- Present data in a clear, technical format
- Include performance metrics
- Be precise and comprehensive

Response:`;

        try {
            const response = await this.llmAdapter.call({
                messages: [{ role: 'user', content: prompt }],
            });
            return (
                response.content || this.createBasicResponse(context, analysis)
            );
        } catch (error) {
            this.logger.warn('LLM technical synthesis failed', {
                error: (error as Error).message,
            });
            return this.createBasicResponse(context, analysis);
        }
    }

    // ==================== HELPER METHODS ====================

    /**
     * ✅ REFACTORED: Basic fallback response (minimal formatting)
     * This should only be used when LLM is completely unavailable
     */
    private createBasicResponse(
        context: ResponseSynthesisContext,
        analysis: ReturnType<
            typeof ResponseSynthesizer.prototype.analyzeExecutionResults
        >,
    ): string {
        // ✅ FRAMEWORK BEST PRACTICE: Return raw data when LLM unavailable
        // Let the application layer handle formatting if needed
        const response = {
            request: context.originalQuery,
            results: analysis.rawResults,
            errors: analysis.errors,
            execution: {
                completed: context.metadata.completedSteps,
                total: context.metadata.totalSteps,
                successRate: analysis.successRate,
            },
        };

        return JSON.stringify(response, null, 2);
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
     * ✅ REFACTORED: Fallback response returns raw error data
     */
    private createFallbackResponse(
        context: ResponseSynthesisContext,
        error: Error,
    ): SynthesizedResponse {
        // ✅ FRAMEWORK BEST PRACTICE: Return raw data on error
        // Never use hardcoded strings in any language
        const errorResponse = {
            type: 'synthesis_error',
            request: context.originalQuery,
            execution: {
                completed: context.metadata.completedSteps,
                total: context.metadata.totalSteps,
            },
            error: error.message,
        };

        return {
            content: JSON.stringify(errorResponse, null, 2),
            confidence: 0.1,
            needsClarification: true,
            includesError: true,
            metadata: {
                synthesisStrategy: 'error-fallback',
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
