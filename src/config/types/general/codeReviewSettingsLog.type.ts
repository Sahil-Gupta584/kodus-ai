export enum ActionType {
    ADD = 'add',
    CREATE = 'create',
    EDIT = 'edit',
    DELETE = 'delete',
}

export enum MenuItem {
    GIT_SETTINGS = 'git_settings',
    SUBSCRIPTION = 'subscription',
    CODE_REVIEW_SETTINGS_GLOBAL = 'code_review_settings_global',
    CODE_REVIEW_SETTINGS_REPOSITORY = 'code_review_settings_repository',
    GENERAL = 'general',
    SUGGESTION_CONTROL = 'suggestion_control',
    PR_SUMMARY = 'pr_summary',
    KODY_RULES = 'kody_rules',
}

export enum ConfigLevel {
    MAIN = 'main',
    GLOBAL = 'global',
    REPOSITORY = 'repository',
}

export enum ValueType {
    BOOLEAN = 'boolean',
    DROPDOWN = 'dropdown',
    KODY_RULES = 'kody_rules',
    MULTI_SELECT = 'multi_select',
    NUMBER = 'number',
    RADIO_BUTTON = 'radio_button',
    SLIDER = 'slider',
    TEXT = 'text',
    TOGGLE = 'toggle',
    TOGGLE_WITH_RADIO = 'toggle_with_radio',
    TOGGLE_WITH_SELECT = 'toggle_with_select',
}

export type ChangedData = {
    key: string;
    displayName: string;
    previousValue: any;
    currentValue: any;
    valueType: ValueType;
    description: string;
};

export interface PropertyConfig {
    key: string;
    displayName: string;
    valueType: ValueType;
    templateDescription: string;
    formatter?: (value: any) => string;
    isSpecialCase?: boolean;
    menuItem?: MenuItem;
}

export interface UserInfo {
    userId: string;
    userName: string;
    userEmail: string;
}
