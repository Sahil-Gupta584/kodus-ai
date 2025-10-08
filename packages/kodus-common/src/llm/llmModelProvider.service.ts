import { Inject, Injectable, LoggerService } from '@nestjs/common';
import {
    FactoryArgs,
    LLMModelProvider,
    MODEL_STRATEGIES,
    getChatGPT,
} from './helper';
import { ChatOpenAI } from '@langchain/openai';
import { Runnable } from '@langchain/core/runnables';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BYOKConfig, BYOKProviderService } from './byokProvider.service';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';

export type LLMProviderOptions = FactoryArgs & {
    model: LLMModelProvider | string;
    callbacks?: BaseCallbackHandler[];
    maxTokens?: number;
    jsonMode?: boolean;
    maxReasoningTokens?: number;
    byokConfig?: BYOKConfig;
};

export type LLMProviderReturn = (BaseChatModel | Runnable) & {
    invoke: (input: any, options?: any) => Promise<any>;
};

@Injectable()
export class LLMProviderService {
    constructor(
        @Inject('LLM_LOGGER')
        private readonly logger: LoggerService,
        private readonly byokProviderService: BYOKProviderService,
    ) {}

    getLLMProvider(options: LLMProviderOptions): LLMProviderReturn {
        try {
            if (options.byokConfig?.main?.apiKey) {
                const byokProvider =
                    this.byokProviderService.createBYOKProvider(
                        options.byokConfig,
                        {
                            ...options,
                            jsonMode: options.jsonMode,
                        },
                    );

                if (options.jsonMode && byokProvider instanceof ChatOpenAI) {
                    return byokProvider.withConfig({
                        response_format: { type: 'json_object' },
                    });
                }

                return byokProvider;
            }

            const envMode = process.env.API_LLM_PROVIDER_MODEL ?? 'auto';

            if (envMode !== 'auto') {
                // for self-hosted: using openAI provider and changing baseURL
                if (!process.env.API_OPEN_AI_API_KEY) {
                    throw new Error(
                        'API_OPEN_AI_API_KEY not configured for self-hosted mode',
                    );
                }

                const llm = getChatGPT({
                    ...options,
                    model: envMode,
                    baseURL: process.env.API_OPENAI_FORCE_BASE_URL,
                    apiKey: process.env.API_OPEN_AI_API_KEY,
                });

                return options.jsonMode
                    ? llm.withConfig({
                          response_format: { type: 'json_object' },
                      })
                    : llm;
            }

            /** Cloud mode – follows the strategy table */
            const strategy =
                MODEL_STRATEGIES[options.model as LLMModelProvider];
            if (!strategy) {
                this.logger.error({
                    message: `Unsupported provider: ${options.model}`,
                    error: new Error(`Unsupported provider: ${options.model}`),
                    metadata: {
                        requestedModel: options.model,
                        temperature: options.temperature,
                        maxTokens: options.maxTokens,
                        jsonMode: options.jsonMode,
                        maxReasoningTokens: options.maxReasoningTokens,
                    },
                    context: LLMProviderService.name,
                });

                const llm = getChatGPT({
                    ...options,
                    model: MODEL_STRATEGIES[LLMModelProvider.OPENAI_GPT_4O]
                        .modelName,
                    apiKey: process.env.API_OPEN_AI_API_KEY,
                });

                return options.jsonMode
                    ? llm.withConfig({
                          response_format: { type: 'json_object' },
                      })
                    : llm;
            }

            const { factory, modelName, baseURL } = strategy;

            let llm = factory({
                ...options,
                model: modelName,
                baseURL,
                json: options.jsonMode,
                maxReasoningTokens:
                    options.maxReasoningTokens ?? strategy.maxReasoningTokens,
            });

            if (options.jsonMode && this.isOpenAI(llm, strategy.provider)) {
                llm = llm.withConfig({
                    response_format: { type: 'json_object' },
                });
            }

            return llm;
        } catch (error) {
            // Se o erro veio de BYOK, deve propagar (não fazer fallback)
            if (options.byokConfig?.main?.apiKey) {
                this.logger.error({
                    message: 'BYOK provider failed - propagating error',
                    metadata: {
                        attemptedModel: options.model,
                        byokProvider: options.byokConfig.main.provider,
                    },
                    context: LLMProviderService.name,
                    error:
                        error instanceof Error
                            ? error
                            : new Error(String(error)),
                });
                throw error;
            }

            // Para outros erros (cloud/self-hosted), usa fallback
            this.logger.error({
                message: 'Error getting LLM provider - using fallback',
                metadata: {
                    attemptedModel: options.model,
                    attemptedTemperature: options.temperature,
                    attemptedMaxTokens: options.maxTokens,
                    attemptedJsonMode: options.jsonMode,
                },
                context: LLMProviderService.name,
                error:
                    error instanceof Error ? error : new Error(String(error)),
            });

            const llm = getChatGPT({
                ...options,
                model: MODEL_STRATEGIES[LLMModelProvider.OPENAI_GPT_4O]
                    .modelName,
                apiKey: process.env.API_OPEN_AI_API_KEY,
            });

            return options.jsonMode
                ? llm.withConfig({ response_format: { type: 'json_object' } })
                : llm;
        }
    }

    private isOpenAI(
        llm: BaseChatModel | Runnable,
        provider: string,
    ): llm is ChatOpenAI {
        return llm instanceof ChatOpenAI || provider === 'openai';
    }
}
