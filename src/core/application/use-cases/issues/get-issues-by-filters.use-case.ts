import {
    IIssuesService,
    ISSUES_SERVICE_TOKEN,
} from '@/core/domain/issues/contracts/issues.service.contract';
import { IssuesEntity } from '@/core/domain/issues/entities/issues.entity';
import { GetIssuesByFiltersDto } from '@/core/infrastructure/http/dtos/get-issues-by-filters.dto';
import { PaginationDto } from '@/core/infrastructure/http/dtos/pagination.dto';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetIssuesByFiltersUseCase implements IUseCase {
    constructor(
        @Inject(ISSUES_SERVICE_TOKEN)
        private readonly issuesService: IIssuesService,
    ) {}

    async execute(
        filters: GetIssuesByFiltersDto,
        options: PaginationDto,
    ): Promise<{
        data: IssuesEntity[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }> {
        const filter = this.buildFilter(filters);
        const paginationOptions = this.buildPaginationOptions(options);

        const [data, total] = await Promise.all([
            this.issuesService.find(filter, paginationOptions),
            this.issuesService.count(filter),
        ]);

        return {
            data,
            pagination: {
                page: options.page || 1,
                limit: options.limit || 100,
                total,
                totalPages: Math.ceil(total / (options.limit || 100)),
            },
        };
    }

    private buildFilter(filters: GetIssuesByFiltersDto): any {
        const filter: any = {};

        if (filters.title) {
            filter['title'] = { $regex: filters.title, $options: 'i' };
        }

        const exactMatchFields = [
            'severity',
            'category',
            'status',
            'organizationId',
            'filePath',
        ];
        exactMatchFields.forEach((field) => {
            if (filters[field]) {
                filter[field] = filters[field];
            }
        });

        if (filters.repository.name) {
            filter['repository.name'] = {
                $regex: filters.repository.name,
                $options: 'i',
            };
        }

        if (filters.beforeAt || filters.afterAt) {
            filter['createdAt'] = {};

            if (filters.beforeAt) {
                filter['createdAt'].$lt = new Date(filters.beforeAt);
            }

            if (filters.afterAt) {
                filter['createdAt'].$gt = new Date(filters.afterAt);
            }
        }

        return filter;
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
