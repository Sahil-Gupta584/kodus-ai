import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import {
    CODE_REVIEW_EXECUTION_SERVICE,
    ICodeReviewExecutionService,
} from '@/core/domain/codeReviewExecutions/contracts/codeReviewExecution.service.contract';
import { CodeReviewExecution } from '@/core/domain/codeReviewExecutions/interfaces/codeReviewExecution.interface';
import {
    IPullRequestsService,
    PULL_REQUESTS_SERVICE_TOKEN,
} from '@/core/domain/pullRequests/contracts/pullRequests.service.contracts';
import { IRepository } from '@/core/domain/pullRequests/interfaces/pullRequests.interface';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class CreateCodeReviewExecutionForPRUseCase implements IUseCase {
    constructor(
        @Inject(PULL_REQUESTS_SERVICE_TOKEN)
        private readonly pullRequestsService: IPullRequestsService,

        @Inject(CODE_REVIEW_EXECUTION_SERVICE)
        private readonly codeReviewExecutionService: ICodeReviewExecutionService,

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(
        prNumber: number,
        organizationAndTeamData: OrganizationAndTeamData,
        repository: IRepository,
        data: Omit<
            CodeReviewExecution,
            | 'uuid'
            | 'createdAt'
            | 'updatedAt'
            | 'pullRequestId'
            | 'organizationId'
            | 'teamId'
        >,
    ): Promise<CodeReviewExecution | null> {
        const { organizationId, teamId } = organizationAndTeamData;

        if (
            !organizationId ||
            !teamId ||
            !prNumber ||
            !repository ||
            !repository.id ||
            !repository.name
        ) {
            this.logger.warn({
                message: `Invalid parameters`,
                context: CreateCodeReviewExecutionForPRUseCase.name,
                metadata: {
                    prNumber,
                    organizationAndTeamData,
                    repository,
                },
            });
            return null;
        }

        try {
            const PR = await this.pullRequestsService.findByNumberAndRepository(
                prNumber,
                repository.name,
                organizationAndTeamData,
            );

            if (!PR) {
                this.logger.warn({
                    message: `PR #${prNumber} not found in organization ${organizationId}`,
                    context: CreateCodeReviewExecutionForPRUseCase.name,
                    metadata: { prNumber, organizationAndTeamData, repository },
                });
                return null;
            }

            const newCodeReviewExecution =
                await this.codeReviewExecutionService.create({
                    ...data,
                    pullRequestId: PR.uuid,
                    organizationId,
                    teamId,
                });

            if (!newCodeReviewExecution) {
                this.logger.warn({
                    message: `Failed to create new codeReviewExecution for PR #${prNumber}, returned NULL`,
                    context: CreateCodeReviewExecutionForPRUseCase.name,
                    metadata: { prNumber, organizationAndTeamData, repository },
                });
                return null;
            }

            this.logger.log({
                message: `Created new codeReviewExecution for PR #${prNumber}`,
                context: CreateCodeReviewExecutionForPRUseCase.name,
                metadata: { prNumber, organizationAndTeamData, repository },
            });

            return newCodeReviewExecution;
        } catch (error) {
            this.logger.error({
                message: `Failed to create new codeReviewExecution for PR #${prNumber}`,
                context: CreateCodeReviewExecutionForPRUseCase.name,
                metadata: { prNumber, organizationAndTeamData, repository },
                error,
            });
            return null;
        }
    }
}
