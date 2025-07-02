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
    AIAnalysisResultPrLevel,
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
    prompt_kodyrules_prlevel_analyzer,
} from '@/shared/utils/langchainCommon/prompts/kodyRulesPrLevel';
import { tryParseJSONObject } from '@/shared/utils/transforms/json';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { LabelType } from '@/shared/utils/codeManagement/labels';
import { ISuggestionByPR } from '@/core/domain/pullRequests/interfaces/pullRequests.interface';
import { DeliveryStatus } from '@/core/domain/pullRequests/enums/deliveryStatus.enum';
import { SeverityLevel } from '@/shared/utils/enums/severityLevel.enum';
import { TokenChunkingService } from '@/shared/utils/tokenChunking/tokenChunking.service';

// Interface for token tracking
interface TokenUsage {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    model?: string;
    runId?: string;
    parentRunId?: string;
}

// Interface for analyzer response
interface AnalyzerViolation {
    primaryFileId: string | null;
    relatedFileIds: string[];
    reason: string;
}

// Interface for violations with suggestions already generated
interface ViolationWithSuggestion {
    primaryFileId: string | null;
    relatedFileIds: string[];
    suggestionContent: string;
    oneSentenceSummary: string;
}

interface AnalyzerRuleResult {
    ruleId: string;
    violations: AnalyzerViolation[];
}

// Extended rule interface for processing
interface ExtendedKodyRule extends Partial<IKodyRule> {
    violations?: AnalyzerViolation[];
}

// Extended rule interface for rules with suggestions already generated
interface ExtendedKodyRuleWithSuggestions extends Partial<IKodyRule> {
    violations?: ViolationWithSuggestion[];
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

