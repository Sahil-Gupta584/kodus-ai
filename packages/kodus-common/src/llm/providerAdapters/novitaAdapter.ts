import { ChatOpenAI } from '@langchain/openai';
import { resolveModelOptions } from './resolver';
import { supportsJsonMode } from './capabilities';
import { AdapterBuildParams, ProviderAdapter } from './types';

export class NovitaAdapter implements ProviderAdapter {
    build(params: AdapterBuildParams): ChatOpenAI {
        const { model, apiKey, options } = params;
        const resolved = resolveModelOptions(model, {
            temperature: options?.temperature,
            maxTokens: options?.maxTokens,
        });

        const maxTokens = resolved.resolvedMaxTokens ?? 4096;

        const reasoningEffort =
            resolved.supportsReasoning &&
            resolved.reasoningType === 'level' &&
            resolved.resolvedReasoningLevel
                ? resolved.resolvedReasoningLevel
                : undefined;

        const payload: ConstructorParameters<typeof ChatOpenAI>[0] = {
            modelName: model,
            ...(resolved.temperature !== undefined
                ? { temperature: resolved.temperature }
                : {}),
            ...(maxTokens ? { maxTokens } : {}),
            ...(reasoningEffort
                ? {
                      reasoning: { effort: reasoningEffort },
                      reasoningEffort,
                  }
                : {}),
            ...(options?.jsonMode && supportsJsonMode(model)
                ? {
                      response_format: { type: 'json_object' as const },
                  }
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
