import { CreateOrUpdatePullRequestMessagesUseCase } from '@/core/application/use-cases/pullRequestMessages/create-or-update-pull-request-messages.use-case';
import { IPullRequestMessages } from '@/core/domain/pullRequestMessages/interfaces/pullRequestMessages.interface';
import { Body, Controller, Post } from '@nestjs/common';

@Controller('pull-request-messages')
export class PullRequestMessagesController {
    constructor(
        private readonly createOrUpdatePullRequestMessagesUseCase: CreateOrUpdatePullRequestMessagesUseCase,
    ) {}

    @Post('/')
    public async createOrUpdatePullRequestMessages(@Body() body: IPullRequestMessages) {
        return await this.createOrUpdatePullRequestMessagesUseCase.execute(body);
    }
}
