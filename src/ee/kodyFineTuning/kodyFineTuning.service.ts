import {
    CODE_REVIEW_FEEDBACK_SERVICE_TOKEN,
    ICodeReviewFeedbackService,
} from '@/core/domain/codeReviewFeedback/contracts/codeReviewFeedback.service.contract';
import { ICodeReviewFeedback } from '@/core/domain/codeReviewFeedback/interfaces/codeReviewFeedback.interface';

import {
    PULL_REQUESTS_SERVICE_TOKEN,
    IPullRequestsService,
} from '@/core/domain/pullRequests/contracts/pullRequests.service.contracts';
import { ImplementationStatus } from '@/core/domain/pullRequests/enums/implementationStatus.enum';
import {
    IPullRequests,
    ISuggestionToEmbed,
} from '@/core/domain/pullRequests/interfaces/pullRequests.interface';
import { PullRequestState } from '@/shared/domain/enums/pullRequestState.enum';
import { Injectable, Inject } from '@nestjs/common';
import { SeverityLevel } from '@/shared/utils/enums/severityLevel.enum';
import {
    CodeSuggestion,
    Repository,
} from '@/config/types/general/codeReview.type';

import { kmeans } from 'ml-kmeans';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { FeedbackType } from './domain/enums/feedbackType.enum';
import { IClusterizedSuggestion } from './domain/interfaces/kodyFineTuning.interface';
import { FineTuningType } from './domain/enums/fineTuningType.enum';
import { FineTuningDecision } from './domain/enums/fineTuningDecision.enum';
import {
    ISuggestionEmbeddedService,
    SUGGESTION_EMBEDDED_SERVICE_TOKEN,
} from './domain/suggestionEmbedded/contracts/suggestionEmbedded.service.contract';
import { IGlobalParametersService } from '@/core/domain/global-parameters/contracts/global-parameters.service.contract';
import { GLOBAL_PARAMETERS_SERVICE_TOKEN } from '@/core/domain/global-parameters/contracts/global-parameters.service.contract';
import { GlobalParametersKey } from '@/shared/domain/enums/global-parameters-key.enum';
import { ISuggestionEmbedded } from './domain/suggestionEmbedded/interfaces/suggestionEmbedded.interface';
@Injectable()
export class KodyFineTuningService {
    private readonly MAX_CLUSTERS = 50;
    private readonly DIVISOR_FOR_CLUSTER_QUANTITY = 4;
    private readonly SIMILARITY_THRESHOLD_NEGATIVE = 0.65;
    private readonly SIMILARITY_THRESHOLD_POSITIVE = 0.65;
    private readonly SIMILARITY_THRESHOLD_CLUSTER = 0.5;

    constructor(
        @Inject(PULL_REQUESTS_SERVICE_TOKEN)
        private readonly pullRequestsService: IPullRequestsService,

        @Inject(CODE_REVIEW_FEEDBACK_SERVICE_TOKEN)
        private readonly codeReviewFeedbackService: ICodeReviewFeedbackService,

        @Inject(SUGGESTION_EMBEDDED_SERVICE_TOKEN)
        private readonly suggestionEmbeddedService: ISuggestionEmbeddedService,

        @Inject(GLOBAL_PARAMETERS_SERVICE_TOKEN)
        private readonly globalParametersService: IGlobalParametersService,

        private readonly logger: PinoLoggerService,
    ) {}

    public async startAnalysis(
        organizationId: string,
        repository: { id: string; full_name: string },
        prNumber: number,
        language?: string,
    ): Promise<IClusterizedSuggestion[]> {
        const embeddedSuggestions: Partial<CodeSuggestion>[] = [];
        let suggestions: Partial<CodeSuggestion>[] = [];

        await this.syncronizeSuggestions(organizationId, repository, prNumber);

        const fineTuningType = await this.verifyFineTuningType(
            organizationId,
            repository,
            language,
        );

        if (!fineTuningType) {
            return [];
        }

        try {
            if (fineTuningType === FineTuningType.REPOSITORY) {
                suggestions =
                    (await this.getSuggestionsToRepositoryAnalysis(
                        organizationId,
                        repository,
                        language,
                    )) ?? [];
            } else {
                suggestions =
                    (await this.getSuggestionsToGlobalAnalysis(
                        organizationId,
                        language,
                    )) ?? [];
            }

            if (!suggestions?.length) {
                return [];
            }

            embeddedSuggestions.push(...suggestions);

            const mainClusterizedSuggestions =
                await this.clusterizeSuggestions(embeddedSuggestions);

            return mainClusterizedSuggestions;
        } catch (error) {
            this.logger.error({
                message: 'Error getting embedded suggestions to analyze',
                error,
                context: KodyFineTuningService.name,
                metadata: { organizationId, repository },
            });
            return [];
        }
    }

