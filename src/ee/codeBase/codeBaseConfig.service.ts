import { Inject, Injectable } from '@nestjs/common';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { ParametersKey } from '@/shared/domain/enums/parameters-key.enum';
import {
    IParametersService,
    PARAMETERS_SERVICE_TOKEN,
} from '@/core/domain/parameters/contracts/parameters.service.contract';
import {
    CodeReviewConfig,
    CodeReviewConfigWithoutLLMProvider,
    CodeReviewVersion,
    FileChange,
    KodusConfigFile,
    KodyFineTuningConfig,
    ReviewModeConfig,
    ReviewOptions,
    SuggestionControlConfig,
    SummaryConfig,
} from '@/config/types/general/codeReview.type';
import {
    IIntegrationService,
    INTEGRATION_SERVICE_TOKEN,
} from '@/core/domain/integrations/contracts/integration.service.contracts';
import {
    IIntegrationConfigService,
    INTEGRATION_CONFIG_SERVICE_TOKEN,
} from '@/core/domain/integrationConfigs/contracts/integration-config.service.contracts';
import { IntegrationCategory } from '@/shared/domain/enums/integration-category.enum';
import { IntegrationConfigKey } from '@/shared/domain/enums/Integration-config-key.enum';
import { ValidateCodeManagementIntegration } from '@/shared/utils/decorators/validate-code-management-integration.decorator';
import { decrypt } from '@/shared/utils/crypto';
import { AuthMode } from '@/core/domain/platformIntegrations/enums/codeManagement/authMode.enum';
import { LanguageValue } from '@/shared/domain/enums/language-parameter.enum';
import {
    IKodyRulesService,
    KODY_RULES_SERVICE_TOKEN,
} from '@/core/domain/kodyRules/contracts/kodyRules.service.contract';
import * as globalIgnorePathsJson from '@/shared/utils/codeBase/ignorePaths/generated/paths.json';
import * as yaml from 'js-yaml';
import validateKodusConfigFile, {
    getDefaultKodusConfigFile,
    isParameterValidInConfigFile,
} from '@/shared/utils/validateCodeReviewConfigFile';
import { ErrorObject } from 'ajv';
import {
    IOrganizationParametersService,
    ORGANIZATION_PARAMETERS_SERVICE_TOKEN,
} from '@/core/domain/organizationParameters/contracts/organizationParameters.service.contract';
import { OrganizationParametersKey } from '@/shared/domain/enums/organization-parameters-key.enum';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { ICodeBaseConfigService } from '@/core/domain/codeBase/contracts/CodeBaseConfigService.contract';
import { KodyRulesValidationService } from '../kodyRules/service/kody-rules-validation.service';
import { ReviewCadenceType } from '@/config/types/general/codeReview.type';
import { ConfigLevel } from '@/config/types/general/pullRequestMessages.type';
import {
    CodeReviewParameter,
    RepositoryCodeReviewConfig,
    GetKodusConfigFileResponse,
    CodeReviewParameterBaseConfig,
    DirectoryCodeReviewConfig,
} from '@/config/types/general/codeReviewConfig.type';
import { deepMerge } from '@/shared/utils/deep';

@Injectable()
export default class CodeBaseConfigService implements ICodeBaseConfigService {
    private readonly DEFAULT_CONFIG: CodeReviewConfig;

    constructor(
        @Inject(INTEGRATION_SERVICE_TOKEN)
        private readonly integrationService: IIntegrationService,

        @Inject(INTEGRATION_CONFIG_SERVICE_TOKEN)
        private readonly integrationConfigService: IIntegrationConfigService,

        @Inject(ORGANIZATION_PARAMETERS_SERVICE_TOKEN)
        private readonly organizationParametersService: IOrganizationParametersService,

        @Inject(PARAMETERS_SERVICE_TOKEN)
        private readonly parametersService: IParametersService,

        @Inject(KODY_RULES_SERVICE_TOKEN)
        private readonly kodyRulesService: IKodyRulesService,

        private readonly codeManagementService: CodeManagementService,

        private readonly kodyRulesValidationService: KodyRulesValidationService,

        private readonly logger: PinoLoggerService,
    ) {
        this.DEFAULT_CONFIG = this.getDefaultConfigs();
    }

