import { Injectable } from '@nestjs/common';
import { LLMModelProvider } from '@/core/infrastructure/adapters/services/llmProviders/llm-model-provider.service';

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

export const LLM_PROVIDER_SERVICE_TOKEN = Symbol('LLMProviderService');

export interface ILLMProviderService {
    getLLMProvider(options: {
        model: LLMModelProvider | string;
        temperature: number;
        maxTokens: number;
        callbacks?: BaseCallbackHandler[];
        jsonMode: boolean;
    }): BaseChatModel;
}