    public async fineTuningAnalysis(
        organizationId: string,
        prNumber: number,
        repository: { id: string; full_name: string; language: string },
        suggestionsToAnalyze: Partial<CodeSuggestion>[],
        mainClusterizedSuggestions: IClusterizedSuggestion[],
    ) {
        if (
            !suggestionsToAnalyze?.length ||
            !mainClusterizedSuggestions?.length
        ) {
            return {
                keepSuggestions: suggestionsToAnalyze,
                discardedSuggestions: [],
            };
        }

        const newSuggestionsToAnalyzeEmbedded =
            await this.suggestionEmbeddedService.embedSuggestionsForISuggestionToEmbed(
                suggestionsToAnalyze,
                organizationId,
                prNumber,
                repository.id,
                repository.full_name,
            );

        const { keepedSuggestions, discardedSuggestions } =
            await this.analyzeWithClusterization(
                organizationId,
                repository,
                prNumber,
                newSuggestionsToAnalyzeEmbedded,
                mainClusterizedSuggestions,
            );

        return {
            keepedSuggestions,
            discardedSuggestions,
        };
    }

    //#region Get Embedded Suggestions to make analysis
    private async getSuggestionsToGlobalAnalysis(
        organizationId: string,
        language: string,
    ): Promise<Partial<CodeSuggestion>[]> {
        return await this.suggestionEmbeddedService.find({
            language: language?.toLowerCase(),
            organization: { uuid: organizationId },
        });
    }

    private async getSuggestionsToRepositoryAnalysis(
        organizationId: string,
        repository: { id: string; full_name: string },
        language: string,
    ): Promise<Partial<CodeSuggestion>[]> {
        const embeddedSuggestions = await this.suggestionEmbeddedService.find({
            organization: { uuid: organizationId },
            repositoryId: repository.id,
            repositoryFullName: repository.full_name,
            language: language?.toLowerCase(),
        });

        return embeddedSuggestions;
    }
    //#endregion

    //#region Syncronize Suggestions (Implemeted and With User Feedback) In SQL
    async getSuggestionsWithPullRequestData(
        organizationId: string,
        repository: Pick<Repository, 'id' | 'fullName'>,
        status?: PullRequestState,
        syncedEmbeddedSuggestions?: boolean,
    ): Promise<{
        suggestionsToEmbed: ISuggestionToEmbed[];
        pullRequests: IPullRequests[];
    }> {
        try {
            const pullRequests =
                await this.pullRequestsService.findByOrganizationAndRepositoryWithStatusAndSyncedFlag(
                    organizationId,
                    repository,
                    status,
                    syncedEmbeddedSuggestions,
                );

            if (!pullRequests?.length) {
                return { suggestionsToEmbed: [], pullRequests: [] };
            }

            const suggestionsToEmbed = pullRequests?.reduce(
                (acc: ISuggestionToEmbed[], pr) => {
                    const prFiles = pr.files || [];

                    const prSuggestions = prFiles.reduce(
                        (fileAcc: ISuggestionToEmbed[], file) => {
                            const fileSuggestions = (
                                file.suggestions || []
                            ).map((suggestion) => ({
                                ...suggestion,
                                pullRequest: {
                                    id: pr.uuid,
                                    number: pr.number,
                                    repository: {
                                        id: pr.repository.id,
                                        fullName: pr.repository.fullName,
                                    },
                                },
                                organizationId: pr.organizationId,
                            }));
                            return [...fileAcc, ...fileSuggestions];
                        },
                        [],
                    );

                    return [...acc, ...prSuggestions];
                },
                [],
            );

            return { suggestionsToEmbed, pullRequests };
        } catch (error) {
            this.logger.log({
                message: 'Failed to get suggestions by organization and period',
                context: KodyFineTuningService.name,
                error,
                metadata: { organizationId, repository: repository, status },
            });
            throw error;
        }
    }

