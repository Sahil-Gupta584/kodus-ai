import { Inject, Injectable } from '@nestjs/common';
import { ICodeReviewSettingsLogService } from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.service.contract';
import {
    CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN,
    ICodeReviewSettingsLogRepository,
} from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.repository.contract';
import { CodeReviewSettingsLogEntity } from '@/core/domain/codeReviewSettingsLog/entities/codeReviewSettingsLog.entity';
import { ICodeReviewSettingsLog } from '@/core/domain/codeReviewSettingsLog/interfaces/codeReviewSettingsLog.interface';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import {
    ActionType,
    ConfigLevel,
} from '@/config/types/general/codeReviewSettingsLog.type';
import {
    IUsersService,
    USER_SERVICE_TOKEN,
} from '@/core/domain/user/contracts/user.service.contract';
import { KodyRuleLogParams } from './kodyRulesLog.handler';
import { IKodyRulesLogHandler, KODY_RULES_LOG_HANDLER_TOKEN } from '@/core/domain/codeReviewSettingsLog/contracts/kodyRulesLog.handler.contract';
import { CodeReviewConfigLogHandler, CodeReviewConfigLogParams } from './codeReviewConfigLog.handler';

export type ChangedDataToExport = {
    key: string;
    displayName: string;
    previousValue: any;
    currentValue: any;
    fieldConfig: Record<string, any>;
    description: string;
};

@Injectable()
export class CodeReviewSettingsLogService
    implements ICodeReviewSettingsLogService
{
    constructor(
        @Inject(CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN)
        private readonly codeReviewSettingsLogRepository: ICodeReviewSettingsLogRepository,

        @Inject(USER_SERVICE_TOKEN)
        private readonly userService: IUsersService,

        @Inject(KODY_RULES_LOG_HANDLER_TOKEN)
        private readonly kodyRulesLogHandler: IKodyRulesLogHandler,

        private readonly codeReviewConfigLogHandler: CodeReviewConfigLogHandler,
    ) {}

    async create(
        codeReviewSettingsLog: Omit<ICodeReviewSettingsLog, 'uuid'>,
    ): Promise<CodeReviewSettingsLogEntity> {
        return this.codeReviewSettingsLogRepository.create(
            codeReviewSettingsLog,
        );
    }

    async find(
        filter?: Partial<ICodeReviewSettingsLog>,
    ): Promise<CodeReviewSettingsLogEntity[]> {
        return this.codeReviewSettingsLogRepository.find(filter);
    }

    public async registerKodyRulesLog(
        params: KodyRuleLogParams,
    ): Promise<void> {
        const kodyRuleLogParams: KodyRuleLogParams = {
            organizationAndTeamData: params.organizationAndTeamData,
            userId: params.userId,
            actionType: params.actionType,
            repositoryId: params.repositoryId,
            repositoryName: params.repositoryName,
            oldRule: params.oldRule,
            newRule: params.newRule,
            ruleTitle: params.ruleTitle,
        };

        await this.kodyRulesLogHandler.logKodyRuleAction(kodyRuleLogParams);
    }

    public async registerCodeReviewConfigLog(
        organizationAndTeamData: OrganizationAndTeamData,
        userId: string,
        oldConfig: any,
        newConfig: any,
        actionType: ActionType,
        configLevel: ConfigLevel,
        repository?: { id: string; name: string },
    ): Promise<void> {
        const codeReviewConfigLogParams: CodeReviewConfigLogParams = {
            organizationAndTeamData,
            userId,
            oldConfig,
            newConfig,
            actionType,
            configLevel,
            repository,
        };

        await this.codeReviewConfigLogHandler.logCodeReviewConfig(
            codeReviewConfigLogParams.organizationAndTeamData,
            codeReviewConfigLogParams.userId,
            codeReviewConfigLogParams.oldConfig,
            codeReviewConfigLogParams.newConfig,
            codeReviewConfigLogParams.actionType,
            codeReviewConfigLogParams.configLevel,
            codeReviewConfigLogParams.repository,
        );
    }
}
