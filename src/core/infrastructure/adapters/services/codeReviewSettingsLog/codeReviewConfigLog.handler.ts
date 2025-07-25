import { Inject, Injectable } from '@nestjs/common';
import { ChangedDataToExport } from './codeReviewSettingsLog.service';
import {
    ActionType,
    ConfigLevel,
    UserInfo,
} from '@/config/types/general/codeReviewSettingsLog.type';
import { PROPERTY_CONFIGS } from './propertyMapping.helper';
import {
    CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN,
    ICodeReviewSettingsLogRepository,
} from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.repository.contract';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { CodeReviewSettingsLogEntity } from '@/core/domain/codeReviewSettingsLog/entities/codeReviewSettingsLog.entity';
import { v4 as uuidv4 } from 'uuid';
import {
    UnifiedLogHandler,
} from './unifiedLog.handler';

export interface CodeReviewConfigLogParams {
    organizationAndTeamData: OrganizationAndTeamData;
    userInfo: UserInfo;
    oldConfig: any;
    newConfig: any;
    actionType: ActionType;
    configLevel: ConfigLevel;
    repository?: { id: string; name: string };
}

@Injectable()
export class CodeReviewConfigLogHandler {
    constructor(
        @Inject(CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN)
        private readonly codeReviewSettingsLogRepository: ICodeReviewSettingsLogRepository,
    ) {}

    public async logCodeReviewConfig(params: CodeReviewConfigLogParams) {
        const {
            organizationAndTeamData,
            userInfo,
            oldConfig,
            newConfig,
            actionType,
            configLevel,
            repository,
        } = params;

        const changes = await this.generateChangedData(
            oldConfig,
            newConfig,
            userInfo,
        );

        const codeReviewSettingsLog = new CodeReviewSettingsLogEntity({
            uuid: uuidv4(),
            organizationId: organizationAndTeamData.organizationId,
            teamId: organizationAndTeamData.teamId,
            action: actionType,
            userInfo: {
                userId: userInfo.userId,
                userEmail: userInfo.userEmail,
            },
            changeMetadata: {
                configLevel: configLevel,
                repository: repository,
            },
            changedData: changes,
        });

        await this.codeReviewSettingsLogRepository.create(
            codeReviewSettingsLog.toObject(),
        );
    }

    private async generateChangedData(
        oldConfig: any,
        newConfig: any,
        userInfo: UserInfo,
    ): Promise<ChangedDataToExport[]> {
        // Collect special changes first to know what to exclude from basic changes
        const specialChanges = this.collectSpecialChanges(oldConfig, newConfig);

        // Collect basic changes, excluding properties handled by special cases
        const excludeFromBasic = this.getPropertiesHandledBySpecialCases(specialChanges);
        const basicChanges = this.collectBasicChanges(oldConfig, newConfig, excludeFromBasic);

        // Combine all changes into one unified changedData
        const allChanges = [...basicChanges, ...specialChanges];

        if (allChanges.length > 0) {
            return [this.createUnifiedChangedData(allChanges, userInfo, oldConfig, newConfig)];
        }

        return [];
    }

    private collectBasicChanges(
        oldConfig: any,
        newConfig: any,
        excludeKeys: string[] = []
    ): Array<{
        key: string;
        oldValue: any;
        newValue: any;
        displayName: string;
        path: string[];
    }> {
        const changes: Array<{
            key: string;
            oldValue: any;
            newValue: any;
            displayName: string;
            path: string[];
        }> = [];

        // Flatten objects for comparison
        const flatOld = this.flattenObject(oldConfig);
        const flatNew = this.flattenObject(newConfig);

        for (const key of Object.keys(flatNew)) {
            if (
                PROPERTY_CONFIGS[key] &&
                !excludeKeys.includes(key) &&
                UnifiedLogHandler.hasChanged(flatOld[key], flatNew[key])
            ) {
                const config = PROPERTY_CONFIGS[key];
                changes.push({
                    key,
                    oldValue: flatOld[key],
                    newValue: flatNew[key],
                    displayName: config.actionDescription,
                    path: key.split('.')
                });
            }
        }

        return changes;
    }

