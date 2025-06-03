import { IssuesEntity } from '../entities/issues.entity';
import { IIssue } from '../interfaces/issues.interface';
import { IIssuesRepository } from './issues.repository';

export const ISSUES_SERVICE_TOKEN = Symbol('IssuesService');

export interface IIssuesService extends IIssuesRepository {
    create(issue: Omit<IIssue, 'uuid'>): Promise<IssuesEntity>;

    findById(uuid: string): Promise<IssuesEntity | null>;
    findOne(filter?: Partial<IIssue>): Promise<IssuesEntity | null>;
    find(filter?: Partial<IIssue>): Promise<IssuesEntity[]>;

    findOpenByFile(
        organizationId: string,
        repositoryId: string,
        filePath: string,
    ): Promise<IssuesEntity[]>;

    updateStatus(
        uuid: string,
        status: 'open' | 'resolved' | 'dismissed',
    ): Promise<IssuesEntity | null>;
}