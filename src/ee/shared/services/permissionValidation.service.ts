import { Injectable, Inject } from '@nestjs/common';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { BYOKConfig } from '@kodus/kodus-common/llm';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { OrganizationParametersKey } from '@/shared/domain/enums/organization-parameters-key.enum';
import { environment } from '@/ee/configs/environment';
import {
    ILicenseService,
    LICENSE_SERVICE_TOKEN,
    OrganizationLicenseValidationResult,
} from '@/ee/license/interfaces/license.interface';
import {
    IOrganizationParametersService,
    ORGANIZATION_PARAMETERS_SERVICE_TOKEN,
} from '@/core/domain/organizationParameters/contracts/organizationParameters.service.contract';

export enum PlanType {
    FREE = 'free',
    BYOK = 'byok',
    MANAGED = 'managed',
    TRIAL = 'trial',
}

export enum ValidationErrorType {
    INVALID_LICENSE = 'INVALID_LICENSE',
    USER_NOT_LICENSED = 'USER_NOT_LICENSED',
    BYOK_REQUIRED = 'BYOK_REQUIRED',
    PLAN_LIMIT_EXCEEDED = 'PLAN_LIMIT_EXCEEDED',
}

export class ValidationError extends Error {
    constructor(
        public type: ValidationErrorType,
        message: string,
        public metadata?: Record<string, any>,
    ) {
        super(message);
        this.name = 'ValidationError';
    }
}

export interface ValidationResult {
    allowed: boolean;
    byokConfig?: BYOKConfig | null;
    errorType?: ValidationErrorType;
    metadata?: Record<string, any>;
}

@Injectable()
export class PermissionValidationService {
    private readonly isCloud: boolean;
    private readonly isDevelopment: boolean;

    constructor(
        @Inject(LICENSE_SERVICE_TOKEN)
        private readonly licenseService: ILicenseService,
        @Inject(ORGANIZATION_PARAMETERS_SERVICE_TOKEN)
        private readonly organizationParametersService: IOrganizationParametersService,
        private readonly logger: PinoLoggerService,
    ) {
        this.isCloud = environment.API_CLOUD_MODE;
        this.isDevelopment = environment.API_DEVELOPMENT_MODE;
    }

    /**
     * Identifica o tipo de plano de forma robusta
     */
    private identifyPlanType(planType: string | undefined): PlanType | null {
        if (!planType) {
            return null;
        }

        // Normalizar para lowercase para comparação
        const normalizedPlan = planType.toLowerCase();

        // Verificar se contém palavras-chave específicas
        if (normalizedPlan.includes('free')) {
            return PlanType.FREE;
        }
        if (normalizedPlan.includes('byok')) {
            return PlanType.BYOK;
        }
        if (normalizedPlan.includes('managed')) {
            return PlanType.MANAGED;
        }
        if (normalizedPlan.includes('trial')) {
            return PlanType.TRIAL;
        }

        return null;
    }

    /**
     * Verifica se o plano requer BYOK
     */
    private requiresBYOK(planType: PlanType | null): boolean {
        return planType === PlanType.FREE || planType === PlanType.BYOK;
    }

