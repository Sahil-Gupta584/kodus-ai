import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';

export interface IContributingSuggestion {
    id: string;
    prNumber: number;
}

export interface IRepositoryToIssues {
    id: string;
    name: string;
    full_name: string;
}

export type contextToGenerateIssues = {
    organizationAndTeamData: OrganizationAndTeamData;
    repository: IRepositoryToIssues;
    prNumber: number;
    prFiles?: any[];
};
