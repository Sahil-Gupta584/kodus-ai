import { ICodeReviewSettingsLogRepository } from './codeReviewSettingsLog.repository.contract';
import { KodyRuleLogParams } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/kodyRulesLog.handler';
import { CodeReviewConfigLogParams } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/codeReviewConfigLog.handler';
import { IntegrationLogParams, UserStatusLogParams } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/types/logParams.types';
import { RepositoriesLogParams } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/repositoriesLog.handler';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { UserInfo } from '@/config/types/general/codeReviewSettingsLog.type';

export const CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN = Symbol(
    'CodeReviewSettingsLogService',
);

export interface ICodeReviewSettingsLogService
    extends ICodeReviewSettingsLogRepository {
    registerCodeReviewConfigLog(params: CodeReviewConfigLogParams): Promise<void>;
    registerKodyRulesLog(params: KodyRuleLogParams): Promise<void>;
    registerRepositoriesLog(params: RepositoriesLogParams): Promise<void>;
    registerRepositoryConfigurationRemoval(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        userInfo: UserInfo;
        repository: { id: string; name: string };
    }): Promise<void>;
    registerIntegrationLog(params: IntegrationLogParams): Promise<void>;
    registerUserStatusLog(params: UserStatusLogParams): Promise<void>;
}
