import { Injectable, Inject } from '@nestjs/common';
import { IKodyRulesLogHandler } from '@/core/domain/codeReviewSettingsLog/contracts/kodyRulesLog.handler.contract';
import {
    CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN,
    ICodeReviewSettingsLogRepository,
} from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.repository.contract';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import {
    ActionType,
    ConfigLevel,
    KodyRuleActionType
} from '@/config/types/general/codeReviewSettingsLog.type';
import {
    IUsersService,
    USER_SERVICE_TOKEN
} from '@/core/domain/user/contracts/user.service.contract';
import { IKodyRule } from '@/core/domain/kodyRules/interfaces/kodyRules.interface';
import { ChangedDataToExport } from './codeReviewSettingsLog.service';

export interface KodyRuleLogParams {
    organizationAndTeamData: OrganizationAndTeamData;
    userId: string;
    actionType: ActionType;
    repositoryId?: string;
    repositoryName?: string;
    oldRule?: Partial<IKodyRule>;
    newRule?: Partial<IKodyRule>;
    ruleTitle?: string; // Para casos de delete onde só temos o título
}

@Injectable()
export class KodyRulesLogHandler implements IKodyRulesLogHandler {
    constructor(
        @Inject(CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN)
        private readonly codeReviewSettingsLogRepository: ICodeReviewSettingsLogRepository,

        @Inject(USER_SERVICE_TOKEN)
        private readonly userService: IUsersService,
    ) {}

