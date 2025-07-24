import { PropertyConfig } from '@/config/types/general/codeReviewSettingsLog.type';

export const PROPERTY_CONFIGS: Record<string, PropertyConfig> = {
    //#region General
    'kodusConfigFileOverridesWebPreferences': {
        key: 'kodusConfigFileOverridesWebPreferences',
        displayName: 'Config File Overrides Web Preferences',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}}',
    },
    'pullRequestApprovalActive': {
        key: 'pullRequestApprovalActive',
        displayName: 'Pull Request Approval',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}}',
    },
    'isRequestChangesActive': {
        key: 'isRequestChangesActive',
        displayName: 'Request Changes',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}}',
    },

    //Review Options
    'reviewOptions.security': {
        key: 'reviewOptions.security',
        displayName: 'Security',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },
    'reviewOptions.code_style': {
        key: 'reviewOptions.code_style',
        displayName: 'Code Style',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },
    'reviewOptions.kody_rules': {
        key: 'reviewOptions.kody_rules',
        displayName: 'Kody Rules',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },
    'reviewOptions.refactoring': {
        key: 'reviewOptions.refactoring',
        displayName: 'Refactoring',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },
    'reviewOptions.error_handling': {
        key: 'reviewOptions.error_handling',
        displayName: 'Error Handling',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },
    'reviewOptions.maintainability': {
        key: 'reviewOptions.maintainability',
        displayName: 'Maintainability',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },
    'reviewOptions.breaking_changes': {
        key: 'reviewOptions.breaking_changes',
        displayName: 'Breaking Changes',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },
    'reviewOptions.potential_issues': {
        key: 'reviewOptions.potential_issues',
        displayName: 'Potential Issues',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },
    'reviewOptions.documentation_and_comments': {
        key: 'reviewOptions.documentation_and_comments',
        displayName: 'Documentation and Comments',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },
    'reviewOptions.performance_and_optimization': {
        key: 'reviewOptions.performance_and_optimization',
        displayName: 'Performance and Optimization',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}} review option',
    },

    'ignorePaths': {
        key: 'ignorePaths',
        displayName: 'Ignored Paths',
        templateDescription:
            'User   ({{userEmail}}) updated {{displayName}}',
        formatter: (value: string[]) => value?.join(', ') || 'none',
    },
    'ignoredTitleKeywords': {
        key: 'ignoredTitleKeywords',
        displayName: 'Ignored Title Keywords',
        templateDescription:
            'User   ({{userEmail}}) updated {{displayName}}',
        formatter: (value: string[]) => value?.join(', ') || 'none',
    },
    'baseBranches': {
        key: 'baseBranches',
        displayName: 'Base Branches',
        templateDescription:
            'User   ({{userEmail}}) updated {{displayName}}',
        formatter: (value: string[]) => value?.join(', ') || 'none',
    },
    'languageResultPrompt': {
        key: 'languageResultPrompt',
        displayName: 'Language Result Prompt',
        templateDescription:
            'User {{userEmail}} changed {{displayName}} from {{oldValue}} to {{newValue}}',
    },
    //#endregion

    //#region Suggestion Control
    'suggestionControl.groupingMode': {
        key: 'suggestionControl.groupingMode',
        displayName: 'Grouping Mode',
        templateDescription:
            'User {{userEmail}} changed {{displayName}} from {{oldValue}} to {{newValue}}',
    },
    'suggestionControl.limitationType': {
        key: 'suggestionControl.limitationType',
        displayName: 'Limitation Type',
        templateDescription:
            'User {{userEmail}} changed {{displayName}} from {{oldValue}} to {{newValue}}',
    },
    'suggestionControl.maxSuggestions': {
        key: 'suggestionControl.maxSuggestions',
        displayName: 'Max Suggestions',
        templateDescription:
            'User {{userEmail}} changed {{displayName}} from {{oldValue}} to {{newValue}}',
    },
    'suggestionControl.severityLevelFilter': {
        key: 'suggestionControl.severityLevelFilter',
        displayName: 'Severity Level Filter',
        templateDescription:
            'User {{userEmail}} changed {{displayName}} from {{oldValue}} to {{newValue}}',
    },
    'suggestionControl.applyFiltersToKodyRules': {
        key: 'suggestionControl.applyFiltersToKodyRules',
        displayName: 'Apply Filters to Kody Rules',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}}',
    },
    //#endregion

    //#region PR Summary
    'summary.generatePRSummary': {
        key: 'summary.generatePRSummary',
        displayName: 'Generate PR Summary',
        templateDescription:
            'User {{userEmail}} changed {{displayName}} from {{oldValue}} to {{newValue}}',
    },
    'summary.behaviourForExistingDescription': {
        key: 'summary.behaviourForExistingDescription',
        displayName: 'Behaviour for Existing Description',
        templateDescription:
            'User {{userEmail}} changed {{displayName}} from {{oldValue}} to {{newValue}}',
        formatter: (value: string) => {
            const labels = {
                concatenate: 'Concatenate',
                complement: 'Complement',
                replace: 'Replace',
            };
            return labels[value] || value;
        },
    },
    'summary.customInstructions': {
        key: 'summary.customInstructions',
        displayName: 'Custom Instructions',
        templateDescription:
            'User {{userEmail}} updated {{displayName}}',
    },
    //#endregion

    //#region Kody Rules
    'kodyRulesGeneratorEnabled': {
        key: 'kodyRulesGeneratorEnabled',
        displayName: 'Kody Rules Generator',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}}',
    },
    //#endregion

    // Simple toggles
    'isCommitMode': {
        key: 'isCommitMode',
        displayName: 'Commit Mode',
        templateDescription:
            'User {{userEmail}} {{action}} {{displayName}}',
    },
};
