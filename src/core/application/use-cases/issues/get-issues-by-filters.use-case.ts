import {
    IIssuesService,
    ISSUES_SERVICE_TOKEN,
} from '@/core/domain/issues/contracts/issues.service.contract';
import { IssuesEntity } from '@/core/domain/issues/entities/issues.entity';
import { GetIssuesByFiltersDto } from '@/core/infrastructure/http/dtos/get-issues-by-filters.dto';
import { PaginationDto } from '@/core/infrastructure/http/dtos/pagination.dto';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Inject, Injectable } from '@nestjs/common';
import { BuildFilterUseCase } from './build-filter.use-case';
import { IIssue } from '@/core/domain/issues/interfaces/issues.interface';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';

@Injectable()
export class GetIssuesByFiltersUseCase implements IUseCase {
    constructor(
        @Inject(ISSUES_SERVICE_TOKEN)
        private readonly issuesService: IIssuesService,

        private readonly buildFilterUseCase: BuildFilterUseCase,

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(filters: GetIssuesByFiltersDto): Promise<{
        issues: IIssue[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }> {
        try {
            const filter = await this.buildFilterUseCase.execute(filters);
            const paginationOptions = this.buildPaginationOptions(filters);

            const [data, total] = await Promise.all([
                this.issuesService.find(filter, paginationOptions),
                this.issuesService.count(filter),
            ]);

            if (!data || data?.length === 0) {
                return {
                    issues: [],
                    pagination: {
                        page: filters.page || 1,
                        limit: filters.limit || 100,
                        total: 0,
                        totalPages: 0,
                    },
                };
            }

            const issues = await Promise.all(
                data?.map(async (issue) => {
                    const age = await this.ageCalculation(issue);
                    return { ...issue.toObject(), age };
                }),
            );

            return {
                issues,
                pagination: {
                    page: filters.page || 1,
                    limit: filters.limit || 100,
                    total,
                    totalPages: Math.ceil(total / (filters.limit || 100)),
                },
            };
        } catch (error) {
            this.logger.error({
                context: GetIssuesByFiltersUseCase.name,
                message: 'Error getting issues by filters',
                error,
            });

            return {
                issues: [],
                pagination: {
                    page: filters.page || 1,
                    limit: filters.limit || 100,
                    total: 0,
                    totalPages: 0,
                },
            };
        }
    }

    private buildPaginationOptions(options: PaginationDto) {
        const limit = options.limit || 100;
        const page = options.page || 1;
        const skip = options.skip ?? (page - 1) * limit;

        return {
            limit,
            skip,
            sort: { createdAt: -1 },
        };
    }

    private async ageCalculation(issue: IssuesEntity): Promise<string> {
        const now = new Date();
        const createdAt = new Date(issue.createdAt);

        const diffTime = Math.abs(now.getTime() - createdAt.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const daysText = diffDays === 1 ? 'day' : 'days';

        return `${diffDays} ${daysText} ago`;
    }
}
