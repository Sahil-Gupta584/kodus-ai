/**
 * @license
 * Kodus Tech. All rights reserved.
 */
import { Injectable, Inject } from '@nestjs/common';
import { PipelineFactory } from '../pipeline/pipeline-factory.service';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { PinoLoggerService } from '../logger/pino.service';
import { CodeReviewPipelineContext } from './codeReviewPipeline/context/code-review-pipeline.context';
import { PlatformType } from '@/shared/domain/enums/platform-type.enum';
import { TaskStatus } from '@kodus/kodus-proto/task';
import { AutomationStatus } from '@/core/domain/automation/enums/automation-status';
import { ConfigService } from '@nestjs/config';
import { DatabaseConnection } from '@/config/types';
import { ObservabilityService } from '../logger/observability.service';
import { CodeManagementService } from '../platformIntegration/codeManagement.service';
import {
    GitHubReaction,
    GitlabReaction,
    ReviewStatusReaction,
} from '@/core/domain/codeReviewFeedback/enums/codeReviewCommentReaction.enum';

@Injectable()
export class CodeReviewHandlerService {
    private readonly config: DatabaseConnection;

    private readonly reactionMap = {
        [PlatformType.GITHUB]: {
            [ReviewStatusReaction.START]: GitHubReaction.ROCKET,
            [ReviewStatusReaction.SUCCESS]: GitHubReaction.HOORAY,
            [ReviewStatusReaction.ERROR]: GitHubReaction.CONFUSED,
            [ReviewStatusReaction.SKIP]: GitHubReaction.EYES,
        },
        [PlatformType.GITLAB]: {
            [ReviewStatusReaction.START]: GitlabReaction.ROCKET,
            [ReviewStatusReaction.SUCCESS]: GitlabReaction.TADA,
            [ReviewStatusReaction.ERROR]: GitlabReaction.CONFUSED,
            [ReviewStatusReaction.SKIP]: GitlabReaction.EYES,
        },
    };

    constructor(
        @Inject('PIPELINE_PROVIDER')
        private readonly pipelineFactory: PipelineFactory<CodeReviewPipelineContext>,

        private readonly logger: PinoLoggerService,

        private readonly configService: ConfigService,

        private readonly observabilityService: ObservabilityService,

        private readonly codeManagement: CodeManagementService,
    ) {
        this.config =
            this.configService.get<DatabaseConnection>('mongoDatabase');
    }

    async handlePullRequest(
        organizationAndTeamData: OrganizationAndTeamData,
        repository: any,
        branch: string,
        pullRequest: any,
        platformType: string,
        teamAutomationId: string,
        origin: string,
        action: string,
        executionId: string,
        triggerCommentId?: number | string,
    ) {
        let initialContext: CodeReviewPipelineContext;

        try {
            await this.observabilityService.initializeObservability(
                this.config,
                {
                    serviceName: 'codeReviewPipeline',
                    correlationId: executionId,
                },
            );

            initialContext = {
                statusInfo: {
                    status: AutomationStatus.IN_PROGRESS,
                    message: 'Pipeline started',
                },
                pipelineVersion: '1.0.0',
                errors: [],
                organizationAndTeamData,
                repository,
                pullRequest,
                branch,
                teamAutomationId,
                origin,
                action,
                platformType: platformType as PlatformType,
                triggerCommentId,
                pipelineMetadata: {
                    lastExecution: null,
                },
                batches: [],
                preparedFileContexts: [],
                validSuggestions: [],
                discardedSuggestions: [],
                lastAnalyzedCommit: null,
                validSuggestionsByPR: [],
                validCrossFileSuggestions: [],
                tasks: {
                    astAnalysis: {
                        taskId: null,
                        status: TaskStatus.TASK_STATUS_UNSPECIFIED,
                    },
                },
                correlationId: executionId,
            };

            this.logger.log({
                message: `Iniciando pipeline de code review para PR#${pullRequest.number}`,
                context: CodeReviewHandlerService.name,
                serviceName: CodeReviewHandlerService.name,
                metadata: {
                    organizationId: organizationAndTeamData.organizationId,
                    teamId: organizationAndTeamData.teamId,
                    pullRequestNumber: pullRequest.number,
                    executionId,
                },
            });

            // Add START reaction before pipeline
            await this.addStatusReaction(
                initialContext,
                ReviewStatusReaction.START,
            );

            const pipeline =
                this.pipelineFactory.getPipeline('CodeReviewPipeline');
            const result = await pipeline.execute(initialContext);

            // Handle reactions based on result status
            await this.handleReactionsByStatus(initialContext, result);

            this.logger.log({
                message: `Pipeline de code review concluído com sucesso para PR#${pullRequest.number}`,
                context: CodeReviewHandlerService.name,
                serviceName: CodeReviewHandlerService.name,
                metadata: {
                    suggestionsCount: result?.lineComments?.length || 0,
                    organizationAndTeamData,
                    pullRequestNumber: pullRequest.number,
                    executionId,
                },
            });

            const finalStatus =
                result.statusInfo.status === AutomationStatus.IN_PROGRESS
                    ? {
                          status: AutomationStatus.SUCCESS,
                          message: 'Code review completed successfully',
                      }
                    : result.statusInfo;

            return {
                lastAnalyzedCommit: result?.lastAnalyzedCommit,
                commentId: result?.initialCommentData?.commentId,
                noteId: result?.initialCommentData?.noteId,
                threadId: result?.initialCommentData?.threadId,
                automaticReviewStatus: result?.automaticReviewStatus,
                statusInfo: finalStatus,
            };
        } catch (error) {
            if (initialContext) {
                await this.removeCurrentReaction(initialContext);
                await this.addStatusReaction(
                    initialContext,
                    ReviewStatusReaction.ERROR,
                );
            }

            this.logger.error({
                message: `Erro ao executar pipeline de code review para PR#${pullRequest.number}`,
                context: CodeReviewHandlerService.name,
                error,
                metadata: {
                    organizationId: organizationAndTeamData.organizationId,
                    teamId: organizationAndTeamData.teamId,
                    pullRequestNumber: pullRequest.number,
                    executionId,
                },
            });

            return null;
        }
    }

