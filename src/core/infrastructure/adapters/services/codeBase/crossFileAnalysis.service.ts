import { Injectable, Inject } from '@nestjs/common';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { LLM_PROVIDER_SERVICE_TOKEN } from '@/core/infrastructure/adapters/services/llmProviders/llmProvider.service.contract';
import { LLMProviderService } from '@/core/infrastructure/adapters/services/llmProviders/llmProvider.service';
import { LLMModelProvider } from '@/core/infrastructure/adapters/services/llmProviders/llmModelProvider.helper';
import { TokenChunkingService } from '@/shared/utils/tokenChunking/tokenChunking.service';
import {
    TokenTrackingService,
    TokenTrackingSession,
} from '@/shared/infrastructure/services/tokenTracking/tokenTracking.service';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import {
    CrossFileAnalysisPayload,
    prompt_codereview_cross_file_analysis,
    prompt_codereview_cross_file_safeguard,
} from '@/shared/utils/langchainCommon/prompts/codeReviewCrossFileAnalysis';
import {
    FileChange,
    AnalysisContext,
    CodeSuggestion,
} from '@/config/types/general/codeReview.type';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { tryParseJSONObject } from '@/shared/utils/transforms/json';
import { v4 as uuidv4 } from 'uuid';

//#region Interfaces
interface TokenUsage {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    model?: string;
    runId?: string;
    parentRunId?: string;
}

interface BatchProcessingConfig {
    maxConcurrentChunks: number;
    batchDelay: number; // milliseconds between batches
    retryAttempts: number;
    retryDelay: number; // milliseconds
}

interface ChunkProcessingResult {
    chunkIndex: number;
    result: CodeSuggestion[] | null;
    error?: Error;
    tokenUsage?: TokenUsage[];
}

type AnalysisType = 'cross_file_analysis' | 'safeguard';
//#endregion

export const CROSS_FILE_ANALYSIS_SERVICE_TOKEN = Symbol('CrossFileAnalysisService');

@Injectable()
export class CrossFileAnalysisService {
    private readonly tokenTracker: TokenTrackingSession;
    private readonly DEFAULT_USAGE_LLM_MODEL_PERCENTAGE = 70;
    private readonly DEFAULT_BATCH_CONFIG: BatchProcessingConfig = {
        maxConcurrentChunks: 10,
        batchDelay: 2000,
        retryAttempts: 3,
        retryDelay: 1000,
    };

