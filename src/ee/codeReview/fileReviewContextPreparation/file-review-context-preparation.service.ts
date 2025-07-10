/**
 * @license
 * © Kodus Tech. All rights reserved.
 */

import { Inject, Injectable } from '@nestjs/common';
import {
    AnalysisContext,
    FileChange,
    ReviewModeConfig,
    ReviewModeResponse,
} from '@/config/types/general/codeReview.type';
import {
    AST_ANALYSIS_SERVICE_TOKEN,
    IASTAnalysisService,
} from '@/core/domain/codeBase/contracts/ASTAnalysisService.contract';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { BaseFileReviewContextPreparation } from '@/core/infrastructure/adapters/services/fileReviewContextPreparation/base-file-review-context-preparation.service';
import { ReviewModeOptions } from '@/shared/interfaces/file-review-context-preparation.interface';
import { LLMModelProvider } from '@/core/infrastructure/adapters/services/llmProviders/llmModelProvider.helper';
import { IAIAnalysisService } from '@/core/domain/codeBase/contracts/AIAnalysisService.contract';
import { LLM_ANALYSIS_SERVICE_TOKEN } from '@/core/infrastructure/adapters/services/codeBase/llmAnalysis.service';
import { TaskStatus } from '@kodus/kodus-proto/task';

/**
 * Enterprise (cloud) implementation of the file review context preparation service
 * Extends the base class and overrides methods to add advanced functionalities
 * Available only in the cloud version or with an enterprise license
 */
@Injectable()
export class FileReviewContextPreparation extends BaseFileReviewContextPreparation {
    constructor(
        @Inject(AST_ANALYSIS_SERVICE_TOKEN)
        private readonly astService: IASTAnalysisService,

        @Inject(LLM_ANALYSIS_SERVICE_TOKEN)
        private readonly aiAnalysisService: IAIAnalysisService,

        protected readonly logger: PinoLoggerService,
    ) {
        super(logger);
    }

    /**
     * Overrides the method for determining the review mode to use advanced logic
     * @param file File to be analyzed
     * @param patch File patch
     * @param context Analysis context
     * @returns Determined review mode
     * @override
     */
    protected async determineReviewMode(
        options?: ReviewModeOptions,
    ): Promise<ReviewModeResponse> {
        try {
            const { context } = options;

            let reviewMode = ReviewModeResponse.HEAVY_MODE;

            const shouldCheckMode =
                context?.codeReviewConfig?.reviewModeConfig ===
                    ReviewModeConfig.LIGHT_MODE_FULL ||
                context?.codeReviewConfig?.reviewModeConfig ===
                    ReviewModeConfig.LIGHT_MODE_PARTIAL;

            if (shouldCheckMode) {
                reviewMode = await this.getReviewMode(options);
            }

            return reviewMode;
        } catch (error) {
            this.logger.warn({
                message:
                    'Error determining advanced review mode, falling back to basic mode',
                error,
                context: FileReviewContextPreparation.name,
            });

            // In case of an error, we call the parent class method (basic implementation)
            // However, since BaseFileReviewContextPreparation is now abstract, we need to implement a fallback here
            return ReviewModeResponse.HEAVY_MODE;
        }
    }

