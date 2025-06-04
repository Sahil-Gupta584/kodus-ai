import { KODY_ISSUES_MANAGEMENT_SERVICE_TOKEN } from '@/core/domain/codeBase/contracts/KodyIssuesManagement.contract';
import { KodyIssuesManagementService } from '@/ee/kodyIssuesManagement/service/kodyIssuesManagement.service';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ProcessPrClosedUseCase implements IUseCase {
    constructor(
        @Inject(KODY_ISSUES_MANAGEMENT_SERVICE_TOKEN)
        private readonly kodyIssuesManagementService: KodyIssuesManagementService,
    ) {}

    async execute(params: any): Promise<void> {
        await this.kodyIssuesManagementService.processClosedPr({
            prNumber: params.number,
            organizationId: params.organizationId,
            repositoryId: params.repository.id,
            repositoryName: params.repository.name,
        });
    }
}