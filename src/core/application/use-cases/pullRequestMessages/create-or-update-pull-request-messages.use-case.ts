import { Inject, Injectable } from '@nestjs/common';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import {
    IPullRequestMessagesService,
    PULL_REQUEST_MESSAGES_SERVICE_TOKEN,
} from '@/core/domain/pullRequestMessages/contracts/pullRequestMessages.service.contract';
import { IPullRequestMessages } from '@/core/domain/pullRequestMessages/interfaces/pullRequestMessages.interface';
import { REQUEST } from '@nestjs/core';
import { ConfigLevel } from '@/config/types/general/pullRequestMessages.type';

@Injectable()
export class CreateOrUpdatePullRequestMessagesUseCase implements IUseCase {
    constructor(
        @Inject(PULL_REQUEST_MESSAGES_SERVICE_TOKEN)
        private readonly pullRequestMessagesService: IPullRequestMessagesService,

        @Inject(REQUEST)
        private readonly request: Request & {
            user: {
                organization: { uuid: string };
            };
        },
    ) {}

    async execute(pullRequestMessages: IPullRequestMessages): Promise<void> {
        if (!this.request.user.organization.uuid) {
            throw new Error('Organization ID not found');
        }

        pullRequestMessages.organizationId =
        this.request.user.organization.uuid;

        const existingPullRequestMessage = await this.pullRequestMessagesService.findById(
            pullRequestMessages.uuid,
        );

        if (existingPullRequestMessage) {
            await this.pullRequestMessagesService.update(pullRequestMessages);
            return;
        }

        if (pullRequestMessages?.repository?.id) {
            pullRequestMessages.configLevel = ConfigLevel.REPOSITORY;
        } else {
            pullRequestMessages.configLevel = ConfigLevel.GLOBAL;
        }

        await this.pullRequestMessagesService.create(pullRequestMessages);
    }
}
