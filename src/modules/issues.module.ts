import { IssuesSchema } from "@/core/infrastructure/adapters/repositories/mongoose/schema/issues.model";
import { IssuesModel } from '@/core/infrastructure/adapters/repositories/mongoose/schema/issues.model';
import { KodyIssuesAnalysisService } from "@/ee/codeBase/kodyIssuesAnalysis.service";
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PullRequestsModule } from "./pullRequests.module";
import { ISSUES_REPOSITORY_TOKEN } from "@/core/domain/issues/contracts/issues.repository";
import { IssuesRepository } from "@/core/infrastructure/adapters/repositories/mongoose/issues.repository";
import { ISSUES_SERVICE_TOKEN } from "@/core/domain/issues/contracts/issues.service.contract";
import { IssuesService } from "@/core/infrastructure/adapters/services/issues/issues.service";
import { KODY_ISSUES_MANAGEMENT_SERVICE_TOKEN } from "@/core/domain/codeBase/contracts/KodyIssuesManagement.contract";
import { KodyIssuesManagementService } from "@/ee/kodyIssuesManagement/service/kodyIssuesManagement.service";
import { KODY_ISSUES_ANALYSIS_SERVICE_TOKEN } from "@/ee/codeBase/kodyIssuesAnalysis.service";
import { IssuesController } from "@/core/infrastructure/http/controllers/issues.controller";
import { GetIssuesByOrganizationUseCase } from "@/core/application/use-cases/issues/get-issues-by-organization.use-case";
import { UpdateIssueStatusUseCase } from "@/core/application/use-cases/issues/update-issues-status.use-case";
import { ProcessPrClosedUseCase } from "@/core/application/use-cases/issues/process-pr-closed.use-case";

const UseCases = [
    GetIssuesByOrganizationUseCase,
    UpdateIssueStatusUseCase,
    ProcessPrClosedUseCase,
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
        {
            provide: KODY_ISSUES_MANAGEMENT_SERVICE_TOKEN,
            useClass: KodyIssuesManagementService,
        },
        {
            provide: KODY_ISSUES_ANALYSIS_SERVICE_TOKEN,
            useClass: KodyIssuesAnalysisService,
        },
    ],
    controllers: [IssuesController],
    exports: [
        ISSUES_REPOSITORY_TOKEN,
        ISSUES_SERVICE_TOKEN,
        KODY_ISSUES_MANAGEMENT_SERVICE_TOKEN,
        KODY_ISSUES_ANALYSIS_SERVICE_TOKEN,
        ...UseCases,
    ],
})
export class IssuesModule {}