import { CodeReviewSettingsLogRepository } from '@/ee/codeReviewSettingsLog/repository/codeReviewSettingsLog.repository';
import { CodeReviewSettingsLogModelInstance } from '@/core/infrastructure/adapters/repositories/mongoose/schema';
import { CodeReviewSettingsLogService } from '@/ee/codeReviewSettingsLog/services/codeReviewSettingsLog.service';
import { KodyRulesLogHandler } from '@/ee/codeReviewSettingsLog/services/kodyRulesLog.handler';
import { CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN } from '@/ee/codeReviewSettingsLog/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.repository.contract';
import { CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN } from '@/ee/codeReviewSettingsLog/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.service.contract';
import { MongooseModule } from '@nestjs/mongoose';
import { forwardRef, Module } from '@nestjs/common';
import { UsersModule } from './user.module';
import { CodeReviewConfigLogHandler } from '@/ee/codeReviewSettingsLog/services/codeReviewConfigLog.handler';
import { RepositoriesLogHandler } from '@/ee/codeReviewSettingsLog/services/repositoriesLog.handler';
import { UnifiedLogHandler } from '@/ee/codeReviewSettingsLog/services/unifiedLog.handler';
import { IntegrationConfigModule } from './integrationConfig.module';
import { TeamsModule } from './team.module';
import { CodeReviewSettingLogController } from '@/core/infrastructure/http/controllers/codeReviewSettingLog.controller';
import { RegisterUserStatusLogUseCase } from '@/core/application/use-cases/user/register-user-status-log.use-case';
import { FindCodeReviewSettingsLogsUseCase } from '@/core/application/use-cases/codeReviewSettingsLog/find-code-review-settings-logs.use-case';
import { UserStatusLogHandler } from '@/ee/codeReviewSettingsLog/services/userStatusLog.handler';
import { IntegrationLogHandler } from '@/ee/codeReviewSettingsLog/services/integrationLog.handler';
import { PullRequestMessagesLogHandler } from '@/ee/codeReviewSettingsLog/services/pullRequestMessageLog.handler';
import { GetAdditionalInfoHelper } from '@/shared/utils/helpers/getAdditionalInfo.helper';
import { IntegrationModule } from './integration.module';
import { ParametersModule } from './parameters.module';
import { PermissionValidationModule } from '@/ee/shared/permission-validation.module';

@Module({
    imports: [
        MongooseModule.forFeature([CodeReviewSettingsLogModelInstance]),
        PermissionValidationModule,
        forwardRef(() => UsersModule),
        forwardRef(() => IntegrationConfigModule),
        forwardRef(() => TeamsModule),
        forwardRef(() => ParametersModule),
        forwardRef(() => IntegrationModule),
    ],
    providers: [
        {
            provide: CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN,
            useClass: CodeReviewSettingsLogRepository,
        },
        {
            provide: CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN,
            useClass: CodeReviewSettingsLogService,
        },
        UnifiedLogHandler,
        CodeReviewConfigLogHandler,
        RepositoriesLogHandler,
        KodyRulesLogHandler,
        IntegrationLogHandler,
        UserStatusLogHandler,
        PullRequestMessagesLogHandler,
        RegisterUserStatusLogUseCase,
        FindCodeReviewSettingsLogsUseCase,
        GetAdditionalInfoHelper,
    ],
    exports: [
        CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN,
        CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN,
        UnifiedLogHandler,
        CodeReviewConfigLogHandler,
        RepositoriesLogHandler,
        KodyRulesLogHandler,
        RegisterUserStatusLogUseCase,
        FindCodeReviewSettingsLogsUseCase,
        IntegrationLogHandler,
        UserStatusLogHandler,
        PullRequestMessagesLogHandler,
        GetAdditionalInfoHelper,
    ],
    controllers: [CodeReviewSettingLogController],
})
export class CodeReviewSettingsLogModule {}
