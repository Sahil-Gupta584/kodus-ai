import { Injectable, Inject } from '@nestjs/common';
import {
    CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN,
    ICodeReviewSettingsLogRepository,
} from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.repository.contract';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import {
    ActionType,
    ConfigLevel,
} from '@/config/types/general/codeReviewSettingsLog.type';
import {
    IUsersService,
    USER_SERVICE_TOKEN,
} from '@/core/domain/user/contracts/user.service.contract';
import { IKodyRule } from '@/core/domain/kodyRules/interfaces/kodyRules.interface';
import { ChangedDataToExport } from './codeReviewSettingsLog.service';
import {
    IIntegrationConfigService,
    INTEGRATION_CONFIG_SERVICE_TOKEN,
} from '@/core/domain/integrationConfigs/contracts/integration-config.service.contracts';
import {
    ITeamService,
    TEAM_SERVICE_TOKEN,
} from '@/core/domain/team/contracts/team.service.contract';
import { IntegrationConfigKey } from '@/shared/domain/enums/Integration-config-key.enum';

export interface KodyRuleLogParams {
    organizationAndTeamData: OrganizationAndTeamData;
    userId: string;
    actionType: ActionType;
    repositoryId?: string;
    oldRule?: Partial<IKodyRule>;
    newRule?: Partial<IKodyRule>;
    ruleTitle?: string;
}

@Injectable()
export class KodyRulesLogHandler {
    constructor(
        @Inject(CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN)
        private readonly codeReviewSettingsLogRepository: ICodeReviewSettingsLogRepository,

        @Inject(USER_SERVICE_TOKEN)
        private readonly userService: IUsersService,

        @Inject(INTEGRATION_CONFIG_SERVICE_TOKEN)
        private readonly integrationConfigService: IIntegrationConfigService,

        @Inject(TEAM_SERVICE_TOKEN)
        private readonly teamService: ITeamService,
    ) {}

    async logKodyRuleAction(params: KodyRuleLogParams): Promise<void> {
        const {
            organizationAndTeamData,
            userId,
            actionType,
            repositoryId,
            oldRule,
            newRule,
            ruleTitle,
        } = params;

        // Determinar o nível de configuração baseado no repositoryId
        const configLevel = this.determineConfigLevel(
            newRule?.repositoryId || oldRule?.repositoryId,
        );

        // Preparar dados do repositório se aplicável
        const repository = await this.identifyRepository(
            repositoryId,
            organizationAndTeamData,
        );

        // Gerar dados de mudança baseado no tipo de ação
        const changedData = await this.generateChangedDataByAction(
            actionType,
            oldRule,
            newRule,
            ruleTitle,
            userId,
            repository,
        );

        // Salvar no log usando o repository diretamente
        await this.codeReviewSettingsLogRepository.create({
            organizationId: organizationAndTeamData.organizationId,
            teamId: organizationAndTeamData.teamId,
            action: actionType,
            userInfo: await this.getUserInfo(userId),
            changeMetadata: {
                configLevel,
                repository,
            },
            changedData,
        });
    }

    private determineConfigLevel(repositoryId?: string): ConfigLevel {
        if (!repositoryId || repositoryId === 'global') {
            return ConfigLevel.GLOBAL;
        }
        return ConfigLevel.REPOSITORY;
    }

    private async identifyRepository(
        repositoryId?: string,
        organizationAndTeamData?: OrganizationAndTeamData,
    ): Promise<{ id: string; name: string } | undefined> {
        if (!repositoryId || repositoryId === 'global') {
            return undefined;
        }

        if (!organizationAndTeamData?.teamId) {
            // Buscar todos os times com integrações de CODE_MANAGEMENT
            const teams = await this.teamService.findTeamsWithIntegrations({
                organizationId: organizationAndTeamData.organizationId,
            });

            for (const team of teams) {
                if (!team.hasCodeManagement) continue;

                const repository = await this.findRepositoryInTeam(
                    team.uuid,
                    repositoryId,
                    organizationAndTeamData.organizationId,
                );
                if (repository) {
                    return repository;
                }
            }

            return undefined;
        } else {
            // Buscar no time específico
            return await this.findRepositoryInTeam(
                organizationAndTeamData.teamId,
                repositoryId,
                organizationAndTeamData.organizationId,
            );
        }
    }

