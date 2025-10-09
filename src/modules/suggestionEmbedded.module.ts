import { SuggestionEmbeddedModel } from '@/core/infrastructure/adapters/repositories/typeorm/schema/suggestionEmbedded.model';
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodeReviewFeedbackModule } from './codeReviewFeedback.module';
import { PullRequestsModule } from './pullRequests.module';
import { SuggestionEmbeddedController } from '@/core/infrastructure/http/controllers/suggestionEmbedded.controller';
import { GlobalParametersModule } from './global-parameters.module';
import { KodyFineTuningService } from '@/core/infrastructure/adapters/services/kodyFineTuning/kodyFineTuning.service';
import { SuggestionEmbeddedService } from '@/core/infrastructure/adapters/services/kodyFineTuning/suggestionEmbedded/suggestionEmbedded.service';
import { SUGGESTION_EMBEDDED_REPOSITORY_TOKEN } from '@/core/domain/kodyFineTuning/suggestionEmbedded/contracts/suggestionEmbedded.repository.contract';
import { SUGGESTION_EMBEDDED_SERVICE_TOKEN } from '@/core/domain/kodyFineTuning/suggestionEmbedded/contracts/suggestionEmbedded.service.contract';
import { SuggestionEmbeddedDatabaseRepository } from '@/core/infrastructure/adapters/repositories/typeorm/suggestionEmbedded.repository';

@Module({
    imports: [
        TypeOrmModule.forFeature([SuggestionEmbeddedModel]),
        forwardRef(() => PullRequestsModule),
        forwardRef(() => CodeReviewFeedbackModule),
        forwardRef(() => GlobalParametersModule),
    ],
    providers: [
        SuggestionEmbeddedDatabaseRepository,
        KodyFineTuningService,
        SuggestionEmbeddedService,
        {
            provide: SUGGESTION_EMBEDDED_REPOSITORY_TOKEN,
            useClass: SuggestionEmbeddedDatabaseRepository,
        },
        {
            provide: SUGGESTION_EMBEDDED_SERVICE_TOKEN,
            useClass: SuggestionEmbeddedService,
        },
    ],
    exports: [
        SUGGESTION_EMBEDDED_REPOSITORY_TOKEN,
        SUGGESTION_EMBEDDED_SERVICE_TOKEN,
    ],
    controllers: [SuggestionEmbeddedController],
})
export class SuggestionEmbeddedModule {}