    /**
     * Validação unificada de permissões para operações que precisam de licença + BYOK
     */
    async validateExecutionPermissions(
        organizationAndTeamData: OrganizationAndTeamData,
        userGitId?: string,
        contextName?: string,
    ): Promise<ValidationResult> {
        try {
            // Self-hosted sempre permite execução
            if (!this.isCloud || this.isDevelopment) {
                return { allowed: true };
            }

            // 1. Validar licença da organização
            const validation =
                await this.licenseService.validateOrganizationLicense(
                    organizationAndTeamData,
                );

            if (!validation?.valid) {
                this.logger.warn({
                    message: 'Organization license not valid',
                    context: contextName || PermissionValidationService.name,
                    metadata: { organizationAndTeamData, validation },
                });

                return {
                    allowed: false,
                    errorType: ValidationErrorType.INVALID_LICENSE,
                    metadata: { validation },
                };
            }

            // 2. Trial sempre permite (sem BYOK necessário e sem validação de usuário)
            if (validation.subscriptionStatus === 'trial') {
                return { allowed: true };
            }

            // 3. Identificar tipo de plano
            const identifiedPlanType = this.identifyPlanType(
                validation.planType,
            );

            let byokConfig: BYOKConfig | null = null;

            // 4. Managed plans usam nossas keys
            if (identifiedPlanType === PlanType.MANAGED) {
                byokConfig = null; // Usa keys da Kodus
            }
            // 5. Free/BYOK plans precisam de BYOK config (verificar ANTES de validar usuário)
            else if (this.requiresBYOK(identifiedPlanType)) {
                const byokData =
                    await this.organizationParametersService.findByKey(
                        OrganizationParametersKey.BYOK_CONFIG,
                        organizationAndTeamData,
                    );

                if (!byokData?.configValue) {
                    this.logger.warn({
                        message: `BYOK required but not configured for plan ${validation.planType}`,
                        context:
                            contextName || PermissionValidationService.name,
                        metadata: {
                            organizationAndTeamData,
                            planType: validation.planType,
                            identifiedPlanType,
                        },
                    });

                    // Retorna erro de BYOK ANTES de validar usuário
                    return {
                        allowed: false,
                        errorType: ValidationErrorType.BYOK_REQUIRED,
                        metadata: {
                            planType: validation.planType,
                            identifiedPlanType,
                        },
                    };
                }

                byokConfig = byokData.configValue;
            }

            // 6. Validar usuário específico (SEMPRE valida se userGitId fornecido, exceto trial)
            if (userGitId) {
                const users = await this.licenseService.getAllUsersWithLicense(
                    organizationAndTeamData,
                );

                const user = users?.find((user) => user?.git_id === userGitId);

                if (!user) {
                    this.logger.warn({
                        message: 'User not licensed',
                        context:
                            contextName || PermissionValidationService.name,
                        metadata: { organizationAndTeamData, userGitId },
                    });

                    return {
                        allowed: false,
                        errorType: ValidationErrorType.USER_NOT_LICENSED,
                        metadata: {
                            userGitId,
                            availableUsers: users?.length || 0,
                        },
                    };
                }
            }

            // 7. Tudo OK - retorna sucesso
            return {
                allowed: true,
                byokConfig,
                metadata: { planType: validation.planType, identifiedPlanType },
            };
        } catch (error) {
            // Tratamento específico para erro de BYOK não configurado
            if (error.message === 'BYOK_NOT_CONFIGURED') {
                return {
                    allowed: false,
                    errorType: ValidationErrorType.BYOK_REQUIRED,
                    metadata: { originalError: error.message },
                };
            }

            this.logger.error({
                message: 'Error validating execution permissions',
                context: contextName || PermissionValidationService.name,
                error,
                metadata: { organizationAndTeamData, userGitId },
            });

            // Em caso de erro, negar acesso por segurança
            return {
                allowed: false,
                errorType: ValidationErrorType.INVALID_LICENSE,
                metadata: { error: error.message },
            };
        }
    }

    /**
     * Validação simplificada para operações que só precisam verificar licença
     */
    async validateBasicLicense(
        organizationAndTeamData: OrganizationAndTeamData,
        contextName?: string,
    ): Promise<ValidationResult> {
        try {
            if (!this.isCloud || this.isDevelopment) {
                return { allowed: true };
            }

            const validation =
                await this.licenseService.validateOrganizationLicense(
                    organizationAndTeamData,
                );

            if (!validation?.valid) {
                this.logger.warn({
                    message: 'Basic license validation failed',
                    context: contextName || PermissionValidationService.name,
                    metadata: { organizationAndTeamData },
                });

                return {
                    allowed: false,
                    errorType: ValidationErrorType.INVALID_LICENSE,
                };
            }

            // Return plan type information for resource limiting logic
            const identifiedPlanType = this.identifyPlanType(
                validation.planType,
            );
            return {
                allowed: true,
                metadata: {
                    planType: validation.planType,
                    identifiedPlanType,
                },
            };
        } catch (error) {
            this.logger.error({
                message: 'Error in basic license validation',
                context: contextName || PermissionValidationService.name,
                error,
                metadata: { organizationAndTeamData },
            });

            return {
                allowed: false,
                errorType: ValidationErrorType.INVALID_LICENSE,
            };
        }
    }

