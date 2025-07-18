/**
 * Reflexion Planner
 *
 * Implementa o pattern Reflexion onde:
 * 1. Executa ação
 * 2. Reflete sobre o resultado
 * 3. Aprende com erros
 * 4. Melhora estratégia baseada em feedback
 */

import { createLogger } from '../../../observability/index.js';
import type { LLMAdapter } from '../../../adapters/llm/index.js';
import type {
    Planner,
    AgentThought,
    AgentAction,
    ActionResult,
    ResultAnalysis,
    PlannerExecutionContext,
} from '../planner-factory.js';
import { isErrorResult, getResultError } from '../planner-factory.js';

export interface ReflectionEntry {
    id: string;
    timestamp: number;
    originalAction: AgentAction;
    result: ActionResult;
    reflection: string;
    lessons: string[];
    improvements: string[];
    confidence: number;
    metadata?: {
        iteration?: number;
        contextSize?: number;
        availableTools?: string[];
    };
}

export interface ReflectionMemory {
    entries: ReflectionEntry[];
    patterns: Array<{
        pattern: string;
        frequency: number;
        successRate: number;
        recommendations: string[];
    }>;
    totalReflections: number;
}

export class ReflexionPlanner implements Planner {
    private logger = createLogger('reflexion-planner');
    private memory: ReflectionMemory = {
        entries: [],
        patterns: [],
        totalReflections: 0,
    };

    constructor(private llmAdapter: LLMAdapter) {
        this.logger.info('Reflexion Planner initialized', {
            llmProvider: llmAdapter.getProvider?.()?.name || 'unknown',
            hasReflection: true,
        });
    }

