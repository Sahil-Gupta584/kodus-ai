import { Inject } from '@nestjs/common';
import {
    ITokenUsageService,
    TOKEN_USAGE_SERVICE_TOKEN,
} from '@/core/domain/tokenUsage/contracts/tokenUsage.service.contract';
import {
    TokenUsageQueryDto,
    DailyTokenUsage,
    TokenUsageSummary,
} from '@/core/infrastructure/http/dtos/token-usage.dto';
import { TokenUsageQueryContract } from '@/core/domain/tokenUsage/contracts/tokenUsage.repository.contract';
import { Query, Controller, Get } from '@nestjs/common';

@Controller('usage')
export class TokenUsageController {
    constructor(
        @Inject(TOKEN_USAGE_SERVICE_TOKEN)
        private readonly tokenUsageService: ITokenUsageService,
    ) {}

    @Get('tokens/daily')
    async getDaily(
        @Query() query: TokenUsageQueryDto,
    ): Promise<DailyTokenUsage[]> {
        const mapped = this.mapDtoToContract(query);
        return this.tokenUsageService.getDailyUsage(mapped);
    }

    @Get('tokens/summary')
    async getSummary(
        @Query() query: TokenUsageQueryDto,
    ): Promise<TokenUsageSummary> {
        const mapped = this.mapDtoToContract(query);
        return this.tokenUsageService.getSummary(mapped);
    }

    // debug endpoint removed

    private mapDtoToContract(
        query: TokenUsageQueryDto,
    ): TokenUsageQueryContract {
        const start = new Date(query.startDate);
        const end = new Date(query.endDate);

        // Detect if the original strings include an explicit time component
        const startDateHasTime =
            query.startDate?.includes('T') || query.startDate?.includes(':');
        const endDateHasTime =
            query.endDate?.includes('T') || query.endDate?.includes(':');

        // Normalize date-only inputs to UTC day boundaries
        if (!Number.isNaN(start.getTime()) && !startDateHasTime) {
            start.setUTCHours(0, 0, 0, 0);
        }
        if (!Number.isNaN(end.getTime()) && !endDateHasTime) {
            end.setUTCHours(23, 59, 59, 999);
        }

        return {
            organizationId: query.organizationId,
            prNumber: query.prNumber,
            start,
            end,
            timezone: query.timezone || 'UTC',
        };
    }
}
