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

@Injectable()
export class ProcessFilesPrLevelReviewStage extends BasePipelineStage<CodeReviewPipelineContext> {
    readonly stageName = 'PRLevelReviewStage';

    constructor(
        private readonly logger: PinoLoggerService,

        @Inject(KODY_RULES_PR_LEVEL_ANALYSIS_SERVICE_TOKEN)
        private readonly kodyRulesPrLevelAnalysisService: KodyRulesPrLevelAnalysisService,
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
            });
            return context;
        }

        // Verificar se há regras de nível de PR configuradas
        const prLevelRules = context?.codeReviewConfig?.kodyRules?.filter(
            rule => rule.scope === KodyRulesScope.PULL_REQUEST
        );

        if (!prLevelRules?.length) {
            this.logger.log({
                message: `No PR-level Kody Rules configured for PR#${context.pullRequest.number}`,
                context: this.stageName,
                metadata: {
                    totalRules: context?.codeReviewConfig?.kodyRules?.length || 0,
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

            // Armazenar o resultado no contexto para uso posterior
            if (kodyRulesPrLevelAnalysis?.codeSuggestions?.length > 0) {
                this.logger.log({
                    message: `PR-level analysis completed for PR#${context.pullRequest.number}`,
                    context: this.stageName,
                    metadata: {
                        suggestionsCount: kodyRulesPrLevelAnalysis.codeSuggestions.length,
                        organizationAndTeamData: context.organizationAndTeamData,
                    },
                });

                console.log(kodyRulesPrLevelAnalysis.codeSuggestions);

                // Adicionar as sugestões de nível de PR ao contexto
                /*if (!context.codeSuggestions) {
                    context.codeSuggestions = [];
                }
                context.codeSuggestions.push(...kodyRulesPrLevelAnalysis.codeSuggestions);*/
            } else {
                this.logger.log({
                    message: `No PR-level violations found for PR#${context.pullRequest.number}`,
                    context: this.stageName,
                    metadata: {
                        organizationAndTeamData: context.organizationAndTeamData,
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