    @ValidateCodeManagementIntegration()
    async getConfig(
        organizationAndTeamData: OrganizationAndTeamData,
        repository: { name: string; id: string },
        preliminaryFiles?: FileChange[],
    ): Promise<CodeReviewConfig> {
        try {
            const [
                parameters,
                language,
                defaultBranch,
                kodyRulesEntity,
                reviewModeConfig,
                kodyFineTuningConfig,
            ] = await Promise.all([
                this.parametersService.findOne({
                    configKey: ParametersKey.CODE_REVIEW_CONFIG,
                    team: { uuid: organizationAndTeamData.teamId },
                }),
                this.parametersService.findByKey(
                    ParametersKey.LANGUAGE_CONFIG,
                    organizationAndTeamData,
                ),
                this.getDefaultBranch(organizationAndTeamData, repository),
                this.kodyRulesService.findByOrganizationId(
                    organizationAndTeamData.organizationId,
                ),
                this.getReviewModeConfigParameter(organizationAndTeamData),
                this.getKodyFineTuningConfigParameter(organizationAndTeamData),
            ]);

            const mergedConfigs = await this.getMergedCodeReviewConfigs(
                organizationAndTeamData,
                repository,
                parameters?.configValue,
                defaultBranch,
                preliminaryFiles,
            );

            const kodyRules = this.kodyRulesValidationService.filterKodyRules(
                kodyRulesEntity?.toObject()?.rules,
                repository.id,
                mergedConfigs.directoryId,
            );

            const fullConfig = {
                ...mergedConfigs,
                languageResultPrompt:
                    language?.configValue ??
                    this.DEFAULT_CONFIG.languageResultPrompt,
                baseBranchDefault: defaultBranch,
                kodyRules,
                reviewModeConfig,
                kodyFineTuningConfig,
                ignorePaths: mergedConfigs.ignorePaths.concat(
                    globalIgnorePathsJson?.paths ?? [],
                ),
                // v2-only prompt overrides (categories and severity guidance). Read from repo/global parameters.
                v2PromptOverrides: this.sanitizeV2PromptOverrides(
                    mergedConfigs.v2PromptOverrides,
                ),
            };

            return fullConfig;
        } catch (error) {
            this.logger.error({
                message: 'Error getting code review config parameters',
                context: CodeBaseConfigService.name,
                error,
                metadata: { organizationAndTeamData },
            });
            throw new Error('Error getting code review config parameters');
        }
    }

    private sanitizeV2PromptOverrides(
        overrides: CodeReviewConfig['v2PromptOverrides'],
    ): CodeReviewConfig['v2PromptOverrides'] {
        if (!overrides) return undefined;

        const sanitizeString = (value: any): string | undefined => {
            if (typeof value === 'string' && value.trim().length > 0) {
                return value.trim();
            }
            return undefined;
        };

        const categories = overrides.categories?.descriptions
            ? {
                  descriptions: {
                      bug: sanitizeString(
                          overrides.categories.descriptions.bug,
                      ),
                      performance: sanitizeString(
                          overrides.categories.descriptions.performance,
                      ),
                      security: sanitizeString(
                          overrides.categories.descriptions.security,
                      ),
                  },
              }
            : undefined;

        const severity = overrides.severity?.flags
            ? {
                  flags: {
                      critical: sanitizeString(
                          overrides.severity.flags.critical,
                      ),
                      high: sanitizeString(overrides.severity.flags.high),
                      medium: sanitizeString(overrides.severity.flags.medium),
                      low: sanitizeString(overrides.severity.flags.low),
                  },
              }
            : undefined;

        return {
            categories,
            severity,
        };
    }

