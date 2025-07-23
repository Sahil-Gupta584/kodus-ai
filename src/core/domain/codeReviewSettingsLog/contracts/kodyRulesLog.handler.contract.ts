import { KodyRuleLogParams } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/kodyRulesLog.handler';

export const KODY_RULES_LOG_HANDLER_TOKEN = Symbol('KodyRulesLogHandler');

export interface IKodyRulesLogHandler {
    logKodyRuleAction(params: KodyRuleLogParams): Promise<void>;
}