    async logKodyRuleAction(params: KodyRuleLogParams): Promise<void> {
        const {
            organizationAndTeamData,
            userId,
            actionType,
            repositoryId,
            repositoryName,
            oldRule,
            newRule,
            ruleTitle
        } = params;

        // Determinar o nível de configuração baseado no repositoryId
        const configLevel = this.determineConfigLevel(newRule?.repositoryId || oldRule?.repositoryId);

        // Preparar dados do repositório se aplicável
        const repository = this.prepareRepositoryData(repositoryId, repositoryName, configLevel);

        // Gerar dados de mudança baseado no tipo de ação
        const changedData = await this.generateChangedDataByAction(
            actionType,
            oldRule,
            newRule,
            ruleTitle,
            userId
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

    private prepareRepositoryData(
        repositoryId?: string,
        repositoryName?: string,
        configLevel?: ConfigLevel
    ): { id: string; name: string } | undefined {
        if (configLevel === ConfigLevel.REPOSITORY && repositoryId && repositoryName) {
            return {
                id: repositoryId,
                name: repositoryName,
            };
        }
        return undefined;
    }

    private async generateChangedDataByAction(
        actionType: ActionType,
        oldRule?: Partial<IKodyRule>,
        newRule?: Partial<IKodyRule>,
        ruleTitle?: string,
        userId?: string
    ): Promise<ChangedDataToExport[]> {
        const userInfo = await this.getUserInfo(userId);

        switch (actionType) {
            case ActionType.CREATE:
                return this.generateCreateChangedData(newRule!, userInfo);

            case ActionType.EDIT:
                return this.generateUpdateChangedData(oldRule!, newRule!, userInfo);

            case ActionType.DELETE:
                return this.generateDeleteChangedData(oldRule!, ruleTitle, userInfo);

            case ActionType.CLONE:
                return this.generateCloneChangedData(newRule!, userInfo);

            default:
                return [];
        }
    }

    private generateCreateChangedData(
        newRule: Partial<IKodyRule>,
        userInfo: any
    ): ChangedDataToExport[] {
        const isGlobal = newRule.repositoryId === 'global';
        const levelText = isGlobal ? 'global' : 'repository';

        return [{
            key: 'kodyRules.create',
            displayName: 'Kody Rule Created',
            previousValue: null,
            currentValue: {
                title: newRule.title,
                severity: newRule.severity,
                scope: newRule.scope,
                repositoryLevel: !isGlobal,
            },
            fieldConfig: { valueType: 'kody_rule_action' },
            description: `User ${userInfo.userEmail}${userInfo.userName ? ` (${userInfo.userName})` : ''} created Kody Rule "${newRule.title}" with ${newRule.severity} severity at ${levelText} level`,
        }];
    }

    private generateUpdateChangedData(
        oldRule: Partial<IKodyRule>,
        newRule: Partial<IKodyRule>,
        userInfo: any
    ): ChangedDataToExport[] {
        const changes: ChangedDataToExport[] = [];
        const isGlobal = newRule.repositoryId === 'global';
        const levelText = isGlobal ? 'global' : 'repository';

        // Verificar mudanças nos campos principais
        if (oldRule.title !== newRule.title) {
            changes.push({
                key: 'kodyRules.title',
                displayName: 'Kody Rule Title',
                previousValue: oldRule.title,
                currentValue: newRule.title,
                fieldConfig: { valueType: 'text' },
                description: `User ${userInfo.userEmail}${userInfo.userName ? ` (${userInfo.userName})` : ''} changed Kody Rule title from "${oldRule.title}" to "${newRule.title}"`,
            });
        }

        if (oldRule.severity !== newRule.severity) {
            changes.push({
                key: 'kodyRules.severity',
                displayName: 'Kody Rule Severity',
                previousValue: oldRule.severity,
                currentValue: newRule.severity,
                fieldConfig: { valueType: 'severity' },
                description: `User ${userInfo.userEmail}${userInfo.userName ? ` (${userInfo.userName})` : ''} changed Kody Rule "${newRule.title}" severity from ${oldRule.severity} to ${newRule.severity}`,
            });
        }

        if (oldRule.scope !== newRule.scope) {
            changes.push({
                key: 'kodyRules.scope',
                displayName: 'Kody Rule Scope',
                previousValue: oldRule.scope,
                currentValue: newRule.scope,
                fieldConfig: { valueType: 'scope' },
                description: `User ${userInfo.userEmail}${userInfo.userName ? ` (${userInfo.userName})` : ''} changed Kody Rule "${newRule.title}" scope from ${oldRule.scope} to ${newRule.scope}`,
            });
        }

        if (oldRule.rule !== newRule.rule) {
            changes.push({
                key: 'kodyRules.rule',
                displayName: 'Kody Rule Instructions',
                previousValue: oldRule.rule,
                currentValue: newRule.rule,
                fieldConfig: { valueType: 'text' },
                description: `User ${userInfo.userEmail}${userInfo.userName ? ` (${userInfo.userName})` : ''} updated instructions for Kody Rule "${newRule.title}"`,
            });
        }

        if (oldRule.path !== newRule.path) {
            changes.push({
                key: 'kodyRules.path',
                displayName: 'Kody Rule Path',
                previousValue: oldRule.path || '',
                currentValue: newRule.path || '',
                fieldConfig: { valueType: 'text' },
                description: `User ${userInfo.userEmail}${userInfo.userName ? ` (${userInfo.userName})` : ''} changed Kody Rule "${newRule.title}" path from "${oldRule.path || 'none'}" to "${newRule.path || 'none'}"`,
            });
        }

        // Verificar mudanças nos examples
        if (JSON.stringify(oldRule.examples) !== JSON.stringify(newRule.examples)) {
            changes.push({
                key: 'kodyRules.examples',
                displayName: 'Kody Rule Examples',
                previousValue: oldRule.examples,
                currentValue: newRule.examples,
                fieldConfig: { valueType: 'examples' },
                description: `User ${userInfo.userEmail}${userInfo.userName ? ` (${userInfo.userName})` : ''} updated examples for Kody Rule "${newRule.title}"`,
            });
        }

        return changes;
    }

    private generateDeleteChangedData(
        oldRule: Partial<IKodyRule>,
        ruleTitle?: string,
        userInfo?: any
    ): ChangedDataToExport[] {
        const title = ruleTitle || oldRule.title;
        const isGlobal = oldRule.repositoryId === 'global';
        const levelText = isGlobal ? 'global' : 'repository';

        return [{
            key: 'kodyRules.delete',
            displayName: 'Kody Rule Deleted',
            previousValue: {
                title: oldRule.title,
                severity: oldRule.severity,
                scope: oldRule.scope,
                repositoryLevel: !isGlobal,
            },
            currentValue: null,
            fieldConfig: { valueType: 'kody_rule_action' },
            description: `User ${userInfo.userEmail}${userInfo.userName ? ` (${userInfo.userName})` : ''} deleted Kody Rule "${title}" from ${levelText} level`,
        }];
    }

    private generateCloneChangedData(
        newRule: Partial<IKodyRule>,
        userInfo: any
    ): ChangedDataToExport[] {
        const isGlobal = newRule.repositoryId === 'global';
        const levelText = isGlobal ? 'global' : 'repository';

        return [{
            key: 'kodyRules.clone',
            displayName: 'Kody Rule Cloned',
            previousValue: null,
            currentValue: {
                title: newRule.title,
                severity: newRule.severity,
                scope: newRule.scope,
                repositoryLevel: !isGlobal,
                origin: newRule.origin,
            },
            fieldConfig: { valueType: 'kody_rule_action' },
            description: `User ${userInfo.userEmail}${userInfo.userName ? ` (${userInfo.userName})` : ''} cloned Kody Rule "${newRule.title}" from library to ${levelText} level`,
        }];
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
