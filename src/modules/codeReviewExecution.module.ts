import { UseCases } from '@/core/application/use-cases/codeReviewExecution';
import { CODE_REVIEW_EXECUTION_REPOSITORY } from '@/core/domain/codeReviewExecutions/contracts/codeReviewExecution.repository.contract';
import { CODE_REVIEW_EXECUTION_SERVICE } from '@/core/domain/codeReviewExecutions/contracts/codeReviewExecution.service.contract';
import { CodeReviewExecutionRepository } from '@/core/infrastructure/adapters/repositories/mongoose/codeReviewExecution.repository';
import {
    CodeReviewExecutionModel,
    CodeReviewExecutionSchema,
} from '@/core/infrastructure/adapters/repositories/mongoose/schema/codeReviewExecution.model';
import { CodeReviewExecutionService } from '@/core/infrastructure/adapters/services/codeReviewExecution/codeReviewExecution.service';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PullRequestsModule } from './pullRequests.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            {
                name: CodeReviewExecutionModel.name,
                schema: CodeReviewExecutionSchema,
            },
        ]),
        forwardRef(() => PullRequestsModule),
    ],
    providers: [
        ...UseCases,
        {
            provide: CODE_REVIEW_EXECUTION_SERVICE,
            useClass: CodeReviewExecutionService,
        },
        {
            provide: CODE_REVIEW_EXECUTION_REPOSITORY,
            useClass: CodeReviewExecutionRepository,
        },
    ],
    exports: [
        ...UseCases,
        CODE_REVIEW_EXECUTION_SERVICE,
        CODE_REVIEW_EXECUTION_REPOSITORY,
    ],
    controllers: [],
})
export class CodeReviewExecutionModule {}
