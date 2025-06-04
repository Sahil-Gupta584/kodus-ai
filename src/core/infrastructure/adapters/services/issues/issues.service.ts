import { Injectable, Inject } from '@nestjs/common';
import { ISSUES_REPOSITORY_TOKEN } from '@/core/domain/issues/contracts/issues.repository';
import { IIssuesRepository } from '@/core/domain/issues/contracts/issues.repository';
import { IssuesEntity } from '@/core/domain/issues/entities/issues.entity';
import { IIssue } from '@/core/domain/issues/interfaces/issues.interface';
import { IIssuesService } from '@/core/domain/issues/contracts/issues.service.contract';
import { IssueStatus } from '@/config/types/general/issues.type';

@Injectable()
export class IssuesService implements IIssuesService {
    constructor(
        @Inject(ISSUES_REPOSITORY_TOKEN)
        private readonly issuesRepository: IIssuesRepository,
    ) {}

    getNativeCollection() {
        return this.issuesRepository.getNativeCollection();
    }

    async create(issue: Omit<IIssue, 'uuid'>): Promise<IssuesEntity> {
        return this.issuesRepository.create(issue);
    }

    async findById(uuid: string): Promise<IssuesEntity | null> {
        return this.issuesRepository.findById(uuid);
    }

    async findOne(filter?: Partial<IIssue>): Promise<IssuesEntity | null> {
        return this.issuesRepository.findOne(filter);
    }

    async find(filter?: Partial<IIssue>): Promise<IssuesEntity[]> {
        return this.issuesRepository.find(filter);
    }

    async findByFileAndStatus(
        organizationId: string,
        repositoryId: string,
        filePath: string,
        status?: IssueStatus,
    ): Promise<IssuesEntity[] | null> {
        return this.issuesRepository.findByFileAndStatus(
            organizationId,
            repositoryId,
            filePath,
            status,
        );
    }

    async findBySuggestionId(
        suggestionId: string,
    ): Promise<IssuesEntity | null> {
        return this.issuesRepository.findBySuggestionId(suggestionId);
    }

    async update(
        issue: IssuesEntity,
        updateData: Partial<IIssue>,
    ): Promise<IssuesEntity | null> {
        return this.issuesRepository.update(issue, updateData);
    }

    async updateStatus(
        uuid: string,
        status: 'open' | 'resolved' | 'dismissed',
    ): Promise<IssuesEntity | null> {
        return this.issuesRepository.updateStatus(uuid, status);
    }

    async addSuggestionIds(
        uuid: string,
        suggestionIds: string[],
    ): Promise<IssuesEntity | null> {
        return this.issuesRepository.addSuggestionIds(uuid, suggestionIds);
    }
}
