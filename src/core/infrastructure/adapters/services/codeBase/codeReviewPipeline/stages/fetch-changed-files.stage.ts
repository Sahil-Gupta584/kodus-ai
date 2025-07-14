import { Inject, Injectable } from '@nestjs/common';
import { BasePipelineStage } from '../../../pipeline/base-stage.abstract';
import {
    AUTOMATION_EXECUTION_SERVICE_TOKEN,
    IAutomationExecutionService,
} from '@/core/domain/automation/contracts/automation-execution.service';
import {
    IPullRequestManagerService,
    PULL_REQUEST_MANAGER_SERVICE_TOKEN,
} from '@/core/domain/codeBase/contracts/PullRequestManagerService.contract';
import { AutomationStatus } from '@/core/domain/automation/enums/automation-status';
import { CodeReviewPipelineContext } from '../context/code-review-pipeline.context';
import { PipelineStatus } from '../../../pipeline/interfaces/pipeline-context.interface';
import { PinoLoggerService } from '../../../logger/pino.service';
import {
    handlePatchDeletions,
    convertToHunksWithLinesNumbers,
} from '@/shared/utils/patch';
import { FileChange } from '@/config/types/general/codeReview.type';

@Injectable()
export class FetchChangedFilesStage extends BasePipelineStage<CodeReviewPipelineContext> {
    stageName = 'FetchChangedFilesStage';

    private maxFilesToAnalyze = 500;

    constructor(
        @Inject(AUTOMATION_EXECUTION_SERVICE_TOKEN)
        private automationExecutionService: IAutomationExecutionService,
        @Inject(PULL_REQUEST_MANAGER_SERVICE_TOKEN)
        private pullRequestHandlerService: IPullRequestManagerService,

        private logger: PinoLoggerService,
    ) {
        super();
    }

    protected async executeStage(
        context: CodeReviewPipelineContext,
    ): Promise<CodeReviewPipelineContext> {
        const lastExecution =
            await this.automationExecutionService.findLatestExecutionByFilters(
                {
                    status: AutomationStatus.SUCCESS,
                    teamAutomation: { uuid: context.teamAutomationId },
                    pullRequestNumber: context.pullRequest.number,
                    repositoryId: context?.repository?.id,
                },
            );

        const files = await this.pullRequestHandlerService.getChangedFiles(
            context.organizationAndTeamData,
            context.repository,
            context.pullRequest,
            context?.codeReviewConfig?.ignorePaths,
            lastExecution?.dataExecution?.lastAnalyzedCommit,
        );

        if (!files?.length || files.length > this.maxFilesToAnalyze) {
            this.logger.warn({
                message: `Skipping code review for PR#${context.pullRequest.number} - ${files?.length ? 'Too many files to analyze (>' + this.maxFilesToAnalyze + ')' : 'No files found after applying ignore paths'}`,
                context: FetchChangedFilesStage.name,
                metadata: {
                    organizationAndTeamData: context?.organizationAndTeamData,
                },
            });
            return this.updateContext(context, (draft) => {
                draft.status = PipelineStatus.SKIP;
            });
        }

        const filesWithLineNumbers = this.prepareFilesWithLineNumbers(files);

        const lastExecutionResult = lastExecution
            ? {
                  commentId: lastExecution?.dataExecution?.commentId,
                  noteId: lastExecution?.dataExecution?.noteId,
                  threadId: lastExecution?.dataExecution?.threadId,
                  lastAnalyzedCommit:
                      lastExecution?.dataExecution?.lastAnalyzedCommit,
              }
            : undefined;

        return this.updateContext(context, (draft) => {
            draft.changedFiles = filesWithLineNumbers;
            draft.lastExecution = lastExecutionResult;
            draft.pipelineMetadata = {
                ...draft.pipelineMetadata,
            };
        });
    }

    private prepareFilesWithLineNumbers(files: FileChange[]): FileChange[] {
        if (!files?.length || files?.length === 0) {
            return [];
        }

        return files?.map((file) => {
            try {
                if (!file?.patch) {
                    return file;
                }

                const patchFormatted = handlePatchDeletions(
                    file.patch,
                    file.filename,
                    file.status,
                );

                if (!patchFormatted) {
                    return file;
                }

                const patchWithLinesStr = convertToHunksWithLinesNumbers(
                    patchFormatted,
                    file,
                );

                return {
                    ...file,
                    patchWithLinesStr,
                };
            } catch (error) {
                this.logger.error({
                    message: `Error preparing line numbers for file "${file?.filename}"`,
                    error,
                    context: FetchChangedFilesStage.name,
                    metadata: {
                        filename: file?.filename,
                    },
                });
                return file;
            }
        });
    }
}
