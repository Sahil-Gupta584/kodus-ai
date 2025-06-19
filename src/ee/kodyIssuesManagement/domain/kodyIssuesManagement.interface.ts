import { IssueStatus } from '@/config/types/general/issues.type';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { PlatformType } from '@/shared/domain/enums/platform-type.enum';
import { LabelType } from '@/shared/utils/codeManagement/labels';
import { SeverityLevel } from '@/shared/utils/enums/severityLevel.enum';

export interface IIssueDetails {
    id: string;
    title: string;
    description: string;
    age: string;
    label: LabelType;
    severity: SeverityLevel;
    status: IssueStatus;
    contributingSuggestions: IContributingSuggestion[];
    fileLink: {
        label: string;
        url: string;
    };
    prLinks: {
        label: string;
        url: string;
    }[];
    repositoryLink: {
        label: string;
        url: string;
    };
    currentCode: string;
    language: string;
    startLine: number;
    endLine: number;
    reactions: {
        thumbsUp: number;
        thumbsDown: number;
    };
    gitOrganizationName: string;
}

export interface IContributingSuggestion {
    id: string;
    prNumber: number;
    prAuthor?: string;
    existingCode?: string;
    improvedCode?: string;
}

export interface IRepositoryToIssues {
    id: string;
    name: string;
    full_name: string;
    platform: PlatformType;
    url?: string;
}

export type contextToGenerateIssues = {
    organizationAndTeamData: OrganizationAndTeamData;
    repository: IRepositoryToIssues;
    pullRequest: any;
    prFiles?: any[];
};
