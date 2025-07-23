import { CodeReviewSettingsLogRepository } from '@/core/infrastructure/adapters/repositories/mongoose/codeReviewSettingsLog.repository';
import { CodeReviewSettingsLogModelInstance } from '@/core/infrastructure/adapters/repositories/mongoose/schema';
import { CodeReviewSettingsLogService } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/codeReviewSettingsLog.service';
import { KodyRulesLogHandler } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/kodyRulesLog.handler';
import { CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN } from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.repository.contract';
import { CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN } from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.service.contract';
import { KODY_RULES_LOG_HANDLER_TOKEN } from '@/core/domain/codeReviewSettingsLog/contracts/kodyRulesLog.handler.contract';
import { MongooseModule } from '@nestjs/mongoose';
import { forwardRef, Module } from '@nestjs/common';
import { UsersModule } from './user.module';
import { CodeReviewConfigLogHandler } from '@/core/infrastructure/adapters/services/codeReviewSettingsLog/codeReviewConfigLog.handler';

@Module({
    imports: [
        MongooseModule.forFeature([CodeReviewSettingsLogModelInstance]),
        forwardRef(() => UsersModule),
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
        {
            provide: KODY_RULES_LOG_HANDLER_TOKEN,
            useClass: KodyRulesLogHandler,
        },
        CodeReviewConfigLogHandler,
    ],
    exports: [
        CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN,
        CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN,
        KODY_RULES_LOG_HANDLER_TOKEN,
        CodeReviewConfigLogHandler,
    ],
})
export class CodeReviewSettingsLogModule {}
