import OpenAI from 'openai';
import { PinoLoggerService } from '../logger/pino.service';
import {
    FactoryInput,
    LLMModelProvider,
    MODEL_STRATEGIES,
    ModelStrategy,
} from '@/shared/domain/enums/llm-model-provider.enum';

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { getChatGPT } from '@/shared/utils/langchainCommon/document';

export class LLMProviderService {
    constructor(private readonly logger: PinoLoggerService) {}

    getLLMProvider(options: {
        model: LLMModelProvider | string;
        temperature: number;
        maxTokens: number;
        callbacks?: BaseCallbackHandler[];
        jsonMode: boolean;
    }) {
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
                message: 'Unsupported provider',
                error: new Error(`Unsupported provider: ${options.model}`),
                metadata: {
                    model: options.model,
                },
                context: LLMProviderService.name,
            });

            const llm = getChatGPT({
                model: options.model,
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
        } satisfies FactoryInput);

        if (options.jsonMode && strategy.provider === 'openai') {
            llm = llm.bind({ response_format: { type: 'json_object' } });
        }

        return llm;
    }
}
