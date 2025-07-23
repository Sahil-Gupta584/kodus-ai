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
import { ChangedDataToExport } from './codeReviewSettingsLog.service';

interface IIntegration {
    uuid: string;
    platform: string;
    integrationCategory: string;
    status: boolean;
    authIntegration: {
        uuid: string;
        authDetails: {
            org?: string;
            authMode?: string;
            accountType?: string;
        };
    };
}

export interface IntegrationLogParams {
    organizationAndTeamData: OrganizationAndTeamData;
    userId: string;
    integration: IIntegration;
    actionType: ActionType;
}

@Injectable()
export class IntegrationLogHandler {
    constructor(
        @Inject(CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN)
        private readonly codeReviewSettingsLogRepository: ICodeReviewSettingsLogRepository,

        @Inject(USER_SERVICE_TOKEN)
        private readonly userService: IUsersService,
    ) {}

    async logIntegrationAction(params: IntegrationLogParams): Promise<void> {
        const {
            organizationAndTeamData,
            userId,
            integration,
            actionType,
        } = params;

        const userInfo = await this.getUserInfo(userId);

        const changedData = this.generateChangedDataByAction(
            actionType,
            integration,
            userInfo,
        );

        await this.codeReviewSettingsLogRepository.create({
            organizationId: organizationAndTeamData.organizationId,
            teamId: organizationAndTeamData.teamId,
            action: actionType,
            userInfo,
            changeMetadata: {
                configLevel: ConfigLevel.GLOBAL,
                repository: undefined,
            },
            changedData,
        });
    }

    private generateChangedDataByAction(
        actionType: ActionType,
        integration: IIntegration,
        userInfo: any,
    ): ChangedDataToExport[] {
        switch (actionType) {
            case ActionType.CREATE:
                return this.generateAddChangedData(integration, userInfo);

            case ActionType.DELETE:
                return this.generateDeleteChangedData(integration, userInfo);

            default:
                return [];
        }
    }

    private generateAddChangedData(
        integration: IIntegration,
        userInfo: any,
    ): ChangedDataToExport[] {
        return [
            {
                key: 'integration.add',
                displayName: 'Integration Added',
                previousValue: null,
                currentValue: {
                    platform: integration.platform,
                    integrationCategory: integration.integrationCategory,
                    organizationName: integration.authIntegration?.authDetails?.org,
                    accountType: integration.authIntegration?.authDetails?.accountType,
                    authMode: integration.authIntegration?.authDetails?.authMode,
                },
                fieldConfig: { valueType: 'integration_action' },
                description: `User ${userInfo.userEmail}${userInfo.userName ? ` (${userInfo.userName})` : ''} added ${this.formatPlatformName(integration.platform)} integration${integration.authIntegration?.authDetails?.org ? ` for organization "${integration.authIntegration.authDetails.org}"` : ''}`,
            },
        ];
    }

    private generateDeleteChangedData(
        integration: IIntegration,
        userInfo: any,
    ): ChangedDataToExport[] {
        return [
            {
                key: 'integration.remove',
                displayName: 'Integration Removed',
                previousValue: {
                    platform: integration.platform,
                    integrationCategory: integration.integrationCategory,
                    organizationName: integration.authIntegration?.authDetails?.org,
                    accountType: integration.authIntegration?.authDetails?.accountType,
                    authMode: integration.authIntegration?.authDetails?.authMode,
                },
                currentValue: null,
                fieldConfig: { valueType: 'integration_action' },
                description: `User ${userInfo.userEmail}${userInfo.userName ? ` (${userInfo.userName})` : ''} removed ${this.formatPlatformName(integration.platform)} integration${integration.authIntegration?.authDetails?.org ? ` for organization "${integration.authIntegration.authDetails.org}"` : ''}`,
            },
        ];
    }

    private formatPlatformName(platform: string): string {
        const platformNames = {
            GITHUB: 'GitHub',
            GITLAB: 'GitLab',
            BITBUCKET: 'Bitbucket',
            AZURE: 'Azure DevOps',
        };
        return platformNames[platform] || platform;
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