    /**
     * Determina se deve usar configuração BYOK baseado no plano da organização
     * (Consolidado do antigo BYOKDeterminationService)
     */
    async determineBYOKUsage(
        organizationAndTeamData: OrganizationAndTeamData,
        validation: OrganizationLicenseValidationResult,
        contextName?: string,
    ): Promise<BYOKConfig | null> {
        try {
            // Self-hosted sempre usa config das env vars (não usa BYOK)
            if (!this.isCloud) {
                return null;
            }

            if (!validation) {
                return null;
            }

            if (!validation?.valid) {
                return null;
            }

            // Identificar tipo de plano de forma robusta
            const identifiedPlanType = this.identifyPlanType(
                validation?.planType,
            );

            // Managed plans usam nossas keys
            if (identifiedPlanType === PlanType.MANAGED) {
                this.logger.log({
                    message: 'Using managed keys for operation',
                    context: contextName || PermissionValidationService.name,
                    metadata: {
                        organizationAndTeamData,
                        planType: validation?.planType,
                        identifiedPlanType,
                    },
                });
                return null;
            }

            // Free ou BYOK plans precisam de BYOK config
            if (this.requiresBYOK(identifiedPlanType)) {
                const byokData =
                    await this.organizationParametersService.findByKey(
                        OrganizationParametersKey.BYOK_CONFIG,
                        organizationAndTeamData,
                    );

                if (!byokData?.configValue) {
                    this.logger.warn({
                        message: `BYOK required but not configured for plan ${validation?.planType}`,
                        context:
                            contextName || PermissionValidationService.name,
                        metadata: {
                            organizationAndTeamData,
                            planType: validation?.planType,
                        },
                    });

                    throw new Error('BYOK_NOT_CONFIGURED');
                }

                this.logger.log({
                    message: 'Using BYOK configuration for operation',
                    context: contextName || PermissionValidationService.name,
                    metadata: {
                        organizationAndTeamData,
                        planType: validation?.planType,
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
                context: contextName || PermissionValidationService.name,
                error: error,
                metadata: { organizationAndTeamData },
            });

            // Em caso de erro, falhar seguramente sem usar BYOK
            return null;
        }
    }

    /**
     * Verifica se os recursos devem ser limitados (plano free)
     * (Consolidado do antigo ValidateLicenseService.limitResources)
     */
    async shouldLimitResources(
        organizationAndTeamData: OrganizationAndTeamData,
        contextName?: string,
    ): Promise<boolean> {
        try {
            // Development mode não limita recursos
            if (this.isDevelopment) {
                return false;
            }

            // Self-hosted não limita recursos
            if (!this.isCloud) {
                return false;
            }

            const validation =
                await this.licenseService.validateOrganizationLicense(
                    organizationAndTeamData,
                );

            if (!validation?.valid) {
                this.logger.warn({
                    message: `License not active, limiting resources`,
                    context: contextName || PermissionValidationService.name,
                    metadata: {
                        organizationAndTeamData,
                    },
                });

                return true;
            }

            const planType = validation?.planType;
            const limitResources = planType?.includes('free');

            if (limitResources) {
                return true;
            }

            return false;
        } catch (error) {
            this.logger.error({
                message: 'Error checking resource limits',
                context: contextName || PermissionValidationService.name,
                error: error,
            });
            // Em caso de erro, limitar recursos por segurança
            return true;
        }
    }

    /**
     * Retorna a configuração BYOK da organização (se existir)
     */
    async getBYOKConfig(
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<BYOKConfig | null> {
        const byokConfig = await this.organizationParametersService.findByKey(
            OrganizationParametersKey.BYOK_CONFIG,
            organizationAndTeamData,
        );

        return byokConfig?.configValue;
    }
}
