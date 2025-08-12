import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

export class GetRepositoriesUseCase implements IUseCase {
    constructor(
        private readonly codeManagementService: CodeManagementService,

        @Inject(REQUEST)
        private readonly request: Request & { user },
        private readonly logger: PinoLoggerService,
    ) {}

    public async execute(params: {
        teamId: string;
        organizationSelected: any;
        isSelected?: boolean;
    }) {
        try {
            const repositories =
                await this.codeManagementService.getRepositories({
                    organizationAndTeamData: {
                        organizationId: this.request.user.organization.uuid,
                        teamId: params?.teamId,
                    },
                    filters: {
                        organizationSelected: params?.organizationSelected,
                    },
                });

            if (params.isSelected !== undefined) {
                const filteredRepositories = repositories.filter(
                    (repo) => repo.selected === Boolean(params.isSelected),
                );

                return filteredRepositories;
            }

            return repositories;
        } catch (error) {
            this.logger.error({
                message: 'Error while getting repositories',
                context: GetRepositoriesUseCase.name,
                error: error,
                metadata: {
                    organizationAndTeamData: {
                        organizationId: this.request.user.organization.uuid,
                        teamId: params.teamId,
                    },
                },
            });
            return [];
        }
    }
}
