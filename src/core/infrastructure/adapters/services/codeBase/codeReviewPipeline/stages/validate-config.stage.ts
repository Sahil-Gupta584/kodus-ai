import { Inject, Injectable } from '@nestjs/common';
import { BasePipelineStage } from '../../../pipeline/base-stage.abstract';
import {
    CODE_BASE_CONFIG_SERVICE_TOKEN,
    ICodeBaseConfigService,
} from '@/core/domain/codeBase/contracts/CodeBaseConfigService.contract';
import {
    AUTOMATION_EXECUTION_SERVICE_TOKEN,
    IAutomationExecutionService,
} from '@/core/domain/automation/contracts/automation-execution.service';
import {
    CodeReviewConfig,
    AutomaticReviewStatus,
    ReviewCadenceType,
} from '@/config/types/general/codeReview.type';
import { PinoLoggerService } from '../../../logger/pino.service';
import { CodeReviewPipelineContext } from '../context/code-review-pipeline.context';
import { PipelineStatus } from '../../../pipeline/interfaces/pipeline-context.interface';
import { AutomationStatus } from '@/core/domain/automation/enums/automation-status';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';

@Injectable()
export class ValidateConfigStage extends BasePipelineStage<CodeReviewPipelineContext> {
    stageName = 'ValidateConfigStage';

    constructor(
        @Inject(CODE_BASE_CONFIG_SERVICE_TOKEN)
        private codeBaseConfigService: ICodeBaseConfigService,

        @Inject(AUTOMATION_EXECUTION_SERVICE_TOKEN)
        private automationExecutionService: IAutomationExecutionService,

        private codeManagementService: CodeManagementService,
        private logger: PinoLoggerService,
    ) {
        super();
    }

    protected async executeStage(
        context: CodeReviewPipelineContext,
    ): Promise<CodeReviewPipelineContext> {
        const config: CodeReviewConfig =
            await this.codeBaseConfigService.getConfig(
                context.organizationAndTeamData,
                { name: context.repository.name, id: context.repository.id },
            );

        const cadenceResult = await this.evaluateReviewCadence(context, config);

        if (!cadenceResult.shouldProcess) {
            this.logger.warn({
                message: cadenceResult.reason,
                serviceName: ValidateConfigStage.name,
                context: this.stageName,
                metadata: {
                    prNumber: context?.pullRequest?.number,
                    repositoryName: context?.repository?.name,
                    id: context?.repository?.id,
                    organizationAndTeamData: context?.organizationAndTeamData,
                    reviewCadence: config?.reviewCadence?.type || 'automatic',
                },
            });

            // Se foi pausado por auto_pause, registrar execução SKIPPED
            if (cadenceResult.shouldSaveSkipped) {
                await this.saveSkippedExecution(
                    context,
                    config,
                    cadenceResult.automaticReviewStatus,
                );
            }

            return this.updateContext(context, (draft) => {
                draft.status = PipelineStatus.SKIP;
                draft.codeReviewConfig = config;
            });
        }

        return this.updateContext(context, (draft) => {
            draft.codeReviewConfig = config;
            draft.automaticReviewStatus = cadenceResult.automaticReviewStatus;
        });
    }

    private async evaluateReviewCadence(
        context: CodeReviewPipelineContext,
        config: CodeReviewConfig,
    ): Promise<{
        shouldProcess: boolean;
        reason: string;
        shouldSaveSkipped: boolean;
        automaticReviewStatus?: AutomaticReviewStatus;
    }> {
        // Validações básicas primeiro
        const basicValidation = this.shouldProcessPR(
            context.pullRequest.title,
            context.pullRequest.base.ref,
            config,
            context.origin || '',
        );

        if (!basicValidation) {
            return {
                shouldProcess: false,
                reason: `PR #${context.pullRequest.number} skipped due to basic config rules.`,
                shouldSaveSkipped: false,
            };
        }

        // Se reviewCadence não está configurado, assume automatic (retrocompatibilidade)
        const cadenceType =
            config?.reviewCadence?.type || ReviewCadenceType.AUTOMATIC;

        // Se é comando manual, sempre processa
        if (context.origin === 'command') {
            const currentStatus = await this.getCurrentPRStatus(context);

            let automaticReviewStatus: AutomaticReviewStatus;
            if (currentStatus === 'paused') {
                // Remover comentário de pausa se existir
                await this.removePauseComment(context);

                automaticReviewStatus = {
                    previousStatus: 'paused',
                    currentStatus: 'automatic',
                    reasonForChange: 'Review triggered by start-review command',
                };
            } else {
                automaticReviewStatus = {
                    previousStatus: currentStatus,
                    currentStatus: 'automatic',
                    reasonForChange: 'Review triggered by start-review command',
                };
            }

            return {
                shouldProcess: true,
                reason: 'Processing due to manual command',
                shouldSaveSkipped: false,
                automaticReviewStatus,
            };
        }

        // Lógica específica por tipo de cadência
        switch (cadenceType) {
            case ReviewCadenceType.AUTOMATIC:
                return await this.handleAutomaticMode(context);

            case ReviewCadenceType.MANUAL:
                return await this.handleManualMode(context);

            case ReviewCadenceType.AUTO_PAUSE:
                return await this.handleAutoPauseMode(context, config);

            default:
                // Fallback para automatic
                return await this.handleAutomaticMode(context);
        }
    }

