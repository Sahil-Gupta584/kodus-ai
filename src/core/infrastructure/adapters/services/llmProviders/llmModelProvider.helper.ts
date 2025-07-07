import { ChatAnthropic } from '@langchain/anthropic';
import { ChatNovitaAI } from '@langchain/community/chat_models/novita';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { ChatOpenAI } from '@langchain/openai';

export const getChatGPT = (options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    verbose?: boolean;
    callbacks?: BaseCallbackHandler[];
    baseURL?: string;
    apiKey?: string;
}): any => {
    const defaultOptions = {
        model: MODEL_STRATEGIES[LLMModelProvider.OPENAI_GPT_4_1].modelName,
        temperature: 0,
        cache: true,
        maxRetries: 10,
        maxConcurrency: 10,
        maxTokens:
            MODEL_STRATEGIES[LLMModelProvider.OPENAI_GPT_4_1].defaultMaxTokens,
        verbose: false,
        streaming: false,
        callbacks: [],
        baseURL: options?.baseURL ? options.baseURL : null,
        apiKey: options?.apiKey
            ? options.apiKey
            : process.env.API_OPEN_AI_API_KEY,
    };

    const finalOptions = options
        ? { ...defaultOptions, ...options }
        : defaultOptions;

    return new ChatOpenAI({
        modelName: finalOptions.model,
        openAIApiKey: finalOptions.apiKey,
        temperature: finalOptions.temperature,
        maxTokens: finalOptions.maxTokens,
        streaming: finalOptions.streaming,
        verbose: finalOptions.verbose,
        callbacks: finalOptions.callbacks,
        configuration: {
            baseURL: finalOptions.baseURL,
            apiKey: finalOptions.apiKey,
        },
    });
};

const getChatAnthropic = (
    options?: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
        verbose?: boolean;
        callbacks?: BaseCallbackHandler[];
        json?: boolean;
    } | null,
): any => {
    const defaultOptions = {
        model: MODEL_STRATEGIES[LLMModelProvider.CLAUDE_3_5_SONNET].modelName,
        temperature: 0,
        maxTokens:
            MODEL_STRATEGIES[LLMModelProvider.CLAUDE_3_5_SONNET]
                .defaultMaxTokens,
        verbose: false,
        streaming: false,
        callbacks: [],
        json: false,
    };

    const finalOptions = options
        ? { ...defaultOptions, ...options }
        : defaultOptions;

    return new ChatAnthropic({
        modelName: finalOptions.model,
        anthropicApiKey: process.env.API_ANTHROPIC_API_KEY,
        temperature: finalOptions.temperature,
        maxTokens: finalOptions.maxTokens,
        callbacks: finalOptions.callbacks,
    });
};

const getChatGemini = (
    options?: {
        model?: string;
        temperature?: number;
        topP?: number;
        maxTokens?: number;
        verbose?: boolean;
        callbacks?: BaseCallbackHandler[];
        json?: boolean;
    } | null,
) => {
    const defaultOptions = {
        model: MODEL_STRATEGIES[LLMModelProvider.GEMINI_2_5_PRO].modelName,
        temperature: 0,
        topP: 1,
        maxTokens:
            MODEL_STRATEGIES[LLMModelProvider.GEMINI_2_5_PRO].defaultMaxTokens,
        verbose: false,
        streaming: false,
        callbacks: [],
        json: false,
    };

    const finalOptions = options
        ? { ...defaultOptions, ...options }
        : defaultOptions;

    return new ChatGoogleGenerativeAI({
        model: finalOptions.model,
        apiKey: process.env.API_GOOGLE_AI_API_KEY,
        temperature: finalOptions.temperature,
        topP: finalOptions.topP,
        maxOutputTokens: finalOptions.maxTokens,
        verbose: finalOptions.verbose,
        callbacks: finalOptions.callbacks,
        json: finalOptions.json,
    });
};

const getChatVertexAI = (
    options?: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
        verbose?: boolean;
        callbacks?: BaseCallbackHandler[];
        json?: boolean;
    } | null,
): any => {
    const defaultOptions = {
        model: MODEL_STRATEGIES[LLMModelProvider.VERTEX_GEMINI_2_5_PRO]
            .modelName,
        temperature: 0,
        maxTokens:
            MODEL_STRATEGIES[LLMModelProvider.VERTEX_GEMINI_2_5_PRO]
                .defaultMaxTokens,
        verbose: false,
        streaming: false,
        callbacks: [],
    };

    const finalOptions = options
        ? { ...defaultOptions, ...options }
        : defaultOptions;

    const credentials = Buffer.from(
        process.env.API_VERTEX_AI_API_KEY || '',
        'base64',
    ).toString('utf-8');

    return new ChatVertexAI({
        model: finalOptions.model,
        authOptions: {
            credentials: JSON.parse(credentials),
            projectId: JSON.parse(credentials).project_id,
        },
        location: 'us-east5',
        temperature: finalOptions.temperature,
        maxOutputTokens: finalOptions.maxTokens,
        verbose: finalOptions.verbose,
        callbacks: finalOptions.callbacks,
    });
};