    private async handleReactionsByStatus(
        context: CodeReviewPipelineContext,
        result: CodeReviewPipelineContext,
    ): Promise<void> {
        const status = result.statusInfo?.status;

        // For SKIPPED: replace START with SKIP (👀 eyes)
        if (status === AutomationStatus.SKIPPED) {
            await this.removeCurrentReaction(context);
            await this.addStatusReaction(context, ReviewStatusReaction.SKIP);
            
            this.logger.log({
                message: `Review skipped for PR#${context.pullRequest.number} - adding skip reaction`,
                context: CodeReviewHandlerService.name,
                metadata: {
                    skipReason: result.statusInfo?.message,
                    organizationAndTeamData: context.organizationAndTeamData,
                },
            });
            return;
        }

        // For ERROR: replace START with ERROR (😕 confused)
        if (status === AutomationStatus.ERROR) {
            await this.removeCurrentReaction(context);
            await this.addStatusReaction(context, ReviewStatusReaction.ERROR);
            
            this.logger.log({
                message: `Review failed for PR#${context.pullRequest.number} - adding error reaction`,
                context: CodeReviewHandlerService.name,
                metadata: {
                    errorReason: result.statusInfo?.message,
                    organizationAndTeamData: context.organizationAndTeamData,
                },
            });
            return;
        }

        // For successful reviews, remove START and add SUCCESS
        if (status === AutomationStatus.SUCCESS || status === AutomationStatus.IN_PROGRESS) {
            await this.removeCurrentReaction(context);
            await this.addStatusReaction(context, ReviewStatusReaction.SUCCESS);
            return;
        }
    }

    private async addStatusReaction(
        context: CodeReviewPipelineContext,
        status: ReviewStatusReaction,
    ): Promise<void> {
        try {
            const { organizationAndTeamData, repository, pullRequest, platformType, triggerCommentId } = context;

            if (platformType === PlatformType.AZURE_REPOS) {
                return;
            }

            const reaction = this.reactionMap[platformType]?.[status];
            if (!reaction) {
                return;
            }

            if (triggerCommentId) {
                await this.codeManagement.addReactionToComment({
                    organizationAndTeamData,
                    repository: { id: repository.id, name: repository.name },
                    prNumber: pullRequest.number,
                    commentId: typeof triggerCommentId === 'string' ? parseInt(triggerCommentId, 10) : triggerCommentId,
                    reaction,
                });
            } else {
                await this.codeManagement.addReactionToPR({
                    organizationAndTeamData,
                    repository: { id: repository.id, name: repository.name },
                    prNumber: pullRequest.number,
                    reaction,
                });
            }
        } catch (error) {
            this.logger.error({
                message: 'Error adding status reaction',
                context: CodeReviewHandlerService.name,
                error,
                metadata: {
                    organizationAndTeamData: context.organizationAndTeamData,
                    status,
                    platformType: context.platformType,
                    prNumber: context.pullRequest.number,
                },
            });
        }
    }

    private async removeCurrentReaction(
        context: CodeReviewPipelineContext,
    ): Promise<void> {
        try {
            const { organizationAndTeamData, repository, pullRequest, platformType, triggerCommentId } = context;

            if (platformType === PlatformType.AZURE_REPOS) {
                return;
            }

            const platformReactions = this.reactionMap[platformType];
            if (!platformReactions) {
                return;
            }

            const reactionsToRemove = Object.values(platformReactions) as (GitHubReaction | GitlabReaction)[];

            if (triggerCommentId) {
                await this.codeManagement.removeReactionsFromComment({
                    organizationAndTeamData,
                    repository: { id: repository.id, name: repository.name },
                    prNumber: pullRequest.number,
                    commentId: typeof triggerCommentId === 'string' ? parseInt(triggerCommentId, 10) : triggerCommentId,
                    reactions: reactionsToRemove,
                });
            } else {
                await this.codeManagement.removeReactionsFromPR({
                    organizationAndTeamData,
                    repository: { id: repository.id, name: repository.name },
                    prNumber: pullRequest.number,
                    reactions: reactionsToRemove,
                });
            }
        } catch (error) {
            this.logger.error({
                message: 'Error removing current reaction',
                context: CodeReviewHandlerService.name,
                error,
                metadata: {
                    organizationAndTeamData: context.organizationAndTeamData,
                    platformType: context.platformType,
                    prNumber: context.pullRequest.number,
                },
            });
        }
    }
}
