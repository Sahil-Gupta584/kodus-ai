import { CodeReviewConfig } from '@/config/types/general/codeReview.type';
import {
    CODE_BASE_CONFIG_SERVICE_TOKEN,
    ICodeBaseConfigService,
} from '@/core/domain/codeBase/contracts/CodeBaseConfigService.contract';
import {
    COMMENT_MANAGER_SERVICE_TOKEN,
    ICommentManagerService,
} from '@/core/domain/codeBase/contracts/CommentManagerService.contract';
import {
    IParametersService,
    PARAMETERS_SERVICE_TOKEN,
} from '@/core/domain/parameters/contracts/parameters.service.contract';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { PreviewPrSummaryDto } from '@/core/infrastructure/http/dtos/preview-pr-summary.dto';
import { ParametersKey } from '@/shared/domain/enums/parameters-key.enum';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class PreviewPrSummaryUseCase {
    constructor(
        //private readonly parametersService: ParametersService,

        private readonly codeManagementService: CodeManagementService,

        @Inject(COMMENT_MANAGER_SERVICE_TOKEN)
        private readonly commentManagerService: ICommentManagerService,

        @Inject(PARAMETERS_SERVICE_TOKEN)
        private readonly parametersService: IParametersService,

        @Inject(CODE_BASE_CONFIG_SERVICE_TOKEN)
        private readonly codeBaseConfigService: ICodeBaseConfigService,
    ) {}

    async execute(body: PreviewPrSummaryDto) {
        const { prNumber, repository, organizationId, teamId } = body;

        const organizationAndTeamData = {
            organizationId,
            teamId,
        };

        const pullRequest =
            await this.codeManagementService.getPullRequestByNumber({
                organizationAndTeamData,
                repository,
                prNumber: Number(prNumber),
            });

        if (!pullRequest) {
            throw new NotFoundException('Pull request not found');
        }

        const prFiles =
            await this.codeManagementService.getFilesByPullRequestId({
                organizationAndTeamData,
                repository,
                prNumber: Number(prNumber),
            });

        if (!prFiles?.length) {
            throw new NotFoundException('Pull request not found');
        }

        const files = prFiles.map((file) => ({
            filename: file.filename,
            patch: file.patch,
            status: file.status,
        }));

        const config: CodeReviewConfig =
            await this.codeBaseConfigService.getConfig(
                organizationAndTeamData,
                { name: repository.name, id: repository.id },
            );

        const prSummary = await this.commentManagerService.generateSummaryPR(
            pullRequest,
            repository,
            files,
            organizationAndTeamData,
            config.languageResultPrompt ?? 'en-US',
            config.summary,
        );

        return prSummary;
    }
}
