import { Inject, Injectable } from '@nestjs/common';
import { ICodeReviewSettingsLogService } from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.service.contract';
import {
    CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN,
    ICodeReviewSettingsLogRepository,
} from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.repository.contract';
import { CodeReviewSettingsLogEntity } from '@/core/domain/codeReviewSettingsLog/entities/codeReviewSettingsLog.entity';
import { ICodeReviewSettingsLog } from '@/core/domain/codeReviewSettingsLog/interfaces/codeReviewSettingsLog.interface';
import { KodyRuleLogParams, KodyRulesLogHandler } from './kodyRulesLog.handler';
import {
    CodeReviewConfigLogHandler,
    CodeReviewConfigLogParams,
} from './codeReviewConfigLog.handler';
import {
    RepositoriesLogHandler,
    RepositoriesLogParams,
    RepositoryCopyLogParams,
} from './repositoriesLog.handler';
import {
    IntegrationLogHandler,
    IntegrationLogParams,
} from './integrationLog.handler';

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

        private readonly repositoriesLogHandler: RepositoriesLogHandler,

        private readonly integrationLogHandler: IntegrationLogHandler,
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

    public async registerRepositoriesLog(
        params: RepositoriesLogParams,
    ): Promise<void> {
        await this.repositoriesLogHandler.logRepositoriesAction(params);
    }

    public async registerRepositoryCopyLog(
        params: RepositoryCopyLogParams,
    ): Promise<void> {
        await this.repositoriesLogHandler.logRepositoryCopyAction(params);
    }

    public async registerIntegrationLog(
        params: IntegrationLogParams,
    ): Promise<void> {
        await this.integrationLogHandler.logIntegrationAction(params);
    }
}
