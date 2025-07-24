import { Injectable } from '@nestjs/common';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import {
    ActionType,
    ConfigLevel,
    UserInfo,
} from '@/config/types/general/codeReviewSettingsLog.type';
import { IKodyRule } from '@/core/domain/kodyRules/interfaces/kodyRules.interface';
import { UnifiedLogHandler, UnifiedLogParams } from './unifiedLog.handler';

export interface KodyRuleLogParams {
    organizationAndTeamData: OrganizationAndTeamData;
    userInfo: UserInfo;
    actionType: ActionType;
    repositoryId?: string;
    oldRule?: Partial<IKodyRule>;
    newRule?: Partial<IKodyRule>;
    ruleTitle?: string;
}

@Injectable()
export class KodyRulesLogHandler {
    constructor(
        private readonly unifiedLogHandler: UnifiedLogHandler,
    ) {}

    async logKodyRuleAction(params: KodyRuleLogParams): Promise<void> {
        const {
            organizationAndTeamData,
            userInfo,
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
        const repository = {
            id: repositoryId,
            name: '',
        };

        // Usar o handler unificado com dados simplificados
        const unifiedParams: UnifiedLogParams = {
            organizationAndTeamData,
            userInfo,
            actionType,
            configLevel,
            repository,
            entityType: 'Kody Rule',
            entityName: newRule?.title || oldRule?.title || ruleTitle,
            oldData: oldRule || null,
            newData: newRule || null,
        };

        await this.unifiedLogHandler.logAction(unifiedParams);
    }

    private determineConfigLevel(repositoryId?: string): ConfigLevel {
        if (!repositoryId || repositoryId === 'global') {
            return ConfigLevel.GLOBAL;
        }
        return ConfigLevel.REPOSITORY;
    }
}
