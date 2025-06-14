import { IssueStatus } from '@/config/types/general/issues.type';
import { ISuggestion } from '@/core/domain/pullRequests/interfaces/pullRequests.interface';
import { IContributingSuggestion, IRepositoryToIssues } from '@/ee/kodyIssuesManagement/domain/kodyIssuesManagement.interface';
import { LabelType } from '@/shared/utils/codeManagement/labels';
import { SeverityLevel } from '@/shared/utils/enums/severityLevel.enum';

export interface IIssue {
    uuid?: string;
    title: string;
    description: string;
    filePath: string;
    language: string;
    label: LabelType;
    severity: SeverityLevel;
    representativeSuggestion: ISuggestion;
    contributingSuggestions: IContributingSuggestion[];
    repository: IRepositoryToIssues;
    organizationId: string;
    status: IssueStatus;
    prLinks?: {
        number: string;
        url: string;
    }[];
    reactions?: {
        thumbsUp: number;
        thumbsDown: number;
    }[];
    age?: string;
    createdAt: string;
    updatedAt: string;
}
