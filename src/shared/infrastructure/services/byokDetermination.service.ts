import { Injectable, Inject } from '@nestjs/common';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { OrganizationLicenseValidationResult } from '@/ee/license/interfaces/license.interface';
import { BYOKConfig } from '@kodus/kodus-common/llm';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { OrganizationParametersKey } from '@/shared/domain/enums/organization-parameters-key.enum';
import {
    IOrganizationParametersService,
    ORGANIZATION_PARAMETERS_SERVICE_TOKEN,
} from '@/core/domain/organizationParameters/contracts/organizationParameters.service.contract';

@Injectable()
export class BYOKDeterminationService {
    constructor(
        @Inject(ORGANIZATION_PARAMETERS_SERVICE_TOKEN)
        private readonly organizationParametersService: IOrganizationParametersService,
        private readonly logger: PinoLoggerService,
    ) {}

    /**
     * Determina se deve usar configuração BYOK baseado no plano da organização
     * @param organizationAndTeamData Dados da organização e equipe
     * @param validation Resultado da validação da licença
     * @param isCloud Se a aplicação está rodando na nuvem
     * @param contextName Nome do contexto para logging (ex: 'RunCodeReviewAutomationUseCase')
     * @returns Configuração BYOK ou null se deve usar keys gerenciadas
     */
    async determineBYOKUsage(
        organizationAndTeamData: OrganizationAndTeamData,
        validation: OrganizationLicenseValidationResult,
        isCloud: boolean,
        contextName?: string,
    ): Promise<BYOKConfig | null> {
        try {
            // Self-hosted sempre usa config das env vars (não usa BYOK)
            if (!isCloud) {
                return null;
            }

            if (!validation) {
                return null;
            }

            if (!validation?.valid) {
                return null;
            }

            const planType = validation?.planType;

            const isBYOKPlan = planType?.includes('byok');
            const isFreePlan = planType?.includes('free');
            const isManagedPlan = planType?.includes('managed') && !isBYOKPlan;

            // Managed plans (sem byok) usam nossas keys
            if (isManagedPlan) {
                this.logger.log({
                    message: 'Using managed keys for operation',
                    context: contextName || BYOKDeterminationService.name,
                    metadata: { organizationAndTeamData, planType },
                });
                return null;
            }

            // Free plan ou BYOK plan precisam de BYOK config
            if (isFreePlan || isBYOKPlan) {
                const byokData =
                    await this.organizationParametersService.findByKey(
                        OrganizationParametersKey.BYOK_CONFIG,
                        organizationAndTeamData,
                    );

                if (!byokData?.configValue) {
                    this.logger.warn({
                        message: `BYOK required but not configured for plan ${planType}`,
                        context: contextName || BYOKDeterminationService.name,
                        metadata: { organizationAndTeamData, planType },
                    });

                    throw new Error('BYOK_NOT_CONFIGURED');
                }

                this.logger.log({
                    message: 'Using BYOK configuration for operation',
                    context: contextName || BYOKDeterminationService.name,
                    metadata: {
                        organizationAndTeamData,
                        planType,
                        provider: byokData.configValue?.provider,
                        model: byokData.configValue?.model,
                    },
                });

                return byokData.configValue;
            }

            // Caso não identificado, usar keys gerenciadas
            return null;
        } catch (error) {
            if (error.message === 'BYOK_NOT_CONFIGURED') {
                throw error; // Re-throw para ser tratado pelo caller
            }

            this.logger.error({
                message: 'Error determining BYOK usage',
                context: contextName || BYOKDeterminationService.name,
                error: error,
                metadata: { organizationAndTeamData },
            });

            // Em caso de erro, falhar seguramente sem usar BYOK
            return null;
        }
    }
}
