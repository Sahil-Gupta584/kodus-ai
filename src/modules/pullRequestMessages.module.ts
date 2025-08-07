import { PullRequestMessagesUseCases } from '@/core/application/use-cases/pullRequestMessages';
import { PULL_REQUEST_MESSAGES_REPOSITORY_TOKEN } from '@/core/domain/pullRequestMessages/contracts/pullRequestMessages.repository.contract';
import { PULL_REQUEST_MESSAGES_SERVICE_TOKEN } from '@/core/domain/pullRequestMessages/contracts/pullRequestMessages.service.contract';
import { PullRequestMessagesRepository } from '@/core/infrastructure/adapters/repositories/mongoose/pullRequestMessages.repository';
import { PullRequestMessagesModelInstance } from '@/core/infrastructure/adapters/repositories/mongoose/schema';
import { PullRequestMessagesService } from '@/core/infrastructure/adapters/services/pullRequestMessages/pullRequestMessages.service';
import { PullRequestMessagesController } from '@/core/infrastructure/http/controllers/pullRequestMessages.controller';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CodeReviewSettingsLogModule } from './codeReviewSettingsLog.module';
import { CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN } from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.service.contract';
import { CodeReviewSettingsLogService } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/codeReviewSettingsLog.service';
import { GetDirectoryPathHelper } from '@/shared/utils/helpers/getDirectoryPath.helper';
import { IntegrationModule } from './integration.module';
import { IntegrationConfigModule } from './integrationConfig.module';
import { ParametersModule } from './parameters.module';

@Module({
    imports: [
        MongooseModule.forFeature([PullRequestMessagesModelInstance]),
        forwardRef(() => CodeReviewSettingsLogModule),
        forwardRef(() => IntegrationModule),
        forwardRef(() => IntegrationConfigModule),
        forwardRef(() => ParametersModule),
    ],
    providers: [
        {
            provide: PULL_REQUEST_MESSAGES_REPOSITORY_TOKEN,
            useClass: PullRequestMessagesRepository,
        },
        {
            provide: PULL_REQUEST_MESSAGES_SERVICE_TOKEN,
            useClass: PullRequestMessagesService,
        },
        {
            provide: CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN,
            useClass: CodeReviewSettingsLogService,
        },
        GetDirectoryPathHelper,
        ...PullRequestMessagesUseCases,
    ],
    exports: [
        PULL_REQUEST_MESSAGES_REPOSITORY_TOKEN,
        PULL_REQUEST_MESSAGES_SERVICE_TOKEN,
        CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN,
    ],
    controllers: [PullRequestMessagesController],
})
export class PullRequestMessagesModule {}
