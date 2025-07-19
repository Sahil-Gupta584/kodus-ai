import { PinoLoggerService } from '../logger/pino.service';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ILLMProviderService } from './llmProvider.service.contract';
import { Injectable } from '@nestjs/common';
import {
    LLMModelProvider,
    MODEL_STRATEGIES,
    ModelStrategy,
    FactoryInput,
    getChatGPT,
} from './llmModelProvider.helper';
import { ChatOpenAI } from '@langchain/openai';
import { Runnable } from '@langchain/core/runnables';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatVertexAI } from '@langchain/google-vertexai';

type LLMProviderOptions = {
    model: LLMModelProvider | string;
    temperature: number;
    callbacks?: BaseCallbackHandler[];
    maxTokens?: number;
    jsonMode?: boolean;
    maxReasoningTokens?: number;
};

type LLMProviderReturn = ChatOpenAI | ChatAnthropic | ChatVertexAI | Runnable;

@Injectable()
export class LLMProviderService implements ILLMProviderService {
    constructor(private readonly logger: PinoLoggerService) {}

    getLLMProvider(options: LLMProviderOptions): LLMProviderReturn {
        try {
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
                    ? llm.bind({ response_format: { type: 'json_object' } })
                    : llm;
            }

            /** Cloud mode – follows the strategy table */
            const strategy = MODEL_STRATEGIES[options.model] as ModelStrategy;
            if (!strategy) {
                this.logger.error({
                    message: `Unsupported provider: ${options.model}`,
                    error: new Error(`Unsupported provider: ${options.model}`),
                    metadata: {
                        requestedModel: options.model,
                        temperature: options.temperature,
                        maxTokens: options.maxTokens,
                        jsonMode: options.jsonMode,
                        maxReasoningTokens:
                            options.maxReasoningTokens
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
                    ? llm.bind({ response_format: { type: 'json_object' } })
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
            } satisfies FactoryInput);

            if (options.jsonMode && strategy.provider === 'openai') {
                llm = llm.bind({ response_format: { type: 'json_object' } });
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
                ? llm.bind({ response_format: { type: 'json_object' } })
                : llm;
        }
    }
}