    async getDataForEmbedSuggestions(
        organizationId: string,
        repository: Pick<Repository, 'id' | 'fullName'>,
        state?: PullRequestState,
    ): Promise<{
        suggestionsToEmbed: ISuggestionToEmbed[];
        pullRequests: IPullRequests[];
    }> {
        const { suggestionsToEmbed, pullRequests } =
            await this.getSuggestionsWithPullRequestData(
                organizationId,
                repository,
                state,
                false,
            );

        if (suggestionsToEmbed?.length <= 0) {
            return { suggestionsToEmbed: [], pullRequests: [] };
        }

        const suggestionsWithFeedback = await this.getSuggestionsWithFeedback(
            suggestionsToEmbed,
            organizationId,
        );

        const implementedSuggestions = await this.getImplementedSuggestions(
            suggestionsToEmbed,
            organizationId,
        );

        if (
            !implementedSuggestions?.length &&
            !suggestionsWithFeedback?.length
        ) {
            return { suggestionsToEmbed: [], pullRequests };
        }

        const refinedSuggestions =
            await this.removeDuplicateAndNeutralSuggestions(
                suggestionsWithFeedback,
                implementedSuggestions,
            );

        const suggestionsWithFeedbackFilteredLabels =
            refinedSuggestions.uniqueSuggestionsWithFeedback.filter(
                (suggestion) =>
                    suggestion.label !== 'kody_rules' &&
                    suggestion.label !== 'breaking_changes',
            );

        const implementedSuggestionsFilteredLabels =
            refinedSuggestions.uniqueImplementedSuggestions.filter(
                (suggestion) =>
                    suggestion.label !== 'kody_rules' &&
                    suggestion.label !== 'breaking_changes',
            );

        const suggestionsToNormalize = [
            ...suggestionsWithFeedbackFilteredLabels,
            ...implementedSuggestionsFilteredLabels,
        ];

        return {
            suggestionsToEmbed: suggestionsToNormalize.map((suggestion) => ({
                ...suggestion,
                suggestionContent: this.normalizeText(
                    suggestion?.suggestionContent,
                ),
                label: this.normalizeText(suggestion?.label),
                severity: this.normalizeText(suggestion?.severity),
            })),
            pullRequests,
        };
    }

    private async getImplementedSuggestions(
        allSuggestions: ISuggestionToEmbed[],
        organizationId: string,
    ): Promise<ISuggestionToEmbed[]> {
        try {
            const implementedSuggestions = allSuggestions.filter(
                (suggestion) =>
                    suggestion.implementationStatus ===
                    ImplementationStatus.IMPLEMENTED,
            );

            return implementedSuggestions;
        } catch (error) {
            this.logger.warn({
                message: 'Error getting implemented suggestions',
                error,
                context: KodyFineTuningService.name,
                metadata: {
                    allSuggestionsLength: allSuggestions?.length,
                    organizationId,
                },
            });
            return [];
        }
    }

    private async getCodeReviewFeedback(
        organizationId: string,
        syncedEmbeddedSuggestions: boolean,
    ): Promise<ICodeReviewFeedback[]> {
        return await this.codeReviewFeedbackService.findByOrganizationAndSyncedFlag(
            organizationId,
            syncedEmbeddedSuggestions,
        );
    }

    private async getSuggestionsWithFeedback(
        allSuggestions: ISuggestionToEmbed[],
        organizationId: string,
    ): Promise<ISuggestionToEmbed[]> {
        try {
            const feedbacks = await this.getCodeReviewFeedback(
                organizationId,
                false,
            );

            if (!feedbacks?.length || !allSuggestions?.length) {
                return [];
            }

            const feedbackMap = new Map(
                feedbacks.map((feedback) => [feedback.suggestionId, feedback]),
            );

            const suggestionsWithFeedback = allSuggestions
                .filter((suggestion) => feedbackMap.has(suggestion.id))
                .map((suggestion) => ({
                    ...suggestion,
                    feedbackType: this.identifyFeedbackType(
                        feedbackMap.get(suggestion.id),
                    ),
                }));

            return suggestionsWithFeedback;
        } catch (error) {
            this.logger.warn({
                message: 'Error getting suggestions with feedback',
                error,
                context: KodyFineTuningService.name,
                metadata: {
                    organizationId,
                    allSuggestionsLength: allSuggestions?.length,
                },
            });

            return [];
        }
    }

    private async syncronizeSuggestions(
        organizationId: string,
        repository: Pick<Repository, 'id' | 'fullName'>,
        prNumber: number,
    ) {
        try {
            const embeddedSuggestions: ISuggestionEmbedded[] = [];

            const { suggestionsToEmbed, pullRequests } =
                await this.getDataForEmbedSuggestions(
                    organizationId,
                    repository,
                    PullRequestState.CLOSED,
                );

            if (suggestionsToEmbed?.length > 0) {
                embeddedSuggestions.push(
                    ...(await this.suggestionEmbeddedService.bulkCreateFromMongoData(
                        suggestionsToEmbed,
                    )),
                );
            }

            if (pullRequests?.length > 0) {
                let pullRequestNumbers: number[] = [
                    ...new Set(
                        pullRequests?.map((pullRequest) => pullRequest.number),
                    ),
                ];

                if (prNumber) {
                    pullRequestNumbers = pullRequestNumbers.filter(
                        (number) => number !== prNumber,
                    );
                }

                await Promise.all(
                    pullRequestNumbers?.map(async (pullRequestNumber) => {
                        await this.pullRequestsService.updateSyncedSuggestionsFlag(
                            pullRequestNumber,
                            repository.id,
                            organizationId,
                            true,
                        );
                    }),
                );
            }

            if (embeddedSuggestions?.length > 0) {
                await Promise.all(
                    embeddedSuggestions?.map(async (suggestion) => {
                        await this.codeReviewFeedbackService.updateSyncedSuggestionsFlag(
                            organizationId,
                            true,
                            suggestion?.suggestionId,
                        );
                    }),
                );

                return embeddedSuggestions;
            }
        } catch (error) {
            this.logger.error({
                message: 'Error syncing suggestions',
                error,
                context: KodyFineTuningService.name,
                metadata: {
                    organizationId,
                    repositoryId: repository.id,
                    repositoryFullName: repository.fullName,
                },
            });
            return [];
        }
    }
    //#endregion