    private getPropertiesHandledBySpecialCases(specialChanges: Array<any>): string[] {
        const excludeKeys: string[] = [];

        specialChanges.forEach(change => {
            if (change.key === 'automatedReviewActive') {
                // Excluir propriedades relacionadas ao automated review
                excludeKeys.push('automatedReviewActive');
                excludeKeys.push('reviewCadence.type');
                excludeKeys.push('reviewCadence.pushesToTrigger');
                excludeKeys.push('reviewCadence.timeWindow');
            }

            if (change.key === 'summary.generatePRSummary') {
                // ✅ Excluir propriedades relacionadas ao PR summary
                excludeKeys.push('summary.generatePRSummary');
                excludeKeys.push('summary.behaviourForExistingDescription');
            }
        });

        return excludeKeys;
    }

    private collectSpecialChanges(oldConfig: any, newConfig: any): Array<{
        displayName: string;
        customDescription: string;
        isSpecial: true;
    }> {
        const changes: Array<{
            displayName: string;
            customDescription: string;
            isSpecial: true;
        }> = [];

        // ✅ Handle automatedReviewActive + reviewCadence combo
        const automatedChanged = UnifiedLogHandler.hasChanged(
            oldConfig.automatedReviewActive,
            newConfig.automatedReviewActive,
        );
        const cadenceChanged = UnifiedLogHandler.hasChanged(
            oldConfig.reviewCadence,
            newConfig.reviewCadence,
        );

        if (automatedChanged || cadenceChanged) {
            // ✅ Validar se realmente houve mudança significativa antes de adicionar
            const hasSignificantChange = this.hasSignificantAutomatedReviewChange(oldConfig, newConfig);
            if (hasSignificantChange) {
                changes.push({
                    displayName: 'Automated Code Review',
                    customDescription: this.getAutomatedReviewCustomDescription(oldConfig, newConfig),
                    isSpecial: true,
                });
            }
        }

        // ✅ Handle summary toggle with behavior
        const summaryToggleChanged = UnifiedLogHandler.hasChanged(
            oldConfig.summary?.generatePRSummary,
            newConfig.summary?.generatePRSummary,
        );
        const summaryBehaviourChanged = UnifiedLogHandler.hasChanged(
            oldConfig.summary?.behaviourForExistingDescription,
            newConfig.summary?.behaviourForExistingDescription,
        );

        if (summaryToggleChanged || summaryBehaviourChanged) {
            // ✅ Validar se realmente houve mudança significativa antes de adicionar
            const hasSignificantChange = this.hasSignificantSummaryChange(oldConfig, newConfig);
            if (hasSignificantChange) {
                changes.push({
                    displayName: 'Generate PR Summary',
                    customDescription: this.getSummaryCustomDescription(oldConfig, newConfig),
                    isSpecial: true,
                });
            }
        }

        return changes;
    }

    private hasSignificantAutomatedReviewChange(oldConfig: any, newConfig: any): boolean {
        // Toggle mudou?
        if (oldConfig.automatedReviewActive !== newConfig.automatedReviewActive) {
            return true;
        }

        // Tipo de cadence mudou?
        const oldType = oldConfig.reviewCadence?.type;
        const newType = newConfig.reviewCadence?.type;
        if (oldType !== newType) {
            return true;
        }

        // Se é auto_pause, parâmetros mudaram?
        if (oldType === 'auto_pause' && newType === 'auto_pause') {
            const oldPushes = oldConfig.reviewCadence?.pushesToTrigger;
            const newPushes = newConfig.reviewCadence?.pushesToTrigger;
            const oldTime = oldConfig.reviewCadence?.timeWindow;
            const newTime = newConfig.reviewCadence?.timeWindow;

            return oldPushes !== newPushes || oldTime !== newTime;
        }

        // Se chegou aqui, não há mudança significativa
        return false;
    }

    private hasSignificantSummaryChange(oldConfig: any, newConfig: any): boolean {
        // Toggle mudou?
        if (oldConfig.summary?.generatePRSummary !== newConfig.summary?.generatePRSummary) {
            return true;
        }

        // Behavior mudou?
        const oldBehavior = oldConfig.summary?.behaviourForExistingDescription;
        const newBehavior = newConfig.summary?.behaviourForExistingDescription;
        return oldBehavior !== newBehavior;
    }

