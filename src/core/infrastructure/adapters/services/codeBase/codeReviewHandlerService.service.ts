/**
 * @license
 * Kodus Tech. All rights reserved.
 */
import { Injectable, Inject } from '@nestjs/common';
import { PipelineFactory } from '../pipeline/pipeline-factory.service';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { PinoLoggerService } from '../logger/pino.service';
import { CodeReviewPipelineContext } from './codeReviewPipeline/context/code-review-pipeline.context';
import { PipelineStatus } from '../pipeline/interfaces/pipeline-context.interface';
import { PlatformType } from '@/shared/domain/enums/platform-type.enum';

@Injectable()
export class CodeReviewHandlerService {
    constructor(
        @Inject('PIPELINE_PROVIDER')
        private readonly pipelineFactory: PipelineFactory<CodeReviewPipelineContext>,

        private readonly logger: PinoLoggerService,
    ) {}

    async handlePullRequest(
        organizationAndTeamData: OrganizationAndTeamData,
        repository: any,
        branch: string,
        pullRequest: any,
        platformType: string,
        teamAutomationId: string,
        origin: string,
        action: string,
    ) {
        try {
            const initialContext: CodeReviewPipelineContext = {
                status: PipelineStatus.RUN,
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
                pipelineMetadata: {
                    lastExecution: null,
                },
                batches: [],
                preparedFileContexts: [],
                validSuggestions: [],
                discardedSuggestions: [],
                overallComments: [],
                lastAnalyzedCommit: null,
                validSuggestionsByPR: [],
                tasks: {
                    astAnalysis: {
                        taskId: null,
                    },
                    impactAnalysis: {
                        taskId: null,
                    },
                },
            };

            this.logger.log({
                message: `Iniciando pipeline de code review para PR#${pullRequest.number}`,
                context: CodeReviewHandlerService.name,
                serviceName: CodeReviewHandlerService.name,
                metadata: {
                    organizationId: organizationAndTeamData.organizationId,
                    teamId: organizationAndTeamData.teamId,
                    pullRequestNumber: pullRequest.number,
                },
            });

            const pipeline =
                this.pipelineFactory.getPipeline('CodeReviewPipeline');
            const result = await pipeline.execute(initialContext);

            this.logger.log({
                message: `Pipeline de code review concluído com sucesso para PR#${pullRequest.number}`,
                context: CodeReviewHandlerService.name,
                serviceName: CodeReviewHandlerService.name,
                metadata: {
                    overallCommentsCount: result?.overallComments?.length,
                    suggestionsCount: result?.lineComments?.length || 0,
                    organizationAndTeamData,
                    pullRequestNumber: pullRequest.number,
                },
            });

            return {
                overallComments: result?.overallComments,
                lastAnalyzedCommit: result?.lastAnalyzedCommit,
                commentId: result?.initialCommentData?.commentId,
                noteId: result?.initialCommentData?.noteId,
                threadId: result?.initialCommentData?.threadId,
            };
        } catch (error) {
            this.logger.error({
                message: `Erro ao executar pipeline de code review para PR#${pullRequest.number}`,
                context: CodeReviewHandlerService.name,
                error,
                metadata: {
                    organizationId: organizationAndTeamData.organizationId,
                    teamId: organizationAndTeamData.teamId,
                    pullRequestNumber: pullRequest.number,
                },
            });

            return null;
        }
    }
}
