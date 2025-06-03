import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ISSUES_REPOSITORY_TOKEN } from '@/core/domain/issues/contracts/issues.repository';
import { IssuesRepository } from '@/core/infrastructure/adapters/repositories/mongoose/issues.repository';
import { IssuesModel, IssuesSchema } from '@/core/infrastructure/adapters/repositories/mongoose/schema/issues.model';
import { IssuesService } from '@/core/infrastructure/adapters/services/issues/issues.service';

import { PullRequestsModule } from './pullRequests.module';
import { GetIssuesByOrganizationUseCase } from '@/core/application/use-cases/issues/get-issues-by-organization.use-case';
import { UpdateIssueStatusUseCase } from '@/core/application/use-cases/issues/update-issues-status.use-case';
import { ISSUES_SERVICE_TOKEN } from '@/core/domain/issues/contracts/issues.service.contract';
import { IssuesController } from '@/core/infrastructure/http/controllers/issues.controller';

const UseCases = [
    GetIssuesByOrganizationUseCase,
    UpdateIssueStatusUseCase,
] as const;

@Module({
    imports: [
        MongooseModule.forFeature([
            {
                name: IssuesModel.name,
                schema: IssuesSchema,
            },
        ]),
        forwardRef(() => PullRequestsModule),
    ],
    providers: [
        ...UseCases,
        {
            provide: ISSUES_REPOSITORY_TOKEN,
            useClass: IssuesRepository,
        },
        {
            provide: ISSUES_SERVICE_TOKEN,
            useClass: IssuesService,
        },
    ],
    controllers: [IssuesController],
    exports: [
        ISSUES_REPOSITORY_TOKEN,
        ISSUES_SERVICE_TOKEN,
        ...UseCases,
    ],
})
export class IssuesModule {}