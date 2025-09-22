import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
    AUTOMATION_SERVICE_TOKEN,
    IAutomationService,
} from '@/core/domain/automation/contracts/automation.service';
import {
    TEAM_AUTOMATION_SERVICE_TOKEN,
    ITeamAutomationService,
} from '@/core/domain/automation/contracts/team-automation.service';
import { AutomationType } from '@/core/domain/automation/enums/automation-type';
import {
    EXECUTE_AUTOMATION_SERVICE_TOKEN,
    IExecuteAutomationService,
} from '@/shared/domain/contracts/execute.automation.service.contracts';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { PlatformType } from '@/shared/domain/enums/platform-type.enum';
import {
    IIntegrationConfigService,
    INTEGRATION_CONFIG_SERVICE_TOKEN,
} from '@/core/domain/integrationConfigs/contracts/integration-config.service.contracts';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { IntegrationConfigKey } from '@/shared/domain/enums/Integration-config-key.enum';
import { getMappedPlatform } from '@/shared/utils/webhooks';
import { stripCurlyBracesFromUUIDs } from '@/core/domain/platformIntegrations/types/webhooks/webhooks-bitbucket.type';
import {
    ILicenseService,
    LICENSE_SERVICE_TOKEN,
    OrganizationLicenseValidationResult,
} from '@/ee/license/interfaces/license.interface';
import { environment } from '@/ee/configs/environment';
import { OrganizationParametersKey } from '@/shared/domain/enums/organization-parameters-key.enum';
import { decrypt } from '@/shared/utils/crypto';
import { BYOKConfig } from '@kodus/kodus-common/llm';
import { BYOKProvider } from '@kodus/kodus-common/llm';
import {
    IOrganizationParametersService,
    ORGANIZATION_PARAMETERS_SERVICE_TOKEN,
} from '@/core/domain/organizationParameters/contracts/organizationParameters.service.contract';

@Injectable()
export class RunCodeReviewAutomationUseCase {
    public readonly isCloud: boolean;
    public readonly isDevelopment: boolean;

    constructor(
        @Inject(INTEGRATION_CONFIG_SERVICE_TOKEN)
        private readonly integrationConfigService: IIntegrationConfigService,

        @Inject(AUTOMATION_SERVICE_TOKEN)
        private readonly automationService: IAutomationService,

        @Inject(TEAM_AUTOMATION_SERVICE_TOKEN)
        private readonly teamAutomationService: ITeamAutomationService,

        @Inject(EXECUTE_AUTOMATION_SERVICE_TOKEN)
        private readonly executeAutomation: IExecuteAutomationService,

        @Inject(LICENSE_SERVICE_TOKEN)
        private readonly licenseService: ILicenseService,

        @Inject(ORGANIZATION_PARAMETERS_SERVICE_TOKEN)
        private readonly organizationParametersService: IOrganizationParametersService,

        private readonly codeManagement: CodeManagementService,

        private logger: PinoLoggerService,
    ) {
        this.isCloud = environment.API_CLOUD_MODE;
        this.isDevelopment = environment.API_DEVELOPMENT_MODE;
    }

