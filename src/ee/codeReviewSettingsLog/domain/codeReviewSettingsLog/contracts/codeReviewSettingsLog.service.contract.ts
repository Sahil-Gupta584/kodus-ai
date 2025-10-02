import { ICodeReviewSettingsLogRepository } from '@/ee/codeReviewSettingsLog/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.repository.contract';
import { CodeReviewConfigLogParams } from '@/ee/codeReviewSettingsLog/codeReviewConfigLog.handler';
import { IntegrationLogParams } from '@/ee/codeReviewSettingsLog/integrationLog.handler';
import { KodyRuleLogParams } from '@/ee/codeReviewSettingsLog/kodyRulesLog.handler';
import { PullRequestMessagesLogParams } from '@/ee/codeReviewSettingsLog/pullRequestMessageLog.handler';
import {
    RepositoriesLogParams,
    RepositoryConfigRemovalParams,
    DirectoryConfigRemovalParams,
} from '@/ee/codeReviewSettingsLog/repositoriesLog.handler';
import { UserStatusLogParams } from '@/ee/codeReviewSettingsLog/userStatusLog.handler';

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
