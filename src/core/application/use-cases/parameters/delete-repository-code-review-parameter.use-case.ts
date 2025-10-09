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
import { ActionType } from '@/config/types/general/codeReviewSettingsLog.type';
import { RepositoryWithDirectoriesException } from '@/shared/infrastructure/filters/repository-with-directories.exception';
import { DeleteByRepositoryOrDirectoryPullRequestMessagesUseCase } from '../pullRequestMessages/delete-by-repository-or-directory.use-case';
import {
    IKodyRulesService,
    KODY_RULES_SERVICE_TOKEN,
} from '@/core/domain/kodyRules/contracts/kodyRules.service.contract';
import { KodyRulesStatus } from '@/core/domain/kodyRules/interfaces/kodyRules.interface';
import { CodeReviewParameter } from '@/config/types/general/codeReviewConfig.type';
import { produce } from 'immer';
import {
    CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN,
    ICodeReviewSettingsLogService,
} from '@/ee/codeReviewSettingsLog/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.service.contract';
import { UserRequest } from '@/config/types/http/user-request.type';

@Injectable()
export class DeleteRepositoryCodeReviewParameterUseCase {
    constructor(
        @Inject(PARAMETERS_SERVICE_TOKEN)
        private readonly parametersService: IParametersService,

        @Inject(CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN)
        private readonly codeReviewSettingsLogService: ICodeReviewSettingsLogService,

        private readonly deletePullRequestMessagesUseCase: DeleteByRepositoryOrDirectoryPullRequestMessagesUseCase,

        @Inject(KODY_RULES_SERVICE_TOKEN)
        private readonly kodyRulesService: IKodyRulesService,

        private readonly logger: PinoLoggerService,

        @Inject(REQUEST)
        private readonly request: UserRequest,
    ) {}

    async execute(
        body: DeleteRepositoryCodeReviewParameterDto,
    ): Promise<ParametersEntity<ParametersKey.CODE_REVIEW_CONFIG> | boolean> {
        const { teamId, repositoryId, directoryId } = body;

        try {
            const organizationId = this.request.user.organization.uuid;
            if (!organizationId) {
                throw new Error('Organization ID not found');
            }

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
            let result:
                | ParametersEntity<ParametersKey.CODE_REVIEW_CONFIG>
                | boolean;

            if (repositoryId && directoryId) {
                result = await this.deleteDirectoryConfig(
                    organizationAndTeamData,
                    codeReviewConfig,
                    repositoryId,
                    directoryId,
                );
            } else if (repositoryId) {
                result = await this.deleteRepositoryConfig(
                    organizationAndTeamData,
                    codeReviewConfig,
                    repositoryId,
                );
            } else {
                throw new Error('RepositoryId is required');
            }

            return result;
        } catch (error) {
            this.logger.error({
                message: 'Could not delete code review configuration',
                context: DeleteRepositoryCodeReviewParameterUseCase.name,
                error: error,
                metadata: { body },
            });
            throw error;
        }
    }

    private async deleteRepositoryConfig(
        organizationAndTeamData: OrganizationAndTeamData,
        currentConfig: CodeReviewParameter,
        repositoryId: string,
    ) {
        const repositoryIndex = currentConfig.repositories.findIndex(
            (repo) => repo.id === repositoryId,
        );

        if (repositoryIndex === -1) {
            throw new Error('Repository not found in configuration');
        }

        const repositoryToRemove = currentConfig.repositories[repositoryIndex];

        if (repositoryToRemove.directories?.length > 0) {
            throw new RepositoryWithDirectoriesException();
        }

        const updatedConfig = produce(currentConfig, (draft) => {
            const repo = draft.repositories[repositoryIndex];
            repo.configs = {};
            repo.isSelected = false;
        });

        const updated = await this.parametersService.createOrUpdateConfig(
            ParametersKey.CODE_REVIEW_CONFIG,
            updatedConfig,
            organizationAndTeamData,
        );

        this.logger.log({
            message: 'Repository configuration reset successfully',
            context: DeleteRepositoryCodeReviewParameterUseCase.name,
            metadata: { repositoryId, organizationAndTeamData },
        });

        await this.handleRepositorySideEffects(
            organizationAndTeamData,
            repositoryToRemove,
        );

        return updated;
    }

    private async deleteDirectoryConfig(
        organizationAndTeamData: OrganizationAndTeamData,
        currentConfig: CodeReviewParameter,
        repositoryId: string,
        directoryId: string,
    ) {
        const repositoryIndex = currentConfig.repositories.findIndex(
            (repo) => repo.id === repositoryId,
        );
        if (repositoryIndex === -1) {
            throw new Error('Repository not found in configuration');
        }

        const repository = currentConfig.repositories[repositoryIndex];
        const directoryIndex = repository.directories?.findIndex(
            (dir) => dir.id === directoryId,
        );

        if (directoryIndex === undefined || directoryIndex === -1) {
            throw new Error('Directory not found in configuration');
        }

        const directoryToRemove = repository.directories[directoryIndex];

        const updatedConfig = produce(currentConfig, (draft) => {
            const repo = draft.repositories[repositoryIndex];
            repo.directories.splice(directoryIndex, 1);

            if (
                repo.directories.length === 0 &&
                (!repo.configs || Object.keys(repo.configs).length === 0)
            ) {
                repo.isSelected = false;
            }
        });

        const updated = await this.parametersService.createOrUpdateConfig(
            ParametersKey.CODE_REVIEW_CONFIG,
            updatedConfig,
            organizationAndTeamData,
        );

        this.logger.log({
            message:
                'Directory removed from repository configuration successfully',
            context: DeleteRepositoryCodeReviewParameterUseCase.name,
            metadata: { repositoryId, directoryId, organizationAndTeamData },
        });

        await this.handleDirectorySideEffects(
            organizationAndTeamData,
            repository,
            directoryToRemove,
        );

        return updated;
    }

    private async handleRepositorySideEffects(
        orgData: OrganizationAndTeamData,
        repository: { id: string; name: string },
    ) {
        await this.deletePullRequestMessagesUseCase.execute({
            organizationId: orgData.organizationId,
            repositoryId: repository.id,
        });

        await this.kodyRulesService.updateRulesStatusByFilter(
            orgData.organizationId,
            repository.id,
            undefined,
            KodyRulesStatus.DELETED,
        );

        await this.codeReviewSettingsLogService.registerRepositoryConfigurationRemoval(
            {
                organizationAndTeamData: orgData,
                userInfo: {
                    userId: this.request.user.uuid,
                    userEmail: this.request.user.email,
                },
                repository,
                actionType: ActionType.DELETE,
            },
        );
    }

    private async handleDirectorySideEffects(
        orgData: OrganizationAndTeamData,
        repository: { id: string; name: string },
        directory: { id: string; path: string },
    ) {
        await this.deletePullRequestMessagesUseCase.execute({
            organizationId: orgData.organizationId,
            repositoryId: repository.id,
            directoryId: directory.id,
        });

        await this.kodyRulesService.updateRulesStatusByFilter(
            orgData.organizationId,
            repository.id,
            directory.id,
            KodyRulesStatus.DELETED,
        );

        await this.codeReviewSettingsLogService.registerDirectoryConfigurationRemoval(
            {
                organizationAndTeamData: orgData,
                userInfo: {
                    userId: this.request.user.uuid,
                    userEmail: this.request.user.email,
                },
                repository,
                directory,
                actionType: ActionType.DELETE,
            },
        );
    }
}
