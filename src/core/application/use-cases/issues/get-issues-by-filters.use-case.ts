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

@Injectable()
export class GetIssuesByFiltersUseCase implements IUseCase {
    constructor(
        @Inject(ISSUES_SERVICE_TOKEN)
        private readonly issuesService: IIssuesService,

        private readonly buildFilterUseCase: BuildFilterUseCase,
    ) {}

    async execute(filters: GetIssuesByFiltersDto): Promise<{
        data: IssuesEntity[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }> {
        const filter = await this.buildFilterUseCase.execute(filters);
        const paginationOptions = this.buildPaginationOptions(filters);

        const [data, total] = await Promise.all([
            this.issuesService.find(filter, paginationOptions),
            this.issuesService.count(filter),
        ]);

        return {
            data,
            pagination: {
                page: filters.page || 1,
                limit: filters.limit || 100,
                total,
                totalPages: Math.ceil(total / (filters.limit || 100)),
            },
        };
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
}
