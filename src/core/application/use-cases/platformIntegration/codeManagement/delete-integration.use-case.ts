import { Inject, Injectable } from '@nestjs/common';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { IntegrationCategory } from '@/shared/domain/enums/integration-category.enum';
import { AuthIntegrationService } from '@/core/infrastructure/adapters/services/integrations/authIntegration.service';
import { INTEGRATION_SERVICE_TOKEN } from '@/core/domain/integrations/contracts/integration.service.contracts';
import { IntegrationConfigService } from '@/core/infrastructure/adapters/services/integrations/integrationConfig.service';
import { IntegrationService } from '@/core/infrastructure/adapters/services/integrations/integration.service';
import { AUTH_INTEGRATION_SERVICE_TOKEN } from '@/core/domain/authIntegrations/contracts/auth-integration.service.contracts';
import { INTEGRATION_CONFIG_SERVICE_TOKEN } from '@/core/domain/integrationConfigs/contracts/integration-config.service.contracts';
import { IntegrationConfigKey } from '@/shared/domain/enums/Integration-config-key.enum';

@Injectable()
export class DeleteIntegrationUseCase {
    constructor(
        private readonly codeManagementService: CodeManagementService,

        @Inject(INTEGRATION_SERVICE_TOKEN)
        private readonly integrationService: IntegrationService,

        @Inject(AUTH_INTEGRATION_SERVICE_TOKEN)
        private readonly authIntegrationService: AuthIntegrationService,

        @Inject(INTEGRATION_CONFIG_SERVICE_TOKEN)
        private readonly integrationConfigService: IntegrationConfigService,
    ) {}

    async execute(params: {
        organizationId: string;
        teamId: string;
    }): Promise<void> {
        const integration = await this.integrationService.findOne({
            organization: { uuid: params.organizationId },
            team: { uuid: params.teamId },
            integrationCategory: IntegrationCategory.CODE_MANAGEMENT,
            status: true,
        });

        if (!integration) {
            return;
        }

        await this.codeManagementService.deleteIntegration({
            organizationAndTeamData: {
                organizationId: params.organizationId,
                teamId: params.teamId,
            },
        });

        const integrationConfig = await this.integrationConfigService.findOne({
            configKey: IntegrationConfigKey.REPOSITORIES,
            configValue: [
                {
                    id: integration.authIntegration.authDetails.installationId,
                },
            ],
        });

        if (integrationConfig) {
            await this.integrationConfigService.delete(integrationConfig.uuid);
        }

        await this.integrationService.delete(integration.uuid);

        await this.authIntegrationService.delete(
            integration.authIntegration.uuid,
        );
    }
}
