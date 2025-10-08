import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import {
    IOrganizationParametersService,
    ORGANIZATION_PARAMETERS_SERVICE_TOKEN,
} from '@/core/domain/organizationParameters/contracts/organizationParameters.service.contract';
import { OrganizationParametersEntity } from '@/core/domain/organizationParameters/entities/organizationParameters.entity';
import { IOrganizationParameters } from '@/core/domain/organizationParameters/interfaces/organizationParameters.interface';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { OrganizationParametersKey } from '@/shared/domain/enums/organization-parameters-key.enum';
import { decrypt } from '@/shared/utils/crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class FindByKeyOrganizationParametersUseCase {
    constructor(
        @Inject(ORGANIZATION_PARAMETERS_SERVICE_TOKEN)
        private readonly organizationParametersService: IOrganizationParametersService,
        private readonly logger: PinoLoggerService,
    ) {}

    async execute(
        organizationParametersKey: OrganizationParametersKey,
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<IOrganizationParameters> {
        try {
            const parameter =
                await this.organizationParametersService.findByKey(
                    organizationParametersKey,
                    organizationAndTeamData,
                );

            if (!parameter) {
                throw new NotFoundException(
                    'Organization parameter config does not exist',
                );
            }

            // Processa configuração BYOK mascarando API keys
            if (
                organizationParametersKey ===
                OrganizationParametersKey.BYOK_CONFIG
            ) {
                const configValue = parameter.configValue;

                if (
                    configValue &&
                    typeof configValue === 'object' &&
                    (configValue.main?.apiKey || configValue.fallback?.apiKey)
                ) {
                    try {
                        const processedConfig = { ...configValue };

                        // Processa main se existir e tiver apiKey
                        if (configValue.main?.apiKey) {
                            const decryptedMainApiKey = decrypt(
                                configValue.main.apiKey,
                            );
                            const maskedMainApiKey =
                                this.maskApiKey(decryptedMainApiKey);

                            processedConfig.main = {
                                ...configValue.main,
                                apiKey: maskedMainApiKey,
                            };
                        } else {
                            processedConfig.main = null;
                        }

                        if (configValue.fallback?.apiKey) {
                            const decryptedFallbackApiKey = decrypt(
                                configValue.fallback.apiKey,
                            );
                            const maskedFallbackApiKey = this.maskApiKey(
                                decryptedFallbackApiKey,
                            );

                            processedConfig.fallback = {
                                ...configValue.fallback,
                                apiKey: maskedFallbackApiKey,
                            };
                        } else {
                            processedConfig.fallback = null;
                        }

                        return {
                            uuid: parameter.uuid,
                            configKey: parameter.configKey,
                            configValue: processedConfig,
                            organization: parameter.organization,
                        };
                    } catch (error) {
                        this.logger.error({
                            message: 'Error decrypting API key',
                            context:
                                FindByKeyOrganizationParametersUseCase.name,
                            error: error,
                        });
                        // Retorna o valor original em caso de erro na descriptografia
                        return this.getUpdatedParameters(parameter);
                    }
                }
            }

            const updatedParameters = this.getUpdatedParameters(parameter);

            return updatedParameters;
        } catch (error) {
            this.logger.error({
                message: 'Error finding organization parameters by key',
                context: FindByKeyOrganizationParametersUseCase.name,
                error: error,
                metadata: {
                    organizationParametersKey,
                    organizationAndTeamData,
                },
            });

            throw error;
        }
    }

    private getUpdatedParameters(parameter: OrganizationParametersEntity) {
        return {
            uuid: parameter.uuid,
            configKey: parameter.configKey,
            configValue: parameter.configValue,
            organization: parameter.organization,
        };
    }

    private maskApiKey(apiKey: string): string {
        if (apiKey.length <= 6) {
            return apiKey;
        }
        const firstTwo = apiKey.substring(0, 2);
        const lastThree = apiKey.substring(apiKey.length - 3);
        return `${firstTwo}...${lastThree}`;
    }
}
