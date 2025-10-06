export const TOKEN_USAGE_REPOSITORY_TOKEN = Symbol('TokenUsageRepository');

export type TokenUsageQueryContract = {
    organizationId: string;
    start: Date;
    end: Date;
    prNumber?: number;
    timezone?: string; // for day bucketing
};

export type DailyUsageResultContract = {
    date: string; // YYYY-MM-DD
    input: number;
    output: number;
    total: number;
    outputReasoning: number;
};

export type UsageSummaryContract = {
    input: number;
    output: number;
    total: number;
    outputReasoning: number;
};

export interface ITokenUsageRepository {
    getDailyUsage(
        query: TokenUsageQueryContract,
    ): Promise<DailyUsageResultContract[]>;

    getSummary(query: TokenUsageQueryContract): Promise<UsageSummaryContract>;
}

