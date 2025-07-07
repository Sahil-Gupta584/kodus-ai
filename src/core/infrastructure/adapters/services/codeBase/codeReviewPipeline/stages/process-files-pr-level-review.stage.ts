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
        // Validações fundamentais de segurança
        if (!context?.organizationAndTeamData) {
            this.logger.error({
                message: 'Missing organizationAndTeamData in context',
                context: this.stageName,
            });
            return context;
        }

        if (!context?.pullRequest?.number) {
            this.logger.error({
                message: 'Missing pullRequest data in context',
                context: this.stageName,
                metadata: { organizationAndTeamData: context.organizationAndTeamData },
            });
            return context;
        }

        if (!context?.repository?.name || !context?.repository?.id) {
            this.logger.error({
                message: 'Missing repository data in context',
                context: this.stageName,
                metadata: {
                    organizationAndTeamData: context.organizationAndTeamData,
                    prNumber: context.pullRequest.number,
                },
            });
            return context;
        }

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
                    totalFilesChanged: context.changedFiles?.length || 0,
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

            // Validar resultado da análise
            if (!kodyRulesPrLevelAnalysis) {
                this.logger.warn({
                    message: `Analysis returned null for PR#${context.pullRequest.number}`,
                    context: this.stageName,
                    metadata: {
                        organizationAndTeamData: context.organizationAndTeamData,
                    },
                });
                return context;
            }

            // Criar comentários e armazenar o resultado no contexto
            const codeSuggestions = kodyRulesPrLevelAnalysis?.codeSuggestions || [];

            if (codeSuggestions.length > 0) {
                this.logger.log({
                    message: `PR-level analysis completed for PR#${context.pullRequest.number}`,
                    context: this.stageName,
                    metadata: {
                        suggestionsCount: codeSuggestions.length,
                        organizationAndTeamData:
                            context.organizationAndTeamData,
                        prNumber: context.pullRequest.number,
                    },
                });

                let commentResults: any[] = [];

                try {
                    // Criar comentários para cada sugestão de nível de PR usando o commentManagerService
                    const result = await this.commentManagerService.createPrLevelReviewComments(
                        context.organizationAndTeamData,
                        context.pullRequest.number,
                        {
                            name: context.repository.name,
                            id: context.repository.id,
                            language: context.repository.language || '',
                        },
                        codeSuggestions,
                        context.codeReviewConfig?.languageResultPrompt,
                    );

                    commentResults = result?.commentResults || [];
                } catch (error) {
                    this.logger.error({
                        message: `Error creating PR level comments for PR#${context.pullRequest.number}`,
                        context: this.stageName,
                        error,
                        metadata: {
                            prNumber: context.pullRequest.number,
                            organizationAndTeamData: context.organizationAndTeamData,
                            suggestionsCount: codeSuggestions.length,
                        },
                    });
                    // Continua sem comentários
                    commentResults = [];
                }

                // Transformar commentResults em ISuggestionByPR e salvar no banco
                if (commentResults && commentResults.length > 0) {
                    try {
                        const prLevelSuggestions =
                            this.suggestionService.transformCommentResultsToPrLevelSuggestions(
                                commentResults,
                            );

                        if (prLevelSuggestions?.length > 0) {
                            try {
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
                            } catch (error) {
                                this.logger.error({
                                    message: `Error saving PR level suggestions to database`,
                                    context: this.stageName,
                                    error,
                                    metadata: {
                                        prNumber: context.pullRequest.number,
                                        repositoryName: context.repository.name,
                                        organizationAndTeamData:
                                            context.organizationAndTeamData,
                                    },
                                });
                                // Continua sem salvar no banco
                            }
                        }
                    } catch (error) {
                        this.logger.error({
                            message: `Error transforming comment results to PR level suggestions`,
                            context: this.stageName,
                            error,
                            metadata: {
                                prNumber: context.pullRequest.number,
                                organizationAndTeamData: context.organizationAndTeamData,
                                commentResultsCount: commentResults.length,
                            },
                        });
                        // Continua sem transformar
                    }
                }

                return this.updateContext(context, (draft) => {
                    if (!draft.validSuggestionsByPR) {
                        draft.validSuggestionsByPR = [];
                    }

                    // Usar spread seguro
                    if (codeSuggestions && Array.isArray(codeSuggestions)) {
                        draft.validSuggestionsByPR.push(...codeSuggestions);
                    }

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
        }

        return context;
    }
}
