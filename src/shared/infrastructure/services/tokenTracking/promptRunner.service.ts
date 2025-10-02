import { Injectable } from '@nestjs/common';
import {
    BYOKConfig,
    LLMModelProvider,
    PromptRunnerService as BasePromptRunnerService,
    PromptBuilder,
} from '@kodus/kodus-common/llm';
import { decrypt } from '@/shared/utils/crypto';

@Injectable()
export class PromptRunnerService {
    private readonly basePromptRunnerService: BasePromptRunnerService;
    private readonly defaultProvider: LLMModelProvider;
    private readonly fallbackProvider?: LLMModelProvider;
    private readonly byokConfig?: BYOKConfig;

    constructor(
        basePromptRunnerService: BasePromptRunnerService,
        provider: LLMModelProvider,
        fallbackProvider?: LLMModelProvider,
        byokConfig?: BYOKConfig,
    ) {
        this.basePromptRunnerService = basePromptRunnerService;
        this.defaultProvider = provider;
        this.fallbackProvider = fallbackProvider;
        this.byokConfig = byokConfig;
    }

    /**
     * Cria e retorna um PromptBuilder já configurado com os providers
     * e configurações BYOK definidos no construtor.
     *
     * @returns PromptBuilder configurado e pronto para uso
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
            analysisBuilder = analysisBuilder
                .setBYOKConfig({
                    provider: this.byokConfig.main.provider,
                    apiKey: decrypt(this.byokConfig.main.apiKey),
                    model: this.byokConfig.main.model,
                    baseURL: this.byokConfig.main.baseURL,
                })
                .setBYOKFallbackConfig(
                    this.byokConfig?.fallback?.apiKey
                        ? {
                              provider: this.byokConfig.fallback.provider,
                              apiKey: decrypt(this.byokConfig.fallback.apiKey),
                              model: this.byokConfig.fallback.model,
                              baseURL: this.byokConfig.fallback.baseURL,
                          }
                        : null,
                );
        }

        return analysisBuilder;
    }

    /**
     * Método de conveniência para criar uma nova instância do PromptRunnerService
     * com configurações diferentes.
     *
     * @param provider Provider principal
     * @param fallbackProvider Provider de fallback (opcional)
     * @param byokConfig Configuração BYOK (opcional)
     * @returns Nova instância do PromptRunnerService
     */
    withConfig(
        provider: LLMModelProvider,
        fallbackProvider?: LLMModelProvider,
        byokConfig?: BYOKConfig,
    ): PromptRunnerService {
        return new PromptRunnerService(
            this.basePromptRunnerService,
            provider,
            fallbackProvider,
            byokConfig,
        );
    }

    /**
     * Getter para acessar o provider padrão configurado
     */
    get provider(): LLMModelProvider {
        return this.defaultProvider;
    }

    /**
     * Getter para acessar o provider de fallback configurado
     */
    get fallback(): LLMModelProvider | undefined {
        return this.fallbackProvider;
    }

    /**
     * Getter para acessar a configuração BYOK
     */
    get config(): BYOKConfig | undefined {
        return this.byokConfig;
    }
}
