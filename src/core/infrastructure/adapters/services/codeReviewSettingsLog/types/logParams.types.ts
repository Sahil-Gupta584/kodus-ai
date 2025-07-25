import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { ActionType, UserInfo } from '@/config/types/general/codeReviewSettingsLog.type';

export interface RepositoriesLogParams {
    organizationAndTeamData: OrganizationAndTeamData;
    userInfo: UserInfo;
    actionType: ActionType;
    addedRepositories?: Array<{ id: string; name: string }>;
    removedRepositories?: Array<{ id: string; name: string }>;
    sourceRepository?: { id: string; name: string };
    targetRepository?: { id: string; name: string };
}

export interface IntegrationLogParams {
    organizationAndTeamData: OrganizationAndTeamData;
    userInfo: UserInfo;
    integration: {
        platform: string;
        integrationCategory: string;
        status: boolean;
        authIntegration: any;
    };
    actionType: ActionType;
}

export interface UserStatusLogParams {
    organizationAndTeamData: OrganizationAndTeamData;
    userInfo: UserInfo;
    actionType: ActionType;
    userStatusChanges: Array<{
        gitId: string;
        gitTool: string;
        licenseStatus: "active" | "inactive";
        userName: string;
    }>;
}
