import { Inject, Injectable } from '@nestjs/common';
import { ChangedDataToExport } from './codeReviewSettingsLog.service';
import {
    ActionType,
    ConfigLevel,
    PropertyConfig,
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
        const changes: ChangedDataToExport[] = [];

        // Flatten objects for comparison
        const flatOld = this.flattenObject(oldConfig);
        const flatNew = this.flattenObject(newConfig);

        for (const key of Object.keys(flatNew)) {
            // Skip if this key has a config and values are different
            if (
                PROPERTY_CONFIGS[key] &&
                UnifiedLogHandler.hasChanged(flatOld[key], flatNew[key])
            ) {
                changes.push(
                    this.createChangedData(
                        key,
                        flatOld[key],
                        flatNew[key],
                        userInfo,
                    ),
                );
            }
        }

        // Handle special cases
        changes.push(
            ...this.handleSpecialCases(oldConfig, newConfig, userInfo),
        );

        return changes;
    }

    private createChangedData(
        key: string,
        oldValue: any,
        newValue: any,
        userInfo: UserInfo,
    ): ChangedDataToExport {
        const config = PROPERTY_CONFIGS[key];

        return {
            key,
            displayName: config.displayName,
            previousValue: oldValue,
            currentValue: newValue,
            description: this.generateDescription(
                config,
                oldValue,
                newValue,
                userInfo,
            ),
        };
    }

    private generateDescription(
        config: PropertyConfig,
        oldValue: any,
        newValue: any,
        userInfo: UserInfo,
    ): string {
        let template = config.templateDescription;

        // Apply formatter if exists
        const formattedOldValue = config.formatter
            ? config.formatter(oldValue)
            : UnifiedLogHandler.formatValue(oldValue);
        const formattedNewValue = config.formatter
            ? config.formatter(newValue)
            : UnifiedLogHandler.formatValue(newValue);

        // Determine action for toggles
        const action = this.getActionForToggle(oldValue, newValue);

        // Replace placeholders
        template = template.replace('{{userEmail}}', userInfo.userEmail);
        template = template.replace('{{displayName}}', config.displayName);
        template = template.replace('{{oldValue}}', formattedOldValue);
        template = template.replace('{{newValue}}', formattedNewValue);
        template = template.replace('{{action}}', action);

        return template;
    }

    private getActionForToggle(oldValue: any, newValue: any): string {
        if (typeof oldValue === 'boolean' && typeof newValue === 'boolean') {
            if (!oldValue && newValue) return 'enabled';
            if (oldValue && !newValue) return 'disabled';
        }
        return 'changed';
    }

    private handleSpecialCases(
        oldConfig: any,
        newConfig: any,
        userInfo: UserInfo,
    ): ChangedDataToExport[] {
        const changes: ChangedDataToExport[] = [];

        // ✅ Handle automatedReviewActive + reviewCadence combo (simplified)
        const automatedChanged = UnifiedLogHandler.hasChanged(
            oldConfig.automatedReviewActive,
            newConfig.automatedReviewActive,
        );
        const cadenceChanged = UnifiedLogHandler.hasChanged(
            oldConfig.reviewCadence,
            newConfig.reviewCadence,
        );

        if (automatedChanged || cadenceChanged) {
            let description: string;

            if (automatedChanged) {
                // Main toggle changed
                description = newConfig.automatedReviewActive
                    ? `User ${userInfo.userEmail} enabled Automated Code Review`
                    : `User ${userInfo.userEmail} disabled Automated Code Review`;
            } else {
                // Only cadence changed
                description = `User ${userInfo.userEmail} changed Automated Code Review cadence from ${oldConfig.reviewCadence?.type || 'none'} to ${newConfig.reviewCadence?.type || 'none'}`;
            }

            changes.push({
                key: 'automatedReviewActive',
                displayName: 'Automated Code Review',
                previousValue: {
                    automatedReviewActive: oldConfig.automatedReviewActive,
                    reviewCadence: oldConfig.reviewCadence,
                },
                currentValue: {
                    automatedReviewActive: newConfig.automatedReviewActive,
                    reviewCadence: newConfig.reviewCadence,
                },
                description,
            });
        }

        // ✅ Handle summary toggle with behavior (simplified)
        const summaryToggleChanged = UnifiedLogHandler.hasChanged(
            oldConfig.summary?.generatePRSummary,
            newConfig.summary?.generatePRSummary,
        );
        const summaryBehaviourChanged = UnifiedLogHandler.hasChanged(
            oldConfig.summary?.behaviourForExistingDescription,
            newConfig.summary?.behaviourForExistingDescription,
        );

        if (summaryToggleChanged || summaryBehaviourChanged) {
            let description: string;

            if (summaryToggleChanged) {
                // Main toggle changed
                description = newConfig.summary?.generatePRSummary
                    ? `User ${userInfo.userEmail} enabled Generate PR Summary`
                    : `User ${userInfo.userEmail} disabled Generate PR Summary`;
            } else {
                // Only behavior changed
                description = `User ${userInfo.userEmail} changed Generate PR Summary behavior from ${this.formatBehaviour(oldConfig.summary?.behaviourForExistingDescription)} to ${this.formatBehaviour(newConfig.summary?.behaviourForExistingDescription)}`;
            }

            changes.push({
                key: 'summary.generatePRSummary',
                displayName: 'Generate PR Summary',
                previousValue: {
                    generatePRSummary: oldConfig.summary?.generatePRSummary,
                    behaviourForExistingDescription:
                        oldConfig.summary?.behaviourForExistingDescription,
                },
                currentValue: {
                    generatePRSummary: newConfig.summary?.generatePRSummary,
                    behaviourForExistingDescription:
                        newConfig.summary?.behaviourForExistingDescription,
                },
                description,
            });
        }

        return changes;
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
