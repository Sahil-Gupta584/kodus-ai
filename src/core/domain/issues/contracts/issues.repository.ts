import { IssueStatus } from '@/config/types/general/issues.type';
import { IssuesEntity } from '../entities/issues.entity';
import { IIssue } from '../interfaces/issues.interface';

export const ISSUES_REPOSITORY_TOKEN = Symbol('IssuesRepository');

export interface IIssuesRepository {
    getNativeCollection(): any;

    create(issue: Omit<IIssue, 'uuid'>): Promise<IssuesEntity>;

    findById(uuid: string): Promise<IssuesEntity | null>;
    findOne(filter?: Partial<IIssue>): Promise<IssuesEntity | null>;

    findByFileAndStatus(
        organizationId: string,
        repositoryId: string,
        filePath: string,
        status?: IssueStatus,
    ): Promise<IssuesEntity[] | null>;

    find(filter?: Partial<IIssue>, options?: {
        limit?: number;
        skip?: number;
        sort?: any;
    }): Promise<IssuesEntity[]>;

    count(filter?: Partial<IIssue>): Promise<number>;

    update(
        issue: IssuesEntity,
        updateData: Partial<IIssue>,
    ): Promise<IssuesEntity | null>;

    updateStatus(
        uuid: string,
        status: 'open' | 'resolved' | 'dismissed',
    ): Promise<IssuesEntity | null>;

    addSuggestionIds(
        uuid: string,
        suggestionIds: string[],
    ): Promise<IssuesEntity | null>;
}