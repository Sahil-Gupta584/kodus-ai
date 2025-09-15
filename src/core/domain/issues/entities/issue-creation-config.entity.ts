import { SeverityLevel } from "@sentry/node";

export interface IssueCreationConfig {
    automaticCreationEnabled: boolean;
    sourceFilters: {
        includeKodyRules: boolean;
        includeCodeReviewEngine: boolean;
    };
    severityFilters: {
        minimumSeverity: SeverityLevel;
        allowedSeverities: SeverityLevel[];
    };
    organizationId: string;
    teamId?: string;
}   