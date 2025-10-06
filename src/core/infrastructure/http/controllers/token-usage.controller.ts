import { Inject } from '@nestjs/common';
import { ITokenUsageService, TOKEN_USAGE_SERVICE_TOKEN } from '@/core/domain/tokenUsage/contracts/token-usage.service.contract';
import { TokenUsageQueryDto, DailyTokenUsage, TokenUsageSummary } from '@/core/infrastructure/http/dtos/token-usage.dto';
import { TokenUsageQueryContract } from '@/core/domain/tokenUsage/contracts/token-usage.repository.contract';
import { Query, Controller, Get } from '@nestjs/common';

@Controller('usage')
export class TokenUsageController {
    constructor(
        @Inject(TOKEN_USAGE_SERVICE_TOKEN)
        private readonly tokenUsageService: ITokenUsageService,
    ) {}

    @Get('tokens/daily')
    async getDaily(@Query() query: TokenUsageQueryDto): Promise<DailyTokenUsage[]> {
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

    private mapDtoToContract(query: TokenUsageQueryDto): TokenUsageQueryContract {
        const start = new Date(query.startDate);
        const end = new Date(query.endDate);

        if (
            !Number.isNaN(end.getTime()) &&
            end.getUTCHours() === 0 &&
            end.getUTCMinutes() === 0 &&
            end.getUTCSeconds() === 0 &&
            end.getUTCMilliseconds() === 0
        ) {
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
