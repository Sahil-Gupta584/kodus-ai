import { Inject, Injectable } from '@nestjs/common';
import { BasePipelineStage } from '../../../pipeline/base-stage.abstract';
import { CodeReviewPipelineContext } from '../context/code-review-pipeline.context';
import {
    AUTOMATION_EXECUTION_SERVICE_TOKEN,
    IAutomationExecutionService,
} from '@/core/domain/automation/contracts/automation-execution.service';
import {
    PULL_REQUEST_MANAGER_SERVICE_TOKEN,
    IPullRequestManagerService,
} from '@/core/domain/codeBase/contracts/PullRequestManagerService.contract';
import { PinoLoggerService } from '../../../logger/pino.service';
import { AutomationStatus } from '@/core/domain/automation/enums/automation-status';
import { PipelineStatus } from '../../../pipeline/interfaces/pipeline-context.interface';

@Injectable()
export class ValidateNewCommitsStage extends BasePipelineStage<CodeReviewPipelineContext> {
    readonly stageName = 'ValidateNewCommitsStage';

    constructor(
        @Inject(AUTOMATION_EXECUTION_SERVICE_TOKEN)
        private readonly automationExecutionService: IAutomationExecutionService,
        @Inject(PULL_REQUEST_MANAGER_SERVICE_TOKEN)
        private readonly pullRequestHandlerService: IPullRequestManagerService,

        private readonly logger: PinoLoggerService,
    ) {
        super();
    }

    protected override async executeStage(
        context: CodeReviewPipelineContext,
    ): Promise<CodeReviewPipelineContext> {
        const lastExecution =
            await this.automationExecutionService.findLatestExecutionByFilters({
                status: AutomationStatus.SUCCESS,
                teamAutomation: { uuid: context.teamAutomationId },
                pullRequestNumber: context.pullRequest.number,
                repositoryId: context?.repository?.id,
            });

        if (!lastExecution?.dataExecution?.lastAnalyzedCommit) {
            this.logger.log({
                message:
                    'No last analyzed commit found, skipping commit validation',
                context: this.stageName,
                metadata: {
                    organizationAndTeamData: context.organizationAndTeamData,
                    repository: context.repository.name,
                    pullRequestNumber: context.pullRequest.number,
                },
            });

            return context;
        }

        const lastExecutionResult = {
            commentId: lastExecution?.dataExecution?.commentId,
            noteId: lastExecution?.dataExecution?.noteId,
            threadId: lastExecution?.dataExecution?.threadId,
            lastAnalyzedCommit:
                lastExecution?.dataExecution?.lastAnalyzedCommit,
        };

        const updatedContext = this.updateContext(context, (draft) => {
            draft.lastExecution = lastExecutionResult;
        });

        const commits =
            await this.pullRequestHandlerService.getNewCommitsSinceLastExecution(
                updatedContext.organizationAndTeamData,
                updatedContext.repository,
                updatedContext.pullRequest,
                lastExecutionResult.lastAnalyzedCommit,
            );

        if (!commits || commits?.length === 0) {
            this.logger.warn({
                message: 'No new commits found since last execution',
                context: this.stageName,
                metadata: {
                    organizationAndTeamData:
                        updatedContext.organizationAndTeamData,
                    repository: updatedContext.repository.name,
                    pullRequestNumber: updatedContext.pullRequest.number,
                },
            });

            return this.updateContext(updatedContext, (draft) => {
                draft.status = PipelineStatus.SKIP;
            });
        }

        this.logger.log({
            message: `Fetched ${commits.length} new commits for PR#${updatedContext.pullRequest.number}`,
            context: this.stageName,
            metadata: {
                organizationAndTeamData: updatedContext.organizationAndTeamData,
                repository: updatedContext.repository.name,
                pullRequestNumber: updatedContext.pullRequest.number,
            },
        });

        let isOnlyMerge = false;

        const mergeCommits = commits.filter(
            (commit) => commit.parents?.length > 1,
        );

        if (mergeCommits.length > 0) {
            const allNewCommitShas = new Set(commits.map((c) => c.sha));
            const commitMap = new Map(commits.map((c) => [c.sha, c]));

            const mergedCommitTracker = new Set();

            const stack: string[] = [];

            for (const commit of mergeCommits) {
                mergedCommitTracker.add(commit.sha);

                for (let i = 1; i < (commit.parents?.length || 0); i++) {
                    const parentSha = commit.parents[i]?.sha;

                    if (parentSha) {
                        stack.push(parentSha);
                    }
                }
            }

            while (stack.length > 0) {
                const sha = stack.pop();

                if (
                    !sha ||
                    !allNewCommitShas.has(sha) ||
                    mergedCommitTracker.has(sha)
                ) {
                    continue;
                }

                mergedCommitTracker.add(sha);

                const commit = commitMap.get(sha);
                if (!commit || !commit.parents || commit.parents.length === 0) {
                    continue;
                }

                commit.parents.forEach((parent) => {
                    if (parent.sha) {
                        stack.push(parent.sha);
                    }
                });
            }

            if (mergedCommitTracker.size === allNewCommitShas.size) {
                isOnlyMerge = true;
            }
        }

        if (isOnlyMerge) {
            this.logger.warn({
                message: `Skipping code review for PR#${updatedContext.pullRequest.number} - Only merge commits found`,
                context: this.stageName,
                metadata: {
                    organizationAndTeamData:
                        updatedContext.organizationAndTeamData,
                    repository: updatedContext.repository.name,
                    pullRequestNumber: updatedContext.pullRequest.number,
                },
            });

            return this.updateContext(updatedContext, (draft) => {
                draft.status = PipelineStatus.SKIP;
            });
        }

        this.logger.log({
            message: `Processing ${commits.length} commits for PR#${updatedContext.pullRequest.number}`,
            context: this.stageName,
            metadata: {
                organizationAndTeamData: updatedContext.organizationAndTeamData,
                repository: updatedContext.repository.name,
                pullRequestNumber: updatedContext.pullRequest.number,
            },
        });

        return updatedContext;
    }
}
