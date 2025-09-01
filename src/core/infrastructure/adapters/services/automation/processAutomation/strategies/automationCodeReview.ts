import {
    AUTOMATION_EXECUTION_SERVICE_TOKEN,
    IAutomationExecutionService,
} from '@/core/domain/automation/contracts/automation-execution.service';
import {
    AUTOMATION_SERVICE_TOKEN,
    IAutomationService,
} from '@/core/domain/automation/contracts/automation.service';
import { IAutomationFactory } from '@/core/domain/automation/contracts/processAutomation/automation.factory';
import {
    ITeamAutomationService,
    TEAM_AUTOMATION_SERVICE_TOKEN,
} from '@/core/domain/automation/contracts/team-automation.service';
import { AutomationType } from '@/core/domain/automation/enums/automation-type';
import { Inject, Injectable } from '@nestjs/common';
import { IAutomation } from '@/core/domain/automation/interfaces/automation.interface';
import { ITeamAutomation } from '@/core/domain/automation/interfaces/team-automation.interface';
import { AutomationStatus } from '@/core/domain/automation/enums/automation-status';
import { PinoLoggerService } from '../../../logger/pino.service';
import { CodeReviewHandlerService } from '../../../codeBase/codeReviewHandlerService.service';
import { IAutomationExecution } from '@/core/domain/automation/interfaces/automation-execution.interface';
import {
    IOrganizationService,
    ORGANIZATION_SERVICE_TOKEN,
} from '@/core/domain/organization/contracts/organization.service.contract';
import {
    CODE_REVIEW_EXECUTION_SERVICE,
    ICodeReviewExecutionService,
} from '@/core/domain/codeReviewExecutions/contracts/codeReviewExecution.service.contract';
import { stat } from 'fs';

