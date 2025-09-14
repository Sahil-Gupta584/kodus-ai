import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { LLMModelProvider, MODEL_STRATEGIES, getChatGPT } from './helper';
import { ChatOpenAI } from '@langchain/openai';
import { Runnable } from '@langchain/core/runnables';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BYOKConfig, BYOKProviderService } from './byokProvider.service';

export type LLMProviderOptions = {
    model: LLMModelProvider | string;
    temperature: number;
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
            if (options.byokConfig) {
                const byokProvider =
                    this.byokProviderService.createBYOKProvider(
                        options.byokConfig,
                        {
                            temperature: options.temperature,
                            maxTokens: options.maxTokens,
                            callbacks: options.callbacks,
                            jsonMode: options.jsonMode,
                            maxReasoningTokens: options.maxReasoningTokens,
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
                const llm = getChatGPT({
                    model: envMode,
                    temperature: options.temperature,
                    maxTokens: options.maxTokens,
                    callbacks: options.callbacks,
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
                    model: MODEL_STRATEGIES[LLMModelProvider.OPENAI_GPT_4O]
                        .modelName,
                    temperature: options.temperature,
                    maxTokens: options.maxTokens,
                    callbacks: options.callbacks,
                });

                return options.jsonMode
                    ? llm.withConfig({
                          response_format: { type: 'json_object' },
                      })
                    : llm;
            }

            const { factory, modelName, baseURL } = strategy;

            let llm = factory({
                model: modelName,
                temperature: options.temperature,
                maxTokens: options.maxTokens,
                callbacks: options.callbacks,
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
            this.logger.error({
                message: 'Error getting LLM provider',
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
                model: MODEL_STRATEGIES[LLMModelProvider.OPENAI_GPT_4O]
                    .modelName,
                temperature: options.temperature,
                maxTokens: options.maxTokens,
                callbacks: options.callbacks,
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