        private readonly tokenChunkingService: TokenChunkingService,
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
    ): Promise<AIAnalysisResultPrLevel> {
        const changedFiles = (context as any).changedFiles as FileChange[];

        const kodyRules = context.codeReviewConfig.kodyRules;
        const language =
            context.codeReviewConfig.languageResultPrompt || 'en-US';

        const kodyRulesPrLevel = kodyRules.filter(
            (rule) => rule.scope === KodyRulesScope.PULL_REQUEST,
        );

        const minimalSeverityLevel =
            context.codeReviewConfig.suggestionControl.severityLevelFilter;

        // Depois filtra por severidade mínima
        const filteredKodyRules = this.filterRulesByMinimumSeverity(
            kodyRulesPrLevel,
            minimalSeverityLevel,
        );

        // Se não há regras após os filtros, retorna resultado vazio
        if (!filteredKodyRules.length) {
            this.logger.log({
                message: `No PR-level rules found after severity filtering for PR#${prNumber}`,
                context: KodyRulesPrLevelAnalysisService.name,
                metadata: {
                    organizationAndTeamData,
                    prNumber,
                    totalRulesBeforeFilter: kodyRulesPrLevel.length,
                    minimalSeverityLevel,
                },
            });
            return {
                codeSuggestions: [],
            };
        }

        const provider = LLMModelProvider.GEMINI_2_5_PRO;
        this.tokenTracker.reset();

        try {
            return await this.processWithTokenChunking(
                organizationAndTeamData,
                prNumber,
                context,
                changedFiles,
                kodyRulesPrLevel,
                language,
                provider,
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

    private filterRulesByMinimumSeverity(
        rules: Array<Partial<IKodyRule>>,
        minimalSeverityLevel?: SeverityLevel,
    ): Array<Partial<IKodyRule>> {
        // Se não há nível mínimo definido ou é LOW, retorna todas as regras
        if (
            !minimalSeverityLevel ||
            minimalSeverityLevel === SeverityLevel.LOW
        ) {
            return rules;
        }

        // Define a hierarquia de severidade (do menor para o maior)
        const severityHierarchy = {
            [SeverityLevel.LOW]: 1,
            [SeverityLevel.MEDIUM]: 2,
            [SeverityLevel.HIGH]: 3,
            [SeverityLevel.CRITICAL]: 4,
        };

        const minimalLevel = severityHierarchy[minimalSeverityLevel];

        return rules.filter((rule) => {
            if (!rule.severity) {
                // Se a regra não tem severidade definida, inclui por padrão
                return true;
            }

            // Corrige: normaliza para lowercase para coincidir com o enum
            const ruleSeverity = rule.severity.toLowerCase() as SeverityLevel;
            const ruleLevel = severityHierarchy[ruleSeverity];

            // Se não conseguir mapear a severidade, inclui por segurança
            if (ruleLevel === undefined) {
                this.logger.warn({
                    message:
                        'Severidade de regra não reconhecida, incluindo por padrão',
                    context: KodyRulesPrLevelAnalysisService.name,
                    metadata: {
                        ruleId: rule.uuid,
                        ruleSeverity: rule.severity,
                        normalizedSeverity: ruleSeverity,
                    },
                });
                return true;
            }

            // Inclui apenas regras com severidade >= ao nível mínimo
            return ruleLevel >= minimalLevel;
        });
    }

    private async createAnalyzerChain(
        provider: LLMModelProvider,
        payload: KodyRulesPrLevelPayload,
    ) {
        const fallbackProvider = LLMModelProvider.VERTEX_CLAUDE_3_5_SONNET;

        try {
            const mainChain = await this.createProviderChain(provider, payload);
            const fallbackChain = await this.createProviderChain(
                fallbackProvider,
                payload,
            );

            return mainChain
                .withFallbacks({
                    fallbacks: [fallbackChain],
                })
                .withConfig({
                    tags: this.buildTags(provider, 'primary'),
                    runName: 'prLevelKodyRulesAnalyzer',
                    metadata: {
                        organizationId: payload.pr_title,
                        provider: provider,
                        fallbackProvider: fallbackProvider,
                    },
                });
        } catch (error) {
            this.logger.error({
                message: 'Error creating analyzer chain with fallback',
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
                    const systemPrompt =
                        prompt_kodyrules_prlevel_analyzer(payload);

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
                metadata: { provider },
            });
            throw error;
        }
    }

    private processAnalyzerResponse(
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

            const parsedResponse: AnalyzerRuleResult[] =
                tryParseJSONObject(cleanResponse);

            if (!parsedResponse?.length) {
                this.logger.warn({
                    message:
                        'Failed to parse analyzer response OR no violations found',
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
                const rule = kodyRulesPrLevel.find(
                    (r) => r.uuid === ruleResult.ruleId,
                );
                if (rule) {
                    violatedRules.push({
                        ...rule,
                        violations: ruleResult.violations,
                    });
                }
            }

            this.logger.log({
                message: 'Successfully processed analyzer response',
                context: KodyRulesPrLevelAnalysisService.name,
                metadata: {
                    totalViolatedRules: violatedRules.length,
                    ruleIds: violatedRules.map((r) => r.uuid),
                },
            });

            return violatedRules;
        } catch (error) {
            this.logger.error({
                message: 'Error processing analyzer response',
                context: KodyRulesPrLevelAnalysisService.name,
                error,
                metadata: {
                    response,
                },
            });
            return null;
        }
    }

    private mapViolatedRulesToSuggestions(
        violatedRules: ExtendedKodyRuleWithSuggestions[],
    ): ISuggestionByPR[] {
        const allSuggestions: ISuggestionByPR[] = [];

        for (const rule of violatedRules) {
            if (!rule.violations?.length) {
                continue;
            }

            for (const violation of rule.violations) {
                const suggestion: ISuggestionByPR = {
                    id: uuidv4(),
                    suggestionContent: violation.suggestionContent,
                    oneSentenceSummary: violation.oneSentenceSummary,
                    label: LabelType.KODY_RULES,
                    brokenKodyRulesIds: [rule.uuid!],
                    deliveryStatus: DeliveryStatus.NOT_SENT,
                };

                allSuggestions.push(suggestion);
            }
        }

        return allSuggestions;
    }

    addSeverityToSuggestions(
        suggestions: AIAnalysisResultPrLevel,
        kodyRules: Array<Partial<IKodyRule>>,
    ): AIAnalysisResultPrLevel {
        if (!suggestions?.codeSuggestions?.length || !kodyRules?.length) {
            return suggestions;
        }

        const updatedSuggestions = suggestions.codeSuggestions.map(
            (
                suggestion: ISuggestionByPR & { brokenKodyRulesIds: string[] },
            ) => {
                if (!suggestion.brokenKodyRulesIds?.length) {
                    return suggestion;
                }

                const severities = suggestion.brokenKodyRulesIds
                    .map((ruleId) => {
                        const rule = kodyRules.find((kr) => kr.uuid === ruleId);
                        return rule?.severity;
                    })
                    .filter(Boolean);

                if (severities && severities.length > 0) {
                    return {
                        ...suggestion,
                        severity: severities[0]?.toLowerCase() as SeverityLevel,
                    };
                }

                return suggestion;
            },
        );

        return {
            codeSuggestions: updatedSuggestions,
        };
    }

    private buildTags(
        provider: LLMModelProvider,
        tier: 'primary' | 'fallback',
    ) {
        return [`model:${provider}`, `tier:${tier}`, 'kodyRules', 'prLevel'];
    }

    private async replaceKodyRuleIdsWithLinks(
        suggestions: AIAnalysisResultPrLevel,
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
    ): Promise<AIAnalysisResultPrLevel> {
        if (!suggestions?.codeSuggestions?.length) {
            return suggestions;
        }

        const updatedSuggestions = await Promise.all(
            suggestions.codeSuggestions.map(async (suggestion) => {
                try {
                    if (suggestion?.label === LabelType.KODY_RULES) {
                        let updatedContent =
                            suggestion?.suggestionContent || '';

                        const uuidRegex =
                            /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
                        let foundIds: string[] =
                            updatedContent.match(uuidRegex) || [];

                        const updatedContentWithLinks =
                            await this.buildKodyRuleLinkAndRepalceIds(
                                foundIds,
                                updatedContent,
                                organizationAndTeamData,
                                prNumber,
                            );

                        return {
                            ...suggestion,
                            suggestionContent: updatedContentWithLinks,
                        };
                    }

                    return suggestion;
                } catch (error) {
                    this.logger.error({
                        message:
                            'Error processing suggestion for Kody Rule links',
                        context: KodyRulesPrLevelAnalysisService.name,
                        error,
                        metadata: {
                            suggestionId: suggestion.id,
                            organizationAndTeamData,
                            prNumber,
                        },
                    });
                    return suggestion;
                }
            }),
        );

        return {
            ...suggestions,
            codeSuggestions: updatedSuggestions,
        };
    }

    private async buildKodyRuleLinkAndRepalceIds(
        foundIds: string[],
        updatedContent: string,
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
    ): Promise<string> {
        // Processar todos os IDs encontrados
        for (const ruleId of foundIds) {
            try {
                const rule = await this.kodyRulesService.findById(ruleId);

                if (!rule) {
                    continue;
                }

                const baseUrl = process.env.API_USER_INVITE_BASE_URL || '';
                let ruleLink: string;

                if (rule.repositoryId === 'global') {
                    ruleLink = `${baseUrl}/settings/code-review/global/kody-rules/${ruleId}`;
                } else {
                    ruleLink = `${baseUrl}/settings/code-review/${rule.repositoryId}/kody-rules/${ruleId}`;
                }

                const escapeMarkdownSyntax = (text: string): string =>
                    text.replace(/([\[\]\\`*_{}()#+\-.!])/g, '\\$1');
                const markdownLink = `[${escapeMarkdownSyntax(rule.title)}](${ruleLink})`;

                // Verificar se o ID está entre crases simples `id`
                const singleBacktickPattern = new RegExp(
                    `\`${this.escapeRegex(ruleId)}\``,
                    'g',
                );
                if (singleBacktickPattern.test(updatedContent)) {
                    updatedContent = updatedContent.replace(
                        singleBacktickPattern,
                        markdownLink,
                    );
                    continue;
                }

                // Verificar se o ID está entre blocos de código ```id```
                const tripleBacktickPattern = new RegExp(
                    `\`\`\`${this.escapeRegex(ruleId)}\`\`\``,
                    'g',
                );
                if (tripleBacktickPattern.test(updatedContent)) {
                    updatedContent = updatedContent.replace(
                        tripleBacktickPattern,
                        markdownLink,
                    );
                    continue;
                }

                const idPattern = new RegExp(this.escapeRegex(ruleId), 'g');
                updatedContent = updatedContent.replace(
                    idPattern,
                    markdownLink,
                );
            } catch (error) {
                this.logger.error({
                    message: 'Error fetching Kody Rule details',
                    context: KodyRulesPrLevelAnalysisService.name,
                    error: error,
                    metadata: {
                        ruleId,
                        organizationAndTeamData,
                        prNumber,
                    },
                });
                continue;
            }
        }

        return updatedContent;
    }

    private escapeRegex(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Remove fileContent dos arquivos para reduzir tokens
     */
    private prepareFilesForPayload(changedFiles: FileChange[]): FileChange[] {
        return changedFiles.map((file) => ({
            ...file,
            fileContent: undefined,
        }));
    }

    /**
     * Processa PR grande usando token chunking
     */
    private async processWithTokenChunking(
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
        context: AnalysisContext,
        changedFiles: FileChange[],
        kodyRulesPrLevel: Array<Partial<IKodyRule>>,
        language: string,
        provider: LLMModelProvider,
    ): Promise<AIAnalysisResultPrLevel> {
        // 1. Preparar dados para chunking
        const preparedFiles = this.prepareFilesForPayload(changedFiles);

        // 2. Dividir arquivos em chunks
        const chunkingResult = this.tokenChunkingService.chunkDataByTokens({
            model: provider,
            data: preparedFiles,
            usagePercentage: 5, // Usar 70% da capacidade do modelo
        });

        this.logger.log({
            message: `PR divided into ${chunkingResult.totalChunks} chunks`,
            context: KodyRulesPrLevelAnalysisService.name,
            metadata: {
                prNumber,
                totalFiles: preparedFiles.length,
                totalChunks: chunkingResult.totalChunks,
                tokenLimit: chunkingResult.tokenLimit,
                tokensPerChunk: chunkingResult.tokensPerChunk,
            },
        });

        // 3. Processar cada chunk
        const allViolatedRules: ExtendedKodyRule[] = [];

        for (let i = 0; i < chunkingResult.chunks.length; i++) {
            const chunk = chunkingResult.chunks[i];
            const tokens = chunkingResult.tokensPerChunk[i];

            this.logger.log({
                message: `Processing chunk ${i + 1}/${chunkingResult.totalChunks}`,
                context: KodyRulesPrLevelAnalysisService.name,
                metadata: {
                    chunkIndex: i,
                    filesInChunk: chunk.length,
                    estimatedTokens: tokens,
                },
            });

            try {
                // Processar chunk individual
                const chunkViolatedRules = await this.processChunk(
                    context,
                    chunk,
                    kodyRulesPrLevel,
                    language,
                    provider,
                    i,
                );

                if (chunkViolatedRules?.length) {
                    allViolatedRules.push(...chunkViolatedRules);
                }
            } catch (error) {
                this.logger.error({
                    message: `Error processing chunk ${i + 1}`,
                    context: KodyRulesPrLevelAnalysisService.name,
                    error,
                    metadata: {
                        chunkIndex: i,
                        filesInChunk: chunk.length,
                    },
                });
                // Continue com próximo chunk
            }
        }

        // 4. Combinar resultados de todos os chunks
        return this.combineChunkResults(
            allViolatedRules,
            kodyRulesPrLevel,
            organizationAndTeamData,
            prNumber,
        );
    }

    /**
     * Processa um chunk individual
     */
    private async processChunk(
        context: AnalysisContext,
        filesChunk: FileChange[],
        kodyRulesPrLevel: Array<Partial<IKodyRule>>,
        language: string,
        provider: LLMModelProvider,
        chunkIndex: number,
    ): Promise<ExtendedKodyRule[] | null> {
        // Preparar payload para este chunk
        const analyzerPayload: KodyRulesPrLevelPayload = {
            pr_title: context.pullRequest.title,
            pr_description: context.pullRequest.body || '',
            files: filesChunk,
            rules: kodyRulesPrLevel,
            language,
        };

        // Criar e invocar chain para este chunk
        const analyzerChain = await this.createAnalyzerChain(
            provider,
            analyzerPayload,
        );

        const analyzerResult = await analyzerChain.invoke(analyzerPayload);

        // Processar resposta deste chunk
        return this.processAnalyzerResponse(
            kodyRulesPrLevel,
            analyzerResult,
            filesChunk, // Passar apenas arquivos deste chunk
        );
    }

    /**
     * Combina resultados de múltiplos chunks
     */
    private async combineChunkResults(
        allViolatedRules: ExtendedKodyRule[],
        kodyRulesPrLevel: Array<Partial<IKodyRule>>,
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
    ): Promise<AIAnalysisResultPrLevel> {
        if (!allViolatedRules?.length) {
            this.logger.log({
                message: `No violations found across all chunks for PR#${prNumber}`,
                context: KodyRulesPrLevelAnalysisService.name,
            });
            return {
                codeSuggestions: [],
            };
        }

        // Deduplicate violated rules (mesmo rule pode ter violações em chunks diferentes)
        const uniqueViolatedRules =
            this.deduplicateViolatedRules(allViolatedRules);

        this.logger.log({
            message: `Combined chunk results`,
            context: KodyRulesPrLevelAnalysisService.name,
            metadata: {
                totalViolations: allViolatedRules.length,
                uniqueViolatedRules: uniqueViolatedRules.length,
            },
        });

        // Mapear para suggestions
        const suggestions = this.mapViolatedRulesToSuggestions(
            uniqueViolatedRules as unknown as ExtendedKodyRuleWithSuggestions[],
        );

        // Adicionar severidade
        const suggestionsWithSeverity = this.addSeverityToSuggestions(
            { codeSuggestions: suggestions },
            kodyRulesPrLevel,
        );

        // Processar links
        return this.replaceKodyRuleIdsWithLinks(
            suggestionsWithSeverity,
            organizationAndTeamData,
            prNumber,
        );
    }

    /**
     * Remove duplicatas de regras violadas (merge violations do mesmo rule)
     */
    private deduplicateViolatedRules(
        violatedRules: ExtendedKodyRule[],
    ): ExtendedKodyRule[] {
        const ruleMap = new Map<string, ExtendedKodyRule>();

        for (const rule of violatedRules) {
            if (!rule.uuid) continue;

            if (ruleMap.has(rule.uuid)) {
                // Merge violations
                const existingRule = ruleMap.get(rule.uuid)!;
                existingRule.violations = [
                    ...(existingRule.violations || []),
                    ...(rule.violations || []),
                ];
            } else {
                ruleMap.set(rule.uuid, rule);
            }
        }

        return Array.from(ruleMap.values());
    }
}
