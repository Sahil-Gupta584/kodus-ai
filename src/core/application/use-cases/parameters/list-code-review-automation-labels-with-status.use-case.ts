import { Inject, Injectable } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { CodeReviewVersion } from '@/config/types/general/codeReview.type';
import {
    CODE_BASE_CONFIG_SERVICE_TOKEN,
    ICodeBaseConfigService,
} from '@/core/domain/codeBase/contracts/CodeBaseConfigService.contract';
import { ListCodeReviewAutomationLabelsUseCase } from './list-code-review-automation-labels-use-case';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';

@Injectable()
export class ListCodeReviewAutomationLabelsWithStatusUseCase {
    constructor(
        private readonly listLabelsUseCase: ListCodeReviewAutomationLabelsUseCase,
        @Inject(CODE_BASE_CONFIG_SERVICE_TOKEN)
        private readonly codeBaseConfigService: ICodeBaseConfigService,
        private readonly logger: PinoLoggerService,
        @Inject(REQUEST)
        private readonly request: Request & {
            user?: { organization?: { uuid: string } };
        },
    ) {}

    async execute(params: {
        codeReviewVersion?: CodeReviewVersion;
        teamId?: string;
        repositoryId?: string;
    }) {
        const { codeReviewVersion, teamId, repositoryId } = params || {};

        const labels = this.listLabelsUseCase.execute(codeReviewVersion);

        // Only v2 supports overrides, and only if repo context is provided
        if (
            codeReviewVersion !== CodeReviewVersion.v2 ||
            !teamId ||
            !repositoryId
        ) {
            return labels;
        }

        try {
            const organizationId = this.request?.user?.organization?.uuid;
            const config = await this.codeBaseConfigService.getConfig(
                { organizationId, teamId },
                { name: '', id: repositoryId },
            );

            const ov = config?.v2PromptOverrides || {};
            const has = (t?: string) => !!(t && t.trim().length);

            const overridesStatus = {
                categories: {
                    bug: has(ov?.categories?.descriptions?.bug)
                        ? 'custom'
                        : 'default',
                    performance: has(ov?.categories?.descriptions?.performance)
                        ? 'custom'
                        : 'default',
                    security: has(ov?.categories?.descriptions?.security)
                        ? 'custom'
                        : 'default',
                },
                severity: {
                    critical: has(ov?.severity?.flags?.critical)
                        ? 'custom'
                        : 'default',
                    high: has(ov?.severity?.flags?.high) ? 'custom' : 'default',
                    medium: has(ov?.severity?.flags?.medium)
                        ? 'custom'
                        : 'default',
                    low: has(ov?.severity?.flags?.low) ? 'custom' : 'default',
                },
            } as const;

            return { ...labels, overridesStatus };
        } catch (error) {
            this.logger.warn({
                message: 'Failed to enrich labels with overrides status; returning labels only',
                context: ListCodeReviewAutomationLabelsWithStatusUseCase.name,
                error,
                metadata: { teamId, repositoryId },
            });
            return labels;
        }
    }
}
