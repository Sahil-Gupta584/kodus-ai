import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { KodyRulesSyncService } from '@/core/infrastructure/adapters/services/kodyRules/kodyRulesSync.service';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { Inject, Injectable } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';

@Injectable()
export class ResyncRulesFromIdeUseCase {
    constructor(
        private readonly kodyRulesSyncService: KodyRulesSyncService,
        private readonly codeManagementService: CodeManagementService,
        private readonly logger: PinoLoggerService,

        @Inject(REQUEST)
        private readonly request: Request & {
            user: { organization: { uuid: string } };
        },
    ) {}

    async execute(params: {
        teamId: string;
        repositoriesIds: string[];
    }) {
        const organizationAndTeamData: OrganizationAndTeamData = {
            organizationId: this.request.user?.organization?.uuid,
            teamId: params.teamId,
        };

        try {
            const repos = await this.codeManagementService.getRepositories({
                organizationAndTeamData,
            });

            if (!Array.isArray(repos) || repos.length === 0) return;

            const filtered = repos
                .filter(
                    (r: any) =>
                        r && (r.selected === true || r.isSelected === true),
                )
                .filter((r: any) =>
                    params.repositoriesIds && params.repositoriesIds.length > 0
                        ? params.repositoriesIds.includes(r.id) ||
                          params.repositoriesIds.includes(String(r.id))
                        : true,
                );

            for (const repo of filtered) {
                await this.kodyRulesSyncService.syncRepositoryMain({
                    organizationAndTeamData,
                    repository: {
                        id: String(repo.id),
                        name: repo.name,
                        fullName:
                            (repo as any)?.fullName ||
                            `${(repo as any)?.organizationName || ''}/${repo.name}`,
                        defaultBranch: (repo as any)?.default_branch,
                    },
                });
            }
        } catch (error) {
            this.logger.error({
                message: 'Failed to sync selected repositories Kody Rules',
                context: ResyncRulesFromIdeUseCase.name,
                error,
                metadata: {
                    organizationAndTeamData,
                    params,
                },
            });
        }
    }
}
