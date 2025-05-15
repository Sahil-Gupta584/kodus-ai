import { Injectable } from '@nestjs/common';
import { LLMModelProvider } from '@/shared/domain/enums/llm-model-provider.enum';

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
