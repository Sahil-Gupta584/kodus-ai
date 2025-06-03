import { IIssuesService, ISSUES_SERVICE_TOKEN } from '@/core/domain/issues/contracts/issues.service.contract';
import { IssuesEntity } from '@/core/domain/issues/entities/issues.entity';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetIssuesByOrganizationUseCase implements IUseCase {
    constructor(
        @Inject(ISSUES_SERVICE_TOKEN)
        private readonly issuesService: IIssuesService,
    ) {}

    async execute(filters: {
        organizationId: string;
        repositoryId?: string;
        status?: 'open' | 'resolved' | 'dismissed';
        severity?: 'low' | 'medium' | 'high' | 'critical';
    }): Promise<IssuesEntity[]> {
        const filter: any = {};

        if (filters.organizationId) {
            filter['representativeSuggestion.organizationId'] = filters.organizationId;
        }

        if (filters.repositoryId) {
            filter['representativeSuggestion.repository.id'] = filters.repositoryId;
        }

        if (filters.status) {
            filter['representativeSuggestion.status'] = filters.status;
        }

        if (filters.severity) {
            filter['representativeSuggestion.severity'] = filters.severity;
        }

        return await this.issuesService.find(filter);
    }

    async getById(id: string): Promise<IssuesEntity | null> {
        return await this.issuesService.findById(id);
    }
}