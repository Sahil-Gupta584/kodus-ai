import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import {
    PARAMETERS_SERVICE_TOKEN,
    IParametersService,
} from '@/core/domain/parameters/contracts/parameters.service.contract';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { CopyCodeReviewParameterDTO } from '@/core/infrastructure/http/dtos/copy-code-review-parameter.dto';
import { ParametersKey } from '@/shared/domain/enums/parameters-key.enum';
import { Inject, Injectable } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import {
    ICodeReviewSettingsLogService,
    CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN,
} from '@/ee/codeReviewSettingsLog/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.service.contract';
import {
    ActionType,
    ConfigLevel,
} from '@/config/types/general/codeReviewSettingsLog.type';

import { v4 as uuidv4 } from 'uuid';
import { AuthorizationService } from '@/core/infrastructure/adapters/services/permissions/authorization.service';
import {
    Action,
    ResourceType,
} from '@/core/domain/permissions/enums/permissions.enum';
import { CodeReviewParameter } from '@/config/types/general/codeReviewConfig.type';
import { CodeReviewConfigWithoutLLMProvider } from '@/config/types/general/codeReview.type';
import { DeepPartial } from 'typeorm';
import { produce } from 'immer';

@Injectable()
export class CopyCodeReviewParameterUseCase {
    constructor(
        @Inject(PARAMETERS_SERVICE_TOKEN)
        private readonly parametersService: IParametersService,

        @Inject(CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN)
        private readonly codeReviewSettingsLogService: ICodeReviewSettingsLogService,

        private readonly logger: PinoLoggerService,

        @Inject(REQUEST)
        private readonly request: Request & {
            user: {
                organization: { uuid: string };
                uuid: string;
                email: string;
            };
        },

        private readonly authorizationService: AuthorizationService,
    ) {}

    async execute(body: CopyCodeReviewParameterDTO) {
        const {
            teamId,
            targetRepositoryId,
            sourceRepositoryId,
            targetDirectoryPath,
        } = body;

        try {
            const organizationId = this.request.user.organization.uuid;
            if (!organizationId) {
                throw new Error('Organization ID not found in user request');
            }

            await this.authorizationService.ensure({
                user: this.request.user,
                action: Action.Read,
                resource: ResourceType.CodeReviewSettings,
                repoIds: [sourceRepositoryId],
            });

            await this.authorizationService.ensure({
                user: this.request.user,
                action: Action.Create,
                resource: ResourceType.CodeReviewSettings,
                repoIds: [targetRepositoryId],
            });

            const organizationAndTeamData: OrganizationAndTeamData = {
                organizationId,
                teamId,
            };

            const codeReviewConfigParam =
                await this.parametersService.findByKey(
                    ParametersKey.CODE_REVIEW_CONFIG,
                    organizationAndTeamData,
                );

            if (!codeReviewConfigParam || !codeReviewConfigParam.configValue) {
                throw new Error('Code review config not found');
            }

            const codeReviewConfig = codeReviewConfigParam.configValue;

            const sourceConfigDelta = this.getSourceConfigDelta(
                codeReviewConfig,
                sourceRepositoryId,
            );

            const updatedConfig = targetDirectoryPath
                ? this.copyToDirectory(
                      body,
                      codeReviewConfig,
                      sourceConfigDelta,
                  )
                : this.copyToRepository(
                      body,
                      codeReviewConfig,
                      sourceConfigDelta,
                  );

            const result = await this.parametersService.createOrUpdateConfig(
                ParametersKey.CODE_REVIEW_CONFIG,
                updatedConfig,
                organizationAndTeamData,
            );

            await this.logCopyAction(
                body,
                organizationAndTeamData,
                updatedConfig,
            );

            this.logger.log({
                message: 'Code review parameter copied successfully',
                context: CopyCodeReviewParameterUseCase.name,
                metadata: { body, organizationAndTeamData },
            });

            return result;
        } catch (error) {
            this.logger.error({
                message: 'Could not copy code review parameter',
                context: CopyCodeReviewParameterUseCase.name,
                serviceName: 'CopyCodeReviewParameterUseCase',
                error: error,
                metadata: {
                    body,
                    organizationAndTeamData: {
                        organizationId: this.request.user.organization.uuid,
                        teamId: teamId,
                    },
                },
            });
            throw error;
        }
    }

