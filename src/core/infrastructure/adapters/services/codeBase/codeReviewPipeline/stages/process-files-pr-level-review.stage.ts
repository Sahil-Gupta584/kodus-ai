import { Inject, Injectable } from '@nestjs/common';
import { BasePipelineStage } from '../../../pipeline/base-stage.abstract';
import { CodeReviewPipelineContext } from '../context/code-review-pipeline.context';
import { PinoLoggerService } from '../../../logger/pino.service';
import { KodyRulesScope } from '@/core/domain/kodyRules/interfaces/kodyRules.interface';
import {
    KODY_RULES_PR_LEVEL_ANALYSIS_SERVICE_TOKEN,
    KodyRulesPrLevelAnalysisService,
} from '@/ee/codeBase/kodyRulesPrLevelAnalysis.service';
import { ReviewModeResponse } from '@/config/types/general/codeReview.type';
import {
    COMMENT_MANAGER_SERVICE_TOKEN,
    ICommentManagerService,
} from '@/core/domain/codeBase/contracts/CommentManagerService.contract';
import {
    ISuggestionService,
    SUGGESTION_SERVICE_TOKEN,
} from '@/core/domain/codeBase/contracts/SuggestionService.contract';
import {
    IPullRequestsService,
    PULL_REQUESTS_SERVICE_TOKEN,
} from '@/core/domain/pullRequests/contracts/pullRequests.service.contracts';

@Injectable()
export class ProcessFilesPrLevelReviewStage extends BasePipelineStage<CodeReviewPipelineContext> {
    readonly stageName = 'PRLevelReviewStage';

    constructor(
        private readonly logger: PinoLoggerService,

        @Inject(KODY_RULES_PR_LEVEL_ANALYSIS_SERVICE_TOKEN)
        private readonly kodyRulesPrLevelAnalysisService: KodyRulesPrLevelAnalysisService,

        @Inject(COMMENT_MANAGER_SERVICE_TOKEN)
        private readonly commentManagerService: ICommentManagerService,

        @Inject(SUGGESTION_SERVICE_TOKEN)
        private readonly suggestionService: ISuggestionService,

        @Inject(PULL_REQUESTS_SERVICE_TOKEN)
        private readonly pullRequestsService: IPullRequestsService,
    ) {
        super();
    }

