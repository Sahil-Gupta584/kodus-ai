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
import {
    IUsersService,
    USER_SERVICE_TOKEN,
} from '@/core/domain/user/contracts/user.service.contract';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { CodeReviewSettingsLogEntity } from '@/core/domain/codeReviewSettingsLog/entities/codeReviewSettingsLog.entity';
import { v4 as uuidv4 } from 'uuid';

export interface CodeReviewConfigLogParams {
    organizationAndTeamData: OrganizationAndTeamData;
    userId: string;
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

        @Inject(USER_SERVICE_TOKEN)
        private readonly userService: IUsersService,
    ) {}

    public async logCodeReviewConfig(
        params: CodeReviewConfigLogParams,
    ) {
        const {
            organizationAndTeamData,
            userId,
            oldConfig,
            newConfig,
            actionType,
            configLevel,
            repository,
        } = params;

        const userInfo = await this.getUserInfo(userId);

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
                userId: userId,
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

    private async getUserInfo(userId: string): Promise<UserInfo> {
        const user = await this.userService.findOne({ uuid: userId });
        return {
            userId: user.uuid,
            userEmail: user.email,
        };
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
                !this.isEqual(flatOld[key], flatNew[key])
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
            : this.formatValue(oldValue);
        const formattedNewValue = config.formatter
            ? config.formatter(newValue)
            : this.formatValue(newValue);

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

    private formatValue(value: any): string {
        if (typeof value === 'boolean') {
            return value ? 'enabled' : 'disabled';
        }
        if (Array.isArray(value)) {
            return value.join(', ') || 'none';
        }
        if (value === null || value === undefined) {
            return 'none';
        }
        return String(value);
    }

    private handleSpecialCases(
        oldConfig: any,
        newConfig: any,
        userInfo: UserInfo,
    ): ChangedDataToExport[] {
        const changes: ChangedDataToExport[] = [];

        // Handle automatedReviewActive + reviewCadence combo
        const automatedChanged =
            oldConfig.automatedReviewActive !== newConfig.automatedReviewActive;
        const cadenceChanged = !this.isEqual(
            oldConfig.reviewCadence,
            newConfig.reviewCadence,
        );

        if (automatedChanged || cadenceChanged) {
            const automaticCodeReviewChanges = {
                key: 'automatedReviewActive',
                displayName: 'Enable Automated Code Review',
                previousValue: {
                    primaryValue: oldConfig.automatedReviewActive,
                    secondaryValue: oldConfig.reviewCadence?.type,
                    tertiaryValue:
                        oldConfig.reviewCadence?.type === 'auto_pause'
                            ? `${oldConfig.reviewCadence.pushes} pushes and ${oldConfig.reviewCadence.timeWindow} minutes`
                            : undefined,
                },
                currentValue: {
                    primaryValue: newConfig.automatedReviewActive,
                    secondaryValue: newConfig.reviewCadence?.type,
                    tertiaryValue:
                        newConfig.reviewCadence?.type === 'auto_pause'
                            ? `${newConfig.reviewCadence.pushesToTrigger} pushes and ${newConfig.reviewCadence.timeWindow} minutes`
                            : undefined,
                },
                fieldConfig: { valueType: 'toggle_with_select' },
                description: this.generateAutomatedReviewDescription(
                    oldConfig,
                    newConfig,
                    userInfo,
                ),
            };

            if (automaticCodeReviewChanges?.description?.length > 0) {
                changes.push(automaticCodeReviewChanges);
            }
        }

        // Handle summary toggle with radio buttons
        const summaryToggleChanged =
            oldConfig.summary?.generatePRSummary !==
            newConfig.summary?.generatePRSummary;
        const summaryBehaviourChanged =
            oldConfig.summary?.behaviourForExistingDescription !==
            newConfig.summary?.behaviourForExistingDescription;

        if (summaryToggleChanged && summaryBehaviourChanged) {
            // If both changed, create a special case
            const wasEnabled = oldConfig.summary?.generatePRSummary;
            const isEnabled = newConfig.summary?.generatePRSummary;

            if (!wasEnabled && isEnabled) {
                // Enabled with a specific behavior
                changes.push({
                    key: 'summary.generatePRSummary',
                    displayName: 'Generate PR Summary',
                    previousValue: false,
                    currentValue: {
                        enabled: true,
                        behaviour:
                            newConfig.summary.behaviourForExistingDescription,
                    },
                    description: `User ${userInfo.userEmail} enabled Generate PR Summary with ${this.formatBehaviour(newConfig.summary.behaviourForExistingDescription)} behavior`,
                });
            }
        }

        return changes;
    }

    private generateAutomatedReviewDescription(
        oldConfig: any,
        newConfig: any,
        userInfo: UserInfo,
    ): string {
        const oldPrimary = oldConfig.automatedReviewActive
            ? 'enabled'
            : 'disabled';
        const newPrimary = newConfig.automatedReviewActive
            ? 'enabled'
            : 'disabled';

        const oldSecondary = oldConfig.reviewCadence?.type || 'none';
        const newSecondary = newConfig.reviewCadence?.type || 'none';

        const oldTertiary =
            oldConfig.reviewCadence?.type === 'auto_pause'
                ? `${oldConfig.reviewCadence.pushes} pushes and ${oldConfig.reviewCadence.timeWindow} minutes`
                : undefined;

        const newTertiary =
            newConfig.reviewCadence?.type === 'auto_pause'
                ? `${newConfig.reviewCadence.pushesToTrigger} pushes and ${newConfig.reviewCadence.timeWindow} minutes`
                : undefined;

        if (
            oldPrimary === newPrimary &&
            oldSecondary === newSecondary &&
            oldTertiary === newTertiary
        ) {
            return '';
        }

        let description = `User ${userInfo.userEmail} changed Enable Automated Code Review `;

        if (oldPrimary !== newPrimary) {
            description += `from ${oldPrimary} to ${newPrimary}`;
        } else {
            description += `from ${oldSecondary}${oldTertiary ? `, ${oldTertiary}` : ''} to ${newSecondary}${newTertiary ? `, ${newTertiary}` : ''}`;
        }

        return description;
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

    private isEqual(a: any, b: any): boolean {
        if (a === b) return true;

        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            return a.every((item, index) => this.isEqual(item, b[index]));
        }

        if (a && b && typeof a === 'object' && typeof b === 'object') {
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);

            if (keysA.length !== keysB.length) return false;

            return keysA.every((key) => this.isEqual(a[key], b[key]));
        }

        return false;
    }
}
