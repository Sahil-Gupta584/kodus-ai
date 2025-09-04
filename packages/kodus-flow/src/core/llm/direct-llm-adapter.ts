import {
    createLogger,
    getObservability,
    startLLMSpan,
    markSpanOk,
    applyErrorToSpan,
} from '../../observability/index.js';
import { EngineError } from '../errors.js';
import {
    AgentInputEnum,
    DEFAULT_LLM_SETTINGS,
    LangChainLLM,
    LangChainMessage,
    LangChainOptions,
    LLMAdapter,
    PlanningResult,
    ToolMetadataForLLM,
} from '../types/allTypes.js';
// import {
//     validatePlanningResponse,
//     validateLLMResponse,
// } from './response-validator.js';

export class DirectLLMAdapter implements LLMAdapter {
    private llm: LangChainLLM;
    private logger = createLogger('direct-llm-adapter');

    constructor(langchainLLM: LangChainLLM) {
        this.llm = langchainLLM;

        this.logger.info('Direct LLM adapter initialized (SIMPLIFIED)', {
            llmName: langchainLLM.name || 'unknown-llm',
            hasStreaming: typeof langchainLLM.stream === 'function',
        });
    }

    analyzeContext(): Promise<{
        intent: string;
        urgency: 'low' | 'normal' | 'high';
        complexity: 'simple' | 'medium' | 'complex';
        selectedTool: string;
        confidence: number;
        reasoning: string;
    }> {
        throw new Error('Method not implemented.');
    }

    extractParameters(): Promise<Record<string, unknown>> {
        throw new Error('Method not implemented.');
    }

    generateResponse(): Promise<string> {
        throw new Error('Method not implemented.');
    }

