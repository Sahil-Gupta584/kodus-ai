import { PropertyConfig } from '@/config/types/general/codeReviewSettingsLog.type';

export const PROPERTY_CONFIGS: Record<string, PropertyConfig> = {
    //#region General
    'kodusConfigFileOverridesWebPreferences': {
        key: 'kodusConfigFileOverridesWebPreferences',
        displayName: 'Config File Overrides Web Preferences',
        fieldConfig: { valueType: 'toggle' },
        templateDescription:
            'User {{userEmail}}{{userName}}{{action}} {{displayName}}',
    },
    'pullRequestApprovalActive': {
        key: 'pullRequestApprovalActive',
        displayName: 'Pull Request Approval',
        fieldConfig: { valueType: 'toggle' },
        templateDescription:
            'User {{userEmail}}{{userName}}{{action}} {{displayName}}',
    },
    'isRequestChangesActive': {
        key: 'isRequestChangesActive',
        displayName: 'Request Changes',
        fieldConfig: { valueType: 'toggle' },
        templateDescription:
            'User {{userEmail}}{{userName}}{{action}} {{displayName}}',
    },

    //Review Options
    'reviewOptions.security': {
        key: 'reviewOptions.security',
        displayName: 'Security',
        fieldConfig: { valueType: 'toggle' },
        templateDescription:
            'User {{userEmail}}{{userName}}{{action}} {{displayName}} review option',
    },
    'reviewOptions.code_style': {
        key: 'reviewOptions.code_style',
        displayName: 'Code Style',
        fieldConfig: { valueType: 'toggle' },
        templateDescription:
            'User {{userEmail}}{{userName}}{{action}} {{displayName}} review option',
    },
    'reviewOptions.kody_rules': {
        key: 'reviewOptions.kody_rules',
        displayName: 'Kody Rules',
        fieldConfig: { valueType: 'toggle' },
        templateDescription:
            'User {{userEmail}}{{userName}}{{action}} {{displayName}} review option',
    },
    'reviewOptions.refactoring': {
        key: 'reviewOptions.refactoring',
        displayName: 'Refactoring',
        fieldConfig: { valueType: 'toggle' },
        templateDescription:
            'User {{userEmail}}{{userName}}{{action}} {{displayName}} review option',
    },
    'reviewOptions.error_handling': {
        key: 'reviewOptions.error_handling',
        displayName: 'Error Handling',
        fieldConfig: { valueType: 'toggle' },
        templateDescription:
            'User {{userEmail}}{{userName}}{{action}} {{displayName}} review option',
    },
    'reviewOptions.maintainability': {
        key: 'reviewOptions.maintainability',
        displayName: 'Maintainability',
        fieldConfig: { valueType: 'toggle' },
        templateDescription:
            'User {{userEmail}}{{userName}}{{action}} {{displayName}} review option',
    },
    'reviewOptions.breaking_changes': {
        key: 'reviewOptions.breaking_changes',
        displayName: 'Breaking Changes',
        fieldConfig: { valueType: 'toggle' },
        templateDescription:
            'User {{userEmail}}{{userName}}{{action}} {{displayName}} review option',
    },
    'reviewOptions.potential_issues': {
        key: 'reviewOptions.potential_issues',
        displayName: 'Potential Issues',
        fieldConfig: { valueType: 'toggle' },
        templateDescription:
            'User {{userEmail}}{{userName}}{{action}} {{displayName}} review option',
    },
    'reviewOptions.documentation_and_comments': {
        key: 'reviewOptions.documentation_and_comments',
        displayName: 'Documentation and Comments',
        fieldConfig: { valueType: 'toggle' },
        templateDescription:
            'User {{userEmail}}{{userName}}{{action}} {{displayName}} review option',
    },
    'reviewOptions.performance_and_optimization': {
        key: 'reviewOptions.performance_and_optimization',
        displayName: 'Performance and Optimization',
        fieldConfig: { valueType: 'toggle' },
        templateDescription:
            'User {{userEmail}}{{userName}}{{action}} {{displayName}} review option',
    },

    'ignorePaths': {
        key: 'ignorePaths',
        displayName: 'Ignored Paths',
        fieldConfig: { valueType: 'multi_select' },
        templateDescription:
            'User {{userName}} ({{userEmail}}) updated {{displayName}}',
        formatter: (value: string[]) => value?.join(', ') || 'none',
    },
    'ignoredTitleKeywords': {
        key: 'ignoredTitleKeywords',
        displayName: 'Ignored Title Keywords',
        fieldConfig: { valueType: 'multi_select' },
        templateDescription:
            'User {{userName}} ({{userEmail}}) updated {{displayName}}',
        formatter: (value: string[]) => value?.join(', ') || 'none',
    },
    'baseBranches': {
        key: 'baseBranches',
        displayName: 'Base Branches',
        fieldConfig: { valueType: 'multi_select' },
        templateDescription:
            'User {{userName}} ({{userEmail}}) updated {{displayName}}',
        formatter: (value: string[]) => value?.join(', ') || 'none',
    },
    'languageResultPrompt': {
        key: 'languageResultPrompt',
        displayName: 'Language Result Prompt',
        fieldConfig: { valueType: 'dropdown' },
        templateDescription:
            'User {{userName}} ({{userEmail}}) changed {{displayName}} from {{oldValue}} to {{newValue}}',
    },
    //#endregion

    //#region Suggestion Control
    'suggestionControl.groupingMode': {
        key: 'suggestionControl.groupingMode',
        displayName: 'Grouping Mode',
        fieldConfig: { valueType: 'dropdown' },
        templateDescription:
            'User {{userName}} ({{userEmail}}) changed {{displayName}} from {{oldValue}} to {{newValue}}',
    },
    'suggestionControl.limitationType': {
        key: 'suggestionControl.limitationType',
        displayName: 'Limitation Type',
        fieldConfig: { valueType: 'dropdown' },
        templateDescription:
            'User {{userName}} ({{userEmail}}) changed {{displayName}} from {{oldValue}} to {{newValue}}',
    },
    'suggestionControl.maxSuggestions': {
        key: 'suggestionControl.maxSuggestions',
        displayName: 'Max Suggestions',
        fieldConfig: { valueType: 'number' },
        templateDescription:
            'User {{userName}} ({{userEmail}}) changed {{displayName}} from {{oldValue}} to {{newValue}}',
    },
    'suggestionControl.severityLevelFilter': {
        key: 'suggestionControl.severityLevelFilter',
        displayName: 'Severity Level Filter',
        fieldConfig: { valueType: 'dropdown' },
        templateDescription:
            'User {{userName}} ({{userEmail}}) changed {{displayName}} from {{oldValue}} to {{newValue}}',
    },
    'suggestionControl.applyFiltersToKodyRules': {
        key: 'suggestionControl.applyFiltersToKodyRules',
        displayName: 'Apply Filters to Kody Rules',
        fieldConfig: { valueType: 'toggle' },
        templateDescription:
            'User {{userEmail}}{{userName}}{{action}} {{displayName}}',
    },
    //#endregion

    //#region PR Summary
    'summary.generatePRSummary': {
        key: 'summary.generatePRSummary',
        displayName: 'Generate PR Summary',
        fieldConfig: { valueType: 'toggle' },
        templateDescription:
            'User {{userName}} ({{userEmail}}) changed {{displayName}} from {{oldValue}} to {{newValue}}',
    },
    'summary.behaviourForExistingDescription': {
        key: 'summary.behaviourForExistingDescription',
        displayName: 'Behaviour for Existing Description',
        fieldConfig: { valueType: 'radio_button' },
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
    },
    'summary.customInstructions': {
        key: 'summary.customInstructions',
        displayName: 'Custom Instructions',
        fieldConfig: { valueType: 'text' },
        templateDescription:
            'User {{userName}} ({{userEmail}}) updated {{displayName}}',
    },
    //#endregion

    //#region Kody Rules
    'kodyRulesGeneratorEnabled': {
        key: 'kodyRulesGeneratorEnabled',
        displayName: 'Kody Rules Generator',
        fieldConfig: { valueType: 'toggle' },
        templateDescription:
            'User {{userEmail}}{{userName}}{{action}} {{displayName}}',
    },
    //#endregion

    // Simple toggles
    'isCommitMode': {
        key: 'isCommitMode',
        displayName: 'Commit Mode',
        fieldConfig: { valueType: 'toggle' },
        templateDescription:
            'User {{userEmail}}{{userName}}{{action}} {{displayName}}',
    },
};
