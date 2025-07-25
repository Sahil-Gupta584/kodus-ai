import { Body, Controller, Post } from '@nestjs/common';
import { UserStatusChangeDto } from '../dtos/user-status-change.dto';
import { RegisterUserStatusLogUseCase } from '@/core/application/use-cases/user/register-user-status-log.use-case';

@Controller('user-log')
export class CodeReviewSettingLogController {
    constructor(
        private readonly registerUserStatusLogUseCase: RegisterUserStatusLogUseCase,
    ) {}

    @Post('/status-change')
    public async registerStatusChange(@Body() body: UserStatusChangeDto): Promise<void> {
        return await this.registerUserStatusLogUseCase.execute(body);
    }
}
