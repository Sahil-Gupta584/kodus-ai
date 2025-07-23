import { Injectable } from '@nestjs/common';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { RunnableSequence } from '@langchain/core/runnables';
import { CustomStringOutputParser } from '@/shared/utils/langchainCommon/customStringOutputParser';
import { tryParseJSONObject } from '@/shared/utils/transforms/json';
import { LLMModelProvider } from '@/core/infrastructure/adapters/services/llmProviders/llmModelProvider.helper';
import { LLMProviderService } from '@/core/infrastructure/adapters/services/llmProviders/llmProvider.service';
import { LLM_PROVIDER_SERVICE_TOKEN } from '@/core/infrastructure/adapters/services/llmProviders/llmProvider.service.contract';
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
import { contextToGenerateIssues } from '../kodyIssuesManagement/domain/kodyIssuesManagement.interface';

export const KODY_ISSUES_ANALYSIS_SERVICE_TOKEN = Symbol(
    'KodyIssuesAnalysisService',
);

type SystemPromptFn = () => string;
type UserPromptFn = (input: any) => string;

@Injectable()
export class KodyIssuesAnalysisService {
    constructor(
        private readonly logger: PinoLoggerService,

        @Inject(LLM_PROVIDER_SERVICE_TOKEN)
        private readonly llmProviderService: LLMProviderService,

        @Inject(PARAMETERS_SERVICE_TOKEN)
        private readonly parametersService: IParametersService,
    ) {}

    async mergeSuggestionsIntoIssues(
        organizationAndTeamData: OrganizationAndTeamData,
        pullRequest: any,
        promptData: any,
    ): Promise<any> {
        try {
            const provider = LLMModelProvider.GEMINI_2_5_PRO;

            const chain = await this.createAnalysisChainWithFallback(
                organizationAndTeamData,
                pullRequest.number,
                provider,
                prompt_kodyissues_merge_suggestions_into_issues_system,
                (input: any) => JSON.stringify(input, null, 2),
                'mergeSuggestionsIntoIssues',
                LLMModelProvider.VERTEX_CLAUDE_3_5_SONNET,
            );

            const result = await chain.invoke(promptData);

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
    ): Promise<any> {
        try {
            const provider = LLMModelProvider.GEMINI_2_5_PRO;

            const chain = await this.createAnalysisChainWithFallback(
                context.organizationAndTeamData,
                context.pullRequest.number,
                provider,
                prompt_kodyissues_resolve_issues_system,
                (input: any) => JSON.stringify(input, null, 2),
                'resolveExistingIssues',
                LLMModelProvider.VERTEX_CLAUDE_3_5_SONNET,
            );

            const result = await chain.invoke(promptData);

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

    private async createAnalysisChainWithFallback(
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
        provider: LLMModelProvider,
        systemPromptFn: SystemPromptFn,
        userPromptFn: UserPromptFn,
        runName?: string,
        fallbackProvider?: LLMModelProvider,
    ) {
        if (!fallbackProvider) {
            fallbackProvider =
                provider === LLMModelProvider.GEMINI_2_5_PRO
                    ? LLMModelProvider.VERTEX_CLAUDE_3_5_SONNET
                    : LLMModelProvider.GEMINI_2_5_PRO;
        }

        try {
            const mainChain = await this.createProviderChain(
                organizationAndTeamData,
                prNumber,
                provider,
                fallbackProvider,
                systemPromptFn,
                userPromptFn,
                'primary',
            );
            const fallbackChain = await this.createProviderChain(
                organizationAndTeamData,
                prNumber,
                provider,
                fallbackProvider,
                systemPromptFn,
                userPromptFn,
                'fallback',
            );

            return mainChain
                .withFallbacks({
                    fallbacks: [fallbackChain],
                })
                .withConfig({
                    tags: this.buildTags(provider, 'primary'),
                    runName,
                    metadata: {
                        organizationAndTeamData: organizationAndTeamData,
                        prNumber: prNumber,
                        provider: provider,
                        fallbackProvider: fallbackProvider,
                    },
                });
        } catch (error) {
            this.logger.error({
                message: 'Error creating analysis chain with fallback',
                error,
                context: KodyIssuesAnalysisService.name,
                metadata: {
                    provider,
                    fallbackProvider: fallbackProvider,
                },
            });
            throw error;
        }
    }

    private async createProviderChain(
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
        provider: LLMModelProvider,
        fallbackProvider: LLMModelProvider,
        systemPromptFn: SystemPromptFn,
        userPromptFn: UserPromptFn,
        tier: 'primary' | 'fallback',
    ) {
        try {
            const llm = this.llmProviderService.getLLMProvider({
                model: provider,
                temperature: 0,
                jsonMode: true,
            });

            const tags = this.buildTags(provider, tier);

            const chain = RunnableSequence.from([
                async (input: any) => {
                    const systemPrompt = systemPromptFn();
                    const humanPrompt = userPromptFn(input);

                    return [
                        {
                            role: 'system',
                            content: [{ type: 'text', text: systemPrompt }],
                        },
                        {
                            role: 'user',
                            content: [{ type: 'text', text: humanPrompt }],
                        },
                    ];
                },
                llm,
                new CustomStringOutputParser(),
            ]).withConfig({
                tags: this.buildTags(provider, 'primary'),
                metadata: {
                    organizationAndTeamData: organizationAndTeamData,
                    pullRequestId: prNumber,
                    provider: provider,
                    fallbackProvider: fallbackProvider,
                },
            });

            return chain;
        } catch (error) {
            this.logger.error({
                message: 'Error creating provider chain',
                error,
                context: KodyIssuesAnalysisService.name,
                metadata: { provider },
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
