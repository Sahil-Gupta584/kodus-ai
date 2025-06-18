import {
    IIssuesService,
    ISSUES_SERVICE_TOKEN,
} from '@/core/domain/issues/contracts/issues.service.contract';
import { GetIssuesByFiltersDto } from '@/core/infrastructure/http/dtos/get-issues-by-filters.dto';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Inject, Injectable } from '@nestjs/common';
import { BuildFilterUseCase } from './build-filter.use-case';
import { IIssue } from '@/core/domain/issues/interfaces/issues.interface';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { KodyIssuesManagementService } from '@/ee/kodyIssuesManagement/service/kodyIssuesManagement.service';

@Injectable()
export class GetIssuesByFiltersUseCase implements IUseCase {
    constructor(
        @Inject(ISSUES_SERVICE_TOKEN)
        private readonly issuesService: IIssuesService,

        private readonly buildFilterUseCase: BuildFilterUseCase,

        private readonly logger: PinoLoggerService,

        private readonly kodyIssuesManagementService: KodyIssuesManagementService,
    ) {}

    async execute(filters: GetIssuesByFiltersDto): Promise<IIssue[]> {
        try {
            const filter = await this.buildFilterUseCase.execute(filters);

            const issues = await this.issuesService.find(filter);

            if (!issues || issues?.length === 0) {
                return [];
            }

            const issuesWithAge = await Promise.all(
                issues?.map(async (issue) => {
                    const age = await this.kodyIssuesManagementService.ageCalculation(issue);
                    return { ...issue.toObject(), age };
                }),
            );

            return issuesWithAge;
        } catch (error) {
            this.logger.error({
                context: GetIssuesByFiltersUseCase.name,
                message: 'Error getting issues by filters',
                error,
            });

            return [];
        }
    }
}
