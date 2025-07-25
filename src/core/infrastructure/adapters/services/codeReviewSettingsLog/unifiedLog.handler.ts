import { Injectable, Inject } from '@nestjs/common';
import {
    CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN,
    ICodeReviewSettingsLogRepository,
} from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.repository.contract';
import {
    IUsersService,
    USER_SERVICE_TOKEN,
} from '@/core/domain/user/contracts/user.service.contract';
import {
    ActionType,
    ConfigLevel,
    UserInfo,
} from '@/config/types/general/codeReviewSettingsLog.type';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { ChangedDataToExport } from './codeReviewSettingsLog.service';

// Formatters por tipo de dado
export const TYPE_FORMATTERS = {
    boolean: (value: boolean) => value ? 'enabled' : 'disabled',
    array: (value: any[]) => value?.join(', ') || 'none',
    string: (value: string) => value || 'none',
    object: (value: any) => value ? JSON.stringify(value) : 'none',
    number: (value: number) => value?.toString() || '0'
};

// Templates genéricos para descriptions
export const DESCRIPTION_TEMPLATES = {
    create: (userEmail: string, entityType: string, entityName?: string) =>
        `User ${userEmail} created ${entityType}${entityName ? ` "${entityName}"` : ''}`,
    edit: (userEmail: string, entityType: string, entityName?: string) =>
        `User ${userEmail} edited ${entityType}${entityName ? ` "${entityName}"` : ''}`,
    delete: (userEmail: string, entityType: string, entityName?: string) =>
        `User ${userEmail} deleted ${entityType}${entityName ? ` "${entityName}"` : ''}`,
    clone: (userEmail: string, entityType: string, entityName?: string) =>
        `User ${userEmail} cloned ${entityType}${entityName ? ` "${entityName}"` : ''}`,
    add: (userEmail: string, entityType: string, entityName?: string) =>
        `User ${userEmail} added ${entityType}${entityName ? ` "${entityName}"` : ''}`,
    remove: (userEmail: string, entityType: string, entityName?: string) =>
        `User ${userEmail} removed ${entityType}${entityName ? ` "${entityName}"` : ''}`,
    toggle: (userEmail: string, fieldName: string, action: string) =>
        `User ${userEmail} ${action} ${fieldName}`,
    update: (userEmail: string, fieldName: string) =>
        `User ${userEmail} updated ${fieldName}`,
    change: (userEmail: string, fieldName: string) =>
        `User ${userEmail} changed ${fieldName}`
};

export interface UnifiedLogParams {
    organizationAndTeamData: OrganizationAndTeamData;
    userInfo: UserInfo;
    actionType: ActionType;
    configLevel: ConfigLevel;
    repository?: { id: string; name: string };
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

        @Inject(USER_SERVICE_TOKEN)
        private readonly userService: IUsersService,
    ) {}

    async logAction(params: UnifiedLogParams): Promise<void> {
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
            customChangedData
        } = params;

        const changedData = customChangedData || this.generateChangedData({
            actionType,
            entityType,
            entityName,
            oldData,
            newData,
            userInfo
        });

        await this.codeReviewSettingsLogRepository.create({
            organizationId: organizationAndTeamData.organizationId,
            teamId: organizationAndTeamData.teamId,
            action: actionType,
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

    private generateChangedData(params: {
        actionType: ActionType;
        entityType: string;
        entityName?: string;
        oldData?: any;
        newData?: any;
        userInfo: UserInfo;
    }): ChangedDataToExport[] {
        const { actionType, entityType, entityName, oldData, newData, userInfo } = params;

        const actionDescription = this.generateDisplayName(entityType, actionType);
        const description = this.generateDescription(actionType, entityType, entityName, userInfo.userEmail);

        return [{
            actionDescription: actionDescription,
            previousValue: oldData || null,
            currentValue: newData || null,
            description
        }];
    }

    private generateDisplayName(entityType: string, actionType: ActionType): string {
        const entityDisplayNames = {
            'kodyRule': 'Kody Rule',
            'config': 'Configuration',
            'repository': 'Repository',
            'integration': 'Integration'
        };

        const actionDisplayNames = {
            [ActionType.CREATE]: 'Created',
            [ActionType.EDIT]: 'Edited',
            [ActionType.DELETE]: 'Deleted',
            [ActionType.CLONE]: 'Cloned',
            [ActionType.ADD]: 'Added',
        };

        const entityDisplay = entityDisplayNames[entityType] || entityType;
        const actionDisplay = actionDisplayNames[actionType] || actionType;

        return `${entityDisplay} ${actionDisplay}`;
    }

    private generateDescription(
        actionType: ActionType,
        entityType: string,
        entityName: string | undefined,
        userEmail: string
    ): string {
        const template = DESCRIPTION_TEMPLATES[actionType.toLowerCase()];

        if (template) {
            return template(userEmail, entityType, entityName);
        }

        // Fallback genérico
        return `User ${userEmail} performed ${actionType} on ${entityType}`;
    }

    // Método utilitário para comparar valores e determinar se mudou
    public static hasChanged(oldValue: any, newValue: any): boolean {
        if (oldValue === newValue) return false;

        if (Array.isArray(oldValue) && Array.isArray(newValue)) {
            if (oldValue.length !== newValue.length) return true;
            return oldValue.some((item, index) => !this.isEqual(item, newValue[index]));
        }

        if (oldValue && newValue && typeof oldValue === 'object' && typeof newValue === 'object') {
            const keysOld = Object.keys(oldValue);
            const keysNew = Object.keys(newValue);

            if (keysOld.length !== keysNew.length) return true;

            return keysOld.some((key) => !this.isEqual(oldValue[key], newValue[key]));
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

    // Método para formatar valor baseado no tipo
    public static formatValue(value: any): string {
        if (value === null || value === undefined) {
            return 'none';
        }

        const type = Array.isArray(value) ? 'array' : typeof value;
        const formatter = TYPE_FORMATTERS[type];

        return formatter ? formatter(value) : String(value);
    }
}
