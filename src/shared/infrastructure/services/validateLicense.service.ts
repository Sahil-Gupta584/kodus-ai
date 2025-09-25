import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { LicenseService } from '@/ee/license/license.service';
import { Inject, Injectable } from '@nestjs/common';
import { environment } from '@/ee/configs/environment';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { BYOKConfig } from '@kodus/kodus-common/dist/llm/byokProvider.service';
import { OrganizationParametersKey } from '@/shared/domain/enums/organization-parameters-key.enum';
import {
    IOrganizationParametersService,
    ORGANIZATION_PARAMETERS_SERVICE_TOKEN,
} from '@/core/domain/organizationParameters/contracts/organizationParameters.service.contract';

@Injectable()
export class ValidateLicenseService {
    public readonly isCloud: boolean;
    public readonly isDevelopment: boolean;

    constructor(
        private readonly licenseService: LicenseService,
        private logger: PinoLoggerService,

        @Inject(ORGANIZATION_PARAMETERS_SERVICE_TOKEN)
        private readonly organizationParametersService: IOrganizationParametersService,
    ) {
        this.isCloud = environment.API_CLOUD_MODE;
        this.isDevelopment = environment.API_DEVELOPMENT_MODE;
    }

    async validateLicense(
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<Boolean> {
        try {
            if (!this.isDevelopment) {
                if (this.isCloud) {
                    const validation =
                        await this.licenseService.validateOrganizationLicense(
                            organizationAndTeamData,
                        );

                    if (!validation?.valid) {
                        this.logger.warn({
                            message: `License not active`,
                            context: ValidateLicenseService.name,
                            metadata: {
                                organizationAndTeamData,
                            },
                        });

                        return false;
                    }

                    const planType = validation?.planType;

                    const needsBYOK =
                        planType?.includes('byok') ||
                        planType?.includes('free');

                    if (needsBYOK) {
                        const byokConfig =
                            await this.organizationParametersService.findByKey(
                                OrganizationParametersKey.BYOK_CONFIG,
                                organizationAndTeamData,
                            );

                        if (!byokConfig) {
                            this.logger.warn({
                                message: `BYOK required but not configured for plan ${planType}`,
                                context: ValidateLicenseService.name,
                                metadata: {
                                    organizationAndTeamData,
                                    planType,
                                },
                            });
                            return false;
                        }

                        return true;
                    }

                    if (
                        validation?.valid &&
                        validation?.subscriptionStatus === 'trial'
                    ) {
                        return true;
                    }
                }
            } else return true;
        } catch (error) {
            this.logger.error({
                message: 'Error validating license',
                context: ValidateLicenseService.name,
                error: error,
            });
            return false;
        }
    }

    public async getBYOKConfig(
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<BYOKConfig | null> {
        const byokConfig = await this.organizationParametersService.findByKey(
            OrganizationParametersKey.BYOK_CONFIG,
            organizationAndTeamData,
        );

        return byokConfig?.configValue;
    }
}