@Injectable()
export class AutomationCodeReviewService
    implements Omit<IAutomationFactory, 'stop'>
{
    automationType = AutomationType.AUTOMATION_CODE_REVIEW;

    constructor(
        @Inject(TEAM_AUTOMATION_SERVICE_TOKEN)
        private readonly teamAutomationService: ITeamAutomationService,

        @Inject(AUTOMATION_SERVICE_TOKEN)
        private readonly automationService: IAutomationService,

        @Inject(AUTOMATION_EXECUTION_SERVICE_TOKEN)
        private readonly automationExecutionService: IAutomationExecutionService,

        @Inject(ORGANIZATION_SERVICE_TOKEN)
        private readonly organizationService: IOrganizationService,

        private readonly codeReviewHandlerService: CodeReviewHandlerService,

        @Inject(CODE_REVIEW_EXECUTION_SERVICE)
        private readonly codeReviewExecutionService: ICodeReviewExecutionService,

        private readonly logger: PinoLoggerService,
    ) {}

    async setup(payload?: any): Promise<any> {
        try {
            // Fetch automation ID
            const automation: IAutomation = (
                await this.automationService.find({
                    automationType: this.automationType,
                })
            )[0];

            const teamAutomation: ITeamAutomation = {
                status: false,
                automation: {
                    uuid: automation.uuid,
                },
                team: {
                    uuid: payload.teamId,
                },
            };

            await this.teamAutomationService.register(teamAutomation);
        } catch (error) {
            this.logger.error({
                message: 'Error creating automation for the team',
                context: AutomationCodeReviewService.name,
                error: error,
                metadata: payload,
            });
        }
    }

    async run?(payload?: any): Promise<any> {
        let execution: IAutomationExecution | null = null;

        try {
            const {
                organizationAndTeamData,
                codeManagementEvent,
                branch,
                pullRequest,
                repository,
                teamAutomationId,
                platformType,
                origin,
                action,
            } = payload;

            this.logger.log({
                message: `Started Handling pull request for ${repository?.name} - ${branch} - PR#${pullRequest?.number}`,
                context: AutomationCodeReviewService.name,
                metadata: {
                    organizationAndTeamData,
                },
            });

            const organization = await this.organizationService.findOne({
                uuid: organizationAndTeamData.organizationId,
                status: true,
            });

            execution = await this.createAutomationExecution(
                AutomationStatus.IN_PROGRESS, // in the future maybe pending?
                'Automation started',
                {
                    platformType,
                    organizationAndTeamData: organizationAndTeamData,
                    pullRequestNumber: pullRequest?.number,
                    repositoryId: repository?.id,
                },
                teamAutomationId,
                'System',
            );
            if (!execution) {
                this.logger.warn({
                    message: `Could not create code review execution for PR #${pullRequest?.number}`,
                    context: AutomationCodeReviewService.name,
                    metadata: {
                        organizationAndTeamData,
                        repository,
                        pullRequestNumber: pullRequest?.number,
                    },
                });
            }

            const result =
                await this.codeReviewHandlerService.handlePullRequest(
                    {
                        ...organizationAndTeamData,
                        organizationName: organization.name,
                    },
                    repository,
                    branch,
                    pullRequest,
                    platformType,
                    teamAutomationId,
                    origin || 'automation',
                    action,
                );

            if (result) {
                if (execution) {
                    const newData = {
                        codeManagementEvent,
                        platformType,
                        organizationAndTeamData: organizationAndTeamData,
                        pullRequestNumber: pullRequest?.number,
                        repositoryId: repository?.id,
                    };

                    const validLastAnalyzedCommit =
                        result.lastAnalyzedCommit &&
                        typeof result.lastAnalyzedCommit === 'object' &&
                        Object.keys(result.lastAnalyzedCommit).length > 0;

                    if (
                        validLastAnalyzedCommit &&
                        (result.commentId ||
                            result.noteId ||
                            result.threadId) &&
                        result.overallComments
                    ) {
                        Object.assign(newData, {
                            lastAnalyzedCommit: result.lastAnalyzedCommit,
                            commentId: result.commentId,
                            noteId: result.noteId,
                            threadId: result.threadId,
                            automaticReviewStatus:
                                result?.automaticReviewStatus,
                        });
                    }

                    const { status, message } = result?.statusInfo || {};

                    const finalStatus = status || AutomationStatus.SUCCESS;

                    const finalMessage =
                        message || 'Automation completed successfully';

                    this.updateAutomationExecution(
                        execution,
                        finalMessage,
                        finalStatus,
                        newData,
                    );
                }

                this.logger.log({
                    message: `Finish Success Handling pull request for ${repository?.name} - ${branch} - PR#${pullRequest?.number}`,
                    context: AutomationCodeReviewService.name,
                    metadata: {
                        organizationAndTeamData,
                        ...result,
                    },
                });

                return 'Automation executed successfully';
            } else {
                if (execution) {
                    this.updateAutomationExecution(
                        execution,
                        'Error processing the pull request for code review',
                        AutomationStatus.ERROR,
                        {
                            codeManagementEvent,
                            platformType,
                            organizationAndTeamData: organizationAndTeamData,
                            pullRequestNumber: pullRequest?.number,
                            repositoryId: repository?.id,
                        },
                    );
                }

                this.logger.log({
                    message: `Finish Error Handling pull request for ${repository?.name} - ${branch} - PR#${pullRequest?.number}`,
                    context: AutomationCodeReviewService.name,
                    metadata: { organizationAndTeamData },
                });

                return 'Error while trying to execute the automation';
            }
        } catch (error) {
            if (execution) {
                this.updateAutomationExecution(
                    execution,
                    'Error executing the code review automation for the team.',
                    AutomationStatus.ERROR,
                    {},
                );
            }

            this.logger.error({
                message: 'Error executing code review automation for the team.',
                context: AutomationCodeReviewService.name,
                error: error,
                metadata: payload,
            });
        }
    }

    private async createAutomationExecution(
        status: AutomationStatus,
        message: string,
        data: any,
        teamAutomationId: string,
        origin: string,
    ) {
        try {
            const automationExecution = {
                status,
                dataExecution: data,
                teamAutomation: { uuid: teamAutomationId },
                origin,
                pullRequestNumber: data?.pullRequestNumber,
                repositoryId: data?.repositoryId,
            };

            const automation =
                await this.automationExecutionService.createCodeReview(
                    automationExecution,
                    message,
                );

            if (!automation) {
                this.logger.warn({
                    message: 'Failed to create automation execution',
                    context: AutomationCodeReviewService.name,
                    metadata: { status, teamAutomationId, origin },
                });
                return null;
            }

            return automation;
        } catch (error) {
            this.logger.error({
                message: 'Error creating automation execution',
                context: AutomationCodeReviewService.name,
                error,
                metadata: {
                    status,
                    message,
                    data,
                    teamAutomationId,
                    origin,
                },
            });
            return null;
        }
    }

    private async updateAutomationExecution(
        entity: IAutomationExecution,
        message: string,
        status: AutomationStatus,
        data?: any,
    ) {
        try {
            const errorMessage = [
                AutomationStatus.ERROR,
                AutomationStatus.SKIPPED,
            ].includes(status)
                ? message
                : null;

            const updatedAutomationExecution: Partial<IAutomationExecution> = {
                status,
                dataExecution: {
                    ...entity.dataExecution,
                    ...data,
                },
                errorMessage,
            };

            return await this.automationExecutionService.updateCodeReview(
                { uuid: entity.uuid },
                updatedAutomationExecution,
                message,
            );
        } catch (error) {
            this.logger.error({
                message: 'Error updating automation execution',
                context: AutomationCodeReviewService.name,
                error,
                metadata: {
                    entity,
                    status,
                    data,
                    message,
                },
            });
            return null;
        }
    }
}