    async getMergedCodeReviewConfigs(
        organizationAndTeamData: OrganizationAndTeamData,
        repository: { name: string; id: string },
        parameter: CodeReviewParameter,
        defaultBranch: string,
        preliminaryFiles?: FileChange[],
    ): Promise<CodeReviewConfigWithoutLLMProvider> {
        if (!parameter) {
            return this.DEFAULT_CONFIG;
        }

        const globalDelta = parameter?.configs;

        const repoConfig =
            parameter?.repositories?.find(
                (repo) => repo.id === repository.id,
            ) || ({} as RepositoryCodeReviewConfig);

        const repoDelta = repoConfig?.configs;

        const affectedPaths =
            this.extractUniqueDirectoryPaths(preliminaryFiles);

        const directoryConfig = this.resolveConfigByDirectories(
            organizationAndTeamData,
            repoConfig,
            affectedPaths,
        );

        const directoryDelta = directoryConfig?.configs;

        const repositoryFileDelta = await this.getKodusConfigFile({
            organizationAndTeamData,
            repository,
            defaultBranch,
            overrideConfig: this.getFileOverridePreference(repoConfig),
        });

        const directoryFileDelta = await this.getKodusConfigFile({
            organizationAndTeamData,
            repository,
            directoryPath: directoryConfig?.path,
            defaultBranch,
            overrideConfig: this.getFileOverridePreference(
                repoConfig,
                directoryConfig,
            ),
        });

        const merged = deepMerge(
            this.DEFAULT_CONFIG,
            globalDelta || {},
            repoDelta || {},
            repositoryFileDelta || {},
            directoryDelta || {},
            directoryFileDelta || {},
        );

        let configLevel = ConfigLevel.GLOBAL;
        let directoryId: string | undefined = undefined;
        let directoryPath: string | undefined = undefined;
        if (directoryDelta || directoryFileDelta) {
            configLevel = ConfigLevel.DIRECTORY;
            directoryId = directoryConfig?.id;
            directoryPath = directoryConfig?.path;
        } else if (repoDelta || repositoryFileDelta) {
            configLevel = ConfigLevel.REPOSITORY;
        }

        return {
            ...merged,
            configLevel,
            directoryId,
            directoryPath,
        } as CodeReviewConfigWithoutLLMProvider;
    }

    private getFileOverridePreference(
        repoConfig: RepositoryCodeReviewConfig,
        directoryConfig?: DirectoryCodeReviewConfig,
    ): boolean {
        if (
            directoryConfig &&
            directoryConfig?.configs?.kodusConfigFileOverridesWebPreferences !==
                undefined
        ) {
            return directoryConfig.configs
                .kodusConfigFileOverridesWebPreferences;
        }

        if (
            repoConfig &&
            repoConfig?.configs?.kodusConfigFileOverridesWebPreferences !==
                undefined
        ) {
            return repoConfig.configs.kodusConfigFileOverridesWebPreferences;
        }

        return this.DEFAULT_CONFIG.kodusConfigFileOverridesWebPreferences;
    }

    private getDefaultConfigs(): CodeReviewConfig {
        try {
            const kodusConfigYMLfile = getDefaultKodusConfigFile();

            const DEFAULT_CONFIG = {
                ...kodusConfigYMLfile,
                languageResultPrompt: LanguageValue.ENGLISH,
                kodyRules: [],
            };

            return DEFAULT_CONFIG as CodeReviewConfig;
        } catch (error) {
            this.logger.error({
                message: 'Error getting default config file!',
                context: CodeBaseConfigService.name,
                error,
            });
        }
    }

    @ValidateCodeManagementIntegration()
    async getCodeManagementAuthenticationPlatform(
        organizationAndTeamData: OrganizationAndTeamData,
    ) {
        try {
            const integration = await this.integrationService.findOne({
                organization: { uuid: organizationAndTeamData.organizationId },
                team: { uuid: organizationAndTeamData.teamId },
                integrationCategory: IntegrationCategory.CODE_MANAGEMENT,
                status: true,
            });

            const platform = integration.platform.toLowerCase() as
                | 'github'
                | 'gitlab';
            const authDetails = integration?.authIntegration?.authDetails;
            const accessToken = await this.getAccessToken(
                platform,
                authDetails,
                organizationAndTeamData,
            );
            const integrationConfig = await this.getIntegrationConfig(
                integration.uuid,
                organizationAndTeamData.teamId,
            );

            return {
                codeManagementPat:
                    integrationConfig?.configValue || accessToken,
                platform,
            };
        } catch (error) {
            this.logger.error({
                message: 'Error getting code management pat config',
                context: CodeBaseConfigService.name,
                error,
                metadata: { organizationAndTeamData },
            });
            throw new Error('Error getting code management pat config');
        }
    }

