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
} from './repositoriesLog.handler';
import { UnifiedLogHandler } from './unifiedLog.handler';
import {
    ActionType,
    ConfigLevel,
    UserInfo,
} from '@/config/types/general/codeReviewSettingsLog.type';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import {
    IntegrationLogParams,
    UserStatusLogParams,
} from './types/logParams.types';

export type ChangedDataToExport = {
    actionDescription: string;
    previousValue: any;
    currentValue: any;
    description: string;
};

@Injectable()
export class CodeReviewSettingsLogService
    implements ICodeReviewSettingsLogService
{
    constructor(
        @Inject(CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN)
        private readonly codeReviewSettingsLogRepository: ICodeReviewSettingsLogRepository,

        private readonly unifiedLogHandler: UnifiedLogHandler,

        private readonly kodyRulesLogHandler: KodyRulesLogHandler,

        private readonly codeReviewConfigLogHandler: CodeReviewConfigLogHandler,

        private readonly repositoriesLogHandler: RepositoriesLogHandler,
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

    public async registerRepositoryConfigurationRemoval(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        userInfo: UserInfo;
        repository: { id: string; name: string };
    }): Promise<void> {
        await this.repositoriesLogHandler.logRepositoryConfigurationRemoval(params);
    }

    public async registerIntegrationLog(
        params: IntegrationLogParams,
    ): Promise<void> {
        const { organizationAndTeamData, userInfo, integration, actionType } =
            params;

        const platformName = this.formatPlatformName(integration.platform);

        await this.unifiedLogHandler.logAction({
            organizationAndTeamData,
            userInfo,
            actionType,
            configLevel: ConfigLevel.GLOBAL,
            entityType: 'integration',
            entityName:
                platformName +
                (integration.authIntegration?.authDetails?.org
                    ? ` (${integration.authIntegration.authDetails.org})`
                    : ''),
            oldData:
                actionType === ActionType.DELETE
                    ? {
                          platform: integration.platform,
                          integrationCategory: integration.integrationCategory,
                          organizationName:
                              integration.authIntegration?.authDetails?.org,
                          accountType:
                              integration.authIntegration?.authDetails
                                  ?.accountType,
                          authMode:
                              integration.authIntegration?.authDetails
                                  ?.authMode,
                      }
                    : null,
            newData:
                actionType === ActionType.CREATE
                    ? {
                          platform: integration.platform,
                          integrationCategory: integration.integrationCategory,
                          organizationName:
                              integration.authIntegration?.authDetails?.org,
                          accountType:
                              integration.authIntegration?.authDetails
                                  ?.accountType,
                          authMode:
                              integration.authIntegration?.authDetails
                                  ?.authMode,
                      }
                    : null,
        });
    }

    public async registerUserStatusLog(
        params: UserStatusLogParams,
    ): Promise<void> {
        const { organizationAndTeamData, userInfo, userStatusChanges } = params;

        if (userStatusChanges.length === 0) {
            return;
        }

        const changedData: ChangedDataToExport[] = [];

        // Criar changedData para cada usuário alterado
        userStatusChanges.forEach((userChange) => {
            const statusText = userChange.licenseStatus ? 'active' : 'inactive';

            changedData.push({
                actionDescription: `User ${userChange.licenseStatus ? 'Enabled' : 'Disabled'}`,
                previousValue: '',
                currentValue: {
                    gitId: userChange.gitId,
                    gitTool: userChange.gitTool,
                    status: statusText,
                    userName: userChange.userName,
                },
                description: `User ${userInfo.userEmail} ${userChange.licenseStatus === 'active' ? 'enabled' : 'disabled'} license for user "${userChange.userName}" (${userChange.gitId})`,
            });
        });

        // Determinar actionType baseado na quantidade de mudanças
        const finalActionType =
            userStatusChanges.length === 1 ? ActionType.EDIT : ActionType.EDIT;

        // Salvar um registro com todos os changedData
        await this.codeReviewSettingsLogRepository.create({
            organizationId: organizationAndTeamData.organizationId,
            teamId: organizationAndTeamData.teamId,
            action: finalActionType,
            userInfo: {
                userId: userInfo.userId,
                userEmail: userInfo.userEmail,
            },
            changeMetadata: {
                configLevel: ConfigLevel.GLOBAL,
                repository: undefined,
            },
            changedData,
        });
    }

    private formatPlatformName(platform: string): string {
        const platformNames = {
            GITHUB: 'GitHub',
            GITLAB: 'GitLab',
            BITBUCKET: 'Bitbucket',
            AZURE: 'Azure DevOps',
        };
        return platformNames[platform] || platform;
    }
}
