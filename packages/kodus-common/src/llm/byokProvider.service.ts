import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogle } from '@langchain/google-gauth';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Callbacks } from '@langchain/core/callbacks/manager';
import { getModelCapabilities, supportsTemperature } from './modelCapabilities';

export enum BYOKProvider {
    OPENAI = 'openai',
    ANTHROPIC = 'anthropic',
    GOOGLE_GEMINI = 'google_gemini',
    GOOGLE_VERTEX = 'google_vertex',
    OPENAI_COMPATIBLE = 'openai_compatible',
    OPEN_ROUTER = 'open_router',
    NOVITA = 'novita',
}

export interface BYOKConfig {
    main: {
        provider: BYOKProvider;
        apiKey: string;
        model: string;
        baseURL?: string;
    };
    fallback?: {
        provider: BYOKProvider;
        apiKey: string;
        model: string;
        baseURL?: string;
    };
}

@Injectable()
export class BYOKProviderService {
    /**
     * Creates a BYOK provider instance based on configuration
     */
    createBYOKProvider(
        config: BYOKConfig,
        options?: {
            temperature?: number;
            maxTokens?: number;
            callbacks?: Callbacks;
            jsonMode?: boolean;
            maxReasoningTokens?: number;
        },
    ): BaseChatModel {
        const { provider, apiKey, model, baseURL } = config.main;

        const defaultOptions: Record<string, unknown> = {
            maxTokens: options?.maxTokens ?? -1,
            callbacks: options?.callbacks ?? [],
            temperature: options?.temperature ?? 0,
            maxReasoningTokens: options?.maxReasoningTokens ?? 1,
        };

        const capabilities = getModelCapabilities(model);
        console.log('@@capabilities 1111', capabilities);

        if (!supportsTemperature(model)) {
            delete defaultOptions.temperature;
        }

        // Cria commonOptions sem maxReasoningTokens (usado apenas no Gemini)
        const commonOptions: Record<string, any> = {
            maxTokens: defaultOptions.maxTokens,
            callbacks: defaultOptions.callbacks,
        };

        if (defaultOptions.temperature !== undefined) {
            commonOptions.temperature = defaultOptions.temperature;
        }

        switch (provider) {
            case BYOKProvider.OPENAI:
                return new ChatOpenAI({
                    modelName: model,
                    openAIApiKey: apiKey,
                    ...commonOptions,
                    configuration: {
                        apiKey: apiKey,
                    },
                });

            case BYOKProvider.OPENAI_COMPATIBLE:
                if (!baseURL) {
                    throw new Error(
                        'baseURL is required for OpenAI Compatible provider',
                    );
                }
                return new ChatOpenAI({
                    modelName: model,
                    openAIApiKey: apiKey,
                    ...commonOptions,
                    configuration: {
                        baseURL: baseURL,
                        apiKey: apiKey,
                    },
                });

            case BYOKProvider.OPEN_ROUTER:
                return new ChatOpenAI({
                    modelName: model,
                    openAIApiKey: apiKey,
                    ...commonOptions,
                    configuration: {
                        baseURL: 'https://openrouter.ai/api/v1',
                        apiKey: apiKey,
                    },
                });

            case BYOKProvider.ANTHROPIC: {
                const defaultMaxTokensByModel: Record<string, number> = {
                    'claude-opus-4-1-20250805': 15000,
                    'claude-opus-4-20250514': 15000,
                    'claude-sonnet-4-5-20250929': 15000,
                    'claude-sonnet-4-20250514': 15000,
                    'claude-3-7-sonnet-20250219': 15000,
                    'claude-3-5-sonnet-20241022': 8192,
                    'claude-3-5-haiku-20241022': 8192,
                    'claude-3-5-sonnet-20240620': 8192,
                    'claude-3-haiku-20240307': 4096,
                    'claude-3-opus-20240229': 4096,
                };
                const maxTokensOptions = defaultMaxTokensByModel[model] ?? 4096;

                return new ChatAnthropic({
                    modelName: model,
                    anthropicApiKey: apiKey,
                    temperature: commonOptions.temperature as number,
                    maxTokens: maxTokensOptions,
                    callbacks: commonOptions.callbacks as Callbacks,
                });
            }

            case BYOKProvider.GOOGLE_GEMINI: {
                // Gemini usa maxOutputTokens ao invés de maxTokens e requer valores positivos
                const capabilities = getModelCapabilities(model);
                console.log('@@capabilities', capabilities);
                const geminiOptions: Record<string, unknown> = {
                    model: model,
                    apiKey: apiKey,
                    callbacks: defaultOptions.callbacks,
                };

                if (defaultOptions.temperature !== undefined) {
                    geminiOptions.temperature = defaultOptions.temperature;
                }

                // Só passa maxOutputTokens se for um valor válido (> 0)
                const maxTokens = defaultOptions.maxTokens as number;
                if (maxTokens > 0) {
                    geminiOptions.maxOutputTokens = maxTokens;
                }

                // Só passa maxReasoningTokens se for um valor válido (> 0)
                if (capabilities && capabilities.supportsReasoning) {
                    const maxReasoningTokens =
                        typeof capabilities.reasoningConfig?.options ===
                            'object' &&
                        !Array.isArray(capabilities.reasoningConfig.options) &&
                        'default' in capabilities.reasoningConfig.options
                            ? capabilities.reasoningConfig.options.default
                            : 1;
                    geminiOptions.maxReasoningTokens = maxReasoningTokens;
                }

                // Configurar JSON mode se necessário
                if (options?.jsonMode) {
                    geminiOptions.responseMimeType = 'application/json';
                }

                return new ChatGoogle(geminiOptions);
            }

            case BYOKProvider.NOVITA: {
                const novitaMaxTokens = commonOptions.maxTokens as number;
                return this.createNovitaProvider({
                    model,
                    apiKey,
                    temperature:
                        (commonOptions.temperature as number | undefined) ?? 0,
                    maxTokens: novitaMaxTokens > 0 ? novitaMaxTokens : 4096,
                    callbacks: commonOptions.callbacks as Callbacks,
                });
            }

            case BYOKProvider.GOOGLE_VERTEX:
                throw new Error(
                    'Google Vertex BYOK requires special credential handling - not implemented yet',
                );

            default:
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                throw new Error(`Unsupported BYOK provider: ${provider}`);
        }
    }

