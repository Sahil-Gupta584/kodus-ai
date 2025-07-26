import { CreatePullRequestMessagesUseCase } from '@/core/application/use-cases/pullRequestMessages/create-pull-request-messages.use-case';
import { IPullRequestMessages } from '@/core/domain/pullRequestMessages/interfaces/pullRequestMessages.interface';
import { Body, Controller, Post } from '@nestjs/common';

@Controller('pull-request-messages')
export class PullRequestMessagesController {
    constructor(
        private readonly createPullRequestMessagesUseCase: CreatePullRequestMessagesUseCase,
    ) {}

    @Post('/')
    public async createPullRequestMessages(@Body() body: IPullRequestMessages) {
        return await this.createPullRequestMessagesUseCase.execute(body);
    }
}
