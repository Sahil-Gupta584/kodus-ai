import { Injectable, Inject } from '@nestjs/common';
import {
    CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN,
    ICodeReviewSettingsLogRepository,
} from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.repository.contract';
import {
    ActionType,
    ConfigLevel,
    UserInfo,
} from '@/config/types/general/codeReviewSettingsLog.type';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';

export interface ChangedDataToExport {
    actionDescription: string;
    previousValue: any;
    currentValue: any;
    description: string;
}

export interface BaseLogParams {
    organizationAndTeamData: OrganizationAndTeamData;
    userInfo: UserInfo;
    actionType: ActionType;
    configLevel?: ConfigLevel;
    repository?: { id: string; name?: string };
}

export interface UnifiedLogParams extends BaseLogParams {
    entityType: string;
    entityName?: string;
    oldData?: any;
    newData?: any;
    customChangedData?: ChangedDataToExport[];
}

@Injectable()
export class UnifiedLogHandler {
    constructor(
        @Inject(CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN)
        private readonly codeReviewSettingsLogRepository: ICodeReviewSettingsLogRepository,
    ) {}

    public async logAction(params: UnifiedLogParams): Promise<void> {
        const {
            organizationAndTeamData,
            userInfo,
            actionType,
            configLevel,
            repository,
            entityType,
            entityName,
            oldData,
            newData,
            customChangedData,
        } = params;

        const changedData =
            customChangedData ||
            this.generateChangedData({
                actionType,
                entityType,
                entityName,
                oldData,
                newData,
                userInfo,
            });

        await this.codeReviewSettingsLogRepository.create({
            organizationId: organizationAndTeamData.organizationId,
            teamId: organizationAndTeamData.teamId,
            action: actionType,
            userInfo: {
                userId: userInfo.userId,
                userEmail: userInfo.userEmail,
            },
            configLevel,
            repository,
            changedData,
        });
    }

    public async saveLogEntry(
        params: BaseLogParams & { changedData: ChangedDataToExport[] },
    ): Promise<void> {
        const {
            organizationAndTeamData,
            userInfo,
            actionType,
            configLevel,
            repository,
            changedData,
        } = params;

        await this.codeReviewSettingsLogRepository.create({
            organizationId: organizationAndTeamData.organizationId,
            teamId: organizationAndTeamData.teamId,
            action: actionType,
            userInfo: {
                userId: userInfo.userId,
                userEmail: userInfo.userEmail,
            },
            configLevel,
            repository,
            changedData,
        });
    }

    private generateChangedData(params: {
        actionType: ActionType;
        entityType: string;
        entityName?: string;
        oldData?: any;
        newData?: any;
        userInfo: UserInfo;
    }): ChangedDataToExport[] {
        const {
            actionType,
            entityType,
            entityName,
            oldData,
            newData,
            userInfo,
        } = params;

        const actionDescription = this.generateActionDescription(
            entityType,
            actionType,
        );
        const description = this.generateDescription(
            actionType,
            entityType,
            entityName,
            userInfo.userEmail,
        );

        return [
            {
                actionDescription,
                previousValue: oldData || null,
                currentValue: newData || null,
                description,
            },
        ];
    }

    private generateActionDescription(
        entityType: string,
        actionType: ActionType,
    ): string {
        const entityDisplayNames = {
            kodyRule: 'Kody Rule',
            config: 'Configuration',
            repository: 'Repository',
            integration: 'Integration',
            user: 'User',
        };

        const actionDisplayNames = {
            [ActionType.CREATE]: 'Created',
            [ActionType.EDIT]: 'Edited',
            [ActionType.DELETE]: 'Deleted',
            [ActionType.ADD]: 'Added',
        };

        const entityDisplay =
            entityDisplayNames[entityType] ||
            this.capitalizeFirstLetter(entityType);
        const actionDisplay = actionDisplayNames[actionType] || actionType;

        return `${entityDisplay} ${actionDisplay}`;
    }

    private generateDescription(
        actionType: ActionType,
        entityType: string,
        entityName: string | undefined,
        userEmail: string,
    ): string {
        const actionVerbs = {
            [ActionType.CREATE]: 'created',
            [ActionType.EDIT]: 'edited',
            [ActionType.DELETE]: 'deleted',
            [ActionType.ADD]: 'added',
        };

        const verb = actionVerbs[actionType] || actionType.toLowerCase();
        const entityDisplay = entityName ? `"${entityName}"` : entityType;

        return `User ${userEmail} ${verb} ${entityDisplay}`;
    }

    private capitalizeFirstLetter(string: string): string {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    // Utility methods for value comparison and formatting
    public static hasChanged(oldValue: any, newValue: any): boolean {
        if (oldValue === newValue) return false;

        if (Array.isArray(oldValue) && Array.isArray(newValue)) {
            if (oldValue.length !== newValue.length) return true;
            return oldValue.some(
                (item, index) => !this.isEqual(item, newValue[index]),
            );
        }

        if (
            oldValue &&
            newValue &&
            typeof oldValue === 'object' &&
            typeof newValue === 'object'
        ) {
            const keysOld = Object.keys(oldValue);
            const keysNew = Object.keys(newValue);

            if (keysOld.length !== keysNew.length) return true;
            return keysOld.some(
                (key) => !this.isEqual(oldValue[key], newValue[key]),
            );
        }

        return true;
    }

    private static isEqual(a: any, b: any): boolean {
        if (a === b) return true;

        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            return a.every((item, index) => this.isEqual(item, b[index]));
        }

        if (a && b && typeof a === 'object' && typeof b === 'object') {
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);

            if (keysA.length !== keysB.length) return false;
            return keysA.every((key) => this.isEqual(a[key], b[key]));
        }

        return false;
    }

    public static formatValue(value: any): string {
        if (value === null || value === undefined) {
            return 'none';
        }

        if (typeof value === 'boolean') {
            return value ? 'enabled' : 'disabled';
        }

        if (Array.isArray(value)) {
            return value.join(', ') || 'none';
        }

        if (typeof value === 'object') {
            return JSON.stringify(value);
        }

        return String(value);
    }

    public static determineConfigLevel(repositoryId?: string): ConfigLevel {
        if (!repositoryId || repositoryId === 'global') {
            return ConfigLevel.GLOBAL;
        }
        return ConfigLevel.REPOSITORY;
    }
}
