import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import {
    IOrganizationParametersService,
    ORGANIZATION_PARAMETERS_SERVICE_TOKEN,
} from '@/core/domain/organizationParameters/contracts/organizationParameters.service.contract';
import { OrganizationParametersEntity } from '@/core/domain/organizationParameters/entities/organizationParameters.entity';
import { OrganizationParametersByokConfig } from '@/core/domain/organizationParameters/types/organizationParameters.types';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { OrganizationParametersKey } from '@/shared/domain/enums/organization-parameters-key.enum';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { encrypt } from '@/shared/utils/crypto';
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
            // Processa a criptografia da apiKey se for BYOK_CONFIG
            let processedConfigValue = configValue;
            if (organizationParametersKey === OrganizationParametersKey.BYOK_CONFIG) {
                processedConfigValue = this.encryptByokConfigApiKey(configValue);
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

    private encryptByokConfigApiKey(configValue: any): OrganizationParametersByokConfig {
        if (!configValue || typeof configValue !== 'object') {
            throw new Error('Invalid BYOK config value');
        }

        const byokConfig = configValue as OrganizationParametersByokConfig;
        
        if (!byokConfig.apiKey) {
            throw new Error('apiKey is required for BYOK config');
        }

        return {
            ...byokConfig,
            apiKey: encrypt(byokConfig.apiKey),
        };
    }
}
