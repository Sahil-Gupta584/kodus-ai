import { KODY_RULES_SERVICE_TOKEN } from '@/core/domain/kodyRules/contracts/kodyRules.service.contract';
import { KodyRulesService } from '../kodyRules/service/kodyRules.service';
import { Inject, Injectable } from '@nestjs/common';
import { KodyRulesAnalysisService } from '@/core/domain/codeBase/contracts/KodyRulesAnalysisService.contract';
import {
    FileChangeContext,
    ReviewModeResponse,
    AnalysisContext,
    AIAnalysisResult,
    FileChange,
    CodeSuggestion,
} from '@/config/types/general/codeReview.type';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import {
    IKodyRule,
    KodyRulesScope,
} from '@/core/domain/kodyRules/interfaces/kodyRules.interface';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { LLM_PROVIDER_SERVICE_TOKEN } from '@/core/infrastructure/adapters/services/llmProviders/llmProvider.service.contract';
import { LLMProviderService } from '@/core/infrastructure/adapters/services/llmProviders/llmProvider.service';
import { LLMModelProvider } from '@/core/infrastructure/adapters/services/llmProviders/llmModelProvider.helper';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import {
    KodyRulesPrLevelPayload,
    prompt_kodyrules_prlevel_classifier_system,
    prompt_kodyrules_prlevel_generate_suggestions_system,
} from '@/shared/utils/langchainCommon/prompts/kodyRulesPrLevel';
import { tryParseJSONObject } from '@/shared/utils/transforms/json';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { LabelType } from '@/shared/utils/codeManagement/labels';

// Interface for token tracking
interface TokenUsage {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    model?: string;
    runId?: string;
    parentRunId?: string;
}

// Interface for classifier response
interface ClassifierViolation {
    primaryFileId: string | null;
    relatedFileIds: string[];
    reason: string;
}

interface ClassifierRuleResult {
    ruleId: string;
    violations: ClassifierViolation[];
}

// Interface for generate suggestions response
interface GenerateSuggestionsResponse {
    suggestionContent: string;
    oneSentenceSummary: string;
    brokenKodyRulesIds: string[];
    primaryFileId: string | null;
    relatedFilesIds: string[];
}

// Extended rule interface for processing
interface ExtendedKodyRule extends Partial<IKodyRule> {
    violations?: ClassifierViolation[];
}

// Handler for token tracking
class TokenTrackingHandler extends BaseCallbackHandler {
    name = 'TokenTrackingHandler';
    tokenUsages: TokenUsage[] = [];

    private extractUsageMetadata(output: any): TokenUsage {
        try {
            // Attempts to extract information from different locations in the response
            const usage: TokenUsage = {};

            // Extracts token information
            if (output?.llmOutput?.tokenUsage) {
                Object.assign(usage, output.llmOutput.tokenUsage);
            } else if (output?.llmOutput?.usage) {
                Object.assign(usage, output.llmOutput.usage);
            } else if (output?.generations?.[0]?.[0]?.message?.usage_metadata) {
                const metadata =
                    output.generations[0][0].message.usage_metadata;
                usage.input_tokens = metadata.input_tokens;
                usage.output_tokens = metadata.output_tokens;
                usage.total_tokens = metadata.total_tokens;
            }

            // Extracts model
            usage.model =
                output?.llmOutput?.model ||
                output?.generations?.[0]?.[0]?.message?.response_metadata
                    ?.model ||
                'unknown';

            return usage;
        } catch (error) {
            console.error('Error extracting usage metadata:', error);
            return {};
        }
    }

    async handleLLMEnd(
        output: any,
        runId: string,
        parentRunId?: string,
        tags?: string[],
    ) {
        const usage = this.extractUsageMetadata(output);

        if (Object.keys(usage).length > 0) {
            this.tokenUsages.push({
                ...usage,
                runId,
                parentRunId,
            });
        }
    }

    getTokenUsages(): TokenUsage[] {
        return this.tokenUsages;
    }

    reset() {
        this.tokenUsages = [];
    }
}

export const KODY_RULES_PR_LEVEL_ANALYSIS_SERVICE_TOKEN = Symbol(
    'KodyRulesPrLevelAnalysisService',
);

type SystemPromptFn = (payload: KodyRulesPrLevelPayload) => string;

