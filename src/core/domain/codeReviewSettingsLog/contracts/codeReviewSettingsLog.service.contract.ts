import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { ICodeReviewSettingsLogRepository } from './codeReviewSettingsLog.repository.contract';
import {
    ActionType,
    ConfigLevel,
} from '@/config/types/general/codeReviewSettingsLog.type';
import { KodyRuleLogParams } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/kodyRulesLog.handler';

export const CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN = Symbol(
    'CodeReviewSettingsLogService',
);

export interface ICodeReviewSettingsLogService
    extends ICodeReviewSettingsLogRepository {
    saveCodeReviewSettingsLog(
        organizationAndTeamData: OrganizationAndTeamData,
        userId: string,
        oldConfig: any,
        newConfig: any,
        actionType: ActionType,
        configLevel: ConfigLevel,
        repository?: {
            id: string;
            name: string;
        },
    ): Promise<void>;

    registerKodyRulesLog(params: KodyRuleLogParams): Promise<void>;
}
