import {
    ChangedData,
    MenuItem,
    PropertyConfig,
    UserInfo,
    ValueType,
} from '@/config/types/general/codeReviewSettingsLog.type';
import { PROPERTY_CONFIGS } from './propertyMapping.helper';

export type ChangedDataToExport = {
    key: string;
    displayName: string;
    previousValue: any;
    currentValue: any;
    valueType: ValueType;
    description: string;
    menuItem: MenuItem;
};

export class ConfigDiffService {
    generateChangedData(
        oldConfig: any,
        newConfig: any,
        userInfo: UserInfo,
    ): ChangedDataToExport[] {
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
            valueType: config.valueType,
            description: this.generateDescription(
                config,
                oldValue,
                newValue,
                userInfo,
            ),
            menuItem: config.menuItem,
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
        template = template.replace('{{userName}}', userInfo.userName);
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
                valueType: ValueType.TOGGLE_WITH_SELECT,
                description: this.generateAutomatedReviewDescription(
                    oldConfig,
                    newConfig,
                    userInfo,
                ),
                menuItem: MenuItem.GENERAL,
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
                    valueType: ValueType.TOGGLE_WITH_RADIO,
                    description: `User ${userInfo.userName} (${userInfo.userEmail}) enabled Generate PR Summary with ${this.formatBehaviour(newConfig.summary.behaviourForExistingDescription)} behavior`,
                    menuItem: MenuItem.PR_SUMMARY,
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

        let description = `User ${userInfo.userName} (${userInfo.userEmail}) changed Enable Automated Code Review `;

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
