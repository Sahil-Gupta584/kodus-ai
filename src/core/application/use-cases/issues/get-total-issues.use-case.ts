import { KODY_ISSUES_MANAGEMENT_SERVICE_TOKEN } from '@/core/domain/codeBase/contracts/KodyIssuesManagement.contract';
import {
    IIssuesService,
    ISSUES_SERVICE_TOKEN,
} from '@/core/domain/issues/contracts/issues.service.contract';
import { GetIssuesByFiltersDto } from '@/core/infrastructure/http/dtos/get-issues-by-filters.dto';
import { KodyIssuesManagementService } from '@/ee/kodyIssuesManagement/service/kodyIssuesManagement.service';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Inject, Injectable } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';

@Injectable()
export class GetTotalIssuesUseCase implements IUseCase {
    constructor(
        @Inject(ISSUES_SERVICE_TOKEN)
        private readonly issuesService: IIssuesService,

        @Inject(KODY_ISSUES_MANAGEMENT_SERVICE_TOKEN)
        private readonly kodyIssuesManagementService: KodyIssuesManagementService,

        @Inject(REQUEST)
        private readonly request: Request & {
            user: { organization: { uuid: string } };
        },
    ) {}

    async execute(filters: GetIssuesByFiltersDto): Promise<number> {
        if (!filters?.organizationId) {
            filters.organizationId = this.request.user.organization.uuid;
        }

        const filter =
            await this.kodyIssuesManagementService.buildFilter(filters);
        return this.issuesService.count(filter);
    }
}