    constructor(
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

    /**
     * Executa análise cross-file completa: análise principal + safeguard
     */
    async analyzeCrossFileCode(
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
        context: AnalysisContext,
        changedFiles: FileChange[],
    ): Promise<{ codeSuggestions: CodeSuggestion[] }> {
        // Validações de segurança
        if (!changedFiles || !Array.isArray(changedFiles) || changedFiles.length === 0) {
            this.logger.warn({
                message: 'No changed files found for cross-file analysis',
                context: CrossFileAnalysisService.name,
                metadata: { organizationAndTeamData, prNumber },
            });
            return {
                codeSuggestions: [],
            };
        }

        if (!context?.codeReviewConfig) {
            this.logger.error({
                message: 'Missing codeReviewConfig in context',
                context: CrossFileAnalysisService.name,
                metadata: { organizationAndTeamData, prNumber },
            });
            return {
                codeSuggestions: [],
            };
        }

        const language = context.codeReviewConfig.languageResultPrompt || 'en-US';
        const provider = LLMModelProvider.GEMINI_2_5_PRO;

        this.tokenTracker.reset();

        try {
            // 1. Executar análise cross-file principal
            const crossFileAnalysisSuggestions = await this.processWithTokenChunking(
                organizationAndTeamData,
                prNumber,
                context,
                changedFiles,
                language,
                provider,
                'cross_file_analysis',
            );

            // 2. Se temos sugestões da análise principal, executar safeguard para validá-las
            let finalSuggestions: CodeSuggestion[] = crossFileAnalysisSuggestions;

            return {
                codeSuggestions: finalSuggestions,
            };

            if (crossFileAnalysisSuggestions.length > 0) {
                const safeguardValidatedSuggestions = await this.processSafeguardAnalysis(
                    organizationAndTeamData,
                    prNumber,
                    crossFileAnalysisSuggestions,
                    language,
                    provider,
                );

                // O safeguard retorna apenas as sugestões que passaram na validação
                finalSuggestions = safeguardValidatedSuggestions;
            }

            this.logger.log({
                message: 'Cross-file analysis completed successfully',
                context: CrossFileAnalysisService.name,
                metadata: {
                    organizationAndTeamData,
                    prNumber,
                    originalSuggestions: crossFileAnalysisSuggestions.length,
                    finalSuggestions: finalSuggestions.length,
                },
            });

            return {
                codeSuggestions: finalSuggestions,
            };
        } catch (error) {
            this.logger.error({
                message: `Error during cross-file analysis for PR#${prNumber}`,
                context: CrossFileAnalysisService.name,
                error,
                metadata: { organizationAndTeamData, prNumber },
            });
            return {
                codeSuggestions: [],
            };
        }
    }

    //#region Generic Provider Chain Creation
    /**
     * Cria chain genérica com fallback para qualquer tipo de análise
     */
    private async createGenericAnalysisChain(
        provider: LLMModelProvider,
        analysisType: AnalysisType,
        payload: any,
        prNumber: number,
        organizationAndTeamData: OrganizationAndTeamData,
    ) {
        const fallbackProvider = LLMModelProvider.VERTEX_CLAUDE_3_5_SONNET;

        try {
            const mainChain = await this.createGenericProviderChain(
                provider,
                analysisType,
                payload,
                prNumber,
                organizationAndTeamData,
            );
            const fallbackChain = await this.createGenericProviderChain(
                fallbackProvider,
                analysisType,
                payload,
                prNumber,
                organizationAndTeamData,
            );

            return mainChain
                .withFallbacks({
                    fallbacks: [fallbackChain],
                })
                .withConfig({
                    tags: this.buildTags(provider, 'primary', analysisType),
                    runName: `crossFile${analysisType.charAt(0).toUpperCase() + analysisType.slice(1)}`,
                    metadata: {
                        organizationAndTeamData,
                        prNumber,
                        provider: provider,
                        fallbackProvider: fallbackProvider,
                        analysisType,
                    },
                });
        } catch (error) {
            this.logger.error({
                message: 'Error creating generic analysis chain with fallback',
                error,
                context: CrossFileAnalysisService.name,
                metadata: {
                    provider,
                    fallbackProvider,
                    prNumber,
                    organizationAndTeamData,
                    analysisType,
                },
            });
            throw error;
        }
    }

    /**
     * Cria provider chain específico para um tipo de análise
     */
    private async createGenericProviderChain(
        provider: LLMModelProvider,
        analysisType: AnalysisType,
        payload: any,
        prNumber: number,
        organizationAndTeamData: OrganizationAndTeamData,
    ) {
        try {
            const llm = this.llmProviderService.getLLMProvider({
                model: provider,
                temperature: 0,
                jsonMode: true,
                callbacks: [this.tokenTracker.createCallbackHandler()],
            });

            const tags = this.buildTags(provider, 'primary', analysisType);

            const chain = RunnableSequence.from([
                async (input: any) => {
                    let systemPrompt: string;

                    switch (analysisType) {
                        case 'cross_file_analysis':
                            systemPrompt = prompt_codereview_cross_file_analysis(payload);
                            break;
                        case 'safeguard':
                            systemPrompt = prompt_codereview_cross_file_safeguard(payload);
                            break;
                        default:
                            throw new Error(`Unknown analysis type: ${analysisType}`);
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
                message: 'Error creating generic provider chain',
                error,
                context: CrossFileAnalysisService.name,
                metadata: { provider, prNumber, organizationAndTeamData, analysisType },
            });
            throw error;
        }
    }
    //#endregion

    //#region Token Chunking with Parallel Processing
    /**
     * Processa análise com token chunking
     */
    private async processWithTokenChunking(
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
        context: AnalysisContext,
        changedFiles: FileChange[],
        language: string,
        provider: LLMModelProvider,
        analysisType: AnalysisType,
    ): Promise<CodeSuggestion[]> {
        // 1. Preparar dados para chunking
        const preparedFiles = this.prepareFilesForPayload(changedFiles);

        // 2. Dividir arquivos em chunks
        const chunkingResult = this.tokenChunkingService.chunkDataByTokens({
            model: provider,
            data: preparedFiles,
            usagePercentage: this.DEFAULT_USAGE_LLM_MODEL_PERCENTAGE,
        });

        this.logger.log({
            message: `PR divided into ${chunkingResult.totalChunks} chunks for ${analysisType}`,
            context: CrossFileAnalysisService.name,
            metadata: {
                totalFiles: preparedFiles.length,
                totalChunks: chunkingResult.totalChunks,
                tokenLimit: chunkingResult.tokenLimit,
                tokensPerChunk: chunkingResult.tokensPerChunk,
                prNumber,
                organizationAndTeamData,
                analysisType,
            },
        });

        // 3. Determinar configuração de batch
        const batchConfig = { ...this.DEFAULT_BATCH_CONFIG };

        // 4. Processar chunks em batches paralelos
        const allSuggestions = await this.processChunksInBatches(
            chunkingResult.chunks,
            context,
            language,
            provider,
            analysisType,
            prNumber,
            organizationAndTeamData,
            batchConfig,
        );

        this.logger.log({
            message: `Parallel chunk processing completed for ${analysisType}`,
            context: CrossFileAnalysisService.name,
            metadata: {
                totalChunks: chunkingResult.totalChunks,
                suggestionsFound: allSuggestions.length,
                prNumber,
                organizationAndTeamData,
                analysisType,
            },
        });

        return allSuggestions;
    }

    /**
     * Processa chunks em batches paralelos
     */
    private async processChunksInBatches(
        chunks: FileChange[][],
        context: AnalysisContext,
        language: string,
        provider: LLMModelProvider,
        analysisType: AnalysisType,
        prNumber: number,
        organizationAndTeamData: OrganizationAndTeamData,
        batchConfig: BatchProcessingConfig,
    ): Promise<CodeSuggestion[]> {
        const allSuggestions: CodeSuggestion[] = [];
        const totalChunks = chunks.length;
        const { maxConcurrentChunks, batchDelay } = batchConfig;

        for (let i = 0; i < totalChunks; i += maxConcurrentChunks) {
            const batchNumber = Math.floor(i / maxConcurrentChunks) + 1;
            const totalBatches = Math.ceil(totalChunks / maxConcurrentChunks);
            const batchChunks = chunks.slice(i, i + maxConcurrentChunks);

            this.logger.log({
                message: `Processing batch ${batchNumber}/${totalBatches} for ${analysisType}`,
                context: CrossFileAnalysisService.name,
                metadata: {
                    batchNumber,
                    totalBatches,
                    chunksInBatch: batchChunks.length,
                    prNumber,
                    analysisType,
                },
            });

            const batchResults = await this.processBatchInParallel(
                batchChunks,
                i,
                context,
                language,
                provider,
                analysisType,
                prNumber,
                organizationAndTeamData,
                batchConfig,
            );

            batchResults.forEach(({ result, error, chunkIndex }) => {
                if (error) {
                    this.logger.error({
                        message: `Error in batch ${batchNumber}, chunk ${chunkIndex} for ${analysisType}`,
                        context: CrossFileAnalysisService.name,
                        error,
                        metadata: {
                            batchNumber,
                            chunkIndex,
                            prNumber,
                            organizationAndTeamData,
                            analysisType,
                        },
                    });
                } else if (result?.length) {
                    allSuggestions.push(...result);
                }
            });

            if (i + maxConcurrentChunks < totalChunks && batchDelay > 0) {
                await this.delay(batchDelay);
            }
        }

        return allSuggestions;
    }

    /**
     * Processa batch em paralelo
     */
    private async processBatchInParallel(
        batchChunks: FileChange[][],
        indexOffset: number,
        context: AnalysisContext,
        language: string,
        provider: LLMModelProvider,
        analysisType: AnalysisType,
        prNumber: number,
        organizationAndTeamData: OrganizationAndTeamData,
        batchConfig: BatchProcessingConfig,
    ): Promise<ChunkProcessingResult[]> {
        const chunkPromises = batchChunks.map(async (chunk, batchIndex) => {
            const chunkIndex = indexOffset + batchIndex;

            return this.processChunkWithRetry(
                chunk,
                chunkIndex,
                context,
                language,
                provider,
                analysisType,
                prNumber,
                organizationAndTeamData,
                batchConfig,
            );
        });

        return Promise.all(chunkPromises);
    }

    /**
     * Processa chunk com retry
     */
    private async processChunkWithRetry(
        chunk: FileChange[],
        chunkIndex: number,
        context: AnalysisContext,
        language: string,
        provider: LLMModelProvider,
        analysisType: AnalysisType,
        prNumber: number,
        organizationAndTeamData: OrganizationAndTeamData,
        batchConfig: BatchProcessingConfig,
    ): Promise<ChunkProcessingResult> {
        const { retryAttempts, retryDelay } = batchConfig;
        const MAX_RETRY_DELAY = 10000;

        for (let attempt = 1; attempt <= retryAttempts; attempt++) {
            try {
                this.logger.log({
                    message: `Processing chunk ${chunkIndex + 1} for ${analysisType} (attempt ${attempt})`,
                    context: CrossFileAnalysisService.name,
                    metadata: {
                        chunkIndex,
                        attempt,
                        filesInChunk: chunk.length,
                        prNumber,
                        organizationAndTeamData,
                        analysisType,
                    },
                });

                const result = await this.processChunk(
                    context,
                    chunk,
                    language,
                    provider,
                    analysisType,
                    chunkIndex,
                    prNumber,
                    organizationAndTeamData,
                );

                return { chunkIndex, result };
            } catch (error) {
                this.logger.warn({
                    message: `Error processing chunk ${chunkIndex + 1} for ${analysisType}, attempt ${attempt}`,
                    context: CrossFileAnalysisService.name,
                    error,
                    metadata: {
                        chunkIndex,
                        attempt,
                        prNumber,
                        organizationAndTeamData,
                        analysisType,
                    },
                });

                if (attempt < retryAttempts) {
                    const delayMs = Math.min(retryDelay * attempt, MAX_RETRY_DELAY);
                    await this.delay(delayMs);
                } else {
                    this.logger.error({
                        message: `Chunk ${chunkIndex + 1} failed after ${retryAttempts} attempts for ${analysisType}`,
                        context: CrossFileAnalysisService.name,
                        error,
                        metadata: {
                            chunkIndex,
                            totalAttempts: retryAttempts,
                            prNumber,
                            organizationAndTeamData,
                            analysisType,
                        },
                    });

                    return { chunkIndex, result: null, error: error as Error };
                }
            }
        }

        return {
            chunkIndex,
            result: null,
            error: new Error('Unexpected error in retry logic'),
        };
    }

    /**
     * Processa chunk individual
     */
    private async processChunk(
        context: AnalysisContext,
        filesChunk: FileChange[],
        language: string,
        provider: LLMModelProvider,
        analysisType: AnalysisType,
        chunkIndex: number,
        prNumber: number,
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<CodeSuggestion[] | null> {
        // Preparar payload baseado no tipo de análise
        let payload: any;

        if (analysisType === 'cross_file_analysis') {
            const fileContexts = this.convertFilesToFileChangeContext(filesChunk);
            payload = {
                files: fileContexts,
                language,
            } as CrossFileAnalysisPayload;
        } else {
            // Para safeguard, o payload são as próprias sugestões
            payload = filesChunk; // Neste caso seria as sugestões
        }

        const analysisChain = await this.createGenericAnalysisChain(
            provider,
            analysisType,
            payload,
            prNumber,
            organizationAndTeamData,
        );

        const result = await analysisChain.invoke(payload);

        return this.processLLMResponse(
            result,
            analysisType,
            prNumber,
            organizationAndTeamData,
        );
    }
    //#endregion

    //#region Safeguard Analysis
    /**
     * Processa análise de safeguard para sugestões existentes
     */
    private async processSafeguardAnalysis(
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
        suggestions: CodeSuggestion[],
        language: string,
        provider: LLMModelProvider,
    ): Promise<CodeSuggestion[]> {
        try {
            this.logger.log({
                message: 'Starting safeguard analysis',
                context: CrossFileAnalysisService.name,
                metadata: {
                    prNumber,
                    organizationAndTeamData,
                    inputSuggestions: suggestions.length,
                },
            });

            const payload = suggestions;

            const safeguardChain = await this.createGenericAnalysisChain(
                provider,
                'safeguard',
                payload,
                prNumber,
                organizationAndTeamData,
            );

            const result = await safeguardChain.invoke(payload);

            const safeguardSuggestions = this.processLLMResponse(
                result,
                'safeguard',
                prNumber,
                organizationAndTeamData,
            );

            this.logger.log({
                message: 'Safeguard analysis completed',
                context: CrossFileAnalysisService.name,
                metadata: {
                    prNumber,
                    organizationAndTeamData,
                    inputSuggestions: suggestions.length,
                    outputSuggestions: safeguardSuggestions?.length || 0,
                },
            });

            return safeguardSuggestions || [];
        } catch (error) {
            this.logger.error({
                message: 'Error during safeguard analysis',
                context: CrossFileAnalysisService.name,
                error,
                metadata: {
                    prNumber,
                    organizationAndTeamData,
                    inputSuggestions: suggestions.length,
                },
            });
            return [];
        }
    }
    //#endregion

    //#region Response Processing
    /**
     * Processa resposta do LLM baseada no tipo de análise
     */
    private processLLMResponse(
        response: string,
        analysisType: AnalysisType,
        prNumber: number,
        organizationAndTeamData: OrganizationAndTeamData,
    ): CodeSuggestion[] | null {
        try {
            if (!response) {
                this.logger.warn({
                    message: `Empty response from LLM for ${analysisType}`,
                    context: CrossFileAnalysisService.name,
                    metadata: { prNumber, organizationAndTeamData, analysisType },
                });
                return null;
            }

            let cleanResponse = response;
            if (response?.startsWith('```')) {
                cleanResponse = response
                    .replace(/^```json\n/, '')
                    .replace(/\n```(\n)?$/, '')
                    .trim();
            }

            const parsedResponse = tryParseJSONObject(cleanResponse);

            if (!parsedResponse) {
                this.logger.warn({
                    message: `Failed to parse LLM response for ${analysisType}`,
                    context: CrossFileAnalysisService.name,
                    metadata: {
                        prNumber,
                        organizationAndTeamData,
                        analysisType,
                        responseLength: response.length,
                    },
                });
                return null;
            }

            // Normalizar resposta para array
            let suggestions: CodeSuggestion[] = [];
            if (Array.isArray(parsedResponse)) {
                suggestions = parsedResponse;
            } else if (parsedResponse && typeof parsedResponse === 'object') {
                suggestions = [parsedResponse];
            } else {
                return null;
            }

            // Validar e enriquecer sugestões
            const validSuggestions = suggestions
                .filter(suggestion => this.validateSuggestion(suggestion, analysisType))
                .map(suggestion => this.enrichSuggestion(suggestion));

            this.logger.log({
                message: `Successfully processed ${analysisType} response`,
                context: CrossFileAnalysisService.name,
                metadata: {
                    prNumber,
                    organizationAndTeamData,
                    analysisType,
                    rawSuggestions: suggestions.length,
                    validSuggestions: validSuggestions.length,
                },
            });

            return validSuggestions;
        } catch (error) {
            this.logger.error({
                message: `Error processing LLM response for ${analysisType}`,
                context: CrossFileAnalysisService.name,
                error,
                metadata: {
                    prNumber,
                    organizationAndTeamData,
                    analysisType,
                    responseLength: response?.length || 0,
                },
            });
            return null;
        }
    }

    /**
     * Valida se uma sugestão tem os campos obrigatórios
     */
    private validateSuggestion(suggestion: any, analysisType: AnalysisType): boolean {
        const requiredFields = ['suggestionContent', 'relevantFile'];

        for (const field of requiredFields) {
            if (!suggestion[field]) {
                this.logger.warn({
                    message: `Suggestion missing required field: ${field}`,
                    context: CrossFileAnalysisService.name,
                    metadata: { analysisType, suggestion },
                });
                return false;
            }
        }

        return true;
    }

    /**
     * Enriquece sugestão com campos padrão se necessário
     */
    private enrichSuggestion(suggestion: any): CodeSuggestion {
        return {
            id: suggestion.id || uuidv4(),
            relevantFile: suggestion.relevantFile,
            language: suggestion.language || 'typescript',
            suggestionContent: suggestion.suggestionContent,
            existingCode: suggestion.existingCode,
            improvedCode: suggestion.improvedCode || '',
            oneSentenceSummary: suggestion.oneSentenceSummary,
            relevantLinesStart: suggestion.relevantLinesStart,
            relevantLinesEnd: suggestion.relevantLinesEnd,
            label: suggestion.label || 'maintainability',
            severity: suggestion.severity,
            rankScore: suggestion?.rankScore || 0,
            ...suggestion, // Preserva outros campos que podem existir
        };
    }
    //#endregion

    //#region Utility Methods
    /**
     * Converte FileChange[] para Partial<FileChangeContext>[]
     */
    private convertFilesToFileChangeContext(files: FileChange[]): Partial<any>[] {
        return files.map(file => ({
            file: {
                filename: file.filename,
                codeDiff: file.patch || '',
            },
        }));
    }

    /**
     * Prepara arquivos para payload removendo conteúdo desnecessário
     */
    private prepareFilesForPayload(changedFiles: FileChange[]): FileChange[] {
        return changedFiles.map((file) => ({
            ...file,
            fileContent: undefined,
        }));
    }

    /**
     * Utility para delay
     */
    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Constrói tags para o LLM
     */
    private buildTags(
        provider: LLMModelProvider,
        tier: 'primary' | 'fallback',
        analysisType: AnalysisType,
    ): string[] {
        return [
            `model:${provider}`,
            `tier:${tier}`,
            'crossFileAnalysis',
            analysisType,
        ];
    }
    //#endregion
}
