import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Inject, Injectable } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

@Injectable()
export class GetRepositoryTreeUseCase implements IUseCase {
    constructor(
        private readonly codeManagementService: CodeManagementService,

        @Inject(REQUEST)
        private readonly request: Request & { user },
        private readonly logger: PinoLoggerService,
    ) {}

    public async execute(params: {
        organizationId: string;
        repositoryId: string;
    }) {
        try {
            const repositoryTree =
                await this.codeManagementService.getRepositoryTree({
                    organizationAndTeamData: {
                        organizationId: params.organizationId,
                        teamId: this.request.user.organization.uuid,
                    },
                    repositoryId: params.repositoryId,
                });

            return repositoryTree;
        } catch (error) {
            this.logger.error({
                message: 'Error while getting repository tree',
                context: GetRepositoryTreeUseCase.name,
                error: error,
                metadata: {
                    organizationId: params.organizationId,
                    repositoryId: params.repositoryId,
                },
            });
            return [];
        }
    }
}
