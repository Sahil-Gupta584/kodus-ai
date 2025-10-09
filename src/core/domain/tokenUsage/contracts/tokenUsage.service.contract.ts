import type {
    DailyUsageResultContract,
    ITokenUsageRepository,
    TokenUsageQueryContract,
    UsageSummaryContract,
} from './tokenUsage.repository.contract';

export const TOKEN_USAGE_SERVICE_TOKEN = Symbol('TokenUsageService');

export interface ITokenUsageService
    extends Pick<ITokenUsageRepository, 'getDailyUsage' | 'getSummary'> {
    getDailyUsage(
        query: TokenUsageQueryContract,
    ): Promise<DailyUsageResultContract[]>;

    getSummary(query: TokenUsageQueryContract): Promise<UsageSummaryContract>;
}
