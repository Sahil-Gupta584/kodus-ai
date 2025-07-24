import { AuthMode } from '@/core/domain/platformIntegrations/enums/codeManagement/authMode.enum';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Inject, Injectable } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import {
    ICodeReviewSettingsLogService,
    CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN,
} from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.service.contract';
import { ActionType } from '@/config/types/general/codeReviewSettingsLog.type';
import {
    AUTH_INTEGRATION_SERVICE_TOKEN,
    IAuthIntegrationService,
} from '@/core/domain/authIntegrations/contracts/auth-integration.service.contracts';

@Injectable()
export class CreateIntegrationUseCase implements IUseCase {
    constructor(
        private readonly codeManagementService: CodeManagementService,

        @Inject(CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN)
        private readonly codeReviewSettingsLogService: ICodeReviewSettingsLogService,

        @Inject(REQUEST)
        private readonly request: Request & {
            user: {
                organization: { uuid: string };
                uuid: string;
                email: string;
            };
        },

        @Inject(AUTH_INTEGRATION_SERVICE_TOKEN)
        private readonly authIntegrationService: IAuthIntegrationService,

        private readonly logger: PinoLoggerService,
    ) {}

    public async execute(params: any): Promise<any> {
        const authMode = params?.authMode ?? AuthMode.OAUTH;

        const organizationAndTeamData = {
            organizationId:
                params?.organizationAndTeamData?.organizationId ||
                this.request.user?.organization?.uuid,
            teamId: params?.organizationAndTeamData?.teamId,
        };

        const result = await this.codeManagementService.createAuthIntegration(
            {
                ...params,
                organizationAndTeamData,
                authMode,
            },
            params.integrationType,
        );

        try {
            const authIntegration = await this.authIntegrationService.findOne({
                organization: {
                    uuid: this.request.user.organization.uuid,
                },
                team: {
                    uuid: organizationAndTeamData.teamId,
                },
            });

            await this.codeReviewSettingsLogService.registerIntegrationLog({
                organizationAndTeamData: {
                    organizationId: this.request.user.organization.uuid,
                    teamId: organizationAndTeamData.teamId,
                },
                userInfo: {
                    userId: this.request.user.uuid,
                    userEmail: this.request.user.email,
                },
                integration: {
                    uuid: 'temp-uuid',
                    platform:
                        params.integrationType?.toUpperCase() || 'UNKNOWN',
                    integrationCategory: 'CODE_MANAGEMENT',
                    status: true,
                    authIntegration: {
                        uuid: 'temp-auth-uuid',
                        authDetails: {
                            org: authIntegration?.authDetails?.org,
                            authMode: authMode,
                            accountType:
                                authIntegration?.authDetails?.accountType,
                        },
                    },
                },
                actionType: ActionType.CREATE,
            });
        } catch (error) {
            this.logger.error({
                message: 'Error saving code review settings log',
                error: error,
                context: CreateIntegrationUseCase.name,
                metadata: {
                    organizationAndTeamData: organizationAndTeamData,
                },
            });
        }

        return result;
    }
}
