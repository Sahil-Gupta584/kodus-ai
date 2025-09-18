import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import {
    IOrganizationParametersService,
    ORGANIZATION_PARAMETERS_SERVICE_TOKEN,
} from '@/core/domain/organizationParameters/contracts/organizationParameters.service.contract';
import { OrganizationParametersEntity } from '@/core/domain/organizationParameters/entities/organizationParameters.entity';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { OrganizationParametersKey } from '@/shared/domain/enums/organization-parameters-key.enum';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { encrypt } from '@/shared/utils/crypto';
import { BYOKConfig } from '@kodus/kodus-common/llm';
import { Inject, Injectable } from '@nestjs/common';
import {
    ACTIVITY_LOG_SERVICE_TOKEN,
    IActivityLogService,
} from '@/ee/activityLog/domain/contracts/activity-log.service.contract';
import {
    ILicenseService,
    LICENSE_SERVICE_TOKEN,
} from '@/ee/license/interfaces/license.interface';

@Injectable()
export class CreateOrUpdateOrganizationParametersUseCase implements IUseCase {
    constructor(
        @Inject(ORGANIZATION_PARAMETERS_SERVICE_TOKEN)
        private readonly organizationParametersService: IOrganizationParametersService,
        private readonly logger: PinoLoggerService,
        @Inject(LICENSE_SERVICE_TOKEN)
        private readonly licenseService: ILicenseService,
        @Inject(ACTIVITY_LOG_SERVICE_TOKEN)
        private readonly activityLogService: IActivityLogService,
    ) {}

    async execute(
        organizationParametersKey: OrganizationParametersKey,
        configValue: any,
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<OrganizationParametersEntity | boolean> {
        try {
            let processedConfigValue = configValue;
            if (
                organizationParametersKey ===
                OrganizationParametersKey.BYOK_CONFIG
            ) {
                return await this.saveByokConfig(
                    organizationParametersKey,
                    configValue,
                    organizationAndTeamData,
                );
            }

            return await this.organizationParametersService.createOrUpdateConfig(
                organizationParametersKey,
                processedConfigValue,
                organizationAndTeamData,
            );
        } catch (error) {
            this.logger.error({
                message: 'Error creating or updating organization parameters',
                context: CreateOrUpdateOrganizationParametersUseCase.name,
                error: error,
                metadata: {
                    organizationParametersKey,
                    configValue,
                    organizationAndTeamData,
                },
            });
            throw new Error(
                'Error creating or updating organization parameters',
            );
        }
    }

    private async saveByokConfig(
        organizationParametersKey: OrganizationParametersKey,
        configValue: any,
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<boolean> {
        let processedConfigValue = configValue;
        processedConfigValue = this.encryptByokConfigApiKey(configValue);

        const result =
            await this.organizationParametersService.createOrUpdateConfig(
                organizationParametersKey,
                processedConfigValue,
                organizationAndTeamData,
            );

        if (result) {
            await this.registerByokActivityLog(configValue, organizationAndTeamData);
        }

        return !!result;
    }

    private encryptByokConfigApiKey(configValue: any): BYOKConfig {
        if (!configValue || typeof configValue !== 'object') {
            throw new Error('Invalid BYOK config value');
        }

        const byokConfig = configValue as BYOKConfig;

        if (!byokConfig.main.apiKey) {
            throw new Error('apiKey is required for BYOK config');
        }

        return {
            ...byokConfig,
            main: {
                ...byokConfig.main,
                apiKey: encrypt(byokConfig.main.apiKey),
            },
            fallback: {
                ...byokConfig?.fallback,
                apiKey: byokConfig?.fallback?.apiKey
                    ? encrypt(byokConfig?.fallback?.apiKey)
                    : undefined,
            },
        };
    }

    private async registerByokActivityLog(
        configValue: BYOKConfig,
        organizationAndTeamData: OrganizationAndTeamData,
    ) {
        if (!organizationAndTeamData?.organizationId) {
            return;
        }

        try {
            const validation =
                await this.licenseService.validateOrganizationLicense(
                    organizationAndTeamData,
                );

            if (!this.isEnterprisePlan(validation?.planType)) {
                return;
            }

            await this.activityLogService.record({
                organizationId: organizationAndTeamData.organizationId,
                teamId: organizationAndTeamData.teamId,
                planType: validation.planType,
                feature: 'BYOK',
                action: 'BYOK_UPDATED',
                metadata: {
                    provider: configValue?.main?.provider,
                    fallbackProvider: configValue?.fallback?.provider,
                },
            });
        } catch (error) {
            this.logger.error({
                message: 'Failed to record BYOK activity log',
                context: CreateOrUpdateOrganizationParametersUseCase.name,
                error: error,
                metadata: {
                    organizationAndTeamData,
                },
            });
        }
    }

    private isEnterprisePlan(planType?: string): boolean {
        if (!planType) {
            return false;
        }

        return planType.toLowerCase().includes('enterprise');
    }
}
