import { Injectable } from '@nestjs/common';
import {
    createDirectLLMAdapter,
    LLMAdapter,
    toHumanAiMessages,
} from '@kodus/flow';
import {
    LLMModelProvider,
    BYOKConfig,
    PromptRunnerService,
    PromptRole,
    ParserType,
} from '@kodus/kodus-common/llm';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { PermissionValidationService } from '@/ee/shared/services/permissionValidation.service';
import { BYOKPromptRunnerService } from '@/shared/infrastructure/services/tokenTracking/byokPromptRunner.service';

@Injectable()
export abstract class BaseAgentProvider {
    protected byokConfig?: BYOKConfig;
    protected organizationAndTeamData?: OrganizationAndTeamData;

    protected abstract readonly defaultLLMConfig: {
        llmProvider: LLMModelProvider;
        temperature: number;
        maxTokens: number;
        maxReasoningTokens: number;
        stop: string[] | undefined;
    };

    /**
     * Abstract method to create MCP adapter
     * Each agent can implement its own filtering logic
     */
    protected abstract createMCPAdapter(
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<void>;

    constructor(
        protected readonly promptRunnerService: PromptRunnerService,
        protected readonly permissionValidationService: PermissionValidationService,
    ) {}

    /**
     * Fetches BYOK configuration for the organization
     */
    protected async fetchBYOKConfig(
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<void> {
        this.organizationAndTeamData = organizationAndTeamData;
        this.byokConfig = await this.permissionValidationService.getBYOKConfig(
            organizationAndTeamData,
        );
    }

    /**
     * Creates an LLM adapter with BYOK support, metadata tracking, and proper error handling
     */
    protected createLLMAdapter(moduleName: string): LLMAdapter {
        const self = this;
        const wrappedLLM = {
            name: 'agent-configurable-llm',
            async call(messages: any[], options: any = {}) {
                const lcMessages = toHumanAiMessages(messages);

                const resolveProvider = (model?: string): LLMModelProvider => {
                    return (
                        (model && (model as any)) ||
                        self.defaultLLMConfig.llmProvider
                    );
                };

                const provider = resolveProvider(options?.model);
                const fallbackProvider = LLMModelProvider.OPENAI_GPT_4O;

                const promptRunner = new BYOKPromptRunnerService(
                    self.promptRunnerService,
                    provider,
                    fallbackProvider,
                    self.byokConfig,
                );

                let builder = promptRunner
                    .builder()
                    .setParser(ParserType.STRING);

                for (const msg of lcMessages) {
                    const role =
                        msg.type === 'system'
                            ? PromptRole.SYSTEM
                            : PromptRole.USER;

                    builder = builder.addPrompt({
                        prompt: msg.content,
                        role: role,
                    });
                }

                // Execute with metadata
                const result = await builder
                    .setTemperature(
                        options?.temperature ??
                            self.defaultLLMConfig.temperature,
                    )
                    .setMaxTokens(
                        options?.maxTokens ?? self.defaultLLMConfig.maxTokens,
                    )
                    .setMaxReasoningTokens(
                        options?.maxReasoningTokens ??
                            self.defaultLLMConfig.maxReasoningTokens,
                    )
                    .addMetadata({
                        module: moduleName,
                        submodule: 'kodus-flow',
                        organizationId:
                            self.organizationAndTeamData?.organizationId,
                        teamId: self.organizationAndTeamData?.teamId,
                        provider: self.byokConfig?.main?.provider || provider,
                        fallbackProvider:
                            self.byokConfig?.fallback?.provider ||
                            fallbackProvider,
                        model: self.byokConfig?.main?.model,
                        fallbackModel: self.byokConfig?.fallback?.model,
                    })
                    .setRunName(`${moduleName}`)
                    .execute();

                return {
                    content: result,
                    additional_kwargs: {},
                };
            },
        };

        return createDirectLLMAdapter(wrappedLLM);
    }
}
