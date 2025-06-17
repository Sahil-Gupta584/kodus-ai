import { IssueStatus } from "@/config/types/general/issues.type";
import { ISSUES_SERVICE_TOKEN } from "@/core/domain/issues/contracts/issues.service.contract";
import { IssuesEntity } from "@/core/domain/issues/entities/issues.entity";
import { IssuesService } from "@/core/infrastructure/adapters/services/issues/issues.service";
import { IUseCase } from "@/shared/domain/interfaces/use-case.interface";
import { LabelType } from "@/shared/utils/codeManagement/labels";
import { Injectable, Inject } from "@nestjs/common";
import { SeverityLevel } from "@/shared/utils/enums/severityLevel.enum";

@Injectable()
export class UpdateIssuePropertyUseCase implements IUseCase {
    constructor(
        @Inject(ISSUES_SERVICE_TOKEN)
        private readonly issuesService: IssuesService,
    ) {}

    async execute(
        uuid: string,
        field: 'severity' | 'label' | 'status',
        value: string,
    ): Promise<IssuesEntity | null> {
        switch (field) {
            case 'severity':
                return await this.issuesService.updateSeverity(
                    uuid,
                    value as SeverityLevel,
                );
            case 'label':
                return await this.issuesService.updateLabel(
                    uuid,
                    value as LabelType,
                );
            case 'status':
                return await this.issuesService.updateStatus(
                    uuid,
                    value as IssueStatus,
                );
            default:
                throw new Error(`Invalid field: ${field}`);
        }
    }
}
