import { ActionType } from '@/config/types/general/codeReviewSettingsLog.type';
import {
    CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN,
    ICodeReviewSettingsLogService,
} from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.service.contract';
import {
    KODY_RULES_SERVICE_TOKEN,
    IKodyRulesService,
} from '@/core/domain/kodyRules/contracts/kodyRules.service.contract';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { Injectable, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';

@Injectable()
export class DeleteRuleInOrganizationByIdKodyRulesUseCase {
    constructor(
        @Inject(REQUEST)
        private readonly request: Request & {
            user: { organization: { uuid: string }; uuid: string };
        },

        @Inject(KODY_RULES_SERVICE_TOKEN)
        private readonly kodyRulesService: IKodyRulesService,

        @Inject(CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN)
        private readonly codeReviewSettingsLogService: ICodeReviewSettingsLogService,

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(ruleId: string) {
        try {
            if (!this.request.user.organization.uuid) {
                throw new Error('Organization ID not found');
            }

            const existing = await this.kodyRulesService.findByOrganizationId(
                this.request.user.organization.uuid,
            );

            if (!existing) {
                return false;
            }

            if (!existing?.rules?.find((rule) => rule.uuid === ruleId)) {
                return false;
            }

            const rule = await this.kodyRulesService.deleteRuleLogically(
                existing.uuid,
                ruleId,
            );

            const deletedRule = existing.rules.find(
                (rule) => rule.uuid === ruleId,
            );

            this.codeReviewSettingsLogService.registerKodyRulesLog({
                organizationAndTeamData: {
                    organizationId: this.request.user.organization.uuid,
                },
                userId: this.request.user.uuid,
                actionType: ActionType.DELETE,
                repositoryId: deletedRule?.repositoryId,
                oldRule: deletedRule,
                newRule: undefined,
                ruleTitle: deletedRule?.title,
            });

            return rule;
        } catch (error) {
            this.logger.error({
                message: 'Error deleting Kody Rule in organization by ID',
                context: DeleteRuleInOrganizationByIdKodyRulesUseCase.name,
                error: error,
                metadata: {
                    organizationId: this.request.user.organization.uuid,
                    ruleId,
                },
            });
            throw error;
        }
    }
}
