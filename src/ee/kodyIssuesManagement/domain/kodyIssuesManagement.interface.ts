import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { PullRequests } from '@/core/domain/platformIntegrations/types/codeManagement/pullRequests.type';
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
    url?: string;
}

export type contextToGenerateIssues = {
    organizationAndTeamData: OrganizationAndTeamData;
    repository: IRepositoryToIssues;
    pullRequest: any;
    prFiles?: any[];
};
