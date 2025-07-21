import {
    MenuItem,
    PropertyConfig,
    ValueType,
} from '@/config/types/general/codeReviewSettingsLog.type';

export const PROPERTY_CONFIGS: Record<string, PropertyConfig> = {
    //#region General
    'kodusConfigFileOverridesWebPreferences': {
        key: 'kodusConfigFileOverridesWebPreferences',
        displayName: 'Config File Overrides Web Preferences',
        valueType: ValueType.TOGGLE,
        templateDescription:
            'User {{userName}} ({{userEmail}}) {{action}} {{displayName}}',
    },
    'pullRequestApprovalActive': {
        key: 'pullRequestApprovalActive',
        displayName: 'Pull Request Approval',
        valueType: ValueType.TOGGLE,
        templateDescription:
            'User {{userName}} ({{userEmail}}) {{action}} {{displayName}}',
    },
    'isRequestChangesActive': {
        key: 'isRequestChangesActive',
        displayName: 'Request Changes',
        valueType: ValueType.TOGGLE,
        templateDescription:
            'User {{userName}} ({{userEmail}}) {{action}} {{displayName}}',
    },

    //Review Options
    'reviewOptions.security': {
        key: 'reviewOptions.security',
        displayName: 'Security',
        valueType: ValueType.TOGGLE,
        templateDescription:
            'User {{userName}} ({{userEmail}}) {{action}} {{displayName}} review option',
        menuItem: MenuItem.GENERAL,
    },
    'reviewOptions.code_style': {
        key: 'reviewOptions.code_style',
        displayName: 'Code Style',
        valueType: ValueType.TOGGLE,
        templateDescription:
            'User {{userName}} ({{userEmail}}) {{action}} {{displayName}} review option',
        menuItem: MenuItem.GENERAL,
    },
    'reviewOptions.kody_rules': {
        key: 'reviewOptions.kody_rules',
        displayName: 'Kody Rules',
        valueType: ValueType.TOGGLE,
        templateDescription:
            'User {{userName}} ({{userEmail}}) {{action}} {{displayName}} review option',
        menuItem: MenuItem.GENERAL,
    },
    'reviewOptions.refactoring': {
        key: 'reviewOptions.refactoring',
        displayName: 'Refactoring',
        valueType: ValueType.TOGGLE,
        templateDescription:
            'User {{userName}} ({{userEmail}}) {{action}} {{displayName}} review option',
        menuItem: MenuItem.GENERAL,
    },
    'reviewOptions.error_handling': {
        key: 'reviewOptions.error_handling',
        displayName: 'Error Handling',
        valueType: ValueType.TOGGLE,
        templateDescription:
            'User {{userName}} ({{userEmail}}) {{action}} {{displayName}} review option',
        menuItem: MenuItem.GENERAL,
    },
    'reviewOptions.maintainability': {
        key: 'reviewOptions.maintainability',
        displayName: 'Maintainability',
        valueType: ValueType.TOGGLE,
        templateDescription:
            'User {{userName}} ({{userEmail}}) {{action}} {{displayName}} review option',
        menuItem: MenuItem.GENERAL,
    },
    'reviewOptions.breaking_changes': {
        key: 'reviewOptions.breaking_changes',
        displayName: 'Breaking Changes',
        valueType: ValueType.TOGGLE,
        templateDescription:
            'User {{userName}} ({{userEmail}}) {{action}} {{displayName}} review option',
        menuItem: MenuItem.GENERAL,
    },
    'reviewOptions.potential_issues': {
        key: 'reviewOptions.potential_issues',
        displayName: 'Potential Issues',
        valueType: ValueType.TOGGLE,
        templateDescription:
            'User {{userName}} ({{userEmail}}) {{action}} {{displayName}} review option',
        menuItem: MenuItem.GENERAL,
    },
    'reviewOptions.documentation_and_comments': {
        key: 'reviewOptions.documentation_and_comments',
        displayName: 'Documentation and Comments',
        valueType: ValueType.TOGGLE,
        templateDescription:
            'User {{userName}} ({{userEmail}}) {{action}} {{displayName}} review option',
        menuItem: MenuItem.GENERAL,
    },
    'reviewOptions.performance_and_optimization': {
        key: 'reviewOptions.performance_and_optimization',
        displayName: 'Performance and Optimization',
        valueType: ValueType.TOGGLE,
        templateDescription:
            'User {{userName}} ({{userEmail}}) {{action}} {{displayName}} review option',
        menuItem: MenuItem.GENERAL,
    },

    'ignorePaths': {
        key: 'ignorePaths',
        displayName: 'Ignored Paths',
        valueType: ValueType.MULTI_SELECT,
        templateDescription:
            'User {{userName}} ({{userEmail}}) updated {{displayName}}',
        formatter: (value: string[]) => value?.join(', ') || 'none',
    },
    'ignoredTitleKeywords': {
        key: 'ignoredTitleKeywords',
        displayName: 'Ignored Title Keywords',
        valueType: ValueType.MULTI_SELECT,
        templateDescription:
            'User {{userName}} ({{userEmail}}) updated {{displayName}}',
        formatter: (value: string[]) => value?.join(', ') || 'none',
    },
    'baseBranches': {
        key: 'baseBranches',
        displayName: 'Base Branches',
        valueType: ValueType.MULTI_SELECT,
        templateDescription:
            'User {{userName}} ({{userEmail}}) updated {{displayName}}',
        formatter: (value: string[]) => value?.join(', ') || 'none',
    },
    'languageResultPrompt': {
        key: 'languageResultPrompt',
        displayName: 'Language Result Prompt',
        valueType: ValueType.DROPDOWN,
        templateDescription:
            'User {{userName}} ({{userEmail}}) changed {{displayName}} from {{oldValue}} to {{newValue}}',
    },
    //#endregion

    //#region Suggestion Control
    'suggestionControl.groupingMode': {
        key: 'suggestionControl.groupingMode',
        displayName: 'Grouping Mode',
        valueType: ValueType.DROPDOWN,
        templateDescription:
            'User {{userName}} ({{userEmail}}) changed {{displayName}} from {{oldValue}} to {{newValue}}',
        menuItem: MenuItem.SUGGESTION_CONTROL,
    },
    'suggestionControl.limitationType': {
        key: 'suggestionControl.limitationType',
        displayName: 'Limitation Type',
        valueType: ValueType.DROPDOWN,
        templateDescription:
            'User {{userName}} ({{userEmail}}) changed {{displayName}} from {{oldValue}} to {{newValue}}',
        menuItem: MenuItem.SUGGESTION_CONTROL,
    },
    'suggestionControl.maxSuggestions': {
        key: 'suggestionControl.maxSuggestions',
        displayName: 'Max Suggestions',
        valueType: ValueType.NUMBER,
        templateDescription:
            'User {{userName}} ({{userEmail}}) changed {{displayName}} from {{oldValue}} to {{newValue}}',
        menuItem: MenuItem.SUGGESTION_CONTROL,
    },
    'suggestionControl.severityLevelFilter': {
        key: 'suggestionControl.severityLevelFilter',
        displayName: 'Severity Level Filter',
        valueType: ValueType.DROPDOWN,
        templateDescription:
            'User {{userName}} ({{userEmail}}) changed {{displayName}} from {{oldValue}} to {{newValue}}',
        menuItem: MenuItem.SUGGESTION_CONTROL,
    },
    'suggestionControl.applyFiltersToKodyRules': {
        key: 'suggestionControl.applyFiltersToKodyRules',
        displayName: 'Apply Filters to Kody Rules',
        valueType: ValueType.TOGGLE,
        templateDescription:
            'User {{userName}} ({{userEmail}}) {{action}} {{displayName}}',
        menuItem: MenuItem.SUGGESTION_CONTROL,
    },
    //#endregion

    //#region PR Summary
    'summary.generatePRSummary': {
        key: 'summary.generatePRSummary',
        displayName: 'Generate PR Summary',
        valueType: ValueType.TOGGLE,
        templateDescription:
            'User {{userName}} ({{userEmail}}) changed {{displayName}} from {{oldValue}} to {{newValue}}',
        menuItem: MenuItem.PR_SUMMARY,
    },
    'summary.behaviourForExistingDescription': {
        key: 'summary.behaviourForExistingDescription',
        displayName: 'Behaviour for Existing Description',
        valueType: ValueType.RADIO_BUTTON,
        templateDescription:
            'User {{userName}} ({{userEmail}}) changed {{displayName}} from {{oldValue}} to {{newValue}}',
        formatter: (value: string) => {
            const labels = {
                concatenate: 'Concatenate',
                complement: 'Complement',
                replace: 'Replace',
            };
            return labels[value] || value;
        },
        menuItem: MenuItem.PR_SUMMARY,
    },
    'summary.customInstructions': {
        key: 'summary.customInstructions',
        displayName: 'Custom Instructions',
        valueType: ValueType.TEXT,
        templateDescription:
            'User {{userName}} ({{userEmail}}) updated {{displayName}}',
        menuItem: MenuItem.PR_SUMMARY,
    },
    //#endregion

    //#region Kody Rules
    'kodyRulesGeneratorEnabled': {
        key: 'kodyRulesGeneratorEnabled',
        displayName: 'Kody Rules Generator',
        valueType: ValueType.TOGGLE,
        templateDescription:
            'User {{userName}} ({{userEmail}}) {{action}} {{displayName}}',
    },
    //#endregion

    // Simple toggles
    'isCommitMode': {
        key: 'isCommitMode',
        displayName: 'Commit Mode',
        valueType: ValueType.TOGGLE,
        templateDescription:
            'User {{userName}} ({{userEmail}}) {{action}} {{displayName}}',
    },
};