    private async handleAutomaticMode(
        context: CodeReviewPipelineContext,
    ): Promise<{
        shouldProcess: boolean;
        reason: string;
        shouldSaveSkipped: boolean;
        automaticReviewStatus?: AutomaticReviewStatus;
    }> {
        // Modo automático: sempre processa (comportamento atual)
        return {
            shouldProcess: true,
            reason: 'Processing in automatic mode',
            shouldSaveSkipped: false,
            automaticReviewStatus: {
                previousStatus: 'automatic',
                currentStatus: 'automatic',
            },
        };
    }

    private async handleManualMode(
        context: CodeReviewPipelineContext,
    ): Promise<{
        shouldProcess: boolean;
        reason: string;
        shouldSaveSkipped: boolean;
        automaticReviewStatus?: AutomaticReviewStatus;
    }> {
        // Verificar se já existe review para este PR
        const hasExistingReview =
            await this.hasExistingSuccessfulReview(context);

        if (!hasExistingReview) {
            // Primeira review: sempre processa
            return {
                shouldProcess: true,
                reason: 'Processing first review in manual mode',
                shouldSaveSkipped: false,
                automaticReviewStatus: {
                    previousStatus: 'manual',
                    currentStatus: 'manual',
                },
            };
        }

        // Já existe review: só processa com comando manual
        return {
            shouldProcess: false,
            reason: `PR #${context.pullRequest.number} skipped - manual mode requires @kody start-review command`,
            shouldSaveSkipped: true,
            automaticReviewStatus: {
                previousStatus: 'manual',
                currentStatus: 'manual',
            },
        };
    }

    private async handleAutoPauseMode(
        context: CodeReviewPipelineContext,
        config: CodeReviewConfig,
    ): Promise<{
        shouldProcess: boolean;
        reason: string;
        shouldSaveSkipped: boolean;
        automaticReviewStatus?: AutomaticReviewStatus;
    }> {
        // Verificar se já existe review para este PR
        const hasExistingReview =
            await this.hasExistingSuccessfulReview(context);

        if (!hasExistingReview) {
            // Primeira review: sempre processa
            return {
                shouldProcess: true,
                reason: 'Processing first review in auto-pause mode',
                shouldSaveSkipped: false,
                automaticReviewStatus: {
                    previousStatus: 'automatic',
                    currentStatus: 'automatic',
                },
            };
        }

        // Verificar se está pausado
        const currentStatus = await this.getCurrentPRStatus(context);
        if (currentStatus === 'paused') {
            return {
                shouldProcess: false,
                reason: `PR #${context.pullRequest.number} is paused - use @kody start-review to resume`,
                shouldSaveSkipped: true,
                automaticReviewStatus: {
                    previousStatus: 'paused',
                    currentStatus: 'paused',
                },
            };
        }

        // Verificar se deve pausar por burst de pushes
        const shouldPause = await this.shouldPauseForBurst(context, config);

        if (shouldPause) {
            // Criar comentário de pausa
            const pauseCommentId = await this.createPauseComment(context);

            return {
                shouldProcess: false,
                reason: `PR #${context.pullRequest.number} paused due to multiple pushes in short time window`,
                shouldSaveSkipped: true,
                automaticReviewStatus: {
                    previousStatus: 'automatic',
                    currentStatus: 'paused',
                    reasonForChange:
                        'Multiple pushes detected in short time window',
                    pauseCommentId: pauseCommentId || undefined,
                },
            };
        }

        // Continua processando normalmente
        return {
            shouldProcess: true,
            reason: 'Processing in auto-pause mode',
            shouldSaveSkipped: false,
            automaticReviewStatus: {
                previousStatus: 'automatic',
                currentStatus: 'automatic',
            },
        };
    }

    private async hasExistingSuccessfulReview(
        context: CodeReviewPipelineContext,
    ): Promise<boolean> {
        const executions =
            await this.automationExecutionService.findLatestExecutionByFilters({
                status: AutomationStatus.SUCCESS,
                teamAutomation: { uuid: context.teamAutomationId },
                pullRequestNumber: context.pullRequest.number,
                repositoryId: context?.repository?.id,
            });

        return !!executions;
    }

    private async getCurrentPRStatus(
        context: CodeReviewPipelineContext,
    ): Promise<'automatic' | 'paused' | 'manual'> {
        // Buscar a execução mais recente para determinar o status atual
        const latestExecution =
            await this.automationExecutionService.findLatestExecutionByFilters({
                teamAutomation: { uuid: context.teamAutomationId },
                pullRequestNumber: context.pullRequest.number,
                repositoryId: context?.repository?.id,
            });

        if (!latestExecution?.dataExecution?.automaticReviewStatus) {
            return 'automatic'; // Default
        }

        return (
            latestExecution.dataExecution.automaticReviewStatus.currentStatus ||
            'automatic'
        );
    }

