import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { KODY_ISSUES_MANAGEMENT_SERVICE_TOKEN } from '@/core/domain/codeBase/contracts/KodyIssuesManagement.contract';
import {
    IIntegrationConfigService,
    INTEGRATION_CONFIG_SERVICE_TOKEN,
} from '@/core/domain/integrationConfigs/contracts/integration-config.service.contracts';
import { stripCurlyBracesFromUUIDs } from '@/core/domain/platformIntegrations/types/webhooks/webhooks-bitbucket.type';
import {
    IPullRequestsService,
    PULL_REQUESTS_SERVICE_TOKEN,
} from '@/core/domain/pullRequests/contracts/pullRequests.service.contracts';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { contextToGenerateIssues } from '@/ee/kodyIssuesManagement/domain/kodyIssuesManagement.interface';
import { KodyIssuesManagementService } from '@/ee/kodyIssuesManagement/service/kodyIssuesManagement.service';
import { IntegrationConfigKey } from '@/shared/domain/enums/Integration-config-key.enum';
import { PlatformType } from '@/shared/domain/enums/platform-type.enum';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { getMappedPlatform } from '@/shared/utils/webhooks';
import { Inject, Injectable } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';

@Injectable()
export class GenerateIssuesFromPrClosedUseCase implements IUseCase {
    constructor(
        @Inject(KODY_ISSUES_MANAGEMENT_SERVICE_TOKEN)
        private readonly kodyIssuesManagementService: KodyIssuesManagementService,

        @Inject(PULL_REQUESTS_SERVICE_TOKEN)
        private readonly pullRequestService: IPullRequestsService,

        @Inject(INTEGRATION_CONFIG_SERVICE_TOKEN)
        private readonly integrationConfigService: IIntegrationConfigService,

        @Inject(REQUEST)
        private readonly request: Request & {
            user: { organization: { uuid: string } };
        },

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(params: any): Promise<void> {
        const normalizedPayload = await this.normalizePayload(params);

        if (!normalizedPayload) {
            return;
        }

        const prData = await this.fillProperties(normalizedPayload);

        try {
            if (params?.platformType === PlatformType.AZURE_REPOS) {
                if (normalizedPayload?.pullRequest?.status !== 'completed') {
                    return;
                }
            }

            const pr = await this.pullRequestService.findByNumberAndRepository(
                prData.context.prNumber,
                prData.context.repository.name,
                {
                    organizationId:
                        prData.context.organizationAndTeamData.organizationId,
                },
            );

            if (!pr) {
                return;
            }

            const prFiles = pr.files.slice(0, 3); //REMOVER

            if (prFiles.length === 0) {
                return;
            }

            await this.kodyIssuesManagementService.processClosedPr({
                organizationAndTeamData: prData.context.organizationAndTeamData,
                prNumber: prData.context.prNumber,
                repository: prData.context.repository,
                prFiles: prFiles,
            });
        } catch (error) {
            this.logger.error({
                context: GenerateIssuesFromPrClosedUseCase.name,
                serviceName: GenerateIssuesFromPrClosedUseCase.name,
                message: `Error processing closed pull request #${prData.context.prNumber}: ${error.message}`,
                metadata: {
                    prNumber: prData.context.prNumber,
                    repositoryId: prData.context.repository.id,
                    organizationId:
                        prData.context.organizationAndTeamData.organizationId,
                },
                error,
            });
        }
    }

    private async normalizePayload(params: any): Promise<any> {
        const { payload, platformType } = params;

        const sanitizedPayload =
            platformType === PlatformType.BITBUCKET
                ? stripCurlyBracesFromUUIDs(payload)
                : payload;

        const mappedPlatform = getMappedPlatform(platformType);

        if (!mappedPlatform) {
            return;
        }

        let pullRequest = mappedPlatform.mapPullRequest({
            payload: sanitizedPayload,
        });

        if (
            !pullRequest &&
            !pullRequest?.number &&
            !pullRequest?.repository &&
            !pullRequest?.user
        ) {
            return;
        }

        const repository = mappedPlatform.mapRepository({
            payload: sanitizedPayload,
        });

        if (!repository && !repository?.id && !repository?.name) {
            return;
        }

        return {
            pullRequest,
            repository,
            platformType,
        };
    }

    private async fillProperties(params: any): Promise<{
        context: contextToGenerateIssues;
    }> {
        const prNumber = Number(params?.pullRequest?.number);
        const repositoryId = params?.repository?.id?.toString();
        const repositoryName = params?.repository?.name;
        const repositoryFullName = params?.repository?.fullName;
        const organizationId =
            this.request?.user?.organization?.uuid ||
            'aaeb9004-2069-4858-8504-ec3c8c3a34f6'; //REMOVER
        const platformType =
            params?.platformType || params.payload?.platformType;

        const teamId = await this.getTeamIdUsingRepositoryId(
            repositoryId,
            platformType,
        );

        const organizationAndTeamData: OrganizationAndTeamData = {
            organizationId: organizationId,
            teamId: teamId,
        };

        return {
            context: {
                prNumber: prNumber,
                repository: {
                    id: repositoryId,
                    name: repositoryName,
                    full_name: repositoryFullName,
                    platform: platformType,
                },
                organizationAndTeamData,
            },
        };
    }

    private async getTeamIdUsingRepositoryId(
        repositoryId: string,
        platformType: PlatformType,
    ): Promise<string> {
        const repositories =
            await this.integrationConfigService.findIntegrationConfigWithTeams(
                IntegrationConfigKey.REPOSITORIES,
                repositoryId,
                platformType,
            );

        if (repositories?.length === 0) {
            throw new Error('Repository not found');
        }

        return repositories[0].team.uuid;
    }
}