    async think(
        input: string,
        context: PlannerExecutionContext,
    ): Promise<AgentThought> {
        this.logger.debug('Reflexion thinking started', {
            input: input.substring(0, 100),
            iteration: context.iterations,
            memoryEntries: this.memory.entries.length,
        });

        try {
            // Primeiro, refletir sobre contexto passado se houver
            if (context.history.length > 0) {
                await this.reflectOnRecentHistory(context);
            }

            // Gerar ação baseada em reflexões anteriores
            return await this.generateActionWithReflection(input, context);
        } catch (error) {
            this.logger.error('Reflexion thinking failed', error as Error);

            return {
                reasoning: `Error in reflexion: ${error instanceof Error ? error.message : 'Unknown error'}`,
                action: {
                    type: 'final_answer',
                    content: `I encountered an error while reflecting: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
                },
            };
        }
    }

    private async reflectOnRecentHistory(
        context: PlannerExecutionContext,
    ): Promise<void> {
        const lastHistoryEntry = context.history[context.history.length - 1];
        if (!lastHistoryEntry) return;

        // Criar reflexão sobre a última ação
        const reflection = await this.createReflection(
            lastHistoryEntry.action,
            lastHistoryEntry.result,
            context,
        );

        if (reflection) {
            this.memory.entries.push(reflection);
            this.memory.totalReflections++;

            // Atualizar padrões
            await this.updatePatterns();

            this.logger.debug('Reflection created', {
                reflectionId: reflection.id,
                confidence: reflection.confidence,
                lessonsLearned: reflection.lessons.length,
            });
        }
    }

    private async createReflection(
        action: AgentAction,
        result: ActionResult,
        context: PlannerExecutionContext,
    ): Promise<ReflectionEntry | null> {
        const reflectionPrompt = `
Reflect on this action and its result:

Action taken: ${JSON.stringify(action)}
Result received: ${JSON.stringify(result)}
Context: ${context.input}
Success: ${!isErrorResult(result)}

Please provide:
1. What went well or poorly?
2. What lessons can be learned?
3. How could this approach be improved?
4. What patterns do you notice?

Respond in this format:
Reflection: [your analysis]
Lessons: [lesson 1]; [lesson 2]; [lesson 3]
Improvements: [improvement 1]; [improvement 2]; [improvement 3]
        `;

        try {
            const response = await this.llmAdapter.call({
                messages: [{ role: 'user', content: reflectionPrompt }],
            });

            const reflection = this.parseReflectionResponse(response.content);

            return {
                id: `reflection-${Date.now()}`,
                timestamp: Date.now(),
                originalAction: action,
                result,
                reflection: reflection.analysis,
                lessons: reflection.lessons,
                improvements: reflection.improvements,
                confidence: this.calculateReflectionConfidence(result),
                metadata: {
                    iteration: context.iterations,
                    contextSize: context.history.length,
                    availableTools:
                        context.availableTools?.map((tool) => tool.name) || [],
                },
            };
        } catch (error) {
            this.logger.warn('Failed to create reflection', {
                error: (error as Error).message,
            });
            return null;
        }
    }

    private async generateActionWithReflection(
        input: string,
        context: PlannerExecutionContext,
    ): Promise<AgentThought> {
        // Extrair lições relevantes das reflexões passadas
        const relevantLessons = this.extractRelevantLessons(input, context);
        const relevantPatterns = this.getRelevantPatterns(input);

        // Gerar prompt enriquecido com reflexões
        const enrichedPrompt = this.buildReflectivePrompt(
            input,
            context,
            relevantLessons,
            relevantPatterns,
        );

        // Usar LLM para pensar com base nas reflexões
        const plan = await this.llmAdapter.createPlan?.(
            enrichedPrompt,
            'reflexion',
            {
                availableTools:
                    context.availableTools?.map((tool) => tool.name) || [],
                previousPlans: this.extractPreviousPlans(context),
                agentIdentity: context.agentIdentity as string, // ✅ USE AGENT IDENTITY
            },
        );

        return this.convertPlanToThought(
            plan as {
                steps?: Array<{
                    tool?: string;
                    arguments?: Record<string, unknown>;
                    description?: string;
                }>;
                reasoning?: string;
            },
        );
    }

    private buildReflectivePrompt(
        input: string,
        context: PlannerExecutionContext,
        lessons: string[],
        patterns: Array<{ pattern: string; recommendations: string[] }>,
    ): string {
        const availableToolNames =
            context.availableTools?.map((tool) => tool.name) || [];

        // ✅ CONTEXT ENGINEERING - Informar tools disponíveis de forma simples
        const toolsContext =
            availableToolNames.length > 0
                ? `Available tools: ${availableToolNames.join(', ')}`
                : `No tools available for this session`;

        const lessonsContext =
            lessons.length > 0
                ? `\nLessons learned from previous attempts:\n${lessons.join('\n- ')}`
                : '';

        const patternsContext =
            patterns.length > 0
                ? `\nSuccessful patterns observed:\n${patterns
                      .map(
                          (p) =>
                              `- ${p.pattern}: ${p.recommendations.join(', ')}`,
                      )
                      .join('\n')}`
                : '';

        return `
Goal: ${input}

${toolsContext}
${lessonsContext}
${patternsContext}

Based on past experiences and learned patterns, determine the best approach.
Consider what worked well before and what should be avoided.
Be specific about your approach and reasoning.
        `.trim();
    }

    private extractRelevantLessons(
        input: string,
        context: PlannerExecutionContext,
    ): string[] {
        const inputKeywords = input.toLowerCase().split(' ');

        return this.memory.entries
            .filter((entry) => {
                // Filtrar reflexões relevantes baseadas em palavras-chave
                const actionString = JSON.stringify(
                    entry.originalAction,
                ).toLowerCase();
                return inputKeywords.some(
                    (keyword) =>
                        actionString.includes(keyword) ||
                        entry.reflection.toLowerCase().includes(keyword),
                );
            })
            .filter((entry) => {
                // Prioritize lessons from similar contexts (same iteration range)
                const iterationDiff = Math.abs(
                    context.iterations - (entry.metadata?.iteration || 0),
                );
                return iterationDiff <= 3; // Similar context window
            })
            .slice(-5) // Últimas 5 reflexões relevantes
            .flatMap((entry) => entry.lessons);
    }

    private getRelevantPatterns(
        input: string,
    ): Array<{ pattern: string; recommendations: string[] }> {
        const inputKeywords = input.toLowerCase().split(' ');

        return this.memory.patterns
            .filter((pattern) =>
                inputKeywords.some((keyword) =>
                    pattern.pattern.toLowerCase().includes(keyword),
                ),
            )
            .filter((pattern) => pattern.successRate > 0.6) // Apenas padrões com boa taxa de sucesso
            .slice(0, 3); // Top 3 padrões
    }

    async analyzeResult(
        result: ActionResult,
        context: PlannerExecutionContext,
    ): Promise<ResultAnalysis> {
        this.logger.debug('Analyzing result with reflection', {
            resultType: result.type,
            hasError: isErrorResult(result),
            iteration: context.iterations,
        });

        // Análise básica
        if (result.type === 'final_answer') {
            return {
                isComplete: true,
                isSuccessful: true,
                feedback: 'Task completed successfully',
                shouldContinue: false,
            };
        }

        if (isErrorResult(result)) {
            // Buscar lições aprendidas sobre erros similares
            const errorMessage = getResultError(result)!;
            const similarErrorLessons =
                this.findSimilarErrorLessons(errorMessage);

            return {
                isComplete: false,
                isSuccessful: false,
                feedback: `Action failed: ${errorMessage}. ${
                    similarErrorLessons.length > 0
                        ? `Based on past experience: ${similarErrorLessons.join('; ')}`
                        : 'Will reflect on this error for future improvements.'
                }`,
                shouldContinue: true,
                suggestedNextAction:
                    'Try alternative approach based on learned lessons',
            };
        }

        // Sucesso - continuar com otimismo
        return {
            isComplete: false,
            isSuccessful: true,
            feedback: 'Action succeeded. Continuing with learned strategies.',
            shouldContinue: true,
        };
    }

    private findSimilarErrorLessons(error: string): string[] {
        return this.memory.entries
            .filter((entry) => {
                const entryError = getResultError(entry.result);
                return (
                    entryError &&
                    this.calculateStringSimilarity(entryError, error) > 0.5
                );
            })
            .slice(-3) // Últimas 3 ocorrências similares
            .flatMap((entry) => entry.improvements);
    }

    private async updatePatterns(): Promise<void> {
        // Agrupar reflexões por padrões similares
        const patternGroups = new Map<string, ReflectionEntry[]>();

        this.memory.entries.forEach((entry) => {
            const actionType = entry.originalAction.type;
            const tool =
                entry.originalAction.type === 'tool_call'
                    ? entry.originalAction.tool
                    : 'final_answer';
            const pattern = `${actionType}:${tool}`;

            if (!patternGroups.has(pattern)) {
                patternGroups.set(pattern, []);
            }
            patternGroups.get(pattern)!.push(entry);
        });

        // Calcular estatísticas dos padrões
        this.memory.patterns = Array.from(patternGroups.entries()).map(
            ([pattern, entries]) => {
                const successCount = entries.filter(
                    (e) => !isErrorResult(e.result),
                ).length;
                const successRate = successCount / entries.length;

                const recommendations = entries
                    .filter((e) => !isErrorResult(e.result))
                    .flatMap((e) => e.improvements)
                    .slice(0, 3); // Top 3 recomendações

                return {
                    pattern,
                    frequency: entries.length,
                    successRate,
                    recommendations,
                };
            },
        );
    }

    private convertPlanToThought(plan: {
        steps?: Array<{
            tool?: string;
            arguments?: Record<string, unknown>;
            description?: string;
        }>;
        reasoning?: string;
    }): AgentThought {
        const nextStep = plan.steps?.[0];

        if (!nextStep) {
            return {
                reasoning:
                    plan.reasoning ||
                    'No clear action identified based on reflection',
                action: {
                    type: 'final_answer',
                    content: 'No clear next step based on learned patterns',
                },
            };
        }

        // ✅ VALIDAÇÃO - Verificar se a tool solicitada existe
        // Nota: Não temos acesso a availableTools aqui, mas a validação seria ideal
        // Por agora, mantemos a tool conforme especificada pelo LLM

        const action: AgentAction =
            nextStep.tool && nextStep.tool !== 'none'
                ? {
                      type: 'tool_call',
                      tool: nextStep.tool,
                      arguments: nextStep.arguments || {},
                  }
                : {
                      type: 'final_answer',
                      content: nextStep.description || 'Reflexive response',
                  };

        return {
            reasoning:
                plan.reasoning ||
                nextStep.description ||
                'Reflexive action based on learned patterns',
            action,
            confidence: this.calculateActionConfidence(action),
            metadata: {
                reflectionBased: true,
                memoryEntries: this.memory.entries.length,
                patterns: this.memory.patterns.length,
            },
        };
    }

    private extractPreviousPlans(context: PlannerExecutionContext) {
        return context.history.map((h) => ({
            strategy: 'reflexion',
            goal: context.input,
            steps: [
                {
                    id: 'reflexive-step',
                    description: h.thought.reasoning,
                    type: 'action' as const,
                },
            ],
            reasoning: h.observation.feedback,
            complexity: 'medium' as const,
        }));
    }

    private parseReflectionResponse(response: string): {
        analysis: string;
        lessons: string[];
        improvements: string[];
    } {
        const reflectionMatch = response.match(
            /Reflection:\s*(.+?)(?=Lessons:|$)/s,
        );
        const lessonsMatch = response.match(
            /Lessons:\s*(.+?)(?=Improvements:|$)/s,
        );
        const improvementsMatch = response.match(/Improvements:\s*(.+)$/s);

        return {
            analysis: reflectionMatch?.[1]?.trim() || 'No reflection provided',
            lessons:
                lessonsMatch?.[1]
                    ?.split(';')
                    .map((l) => l.trim())
                    .filter(Boolean) || [],
            improvements:
                improvementsMatch?.[1]
                    ?.split(';')
                    .map((i) => i.trim())
                    .filter(Boolean) || [],
        };
    }

    private calculateReflectionConfidence(result: ActionResult): number {
        return isErrorResult(result) ? 0.3 : 0.8;
    }

    private calculateActionConfidence(action: AgentAction): number {
        let confidence = 0.6; // Base confidence

        // Higher confidence if we have patterns that support this action
        const actionPattern =
            action.type === 'tool_call'
                ? `tool_call:${action.tool}`
                : 'final_answer:final_answer';

        const pattern = this.memory.patterns.find(
            (p) => p.pattern === actionPattern,
        );
        if (pattern && pattern.successRate > 0.7) {
            confidence += 0.3;
        }

        // Higher confidence if we have many successful reflections
        if (this.memory.entries.length > 5) {
            confidence += 0.1;
        }

        return Math.min(confidence, 1.0);
    }

    private calculateStringSimilarity(str1: string, str2: string): number {
        const words1 = str1.toLowerCase().split(' ');
        const words2 = str2.toLowerCase().split(' ');
        const commonWords = words1.filter((word) => words2.includes(word));
        return commonWords.length / Math.max(words1.length, words2.length);
    }
}
