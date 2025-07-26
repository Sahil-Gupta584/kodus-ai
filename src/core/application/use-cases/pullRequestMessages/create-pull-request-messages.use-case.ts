import { Injectable } from '@nestjs/common';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { IPullRequestMessagesService } from '@/core/domain/pullRequestMessages/contracts/pullRequestMessages.service.contract';
import { IPullRequestMessages } from '@/core/domain/pullRequestMessages/interfaces/pullRequestMessages.interface';

@Injectable()
export class CreatePullRequestMessagesUseCase implements IUseCase {
    constructor(
        private readonly pullRequestMessagesService: IPullRequestMessagesService,
    ) {}

    async execute(pullRequestMessages: IPullRequestMessages): Promise<void> {
        await this.pullRequestMessagesService.create(pullRequestMessages);
    }
}
