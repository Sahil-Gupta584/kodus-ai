import { IssueStatus } from '@/config/types/general/issues.type';
import { IssuesEntity } from '../entities/issues.entity';
import { IIssue } from '../interfaces/issues.interface';

export const ISSUES_REPOSITORY_TOKEN = Symbol('IssuesRepository');

export interface IIssuesRepository {
    getNativeCollection(): any;

    create(issue: Omit<IIssue, 'uuid'>): Promise<IssuesEntity>;

    findById(uuid: string): Promise<IssuesEntity | null>;
    findOne(filter?: Partial<IIssue>): Promise<IssuesEntity | null>;
    find(filter?: Partial<IIssue>): Promise<IssuesEntity[]>;

    findByFileAndStatus(
        organizationId: string,
        repositoryId: string,
        filePath: string,
        status?: IssueStatus,
    ): Promise<IssuesEntity[] | null>;

    findBySuggestionId(suggestionId: string): Promise<IssuesEntity | null>;

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