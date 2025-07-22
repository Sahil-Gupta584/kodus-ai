import { ActionType, ChangedData, ConfigLevel } from "@/config/types/general/codeReviewSettingsLog.type";

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
        configLevel: ConfigLevel;
        repository?: {
            id: string;
            name: string;
        };
    };
    changedData: ChangedData[];
}
