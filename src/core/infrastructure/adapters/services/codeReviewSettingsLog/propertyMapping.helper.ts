import { PropertyConfig } from '@/config/types/general/codeReviewSettingsLog.type';

export const PROPERTY_CONFIGS: Record<string, PropertyConfig> = {
    //#region General
    'kodusConfigFileOverridesWebPreferences': {
        actionDescription: 'Config File Overrides Web Preferences',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}}',
    },
    'pullRequestApprovalActive': {
        actionDescription: 'Pull Request Approval',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}}',
    },
    'isRequestChangesActive': {
        actionDescription: 'Request Changes',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}}',
    },

    //Review Options
    'reviewOptions.security': {
        actionDescription: 'Security',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },
    'reviewOptions.code_style': {
        actionDescription: 'Code Style',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },
    'reviewOptions.kody_rules': {
        actionDescription: 'Kody Rules',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },
    'reviewOptions.refactoring': {
        actionDescription: 'Refactoring',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },
    'reviewOptions.error_handling': {
        actionDescription: 'Error Handling',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },
    'reviewOptions.maintainability': {
        actionDescription: 'Maintainability',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },
    'reviewOptions.breaking_changes': {
        actionDescription: 'Breaking Changes',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },
    'reviewOptions.potential_issues': {
        actionDescription: 'Potential Issues',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },
    'reviewOptions.documentation_and_comments': {
        actionDescription: 'Documentation and Comments',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },
    'reviewOptions.performance_and_optimization': {
        actionDescription: 'Performance and Optimization',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },

    'ignorePaths': {
        actionDescription: 'Ignored Paths',
        templateDescription:
            'User ({{userEmail}}) updated {{displayName}}',
        formatter: (value: string[]) => value?.join(', ') || 'none',
    },
    'ignoredTitleKeywords': {
        actionDescription: 'Ignored Title Keywords',
        templateDescription:
            'User ({{userEmail}}) updated {{displayName}}',
        formatter: (value: string[]) => value?.join(', ') || 'none',
    },
    'baseBranches': {
        actionDescription: 'Base Branches',
        templateDescription:
            'User ({{userEmail}}) updated {{displayName}}',
        formatter: (value: string[]) => value?.join(', ') || 'none',
    },
    'languageResultPrompt': {
        actionDescription: 'Language Result Prompt',
        templateDescription:
            'User {{userEmail}} changed {{displayName}} from {{oldValue}} to {{newValue}}',
    },
    //#endregion

    //#region Suggestion Control
    'suggestionControl.groupingMode': {
        actionDescription: 'Grouping Mode',
        templateDescription:
            'User {{userEmail}} changed {{displayName}} from {{oldValue}} to {{newValue}}',
    },
    'suggestionControl.limitationType': {
        actionDescription: 'Limitation Type',
        templateDescription:
            'User {{userEmail}} changed {{displayName}} from {{oldValue}} to {{newValue}}',
    },
    'suggestionControl.maxSuggestions': {
        actionDescription: 'Max Suggestions',
        templateDescription:
            'User {{userEmail}} changed {{displayName}} from {{oldValue}} to {{newValue}}',
    },
    'suggestionControl.severityLevelFilter': {
        actionDescription: 'Severity Level Filter',
        templateDescription:
            'User {{userEmail}} changed {{displayName}} from {{oldValue}} to {{newValue}}',
    },
    'suggestionControl.applyFiltersToKodyRules': {
        actionDescription: 'Apply Filters to Kody Rules',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}}',
    },
    //#endregion

    //#region PR Summary
    'summary.generatePRSummary': {
        actionDescription: 'Generate PR Summary',
        templateDescription:
            'User {{userEmail}} changed {{displayName}} from {{oldValue}} to {{newValue}}',
    },
    'summary.customInstructions': {
        actionDescription: 'Custom Instructions',
        templateDescription:
            'User {{userEmail}} updated {{displayName}}',
    },
    //#endregion

    //#region Kody Rules
    'kodyRulesGeneratorEnabled': {
        actionDescription: 'Kody Rules Generator',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}}',
    },
    //#endregion

    // Simple toggles
    'isCommitMode': {
        actionDescription: 'Commit Mode',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}}',
    },
};
