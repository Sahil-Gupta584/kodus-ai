import { ICodeReviewSettingsLogRepository } from './codeReviewSettingsLog.repository.contract';
import { KodyRuleLogParams } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/kodyRulesLog.handler';
import { CodeReviewConfigLogParams } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/codeReviewConfigLog.handler';
import { RepositoriesLogParams, IntegrationLogParams } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/types/logParams.types';

export const CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN = Symbol(
    'CodeReviewSettingsLogService',
);

export interface ICodeReviewSettingsLogService
    extends ICodeReviewSettingsLogRepository {
    registerCodeReviewConfigLog(params: CodeReviewConfigLogParams): Promise<void>;
    registerKodyRulesLog(params: KodyRuleLogParams): Promise<void>;
    registerRepositoriesLog(params: RepositoriesLogParams): Promise<void>;
    registerIntegrationLog(params: IntegrationLogParams): Promise<void>;
}
