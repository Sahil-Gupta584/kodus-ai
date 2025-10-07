import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { ProviderService } from '@/core/infrastructure/adapters/services/providers/provider.service';
import {
    BYOKProvider,
    getModelCapabilities,
    ReasoningConfig,
} from '@kodus/kodus-common/llm';

// Interfaces para as respostas das APIs
interface OpenAIModel {
    id: string;
    object: string;
    created: number;
    owned_by: string;
}

interface OpenAIResponse {
    object: string;
    data: OpenAIModel[];
}

interface AnthropicModel {
    id: string;
    display_name?: string;
    context_length: number;
    pricing: {
        prompt: string;
        completion: string;
    };
}

interface AnthropicResponse {
    data: AnthropicModel[];
}

interface GeminiModel {
    name: string;
    displayName?: string;
    description?: string;
    supportedGenerationMethods: string[];
}

interface GeminiResponse {
    models: GeminiModel[];
}

interface VertexModel {
    name: string;
    displayName?: string;
    description?: string;
    versionId?: string;
    versionCreateTime?: string;
    versionUpdateTime?: string;
    versionDescription?: string;
    supportedDeploymentResourcesTypes?: string[];
    supportedInputStorageFormats?: string[];
    supportedOutputStorageFormats?: string[];
}

interface VertexResponse {
    models: VertexModel[];
    nextPageToken?: string;
}

export interface ModelResponse {
    provider: BYOKProvider;
    models: Array<{
        id: string;
        name: string;
        supportsReasoning?: boolean;
        reasoningConfig?: ReasoningConfig;
    }>;
}

@Injectable()
export class GetModelsByProviderUseCase {
    constructor(private readonly providerService: ProviderService) {}

    async execute(provider: string): Promise<ModelResponse> {
        if (!this.providerService.isProviderSupported(provider)) {
            throw new BadRequestException(
                `Provider não suportado: ${provider}`,
            );
        }

        const byokProvider = provider as BYOKProvider;

        switch (byokProvider) {
            case BYOKProvider.OPENAI:
                return this.getOpenAIModels(process.env.API_OPEN_AI_API_KEY);

            case BYOKProvider.ANTHROPIC:
                return this.getAnthropicModels(
                    process.env.API_ANTHROPIC_API_KEY,
                );

            case BYOKProvider.GOOGLE_GEMINI:
                return this.getGeminiModels(process.env.API_GOOGLE_AI_API_KEY);

            case BYOKProvider.GOOGLE_VERTEX:
                return this.getVertexModels(process.env.API_GOOGLE_AI_API_KEY);

            case BYOKProvider.OPEN_ROUTER:
                return this.getOpenRouterModels(
                    process.env.API_OPEN_ROUTER_API_KEY,
                );

            case BYOKProvider.NOVITA:
                return this.getNovitaModels(process.env.API_NOVITA_API_KEY);

            case BYOKProvider.OPENAI_COMPATIBLE:
                return this.getOpenAICompatibleModels(
                    process.env.API_OPEN_AI_API_KEY,
                    process.env.API_OPENAI_FORCE_BASE_URL ||
                        'https://api.openai.com',
                );

            default:
                throw new BadRequestException(
                    `Provider não suportado: ${provider}`,
                );
        }
    }

