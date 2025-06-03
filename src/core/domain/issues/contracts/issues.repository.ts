import { IssuesEntity } from '../entities/issues.entity';
import { IIssue } from '../interfaces/issues.interface';

export const ISSUES_REPOSITORY_TOKEN = Symbol('IssuesRepository');

export interface IIssuesRepository {
    getNativeCollection(): any;

    create(issue: Omit<IIssue, 'uuid'>): Promise<IssuesEntity>;

    findById(uuid: string): Promise<IssuesEntity | null>;
    findOne(filter?: Partial<IIssue>): Promise<IssuesEntity | null>;
    find(filter?: Partial<IIssue>): Promise<IssuesEntity[]>;

    findOpenByFile(
        organizationId: string,
        repositoryId: string,
        filePath: string,
    ): Promise<IssuesEntity[]>;

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