    /**
     * Creates a Novita provider instance
     * Using OpenAI compatible interface since Novita supports OpenAI API format
     */
    private createNovitaProvider(params: {
        model: string;
        apiKey: string;
        temperature: number;
        maxTokens: number;
        callbacks: Callbacks;
    }): BaseChatModel {
        return new ChatOpenAI({
            modelName: params.model,
            temperature: params.temperature,
            maxTokens: params.maxTokens,
            callbacks: params.callbacks,
            configuration: {
                baseURL: 'https://api.novita.ai/v3/openai',
                apiKey: params.apiKey,
            },
        });
    }

    /**
     * Creates a fallback provider if available
     */
    createFallbackProvider(
        config: BYOKConfig,
        options?: {
            temperature?: number;
            maxTokens?: number;
            callbacks?: Callbacks;
            jsonMode?: boolean;
            maxReasoningTokens?: number;
        },
    ): BaseChatModel | null {
        if (!config.fallback) {
            return null;
        }

        // Temporarily replace main config with fallback for creation
        const fallbackConfig: BYOKConfig = {
            main: config.fallback,
        };

        return this.createBYOKProvider(fallbackConfig, options);
    }

    /**
     * Validates if the provider configuration is complete
     */
    validateProviderConfig(providerConfig: {
        region: any;
        projectId: any;
        provider: BYOKProvider;
        apiKey: string;
        model: string;
        baseURL?: string;
    }): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!providerConfig.provider) {
            errors.push('Provider is required');
        }

        if (!providerConfig.apiKey) {
            errors.push('API key is required');
        }

        if (!providerConfig.model) {
            errors.push('Model is required');
        }

        // Check provider-specific requirements
        if (
            providerConfig.provider === BYOKProvider.OPENAI_COMPATIBLE &&
            !providerConfig.baseURL
        ) {
            errors.push('baseURL is required for OpenAI Compatible provider');
        }

        if (providerConfig.provider === BYOKProvider.GOOGLE_VERTEX) {
            if (!providerConfig.projectId) {
                errors.push('projectId is required for Google Vertex AI');
            }
            if (!providerConfig.region) {
                errors.push('region is required for Google Vertex AI');
            }
            // Validate if apiKey is valid JSON
            try {
                JSON.parse(providerConfig.apiKey);
            } catch {
                errors.push(
                    'apiKey must be a valid JSON service account key for Google Vertex AI',
                );
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
        };
    }

    /**
     * Gets the display name for a provider
     */
    getProviderDisplayName(provider: BYOKProvider): string {
        const displayNames = {
            [BYOKProvider.OPENAI]: 'OpenAI',
            [BYOKProvider.ANTHROPIC]: 'Anthropic',
            [BYOKProvider.GOOGLE_GEMINI]: 'Google Gemini',
            [BYOKProvider.GOOGLE_VERTEX]: 'Google Vertex',
            [BYOKProvider.OPENAI_COMPATIBLE]: 'OpenAI Compatible',
            [BYOKProvider.OPEN_ROUTER]: 'OpenRouter',
            [BYOKProvider.NOVITA]: 'Novita',
        };

        return displayNames[provider] || provider;
    }
}