    async execute(params: {
        payload: any;
        event: string;
        platformType: PlatformType;
        automationName?: string;
    }) {
        let organizationAndTeamData = null;
        let byokConfig: BYOKConfig | null = null;

        try {
            const { payload, event, platformType } = params;

            if (!this.shouldRunAutomation(payload, platformType)) {
                return;
            }

            const mappedPlatform = getMappedPlatform(platformType);
            if (!mappedPlatform) {
                return;
            }

            const sanitizedPayload =
                platformType === PlatformType.BITBUCKET
                    ? stripCurlyBracesFromUUIDs(payload)
                    : payload;

            const action = mappedPlatform.mapAction({
                payload: sanitizedPayload,
                event: event,
            });

            if (!action) {
                return;
            }

            const repository = mappedPlatform.mapRepository({
                payload: sanitizedPayload,
            });

            if (!repository) {
                return;
            }

            const mappedUsers = mappedPlatform.mapUsers({
                payload: sanitizedPayload,
            });

            let pullRequestData = null;
            const pullRequest = mappedPlatform.mapPullRequest({
                payload: sanitizedPayload,
            });

            const teamWithAutomation = await this.findTeamWithActiveCodeReview({
                repository,
                platformType,
                userGitId:
                    mappedUsers?.user?.id?.toString() ||
                    mappedUsers?.user?.uuid?.toString(),
                prNumber: pullRequest?.number,
            });

            if (!teamWithAutomation) {
                return;
            }

            const {
                organizationAndTeamData: teamData,
                automationId,
                byokConfig,
            } = teamWithAutomation;
            organizationAndTeamData = teamData;

            if (!pullRequest) {
                // try to get the PR details from the code management when it's a github issue
                if (platformType === PlatformType.GITHUB) {
                    pullRequestData = await this.codeManagement.getPullRequest({
                        organizationAndTeamData,
                        repository: {
                            id: repository.id,
                            name: repository.name,
                        },
                        prNumber: sanitizedPayload?.issue?.number,
                    });
                }

                // if it's still not possible to get the PR details, return
                if (!pullRequestData) {
                    return;
                }

                // adjust it so it looks like the output from mapped platform
                pullRequestData = {
                    ...pullRequestData,
                    repository: {
                        id: repository.id,
                        name: repository.name,
                    },
                    head: {
                        ref: pullRequestData?.head?.ref,
                        repo: {
                            fullName: pullRequestData?.head?.repo?.fullName,
                        },
                    },
                    base: {
                        ref: pullRequestData?.base?.ref,
                        repo: {
                            fullName: pullRequestData?.base?.repo?.fullName,
                            defaultBranch:
                                pullRequestData?.base?.repo?.defaultBranch,
                        },
                    },
                    title: pullRequestData?.title,
                    body: pullRequestData?.body,
                    user: {
                        id: pullRequestData?.user?.id,
                        login: pullRequestData?.user?.login,
                        name: pullRequestData?.user?.name,
                    },
                    isDraft:
                        pullRequestData?.isDraft ??
                        pullRequestData?.draft ??
                        false,
                };
            }

            pullRequestData = pullRequestData ?? pullRequest;

            let repositoryData = repository;
            // Only github provides the language in the webhook, so for the others try to get it
            if (
                !repositoryData.language &&
                platformType !== PlatformType.GITHUB
            ) {
                repositoryData = {
                    ...repository,
                    language: await this.codeManagement.getLanguageRepository({
                        organizationAndTeamData,
                        repository: {
                            id: repository.id,
                            name: repository.name,
                        },
                    }),
                };
            }

            this.logger.log({
                message: `RunCodeReviewAutomationUseCase PR#${pullRequestData?.number}`,
                context: RunCodeReviewAutomationUseCase.name,
                metadata: {
                    organizationAndTeamData,
                    repository: repositoryData,
                    pullRequest: pullRequestData,
                    branch: pullRequestData?.head?.ref,
                    codeManagementEvent: event,
                    platformType: platformType,
                    origin: sanitizedPayload?.origin,
                },
            });

            return await this.executeAutomation.executeStrategy(
                AutomationType.AUTOMATION_CODE_REVIEW,
                {
                    organizationAndTeamData,
                    teamAutomationId: automationId,
                    repository: repositoryData,
                    pullRequest: pullRequestData,
                    branch: pullRequestData?.head?.ref,
                    codeManagementEvent: event,
                    platformType: platformType,
                    origin: sanitizedPayload?.origin,
                    action,
                    byokConfig,
                },
            );
        } catch (error) {
            this.logger.error({
                message: 'Error executing code review automation',
                context: RunCodeReviewAutomationUseCase.name,
                error: error,
                metadata: {
                    automationName: params.automationName,
                    teamId: organizationAndTeamData?.teamId,
                },
            });
        }
    }

