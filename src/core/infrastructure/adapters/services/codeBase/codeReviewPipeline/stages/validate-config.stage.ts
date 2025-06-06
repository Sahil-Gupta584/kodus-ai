import { Inject, Injectable } from '@nestjs/common';
import { BasePipelineStage } from '../../../pipeline/base-stage.abstract';
import {
    CODE_BASE_CONFIG_SERVICE_TOKEN,
    ICodeBaseConfigService,
} from '@/core/domain/codeBase/contracts/CodeBaseConfigService.contract';
import { CodeReviewConfig } from '@/config/types/general/codeReview.type';
import { PinoLoggerService } from '../../../logger/pino.service';
import { CodeReviewPipelineContext } from '../context/code-review-pipeline.context';
import { OrganizationAndTeamDataDto } from '@/core/infrastructure/http/dtos/organizationAndTeamData.dto';
import { PipelineStatus } from '../../../pipeline/interfaces/pipeline-context.interface';

@Injectable()
export class ValidateConfigStage extends BasePipelineStage<CodeReviewPipelineContext> {
    stageName = 'ValidateConfigStage';

    constructor(
        @Inject(CODE_BASE_CONFIG_SERVICE_TOKEN)
        private codeBaseConfigService: ICodeBaseConfigService,

        private logger: PinoLoggerService,
    ) {
        super();
    }

    protected async executeStage(
        context: CodeReviewPipelineContext,
    ): Promise<CodeReviewPipelineContext> {
        const config: CodeReviewConfig =
            await this.codeBaseConfigService.getConfig(
                context.organizationAndTeamData,
                { name: context.repository.name, id: context.repository.id },
            );

        const shouldProcess = this.shouldProcessPR(
            context.pullRequest.title,
            context.pullRequest.base.ref,
            config,
            context.origin || '',
        );

        if (!shouldProcess) {
            const errorMessage = `PR #${context.pullRequest.number} skipped due to config rules.`;
            this.logger.warn({
                message: errorMessage,
                serviceName: ValidateConfigStage.name,
                context: this.stageName,
                metadata: {
                    prNumber: context?.pullRequest?.number,
                    repositoryName: context?.repository?.name,
                    id: context?.repository?.id,
                    organizationAndTeamData: context?.organizationAndTeamData,
                },
            });

            return this.updateContext(context, (draft) => {
                draft.status = PipelineStatus.SKIP;
                draft.codeReviewConfig = config;
            });
        }

        return this.updateContext(context, (draft) => {
            draft.codeReviewConfig = config;
        });
    }

    private shouldProcessPR(
        title: string,
        baseBranch: string,
        config: CodeReviewConfig,
        origin: string,
    ): boolean {
        if (origin === 'command') {
            return true;
        }

        if (!config?.automatedReviewActive) {
            return false;
        }

        if (
            config?.ignoredTitleKeywords?.some((keyword) =>
                title?.toLowerCase().includes(keyword.toLowerCase()),
            )
        ) {
            return false;
        }

        if (!config.baseBranches?.includes(baseBranch)) {
            return false;
        }

        return true;
    }
}
