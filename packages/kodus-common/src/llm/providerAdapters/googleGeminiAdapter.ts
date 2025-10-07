import { ChatGoogle } from '@langchain/google-gauth';
import { resolveModelOptions } from './resolver';
import { buildJsonModeOptions } from './jsonMode';
import { AdapterBuildParams, ProviderAdapter } from './types';

export class GoogleGeminiAdapter implements ProviderAdapter {
    build(params: AdapterBuildParams): ChatGoogle {
        const { model, apiKey, options } = params;
        const resolved = resolveModelOptions(model, {
            temperature: options?.temperature,
            maxTokens: options?.maxTokens,
        });

        const payload: ConstructorParameters<typeof ChatGoogle>[0] = {
            model,
            apiKey,
            ...(resolved.temperature !== undefined
                ? { temperature: resolved.temperature }
                : {}),
            ...(resolved.resolvedMaxTokens
                ? { maxOutputTokens: resolved.resolvedMaxTokens }
                : {}),
            callbacks: options?.callbacks,
            ...buildJsonModeOptions('google_gemini', options?.jsonMode),
            ...(resolved.supportsReasoning &&
            resolved.reasoningType === 'budget' &&
            resolved.resolvedReasoningTokens
                ? { maxReasoningTokens: resolved.resolvedReasoningTokens }
                : {}),
        };

        return new ChatGoogle(payload);
    }
}
