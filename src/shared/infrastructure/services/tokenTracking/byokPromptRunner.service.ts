import { Injectable } from '@nestjs/common';
import {
    BYOKConfig,
    LLMModelProvider,
    PromptRunnerService,
} from '@kodus/kodus-common/llm';
import { decrypt } from '@/shared/utils/crypto';

@Injectable()
export class BYOKPromptRunnerService {
    private readonly basePromptRunnerService: PromptRunnerService;
    private readonly defaultProvider: LLMModelProvider;
    private readonly fallbackProvider?: LLMModelProvider;
    private readonly byokConfig?: BYOKConfig;
    public readonly executeMode: string;

    constructor(
        basePromptRunnerService: PromptRunnerService,
        provider: LLMModelProvider,
        fallbackProvider?: LLMModelProvider,
        byokConfig?: BYOKConfig,
    ) {
        this.basePromptRunnerService = basePromptRunnerService;
        this.defaultProvider = provider;
        this.fallbackProvider = fallbackProvider;
        this.byokConfig = byokConfig;
        this.executeMode = !!byokConfig ? 'byok' : 'system';
    }

    /**
     * Creates and returns a PromptBuilder already configured with the providers
     * and BYOK settings defined in the constructor.
     *
     * @returns Configured PromptBuilder ready to use
     */
    builder(): any {
        let analysisBuilder = this.basePromptRunnerService
            .builder()
            .setProviders({
                main: this.defaultProvider,
                fallback: this.byokConfig?.fallback
                    ? this.fallbackProvider
                    : undefined,
            });

        if (this.byokConfig?.main) {
            const apiKey = decrypt(this.byokConfig.main.apiKey);
            const fallbackApiKey = decrypt(this.byokConfig?.fallback?.apiKey);

            analysisBuilder = analysisBuilder
                .setBYOKConfig({
                    provider: this.byokConfig.main.provider,
                    apiKey: apiKey,
                    model: this.byokConfig.main.model,
                    baseURL: this.byokConfig.main.baseURL,
                })
                .setBYOKFallbackConfig(
                    this.byokConfig?.fallback?.apiKey
                        ? {
                              provider: this.byokConfig.fallback.provider,
                              apiKey: fallbackApiKey,
                              model: this.byokConfig.fallback.model,
                              baseURL: this.byokConfig.fallback.baseURL,
                          }
                        : null,
                );
        }

        return analysisBuilder;
    }

    /**
     * Convenience method to create a new instance of BYOKPromptRunnerService
     * with different configurations.
     *
     * @param provider Main provider
     * @param fallbackProvider Fallback provider (optional)
     * @param byokConfig BYOK configuration (optional)
     * @returns New instance of BYOKPromptRunnerService
     */
    withConfig(
        provider: LLMModelProvider,
        fallbackProvider?: LLMModelProvider,
        byokConfig?: BYOKConfig,
    ): BYOKPromptRunnerService {
        return new BYOKPromptRunnerService(
            this.basePromptRunnerService,
            provider,
            fallbackProvider,
            byokConfig,
        );
    }

    /**
     * Getter to access the configured default provider
     */
    get provider(): LLMModelProvider {
        return this.defaultProvider;
    }

    /**
     * Getter to access the configured fallback provider
     */
    get fallback(): LLMModelProvider | undefined {
        return this.fallbackProvider;
    }

    /**
     * Getter to access the BYOK configuration
     */
    get config(): BYOKConfig | undefined {
        return this.byokConfig;
    }
}
