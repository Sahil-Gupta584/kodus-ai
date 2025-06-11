import { KODY_ISSUES_MANAGEMENT_SERVICE_TOKEN } from '@/core/domain/codeBase/contracts/KodyIssuesManagement.contract';
import {
    IPullRequestsService,
    PULL_REQUESTS_SERVICE_TOKEN,
} from '@/core/domain/pullRequests/contracts/pullRequests.service.contracts';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { KodyIssuesManagementService } from '@/ee/kodyIssuesManagement/service/kodyIssuesManagement.service';
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

        @Inject(REQUEST)
        private readonly request: Request & {
            user: { organization: { uuid: string } };
        },

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(params: any): Promise<void> {
        const prNumber = params?.number || params.payload?.pull_request?.number;
        const repositoryId =
            params?.repository?.id || params.payload?.repository?.id;
        const repositoryName =
            params?.repository?.name || params.payload?.repository?.name;
        const gitOrganizationId =
            params?.organizationId || params.payload?.organization?.id;
        const organizationId =
            this.request?.user?.organization?.uuid ||
            'aaeb9004-2069-4858-8504-ec3c8c3a34f6';

        try {
            let changedFiles = params.files || [];

            if (changedFiles?.length === 0) {
                const pr =
                    await this.pullRequestService.findByNumberAndRepository(
                        prNumber,
                        repositoryName,
                        { organizationId: organizationId },
                    );

                if (!pr) {
                    return;
                }

                changedFiles = pr.files;
            }

            await this.kodyIssuesManagementService.processClosedPr({
                prNumber: prNumber,
                organizationId: organizationId,
                repositoryId: repositoryId,
                repositoryName: repositoryName,
                files: changedFiles,
            });
        } catch (error) {
            this.logger.error({
                context: ProcessPrClosedUseCase.name,
                serviceName: ProcessPrClosedUseCase.name,
                message: `Error processing closed pull request #${prNumber}: ${error.message}`,
                metadata: {
                    prNumber,
                    repositoryId,
                    gitOrganizationId,
                    organizationId,
                },
                error,
            });
        }
    }
}
