import {
    IIssuesService,
    ISSUES_SERVICE_TOKEN,
} from '@/core/domain/issues/contracts/issues.service.contract';
import { GetIssuesByFiltersDto } from '@/core/infrastructure/http/dtos/get-issues-by-filters.dto';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class BuildFilterUseCase implements IUseCase {
    constructor(
        @Inject(ISSUES_SERVICE_TOKEN)
        private readonly issuesService: IIssuesService,
    ) {}

    async execute(filters: GetIssuesByFiltersDto): Promise<any> {
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

        if (filters.repositoryName) {
            filter['repository.name'] = {
                $regex: filters.repositoryName,
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
}
