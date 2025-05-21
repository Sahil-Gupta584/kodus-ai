import { Injectable } from '@nestjs/common';
import { LLMModelProvider } from '@/core/infrastructure/adapters/services/llmProviders/llmModelProvider.helper';

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Runnable } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';

export const LLM_PROVIDER_SERVICE_TOKEN = Symbol('LLMProviderService');

export interface ILLMProviderService {
    getLLMProvider(options: {
        model: LLMModelProvider | string;
        temperature: number;
        maxTokens: number;
        callbacks?: BaseCallbackHandler[];
        jsonMode: boolean;
    }): ChatOpenAI | Runnable;
}