    private async findRepositoryInTeam(
        teamId: string,
        repositoryId: string,
        organizationId?: string,
    ): Promise<{ id: string; name: string } | undefined> {
        try {
            // Buscar integração de CODE_MANAGEMENT para este time
            const integration =
                await this.integrationConfigService.findOneIntegrationConfigWithIntegrations(
                    IntegrationConfigKey.REPOSITORIES,
                    {
                        organizationId: organizationId || '',
                        teamId: teamId,
                    },
                );

            if (!integration || !integration.configValue) {
                return undefined;
            }

            // Buscar o repositório específico no configValue
            const repositories = integration.configValue as Array<{
                id: string;
                name: string;
            }>;
            const repository = repositories.find(
                (repo) => repo.id === repositoryId,
            );

            if (repository) {
                return {
                    id: repository.id,
                    name: repository.name,
                };
            }

            return undefined;
        } catch (error) {
            console.error('Error finding repository in team:', error);
            return undefined;
        }
    }

    private async generateChangedDataByAction(
        actionType: ActionType,
        oldRule?: Partial<IKodyRule>,
        newRule?: Partial<IKodyRule>,
        ruleTitle?: string,
        userId?: string,
        repository?: { id: string; name: string },
    ): Promise<ChangedDataToExport[]> {
        const userInfo = await this.getUserInfo(userId);

        switch (actionType) {
            case ActionType.CREATE:
                return this.generateCreateChangedData(
                    newRule!,
                    userInfo,
                    repository,
                );

            case ActionType.EDIT:
                return this.generateUpdateChangedData(
                    oldRule!,
                    newRule!,
                    userInfo,
                );

            case ActionType.DELETE:
                return this.generateDeleteChangedData(
                    oldRule!,
                    ruleTitle,
                    userInfo,
                    repository,
                );

            case ActionType.CLONE:
                return this.generateCloneChangedData(
                    newRule!,
                    userInfo,
                    repository,
                );

            default:
                return [];
        }
    }

    private generateCreateChangedData(
        newRule: Partial<IKodyRule>,
        userInfo: any,
        repository?: { id: string; name: string },
    ): ChangedDataToExport[] {
        const isGlobal = newRule.repositoryId === 'global';
        const levelText = isGlobal
            ? 'global level'
            : `repository ${repository?.name}`;

        return [
            {
                key: 'kodyRules.create',
                displayName: 'Kody Rule Created',
                previousValue: null,
                currentValue: {
                    title: newRule.title,
                    scope: newRule.scope,
                    path: newRule?.path ?? '',
                    instructions: newRule.rule,
                    severity: newRule.severity,
                    examples: newRule?.examples ?? [],
                    origin: newRule.origin,
                },
                fieldConfig: { valueType: 'kody_rule_action' },
                description: `User ${userInfo.userEmail}${userInfo.userName ? ` (${userInfo.userName})` : ''} created Kody Rule "${newRule.title}" with ${newRule.severity} severity at ${levelText}`,
            },
        ];
    }