    //#region Helper Methods
    private normalizeText(text: string): string {
        if (!text) {
            return '';
        }
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s\-\_\.\(\)\{\}\[\]]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private identifyFeedbackType(feedback: ICodeReviewFeedback): string {
        if (!feedback?.reactions) {
            return FeedbackType.NEUTRAL;
        }

        if (
            feedback.reactions?.thumbsUp > 0 &&
            feedback.reactions?.thumbsUp > feedback.reactions?.thumbsDown
        ) {
            return FeedbackType.POSITIVE_REACTION;
        } else if (
            feedback.reactions?.thumbsDown > 0 &&
            feedback.reactions?.thumbsDown > feedback.reactions?.thumbsUp
        ) {
            return FeedbackType.NEGATIVE_REACTION;
        } else {
            return FeedbackType.NEUTRAL;
        }
    }

    private async removeDuplicateAndNeutralSuggestions(
        suggestionsWithFeedback: ISuggestionToEmbed[],
        implementedSuggestions: ISuggestionToEmbed[],
    ): Promise<{
        uniqueSuggestionsWithFeedback: ISuggestionToEmbed[];
        uniqueImplementedSuggestions: ISuggestionToEmbed[];
    }> {
        try {
            const implementedIds = new Set(
                implementedSuggestions.map((s) => s.id),
            );

            const uniqueSuggestionsWithFeedback =
                suggestionsWithFeedback.filter(
                    (suggestion) =>
                        !implementedIds.has(suggestion.id) &&
                        suggestion.feedbackType !== FeedbackType.NEUTRAL,
                );

            return {
                uniqueSuggestionsWithFeedback,
                uniqueImplementedSuggestions: implementedSuggestions.map(
                    (s) => ({
                        ...s,
                        feedbackType: FeedbackType.SUGGESTION_IMPLEMENTED,
                    }),
                ),
            };
        } catch (error) {
            this.logger.warn({
                message: 'Error removing duplicate and neutral suggestions',
                error,
                context: KodyFineTuningService.name,
            });
            return {
                uniqueSuggestionsWithFeedback: suggestionsWithFeedback,
                uniqueImplementedSuggestions: implementedSuggestions,
            };
        }
    }

    private async verifyFineTuningType(
        organizationId: string,
        repository: { id: string; full_name: string },
        language: string,
    ): Promise<FineTuningType | null> {
        const suggestionEmbedded = await this.suggestionEmbeddedService.find({
            organization: { uuid: organizationId },
            repositoryId: repository.id,
            repositoryFullName: repository.full_name,
            language: language?.toLowerCase(),
        });

        if (suggestionEmbedded?.length >= 50) {
            return FineTuningType.REPOSITORY;
        }

        const globalSuggestionEmbedded =
            await this.suggestionEmbeddedService.find({
                organization: { uuid: organizationId },
                language: language?.toLowerCase(),
            });

        if (globalSuggestionEmbedded?.length >= 50) {
            return FineTuningType.GLOBAL;
        }

        return null;
    }
    //#endregion