    private async shouldPauseForBurst(
        context: CodeReviewPipelineContext,
        config: CodeReviewConfig,
    ): Promise<boolean> {
        const pushesToTrigger = config.reviewCadence?.pushesToTrigger || 3;
        const timeWindowMinutes = config.reviewCadence?.timeWindow || 15;

        // Buscar execuções SUCCESS recentes
        const timeWindowStart = new Date();
        timeWindowStart.setMinutes(
            timeWindowStart.getMinutes() - timeWindowMinutes,
        );

        // Para isso funcionar, precisaria modificar o método findLatestExecutionByFilters
        // para aceitar filtro de data. Por agora, vou simular a lógica
        const recentExecutions = await this.getRecentSuccessfulExecutions(
            context,
            timeWindowStart,
        );

        return recentExecutions.length >= pushesToTrigger;
    }

    private async getRecentSuccessfulExecutions(
        context: CodeReviewPipelineContext,
        since: Date,
    ): Promise<any[]> {
        try {
            const now = new Date();
            const executions =
                await this.automationExecutionService.findByPeriodAndTeamAutomationId(
                    since,
                    now,
                    context.teamAutomationId,
                );

            if (!executions) {
                return [];
            }

            // Filtrar apenas execuções SUCCESS para o mesmo PR e repositório
            return executions?.filter(
                (execution) =>
                    execution.status === AutomationStatus.SUCCESS &&
                    execution.pullRequestNumber ===
                        context.pullRequest.number &&
                    execution.repositoryId === context?.repository?.id,
            );
        } catch (error) {
            this.logger.error({
                message: `Failed to get recent executions for PR #${context.pullRequest.number}`,
                context: ValidateConfigStage.name,
                error,
            });
            return [];
        }
    }

    private async createPauseComment(
        context: CodeReviewPipelineContext,
    ): Promise<string | null> {
        try {
            const commentBody =
                "Auto-paused – comment @kody start-review when you're ready.";

            const comment =
                await this.codeManagementService.createSingleIssueComment({
                    organizationAndTeamData: context.organizationAndTeamData,
                    repository: context.repository,
                    prNumber: context.pullRequest.number,
                    body: commentBody,
                });

            this.logger.log({
                message: `Created pause comment for PR #${context.pullRequest.number}`,
                context: ValidateConfigStage.name,
                metadata: {
                    prNumber: context.pullRequest.number,
                    repositoryName: context.repository.name,
                    commentId: comment?.id,
                },
            });

            return comment?.id || null;
        } catch (error) {
            this.logger.error({
                message: `Failed to create pause comment for PR #${context.pullRequest.number}`,
                context: ValidateConfigStage.name,
                error,
            });
            return null;
        }
    }

    private async removePauseComment(
        context: CodeReviewPipelineContext,
    ): Promise<void> {
        // TODO: Implementar edição/remoção do comentário de pausa
        // Precisaria do commentId salvo na execução anterior
        this.logger.log({
            message: `Resuming from pause for PR #${context.pullRequest.number}`,
            context: ValidateConfigStage.name,
            metadata: {
                prNumber: context.pullRequest.number,
                repositoryName: context.repository.name,
            },
        });
    }

    private async saveSkippedExecution(
        context: CodeReviewPipelineContext,
        config: CodeReviewConfig,
        automaticReviewStatus?: AutomaticReviewStatus,
    ): Promise<void> {
        try {
            await this.automationExecutionService.register({
                status: AutomationStatus.SKIPPED,
                dataExecution: {
                    automaticReviewStatus,
                    platformType: context.platformType || '',
                    pullRequestNumber: context.pullRequest.number,
                    repositoryId: context?.repository?.id,
                },
                teamAutomation: { uuid: context.teamAutomationId },
                origin: 'System',
                pullRequestNumber: context.pullRequest.number,
                repositoryId: context?.repository?.id,
            });
        } catch (error) {
            this.logger.error({
                message: `Failed to save skipped execution for PR #${context.pullRequest.number}`,
                context: ValidateConfigStage.name,
                error,
            });
        }
    }

    private shouldProcessPR(
        title: string,
        baseBranch: string,
        config: CodeReviewConfig,
        origin: string,
    ): boolean {
        if (origin === 'command') {
            return true;
        }

        if (!config?.automatedReviewActive) {
            return false;
        }

        if (
            config?.ignoredTitleKeywords?.some((keyword) =>
                title?.toLowerCase().includes(keyword.toLowerCase()),
            )
        ) {
            return false;
        }

        if (!config.baseBranches?.includes(baseBranch)) {
            return false;
        }

        return true;
    }
}
