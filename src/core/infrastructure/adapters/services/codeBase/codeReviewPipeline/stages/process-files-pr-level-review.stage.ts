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
import { CROSS_FILE_ANALYSIS_SERVICE_TOKEN, CrossFileAnalysisService } from '../../crossFileAnalysis.service';

@Injectable()
export class ProcessFilesPrLevelReviewStage extends BasePipelineStage<CodeReviewPipelineContext> {
    readonly stageName = 'PRLevelReviewStage';

    constructor(
        private readonly logger: PinoLoggerService,

        @Inject(KODY_RULES_PR_LEVEL_ANALYSIS_SERVICE_TOKEN)
        private readonly kodyRulesPrLevelAnalysisService: KodyRulesPrLevelAnalysisService,

        @Inject(CROSS_FILE_ANALYSIS_SERVICE_TOKEN)
        private readonly crossFileAnalysisService: CrossFileAnalysisService,
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
                metadata: {
                    organizationAndTeamData: context.organizationAndTeamData,
                },
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

            const crossFileAnalysis =
                await this.crossFileAnalysisService.analyzeCrossFileCode(
                    context.organizationAndTeamData,
                    context.pullRequest.number,
                    context,
                    context.changedFiles,
                );

            // Validar resultado da análise
            if (!kodyRulesPrLevelAnalysis) {
                this.logger.warn({
                    message: `Analysis returned null for PR#${context.pullRequest.number}`,
                    context: this.stageName,
                    metadata: {
                        organizationAndTeamData:
                            context.organizationAndTeamData,
                    },
                });
                return context;
            }

            // Obter as sugestões geradas
            const codeSuggestions =
                kodyRulesPrLevelAnalysis?.codeSuggestions || [];

            const crossFileAnalysisSuggestions =
                crossFileAnalysis?.codeSuggestions || [];

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

                // Adicionar as sugestões ao contexto para o próximo stage processar
                this.updateContext(context, (draft) => {
                    if (!draft.validSuggestionsByPR) {
                        draft.validSuggestionsByPR = [];
                    }

                    // Usar spread seguro para adicionar as sugestões
                    if (codeSuggestions && Array.isArray(codeSuggestions)) {
                        draft.validSuggestionsByPR.push(...codeSuggestions);
                    }
                });
            }

            if (crossFileAnalysisSuggestions.length > 0) {
                this.logger.log({
                    message: `Cross-file analysis completed for PR#${context.pullRequest.number}`,
                    context: this.stageName,
                    metadata: {
                        suggestionsCount: crossFileAnalysisSuggestions.length,
                        organizationAndTeamData:
                            context.organizationAndTeamData,
                        prNumber: context.pullRequest.number,
                    },
                });

                this.updateContext(context, (draft) => {
                    if (!draft.validCrossFileSuggestions) {
                        draft.validCrossFileSuggestions = [];
                    }

                    if (
                        crossFileAnalysisSuggestions &&
                        Array.isArray(crossFileAnalysisSuggestions)
                    ) {
                        draft.validCrossFileSuggestions.push(
                            ...crossFileAnalysisSuggestions,
                        );
                    }
                });
            }

            if (
                codeSuggestions.length > 0 &&
                crossFileAnalysisSuggestions.length > 0
            ) {
                return context;
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
