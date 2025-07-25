import { Injectable, Inject } from '@nestjs/common';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import {
    ActionType,
    ConfigLevel,
    UserInfo,
} from '@/config/types/general/codeReviewSettingsLog.type';
import {
    CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN,
    ICodeReviewSettingsLogRepository,
} from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.repository.contract';
import { ChangedDataToExport } from './codeReviewSettingsLog.service';

export interface RepositoriesLogParams {
    organizationAndTeamData: OrganizationAndTeamData;
    userInfo: UserInfo;
    actionType: ActionType;
    addedRepositories?: Array<{ id: string; name: string }>;
    removedRepositories?: Array<{ id: string; name: string }>;
    sourceRepository?: { id: string; name: string };
    targetRepository?: { id: string; name: string };
}

@Injectable()
export class RepositoriesLogHandler {
    constructor(
        @Inject(CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN)
        private readonly codeReviewSettingsLogRepository: ICodeReviewSettingsLogRepository,
    ) {}

    public async logRepositoriesAction(
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
                    actionDescription: 'Repository Configuration Copied',
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

            finalActionType = ActionType.ADD;
            configLevel = ConfigLevel.REPOSITORY;
            repository = {
                id: targetRepository.id,
                name: targetRepository.name,
            };
        } else {
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
                    actionDescription: 'Repository Added',
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
                    actionDescription: 'Repository Removed',
                    previousValue: {
                        id: repo.id,
                        name: repo.name,
                    },
                    currentValue: null,
                    description: `User ${userInfo.userEmail} removed repository "${repo.name}" from code review settings`,
                });
            });

            changedData = allChangedData;

            finalActionType = actionType;
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
}