    /**
     * Overrides the method for preparing the internal context to add AST analysis
     * @param file File to be analyzed
     * @param patchWithLinesStr Patch with line numbers
     * @param reviewMode Determined review mode
     * @param context Analysis context
     * @returns Prepared file context with AST analysis
     * @override
     */
    protected async prepareFileContextInternal(
        file: FileChange,
        patchWithLinesStr: string,
        context: AnalysisContext,
    ): Promise<{ fileContext: AnalysisContext } | null> {
        const baseContext = await super.prepareFileContextInternal(
            file,
            patchWithLinesStr,
            context,
        );

        if (!baseContext) {
            return null;
        }

        let fileContext: AnalysisContext = baseContext.fileContext;

        // Check if we should execute the AST analysis
        const shouldRunAST =
            fileContext.reviewModeResponse === ReviewModeResponse.HEAVY_MODE &&
            fileContext.tasks.astAnalysis.taskId &&
            fileContext.codeReviewConfig.reviewOptions?.breaking_changes;

        if (shouldRunAST) {
            try {
                const { task: astTask } = await this.astService.awaitTask(
                    fileContext.tasks.astAnalysis.taskId,
                );

                if (
                    !astTask ||
                    astTask.status !== TaskStatus.TASK_STATUS_COMPLETED
                ) {
                    this.logger.warn({
                        message:
                            'AST analysis task did not complete successfully',
                        context: FileReviewContextPreparation.name,
                        metadata: {
                            ...fileContext?.organizationAndTeamData,
                            filename: file.filename,
                        },
                    });
                    return { fileContext };
                }

                const { taskId } =
                    await this.astService.initializeImpactAnalysis(
                        fileContext.repository,
                        fileContext.pullRequest,
                        fileContext.platformType,
                        fileContext.organizationAndTeamData,
                        patchWithLinesStr,
                        file.filename,
                    );

                const { task: impactTask } =
                    await this.astService.awaitTask(taskId);

                if (
                    !impactTask ||
                    impactTask.status !== TaskStatus.TASK_STATUS_COMPLETED
                ) {
                    this.logger.warn({
                        message:
                            'Impact analysis task did not complete successfully',
                        context: FileReviewContextPreparation.name,
                        metadata: {
                            ...fileContext?.organizationAndTeamData,
                            filename: file.filename,
                        },
                    });
                    return { fileContext };
                }

                const impactAnalysis = await this.astService.getImpactAnalysis(
                    fileContext.repository,
                    fileContext.pullRequest,
                    fileContext.platformType,
                    fileContext.organizationAndTeamData,
                );

                // Creates a new context by combining the fileContext with the AST analysis
                fileContext = {
                    ...fileContext,
                    impactASTAnalysis: impactAnalysis,
                };
            } catch (error) {
                this.logger.error({
                    message: 'Error executing advanced AST analysis',
                    error,
                    context: FileReviewContextPreparation.name,
                    metadata: {
                        ...context?.organizationAndTeamData,
                        filename: file.filename,
                    },
                });
            }
        }

        return { fileContext };
    }

    private async getReviewMode(
        options: ReviewModeOptions,
    ): Promise<ReviewModeResponse> {
        const response = await this.aiAnalysisService.selectReviewMode(
            options.context.organizationAndTeamData,
            options.context.pullRequest.number,
            LLMModelProvider.NOVITA_DEEPSEEK_V3_0324,
            options.fileChangeContext.file,
            options.patch,
        );

        return response;
    }

    protected async getRelevantFileContent(
        file: FileChange,
        context: AnalysisContext,
    ): Promise<string | null> {
        try {
            const { taskId } = context.tasks.astAnalysis;

            if (!taskId) {
                this.logger.warn({
                    message:
                        'No AST analysis task ID found, returning file content',
                    context: FileReviewContextPreparation.name,
                    metadata: {
                        ...context?.organizationAndTeamData,
                        filename: file.filename,
                    },
                });
                return file.fileContent || file.content || null;
            }

            const { task } = await this.astService.awaitTask(taskId);

            if (!task || task.status !== TaskStatus.TASK_STATUS_COMPLETED) {
                this.logger.warn({
                    message: 'AST analysis task did not complete successfully',
                    context: FileReviewContextPreparation.name,
                    metadata: {
                        ...context?.organizationAndTeamData,
                        filename: file.filename,
                    },
                });
                return file.fileContent || file.content || null;
            }

            const content = await this.astService.getRelatedContentFromDiff(
                context.repository,
                context.pullRequest,
                context.platformType,
                context.organizationAndTeamData,
                file.patch,
                file.filename,
            );

            if (content) {
                return content;
            } else {
                this.logger.warn({
                    message: 'No relevant content found for the file',
                    context: FileReviewContextPreparation.name,
                    metadata: {
                        ...context?.organizationAndTeamData,
                        filename: file.filename,
                    },
                });
                return file.fileContent || file.content || null;
            }
        } catch (error) {
            this.logger.error({
                message: 'Error retrieving relevant file content',
                error,
                context: FileReviewContextPreparation.name,
                metadata: {
                    ...context?.organizationAndTeamData,
                    filename: file.filename,
                },
            });
            return file.fileContent || file.content || null;
        }
    }
}
