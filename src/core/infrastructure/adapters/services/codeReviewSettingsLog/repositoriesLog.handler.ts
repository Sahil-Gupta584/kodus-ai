import { Injectable, Inject } from '@nestjs/common';
import {
    CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN,
    ICodeReviewSettingsLogRepository,
} from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.repository.contract';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import {
    ActionType,
    ConfigLevel,
} from '@/config/types/general/codeReviewSettingsLog.type';
import {
    IUsersService,
    USER_SERVICE_TOKEN,
} from '@/core/domain/user/contracts/user.service.contract';
import { ChangedDataToExport } from './codeReviewSettingsLog.service';

interface IRepository {
    id: string;
    name: string;
}

export interface RepositoriesLogParams {
    organizationAndTeamData: OrganizationAndTeamData;
    userId: string;
    addedRepositories?: IRepository[];
    removedRepositories?: IRepository[];
}

@Injectable()
export class RepositoriesLogHandler {
    constructor(
        @Inject(CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN)
        private readonly codeReviewSettingsLogRepository: ICodeReviewSettingsLogRepository,

        @Inject(USER_SERVICE_TOKEN)
        private readonly userService: IUsersService,
    ) {}

    async logRepositoriesAction(params: RepositoriesLogParams): Promise<void> {
        const {
            organizationAndTeamData,
            userId,
            addedRepositories = [],
            removedRepositories = [],
        } = params;

        if (
            addedRepositories.length === 0 &&
            removedRepositories.length === 0
        ) {
            return;
        }

        const userInfo = await this.getUserInfo(userId);

        const allChangedData: ChangedDataToExport[] = [];

        for (const repository of addedRepositories) {
            allChangedData.push(
                ...this.generateAddChangedData(repository, userInfo),
            );
        }

        for (const repository of removedRepositories) {
            allChangedData.push(
                ...this.generateRemoveChangedData(repository, userInfo),
            );
        }

        let action: ActionType;
        if (addedRepositories.length > 0 && removedRepositories.length > 0) {
            action = ActionType.EDIT;
        } else if (addedRepositories.length > 0) {
            action = ActionType.ADD;
        } else {
            action = ActionType.DELETE;
        }

        await this.codeReviewSettingsLogRepository.create({
            organizationId: organizationAndTeamData.organizationId,
            teamId: organizationAndTeamData.teamId,
            action,
            userInfo,
            changeMetadata: {
                configLevel: ConfigLevel.GLOBAL,
                repository: undefined,
            },
            changedData: allChangedData,
        });
    }

    private generateAddChangedData(
        repository: IRepository,
        userInfo: any,
    ): ChangedDataToExport[] {
        return [
            {
                key: 'repositories.add',
                displayName: 'Repository Added',
                previousValue: null,
                currentValue: {
                    id: repository.id,
                    name: repository.name,
                },
                fieldConfig: { valueType: 'repository_action' },
                description: `User ${userInfo.userEmail}${userInfo.userName ? ` (${userInfo.userName})` : ''} added repository "${repository.name}" to code review settings`,
            },
        ];
    }

    private generateRemoveChangedData(
        repository: IRepository,
        userInfo: any,
    ): ChangedDataToExport[] {
        return [
            {
                key: 'repositories.remove',
                displayName: 'Repository Removed',
                previousValue: {
                    id: repository.id,
                    name: repository.name,
                },
                currentValue: null,
                fieldConfig: { valueType: 'repository_action' },
                description: `User ${userInfo.userEmail}${userInfo.userName ? ` (${userInfo.userName})` : ''} removed repository "${repository.name}" from code review settings`,
            },
        ];
    }

    private async getUserInfo(userId: string): Promise<any> {
        const user = await this.userService.findOne({ uuid: userId });
        return {
            userId: user.uuid,
            userName: user?.teamMember?.[0]?.name,
            userEmail: user.email,
        };
    }
}