    private shouldRunAutomation(payload: any, platformType: PlatformType) {
        const allowedActions = [
            'opened',
            'synchronize',
            'ready_for_review',
            'open',
            'update',
            'git.pullrequest.updated',
            'git.pullrequest.created',
        ];
        const currentAction =
            payload?.action ||
            payload?.object_attributes?.action ||
            payload?.eventType;

        const isMerged =
            payload?.object_attributes?.state === 'merged' ||
            payload?.resource?.pullRequest?.status === 'completed' ||
            payload?.resource?.status === 'completed' ||
            false;

        const isCommand = payload?.origin === 'command';

        // bitbucket has already been handled in the webhook validation
        if (
            !isCommand &&
            platformType !== PlatformType.BITBUCKET &&
            (!allowedActions.includes(currentAction) || isMerged)
        ) {
            this.logger.log({
                message: 'Automation skipped',
                context: RunCodeReviewAutomationUseCase.name,
                metadata: { currentAction, isMerged, platformType },
            });
            return false;
        }

        return true;
    }

    private async getAutomation() {
        const automation = (
            await this.automationService.find({
                automationType: AutomationType.AUTOMATION_CODE_REVIEW,
            })
        )[0];

        if (!automation) {
            this.logger.warn({
                message: 'No automation found',
                context: RunCodeReviewAutomationUseCase.name,
                metadata: {
                    automationName: 'Code Review',
                },
            });
            throw new Error('No automation found');
        }

        return automation;
    }

    private async getTeamAutomations(automationUuid: string, teamId: string) {
        const teamAutomations = await this.teamAutomationService.find({
            automation: { uuid: automationUuid },
            status: true,
            team: { uuid: teamId },
        });

        if (!teamAutomations || teamAutomations?.length <= 0) {
            this.logger.warn({
                message: 'No active team automation found',
                context: RunCodeReviewAutomationUseCase.name,
                metadata: {
                    automation: automationUuid,
                    teamId: teamId,
                },
            });
            return null;
        }

        return teamAutomations;
    }

