import { Injectable, Inject } from '@nestjs/common';
import { BasePipelineStage } from '../../../pipeline/base-stage.abstract';
import {
    COMMENT_MANAGER_SERVICE_TOKEN,
    ICommentManagerService,
} from '@/core/domain/codeBase/contracts/CommentManagerService.contract';
import { PinoLoggerService } from '../../../logger/pino.service';
import { CodeReviewPipelineContext } from '../context/code-review-pipeline.context';
import { IPullRequestMessages } from '@/core/domain/pullRequestMessages/interfaces/pullRequestMessages.interface';
import {
    IPullRequestMessagesService,
    PULL_REQUEST_MESSAGES_SERVICE_TOKEN,
} from '@/core/domain/pullRequestMessages/contracts/pullRequestMessages.service.contract';
import {
    ConfigLevel,
    PullRequestMessageStatus,
    PullRequestMessageType,
} from '@/config/types/general/pullRequestMessages.type';

@Injectable()
export class UpdateCommentsAndGenerateSummaryStage extends BasePipelineStage<CodeReviewPipelineContext> {
    readonly stageName = 'UpdateCommentsAndGenerateSummaryStage';

    constructor(
        @Inject(COMMENT_MANAGER_SERVICE_TOKEN)
        private readonly commentManagerService: ICommentManagerService,

        @Inject(PULL_REQUEST_MESSAGES_SERVICE_TOKEN)
        private readonly pullRequestMessagesService: IPullRequestMessagesService,

        private readonly logger: PinoLoggerService,
    ) {
        super();
    }

    protected async executeStage(
        context: CodeReviewPipelineContext,
    ): Promise<CodeReviewPipelineContext> {
        const {
            lastExecution,
            codeReviewConfig,
            overallComments,
            repository,
            pullRequest,
            organizationAndTeamData,
            platformType,
            initialCommentData,
            lineComments,
        } = context;

        if (!initialCommentData && !context.pullRequestMessagesConfig?.startReviewMessage) {
            this.logger.warn({
                message: `Missing initialCommentData for PR#${pullRequest.number}`,
                context: this.stageName,
            });
            return context;
        }

        if (!lastExecution && codeReviewConfig.summary.generatePRSummary) {
            this.logger.log({
                message: `Generating summary for PR#${pullRequest.number}`,
                context: this.stageName,
            });

            const summaryPR =
                await this.commentManagerService.generateSummaryPR(
                    pullRequest,
                    repository,
                    overallComments,
                    organizationAndTeamData,
                    codeReviewConfig.languageResultPrompt,
                    codeReviewConfig.summary,
                );

            await this.commentManagerService.updateSummarizationInPR(
                organizationAndTeamData,
                pullRequest.number,
                repository,
                summaryPR,
            );
        }

        const endReviewMessage = context.pullRequestMessagesConfig?.endReviewMessage;

        if (!context.pullRequestMessagesConfig?.startReviewMessage && !endReviewMessage) {
            await this.commentManagerService.updateOverallComment(
                organizationAndTeamData,
                pullRequest.number,
                repository,
                initialCommentData.commentId,
                initialCommentData.noteId,
                platformType,
                lineComments,
                codeReviewConfig,
                initialCommentData.threadId,
            );
        } else {
            if (
                endReviewMessage &&
                endReviewMessage.status === PullRequestMessageStatus.INACTIVE
            ) {
                this.logger.log({
                    message: `Skipping comment for PR#${context.pullRequest.number} with finish review message because it is inactive`,
                    context: UpdateCommentsAndGenerateSummaryStage.name,
                    metadata: {
                        organizationAndTeamData,
                        prNumber: context.pullRequest.number,
                        repository: context.repository,
                    },
                });
                return context;
            }

            await this.commentManagerService.createComment(
                organizationAndTeamData,
                pullRequest.number,
                repository,
                platformType,
                context.changedFiles,
                context.codeReviewConfig?.languageResultPrompt ?? 'en-US',
                lineComments,
                codeReviewConfig,
                endReviewMessage,
            );
        }

        return context;
    }
}
