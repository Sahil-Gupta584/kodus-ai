import { Body, Controller, Post } from '@nestjs/common';
import { RegisterUserStatusLogUseCase } from '@/core/application/use-cases/user/register-user-status-log.use-case';
import { UserStatusDto } from '../dtos/user-status-change.dto';

@Controller('user-log')
export class CodeReviewSettingLogController {
    constructor(
        private readonly registerUserStatusLogUseCase: RegisterUserStatusLogUseCase,
    ) {}

    @Post('/status-change')
    public async registerStatusChange(@Body() body: UserStatusDto): Promise<void> {
        return await this.registerUserStatusLogUseCase.execute(body);
    }
}
