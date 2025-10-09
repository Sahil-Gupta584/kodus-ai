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

@Injectable()
export class CreateOrUpdateOrganizationParametersUseCase implements IUseCase {
    constructor(
        @Inject(ORGANIZATION_PARAMETERS_SERVICE_TOKEN)
        private readonly organizationParametersService: IOrganizationParametersService,
        private readonly logger: PinoLoggerService,
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
        const getConfigValue =
            await this.organizationParametersService.findByKey(
                organizationParametersKey,
                organizationAndTeamData,
            );

        let processedConfigValue = configValue;
        processedConfigValue = this.encryptByokConfigApiKey(configValue);

        const mergedConfigValue = {
            ...getConfigValue?.configValue,
            ...processedConfigValue,
        };

        const result =
            await this.organizationParametersService.createOrUpdateConfig(
                organizationParametersKey,
                mergedConfigValue,
                organizationAndTeamData,
            );

        return !!result;
    }

    private encryptByokConfigApiKey(configValue: any): BYOKConfig {
        if (!configValue || typeof configValue !== 'object') {
            throw new Error('Invalid BYOK config value');
        }

        const byokConfig = configValue as BYOKConfig;

        if (!byokConfig.main && !byokConfig.fallback) {
            throw new Error('At least main or fallback config is required');
        }

        let encryptedMain = null;
        if (byokConfig.main) {
            if (!byokConfig.main.apiKey) {
                throw new Error('apiKey is required for main BYOK config');
            }
            encryptedMain = {
                ...byokConfig.main,
                apiKey: encrypt(byokConfig.main.apiKey),
            };
        }

        let encryptedFallback = null;
        if (byokConfig.fallback) {
            if (!byokConfig.fallback.apiKey) {
                throw new Error('apiKey is required for fallback BYOK config');
            }
            encryptedFallback = {
                ...byokConfig.fallback,
                apiKey: encrypt(byokConfig.fallback.apiKey),
            };
        }

        return {
            ...(encryptedMain && { main: encryptedMain }),
            ...(encryptedFallback && { fallback: encryptedFallback }),
        };
    }
}
