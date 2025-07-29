import { PullRequestMessagesUseCases } from '@/core/application/use-cases/pullRequestMessages';
import { PULL_REQUEST_MESSAGES_REPOSITORY_TOKEN } from '@/core/domain/pullRequestMessages/contracts/pullRequestMessages.repository.contract';
import { PULL_REQUEST_MESSAGES_SERVICE_TOKEN } from '@/core/domain/pullRequestMessages/contracts/pullRequestMessages.service.contract';
import { PullRequestMessagesRepository } from '@/core/infrastructure/adapters/repositories/mongoose/pullRequestMessages.repository';
import { PullRequestMessagesModelInstance } from '@/core/infrastructure/adapters/repositories/mongoose/schema';
import { PullRequestMessagesService } from '@/core/infrastructure/adapters/services/pullRequestMessages/pullRequestMessages.service';
import { PullRequestMessagesController } from '@/core/infrastructure/http/controllers/pullRequestMessages.controller';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
    imports: [MongooseModule.forFeature([PullRequestMessagesModelInstance])],
    providers: [
        {
            provide: PULL_REQUEST_MESSAGES_REPOSITORY_TOKEN,
            useClass: PullRequestMessagesRepository,
        },
        {
            provide: PULL_REQUEST_MESSAGES_SERVICE_TOKEN,
            useClass: PullRequestMessagesService,
        },
        ...PullRequestMessagesUseCases,
    ],
    exports: [
        PULL_REQUEST_MESSAGES_REPOSITORY_TOKEN,
        PULL_REQUEST_MESSAGES_SERVICE_TOKEN,
    ],
    controllers: [PullRequestMessagesController],
})
export class PullRequestMessagesModule {}
