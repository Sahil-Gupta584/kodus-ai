import { KODY_ISSUES_MANAGEMENT_SERVICE_TOKEN } from '@/core/domain/codeBase/contracts/KodyIssuesManagement.contract';
import {
    IIntegrationConfigService,
    INTEGRATION_CONFIG_SERVICE_TOKEN,
} from '@/core/domain/integrationConfigs/contracts/integration-config.service.contracts';
import {
    IPullRequestsService,
    PULL_REQUESTS_SERVICE_TOKEN,
} from '@/core/domain/pullRequests/contracts/pullRequests.service.contracts';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { KodyIssuesManagementService } from '@/ee/kodyIssuesManagement/service/kodyIssuesManagement.service';
import { IntegrationConfigKey } from '@/shared/domain/enums/Integration-config-key.enum';
import { PlatformType } from '@/shared/domain/enums/platform-type.enum';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Inject, Injectable } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';

@Injectable()
export class ProcessPrClosedUseCase implements IUseCase {
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
        const prNumber = params?.number || params.payload?.pull_request?.number;
        const repositoryId =
            params?.repository?.id?.toString() ||
            params.payload?.repository?.id?.toString();
        const repositoryName =
            params?.repository?.name || params.payload?.repository?.name;
        const organizationId =
            this.request?.user?.organization?.uuid ||
            'aaeb9004-2069-4858-8504-ec3c8c3a34f6';
        const platformType =
            params?.platformType || params.payload?.platformType;

        const teamId = await this.getTeamIdUsingRepositoryId(
            repositoryId,
            platformType,
        );

        try {
            const pr = await this.pullRequestService.findByNumberAndRepository(
                prNumber,
                repositoryName,
                { organizationId: organizationId },
            );

            if (!pr) {
                return;
            }

            const prFiles = pr.files;

            if (prFiles.length === 0) {
                return;
            }

            await this.kodyIssuesManagementService.processClosedPr({
                prNumber: prNumber,
                organizationId: organizationId,
                teamId: teamId,
                repositoryId: repositoryId,
                repositoryName: repositoryName,
                prFiles: prFiles,
            });
        } catch (error) {
            this.logger.error({
                context: ProcessPrClosedUseCase.name,
                serviceName: ProcessPrClosedUseCase.name,
                message: `Error processing closed pull request #${prNumber}: ${error.message}`,
                metadata: {
                    prNumber,
                    repositoryId,
                    organizationId,
                },
                error,
            });
        }
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

        if (repositories.length === 0) {
            throw new Error('Repository not found');
        }

        return repositories[0].team.uuid;
    }
}
