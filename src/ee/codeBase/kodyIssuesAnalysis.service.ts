import { Injectable } from '@nestjs/common';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { RunnableSequence } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { tryParseJSONObject } from '@/shared/utils/transforms/json';
import { LLMModelProvider } from '@/core/infrastructure/adapters/services/llmProviders/llmModelProvider.helper';
import { LLMProviderService } from '@/core/infrastructure/adapters/services/llmProviders/llmProvider.service';
import { LLM_PROVIDER_SERVICE_TOKEN } from '@/core/infrastructure/adapters/services/llmProviders/llmProvider.service.contract';
import { Inject } from '@nestjs/common';
import { prompt_kodyissues_merge_suggestions_into_issues_system } from '@/shared/utils/langchainCommon/prompts/kodyIssuesManagement';

export const KODY_ISSUES_ANALYSIS_SERVICE_TOKEN = Symbol('KodyIssuesAnalysisService');

@Injectable()
export class KodyIssuesAnalysisService {
    constructor(
        private readonly logger: PinoLoggerService,

        @Inject(LLM_PROVIDER_SERVICE_TOKEN)
        private readonly llmProviderService: LLMProviderService,
    ) {}

    async mergeSuggestionsIntoIssues(
        organizationId: string,
        promptData: any,
    ): Promise<any> {
        try {
            const provider = LLMModelProvider.GEMINI_2_5_PRO_PREVIEW_05_06;

            const chain = await this.createAnalysisChain(
                provider,
                prompt_kodyissues_merge_suggestions_into_issues_system,
                'mergeSuggestionsIntoIssues',
            );

            const result = await chain.invoke(promptData);

            return this.processLLMResponse(result, organizationId);

        } catch (error) {
            this.logger.error({
                message: 'Error in mergeSuggestionsIntoIssues',
                context: KodyIssuesAnalysisService.name,
                error,
                metadata: { organizationId },
            });
            throw error;
        }
    }

    private async createAnalysisChain(
        provider: LLMModelProvider,
        systemPromptFn: () => string,
        runName?: string,
    ) {
        try {
            const llm = this.llmProviderService.getLLMProvider({
                model: provider,
                temperature: 0,
                jsonMode: true,
            });

            const chain = RunnableSequence.from([
                async (input: any) => {
                    const systemPrompt = systemPromptFn();
                    const humanPrompt = JSON.stringify(input, null, 2);

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
                new StringOutputParser(),
            ]).withConfig({
                runName,
                tags: [`model:${provider}`, 'kodyIssues'],
            });

            return chain;
        } catch (error) {
            this.logger.error({
                message: 'Error creating analysis chain',
                context: KodyIssuesAnalysisService.name,
                error,
                metadata: { provider },
            });
            throw error;
        }
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