    private createUnifiedChangedData(
        allChanges: Array<any>,
        userInfo: UserInfo,
        oldConfig: any,
        newConfig: any,
    ): ChangedDataToExport {
        // Build complete nested structure for previousValue/currentValue
        const previousValue = this.buildCompleteNestedStructure(allChanges, oldConfig, newConfig, 'oldValue');
        const currentValue = this.buildCompleteNestedStructure(allChanges, oldConfig, newConfig, 'newValue');

        // Generate rich description using PROPERTY_CONFIGS + custom logic
        const description = this.generateRichDescription(allChanges, userInfo.userEmail);

        return {
            key: 'config.update',
            displayName: 'Configuration Updated',
            previousValue,
            currentValue,
            description,
        };
    }

    // ✅ Removed old methods - using new unified approach

    private getAutomatedReviewCustomDescription(oldConfig: any, newConfig: any): string {
        const wasEnabled = oldConfig.automatedReviewActive;
        const isEnabled = newConfig.automatedReviewActive;

        // Primeiro verificar se o toggle principal mudou
        if (!wasEnabled && isEnabled) {
            // Enabled - mostrar tipo específico se for auto_pause
            if (newConfig.reviewCadence?.type === 'auto_pause') {
                const params = newConfig.reviewCadence;
                return `Automated Code Review: enabled with auto_pause (${params?.pushesToTrigger} pushes, ${params?.timeWindow} minutes)`;
            } else {
                return `Automated Code Review: enabled`;
            }
        }

        if (wasEnabled && !isEnabled) {
            return `Automated Code Review: disabled`;
        }

        // Se chegou aqui, o toggle não mudou, então deve ser só cadence
        const oldCadence = oldConfig.reviewCadence?.type || 'none';
        const newCadence = newConfig.reviewCadence?.type || 'none';

        // ✅ Validar se o tipo da cadence realmente mudou
        if (oldCadence !== newCadence) {
            // Para mudanças de tipo, mostrar claramente o que mudou
            if (newCadence === 'auto_pause') {
                const params = newConfig.reviewCadence;
                return `Automated Code Review: changed to auto_pause (${params?.pushesToTrigger} pushes, ${params?.timeWindow} minutes)`;
            } else {
                return `Automated Code Review: changed to ${newCadence}`;
            }
        }

        // ✅ Se o tipo não mudou, verificar mudanças internas (auto_pause params)
        if (oldCadence === 'auto_pause' && newCadence === 'auto_pause') {
            const oldPushes = oldConfig.reviewCadence?.pushesToTrigger;
            const newPushes = newConfig.reviewCadence?.pushesToTrigger;
            const oldTime = oldConfig.reviewCadence?.timeWindow;
            const newTime = newConfig.reviewCadence?.timeWindow;

            if (oldPushes !== newPushes || oldTime !== newTime) {
                return `Automated Code Review: updated auto_pause parameters (${newPushes} pushes, ${newTime} minutes)`;
            }
        }

        // ✅ Se chegou aqui, houve mudança mas não é significativa
        return `Automated Code Review: configuration updated`;
    }

    private getSummaryCustomDescription(oldConfig: any, newConfig: any): string {
        const wasEnabled = oldConfig.summary?.generatePRSummary;
        const isEnabled = newConfig.summary?.generatePRSummary;

        // Primeiro verificar se o toggle principal mudou
        if (!wasEnabled && isEnabled) {
            // Enabled - show behavior
            const behavior = this.formatBehaviour(newConfig.summary?.behaviourForExistingDescription);
            return `Generate PR Summary: enabled with ${behavior} behavior`;
        }

        if (wasEnabled && !isEnabled) {
            return `Generate PR Summary: disabled`;
        }

        // Se chegou aqui, o toggle não mudou, então deve ser só behavior
        const oldBehavior = oldConfig.summary?.behaviourForExistingDescription;
        const newBehavior = newConfig.summary?.behaviourForExistingDescription;

        // ✅ Validar se o behavior realmente mudou
        if (oldBehavior !== newBehavior) {
            const formattedOldBehavior = this.formatBehaviour(oldBehavior);
            const formattedNewBehavior = this.formatBehaviour(newBehavior);
            return `Generate PR Summary: behavior changed from ${formattedOldBehavior} to ${formattedNewBehavior}`;
        }

        // ✅ Se chegou aqui, houve mudança mas não é significativa
        return `Generate PR Summary: configuration updated`;
    }

