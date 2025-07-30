import { Body, Controller, Post, Get, Query } from '@nestjs/common';
import { RegisterUserStatusLogUseCase } from '@/core/application/use-cases/user/register-user-status-log.use-case';
import { FindCodeReviewSettingsLogsUseCase } from '@/core/application/use-cases/codeReviewSettingsLog/find-code-review-settings-logs.use-case';
import { UserStatusDto } from '../dtos/user-status-change.dto';
import { CodeReviewSettingsLogFiltersDto } from '../dtos/code-review-settings-log-filters.dto';

@Controller('user-log')
export class CodeReviewSettingLogController {
    constructor(
        private readonly registerUserStatusLogUseCase: RegisterUserStatusLogUseCase,
        private readonly findCodeReviewSettingsLogsUseCase: FindCodeReviewSettingsLogsUseCase,
    ) {}

    @Post('/status-change')
    public async registerStatusChange(@Body() body: UserStatusDto): Promise<void> {
        return await this.registerUserStatusLogUseCase.execute(body);
    }

    @Get('/code-review-settings')
    public async findCodeReviewSettingsLogs(
        @Query() filters: CodeReviewSettingsLogFiltersDto,
    ) {
        return await this.findCodeReviewSettingsLogsUseCase.execute(filters);
    }
}