    //#region Clusterize Analysis
    async clusterizeSuggestions(
        suggestions: Partial<ISuggestionEmbedded>[],
    ): Promise<IClusterizedSuggestion[]> {
        try {
            if (!suggestions?.length) {
                return [];
            }

            const vectors = suggestions.map((item) => item.suggestionEmbed);

            const { max_clusters, divisor_for_cluster_quantity } =
                await this.getClustersConfig();

            const numberOfClusters = Math.min(
                max_clusters,
                Math.ceil(suggestions.length / divisor_for_cluster_quantity),
            );

            let result = kmeans(vectors, numberOfClusters, {
                initialization: 'kmeans++',
                maxIterations: 1,
            });

            const clusterizedSuggestions: IClusterizedSuggestion[] =
                suggestions.map((item, index) => {
                    const suggestion = suggestions.find(
                        (s) => s.suggestionId === item.suggestionId,
                    );
                    if (!suggestion) {
                        throw new Error(
                            `Suggestion not found for id: ${item.suggestionId}`,
                        );
                    }

                    return {
                        ...item,
                        cluster: result.clusters[index],
                        language: item.language,
                        originalSuggestion: {
                            uuid: suggestion.uuid,
                            suggestionId: suggestion.suggestionId,
                            suggestionContent: suggestion.suggestionContent,
                            suggestionEmbed: suggestion.suggestionEmbed,
                            improvedCode: suggestion.improvedCode,
                            severity: suggestion.severity as SeverityLevel,
                            label: suggestion.label,
                            feedbackType:
                                suggestion.feedbackType as FeedbackType,
                            pullRequestNumber: suggestion.pullRequestNumber,
                            repositoryId: suggestion.repositoryId,
                            repositoryFullName: suggestion.repositoryFullName,
                            organization: {
                                uuid: suggestion.organization?.uuid,
                            },
                            language: item.language,
                        },
                    };
                });

            return clusterizedSuggestions;
        } catch (error) {
            this.logger.error({
                message: 'Error in clusterizeSuggestions',
                error,
                context: KodyFineTuningService.name,
                metadata: {
                    suggestionsLength: suggestions?.length,
                    prNumber: suggestions[0]?.pullRequestNumber,
                    repositoryId: suggestions[0]?.repositoryId,
                    organizationId: suggestions[0]?.organization?.uuid,
                },
            });
            return [];
        }
    }

    private async compareSuggestionsWithClusters(
        newSuggestion: Partial<CodeSuggestion>,
        newSuggestionEmbedded: number[],
        existingClusterizedSuggestions: IClusterizedSuggestion[],
    ): Promise<{
        analyzedSuggestion: Partial<CodeSuggestion>;
        fineTuningDecision: FineTuningDecision;
    }> {
        try {
            // 1. Calculate cluster centroids
            const clusters = this.calculateClusterCentroids(
                existingClusterizedSuggestions,
            );

            // 2. Compare with centroids instead of individual suggestions
            const clusterSimilarities = Object.entries(clusters).map(
                ([clusterId, centroid]) => ({
                    clusterId: Number(clusterId),
                    similarity: this.calculateCosineSimilarity(
                        newSuggestionEmbedded,
                        centroid,
                    ),
                }),
            );

            // 3. Select the most similar cluster based on similarity strength
            const sortedClusters = clusterSimilarities.sort(
                (a, b) => b.similarity - a.similarity,
            );
            const mostSimilarCluster = sortedClusters[0]?.clusterId || 0;

            if (
                sortedClusters[0]?.similarity <
                this.SIMILARITY_THRESHOLD_CLUSTER
            ) {
                return {
                    analyzedSuggestion: newSuggestion,
                    fineTuningDecision: FineTuningDecision.UNCERTAIN,
                };
            }

            return {
                analyzedSuggestion: newSuggestion,
                fineTuningDecision: await this.analyzeClusterFeedback(
                    existingClusterizedSuggestions,
                    mostSimilarCluster,
                    newSuggestionEmbedded,
                ),
            };
        } catch (error) {
            this.logger.error({
                message: 'Error in compareSuggestionsWithClusters',
                error,
                context: KodyFineTuningService.name,
                metadata: {
                    newSuggestion,
                    newSuggestionEmbedded,
                    existingClusterizedSuggestions,
                },
            });
            return {
                analyzedSuggestion: newSuggestion,
                fineTuningDecision: FineTuningDecision.UNCERTAIN,
            };
        }
    }

