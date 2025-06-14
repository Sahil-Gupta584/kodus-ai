import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { PlatformType } from '@/shared/domain/enums/platform-type.enum';

export interface IContributingSuggestion {
    id: string;
    prNumber: number;
}

export interface IRepositoryToIssues {
    id: string;
    name: string;
    full_name: string;
    platform: PlatformType;
}

export type contextToGenerateIssues = {
    organizationAndTeamData: OrganizationAndTeamData;
    repository: IRepositoryToIssues;
    prNumber: number;
    prFiles?: any[];
};