    @ValidateCodeManagementIntegration()
    async getCodeManagementPatConfigAndRepositories(
        organizationAndTeamData: OrganizationAndTeamData,
    ) {
        const config = await this.getCodeManagementBaseConfig(
            organizationAndTeamData,
        );
        return { ...config, codeManagementPat: config.codeManagementPat };
    }

    @ValidateCodeManagementIntegration()
    async getCodeManagementConfigAndRepositories(
        organizationAndTeamData: OrganizationAndTeamData,
    ) {
        const { platform, repositories } =
            await this.getCodeManagementBaseConfig(organizationAndTeamData);
        return { platform, repositories };
    }

    private async getCodeManagementBaseConfig(
        organizationAndTeamData: OrganizationAndTeamData,
    ) {
        try {
            const integration = await this.integrationService.findOne({
                organization: { uuid: organizationAndTeamData.organizationId },
                team: { uuid: organizationAndTeamData.teamId },
                integrationCategory: IntegrationCategory.CODE_MANAGEMENT,
                status: true,
            });

            const platform = integration.platform.toLowerCase() as
                | 'github'
                | 'gitlab';
            const authDetails = integration?.authIntegration?.authDetails;
            const accessToken = await this.getAccessToken(
                platform,
                authDetails,
                organizationAndTeamData,
            );

            const [integrationConfig, integrationConfigRepositories] =
                await Promise.all([
                    this.getIntegrationConfig(
                        integration.uuid,
                        organizationAndTeamData.teamId,
                    ),
                    this.integrationConfigService.findOne({
                        integration: { uuid: integration.uuid },
                        configKey: IntegrationConfigKey.REPOSITORIES,
                        team: { uuid: organizationAndTeamData.teamId },
                    }),
                ]);

            const repositories = await this.processRepositories(
                integrationConfigRepositories?.configValue || [],
                platform,
                integration,
            );

            return {
                codeManagementPat:
                    integrationConfig?.configValue || accessToken,
                platform,
                repositories,
            };
        } catch (error) {
            this.logger.error({
                message:
                    'Error getting code management config with repositories',
                context: CodeBaseConfigService.name,
                error,
                metadata: { organizationAndTeamData },
            });
            throw new Error(
                'Error getting code management config with repositories',
            );
        }
    }

    private async getAccessToken(
        platform: 'github' | 'gitlab',
        authDetails: any,
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<string> {
        if (platform === 'github') {
            return authDetails.authMode === AuthMode.TOKEN
                ? decrypt(authDetails?.authToken)
                : await this.codeManagementService.getAuthenticationOAuthToken({
                      organizationAndTeamData,
                  });
        }

        if (platform === 'gitlab') {
            return authDetails.authMode === AuthMode.TOKEN
                ? decrypt(authDetails?.accessToken)
                : authDetails.accessToken;
        }

        return '';
    }

    private async getIntegrationConfig(
        integrationUuid: string,
        teamId: string,
    ) {
        return this.integrationConfigService.findOne({
            integration: { uuid: integrationUuid },
            configKey: IntegrationConfigKey.CODE_MANAGEMENT_PAT,
            team: { uuid: teamId },
        });
    }

    private async processRepositories(
        repositories: any[],
        platform: string,
        integration: any,
    ) {
        return Promise.all(
            repositories.map(async (repository) => {
                const repositoryPath =
                    platform === 'gitlab'
                        ? repository.name.replace(/\s+/g, '')
                        : `${(integration?.authIntegration?.authDetails?.org || 'NOT FOUND').replace(/\s+/g, '')}/${repository.name.replace(/\s+/g, '')}`;

                return { ...repository, repositoryPath };
            }),
        );
    }

    private async getDefaultBranch(
        organizationAndTeamData: OrganizationAndTeamData,
        repository: { name: string; id: string },
    ): Promise<string> {
        const defaultBranch = await this.codeManagementService.getDefaultBranch(
            { organizationAndTeamData, repository },
        );

        return defaultBranch;
    }

    async getKodusConfigFile(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { id: string; name: string };
        overrideConfig?: boolean;
        directoryPath?: string;
        defaultBranch?: string;
    }): Promise<KodusConfigFile | undefined> {
        const {
            organizationAndTeamData,
            repository,
            directoryPath,
            defaultBranch,
            overrideConfig = true,
        } = params;

        if (!overrideConfig) {
            return;
        }

        const defaultBranchName =
            defaultBranch ||
            (await this.getDefaultBranch(organizationAndTeamData, repository));

        const kodusConfigFileContent = await this.getConfigurationFile(
            organizationAndTeamData,
            repository,
            defaultBranchName,
            directoryPath,
        );

        if (!kodusConfigFileContent) {
            return;
        }

        const kodusConfigYMLfile = yaml.load(
            kodusConfigFileContent,
        ) as KodusConfigFile;

        // strip properties not in default config
        for (const key in kodusConfigYMLfile) {
            if (!(key in this.DEFAULT_CONFIG)) {
                delete kodusConfigYMLfile[key as keyof KodusConfigFile];
            }
        }

        delete kodusConfigYMLfile.version;
        delete kodusConfigYMLfile.kodusConfigFileOverridesWebPreferences;

        return kodusConfigYMLfile;
    }