    protected async executeStage(
        context: CodeReviewPipelineContext,
    ): Promise<CodeReviewPipelineContext> {
        if (!context.changedFiles || context.changedFiles.length === 0) {
            this.logger.warn({
                message: `No files to analyze for PR#${context.pullRequest.number}`,
                context: this.stageName,
                metadata: {
                    organizationId:
                        context.organizationAndTeamData.organizationId,
                    prNumber: context.pullRequest.number,
                },
            });
            return context;
        }

        const kodyRulesTurnedOn =
            context?.codeReviewConfig?.reviewOptions?.kody_rules;

        if (!kodyRulesTurnedOn) {
            this.logger.log({
                message: `Kody Rules are not turned on for PR#${context.pullRequest.number}`,
                context: this.stageName,
                metadata: {
                    organizationId:
                        context.organizationAndTeamData.organizationId,
                    prNumber: context.pullRequest.number,
                },
            });
            return context;
        }

        // Verificar se há regras de nível de PR configuradas
        const prLevelRules = context?.codeReviewConfig?.kodyRules?.filter(
            (rule) => rule.scope === KodyRulesScope.PULL_REQUEST,
        );

        if (!prLevelRules?.length) {
            this.logger.log({
                message: `No PR-level Kody Rules configured for PR#${context.pullRequest.number}`,
                context: this.stageName,
                metadata: {
                    totalRules:
                        context?.codeReviewConfig?.kodyRules?.length || 0,
                    organizationAndTeamData: context.organizationAndTeamData,
                },
            });
            return context;
        }

        try {
            this.logger.log({
                message: `Starting PR-level Kody Rules analysis for PR#${context.pullRequest.number}`,
                context: this.stageName,
                metadata: {
                    prLevelRulesCount: prLevelRules.length,
                    totalFilesChanged: context.changedFiles.length,
                    organizationAndTeamData: context.organizationAndTeamData,
                },
            });

            // Executar análise das regras de nível de PR
            const kodyRulesPrLevelAnalysis =
                await this.kodyRulesPrLevelAnalysisService.analyzeCodeWithAI(
                    context.organizationAndTeamData,
                    context.pullRequest.number,
                    context.changedFiles,
                    ReviewModeResponse.HEAVY_MODE,
                    context,
                );

            // Criar comentários e armazenar o resultado no contexto
            if (kodyRulesPrLevelAnalysis?.codeSuggestions?.length > 0) {
                this.logger.log({
                    message: `PR-level analysis completed for PR#${context.pullRequest.number}`,
                    context: this.stageName,
                    metadata: {
                        suggestionsCount:
                            kodyRulesPrLevelAnalysis.codeSuggestions.length,
                        organizationAndTeamData:
                            context.organizationAndTeamData,
                        prNumber: context.pullRequest.number,
                    },
                });

                // Criar comentários para cada sugestão de nível de PR usando o commentManagerService
                const { commentResults } =
                    (await this.commentManagerService.createPrLevelReviewComments(
                        context.organizationAndTeamData,
                        context.pullRequest.number,
                        {
                            name: context.repository.name,
                            id: context.repository.id,
                            language: context.repository.language,
                        },
                        kodyRulesPrLevelAnalysis.codeSuggestions,
                        context.codeReviewConfig?.languageResultPrompt,
                    )) || { commentResults: [] };

                // Transformar commentResults em ISuggestionByPR e salvar no banco
                if (commentResults && commentResults.length > 0) {
                    const prLevelSuggestions =
                        this.suggestionService.transformCommentResultsToPrLevelSuggestions(
                            commentResults,
                        );

                    if (prLevelSuggestions.length > 0) {
                        await this.pullRequestsService.addPrLevelSuggestions(
                            context.pullRequest.number,
                            context.repository.name,
                            prLevelSuggestions,
                            context.organizationAndTeamData,
                        );

                        this.logger.log({
                            message: `Saved ${prLevelSuggestions.length} PR level suggestions to database`,
                            context: ProcessFilesPrLevelReviewStage.name,
                            metadata: {
                                prNumber: context.pullRequest.number,
                                repositoryName: context.repository.name,
                                suggestionsCount: prLevelSuggestions.length,
                                organizationAndTeamData:
                                    context.organizationAndTeamData,
                            },
                        });
                    }
                }

                return this.updateContext(context, (draft) => {
                    if (!draft.validSuggestionsByPR) {
                        draft.validSuggestionsByPR = [];
                    }
                    draft.validSuggestionsByPR.push(
                        ...kodyRulesPrLevelAnalysis.codeSuggestions,
                    );

                    // Armazenar os resultados dos comentários de nível de PR
                    if (!draft.prLevelCommentResults) {
                        draft.prLevelCommentResults = [];
                    }

                    if (commentResults && commentResults?.length > 0) {
                        draft.prLevelCommentResults.push(...commentResults);
                    }
                });
            } else {
                this.logger.log({
                    message: `No PR-level violations found for PR#${context.pullRequest.number}`,
                    context: this.stageName,
                    metadata: {
                        organizationAndTeamData:
                            context.organizationAndTeamData,
                    },
                });
            }
        } catch (error) {
            this.logger.error({
                message: `Error during PR-level Kody Rules analysis for PR#${context.pullRequest.number}`,
                context: this.stageName,
                error,
                metadata: {
                    organizationAndTeamData: context.organizationAndTeamData,
                },
            });
            // Não interromper o pipeline por erro na análise de PR level
        }

        return context;
    }
}
