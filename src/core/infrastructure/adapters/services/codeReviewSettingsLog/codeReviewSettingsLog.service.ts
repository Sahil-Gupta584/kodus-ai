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
import { UnifiedLogHandler } from './unifiedLog.handler';
import {
    ActionType,
    ConfigLevel,
} from '@/config/types/general/codeReviewSettingsLog.type';
import {
    RepositoriesLogParams,
    IntegrationLogParams,
    UserStatusLogParams,
} from './types/logParams.types';

export type ChangedDataToExport = {
    key: string;
    displayName: string;
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
        const {
            organizationAndTeamData,
            userInfo,
            actionType,
            addedRepositories = [],
            removedRepositories = [],
            sourceRepository,
            targetRepository,
        } = params;

        let changedData: ChangedDataToExport[] = [];
        let finalActionType: ActionType;
        let configLevel: ConfigLevel;
        let repository: { id: string; name: string } | undefined;

        // ✅ Decidir pela action type
        if (
            actionType === ActionType.ADD &&
            sourceRepository &&
            targetRepository
        ) {
            // COPY operation (individual)
            const isSourceGlobal = sourceRepository.id === 'global';
            const sourceName = isSourceGlobal
                ? 'Global Settings'
                : sourceRepository.name;

            changedData = [
                {
                    key: 'repository.copy',
                    displayName: 'Repository Configuration Copied',
                    previousValue: null,
                    currentValue: {
                        sourceRepository: {
                            id: sourceRepository.id,
                            name: sourceName,
                            isGlobal: isSourceGlobal,
                        },
                        targetRepository: {
                            id: targetRepository.id,
                            name: targetRepository.name,
                        },
                    },
                    description: `User ${userInfo.userEmail} copied code review configuration from ${isSourceGlobal ? 'Global Settings' : `"${sourceName}"`} to repository "${targetRepository.name}"`,
                },
            ];

            finalActionType = ActionType.ADD; // ✅ COPY fica ADD
            configLevel = ConfigLevel.REPOSITORY;
            repository = {
                id: targetRepository.id,
                name: targetRepository.name,
            };
        } else {
            // ✅ ADD/REMOVE múltiplos sempre é EDIT
            if (
                addedRepositories.length === 0 &&
                removedRepositories.length === 0
            ) {
                return;
            }

            const allChangedData: ChangedDataToExport[] = [];

            // Adicionar changedData para cada repo adicionado
            addedRepositories.forEach((repo) => {
                allChangedData.push({
                    key: 'repository.add',
                    displayName: 'Repository Added',
                    previousValue: null,
                    currentValue: {
                        id: repo.id,
                        name: repo.name,
                    },
                    description: `User ${userInfo.userEmail} added repository "${repo.name}" to code review settings`,
                });
            });

            // Adicionar changedData para cada repo removido
            removedRepositories.forEach((repo) => {
                allChangedData.push({
                    key: 'repository.remove',
                    displayName: 'Repository Removed',
                    previousValue: {
                        id: repo.id,
                        name: repo.name,
                    },
                    currentValue: null,
                    description: `User ${userInfo.userEmail} removed repository "${repo.name}" from code review settings`,
                });
            });

            changedData = allChangedData;

            // ✅ Sempre EDIT para múltiplos
            finalActionType = ActionType.EDIT;
            configLevel = ConfigLevel.GLOBAL;
            repository = undefined;
        }

        // Salvar um registro só com todos os changedData
        await this.codeReviewSettingsLogRepository.create({
            organizationId: organizationAndTeamData.organizationId,
            teamId: organizationAndTeamData.teamId,
            action: finalActionType,
            userInfo: {
                userId: userInfo.userId,
                userEmail: userInfo.userEmail,
            },
            changeMetadata: {
                configLevel,
                repository,
            },
            changedData,
        });
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
                key: `user.status.${statusText}`,
                displayName: `User ${userChange.licenseStatus ? 'Enabled' : 'Disabled'}`,
                previousValue: '',
                currentValue: {
                    gitId: userChange.gitId,
                    gitTool: userChange.gitTool,
                    status: statusText,
                },
                description: `User ${userInfo.userEmail} ${userChange.licenseStatus ? 'enabled' : 'disabled'} user "${userChange.gitId}"`,
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
