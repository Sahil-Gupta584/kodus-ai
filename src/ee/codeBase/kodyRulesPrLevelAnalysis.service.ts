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
import {
    KodyRulesPrLevelPayload,
    prompt_kodyrules_prlevel_analyzer,
    prompt_kodyrules_prlevel_group_rules,
} from '@/shared/utils/langchainCommon/prompts/kodyRulesPrLevel';
import { tryParseJSONObject } from '@/shared/utils/transforms/json';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { LabelType } from '@/shared/utils/codeManagement/labels';
import { ISuggestionByPR } from '@/core/domain/pullRequests/interfaces/pullRequests.interface';
import { DeliveryStatus } from '@/core/domain/pullRequests/enums/deliveryStatus.enum';
import { SeverityLevel } from '@/shared/utils/enums/severityLevel.enum';
import { TokenChunkingService } from '@/shared/utils/tokenChunking/tokenChunking.service';
import { TokenTrackingService, TokenTrackingSession } from '@/shared/infrastructure/services/tokenTracking/tokenTracking.service';

//#region Interfaces
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
    violatedFileSha: string[] | null;
    relatedFileIds: string[];
    reason: string;
}

// Interface for violations with suggestions already generated
interface ViolationWithSuggestion {
    violatedFileSha: string[] | null;
    relatedFileSha: string[];
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

interface BatchProcessingConfig {
    maxConcurrentChunks: number;
    batchDelay: number; // milliseconds between batches
    retryAttempts: number;
    retryDelay: number; // milliseconds
}

interface ChunkProcessingResult {
    chunkIndex: number;
    result: ExtendedKodyRule[] | null;
    error?: Error;
    tokenUsage?: TokenUsage[];
}
//#endregion

export const KODY_RULES_PR_LEVEL_ANALYSIS_SERVICE_TOKEN = Symbol(
    'KodyRulesPrLevelAnalysisService',
);

@Injectable()
export class KodyRulesPrLevelAnalysisService
    implements KodyRulesAnalysisService
{
    private readonly tokenTracker: TokenTrackingSession;

    private readonly DEFAULT_USAGE_LLM_MODEL_PERCENTAGE = 70;

    private readonly DEFAULT_BATCH_CONFIG: BatchProcessingConfig = {
        maxConcurrentChunks: 10, // Process 10 chunks simultaneously by default
        batchDelay: 2000, // Time delay between batches
        retryAttempts: 3,
        retryDelay: 1000, // Time delay between retry attempts
    };

    constructor(
        @Inject(KODY_RULES_SERVICE_TOKEN)
        private readonly kodyRulesService: KodyRulesService,

        @Inject(LLM_PROVIDER_SERVICE_TOKEN)
        private readonly llmProviderService: LLMProviderService,

        private readonly logger: PinoLoggerService,

        private readonly tokenChunkingService: TokenChunkingService,
    ) {
        this.tokenTracker = new TokenTrackingSession(
            uuidv4(),
            new TokenTrackingService(),
        );
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

        let filteredKodyRules: Array<Partial<IKodyRule>> = [];

        if (
            context.codeReviewConfig.suggestionControl?.applyFiltersToKodyRules
        ) {
            const minimalSeverityLevel =
                context.codeReviewConfig.suggestionControl.severityLevelFilter;

            filteredKodyRules = await this.filterRulesByMinimumSeverity(
                kodyRulesPrLevel,
                minimalSeverityLevel,
            );

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
        } else {
            filteredKodyRules = kodyRulesPrLevel;
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

    //#region Create and Process Analyzer Chain
    private async createAnalyzerChain(
        provider: LLMModelProvider,
        payload: KodyRulesPrLevelPayload,
        prNumber: number,
        organizationAndTeamData: OrganizationAndTeamData,
    ) {
        const fallbackProvider = LLMModelProvider.VERTEX_CLAUDE_3_5_SONNET;

        try {
            const mainChain = await this.createProviderChain(
                provider,
                payload,
                prNumber,
                organizationAndTeamData,
            );
            const fallbackChain = await this.createProviderChain(
                fallbackProvider,
                payload,
                prNumber,
                organizationAndTeamData,
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
                    prNumber,
                    organizationAndTeamData,
                },
            });
            throw error;
        }
    }

    private async createProviderChain(
        provider: LLMModelProvider,
        payload: KodyRulesPrLevelPayload,
        prNumber: number,
        organizationAndTeamData: OrganizationAndTeamData,
    ) {
        try {
            let llm = this.llmProviderService.getLLMProvider({
                model: provider,
                temperature: 0,
                jsonMode: true,
                callbacks: [this.tokenTracker.createCallbackHandler()],
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
                metadata: { provider, prNumber, organizationAndTeamData },
            });
            throw error;
        }
    }

    private processLLMResponse(response: string): any {
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

            return parsedResponse;
        } catch (error) {
            this.logger.error({
                message: 'Error processing LLM response',
                error,
                context: KodyRulesPrLevelAnalysisService.name,
                metadata: {
                    response,
                },
            });
            return null;
        }
    }

