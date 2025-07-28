import { CodeReviewSettingsLogRepository } from '@/core/infrastructure/adapters/repositories/mongoose/codeReviewSettingsLog.repository';
import { CodeReviewSettingsLogModelInstance } from '@/core/infrastructure/adapters/repositories/mongoose/schema';
import { CodeReviewSettingsLogService } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/codeReviewSettingsLog.service';
import { KodyRulesLogHandler } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/kodyRulesLog.handler';
import { CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN } from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.repository.contract';
import { CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN } from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.service.contract';
import { MongooseModule } from '@nestjs/mongoose';
import { forwardRef, Module } from '@nestjs/common';
import { UsersModule } from './user.module';
import { CodeReviewConfigLogHandler } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/codeReviewConfigLog.handler';
import { RepositoriesLogHandler } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/repositoriesLog.handler';
import { UnifiedLogHandler } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/unifiedLog.handler';
import { IntegrationConfigModule } from './integrationConfig.module';
import { TeamsModule } from './team.module';
import { CodeReviewSettingLogController } from '@/core/infrastructure/http/controllers/codeReviewSettingLog.controller';
import { RegisterUserStatusLogUseCase } from '@/core/application/use-cases/user/register-user-status-log.use-case';
import { UserStatusLogHandler } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/userStatusLog.handler';
import { IntegrationLogHandler } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/integrationLog.handler';

@Module({
    imports: [
        MongooseModule.forFeature([CodeReviewSettingsLogModelInstance]),
        forwardRef(() => UsersModule),
        forwardRef(() => IntegrationConfigModule),
        forwardRef(() => TeamsModule),
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
        RegisterUserStatusLogUseCase,
        UnifiedLogHandler,
        CodeReviewConfigLogHandler,
        RepositoriesLogHandler,
        KodyRulesLogHandler,
        IntegrationLogHandler,
        UserStatusLogHandler,
    ],
    exports: [
        CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN,
        CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN,
        UnifiedLogHandler,
        CodeReviewConfigLogHandler,
        RepositoriesLogHandler,
        KodyRulesLogHandler,
        RegisterUserStatusLogUseCase,
        IntegrationLogHandler,
        UserStatusLogHandler,
    ],
    controllers: [CodeReviewSettingLogController],
})
export class CodeReviewSettingsLogModule {}
