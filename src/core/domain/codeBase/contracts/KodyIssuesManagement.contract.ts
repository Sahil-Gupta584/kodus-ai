export const KODY_ISSUES_MANAGEMENT_SERVICE_TOKEN = Symbol(
    'KodyIssuesManagementService',
);

export interface IKodyIssuesManagementService {
    processClosedPr(params: {
        prNumber: number;
        organizationId: string;
        repositoryId: string;
        repositoryName: string;
    }): Promise<void>;

    mergeSuggestionsIntoIssues(
        organizationId: string,
        repositoryId: string,
        filePath: string,
        newSuggestions: any[],
    ): Promise<any>;

    createNewIssues(
        organizationId: string,
        repositoryId: string,
        unmatchedSuggestions: any[],
    ): Promise<void>;

    resolveExistingIssues(
        organizationId: string,
        repositoryId: string,
        files: any[],
        changedFiles: string[],
    ): Promise<void>;
}