    private async getOpenAIModels(apiKey?: string): Promise<ModelResponse> {
        try {
            const response = await axios.get<OpenAIResponse>(
                'https://api.openai.com/v1/models',
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                },
            );

            const models = {
                provider: BYOKProvider.OPENAI,
                models: response.data.data.map((model: OpenAIModel) => {
                    const capabilities = getModelCapabilities(model.id);
                    const modelResult = {
                        id: model.id,
                        name: model.id,
                        ...(capabilities.supportsReasoning && {
                            supportsReasoning: true,
                            reasoningConfig: capabilities.reasoningConfig,
                        }),
                    };

                    return modelResult;
                }),
            };

            return models;
        } catch (error) {
            throw new BadRequestException(
                `Erro ao buscar modelos OpenAI: ${(error as Error).message}`,
            );
        }
    }

    private async getAnthropicModels(apiKey?: string): Promise<ModelResponse> {
        try {
            const response = await axios.get<AnthropicResponse>(
                'https://api.anthropic.com/v1/models',
                {
                    headers: {
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                        'Content-Type': 'application/json',
                    },
                },
            );

            return {
                provider: BYOKProvider.ANTHROPIC,
                models: response.data.data.map((model: AnthropicModel) => ({
                    id: model.id,
                    name: model.display_name || model.id,
                })),
            };
        } catch (error) {
            throw new BadRequestException(
                `Erro ao buscar modelos Anthropic: ${(error as Error).message}`,
            );
        }
    }

    private async getGeminiModels(apiKey?: string): Promise<ModelResponse> {
        try {
            const response = await axios.get<GeminiResponse>(
                'https://generativelanguage.googleapis.com/v1beta/models',
                {
                    headers: {
                        'x-goog-api-key': apiKey,
                    },
                    timeout: 10000, // 10 segundos timeout
                },
            );

            const models = {
                provider: BYOKProvider.GOOGLE_GEMINI,
                models: response.data.models
                    .filter((model: GeminiModel) =>
                        model.name.includes('gemini'),
                    )
                    .map((model: GeminiModel) => {
                        const modelId = model.name.split('/')[1];
                        const capabilities = getModelCapabilities(modelId);

                        const formatModelName = (str: string): string => {
                            return str
                                .split('-')
                                .map((word, index) => {
                                    if (index === 0) {
                                        // Primeira palavra sempre capitalizada
                                        return (
                                            word.charAt(0).toUpperCase() +
                                            word.slice(1).toLowerCase()
                                        );
                                    }
                                    // Números com pontos mantêm como estão
                                    if (/^\d+\.\d+$/.test(word)) {
                                        return word;
                                    }
                                    // Outras palavras capitalizam primeira letra
                                    return (
                                        word.charAt(0).toUpperCase() +
                                        word.slice(1).toLowerCase()
                                    );
                                })
                                .join(' ');
                        };

                        return {
                            id: modelId,
                            name: formatModelName(modelId),
                            ...(capabilities.supportsReasoning && {
                                supportsReasoning: true,
                                reasoningConfig: capabilities.reasoningConfig,
                            }),
                        };
                    }),
            };

            return models;
        } catch (error) {
            throw new BadRequestException(
                `Erro ao buscar modelos Gemini: ${(error as Error).message}`,
            );
        }
    }
    private async getOpenRouterModels(apiKey?: string): Promise<ModelResponse> {
        try {
            const response = await axios.get<OpenAIResponse>(
                'https://openrouter.ai/api/v1/models',
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                },
            );

            return {
                provider: BYOKProvider.OPEN_ROUTER,
                models: response.data.data.map((model: OpenAIModel) => ({
                    id: model.id,
                    name: model.id,
                })),
            };
        } catch (error) {
            throw new BadRequestException(
                `Erro ao buscar modelos OpenRouter: ${(error as Error).message}`,
            );
        }
    }

    private async getNovitaModels(apiKey?: string): Promise<ModelResponse> {
        try {
            const response = await axios.get<OpenAIResponse>(
                'https://api.novita.ai/v3/openai/models',
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                },
            );

            return {
                provider: BYOKProvider.NOVITA,
                models: response.data.data.map((model: OpenAIModel) => ({
                    id: model.id,
                    name: model.id,
                })),
            };
        } catch (error) {
            throw new BadRequestException(
                `Erro ao buscar modelos Novita: ${(error as Error).message}`,
            );
        }
    }

    private async getOpenAICompatibleModels(
        apiKey?: string,
        baseUrl?: string,
    ): Promise<ModelResponse> {
        if (!baseUrl) {
            throw new BadRequestException(
                'baseUrl é obrigatório para OpenAI Compatible',
            );
        }

        try {
            const modelsUrl = baseUrl.endsWith('/')
                ? `${baseUrl}v1/models`
                : `${baseUrl}/v1/models`;

            const response = await axios.get<OpenAIResponse>(modelsUrl, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            });

            return {
                provider: BYOKProvider.OPENAI_COMPATIBLE,
                models: response.data.data.map((model: OpenAIModel) => ({
                    id: model.id,
                    name: model.id,
                })),
            };
        } catch (error) {
            throw new BadRequestException(
                `Erro ao buscar modelos OpenAI Compatible: ${(error as Error).message}`,
            );
        }
    }

    private async getVertexModels(apiKey?: string): Promise<ModelResponse> {
        try {
            if (!apiKey) {
                throw new BadRequestException(
                    'API key é obrigatória para Google Vertex',
                );
            }

            console.log(
                '🔍 Buscando modelos Vertex com API key:',
                apiKey.substring(0, 10) + '...',
            );

            // Use Gemini API to list models and map to Vertex
            const response = await axios.get<GeminiResponse>(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
            );

            console.log(
                '✅ Resposta Gemini recebida:',
                response.data.models?.length || 0,
                'modelos',
            );

            return {
                provider: BYOKProvider.GOOGLE_VERTEX,
                models: response.data.models
                    .filter(
                        (model: GeminiModel) =>
                            model.name.includes('gemini') &&
                            model.supportedGenerationMethods.includes(
                                'generateContent',
                            ),
                    )
                    .map((model: GeminiModel) => ({
                        id: model.name.split('/')[1],
                        name: `Vertex ${model.displayName || model.name}`,
                    })),
            };
        } catch (error) {
            console.error('❌ Erro ao buscar modelos Vertex:', error);
            throw new BadRequestException(
                `Erro ao buscar modelos Google Vertex: ${(error as Error).message}`,
            );
        }
    }
}