    private processAnalyzerResponse(
        kodyRulesPrLevel: Array<Partial<IKodyRule>>,
        response: string,
        files: FileChange[],
        prNumber: number,
        organizationAndTeamData: OrganizationAndTeamData,
    ): ExtendedKodyRule[] | null {
        try {
            if (!response) {
                return null;
            }

            const parsedResponse = this.processLLMResponse(response);

            if (!parsedResponse?.length) {
                this.logger.warn({
                    message:
                        'Failed to parse analyzer response OR no violations found',
                    context: KodyRulesPrLevelAnalysisService.name,
                    metadata: {
                        prNumber,
                        organizationAndTeamData,
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
                    prNumber,
                    organizationAndTeamData,
                },
            });

            return violatedRules;
        } catch (error) {
            this.logger.error({
                message: 'Error processing analyzer response',
                context: KodyRulesPrLevelAnalysisService.name,
                error,
                metadata: {
                    prNumber,
                    organizationAndTeamData,
                },
            });
            return null;
        }
    }
    //#endregion

    //#region Replace Kody Rule IDs with Links
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
    //#endregion

    //#region Token Chunking with Parallel Processing
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
            usagePercentage: this.DEFAULT_USAGE_LLM_MODEL_PERCENTAGE,
        });

        this.logger.log({
            message: `PR divided into ${chunkingResult.totalChunks} chunks`,
            context: KodyRulesPrLevelAnalysisService.name,
            metadata: {
                totalFiles: preparedFiles.length,
                totalChunks: chunkingResult.totalChunks,
                tokenLimit: chunkingResult.tokenLimit,
                tokensPerChunk: chunkingResult.tokensPerChunk,
                prNumber,
                organizationAndTeamData,
            },
        });

        // 3. Determinar configuração de batch baseada no número de chunks
        const batchConfig = this.determineBatchConfig(chunkingResult.totalChunks);

        this.logger.log({
            message: `Batch configuration determined`,
            context: KodyRulesPrLevelAnalysisService.name,
            metadata: {
                totalChunks: chunkingResult.totalChunks,
                maxConcurrentChunks: batchConfig.maxConcurrentChunks,
                batchDelay: batchConfig.batchDelay,
                prNumber,
            },
        });

        // 4. Processar chunks em batches paralelos
        const allViolatedRules = await this.processChunksInBatches(
            chunkingResult.chunks,
            context,
            kodyRulesPrLevel,
            language,
            provider,
            prNumber,
            organizationAndTeamData,
            batchConfig,
        );

        this.logger.log({
            message: `Parallel chunk processing completed`,
            context: KodyRulesPrLevelAnalysisService.name,
            metadata: {
                totalChunks: chunkingResult.totalChunks,
                violationsFound: allViolatedRules.length,
                prNumber,
                organizationAndTeamData,
            },
        });

        // 5. Combinar resultados de todos os chunks
        return this.combineChunkResults(
            allViolatedRules,
            kodyRulesPrLevel,
            organizationAndTeamData,
            prNumber,
            language,
        );
    }

    /**
     * Determina a configuração de batch baseada no número total de chunks
     */
    private determineBatchConfig(totalChunks: number): BatchProcessingConfig {
        const baseConfig = { ...this.DEFAULT_BATCH_CONFIG };

        if (totalChunks <= 10) {
            baseConfig.maxConcurrentChunks = totalChunks;
            baseConfig.batchDelay = 0;
        } else if (totalChunks <= 50) {
            baseConfig.maxConcurrentChunks = 7;
            baseConfig.batchDelay = 2000;
        } else {
            baseConfig.maxConcurrentChunks = 5;
            baseConfig.batchDelay = 3000;
        }

        return baseConfig;
    }

    /**
     * Processa chunks em batches paralelos
     */
    private async processChunksInBatches(
        chunks: FileChange[][],
        context: AnalysisContext,
        kodyRulesPrLevel: Array<Partial<IKodyRule>>,
        language: string,
        provider: LLMModelProvider,
        prNumber: number,
        organizationAndTeamData: OrganizationAndTeamData,
        batchConfig: BatchProcessingConfig,
    ): Promise<ExtendedKodyRule[]> {
        const allViolatedRules: ExtendedKodyRule[] = [];
        const totalChunks = chunks.length;
        const { maxConcurrentChunks, batchDelay } = batchConfig;

        // Processar chunks em batches
        for (let i = 0; i < totalChunks; i += maxConcurrentChunks) {
            const batchNumber = Math.floor(i / maxConcurrentChunks) + 1;
            const totalBatches = Math.ceil(totalChunks / maxConcurrentChunks);
            const batchChunks = chunks.slice(i, i + maxConcurrentChunks);

            this.logger.log({
                message: `Processing batch ${batchNumber}/${totalBatches}`,
                context: KodyRulesPrLevelAnalysisService.name,
                metadata: {
                    batchNumber,
                    totalBatches,
                    chunksInBatch: batchChunks.length,
                    chunkIndexes: batchChunks.map((_, idx) => i + idx),
                    prNumber,
                },
            });

            // Processar batch atual em paralelo
            const batchResults = await this.processBatchInParallel(
                batchChunks,
                i, // offset for chunk indexing
                context,
                kodyRulesPrLevel,
                language,
                provider,
                prNumber,
                organizationAndTeamData,
                batchConfig,
            );

            // Consolidar resultados do batch
            batchResults.forEach(({ result, error, chunkIndex }) => {
                if (error) {
                    this.logger.error({
                        message: `Error in batch ${batchNumber}, chunk ${chunkIndex}`,
                        context: KodyRulesPrLevelAnalysisService.name,
                        error,
                        metadata: { batchNumber, chunkIndex, prNumber },
                    });
                } else if (result?.length) {
                    allViolatedRules.push(...result);
                }
            });

            // Delay entre batches (exceto no último)
            if (i + maxConcurrentChunks < totalChunks && batchDelay > 0) {
                this.logger.log({
                    message: `Waiting ${batchDelay}ms before next batch`,
                    context: KodyRulesPrLevelAnalysisService.name,
                    metadata: { batchDelay, nextBatch: batchNumber + 1 },
                });
                await this.delay(batchDelay);
            }
        }

        return allViolatedRules;
    }

    /**
     * Processa um batch de chunks em paralelo
     */
    private async processBatchInParallel(
        batchChunks: FileChange[][],
        indexOffset: number,
        context: AnalysisContext,
        kodyRulesPrLevel: Array<Partial<IKodyRule>>,
        language: string,
        provider: LLMModelProvider,
        prNumber: number,
        organizationAndTeamData: OrganizationAndTeamData,
        batchConfig: BatchProcessingConfig,
    ): Promise<ChunkProcessingResult[]> {
        // Criar promises para processar chunks em paralelo
        const chunkPromises = batchChunks.map(async (chunk, batchIndex) => {
            const chunkIndex = indexOffset + batchIndex;

            return this.processChunkWithRetry(
                chunk,
                chunkIndex,
                context,
                kodyRulesPrLevel,
                language,
                provider,
                prNumber,
                organizationAndTeamData,
                batchConfig,
            );
        });

        // Aguardar todos os chunks do batch
        return Promise.all(chunkPromises);
    }

    /**
     * Processa um chunk individual com retry logic
     */
    private async processChunkWithRetry(
        chunk: FileChange[],
        chunkIndex: number,
        context: AnalysisContext,
        kodyRulesPrLevel: Array<Partial<IKodyRule>>,
        language: string,
        provider: LLMModelProvider,
        prNumber: number,
        organizationAndTeamData: OrganizationAndTeamData,
        batchConfig: BatchProcessingConfig,
    ): Promise<ChunkProcessingResult> {
        const { retryAttempts, retryDelay } = batchConfig;

        for (let attempt = 1; attempt <= retryAttempts; attempt++) {
            try {
                this.logger.log({
                    message: `Processing chunk ${chunkIndex + 1} (attempt ${attempt})`,
                    context: KodyRulesPrLevelAnalysisService.name,
                    metadata: {
                        chunkIndex,
                        attempt,
                        filesInChunk: chunk.length,
                        prNumber,
                    },
                });

                const result = await this.processChunk(
                    context,
                    chunk,
                    kodyRulesPrLevel,
                    language,
                    provider,
                    chunkIndex,
                    prNumber,
                    organizationAndTeamData,
                );

                return {
                    chunkIndex,
                    result,
                };
            } catch (error) {
                this.logger.warn({
                    message: `Error processing chunk ${chunkIndex + 1}, attempt ${attempt}`,
                    context: KodyRulesPrLevelAnalysisService.name,
                    error,
                    metadata: { chunkIndex, attempt, prNumber },
                });

                // Se não é a última tentativa, aguardar antes de tentar novamente
                if (attempt < retryAttempts) {
                    await this.delay(retryDelay * attempt); // Exponential backoff
                } else {
                    // Última tentativa falhou
                    return {
                        chunkIndex,
                        result: null,
                        error: error as Error,
                    };
                }
            }
        }

        // Nunca deve chegar aqui, mas TypeScript precisa
        return {
            chunkIndex,
            result: null,
            error: new Error('Unexpected error in retry logic'),
        };
    }

    /**
     * Utility para delay
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private prepareFilesForPayload(changedFiles: FileChange[]): FileChange[] {
        return changedFiles.map((file) => ({
            ...file,
            fileContent: undefined,
        }));
    }

    private async processChunk(
        context: AnalysisContext,
        filesChunk: FileChange[],
        kodyRulesPrLevel: Array<Partial<IKodyRule>>,
        language: string,
        provider: LLMModelProvider,
        chunkIndex: number,
        prNumber: number,
        organizationAndTeamData: OrganizationAndTeamData,
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
            prNumber,
            organizationAndTeamData,
        );

        const analyzerResult = await analyzerChain.invoke(analyzerPayload);

        // Processar resposta deste chunk
        return this.processAnalyzerResponse(
            kodyRulesPrLevel,
            analyzerResult,
            filesChunk,
            prNumber,
            organizationAndTeamData,
        );
    }

    private async combineChunkResults(
        allViolatedRules: ExtendedKodyRule[],
        kodyRulesPrLevel: Array<Partial<IKodyRule>>,
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
        language: string,
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
            await this.deduplicateViolatedRules(allViolatedRules);

        this.logger.log({
            message: `Combined chunk results`,
            context: KodyRulesPrLevelAnalysisService.name,
            metadata: {
                totalViolations: allViolatedRules.length,
                uniqueViolatedRules: uniqueViolatedRules.length,
                prNumber,
                organizationAndTeamData,
            },
        });

        // Mapear para suggestions
        const suggestions = await this.mapViolatedRulesToSuggestions(
            uniqueViolatedRules as unknown as ExtendedKodyRuleWithSuggestions[],
        );

        // NOVO: Agrupar suggestions duplicadas usando LLM
        const groupedSuggestions = await this.groupDuplicateSuggestions(
            suggestions,
            kodyRulesPrLevel,
            language,
            organizationAndTeamData,
            prNumber,
        );

        // Adicionar severidade
        const suggestionsWithSeverity = this.addSeverityToSuggestions(
            { codeSuggestions: groupedSuggestions },
            kodyRulesPrLevel,
        );

        // Processar links
        return this.replaceKodyRuleIdsWithLinks(
            suggestionsWithSeverity,
            organizationAndTeamData,
            prNumber,
        );
    }
    //#endregion

    //#region Grouping Violated Rules
    private async deduplicateViolatedRules(
        violatedRules: ExtendedKodyRule[],
    ): Promise<ExtendedKodyRule[]> {
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

    private async groupDuplicateSuggestions(
        suggestions: ISuggestionByPR[],
        kodyRulesPrLevel: Array<Partial<IKodyRule>>,
        language: string,
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
    ): Promise<ISuggestionByPR[]> {
        if (!suggestions?.length) {
            return suggestions;
        }

        // 1. Identificar suggestions duplicadas (mesma regra)
        const groupedByRule = this.groupSuggestionsByRule(suggestions);

        // 2. Processar apenas grupos com mais de 1 suggestion
        const duplicatedGroups = Object.entries(groupedByRule).filter(
            ([_, groupSuggestions]) => groupSuggestions.length > 1,
        );

        if (!duplicatedGroups.length) {
            this.logger.log({
                message: 'No duplicate suggestions found, skipping grouping',
                context: KodyRulesPrLevelAnalysisService.name,
                metadata: { totalSuggestions: suggestions.length, prNumber },
            });
            return suggestions;
        }

        this.logger.log({
            message: `Found ${duplicatedGroups.length} rule(s) with duplicate suggestions`,
            context: KodyRulesPrLevelAnalysisService.name,
            metadata: {
                duplicatedGroups: duplicatedGroups.length,
                totalSuggestions: suggestions.length,
                prNumber,
            },
        });

        // 3. Processar cada grupo duplicado
        const groupedSuggestions: ISuggestionByPR[] = [];

        for (const [ruleId, duplicatedSuggestions] of duplicatedGroups) {
            try {
                const rule = kodyRulesPrLevel.find((r) => r.uuid === ruleId);

                if (!rule) {
                    this.logger.warn({
                        message: `Rule not found for grouping: ${ruleId}`,
                        context: KodyRulesPrLevelAnalysisService.name,
                    });
                    // Se não encontrar a regra, mantém as suggestions originais
                    groupedSuggestions.push(...duplicatedSuggestions);
                    continue;
                }

                const groupedSuggestion = await this.processRuleGrouping(
                    rule,
                    duplicatedSuggestions,
                    language,
                    organizationAndTeamData,
                    prNumber,
                );

                groupedSuggestions.push(groupedSuggestion);
            } catch (error) {
                this.logger.error({
                    message: `Error grouping suggestions for rule ${ruleId}`,
                    context: KodyRulesPrLevelAnalysisService.name,
                    error,
                    metadata: { ruleId, prNumber },
                });
                // Em caso de erro, mantém as suggestions originais
                groupedSuggestions.push(...duplicatedSuggestions);
            }
        }

        // 4. Adicionar suggestions que não tinham duplicatas
        const nonDuplicatedSuggestions = suggestions.filter((suggestion) => {
            const ruleIds = suggestion.brokenKodyRulesIds || [];
            return !ruleIds.some((ruleId) =>
                duplicatedGroups.some(
                    ([groupRuleId]) => groupRuleId === ruleId,
                ),
            );
        });

        groupedSuggestions.push(...nonDuplicatedSuggestions);

        this.logger.log({
            message: `Grouping completed`,
            context: KodyRulesPrLevelAnalysisService.name,
            metadata: {
                originalSuggestions: suggestions.length,
                finalSuggestions: groupedSuggestions.length,
                groupsProcessed: duplicatedGroups.length,
                prNumber,
            },
        });

        return groupedSuggestions;
    }

    private groupSuggestionsByRule(
        suggestions: ISuggestionByPR[],
    ): Record<string, ISuggestionByPR[]> {
        const grouped: Record<string, ISuggestionByPR[]> = {};

        for (const suggestion of suggestions) {
            const ruleIds = suggestion.brokenKodyRulesIds || [];

            for (const ruleId of ruleIds) {
                if (!grouped[ruleId]) {
                    grouped[ruleId] = [];
                }
                grouped[ruleId].push(suggestion);
            }
        }

        return grouped;
    }

    private async processRuleGrouping(
        rule: Partial<IKodyRule>,
        duplicatedSuggestions: ISuggestionByPR[],
        language: string,
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
    ): Promise<ISuggestionByPR> {
        const provider = LLMModelProvider.GEMINI_2_5_PRO;

        // Preparar payload para o prompt de agrupamento
        const groupingPayload = {
            rule: {
                title: rule.title,
                description: rule.rule,
            },
            language: language,
            violations: duplicatedSuggestions.map((s) => ({
                violatedFileSha: s.files?.violatedFileSha || [],
                relatedFileSha: s.files?.relatedFileSha || [],
                reason: s.suggestionContent,
            })),
        };

        // Criar chain com fallback
        const groupingChain = await this.createGroupingChain(
            provider,
            groupingPayload,
            prNumber,
            organizationAndTeamData,
        );

        // Executar agrupamento
        const response = await groupingChain.invoke(groupingPayload);

        const groupedContent = this.processLLMResponse(response);

        // Criar nova suggestion agrupada baseada na primeira suggestion
        const baseSuggestion = duplicatedSuggestions[0];
        const groupedSuggestion: ISuggestionByPR = {
            id: uuidv4(),
            suggestionContent:
                groupedContent.violations[0].suggestionContent.trim(),
            oneSentenceSummary:
                groupedContent.violations[0].oneSentenceSummary.trim(),
            label: baseSuggestion.label,
            brokenKodyRulesIds: baseSuggestion.brokenKodyRulesIds,
            deliveryStatus: baseSuggestion.deliveryStatus,
            severity: baseSuggestion.severity,
            files: {
                violatedFileSha: groupedContent.violations[0]?.violatedFileSha,
                relatedFileSha: groupedContent.violations[0]?.relatedFileSha,
            },
        };

        return groupedSuggestion;
    }

    private async createGroupingChain(
        provider: LLMModelProvider,
        payload: any,
        prNumber: number,
        organizationAndTeamData: OrganizationAndTeamData,
    ) {
        const fallbackProvider = LLMModelProvider.VERTEX_CLAUDE_3_5_SONNET;

        try {
            const mainChain = await this.createGroupingProviderChain(
                provider,
                payload,
                prNumber,
                organizationAndTeamData,
            );
            const fallbackChain = await this.createGroupingProviderChain(
                fallbackProvider,
                payload,
                prNumber,
                organizationAndTeamData,
            );

            return mainChain
                .withFallbacks({
                    fallbacks: [fallbackChain],
                })
                .withConfig({
                    tags: this.buildTags(provider, 'primary'),
                    runName: 'prLevelKodyRulesGrouper',
                    metadata: {
                        organizationId: organizationAndTeamData.organizationId,
                        provider: provider,
                        fallbackProvider: fallbackProvider,
                    },
                });
        } catch (error) {
            this.logger.error({
                message: 'Error creating grouping chain with fallback',
                error,
                context: KodyRulesPrLevelAnalysisService.name,
                metadata: {
                    provider,
                    fallbackProvider,
                    prNumber,
                    organizationAndTeamData,
                },
            });
            throw error;
        }
    }

    private async createGroupingProviderChain(
        provider: LLMModelProvider,
        payload: any,
        prNumber: number,
        organizationAndTeamData: OrganizationAndTeamData,
    ) {
        try {
            let llm = this.llmProviderService.getLLMProvider({
                model: provider,
                temperature: 0,
                jsonMode: true,
                callbacks: [this.tokenTracker.createCallbackHandler()],
            });

            const tags = this.buildTags(provider, 'primary');

            // Criar chain para agrupamento
            const chain = RunnableSequence.from([
                async (input: any) => {
                    const systemPrompt =
                        prompt_kodyrules_prlevel_group_rules(payload);

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
                                    text: 'Please consolidate the provided violations into a single coherent comment following the instructions.',
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
                message: 'Error creating grouping provider chain',
                error,
                context: KodyRulesPrLevelAnalysisService.name,
                metadata: { provider, prNumber, organizationAndTeamData },
            });
            throw error;
        }
    }
    //#endregion

    //#region Severity Management
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

    private async filterRulesByMinimumSeverity(
        rules: Array<Partial<IKodyRule>>,
        minimalSeverityLevel?: SeverityLevel,
    ): Promise<Array<Partial<IKodyRule>>> {
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
    //#endregion

    //#region Auxiliary Methods
    private async mapViolatedRulesToSuggestions(
        violatedRules: ExtendedKodyRuleWithSuggestions[],
    ): Promise<ISuggestionByPR[]> {
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
                    files: {
                        violatedFileSha: violation?.violatedFileSha || [],
                        relatedFileSha: violation?.relatedFileSha || [],
                    },
                };

                allSuggestions.push(suggestion);
            }
        }

        return allSuggestions;
    }

    private buildTags(
        provider: LLMModelProvider,
        tier: 'primary' | 'fallback',
    ) {
        return [`model:${provider}`, `tier:${tier}`, 'kodyRules', 'prLevel'];
    }
    //#endregion
}
