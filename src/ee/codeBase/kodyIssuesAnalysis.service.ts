import { Injectable } from '@nestjs/common';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { tryParseJSONObject } from '@/shared/utils/transforms/json';
import { Inject } from '@nestjs/common';
import {
    prompt_kodyissues_merge_suggestions_into_issues_system,
    prompt_kodyissues_resolve_issues_system,
} from '@/shared/utils/langchainCommon/prompts/kodyIssuesManagement';
import {
    IParametersService,
    PARAMETERS_SERVICE_TOKEN,
} from '@/core/domain/parameters/contracts/parameters.service.contract';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { contextToGenerateIssues } from '../../core/infrastructure/adapters/services/kodyIssuesManagement/domain/kodyIssuesManagement.interface';
import {
    LLMProviderService,
    LLMModelProvider,
    PromptRunnerService,
    ParserType,
    PromptRole,
    BYOKConfig,
    TokenTrackingHandler,
} from '@kodus/kodus-common/llm';
import { environment } from '@/ee/configs/environment';
import { BYOKPromptRunnerService } from '@/shared/infrastructure/services/tokenTracking/byokPromptRunner.service';
import { ObservabilityService } from '@/core/infrastructure/adapters/services/logger/observability.service';

export const KODY_ISSUES_ANALYSIS_SERVICE_TOKEN = Symbol(
    'KodyIssuesAnalysisService',
);

@Injectable()
export class KodyIssuesAnalysisService {
    private readonly tokenTracker: TokenTrackingHandler;

    public readonly isCloud: boolean;
    public readonly isDevelopment: boolean;

    constructor(
        private readonly logger: PinoLoggerService,

        private readonly llmProviderService: LLMProviderService,

        @Inject(PARAMETERS_SERVICE_TOKEN)
        private readonly parametersService: IParametersService,

        private readonly promptRunnerService: PromptRunnerService,
        private readonly observabilityService: ObservabilityService,
    ) {
        this.tokenTracker = new TokenTrackingHandler();
        this.isCloud = environment.API_CLOUD_MODE;
        this.isDevelopment = environment.API_DEVELOPMENT_MODE;
    }

    async mergeSuggestionsIntoIssues(
        organizationAndTeamData: OrganizationAndTeamData,
        pullRequest: any,
        promptData: any,
        byokConfig: BYOKConfig | null,
    ): Promise<any> {
        try {
            const provider = LLMModelProvider.GEMINI_2_5_PRO;
            const fallbackProvider = LLMModelProvider.VERTEX_CLAUDE_3_5_SONNET;

            const runName = 'mergeSuggestionsIntoIssues';
            this.observabilityService.startSpan(
                `${KodyIssuesAnalysisService.name}::${runName}`,
            );

            const promptRunner = new BYOKPromptRunnerService(
                this.promptRunnerService,
                provider,
                fallbackProvider,
                byokConfig,
            );

            const result = await promptRunner
                .builder()
                .setParser(ParserType.STRING)
                .setLLMJsonMode(true)
                .setPayload(promptData)
                .addPrompt({
                    prompt: prompt_kodyissues_merge_suggestions_into_issues_system,
                    role: PromptRole.SYSTEM,
                })
                .addPrompt({
                    prompt: (input) => JSON.stringify(input, null, 2),
                    role: PromptRole.USER,
                })
                .setParser(ParserType.STRING)
                .setLLMJsonMode(true)
                .setPayload(promptData)
                .addPrompt({
                    prompt: prompt_kodyissues_merge_suggestions_into_issues_system,
                    role: PromptRole.SYSTEM,
                })
                .addPrompt({
                    prompt: (input) => JSON.stringify(input, null, 2),
                    role: PromptRole.USER,
                })
                .addMetadata({
                    organizationAndTeamData: organizationAndTeamData,
                    prNumber: pullRequest.number,
                    provider: byokConfig?.main?.provider || provider,
                    fallbackProvider:
                        byokConfig?.fallback?.provider || fallbackProvider,
                    model: byokConfig?.main?.model,
                    fallbackModel: byokConfig?.fallback?.model,
                    runName,
                })
                .setRunName('mergeSuggestionsIntoIssues')
                .addTags([
                    ...this.buildTags(provider, 'primary'),
                    ...this.buildTags(fallbackProvider, 'fallback'),
                ])
                .addCallbacks([this.tokenTracker])
                .setTemperature(0)
                .execute();

            this.observabilityService.endSpan(this.tokenTracker, {
                organizationId: organizationAndTeamData.organizationId,
                prNumber: pullRequest.number,
                type: 'byok',
                runName,
            });

            if (!result) {
                const message = `No response from LLM for PR#${pullRequest.number}`;
                this.logger.warn({
                    message,
                    context: KodyIssuesAnalysisService.name,
                    metadata: {
                        organizationAndTeamData,
                        prNumber: pullRequest.number,
                    },
                });
                throw new Error(message);
            }

            return this.processLLMResponse(
                result,
                organizationAndTeamData.organizationId,
            );
        } catch (error) {
            this.logger.error({
                message: 'Error in mergeSuggestionsIntoIssues',
                context: KodyIssuesAnalysisService.name,
                error,
                metadata: {
                    organizationAndTeamData,
                    prNumber: pullRequest.number,
                },
            });
            throw error;
        }
    }