    async findTeamWithActiveCodeReview(params: {
        repository: { id: string; name: string };
        platformType: PlatformType;
        userGitId?: string;
        prNumber?: number;
    }): Promise<{
        organizationAndTeamData: OrganizationAndTeamData;
        automationId: string;
        byokConfig?: BYOKConfig;
    } | null> {
        try {
            if (!params?.repository?.id) {
                return null;
            }

            let byokConfig: BYOKConfig | null = null;

            const configs =
                await this.integrationConfigService.findIntegrationConfigWithTeams(
                    IntegrationConfigKey.REPOSITORIES,
                    params.repository.id,
                    params.platformType,
                );

            if (!configs?.length) {
                this.logger.warn({
                    message: 'No repository configuration found',
                    context: RunCodeReviewAutomationUseCase.name,
                    metadata: {
                        repositoryName: params.repository?.name,
                    },
                });

                return null;
            }

            const automation = await this.getAutomation();

            for (const config of configs) {
                const automations = await this.getTeamAutomations(
                    automation.uuid,
                    config.team.uuid,
                );

                if (!automations?.length) {
                    this.logger.warn({
                        message: `No automations configuration found. Organization: ${config?.team?.organization?.uuid} - Team: ${config?.team?.uuid}`,
                        context: RunCodeReviewAutomationUseCase.name,
                        metadata: {
                            repositoryName: params.repository?.name,
                            organizationAndTeamData: {
                                organizationId:
                                    config?.team?.organization?.uuid,
                                teamId: config?.team?.uuid,
                            },
                            automationId: automation.uuid,
                        },
                    });
                } else {
                    const { organizationAndTeamData, automationId } = {
                        organizationAndTeamData: {
                            organizationId: config?.team?.organization?.uuid,
                            teamId: config?.team?.uuid,
                        },
                        automationId: automations[0].uuid,
                    };

                    if (!this.isDevelopment) {
                        if (this.isCloud) {
                            const validation =
                                await this.licenseService.validateOrganizationLicense(
                                    organizationAndTeamData,
                                );

                            if (!validation?.valid) {
                                this.logger.warn({
                                    message: `License not active - PR#${params?.prNumber}`,
                                    context:
                                        RunCodeReviewAutomationUseCase.name,
                                    metadata: {
                                        organizationAndTeamData,
                                        prNumber: params?.prNumber,
                                    },
                                });

                                await this.createNoActiveSubscriptionComment({
                                    organizationAndTeamData,
                                    repository: params.repository,
                                    prNumber: params?.prNumber,
                                    noActiveSubscriptionType: 'general',
                                });

                                return null;
                            }

                            try {
                                byokConfig = await this.determineBYOKUsage(
                                    organizationAndTeamData,
                                    validation,
                                );

                                const planType = validation.planType;
                                const needsBYOK =
                                    planType?.includes('byok') ||
                                    planType?.includes('free');

                                if (needsBYOK && !byokConfig) {
                                    await this.createNoActiveSubscriptionComment(
                                        {
                                            organizationAndTeamData,
                                            repository: params.repository,
                                            prNumber: params?.prNumber,
                                            noActiveSubscriptionType:
                                                'byok_required',
                                        },
                                    );
                                    return null;
                                }
                            } catch (error) {
                                if (error.message === 'BYOK_NOT_CONFIGURED') {
                                    const planType = validation.planType;
                                    const needsBYOK =
                                        planType?.includes('byok') ||
                                        planType?.includes('free');

                                    if (needsBYOK) {
                                    await this.createNoActiveSubscriptionComment(
                                        {
                                            organizationAndTeamData,
                                            repository: params.repository,
                                            prNumber: params?.prNumber,
                                            noActiveSubscriptionType:
                                                'byok_required',
                                        },
                                    );
                                        return null;
                                    }
                                }
                            }

                            if (
                                validation?.valid &&
                                validation?.subscriptionStatus === 'trial'
                            ) {
                                return {
                                    organizationAndTeamData,
                                    automationId,
                                };
                            }

                            if (validation?.valid) {
                                const users =
                                    await this.licenseService.getAllUsersWithLicense(
                                        organizationAndTeamData,
                                    );

                                if (params?.userGitId) {
                                    const user = users?.find(
                                        (user) =>
                                            user?.git_id === params?.userGitId,
                                    );

                                    if (user) {
                                        return {
                                            organizationAndTeamData,
                                            automationId,
                                        };
                                    }

                                    this.logger.warn({
                                        message: `User License not found - PR#${params?.prNumber}`,
                                        context:
                                            RunCodeReviewAutomationUseCase.name,
                                        metadata: {
                                            organizationAndTeamData,
                                            prNumber: params?.prNumber,
                                        },
                                    });

                                    await this.createNoActiveSubscriptionComment(
                                        {
                                            organizationAndTeamData,
                                            repository: params.repository,
                                            prNumber: params?.prNumber,
                                            noActiveSubscriptionType: 'user',
                                        },
                                    );

                                    return null;
                                } else {
                                    return null;
                                }
                    }
                }
            }

            return {
                organizationAndTeamData,
                automationId,
                byokConfig,
            };
                }
            }

            return null;
        } catch (error) {
            this.logger.error({
                message: 'Automation, Repository OR License not Active',
                context: RunCodeReviewAutomationUseCase.name,
                error: error,
                metadata: {
                    ...params,
                },
            });
            throw new BadRequestException(error);
        }
    }

