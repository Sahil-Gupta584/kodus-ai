import { Injectable, Inject } from '@nestjs/common';
import { ISSUES_REPOSITORY_TOKEN } from '@/core/domain/issues/contracts/issues.repository';
import { IIssuesRepository } from '@/core/domain/issues/contracts/issues.repository';
import { IssuesEntity } from '@/core/domain/issues/entities/issues.entity';
import { IIssue } from '@/core/domain/issues/interfaces/issues.interface';
import { IIssuesService } from '@/core/domain/issues/contracts/issues.service.contract';
import { mapSimpleModelsToEntities } from '@/shared/infrastructure/repositories/mappers';

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

    //#region Find
    async findById(uuid: string): Promise<IssuesEntity | null> {
        return this.issuesRepository.findById(uuid);
    }

    async findOne(filter?: Partial<IIssue>): Promise<IssuesEntity | null> {
        return this.issuesRepository.findOne(filter);
    }

    async find(filter?: any, options?: {
        limit?: number;
        skip?: number;
        sort?: any;
    }): Promise<IssuesEntity[]> {
        return await this.issuesRepository.find(filter, options);
    }

    async count(filter?: any): Promise<number> {
        return await this.issuesRepository.count(filter);
    }
    //#endregion

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
