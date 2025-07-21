import { ActionType, ChangedData, ConfigLevel, MenuItem } from "@/config/types/general/codeReviewSettingsLog.type";

export interface ICodeReviewSettingsLog {
    uuid: string;
    organizationId: string;
    teamId: string;
    action: ActionType;
    userInfo: {
        userId: string;
        userName: string;
        userEmail: string;
    };
    changeMetadata: {
        menuItem: MenuItem;
        configLevel: ConfigLevel;
        repositoryId?: string;
    };
    changedData: ChangedData[];
}