    private calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
        const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
        const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
        const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
        return dotProduct / (magnitudeA * magnitudeB);
    }

    private async analyzeClusterFeedback(
        existingClusterizedSuggestions: IClusterizedSuggestion[],
        clusterId: number,
        newSuggestionEmbedded: number[],
    ): Promise<FineTuningDecision> {
        try {
            // Obter os thresholds configurados
            const { positiveThreshold, negativeThreshold } =
                await this.defineFineTuningThresholds();

            // Filtrar sugestões do cluster específico
            const clusterSuggestions = existingClusterizedSuggestions.filter(
                (s) => s.cluster === clusterId,
            );

            if (clusterSuggestions.length === 0) {
                return FineTuningDecision.UNCERTAIN;
            }

            // 1. Verificar se todas as sugestões no cluster têm o mesmo tipo de feedback
            const allPositive = clusterSuggestions.every(
                (suggestion) =>
                    suggestion.originalSuggestion.feedbackType ===
                        'positiveReaction' ||
                    suggestion.originalSuggestion.feedbackType ===
                        'suggestionImplemented',
            );

            const allNegative = clusterSuggestions.every(
                (suggestion) =>
                    suggestion.originalSuggestion.feedbackType ===
                    'negativeReaction',
            );

            // Se todas tiverem o mesmo feedback, retornar imediatamente
            if (allPositive) {
                return FineTuningDecision.KEEP;
            } else if (allNegative) {
                return FineTuningDecision.DISCARD;
            }

            // 2. Analisar cada sugestão individualmente se houver feedback misto
            // Calcular similaridade com cada sugestão individual no cluster
            const suggestionsWithSimilarity = await Promise.all(
                clusterSuggestions.map(async (suggestion) => {
                    const suggestionEmbedding =
                        suggestion.originalSuggestion.suggestionEmbed;

                    return {
                        suggestion,
                        similarity: this.calculateCosineSimilarity(
                            newSuggestionEmbedded,
                            suggestionEmbedding,
                        ),
                        isPositive:
                            suggestion.originalSuggestion.feedbackType ===
                                'positiveReaction' ||
                            suggestion.originalSuggestion.feedbackType ===
                                'suggestionImplemented',
                    };
                }),
            );

            // Ordenar por similaridade (maior primeiro)
            const sortedSuggestions = suggestionsWithSimilarity.sort(
                (a, b) => b.similarity - a.similarity,
            );

            // Contadores para decisões
            let keepDecision = 0;
            let discardDecision = 0;

            // Analisar cada sugestão e incrementar os contadores apropriados
            for (const suggestionData of sortedSuggestions) {
                if (
                    suggestionData.isPositive &&
                    suggestionData.similarity >= positiveThreshold
                ) {
                    keepDecision += 1;
                } else if (
                    !suggestionData.isPositive &&
                    suggestionData.similarity >= negativeThreshold
                ) {
                    discardDecision += 1;
                }
            }

            // Tomar decisão baseada na contagem
            if (keepDecision > 0 && keepDecision > discardDecision) {
                return FineTuningDecision.KEEP;
            } else if (discardDecision > 0 && discardDecision > keepDecision) {
                return FineTuningDecision.DISCARD;
            } else {
                return FineTuningDecision.UNCERTAIN;
            }
        } catch (error) {
            this.logger.error({
                message: 'Error in analyzeClusterFeedback',
                error,
                context: KodyFineTuningService.name,
                metadata: {
                    clusterId,
                    existingClusterizedSuggestions,
                },
            });
            return FineTuningDecision.UNCERTAIN;
        }
    }

    private calculateClusterCentroids(
        suggestions: IClusterizedSuggestion[],
    ): Record<number, number[]> {
        const clusters: Record<number, number[][]> = {};

        // Group embeddings by cluster
        for (const suggestion of suggestions) {
            if (!clusters[suggestion.cluster]) {
                clusters[suggestion.cluster] = [];
            }
            clusters[suggestion.cluster].push(
                suggestion.originalSuggestion.suggestionEmbed,
            );
        }

        // Calculate centroid for each cluster
        const centroids: Record<number, number[]> = {};
        for (const [clusterId, embeddings] of Object.entries(clusters)) {
            const dimensions = embeddings[0].length;
            const centroid = new Array(dimensions).fill(0);

            for (const embedding of embeddings) {
                for (let i = 0; i < dimensions; i++) {
                    centroid[i] += embedding[i];
                }
            }

            // Normalize
            for (let i = 0; i < dimensions; i++) {
                centroid[i] /= embeddings.length;
            }

            centroids[Number(clusterId)] = centroid;
        }

        return centroids;
    }

    private async defineWhichClusterShouldBeUsed(
        organizationId: string,
        mainClusterizedSuggestions: IClusterizedSuggestion[],
        newSuggestion: Partial<CodeSuggestion>,
        repository: { id: string; full_name: string; language: string },
        prNumber: number,
    ): Promise<IClusterizedSuggestion[]> {
        if (
            newSuggestion?.language?.toLowerCase() ==
            mainClusterizedSuggestions[0]?.language?.toLowerCase()
        ) {
            return mainClusterizedSuggestions;
        }

        const clusterizedSuggestionsPerFileLanguage = await this.startAnalysis(
            organizationId,
            repository,
            prNumber,
            newSuggestion?.language?.toLowerCase(),
        );

        return clusterizedSuggestionsPerFileLanguage;
    }

    private async analyzeWithClusterization(
        organizationId: string,
        repository: { id: string; full_name: string; language: string },
        prNumber: number,
        suggestionsToAnalyze: Partial<CodeSuggestion>[],
        mainClusterizedSuggestions: IClusterizedSuggestion[],
    ): Promise<{
        keepedSuggestions: Partial<CodeSuggestion>[];
        discardedSuggestions: Partial<CodeSuggestion>[];
    }> {
        if (!mainClusterizedSuggestions?.length) {
            return {
                keepedSuggestions: suggestionsToAnalyze,
                discardedSuggestions: [],
            };
        }

        const results = [];

        suggestionsToAnalyze = [
            {
                relevantFile:
                    'src/core/infrastructure/adapters/services/bitbucket/bitbucket.service.ts',
                language: 'TypeScript',
                suggestionContent:
                    'Consider moving the comment filtering logic to a separate helper function for better maintainability and reusability. This would make the code more modular and easier to test.',
                existingCode:
                    '.filter((comment) => {\n                    return !comment?.content?.raw.includes("## Code Review Completed! 🔥") &&\n                        !comment?.content?.raw.includes("# Found critical issues please"); // Exclude comments with the specific strings\n                })',
                improvedCode:
                    '.filter((comment) => this.shouldIncludeComment(comment))',
                oneSentenceSummary:
                    'Extract comment filtering logic to a helper function for better maintainability.',
                relevantLinesStart: 3185,
                relevantLinesEnd: 3188,
                label: 'maintainability',
                id: '03f8ffdd-379a-484f-8143-c7f1f90e2a9d',
            },
            {
                relevantFile:
                    'src/core/infrastructure/adapters/services/bitbucket/bitbucket.service.ts',
                language: 'TypeScript',
                suggestionContent:
                    'Add null checks for comment.content and comment.content.raw to prevent potential runtime errors when accessing these properties.',
                existingCode:
                    '!comment?.content?.raw.includes("## Code Review Completed! 🔥") &&\n                        !comment?.content?.raw.includes("# Found critical issues please")',
                improvedCode:
                    'comment?.content?.raw && !comment.content.raw.includes("## Code Review Completed! 🔥") &&\n                        !comment.content.raw.includes("# Found critical issues please")',
                oneSentenceSummary:
                    'Add null checks for comment content to prevent runtime errors.',
                relevantLinesStart: 3186,
                relevantLinesEnd: 3187,
                label: 'error_handling',
                id: '9a44decd-56d7-463e-a050-7a776f30c781',
            },
            {
                relevantFile:
                    'src/core/infrastructure/adapters/services/cron/CheckIfPRCanBeApproved.cron.ts',
                language: 'typescript',
                suggestionContent:
                    'The commented-out code block from lines 233-236 appears to be unused. If this logic for Bitbucket platform handling at this specific point is no longer needed or has been moved, it should be removed to improve code clarity and reduce clutter.',
                existingCode:
                    '            // if (platformType === PlatformType.BITBUCKET) {\n            //     await this.getValidUserReviews({ organizationAndTeamData, prNumber, repository, reviewComments });\n            //     return true;\n            // }',
                improvedCode:
                    "// Commented-out code removed for clarity if it's no longer needed.",
                oneSentenceSummary:
                    'Remove commented-out code block that seems unused to improve maintainability.',
                relevantLinesStart: 233,
                relevantLinesEnd: 236,
                label: 'maintainability',
                id: '00faf63b-1210-44e1-b835-85526a8732d3',
            },
            {
                relevantFile:
                    'src/core/infrastructure/adapters/services/cron/CheckIfPRCanBeApproved.cron.ts',
                language: 'typescript',
                suggestionContent:
                    "The type of `reviewComment` within the `.every()` callback is implicitly `any` because `reviewComments` is typed as `any[]` (declared on line 226). Accessing `reviewComment.isResolved` without a defined type can lead to runtime errors if the property doesn't exist, is undefined, or is not a boolean. Define a specific interface for review comments (e.g., `PullRequestReviewComment` or a custom type) and type `reviewComments` accordingly to ensure type safety.",
                existingCode:
                    '        const isEveryReviewCommentResolved = reviewComments?.every((reviewComment) => reviewComment.isResolved);',
                improvedCode:
                    '// Define or import a specific type for review comments, e.g.:\n// interface ReviewCommentWithType {\n//   isResolved: boolean;\n//   // other properties...\n// }\n// Ensure reviewComments is typed, e.g., reviewComments: ReviewCommentWithType[]\n\nconst isEveryReviewCommentResolved = reviewComments?.every((reviewComment: ReviewCommentWithType) => reviewComment.isResolved);',
                oneSentenceSummary:
                    'Add a specific type for `reviewComment` to prevent potential runtime errors when accessing `isResolved`.',
                relevantLinesStart: 333,
                relevantLinesEnd: 333,
                label: 'potential_issues',
                id: 'b3a14386-4bb3-4944-8318-16b3a6c3a4e2',
            },
            {
                relevantFile:
                    'src/core/infrastructure/adapters/services/cron/CheckIfPRCanBeApproved.cron.ts',
                language: 'typescript',
                suggestionContent:
                    "The large block of commented-out code from lines 346-377 should be removed if it's no longer relevant or has been superseded by other logic. Keeping dead code can lead to confusion, increase maintenance overhead, and make the codebase harder to understand.",
                existingCode:
                    '        // const kodyReviewer = kodyUser\n        //     ? pr.participants.find((participant) => participant.id === kodyUser?.author.id)\n        //     : null;\n        //\n        // if (kodyReviewer && kodyReviewer?.approved) {\n        //     return true;\n        // }\n        //\n        // const anyReviewerApproved = reviewers.some((reviewer) => reviewer.approved);\n        //\n        // if (anyReviewerApproved) {\n        //     return true;\n        // }\n        //\n        // const validReviews = reviewComments.filter((reviewComment) => {\n        //     return reviewers.some((reviewer) => reviewer.id === reviewComment.author.id);\n        // });\n        //\n        // const unresolvedReviews = validReviews.filter((review) => review.isResolved === false);\n        //\n        // if (unresolvedReviews.length < 1) {\n        //     await this.codeManagementService.approvePullRequest({\n        //         organizationAndTeamData,\n        //         prNumber,\n        //         repository: {\n        //             name: repository.name,\n        //             id: repository.id,\n        //         }\n        //     }, PlatformType.BITBUCKET);\n        //     return true;\n        // }\n        // return false;',
                improvedCode:
                    '// Large block of commented-out code removed for clarity and maintainability.',
                oneSentenceSummary:
                    'Remove large block of commented-out code to improve code clarity and maintainability.',
                relevantLinesStart: 346,
                relevantLinesEnd: 377,
                label: 'maintainability',
                id: '624ebfb8-c630-401f-9f42-8c4f467b14bf',
            },
        ];

        for (const newSuggestion of suggestionsToAnalyze) {
            const newEmbedding =
                await this.suggestionEmbeddedService.embedSuggestionsForISuggestionToEmbed(
                    [newSuggestion],
                    organizationId,
                    prNumber,
                    repository.id,
                    repository.full_name,
                );

            const clusterizedSuggestions =
                await this.defineWhichClusterShouldBeUsed(
                    organizationId,
                    mainClusterizedSuggestions,
                    newSuggestion,
                    repository,
                    prNumber,
                );

            if (
                !clusterizedSuggestions?.length ||
                clusterizedSuggestions?.length < 50
            ) {
                continue;
            }

            const comparison = await this.compareSuggestionsWithClusters(
                newSuggestion,
                newEmbedding[0].suggestionEmbed,
                clusterizedSuggestions,
            );
            results.push(comparison);
        }

        const keepSuggestions = results.filter(
            (suggestion) =>
                suggestion.fineTuningDecision === FineTuningDecision.KEEP ||
                suggestion.fineTuningDecision === FineTuningDecision.UNCERTAIN,
        );

        const discardedSuggestions = results.filter(
            (suggestion) =>
                suggestion.fineTuningDecision === FineTuningDecision.DISCARD,
        );

        return {
            keepedSuggestions: keepSuggestions.map(
                (suggestion) => suggestion.analyzedSuggestion,
            ),
            discardedSuggestions: discardedSuggestions.map(
                (suggestion) => suggestion.analyzedSuggestion,
            ),
        };
    }
    //#endregion

    private async defineFineTuningThresholds(): Promise<{
        positiveThreshold: number;
        negativeThreshold: number;
    }> {
        const globalParameters = await this.globalParametersService.findByKey(
            GlobalParametersKey.KODY_FINE_TUNING_CONFIG,
        );

        return {
            positiveThreshold:
                globalParameters?.configValue?.positiveThreshold ??
                this.SIMILARITY_THRESHOLD_POSITIVE,
            negativeThreshold:
                globalParameters?.configValue?.negativeThreshold ??
                this.SIMILARITY_THRESHOLD_NEGATIVE,
        };
    }

    private async getClustersConfig(): Promise<{
        max_clusters: number;
        divisor_for_cluster_quantity: number;
    }> {
        const globalParameters = await this.globalParametersService.findByKey(
            GlobalParametersKey.KODY_FINE_TUNING_CONFIG,
        );

        return {
            max_clusters:
                globalParameters?.configValue?.maxClusters ?? this.MAX_CLUSTERS,
            divisor_for_cluster_quantity:
                globalParameters?.configValue?.divisorForClusterQuantity ??
                this.DIVISOR_FOR_CLUSTER_QUANTITY,
        };
    }
}
