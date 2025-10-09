import { ICodeReviewSettingsLogRepository } from '@/ee/codeReviewSettingsLog/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.repository.contract';
import { CodeReviewConfigLogParams } from '@/ee/codeReviewSettingsLog/services/codeReviewConfigLog.handler';
import { IntegrationLogParams } from '@/ee/codeReviewSettingsLog/services/integrationLog.handler';
import { KodyRuleLogParams } from '@/ee/codeReviewSettingsLog/services/kodyRulesLog.handler';
import { PullRequestMessagesLogParams } from '@/ee/codeReviewSettingsLog/services/pullRequestMessageLog.handler';
import {
    RepositoriesLogParams,
    RepositoryConfigRemovalParams,
    DirectoryConfigRemovalParams,
} from '@/ee/codeReviewSettingsLog/services/repositoriesLog.handler';
import { UserStatusLogParams } from '@/ee/codeReviewSettingsLog/services/userStatusLog.handler';

export const CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN = Symbol(
    'CodeReviewSettingsLogService',
);

export interface ICodeReviewSettingsLogService
    extends ICodeReviewSettingsLogRepository {
    registerCodeReviewConfigLog(
        params: CodeReviewConfigLogParams,
    ): Promise<void>;
    registerKodyRulesLog(params: KodyRuleLogParams): Promise<void>;
    registerRepositoriesLog(params: RepositoriesLogParams): Promise<void>;
    registerRepositoryConfigurationRemoval(
        params: RepositoryConfigRemovalParams,
    ): Promise<void>;
    registerDirectoryConfigurationRemoval(
        params: DirectoryConfigRemovalParams,
    ): Promise<void>;
    registerIntegrationLog(params: IntegrationLogParams): Promise<void>;
    registerUserStatusLog(params: UserStatusLogParams): Promise<void>;
    registerPullRequestMessagesLog(
        params: PullRequestMessagesLogParams,
    ): Promise<void>;
}
