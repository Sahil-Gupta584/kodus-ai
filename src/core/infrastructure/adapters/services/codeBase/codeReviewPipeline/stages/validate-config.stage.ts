import { Inject, Injectable } from '@nestjs/common';
import { BasePipelineStage } from '../../../pipeline/base-stage.abstract';
import {
    AUTOMATION_EXECUTION_SERVICE_TOKEN,
    IAutomationExecutionService,
} from '@/core/domain/automation/contracts/automation-execution.service';
import {
    AutomaticReviewStatus,
    ReviewCadenceType,
    ReviewCadenceState,
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
        try {
            if (!context.codeReviewConfig) {
                this.logger.error({
                    message: 'No config found in context',
                    context: this.stageName,
                    metadata: {
                        prNumber: context?.pullRequest?.number,
                        repositoryName: context?.repository?.name,
                    },
                });

                return this.updateContext(context, (draft) => {
                    draft.status = PipelineStatus.SKIP;
                });
            }

            const cadenceResult = await this.evaluateReviewCadence(context);

            if (!cadenceResult.shouldProcess) {
                this.logger.warn({
                    message: cadenceResult.reason,
                    serviceName: ValidateConfigStage.name,
                    context: this.stageName,
                    metadata: {
                        prNumber: context?.pullRequest?.number,
                        repositoryName: context?.repository?.name,
                        id: context?.repository?.id,
                        organizationAndTeamData:
                            context?.organizationAndTeamData,
                        reviewCadence:
                            context.codeReviewConfig?.reviewCadence?.type ||
                            ReviewCadenceType.AUTOMATIC,
                    },
                });

                if (cadenceResult.shouldSaveSkipped) {
                    await this.saveSkippedExecution(
                        context,
                        cadenceResult.automaticReviewStatus,
                    );
                }

                return this.updateContext(context, (draft) => {
                    draft.status = PipelineStatus.SKIP;
                });
            }

            return this.updateContext(context, (draft) => {
                draft.automaticReviewStatus =
                    cadenceResult.automaticReviewStatus;
            });
        } catch (error) {
            this.logger.error({
                message: `Error in ValidateConfigStage for PR#${context?.pullRequest?.number}`,
                error,
                context: this.stageName,
                metadata: {
                    organizationAndTeamData: context?.organizationAndTeamData,
                    prNumber: context?.pullRequest?.number,
                    repositoryId: context?.repository?.id,
                },
            });

            return this.updateContext(context, (draft) => {
                draft.status = PipelineStatus.SKIP;
            });
        }
    }

    private async evaluateReviewCadence(
        context: CodeReviewPipelineContext,
    ): Promise<{
        shouldProcess: boolean;
        reason: string;
        shouldSaveSkipped: boolean;
        automaticReviewStatus?: AutomaticReviewStatus;
    }> {
        const config = context.codeReviewConfig!;

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

        const cadenceType =
            config?.reviewCadence?.type || ReviewCadenceType.AUTOMATIC;

        // Se é comando manual, sempre processa
        if (context.origin === 'command') {
            const currentStatus = await this.getCurrentPRStatus(context);

            let automaticReviewStatus: AutomaticReviewStatus;
            if (currentStatus === ReviewCadenceState.PAUSED) {
                automaticReviewStatus = {
                    previousStatus: ReviewCadenceState.PAUSED,
                    currentStatus: ReviewCadenceState.COMMAND,
                    reasonForChange: 'Review triggered by start-review command',
                };
            } else {
                automaticReviewStatus = {
                    previousStatus: currentStatus,
                    currentStatus: ReviewCadenceState.COMMAND,
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
        return {
            shouldProcess: true,
            reason: 'Processing in automatic mode',
            shouldSaveSkipped: false,
            automaticReviewStatus: {
                previousStatus: ReviewCadenceState.AUTOMATIC,
                currentStatus: ReviewCadenceState.AUTOMATIC,
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
        const hasExistingReview =
            await this.hasExistingSuccessfulReview(context);

        if (!hasExistingReview) {
            return {
                shouldProcess: true,
                reason: 'Processing first review in manual mode',
                shouldSaveSkipped: false,
                automaticReviewStatus: {
                    previousStatus: ReviewCadenceState.AUTOMATIC,
                    currentStatus: ReviewCadenceState.AUTOMATIC,
                },
            };
        }

        const currentStatus = await this.getCurrentPRStatus(context);

        return {
            shouldProcess: false,
            reason: `PR #${context.pullRequest.number} skipped - manual mode requires @kody start-review command`,
            shouldSaveSkipped: true,
            automaticReviewStatus: {
                previousStatus: currentStatus,
                currentStatus: ReviewCadenceState.PAUSED,
            },
        };
    }

    private async handleAutoPauseMode(
        context: CodeReviewPipelineContext,
        config: any,
    ): Promise<{
        shouldProcess: boolean;
        reason: string;
        shouldSaveSkipped: boolean;
        automaticReviewStatus?: AutomaticReviewStatus;
    }> {
        const hasExistingReview =
            await this.hasExistingSuccessfulReview(context);

        if (!hasExistingReview) {
            return {
                shouldProcess: true,
                reason: 'Processing first review in auto-pause mode',
                shouldSaveSkipped: false,
                automaticReviewStatus: {
                    previousStatus: ReviewCadenceState.AUTOMATIC,
                    currentStatus: ReviewCadenceState.AUTOMATIC,
                },
            };
        }

        const currentStatus = await this.getCurrentPRStatus(context);
        if (currentStatus === ReviewCadenceState.PAUSED) {
            return {
                shouldProcess: false,
                reason: `PR #${context.pullRequest.number} is paused - use @kody start-review to resume`,
                shouldSaveSkipped: true,
                automaticReviewStatus: {
                    previousStatus: ReviewCadenceState.PAUSED,
                    currentStatus: ReviewCadenceState.PAUSED,
                },
            };
        }

        const shouldPause = await this.shouldPauseForBurst(context, config);

        if (shouldPause) {
            const pauseCommentId = await this.createPauseComment(context);

            return {
                shouldProcess: false,
                reason: `PR #${context.pullRequest.number} paused due to multiple pushes in short time window`,
                shouldSaveSkipped: true,
                automaticReviewStatus: {
                    previousStatus: ReviewCadenceState.AUTOMATIC,
                    currentStatus: ReviewCadenceState.PAUSED,
                    reasonForChange:
                        'Multiple pushes detected in short time window',
                    pauseCommentId: pauseCommentId || undefined,
                },
            };
        }

        return {
            shouldProcess: true,
            reason: 'Processing in auto-pause mode',
            shouldSaveSkipped: false,
            automaticReviewStatus: {
                previousStatus: ReviewCadenceState.AUTOMATIC,
                currentStatus: ReviewCadenceState.AUTOMATIC,
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
    ): Promise<ReviewCadenceState> {
        const latestExecution =
            await this.automationExecutionService.findLatestExecutionByFilters({
                teamAutomation: { uuid: context.teamAutomationId },
                pullRequestNumber: context.pullRequest.number,
                repositoryId: context?.repository?.id,
            });

        if (!latestExecution?.dataExecution?.automaticReviewStatus) {
            return ReviewCadenceState.AUTOMATIC;
        }

        return (
            latestExecution.dataExecution.automaticReviewStatus.currentStatus ||
            ReviewCadenceState.AUTOMATIC
        );
    }

    private async shouldPauseForBurst(
        context: CodeReviewPipelineContext,
        config: any,
    ): Promise<boolean> {
        const pushesToTrigger = config.reviewCadence?.pushesToTrigger || 3;
        const timeWindowMinutes = config.reviewCadence?.timeWindow || 15;

        const timeWindowStart = new Date();
        timeWindowStart.setMinutes(
            timeWindowStart.getMinutes() - timeWindowMinutes,
        );

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

            if (
                !executions ||
                !context?.repository?.id ||
                !context?.pullRequest?.number
            ) {
                return [];
            }

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

    private async saveSkippedExecution(
        context: CodeReviewPipelineContext,
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
        config: any,
        origin: string,
    ): boolean {
        if (origin === 'command') {
            return true;
        }

        if (!config?.automatedReviewActive) {
            return false;
        }

        if (
            config?.ignoredTitleKeywords?.some((keyword: string) =>
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