    private generateUpdateChangedData(
        oldRule: Partial<IKodyRule>,
        newRule: Partial<IKodyRule>,
        userInfo: any,
    ): ChangedDataToExport[] {
        const isGlobal = newRule.repositoryId === 'global';
        const levelText = isGlobal ? 'global level' : 'repository';

        // Verificar quais campos foram alterados
        const changedFields: string[] = [];

        if (oldRule.title !== newRule.title) {
            changedFields.push(`title from "${oldRule.title}" to "${newRule.title}"`);
        }

        if (oldRule.severity !== newRule.severity) {
            changedFields.push(`severity from "${oldRule.severity}" to "${newRule.severity}"`);
        }

        if (oldRule.scope !== newRule.scope) {
            changedFields.push(`scope from "${oldRule.scope}" to "${newRule.scope}"`);
        }

        if (oldRule.rule !== newRule.rule) {
            changedFields.push(`instructions from "${oldRule.rule}" to "${newRule.rule}"`);
        }

        if (oldRule.path !== newRule.path) {
            changedFields.push(`path from "${oldRule.path || 'none'}" to "${newRule.path || 'none'}"`);
        }

        if (JSON.stringify(oldRule.examples) !== JSON.stringify(newRule.examples)) {
            changedFields.push(`examples from "${JSON.stringify(oldRule.examples)}" to "${JSON.stringify(newRule.examples)}"`);
        }

        // Se não houve mudanças, retorna array vazio
        if (changedFields.length === 0) {
            return [];
        }

        // Criar descrição consolidada
        const baseDescription = `User ${userInfo.userEmail}${userInfo.userName ? ` (${userInfo.userName})` : ''} edited Kody Rule "${newRule.title}" at ${levelText}:`;
        const changesDescription = changedFields.map(change => `- ${change}`).join('\n');
        const fullDescription = `${baseDescription}\n${changesDescription}`;

        return [
            {
                key: 'kodyRules.edit',
                displayName: 'Kody Rule Edited',
                previousValue: {
                    title: oldRule.title,
                    scope: oldRule.scope,
                    path: oldRule.path,
                    instructions: oldRule.rule,
                    severity: oldRule.severity,
                    examples: oldRule.examples,
                    origin: oldRule.origin,
                },
                currentValue: {
                    title: newRule.title,
                    scope: newRule.scope,
                    path: newRule.path,
                    instructions: newRule.rule,
                    severity: newRule.severity,
                    examples: newRule.examples,
                    origin: newRule.origin,
                },
                fieldConfig: { valueType: 'kody_rule_action' },
                description: fullDescription,
            },
        ];
    }

    private generateDeleteChangedData(
        oldRule: Partial<IKodyRule>,
        ruleTitle?: string,
        userInfo?: any,
        repository?: { id: string; name: string },
    ): ChangedDataToExport[] {
        const title = ruleTitle || oldRule.title;
        const isGlobal = oldRule.repositoryId === 'global';
        const levelText = isGlobal ? 'global level' : `repository ${repository?.name}`;

        return [
            {
                key: 'kodyRules.delete',
                displayName: 'Kody Rule Deleted',
                previousValue: {
                    title: oldRule.title,
                    scope: oldRule.scope,
                    path: oldRule.path,
                    instructions: oldRule.rule,
                    severity: oldRule.severity,
                    examples: oldRule.examples,
                    origin: oldRule.origin,
                },
                currentValue: null,
                fieldConfig: { valueType: 'kody_rule_action' },
                description: `User ${userInfo.userEmail}${userInfo.userName ? ` (${userInfo.userName})` : ''} deleted Kody Rule "${title}" from ${levelText}`,
            },
        ];
    }

    private generateCloneChangedData(
        newRule: Partial<IKodyRule>,
        userInfo: any,
        repository?: { id: string; name: string },
    ): ChangedDataToExport[] {
        const isGlobal = newRule.repositoryId === 'global';
        const levelText = isGlobal
        ? 'global level'
        : `repository ${repository?.name}`;

        return [
            {
                key: 'kodyRules.clone',
                displayName: 'Kody Rule Cloned',
                previousValue: null,
                currentValue: {
                    title: newRule.title,
                    scope: newRule.scope,
                    path: newRule?.path ?? '',
                    instructions: newRule.rule,
                    severity: newRule.severity,
                    examples: newRule?.examples ?? [],
                    origin: newRule.origin,
                },
                fieldConfig: { valueType: 'kody_rule_action' },
                description: `User ${userInfo.userEmail}${userInfo.userName ? ` (${userInfo.userName})` : ''} cloned Kody Rule "${newRule.title}" from library to ${levelText}`,
            },
        ];
    }

    private async getUserInfo(userId: string): Promise<any> {
        const user = await this.userService.findOne({ uuid: userId });
        return {
            userId: user.uuid,
            userName: user?.teamMember?.[0]?.name,
            userEmail: user.email,
        };
    }
}
