import { Inject, Injectable } from '@nestjs/common';
import type {
    DailyUsageResultContract,
    TokenUsageQueryContract,
    UsageSummaryContract,
} from '@/core/domain/tokenUsage/contracts/token-usage.repository.contract';
import {
    ITokenUsageService,
    TOKEN_USAGE_SERVICE_TOKEN,
} from '@/core/domain/tokenUsage/contracts/token-usage.service.contract';
import {
    ITokenUsageRepository,
    TOKEN_USAGE_REPOSITORY_TOKEN,
} from '@/core/domain/tokenUsage/contracts/token-usage.repository.contract';

@Injectable()
export class TokenUsageService implements ITokenUsageService {
    constructor(
        @Inject(TOKEN_USAGE_REPOSITORY_TOKEN)
        private readonly repository: ITokenUsageRepository,
    ) {}

    async getDailyUsage(
        query: TokenUsageQueryContract,
    ): Promise<DailyUsageResultContract[]> {
        return this.repository.getDailyUsage(query);
    }

    async getSummary(
        query: TokenUsageQueryContract,
    ): Promise<UsageSummaryContract> {
        return this.repository.getSummary(query);
    }
}