@Injectable()
export class KodyRulesPrLevelAnalysisService
    implements KodyRulesAnalysisService
{
    private readonly tokenTracker: TokenTrackingHandler;

    constructor(
        @Inject(KODY_RULES_SERVICE_TOKEN)
        private readonly kodyRulesService: KodyRulesService,

        @Inject(LLM_PROVIDER_SERVICE_TOKEN)
        private readonly llmProviderService: LLMProviderService,

        private readonly logger: PinoLoggerService,
    ) {
        this.tokenTracker = new TokenTrackingHandler();
    }

    async analyzeCodeWithAI(
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
        fileContext: FileChangeContext | FileChange[],
        reviewModeResponse: ReviewModeResponse,
        context: AnalysisContext,
        suggestions?: AIAnalysisResult,
    ): Promise<AIAnalysisResult> {
        const changedFiles = (context as any).changedFiles as FileChange[];

        const kodyRules = context.codeReviewConfig.kodyRules;
        const language = context.codeReviewConfig.languageResultPrompt || 'en-US';

        const kodyRulesPrLevel = kodyRules.filter(
            (rule) => rule.scope === KodyRulesScope.PULL_REQUEST,
        );

        const provider = LLMModelProvider.GEMINI_2_5_PRO;
        this.tokenTracker.reset();

        try {
            // Step 1: Prepare classifier payload
            const classifierPayload: KodyRulesPrLevelPayload = {
                pr_title: context.pullRequest.title,
                pr_description: context.pullRequest.body || '',
                files: changedFiles,
                rules: kodyRulesPrLevel,
                language,
            };

            // Step 2: Create and invoke classifier chain
            const classifierChain = await this.createClassifierChain(
                provider,
                classifierPayload,
            );

            const classifierResult = await classifierChain.invoke(classifierPayload);

            // Step 3: Process classifier response
            const violatedRules = this.processClassifierResponse(
                kodyRulesPrLevel,
                classifierResult,
                changedFiles,
            );

            if (!violatedRules?.length) {
                this.logger.log({
                    message: `No PR-level rule violations found for PR#${prNumber}`,
                    context: KodyRulesPrLevelAnalysisService.name,
                    metadata: {
                        organizationAndTeamData,
                        prNumber,
                        rulesAnalyzed: kodyRulesPrLevel.length,
                    },
                });
                return {
                    codeSuggestions: [],
                    overallSummary: '',
                };
            }

            // Step 4: Generate suggestions for each violated rule
            const suggestions = await this.generateSuggestionsForViolatedRules(
                violatedRules,
                changedFiles,
                provider,
                language,
                organizationAndTeamData,
                prNumber,
            );

            // Step 5: Process and return final suggestions
            return this.addSeverityToSuggestions(
                suggestions,
                kodyRulesPrLevel,
            );

        } catch (error) {
            this.logger.error({
                message: `Error during PR-level Kody Rules analysis for PR#${prNumber}`,
                context: KodyRulesPrLevelAnalysisService.name,
                metadata: {
                    organizationAndTeamData,
                    prNumber,
                },
                error,
            });
            throw error;
        }
    }

    private async createClassifierChain(
        provider: LLMModelProvider,
        payload: KodyRulesPrLevelPayload,
    ) {
        const fallbackProvider = LLMModelProvider.VERTEX_CLAUDE_3_5_SONNET;

        try {
            const mainChain = await this.createProviderChain(
                provider,
                'classifier',
                payload,
            );
            const fallbackChain = await this.createProviderChain(
                fallbackProvider,
                'classifier',
                payload,
            );

            return mainChain.withFallbacks({
                fallbacks: [fallbackChain],
            }).withConfig({
                tags: this.buildTags(provider, 'primary'),
                runName: 'prLevelClassifier',
                metadata: {
                    organizationId: payload.pr_title,
                    provider: provider,
                    fallbackProvider: fallbackProvider,
                },
            });
        } catch (error) {
            this.logger.error({
                message: 'Error creating classifier chain with fallback',
                error,
                context: KodyRulesPrLevelAnalysisService.name,
                metadata: {
                    provider,
                    fallbackProvider,
                },
            });
            throw error;
        }
    }

    private async createGenerateSuggestionsChain(
        provider: LLMModelProvider,
        payload: KodyRulesPrLevelPayload,
    ) {
        const fallbackProvider = LLMModelProvider.VERTEX_CLAUDE_3_5_SONNET;

        try {
            const mainChain = await this.createProviderChain(
                provider,
                'generateSuggestions',
                payload,
            );
            const fallbackChain = await this.createProviderChain(
                fallbackProvider,
                'generateSuggestions',
                payload,
            );

            return mainChain.withFallbacks({
                fallbacks: [fallbackChain],
            }).withConfig({
                tags: this.buildTags(provider, 'primary'),
                runName: 'prLevelGenerateSuggestions',
                metadata: {
                    ruleId: payload.rule?.uuid,
                    provider: provider,
                    fallbackProvider: fallbackProvider,
                },
            });
        } catch (error) {
            this.logger.error({
                message: 'Error creating generate suggestions chain with fallback',
                error,
                context: KodyRulesPrLevelAnalysisService.name,
                metadata: {
                    provider,
                    fallbackProvider,
                },
            });
            throw error;
        }
    }

    private async createProviderChain(
        provider: LLMModelProvider,
        chainType: 'classifier' | 'generateSuggestions',
        payload: KodyRulesPrLevelPayload,
    ) {
        try {
            let llm = this.llmProviderService.getLLMProvider({
                model: provider,
                temperature: 0,
                jsonMode: true,
                callbacks: [this.tokenTracker],
            });

            const tags = this.buildTags(provider, 'primary');

            // Create the chain using the correct provider
            const chain = RunnableSequence.from([
                async (input: any) => {
                    let systemPrompt: string;

                    if (chainType === 'classifier') {
                        systemPrompt = prompt_kodyrules_prlevel_classifier_system(payload);
                    } else {
                        systemPrompt = prompt_kodyrules_prlevel_generate_suggestions_system(payload);
                    }

                    return [
                        {
                            role: 'system',
                            content: [
                                {
                                    type: 'text',
                                    text: systemPrompt,
                                },
                            ],
                        },
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: 'Please analyze the provided information and return the response in the specified format.',
                                },
                            ],
                        },
                    ];
                },
                llm,
                new StringOutputParser(),
            ]).withConfig({ tags });

            return chain;
        } catch (error) {
            this.logger.error({
                message: 'Error creating provider chain',
                error,
                context: KodyRulesPrLevelAnalysisService.name,
                metadata: { provider, chainType },
            });
            throw error;
        }
    }

    private processClassifierResponse(
        kodyRulesPrLevel: Array<Partial<IKodyRule>>,
        response: string,
        files: FileChange[],
    ): ExtendedKodyRule[] | null {
        try {
            if (!response) {
                return null;
            }

            let cleanResponse = response;
            if (response?.startsWith('```')) {
                cleanResponse = response
                    .replace(/^```json\n/, '')
                    .replace(/\n```(\n)?$/, '')
                    .trim();
            }

            const parsedResponse: ClassifierRuleResult[] = tryParseJSONObject(cleanResponse);

            if (!parsedResponse?.length) {
                this.logger.warn({
                    message: 'Failed to parse classifier response OR no violations found',
                    context: KodyRulesPrLevelAnalysisService.name,
                    metadata: {
                        originalResponse: response,
                        cleanResponse,
                    },
                });
                return null;
            }

            // Map violations to rules
            const violatedRules: ExtendedKodyRule[] = [];

            for (const ruleResult of parsedResponse) {
                const rule = kodyRulesPrLevel.find(r => r.uuid === ruleResult.ruleId);
                if (rule) {
                    violatedRules.push({
                        ...rule,
                        violations: ruleResult.violations,
                    });
                }
            }

            this.logger.log({
                message: 'Successfully processed classifier response',
                context: KodyRulesPrLevelAnalysisService.name,
                metadata: {
                    totalViolatedRules: violatedRules.length,
                    ruleIds: violatedRules.map(r => r.uuid),
                },
            });

            return violatedRules;

        } catch (error) {
            this.logger.error({
                message: 'Error processing classifier response',
                context: KodyRulesPrLevelAnalysisService.name,
                error,
                metadata: {
                    response,
                },
            });
            return null;
        }
    }

    private async generateSuggestionsForViolatedRules(
        violatedRules: ExtendedKodyRule[],
        files: FileChange[],
        provider: LLMModelProvider,
        language: string,
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
    ): Promise<AIAnalysisResult> {
        const allSuggestions: CodeSuggestion[] = [];

        // Process each violated rule
        for (const rule of violatedRules) {
            try {
                // Map file data for the files involved in this rule's violations
                const relatedFiles = this.mapFilesForRule(rule, files);

                // Create payload for generate suggestions
                const payload: KodyRulesPrLevelPayload = {
                    pr_title: '', // Not needed for generate suggestions
                    pr_description: '',
                    files: relatedFiles,
                    rule: {
                        ...rule,
                        violations: rule.violations, // Include violations in the rule
                    },
                    language,
                };

                // Create and invoke generate suggestions chain
                const generateSuggestionsChain = await this.createGenerateSuggestionsChain(
                    provider,
                    payload,
                );

                const suggestionsResult = await generateSuggestionsChain.invoke(payload);

                // Process the suggestion response
                const processedSuggestion = this.processGenerateSuggestionsResponse(
                    suggestionsResult,
                    rule,
                    organizationAndTeamData,
                    prNumber,
                );

                if (processedSuggestion) {
                    allSuggestions.push(processedSuggestion);
                }

            } catch (error) {
                this.logger.error({
                    message: `Error generating suggestions for rule ${rule.uuid}`,
                    context: KodyRulesPrLevelAnalysisService.name,
                    error,
                    metadata: {
                        ruleId: rule.uuid,
                        organizationAndTeamData,
                        prNumber,
                    },
                });
                // Continue with other rules even if one fails
                continue;
            }
        }

        return {
            codeSuggestions: allSuggestions,
            overallSummary: `Foram identificadas ${allSuggestions.length} violações de regras a nível de PR que precisam ser corrigidas.`,
        };
    }

    private mapFilesForRule(rule: ExtendedKodyRule, allFiles: FileChange[]): FileChange[] {
        if (!rule.violations?.length) {
            return allFiles;
        }

        // Get all file IDs mentioned in violations
        const relatedFileIds = new Set<string>();

        for (const violation of rule.violations) {
            if (violation.primaryFileId) {
                relatedFileIds.add(violation.primaryFileId);
            }
            violation.relatedFileIds?.forEach(id => relatedFileIds.add(id));
        }

        // Map file IDs to actual files
        const relatedFiles = allFiles.filter(file =>
            relatedFileIds.has(file.sha) || null
        );

        // If no specific files found, return all files (fallback)
        return relatedFiles.length > 0 ? relatedFiles : allFiles;
    }

    private processGenerateSuggestionsResponse(
        response: string,
        rule: ExtendedKodyRule,
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
    ): CodeSuggestion | null {
        try {
            if (!response) {
                return null;
            }

            let cleanResponse = response;
            if (response?.startsWith('```')) {
                cleanResponse = response
                    .replace(/^```json\n/, '')
                    .replace(/\n```(\n)?$/, '')
                    .trim();
            }

            const parsedResponse: GenerateSuggestionsResponse = tryParseJSONObject(cleanResponse);

            if (!parsedResponse) {
                this.logger.error({
                    message: 'Failed to parse generate suggestions response',
                    context: KodyRulesPrLevelAnalysisService.name,
                    metadata: {
                        originalResponse: response,
                        cleanResponse,
                        ruleId: rule.uuid,
                    },
                });
                return null;
            }

            // Create the code suggestion
            const suggestion: CodeSuggestion = {
                id: uuidv4(),
                relevantFile: '', // PR-level suggestions don't have a specific file
                language: 'General',
                suggestionContent: parsedResponse.suggestionContent,
                existingCode: '',
                improvedCode: '',
                oneSentenceSummary: parsedResponse.oneSentenceSummary,
                relevantLinesStart: undefined,
                relevantLinesEnd: undefined,
                label: LabelType.KODY_RULES,
                brokenKodyRulesIds: parsedResponse.brokenKodyRulesIds || [rule.uuid!],
            };

            this.logger.log({
                message: 'Successfully processed generate suggestions response',
                context: KodyRulesPrLevelAnalysisService.name,
                metadata: {
                    ruleId: rule.uuid,
                    suggestionId: suggestion.id,
                },
            });

            return suggestion;

        } catch (error) {
            this.logger.error({
                message: 'Error processing generate suggestions response',
                context: KodyRulesPrLevelAnalysisService.name,
                error,
                metadata: {
                    response,
                    ruleId: rule.uuid,
                },
            });
            return null;
        }
    }

    addSeverityToSuggestions(
        suggestions: AIAnalysisResult,
        kodyRules: Array<Partial<IKodyRule>>,
    ): AIAnalysisResult {
        if (!suggestions?.codeSuggestions?.length || !kodyRules?.length) {
            return suggestions;
        }

        const updatedSuggestions = suggestions.codeSuggestions.map(
            (suggestion: CodeSuggestion & { brokenKodyRulesIds: string[] }) => {
                if (!suggestion.brokenKodyRulesIds?.length) {
                    return suggestion;
                }

                // For each broken rule, find the severity in kodyRules
                const severities = suggestion.brokenKodyRulesIds
                    .map((ruleId) => {
                        const rule = kodyRules.find((kr) => kr.uuid === ruleId);
                        return rule?.severity;
                    })
                    .filter(Boolean);

                // If there are severities, use the first one
                if (severities && severities.length > 0) {
                    return {
                        ...suggestion,
                        severity: severities[0]?.toLowerCase(),
                    };
                }

                return suggestion;
            },
        );

        return {
            ...suggestions,
            codeSuggestions: updatedSuggestions,
        };
    }

    private buildTags(
        provider: LLMModelProvider,
        tier: 'primary' | 'fallback',
    ) {
        return [`model:${provider}`, `tier:${tier}`, 'kodyRules', 'prLevel'];
    }

    private async logTokenUsage(metadata: any) {
        // Log token usage para análise e monitoramento
        this.logger.log({
            message: 'Token usage',
            context: KodyRulesPrLevelAnalysisService.name,
            metadata: {
                ...metadata,
            },
        });
    }
}
