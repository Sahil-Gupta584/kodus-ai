export enum ActionType {
    ADD = 'add',
    CREATE = 'create',
    EDIT = 'edit',
    DELETE = 'delete',
}

export enum ConfigLevel {
    MAIN = 'main',
    GLOBAL = 'global',
    REPOSITORY = 'repository',
}

export type ChangedData = {
    key: string;
    displayName: string;
    previousValue: any;
    currentValue: any;
    fieldConfig: Record<string, unknown>;
    description: string;
};

export interface PropertyConfig {
    key: string;
    displayName: string;
    fieldConfig: Record<string, unknown>;
    templateDescription: string;
    formatter?: (value: any) => string;
    isSpecialCase?: boolean;
}

export interface UserInfo {
    userId: string;
    userName: string;
    userEmail: string;
}