    private async createNoActiveSubscriptionComment(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { id: string; name: string };
        prNumber: number;
        noActiveSubscriptionType: 'user' | 'general' | 'byok_required';
    }) {
        const repositoryPayload = {
            id: params.repository.id,
            name: params.repository.name,
        };

        let message = await this.noActiveSubscriptionGeneralMessage();

        if (params.noActiveSubscriptionType === 'user') {
            message = await this.noActiveSubscriptionForUser();
        } else if (params.noActiveSubscriptionType === 'byok_required') {
            message = await this.noBYOKConfiguredMessage(); // NOVO
        }

        await this.codeManagement.createIssueComment({
            organizationAndTeamData: params.organizationAndTeamData,
            repository: repositoryPayload,
            prNumber: params?.prNumber,
            body: message,
        });

        this.logger.log({
            message: `No active subscription found for PR#${params?.prNumber}`,
            context: RunCodeReviewAutomationUseCase.name,
            metadata: {
                organizationAndTeamData: params.organizationAndTeamData,
                repository: repositoryPayload,
                prNumber: params?.prNumber,
            },
        });

        return;
    }

    private async determineBYOKUsage(
        organizationAndTeamData: OrganizationAndTeamData,
        validation: OrganizationLicenseValidationResult,
    ): Promise<BYOKConfig | null> {
        try {
            // Self-hosted sempre usa config das env vars (não usa BYOK)
            if (!this.isCloud) {
                return null;
            }

            if (!validation) {
                return null;
            }

            if (!validation?.valid) {
                return null;
            }

            const planType = validation?.planType;

            const isBYOKPlan = planType?.includes('byok');
            const isFreePlan = planType?.includes('free');
            const isManagedPlan = planType?.includes('managed') && !isBYOKPlan;

            // Managed plans (sem byok) usam nossas keys
            if (isManagedPlan) {
                this.logger.log({
                    message: 'Using managed keys for review',
                    context: RunCodeReviewAutomationUseCase.name,
                    metadata: { organizationAndTeamData, planType },
                });
                return null;
            }

            // Free plan ou BYOK plan precisam de BYOK config
            if (isFreePlan || isBYOKPlan) {
                const byokData =
                    await this.organizationParametersService.findByKey(
                        OrganizationParametersKey.BYOK_CONFIG,
                        organizationAndTeamData,
                    );

                if (!byokData?.configValue) {
                    this.logger.warn({
                        message: `BYOK required but not configured for plan ${planType}`,
                        context: RunCodeReviewAutomationUseCase.name,
                        metadata: { organizationAndTeamData, planType },
                    });

                    throw new Error('BYOK_NOT_CONFIGURED');
                }

                this.logger.log({
                    message: 'Using BYOK configuration for review',
                    context: RunCodeReviewAutomationUseCase.name,
                    metadata: {
                        organizationAndTeamData,
                        planType,
                        provider: byokData.configValue?.provider,
                        model: byokData.configValue?.model,
                    },
                });

                return byokData.configValue;
            }

            // Caso não identificado, usar keys gerenciadas
            return null;
        } catch (error) {
            if (error.message === 'BYOK_NOT_CONFIGURED') {
                throw error; // Re-throw para ser tratado no findTeamWithActiveCodeReview
            }

            this.logger.error({
                message: 'Error determining BYOK usage',
                context: RunCodeReviewAutomationUseCase.name,
                error: error,
                metadata: { organizationAndTeamData },
            });

            // Em caso de erro, falhar seguramente sem usar BYOK
            return null;
        }
    }

    private async noActiveSubscriptionGeneralMessage(): Promise<string> {
        return (
            '## Your trial has ended! 😢\n\n' +
            'To keep getting reviews, activate your plan [here](https://app.kodus.io/settings/subscription).\n\n' +
            'Got questions about plans or want to see if we can extend your trial? Talk to our founders [here](https://cal.com/gabrielmalinosqui/30min).😎\n\n' +
            '<!-- kody-codereview -->'
        );
    }

    private async noActiveSubscriptionForUser(): Promise<string> {
        return (
            '## User License not found! 😢\n\n' +
            'To perform the review, ask the admin to add a subscription for your user in [subscription management](https://app.kodus.io/settings/subscription).\n\n' +
            '<!-- kody-codereview -->'
        );
    }

    private async noBYOKConfiguredMessage(): Promise<string> {
        return (
            '## BYOK Configuration Required! 🔑\n\n' +
            'Your plan requires a Bring Your Own Key (BYOK) configuration to perform code reviews.\n\n' +
            'Please configure your API keys in [Settings > BYOK Configuration](https://app.kodus.io/settings/byok).\n\n' +
            '<!-- kody-codereview -->'
        );
    }
}
