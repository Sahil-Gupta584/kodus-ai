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
import { KodyRuleLogParams, KodyRulesLogHandler } from './kodyRulesLog.handler';
import {
    CodeReviewConfigLogHandler,
    CodeReviewConfigLogParams,
} from './codeReviewConfigLog.handler';

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

        private readonly kodyRulesLogHandler: KodyRulesLogHandler,

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
        await this.kodyRulesLogHandler.logKodyRuleAction(params);
    }

    public async registerCodeReviewConfigLog(
        params: CodeReviewConfigLogParams,
    ): Promise<void> {
        await this.codeReviewConfigLogHandler.logCodeReviewConfig(params);
    }
}
