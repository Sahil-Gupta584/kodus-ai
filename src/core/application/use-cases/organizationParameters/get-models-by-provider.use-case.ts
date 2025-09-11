import { BadRequestException, Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class GetModelsByProviderUseCase {

    constructor(
    ) {}

    async execute(provider: string) {
        switch (provider) {
            case 'openai':
                return this.getOpenAIModels(process.env.API_OPEN_AI_API_KEY);

            case 'anthropic':
                return this.getAnthropicModels(process.env.API_ANTHROPIC_API_KEY);

            case 'gemini':
                return this.getGeminiModels(process.env.API_GOOGLE_AI_API_KEY);

            case 'open_router':
                return this.getOpenRouterModels();

            case 'novita':
                return this.getNovitaModels(process.env.API_NOVITA_API_KEY);

            case 'openai_compatible':
                return this.getOpenAICompatibleModels(
                    process.env.API_OPEN_AI_API_KEY,
                    process.env.API_OPENAI_FORCE_BASE_URL,
                );

            default:
                throw new BadRequestException(
                    `Provider não suportado: ${provider}`,
                );
        }
    }

    private async getOpenAIModels(apiKey?: string) {
        try {
            const response = await axios.get(
                'https://api.openai.com/v1/models',
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                },
            );

            return {
                provider: 'openai',
                models: response.data.data.map((model: any) => ({
                    id: model.id,
                    name: model.id,
                })),
            };
        } catch (error) {
            throw new BadRequestException(
                `Erro ao buscar modelos OpenAI: ${error.message}`,
            );
        }
    }

    private async getAnthropicModels(apiKey?: string) {
        try {
            const response = await axios.get(
                'https://api.anthropic.com/v1/models',
                {
                    headers: {
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                        'Content-Type': 'application/json'
                    }
                }
            );
    
            return {
                provider: 'anthropic',
                models: response.data.data.map((model: any) => ({
                    id: model.id,
                    name: model.display_name || model.id
                }))
            };
        } catch (error) {
            throw new BadRequestException(
                `Erro ao buscar modelos Anthropic: ${error.message}`
            );
        }
    }

    private async getGeminiModels(apiKey?: string) {
        try {
            const response = await axios.get(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
            );

            return {
                provider: 'gemini',
                models: response.data.models
                    .filter((model: any) => model.name.includes('gemini'))
                    .map((model: any) => ({
                        id: model.name.split('/')[1],
                        name: model.displayName || model.name,
                    })),
            };
        } catch (error) {
            throw new BadRequestException(
                `Erro ao buscar modelos Gemini: ${error.message}`,
            );
        }
    }

    private async getOpenRouterModels(apiKey?: string) {
        try {
            const response = await axios.get(
                'https://openrouter.ai/api/v1/models',
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                },
            );

            return {
                provider: 'open_router',
                models: response.data.data.map((model: any) => ({
                    id: model.id,
                    name: model.id,
                })),
            };
        } catch (error) {
            throw new BadRequestException(
                `Erro ao buscar modelos OpenRouter: ${error.message}`,
            );
        }
    }

    private async getNovitaModels(apiKey?: string) {
        try {
            const response = await axios.get(
                'https://api.novita.ai/v3/openai/models',
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                },
            );

            return {
                provider: 'novita',
                models: response.data.data.map((model: any) => ({
                    id: model.id,
                    name: model.id,
                })),
            };
        } catch (error) {
            throw new BadRequestException(
                `Erro ao buscar modelos Novita: ${error.message}`,
            );
        }
    }

    private async getOpenAICompatibleModels(apiKey?: string, baseUrl?: string) {
        if (!baseUrl) {
            throw new BadRequestException(
                'baseUrl é obrigatório para OpenAI Compatible',
            );
        }

        try {
            const modelsUrl = baseUrl.endsWith('/')
                ? `${baseUrl}v1/models`
                : `${baseUrl}/v1/models`;

            const response = await axios.get(modelsUrl, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            });

            return {
                provider: 'openai_compatible',
                models: response.data.data.map((model: any) => ({
                    id: model.id,
                    name: model.id,
                })),
            };
        } catch (error) {
            throw new BadRequestException(
                `Erro ao buscar modelos OpenAI Compatible: ${error.message}`,
            );
        }
    }
}
