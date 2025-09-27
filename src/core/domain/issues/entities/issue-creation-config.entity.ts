import { SeverityLevel } from '@/shared/utils/enums/severityLevel.enum';

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