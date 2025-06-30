import {
    IIssuesService,
    ISSUES_SERVICE_TOKEN,
} from '@/core/domain/issues/contracts/issues.service.contract';
import { GetIssuesByFiltersDto } from '@/core/infrastructure/http/dtos/get-issues-by-filters.dto';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Inject, Injectable } from '@nestjs/common';
import { IIssue } from '@/core/domain/issues/interfaces/issues.interface';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { CacheService } from '@/shared/utils/cache/cache.service';
import { REQUEST } from '@nestjs/core';

@Injectable()
export class GetIssuesUseCase implements IUseCase {
    constructor(
        @Inject(ISSUES_SERVICE_TOKEN)
        private readonly issuesService: IIssuesService,

        private readonly logger: PinoLoggerService,

        @Inject(REQUEST)
        private readonly request: Request & {
            user: { organization: { uuid: string } };
        },

        private readonly cacheService: CacheService,
    ) {}

    async execute(filters: GetIssuesByFiltersDto): Promise<IIssue[]> {
        try {
            if (!filters?.organizationId) {
                filters.organizationId = this.request.user.organization.uuid;
            }

            const cacheKey = `issues_${filters.organizationId}`;

            let allIssues =
                await this.cacheService.getFromCache<IIssue[]>(cacheKey);

            if (!allIssues) {
                allIssues = await this.issuesService.find(
                    filters.organizationId,
                );

                if (!allIssues || allIssues?.length === 0) {
                    return [];
                }

                await this.cacheService.addToCache(cacheKey, allIssues, 900000); //15 minutos
            }

            if (!allIssues || allIssues.length === 0) {
                return [];
            }

            return allIssues;
        } catch (error) {
            this.logger.error({
                context: GetIssuesUseCase.name,
                message: 'Error getting issues',
                error,
                metadata: {
                    organizationId: filters.organizationId,
                    filters,
                },
            });

            return [];
        }
    }
}