    private async getConfigurationFile(
        organizationAndTeamData: OrganizationAndTeamData,
        repository: { id: string; name: string },
        defaultBranchName = 'main',
        directoryPath?: string,
    ): Promise<string | null> {
        const configFileName = 'kodus-config.yml';
        let fullPath = configFileName;

        if (directoryPath) {
            const normalizedPath = directoryPath.endsWith('/')
                ? directoryPath
                : `${directoryPath}/`;
            fullPath = `${normalizedPath}${configFileName}`;
        }

        const response =
            await this.codeManagementService.getRepositoryContentFile({
                organizationAndTeamData,
                repository: { id: repository.id, name: repository.name },
                file: { filename: fullPath },
                pullRequest: {
                    head: { ref: defaultBranchName },
                    base: { ref: defaultBranchName },
                },
            });

        if (!response || !response.data || !response.data.content) {
            return null;
        }

        let content = response.data.content;

        if (response.data.encoding === 'base64') {
            content = Buffer.from(content, 'base64').toString('utf-8');
        }

        return content;
    }

    private async getReviewModeConfigParameter(
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<ReviewModeConfig> {
        try {
            const reviewModeConfig =
                await this.organizationParametersService.findByKey(
                    OrganizationParametersKey.REVIEW_MODE_CONFIG,
                    organizationAndTeamData,
                );

            return (
                reviewModeConfig?.configValue?.reviewMode ??
                ReviewModeConfig.LIGHT_MODE_FULL
            );
        } catch (error) {
            this.logger.error({
                message: 'Error getting review mode config',
                error,
                context: CodeBaseConfigService.name,
                metadata: { organizationAndTeamData },
            });

            return ReviewModeConfig.LIGHT_MODE_FULL;
        }
    }

    private async getKodyFineTuningConfigParameter(
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<KodyFineTuningConfig> {
        const kodyFineTuningConfig =
            await this.organizationParametersService.findByKey(
                OrganizationParametersKey.KODY_FINE_TUNING_CONFIG,
                organizationAndTeamData,
            );

        const enableService =
            kodyFineTuningConfig?.configValue?.enabled !== undefined
                ? kodyFineTuningConfig.configValue.enabled
                : true;

        return {
            enabled: enableService,
        };
    }

    private resolveConfigByDirectories(
        organizationAndTeamData: OrganizationAndTeamData,
        repoConfig: RepositoryCodeReviewConfig,
        affectedPaths: string[] = [],
    ): DirectoryCodeReviewConfig | undefined {
        try {
            if (!repoConfig?.directories) {
                return;
            }

            const normalizePath = (path: string): string => {
                return path.startsWith('/') ? path.substring(1) : path;
            };

            const isPathCoveredByDirectory = (
                normalizedDir: string,
                normalizedFile: string,
            ): boolean => {
                if (normalizedDir === '') {
                    return true;
                }

                return (
                    normalizedFile === normalizedDir ||
                    normalizedFile.startsWith(normalizedDir + '/')
                );
            };

            const directoryMatchers = repoConfig.directories.map(
                (dir: any) => ({
                    dir,
                    normalizedPath: normalizePath(dir.path),
                }),
            );

            const matchingDirectories = directoryMatchers.filter(
                ({ normalizedPath }) =>
                    affectedPaths.some((filePath: string) => {
                        const normalizedFile = normalizePath(filePath);
                        return isPathCoveredByDirectory(
                            normalizedPath,
                            normalizedFile,
                        );
                    }),
            );

            const hasNotClassifiedPaths = affectedPaths.some(
                (filePath: string) => {
                    const normalizedFile = normalizePath(filePath);

                    return !matchingDirectories.some(({ normalizedPath }) =>
                        isPathCoveredByDirectory(
                            normalizedPath,
                            normalizedFile,
                        ),
                    );
                },
            );

            // Agrupar diretórios configurados atingidos e sinalizar paths fora de qualquer config
            const groupedDirectories = matchingDirectories.map(
                ({ dir }) => dir,
            );

            if (groupedDirectories.length > 0 && hasNotClassifiedPaths) {
                groupedDirectories.push({ name: 'not classified', path: null });
            }

            if (groupedDirectories.length !== 1) {
                return;
            }

            if (
                groupedDirectories.length === 1 &&
                groupedDirectories[0]?.path !== null
            ) {
                // Apenas um diretório configurado afetado, usar sua config
                return this.buildConfigFromDirectory(
                    groupedDirectories[0],
                    organizationAndTeamData,
                    repository,
                );
            }

            // Múltiplos diretórios configurados afetados, usar config do nível superior
            return this.getConfig(organizationAndTeamData, repository);
        } catch (error) {
            this.logger.error({
                message: 'Error resolving config by directories',
                context: CodeBaseConfigService.name,
                error,
                metadata: { organizationAndTeamData, affectedPaths },
            });

            return;
        }
    }

    async getDirectoryIdForPath(
        organizationAndTeamData: OrganizationAndTeamData,
        repository: { name: string; id: string },
        affectedPath: string,
    ): Promise<string | undefined> {
        try {
            const parameters = await this.parametersService.findByKey(
                ParametersKey.CODE_REVIEW_CONFIG,
                organizationAndTeamData,
            );

            const repoConfig = parameters?.configValue?.repositories?.find(
                (repo) => repo.id === repository.id,
            );

            if (!repoConfig || !repoConfig.directories) {
                return;
            }

            const normalizePath = (path: string): string => {
                return path.startsWith('/') ? path.substring(1) : path;
            };

            const normalizedAffectedPath = normalizePath(affectedPath);

            const matchingDirectories = repoConfig.directories.filter((dir) => {
                const normalizedDirPath = normalizePath(dir.path);

                // The root directory ('/' or '') is always a potential match.
                if (normalizedDirPath === '') {
                    return true;
                }

                // A directory matches if it's identical to the path or is a prefix.
                // e.g., 'foo/bar' matches 'foo/bar' and 'foo/bar/baz.ts'.
                return (
                    normalizedAffectedPath === normalizedDirPath ||
                    normalizedAffectedPath.startsWith(normalizedDirPath + '/')
                );
            });

            if (matchingDirectories.length === 0) {
                return;
            }

            const mostSpecificDirectory = matchingDirectories.reduce(
                (bestMatch, currentDir) => {
                    return currentDir.path.length > bestMatch.path.length
                        ? currentDir
                        : bestMatch;
                },
            );

            return mostSpecificDirectory.id;
        } catch (error) {
            this.logger.error({
                message: 'Error resolving the most specific config for a path',
                context: CodeBaseConfigService.name,
                error,
                metadata: { organizationAndTeamData, affectedPath, repository },
            });

            return;
        }
    }

    private extractUniqueDirectoryPaths(
        files: { filename: string }[],
    ): string[] {
        const paths = new Set<string>();

        files.forEach((file) => {
            const lastSlashIndex = file.filename.lastIndexOf('/');

            if (lastSlashIndex > 0) {
                const directoryPath = file.filename.substring(
                    0,
                    lastSlashIndex,
                );
                paths.add(directoryPath);
            }
        });

        return Array.from(paths);
    }
}
