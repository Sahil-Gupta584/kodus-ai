import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { ICodeReviewSettingsLogRepository } from './codeReviewSettingsLog.repository.contract';

export const CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN = Symbol(
    'CodeReviewSettingsLogService',
);

export interface ICodeReviewSettingsLogService
    extends ICodeReviewSettingsLogRepository {
    saveCodeReviewSettingsLog(
        oldConfig: any,
        newConfig: any,
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<void>;
}
