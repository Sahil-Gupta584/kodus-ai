import { CodeManagementService } from "@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service";
import { PreviewPrSummaryDto } from "@/core/infrastructure/http/dtos/preview-pr-summary.dto";
import { Inject, Injectable } from "@nestjs/common";

@Injectable()
export class PreviewPrSummaryUseCase {
    constructor(
        //private readonly parametersService: ParametersService,

        private readonly codeManagementService: CodeManagementService,
    ) {}

    async execute(body: PreviewPrSummaryDto) {
        const { prNumber, repositoryId, organizationId } = body;

        const pullRequest = await this.codeManagementService.getPullRequestByNumber({
            organizationAndTeamData: {
                organizationId,
                teamId: repositoryId,
            },
            repository: {
                name: repositoryId,
                id: repositoryId,
            },
            prNumber: Number(prNumber),
        });

        return pullRequest;
    }
}