    private getSourceConfigDelta(
        codeReviewConfig: CodeReviewParameter,
        sourceRepositoryId: string,
    ): DeepPartial<CodeReviewConfigWithoutLLMProvider> {
        if (sourceRepositoryId === 'global') {
            return codeReviewConfig.configs ?? {};
        }

        const sourceRepository = codeReviewConfig.repositories.find(
            (repo) => repo.id === sourceRepositoryId,
        );

        if (!sourceRepository) {
            throw new Error(
                `Source repository with ID ${sourceRepositoryId} not found.`,
            );
        }

        return sourceRepository.configs ?? {};
    }

    private copyToRepository(
        body: CopyCodeReviewParameterDTO,
        currentConfig: CodeReviewParameter,
        sourceConfigDelta: DeepPartial<CodeReviewConfigWithoutLLMProvider>,
    ): CodeReviewParameter {
        const { targetRepositoryId } = body;

        return produce(currentConfig, (draft) => {
            const targetRepoIndex = draft.repositories.findIndex(
                (repo) => repo.id === targetRepositoryId,
            );

            if (targetRepoIndex === -1) {
                throw new Error(
                    `Target repository with ID ${targetRepositoryId} not found.`,
                );
            }

            draft.repositories[targetRepoIndex].configs = sourceConfigDelta;
            draft.repositories[targetRepoIndex].isSelected = true;
        });
    }

    private copyToDirectory(
        body: CopyCodeReviewParameterDTO,
        currentConfig: CodeReviewParameter,
        sourceConfigDelta: DeepPartial<CodeReviewConfigWithoutLLMProvider>,
    ): CodeReviewParameter {
        const { targetRepositoryId, targetDirectoryPath } = body;

        return produce(currentConfig, (draft) => {
            const targetRepoIndex = draft.repositories.findIndex(
                (repo) => repo.id === targetRepositoryId,
            );

            if (targetRepoIndex === -1) {
                throw new Error(
                    `Target repository with ID ${targetRepositoryId} not found.`,
                );
            }

            const targetRepo = draft.repositories[targetRepoIndex];
            if (!targetRepo.directories) {
                targetRepo.directories = [];
            }

            const targetDirIndex = targetRepo.directories.findIndex(
                (dir) => dir.path === targetDirectoryPath,
            );

            if (targetDirIndex >= 0) {
                // Directory exists, update its config
                targetRepo.directories[targetDirIndex].configs =
                    sourceConfigDelta;
                targetRepo.directories[targetDirIndex].isSelected = true;
            } else {
                // Directory does not exist, create it
                const segments = targetDirectoryPath.split('/');
                const name = segments[segments.length - 1];

                targetRepo.directories.push({
                    id: uuidv4(),
                    name,
                    path: targetDirectoryPath,
                    isSelected: true,
                    configs: sourceConfigDelta,
                });
            }

            // Mark the parent repository as selected since it now has a configured directory
            targetRepo.isSelected = true;
        });
    }

    private async logCopyAction(
        body: CopyCodeReviewParameterDTO,
        organizationAndTeamData: OrganizationAndTeamData,
        updatedConfig: CodeReviewParameter,
    ) {
        const { sourceRepositoryId, targetRepositoryId, targetDirectoryPath } =
            body;

        try {
            const sourceRepo = updatedConfig.repositories.find(
                (r) => r.id === sourceRepositoryId,
            );
            const source =
                sourceRepositoryId === 'global'
                    ? { id: 'global', name: 'Global' }
                    : { id: sourceRepositoryId, name: sourceRepo?.name ?? '' };

            const targetRepo = updatedConfig.repositories.find(
                (r) => r.id === targetRepositoryId,
            );
            const targetRepoName = targetRepo?.name ?? '';

            const logPayload: any = {
                organizationAndTeamData,
                userInfo: {
                    userId: this.request.user.uuid,
                    userEmail: this.request.user.email,
                },
                actionType: ActionType.CLONE,
                source,
            };

            if (targetDirectoryPath && targetRepo) {
                const targetDir = targetRepo.directories?.find(
                    (d) => d.path === targetDirectoryPath,
                );

                logPayload.configLevel = ConfigLevel.DIRECTORY;
                logPayload.repository = {
                    id: targetRepositoryId,
                    name: targetRepoName,
                };
                logPayload.directory = {
                    id: targetDir?.id ?? '',
                    path: targetDirectoryPath,
                };
            } else {
                logPayload.configLevel = ConfigLevel.REPOSITORY;
                logPayload.repository = {
                    id: targetRepositoryId,
                    name: targetRepoName,
                };
            }

            await this.codeReviewSettingsLogService.registerCodeReviewConfigLog(
                logPayload,
            );
        } catch (error) {
            this.logger.error({
                message: 'Error saving code review settings copy log',
                error,
                context: CopyCodeReviewParameterUseCase.name,
                metadata: { organizationAndTeamData },
            });
        }
    }
}
