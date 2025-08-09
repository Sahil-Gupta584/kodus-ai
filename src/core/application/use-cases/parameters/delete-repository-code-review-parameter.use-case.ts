import { Inject, Injectable } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import {
    IParametersService,
    PARAMETERS_SERVICE_TOKEN,
} from '@/core/domain/parameters/contracts/parameters.service.contract';
import { ParametersEntity } from '@/core/domain/parameters/entities/parameters.entity';
import { ParametersKey } from '@/shared/domain/enums/parameters-key.enum';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { DeleteRepositoryCodeReviewParameterDto } from '@/core/infrastructure/http/dtos/delete-repository-code-review-parameter.dto';
import {
    ICodeReviewSettingsLogService,
    CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN,
} from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.service.contract';
import { ActionType } from '@/config/types/general/codeReviewSettingsLog.type';
import { Request } from 'express';

@Injectable()
export class DeleteRepositoryCodeReviewParameterUseCase {
    constructor(
        @Inject(PARAMETERS_SERVICE_TOKEN)
        private readonly parametersService: IParametersService,

        @Inject(CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN)
        private readonly codeReviewSettingsLogService: ICodeReviewSettingsLogService,

        private readonly logger: PinoLoggerService,

        @Inject(REQUEST)
        private readonly request: Request & {
            user: {
                uuid: string;
                email: string;
                organization: { uuid: string };
            };
        },
    ) {}

    async execute(
        body: DeleteRepositoryCodeReviewParameterDto,
    ): Promise<ParametersEntity | boolean> {
        const { teamId, repositoryId, directoryId } = body;

        try {
            if (!this.request.user.organization.uuid) {
                throw new Error('Organization ID not found');
            }

            const organizationAndTeamData: OrganizationAndTeamData = {
                organizationId: this.request.user.organization.uuid,
                teamId: teamId,
            };

            // Buscar a configuração atual de code review
            const codeReviewConfig = await this.parametersService.findByKey(
                ParametersKey.CODE_REVIEW_CONFIG,
                organizationAndTeamData,
            );

            if (!codeReviewConfig) {
                throw new Error('Code review config not found');
            }

            const codeReviewConfigValue = codeReviewConfig.configValue;

            let updatedData;

            if (repositoryId && !directoryId) {
                updatedData = await this.deleteRepositoryConfig(
                    organizationAndTeamData,
                    codeReviewConfigValue,
                    repositoryId,
                );
            }

            return updatedData;
        } catch (error) {
            this.logger.error({
                message:
                    'Could not delete repository from code review configuration',
                context: DeleteRepositoryCodeReviewParameterUseCase.name,
                serviceName: 'DeleteRepositoryCodeReviewParameterUseCase',
                error: error,
                metadata: {
                    repositoryId,
                    teamId,
                    organizationAndTeamData: {
                        organizationId: this.request.user.organization.uuid,
                        teamId: teamId,
                    },
                },
            });
            throw error;
        }
    }

    private async deleteRepositoryConfig(
        organizationAndTeamData: OrganizationAndTeamData,
        codeReviewConfigValue: any,
        repositoryId: string,
    ) {
        // Verificar se o repositório existe na configuração e capturar suas informações
        const repositoryToRemove = codeReviewConfigValue.repositories?.find(
            (repository: any) => repository.id === repositoryId,
        );

        if (!repositoryToRemove) {
            throw new Error('Repository not found in configuration');
        }

        // Remover o repositório específico do array
        const updatedRepositories = codeReviewConfigValue.repositories.filter(
            (repository: any) => repository.id !== repositoryId,
        );

        // Atualizar a configuração com os repositórios filtrados
        const updatedConfigValue = {
            ...codeReviewConfigValue,
            repositories: updatedRepositories,
        };

        const updated = await this.parametersService.createOrUpdateConfig(
            ParametersKey.CODE_REVIEW_CONFIG,
            updatedConfigValue,
            organizationAndTeamData,
        );

        this.logger.log({
            message:
                'Repository removed from code review configuration successfully',
            context: DeleteRepositoryCodeReviewParameterUseCase.name,
            serviceName: 'DeleteRepositoryCodeReviewParameterUseCase',
            metadata: {
                repositoryId,
                organizationAndTeamData,
                remainingRepositories: updatedRepositories.length,
            },
        });

        try {
            this.codeReviewSettingsLogService.registerRepositoryConfigurationRemoval(
                {
                    organizationAndTeamData,
                    userInfo: {
                        userId: this.request.user.uuid,
                        userEmail: this.request.user.email,
                    },
                    repository: {
                        id: repositoryToRemove.id,
                        name: repositoryToRemove.name,
                    },
                    actionType: ActionType.DELETE,
                },
            );
            return updated;
        } catch (error) {
            this.logger.error({
                message:
                    'Could not delete repository from code review configuration',
                context: DeleteRepositoryCodeReviewParameterUseCase.name,
                serviceName: 'DeleteRepositoryCodeReviewParameterUseCase',
                error: error,
                metadata: {
                    organizationAndTeamData,
                },
            });
            return updated;
        }
    }
}