const getDeepseekByNovitaAI = (
    options?: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
        verbose?: boolean;
        callbacks?: BaseCallbackHandler[];
    } | null,
): any => {
    const defaultOptions = {
        model: MODEL_STRATEGIES[LLMModelProvider.NOVITA_DEEPSEEK_V3].modelName,
        temperature: 0,
        maxTokens:
            MODEL_STRATEGIES[LLMModelProvider.NOVITA_DEEPSEEK_V3]
                .defaultMaxTokens,
        verbose: false,
        streaming: false,
        callbacks: [],
    };

    if (options?.model) {
        options.model = `${options.model}`;
    }

    const finalOptions = options
        ? { ...defaultOptions, ...options }
        : defaultOptions;

    return new ChatNovitaAI({
        model: finalOptions.model,
        apiKey: process.env.API_NOVITA_AI_API_KEY,
        temperature: finalOptions.temperature,
        maxTokens: finalOptions.maxTokens,
        callbacks: finalOptions.callbacks,
    });
};

export type FactoryInput = {
    model: string;
    temperature: number;
    maxTokens: number;
    callbacks?: BaseCallbackHandler[];
    baseURL?: string;
    apiKey?: string;
    json?: boolean;
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
    GEMINI_2_5_PRO = 'google:gemini-2.5-pro',
    GEMINI_2_5_FLASH = 'google:gemini-2.5-flash',

    // Vertex AI Models (prefixed with 'vertex-' to differentiate)
    VERTEX_GEMINI_2_0_FLASH = 'vertex:gemini-2.0-flash',
    VERTEX_GEMINI_2_5_PRO = 'vertex:gemini-2.5-pro',
    VERTEX_GEMINI_2_5_FLASH = 'vertex:gemini-2.5-flash',
    VERTEX_CLAUDE_3_5_SONNET = 'vertex:claude-3-5-sonnet-v2@20241022',

    // Deepseek Models
    NOVITA_DEEPSEEK_V3 = 'novita:deepseek-v3',
    NOVITA_DEEPSEEK_V3_0324 = 'novita:deepseek-v3-0324',
}

export interface ModelStrategy {
    readonly provider: string;
    readonly factory: (...args: any[]) => any;
    readonly modelName: string;
    readonly defaultMaxTokens: number;
    readonly baseURL?: string;
    readonly inputMaxTokens?: number;
}

export const MODEL_STRATEGIES: Record<LLMModelProvider, ModelStrategy> = {
    // OpenAI
    [LLMModelProvider.OPENAI_GPT_4O]: {
        provider: 'openai',
        factory: getChatGPT,
        modelName: 'gpt-4o',
        defaultMaxTokens: -1,
    },
    [LLMModelProvider.OPENAI_GPT_4O_MINI]: {
        provider: 'openai',
        factory: getChatGPT,
        modelName: 'gpt-4o-mini',
        defaultMaxTokens: -1,
    },
    [LLMModelProvider.OPENAI_GPT_4_1]: {
        provider: 'openai',
        factory: getChatGPT,
        modelName: 'gpt-4.1',
        defaultMaxTokens: -1,
    },
    [LLMModelProvider.OPENAI_GPT_O4_MINI]: {
        provider: 'openai',
        factory: getChatGPT,
        modelName: 'o4-mini',
        defaultMaxTokens: -1,
    },

    // Anthropic
    [LLMModelProvider.CLAUDE_3_5_SONNET]: {
        provider: 'anthropic',
        factory: getChatAnthropic,
        modelName: 'claude-3-5-sonnet-20241022',
        defaultMaxTokens: -1,
    },

    // Google Gemini
    [LLMModelProvider.GEMINI_2_0_FLASH]: {
        provider: 'google',
        factory: getChatGemini,
        modelName: 'gemini-2.0-flash',
        defaultMaxTokens: 8000,
    },
    [LLMModelProvider.GEMINI_2_5_PRO]: {
        provider: 'google',
        factory: getChatGemini,
        modelName: 'gemini-2.5-pro',
        defaultMaxTokens: 60000,
        inputMaxTokens: 1000000,
    },
    [LLMModelProvider.GEMINI_2_5_FLASH]: {
        provider: 'google',
        factory: getChatGemini,
        modelName: 'gemini-2.5-flash',
        defaultMaxTokens: 60000,
    },

    // Vertex AI
    [LLMModelProvider.VERTEX_GEMINI_2_0_FLASH]: {
        provider: 'vertex',
        factory: getChatVertexAI,
        modelName: 'gemini-2.0-flash',
        defaultMaxTokens: 8000,
    },
    [LLMModelProvider.VERTEX_GEMINI_2_5_PRO]: {
        provider: 'vertex',
        factory: getChatVertexAI,
        modelName: 'gemini-2.5-pro',
        defaultMaxTokens: 60000,
    },
    [LLMModelProvider.VERTEX_GEMINI_2_5_FLASH]: {
        provider: 'vertex',
        factory: getChatVertexAI,
        modelName: 'gemini-2.5-flash',
        defaultMaxTokens: 60000,
    },

    [LLMModelProvider.VERTEX_CLAUDE_3_5_SONNET]: {
        provider: 'vertex',
        factory: getChatVertexAI,
        modelName: 'claude-3-5-sonnet-v2@20241022',
        defaultMaxTokens: 4000,
        inputMaxTokens: 200000,
    },

    // Deepseek
    [LLMModelProvider.NOVITA_DEEPSEEK_V3]: {
        provider: 'novita',
        factory: getDeepseekByNovitaAI,
        modelName: 'deepseek/deepseek_v3',
        defaultMaxTokens: 20000,
    },
    [LLMModelProvider.NOVITA_DEEPSEEK_V3_0324]: {
        provider: 'novita',
        factory: getDeepseekByNovitaAI,
        modelName: 'deepseek/deepseek-v3-0324',
        defaultMaxTokens: 20000,
    },
} satisfies Record<LLMModelProvider, ModelStrategy>;
