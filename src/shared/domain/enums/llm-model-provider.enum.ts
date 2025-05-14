import {
    getChatAnthropic,
    getChatGemini,
    getChatGPT,
    getChatVertexAI,
    getDeepseekByNovitaAI,
} from '@/shared/utils/langchainCommon/document';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';

export type FactoryInput = {
    model: string;
    temperature: number;
    maxTokens: number;
    callbacks?: BaseCallbackHandler[];
    baseURL?: string;
    apiKey?: string;
};

export enum LLMModelProvider {
    // OpenAI Models
    OPENAI_GPT_4O = 'openai:gpt-4o',
    OPENAI_GPT_4O_MINI = 'openai:gpt-4o-mini',
    OPENAI_GPT_4_1 = 'openai:gpt-4.1',
    OPENAI_GPT_O4_MINI = 'openai:o4-mini',

    // Anthropic Models
    CLAUDE_3_5_SONNET = 'anthropic:claude-3-5-sonnet-20241022',

    // Google AI Models
    GEMINI_2_0_FLASH = 'google:gemini-2.0-flash',
    GEMINI_2_5_PRO_PREVIEW = 'google:gemini-2.5-pro-preview-03-25',
    GEMINI_2_5_PRO_PREVIEW_05_06 = 'google:gemini-2.5-pro-preview-05-06',
    GEMINI_2_5_FLASH_PREVIEW_05_06 = 'google:gemini-2.5-flash-preview-05-06',

    // Vertex AI Models (prefixed with 'vertex-' to differentiate)
    VERTEX_GEMINI_2_0_FLASH = 'vertex:gemini-2.0-flash',
    VERTEX_GEMINI_2_5_PRO_PREVIEW = 'vertex:gemini-2.5-pro-preview-03-25',
    VERTEX_GEMINI_2_5_PRO_PREVIEW_05_06 = 'vertex:gemini-2.5-pro-preview-05-06',
    VERTEX_GEMINI_2_5_FLASH_PREVIEW_05_06 = 'vertex:gemini-2.5-flash-preview-05-06',
    VERTEX_CLAUDE_3_5_SONNET = 'vertex:claude-3-5-sonnet-v2@20241022',

    // Deepseek Models
    NOVITA_DEEPSEEK_V3 = 'novita:deepseek-v3',
    NOVITA_DEEPSEEK_V3_0324 = 'novita:deepseek-v3-0324',
}

export interface ModelStrategy {
    factory: (...args: any[]) => any; // use o tipo correto do seu SDK
    modelName: string; // slug real aceito pela API
    baseURL?: string; // se precisar override
}

export const MODEL_STRATEGIES: Record<LLMModelProvider, ModelStrategy> = {
    // OpenAI
    [LLMModelProvider.OPENAI_GPT_4O]: {
        factory: getChatGPT,
        modelName: 'gpt-4o',
    },
    [LLMModelProvider.OPENAI_GPT_4O_MINI]: {
        factory: getChatGPT,
        modelName: 'gpt-4o-mini',
    },
    [LLMModelProvider.OPENAI_GPT_4_1]: {
        factory: getChatGPT,
        modelName: 'gpt-4.1',
    },
    [LLMModelProvider.OPENAI_GPT_O4_MINI]: {
        factory: getChatGPT,
        modelName: 'o4-mini',
    },

    // Anthropic
    [LLMModelProvider.CLAUDE_3_5_SONNET]: {
        factory: getChatAnthropic,
        modelName: 'claude-3-5-sonnet-20241022',
    },

    // Google Gemini
    [LLMModelProvider.GEMINI_2_0_FLASH]: {
        factory: getChatGemini,
        modelName: 'gemini-2.0-flash',
    },
    [LLMModelProvider.GEMINI_2_5_PRO_PREVIEW]: {
        factory: getChatGemini,
        modelName: 'gemini-2.5-pro-preview-03-25',
    },
    [LLMModelProvider.GEMINI_2_5_PRO_PREVIEW_05_06]: {
        factory: getChatGemini,
        modelName: 'gemini-2.5-pro-preview-05-06',
    },
    [LLMModelProvider.GEMINI_2_5_FLASH_PREVIEW_05_06]: {
        factory: getChatGemini,
        modelName: 'gemini-2.5-flash-preview-05-06',
    },

    // Vertex AI
    [LLMModelProvider.VERTEX_GEMINI_2_0_FLASH]: {
        factory: getChatVertexAI,
        modelName: 'gemini-2.0-flash',
    },
    [LLMModelProvider.VERTEX_GEMINI_2_5_PRO_PREVIEW]: {
        factory: getChatVertexAI,
        modelName: 'gemini-2.5-pro-preview-03-25',
    },
    [LLMModelProvider.VERTEX_GEMINI_2_5_PRO_PREVIEW_05_06]: {
        factory: getChatVertexAI,
        modelName: 'gemini-2.5-pro-preview-05-06',
    },
    [LLMModelProvider.VERTEX_GEMINI_2_5_FLASH_PREVIEW_05_06]: {
        factory: getChatVertexAI,
        modelName: 'gemini-2.5-flash-preview-05-06',
    },
    [LLMModelProvider.VERTEX_CLAUDE_3_5_SONNET]: {
        factory: getChatVertexAI,
        modelName: 'claude-3-5-sonnet-v2@20241022',
    },

    // Deepseek
    [LLMModelProvider.NOVITA_DEEPSEEK_V3]: {
        factory: getDeepseekByNovitaAI,
        modelName: 'deepseek-v3',
    },
    [LLMModelProvider.NOVITA_DEEPSEEK_V3_0324]: {
        factory: getDeepseekByNovitaAI,
        modelName: 'deepseek-v3-0324',
    },
} satisfies Record<LLMModelProvider, ModelStrategy>;
