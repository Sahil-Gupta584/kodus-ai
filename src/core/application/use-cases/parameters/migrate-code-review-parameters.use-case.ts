import { CodeReviewConfigWithoutLLMProvider } from '@/config/types/general/codeReview.type';
import { CodeReviewParameter } from '@/config/types/general/codeReviewConfig.type';
import {
    IParametersService,
    PARAMETERS_SERVICE_TOKEN,
} from '@/core/domain/parameters/contracts/parameters.service.contract';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { ParametersKey } from '@/shared/domain/enums/parameters-key.enum';
import { deepDifference, deepMerge } from '@/shared/utils/deep';
import { getDefaultKodusConfigFile } from '@/shared/utils/validateCodeReviewConfigFile';
import { Inject, Injectable } from '@nestjs/common';

type OldReviewConfig = CodeReviewConfigWithoutLLMProvider & {
    id?: string;
    name?: string;
    isSelected?: string;
    repositories: (CodeReviewConfigWithoutLLMProvider & {
        id: string;
        name: string;
        isSelected: string;
        directories?: (CodeReviewConfigWithoutLLMProvider & {
            id: string;
            name: string;
            isSelected: string;
            path: string;
        })[];
    })[];
};

@Injectable()
export class MigrateCodeReviewParametersUseCase {
    constructor(
        private readonly logger: PinoLoggerService,

        @Inject(PARAMETERS_SERVICE_TOKEN)
        private readonly parametersService: IParametersService,
    ) {}

    async execute() {
        try {
            const codeReviewConfigs = await this.parametersService.find({
                configKey: ParametersKey.CODE_REVIEW_CONFIG,
                active: true,
            });

            for (const config of codeReviewConfigs) {
                try {
                    if (!config.configValue) {
                        continue;
                    }

                    const oldConfig =
                        config.configValue as unknown as OldReviewConfig;

                    const newConfig = this.convertOldToNewFormatV2(oldConfig);

                    await this.parametersService.update(
                        { uuid: config.uuid },
                        { active: false },
                    );

                    await this.parametersService.createOrUpdateConfig(
                        ParametersKey.CODE_REVIEW_CONFIG,
                        newConfig,
                        {
                            teamId: config.team.uuid,
                        },
                    );

                    this.logger.log({
                        message: `Migrated config ${config.uuid} to new format`,
                        metadata: { oldConfig, newConfig },
                        context: this.execute.name,
                        serviceName: MigrateCodeReviewParametersUseCase.name,
                    });
                } catch (error) {
                    this.logger.error({
                        message: `Error migrating config ${config.uuid}`,
                        error,
                        metadata: config,
                        context: this.execute.name,
                        serviceName: MigrateCodeReviewParametersUseCase.name,
                    });
                }
            }

            return true;
        } catch (error) {
            this.logger.error({
                message: 'Error migrating code review parameters',
                error,
                context: this.execute.name,
                serviceName: MigrateCodeReviewParametersUseCase.name,
            });

            throw error;
        }
    }

    private convertOldToNewFormatV2(oldConfig: OldReviewConfig) {
        // Extrai o objeto global e repositories do formato antigo
        const { global, repositories } = oldConfig as any;

        // Agora extrai as configs do global (removendo id, name, isSelected)
        const { id, name, isSelected, ...globalConfig } = global || oldConfig;

        const defaultConfig = getDefaultKodusConfigFile();

        // Calcula apenas as diferenças do global em relação ao default
        const globalDelta = deepDifference(defaultConfig, globalConfig);

        // Resolve o global config completo (default + delta)
        const resolvedGlobalConfig = deepMerge(defaultConfig, globalDelta);

        const newRepos = repositories.map((repo) => {
            const { directories, id, name, isSelected, ...repoConfig } = repo;

            // Calcula apenas as diferenças do repo em relação ao global resolvido
            const repoDelta = deepDifference(resolvedGlobalConfig, repoConfig);

            // Resolve o repo config completo (global + repo delta)
            const resolvedRepoConfig = deepMerge(
                resolvedGlobalConfig,
                repoDelta,
            );

            const newDirectories = (directories || []).map((dir) => {
                const { id, name, isSelected, path, ...dirConfig } = dir;

                // Calcula apenas as diferenças do dir em relação ao repo resolvido
                const dirDelta = deepDifference(resolvedRepoConfig, dirConfig);

                return {
                    id: dir.id,
                    name: dir.name,
                    isSelected: dir.isSelected === 'true',
                    configs: dirDelta,
                    path: dir.path,
                };
            });

            return {
                id: repo.id,
                name: repo.name,
                isSelected: repo.isSelected === 'true',
                configs: repoDelta,
                directories: newDirectories,
            };
        });

        const newConfig = {
            configs: globalDelta,
            id: 'global',
            name: 'Global',
            repositories: newRepos,
            isSelected: true,
        };

        return newConfig as unknown as CodeReviewParameter;
    }

    private convertOldToNewFormat(oldConfig: OldReviewConfig) {
        const { repositories, id, name, isSelected, ...globalConfig } =
            oldConfig;

        const defaultConfig = getDefaultKodusConfigFile();

        const globalDelta = deepDifference(defaultConfig, globalConfig);
        const resolvedGlobalConfig = deepMerge(defaultConfig, globalDelta);

        const newRepos = repositories.map((repo) => {
            const { directories, id, name, isSelected, ...repoConfig } = repo;

            const repoDelta = deepDifference(resolvedGlobalConfig, repoConfig);
            const resolvedRepoConfig = deepMerge(
                resolvedGlobalConfig,
                repoDelta,
            );

            const newDirectories = (directories || []).map((dir) => {
                const { id, name, isSelected, path, ...dirConfig } = dir;

                const dirDelta = deepDifference(resolvedRepoConfig, dirConfig);

                return {
                    id: dir.id,
                    name: dir.name,
                    isSelected: dir.isSelected === 'true',
                    configs: dirDelta,
                    path: dir.path,
                };
            });

            return {
                id: repo.id,
                name: repo.name,
                isSelected: repo.isSelected === 'true',
                configs: repoDelta,
                directories: newDirectories,
            };
        });

        const newConfig = {
            configs: globalDelta,
            id: 'global',
            name: 'Global',
            repositories: newRepos,
            isSelected: true,
        };

        return newConfig as unknown as CodeReviewParameter;
    }
}