    async createPlan(
        goal: string,
        technique: string = 'cot',
        context?: {
            systemPrompt?: string;
            userPrompt?: string;
            tools?: ToolMetadataForLLM[];
            previousPlans?: PlanningResult[];
            constraints?: string[];
        },
    ): Promise<PlanningResult> {
        const obs = getObservability();
        const options: LangChainOptions = {
            ...DEFAULT_LLM_SETTINGS,
            maxTokens: 20000,
        };

        if (context?.tools && context.tools.length > 0) {
            options.tools = context.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
            }));
            options.toolChoice = 'auto';
        }

        const systemPrompt =
            context?.systemPrompt ||
            `You are an AI assistant using the ${technique} planning technique.`;
        const userPrompt = context?.userPrompt || `Goal: ${goal}`;

        const messages: LangChainMessage[] = [
            {
                role: AgentInputEnum.SYSTEM,
                content: systemPrompt,
            },
            {
                role: AgentInputEnum.USER,
                content: userPrompt,
            },
        ];

        try {
            const span = startLLMSpan(obs.telemetry, {
                model: this.llm.name || 'unknown',
                technique,
                temperature: options.temperature,
                topP: options.topP,
                maxTokens: options.maxTokens,
            });

            const response = await obs.telemetry.withSpan(span, async () => {
                try {
                    const res = await this.llm.call(messages, options);
                    // Record usage if present
                    if (typeof res !== 'string' && res?.usage) {
                        const usage = res.usage;
                        if (usage?.totalTokens !== undefined) {
                            span.setAttribute(
                                'gen_ai.usage.total_tokens',
                                usage.totalTokens,
                            );
                        }
                        if (usage?.promptTokens !== undefined) {
                            span.setAttribute(
                                'gen_ai.usage.input_tokens',
                                usage.promptTokens,
                            );
                        }
                        if (usage?.completionTokens !== undefined) {
                            span.setAttribute(
                                'gen_ai.usage.output_tokens',
                                usage.completionTokens,
                            );
                        }
                    }
                    markSpanOk(span);
                    return res;
                } catch (err) {
                    applyErrorToSpan(
                        span,
                        err instanceof Error ? err : new Error(String(err)),
                        {
                            model: this.llm.name || 'unknown',
                        },
                    );
                    throw err;
                }
            });

            return response as any;

            //TODO: remove this
            // return this.parseFlexiblePlanningResponse(
            //     response,
            //     goal,
            //     technique,
            // );
        } catch (error) {
            this.logger.error(
                'Planning failed',
                error instanceof Error ? error : new Error('Unknown error'),
            );
            throw new EngineError(
                'LLM_ERROR',
                `Planning failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    /**
     * ✅ AJV: Parse planning response with industry-standard validation
     */
    // private parseFlexiblePlanningResponse(
    //     response: unknown,
    //     goal: string,
    //     technique: string,
    // ): PlanningResult {
    //     const llmValidated = validateLLMResponse(response);

    //     let extractedSteps: Array<{
    //         id: string;
    //         description: string;
    //         tool?: string;
    //         arguments?: Record<string, unknown>;
    //         dependencies?: string[];
    //         type:
    //             | 'analysis'
    //             | 'action'
    //             | 'decision'
    //             | 'observation'
    //             | 'verification';
    //     }> = [];
    //     let extractedReasoning = '';
    //     let extractedSignals: Record<string, unknown> = {};
    //     let extractedAudit: string[] = [];

    //     if (llmValidated.toolCalls && llmValidated.toolCalls.length > 0) {
    //         this.logger.debug('Extracting steps from function calls', {
    //             toolCallsCount: llmValidated.toolCalls.length,
    //         });

    //         extractedSteps = llmValidated?.toolCalls?.map((call, index) => {
    //             let parsedArgs: Record<string, unknown> = {};
    //             try {
    //                 parsedArgs = JSON.parse(call.function.arguments);
    //             } catch (error) {
    //                 this.logger.warn('Failed to parse tool call arguments', {
    //                     toolName: call.function.name,
    //                     arguments: call.function.arguments,
    //                     error,
    //                 });
    //             }

    //             return {
    //                 id: call.id || `step-${index + 1}`,
    //                 description: `Execute ${call.function.name}`,
    //                 tool: call.function.name,
    //                 arguments: parsedArgs,
    //                 dependencies: index > 0 ? [`step-${index}`] : [],
    //                 type: 'action' as const,
    //             };
    //         });

    //         extractedReasoning =
    //             llmValidated.content || 'Generated from function calls';
    //     } else {
    //         // Traditional text parsing: use AJV validation
    //         this.logger.debug('Extracting steps from text parsing', {
    //             hasContent: !!llmValidated.content,
    //         });

    //         const validated = validatePlanningResponse(response);
    //         extractedSteps = validated.steps || [];
    //         extractedReasoning = validated.reasoning || '';
    //         extractedSignals = validated.signals || {};
    //         extractedAudit = validated.audit || [];
    //     }

    //     return {
    //         strategy: technique,
    //         goal,
    //         steps: extractedSteps,
    //         reasoning: extractedReasoning,
    //         signals: extractedSignals,
    //         audit: extractedAudit,
    //     };
    // }

    supportsStreaming(): boolean {
        return typeof this.llm.stream === 'function';
    }

    getName(): string {
        return this.llm.name || 'unknown-llm';
    }

    // ✅ COMPATIBILITY: LLMAdapter interface compliance
    async call(request: {
        messages: Array<{ role: AgentInputEnum; content: string }>;
        temperature?: number;
        maxTokens?: number;
    }): Promise<{ content: string }> {
        const obs = getObservability();
        const messages: LangChainMessage[] = request.messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
        }));

        const options: LangChainOptions = {
            ...DEFAULT_LLM_SETTINGS,
            temperature:
                request.temperature ?? DEFAULT_LLM_SETTINGS.temperature,
            maxTokens: request.maxTokens ?? DEFAULT_LLM_SETTINGS.maxTokens,
        };

        try {
            const span = startLLMSpan(obs.telemetry, {
                model: this.llm.name || 'unknown',
                temperature: options.temperature,
                maxTokens: options.maxTokens,
            });
            const response = await obs.telemetry.withSpan(span, async () => {
                const res = await this.llm.call(messages, options);
                if (typeof res !== 'string' && res?.usage) {
                    const usage = res.usage;
                    if (usage?.totalTokens !== undefined) {
                        span.setAttribute(
                            'gen_ai.usage.total_tokens',
                            usage.totalTokens,
                        );
                    }
                    if (usage?.promptTokens !== undefined) {
                        span.setAttribute(
                            'gen_ai.usage.input_tokens',
                            usage.promptTokens,
                        );
                    }
                    if (usage?.completionTokens !== undefined) {
                        span.setAttribute(
                            'gen_ai.usage.output_tokens',
                            usage.completionTokens,
                        );
                    }
                }
                return res;
            });
            const content =
                typeof response === 'string' ? response : response.content;

            return { content };
        } catch (error) {
            this.logger.error('Direct call failed', error as Error);
            throw error;
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 🏭 FACTORY FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

export function createDirectLLMAdapter(
    langchainLLM: LangChainLLM,
): DirectLLMAdapter {
    return new DirectLLMAdapter(langchainLLM);
}

/**
 * Helper para migração de código existente
 */
export function createLLMAdapter(langchainLLM: LangChainLLM): DirectLLMAdapter {
    return createDirectLLMAdapter(langchainLLM);
}
