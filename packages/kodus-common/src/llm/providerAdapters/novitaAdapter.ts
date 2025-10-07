import { ChatOpenAI } from '@langchain/openai';
import { resolveModelOptions } from './resolver';
import { AdapterBuildParams, ProviderAdapter } from './types';

export class NovitaAdapter implements ProviderAdapter {
    build(params: AdapterBuildParams): ChatOpenAI {
        const { model, apiKey, options } = params;
        const resolved = resolveModelOptions(model, {
            temperature: options?.temperature,
            maxTokens: options?.maxTokens,
        });

        const maxTokens = resolved.resolvedMaxTokens ?? 4096;

        const payload: ConstructorParameters<typeof ChatOpenAI>[0] = {
            modelName: model,
            ...(resolved.temperature !== undefined
                ? { temperature: resolved.temperature }
                : {}),
            ...(maxTokens ? { maxTokens } : {}),
            ...(resolved.supportsReasoning &&
            resolved.reasoningType === 'level' &&
            resolved.resolvedReasoningLevel
                ? { reasoning: { effort: resolved.resolvedReasoningLevel } }
                : {}),
            callbacks: options?.callbacks,
            configuration: {
                baseURL: 'https://api.novita.ai/v3/openai',
                apiKey,
            },
        };

        return new ChatOpenAI(payload);
    }
}