    // ✅ Removido formatCadenceDetails - lógica específica em cada contexto

    private buildCompleteNestedStructure(
        allChanges: Array<any>,
        oldConfig: any,
        newConfig: any,
        valueType: 'oldValue' | 'newValue'
    ): any {
        const result = {};

        // Add basic changes with nested structure
        const basicChanges = allChanges.filter(change => !change.isSpecial);
        basicChanges.forEach(change => {
            const value = change[valueType];
            const path = change.path;

            // Create nested structure
            let current = result;
            for (let i = 0; i < path.length - 1; i++) {
                if (!current[path[i]]) {
                    current[path[i]] = {};
                }
                current = current[path[i]];
            }

            // Set the final value
            current[path[path.length - 1]] = value;
        });

        // Add special cases to nested structure
        const specialChanges = allChanges.filter(change => change.isSpecial);
        specialChanges.forEach(change => {
            if (change.key === 'automatedReviewActive') {
                // Use correct config based on valueType
                const sourceConfig = valueType === 'oldValue' ? oldConfig : newConfig;
                result['automatedReviewActive'] = sourceConfig.automatedReviewActive;
                result['reviewCadence'] = sourceConfig.reviewCadence;
            }

            if (change.key === 'summary.generatePRSummary') {
                if (!result['summary']) result['summary'] = {};
                const sourceConfig = valueType === 'oldValue' ? oldConfig : newConfig;
                result['summary']['generatePRSummary'] = sourceConfig.summary?.generatePRSummary;
                result['summary']['behaviourForExistingDescription'] = sourceConfig.summary?.behaviourForExistingDescription;
            }
        });

        return result;
    }

    private generateRichDescription(allChanges: Array<any>, userEmail: string): string {
        if (allChanges.length === 1) {
            // Single change: extract description
            const change = allChanges[0];

            if (change.isSpecial) {
                return `User ${userEmail} changed ${change.customDescription}`;
            } else {
                // Use PROPERTY_CONFIGS formatter
                const config = PROPERTY_CONFIGS[change.key];
                const formattedOld = config.formatter
                    ? config.formatter(change.oldValue)
                    : UnifiedLogHandler.formatValue(change.oldValue);
                const formattedNew = config.formatter
                    ? config.formatter(change.newValue)
                    : UnifiedLogHandler.formatValue(change.newValue);

                return `User ${userEmail} changed ${config.actionDescription} from ${formattedOld} to ${formattedNew}`;
            }
        }

        // Multiple changes: bullet list with rich descriptions
        const header = `User ${userEmail} changed code review configuration`;
        const bullets = allChanges.map(change => {
            if (change.isSpecial) {
                return `- ${change.customDescription}`;
            } else {
                // Use PROPERTY_CONFIGS formatter for basic changes
                const config = PROPERTY_CONFIGS[change.key];
                const formattedOld = config.formatter
                    ? config.formatter(change.oldValue)
                    : UnifiedLogHandler.formatValue(change.oldValue);
                const formattedNew = config.formatter
                    ? config.formatter(change.newValue)
                    : UnifiedLogHandler.formatValue(change.newValue);

                return `- ${config.actionDescription}: from ${formattedOld} to ${formattedNew}`;
            }
        }).join('\n');

        return `${header}\n${bullets}`;
    }

    private formatBehaviour(behaviour: string): string {
        const behaviourLabels = {
            concatenate: 'Concatenate',
            complement: 'Complement',
            replace: 'Replace',
        };
        return behaviourLabels[behaviour] || behaviour;
    }

    private flattenObject(obj: any, prefix: string = ''): Record<string, any> {
        let flattened: Record<string, any> = {};

        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const newKey = prefix ? `${prefix}.${key}` : key;

                if (
                    obj[key] !== null &&
                    typeof obj[key] === 'object' &&
                    !Array.isArray(obj[key])
                ) {
                    Object.assign(
                        flattened,
                        this.flattenObject(obj[key], newKey),
                    );
                } else {
                    flattened[newKey] = obj[key];
                }
            }
        }

        return flattened;
    }
}