    async resolveExistingIssues(
        context: Pick<
            contextToGenerateIssues,
            'organizationAndTeamData' | 'repository' | 'pullRequest'
        >,
        promptData: any,
        byokConfig: BYOKConfig | null,
    ): Promise<any> {
        try {
            const provider = LLMModelProvider.GEMINI_2_5_PRO;
            const fallbackProvider = LLMModelProvider.NOVITA_DEEPSEEK_V3;

            const promptRunner = new BYOKPromptRunnerService(
                this.promptRunnerService,
                provider,
                fallbackProvider,
                byokConfig,
            );

            const runName = 'resolveExistingIssues';
            this.observabilityService.startSpan(
                `${KodyIssuesAnalysisService.name}::${runName}`,
            );

            const result = await promptRunner
                .builder()
                .setParser(ParserType.STRING)
                .setLLMJsonMode(true)
                .setPayload(promptData)
                .addPrompt({
                    prompt: prompt_kodyissues_resolve_issues_system,
                    role: PromptRole.SYSTEM,
                })
                .addPrompt({
                    prompt: (input) => JSON.stringify(input, null, 2),
                    role: PromptRole.USER,
                })
                .addMetadata({
                    organizationAndTeamData: context.organizationAndTeamData,
                    prNumber: context.pullRequest.number,
                    provider: byokConfig?.main?.provider || provider,
                    fallbackProvider:
                        byokConfig?.fallback?.provider || fallbackProvider,
                    model: byokConfig?.main?.model,
                    fallbackModel: byokConfig?.fallback?.model,
                    runName,
                })
                .setParser(ParserType.STRING)
                .setLLMJsonMode(true)
                .setPayload(promptData)
                .addPrompt({
                    prompt: prompt_kodyissues_resolve_issues_system,
                    role: PromptRole.SYSTEM,
                })
                .addPrompt({
                    prompt: (input) => JSON.stringify(input, null, 2),
                    role: PromptRole.USER,
                })
                .addMetadata({
                    organizationAndTeamData: context.organizationAndTeamData,
                    prNumber: context.pullRequest.number,
                    provider: byokConfig?.main?.provider || provider,
                    fallbackProvider:
                        byokConfig?.fallback?.provider || fallbackProvider,
                    model: byokConfig?.main?.model,
                    fallbackModel: byokConfig?.fallback?.model,
                    runName,
                })
                .setRunName(runName)
                .addTags([
                    ...this.buildTags(provider, 'primary'),
                    ...this.buildTags(fallbackProvider, 'fallback'),
                ])
                .addCallbacks([this.tokenTracker])
                .setTemperature(0)
                .execute();

            this.observabilityService.endSpan(this.tokenTracker, {
                organizationId: context.organizationAndTeamData.organizationId,
                prNumber: context.pullRequest.number,
                type: 'byok',
                runName,
            });

            if (!result) {
                const message = `No response from LLM for PR#${context.pullRequest.number}`;
                this.logger.warn({
                    message,
                    context: KodyIssuesAnalysisService.name,
                    metadata: {
                        organizationAndTeamData:
                            context.organizationAndTeamData,
                        prNumber: context.pullRequest.number,
                    },
                });
                throw new Error(message);
            }

            return this.processLLMResponse(
                result,
                context.organizationAndTeamData.organizationId,
            );
        } catch (error) {
            this.logger.error({
                message: 'Error in resolveExistingIssues',
                context: KodyIssuesAnalysisService.name,
                error,
                metadata: {
                    organizationAndTeamData: context.organizationAndTeamData,
                    prNumber: context.pullRequest.number,
                },
            });
            throw error;
        }
    }

    private buildTags(
        provider: LLMModelProvider,
        tier: 'primary' | 'fallback',
    ) {
        return [`model:${provider}`, `tier:${tier}`, 'kodyIssues'];
    }

    private processLLMResponse(response: string, organizationId: string): any {
        try {
            if (!response) {
                return null;
            }

            let cleanResponse = response;
            if (response.startsWith('```')) {
                cleanResponse = response
                    .replace(/^```json\n/, '')
                    .replace(/\n```(\n)?$/, '')
                    .trim();
            }

            const parsedResponse = tryParseJSONObject(cleanResponse);

            if (!parsedResponse) {
                this.logger.error({
                    message: 'Failed to parse LLM response',
                    context: KodyIssuesAnalysisService.name,
                    metadata: { originalResponse: response, organizationId },
                });
                return null;
            }

            return parsedResponse;
        } catch (error) {
            this.logger.error({
                message: 'Error processing LLM response',
                context: KodyIssuesAnalysisService.name,
                error,
                metadata: { response, organizationId },
            });
            return null;
        }
    }
}
