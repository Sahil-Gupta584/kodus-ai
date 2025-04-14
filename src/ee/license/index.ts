import { AxiosLicenseService } from '@/config/axios/microservices/license.axios';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import {
  ILicenseService,
  SubscriptionStatus,
  ValidateOrganizationLicenseParams,
  OrganizationLicenseValidationResult,
  UserWithLicense,
} from './interfaces/license.interface';

// Definição dos tipos de licença
type License =
    | {
        valid: false;
        subscriptionStatus: 'payment_failed' | 'canceled' | 'expired';
        numberOfLicenses: number;
    }
    | {
        valid: true;
        subscriptionStatus: 'trial';
        trialEnd: string;
    }
    | {
        valid: true;
        subscriptionStatus: 'active';
        numberOfLicenses: number;
    };

type TrialSubscriptionStatus = {
    status: 'trial-active' | 'trial-expiring';
    valid: true;
    trialEnd: string;
};

type InvalidSubscriptionStatus = {
    valid: false;
    numberOfLicenses: number;
    usersWithAssignedLicense: { git_id: string }[];
    status: 'payment-failed' | 'canceled' | 'expired';
};

type ActiveSubscriptionStatus = {
    valid: true;
    status: 'active';
    numberOfLicenses: number;
    usersWithAssignedLicense: { git_id: string }[];
};

type SelfHostedSubscriptionStatus = {
    valid: true;
    status: 'self-hosted';
};

type SubscriptionStatus =
    | ActiveSubscriptionStatus
    | TrialSubscriptionStatus
    | InvalidSubscriptionStatus
    | SelfHostedSubscriptionStatus;

export class LicenseService implements ILicenseService {
    private licenseRequest: AxiosLicenseService;

    constructor(private readonly logger: PinoLoggerService) {
        this.licenseRequest = new AxiosLicenseService();
    }

    /**
     * Valida a licença da organização e do time, retornando status detalhado.
     */
    async validateOrganizationLicense(
        params: ValidateOrganizationLicenseParams,
    ): Promise<OrganizationLicenseValidationResult> {
        // Exemplo fictício: Substitua por chamada real ao repositório/serviço
        const license = await this.licenseRequest.getLicense();
        if (!license || !license.valid) {
            return { valid: false };
        }
        if (license.subscriptionStatus === 'trial') {
            const now = new Date();
            const trialEnd = license.trialEnd ? new Date(license.trialEnd) : undefined;
            if (trialEnd && now > trialEnd) {
                return {
                    valid: false,
                    subscriptionStatus: 'expired',
                };
            }
            return {
                valid: true,
                subscriptionStatus: 'trial',
                trialEnd,
            };
        }
        return {
            valid: ['trial', 'active'].includes(license.subscriptionStatus as SubscriptionStatus),
            subscriptionStatus: license.subscriptionStatus as SubscriptionStatus,
            numberOfLicenses: license.numberOfLicenses,
        };
    }

    /**
     * Retorna todos os usuários com licença ativa para a organização/time.
     */
    async getAllUsersWithLicense(
        params: ValidateOrganizationLicenseParams,
    ): Promise<UserWithLicense[]> {
        // Exemplo fictício: Substitua por chamada real ao repositório/serviço
        // Aqui espera-se que o método getUsersWithLicense exista no AxiosLicenseService
        return this.licenseRequest.getUsersWithLicense(params);
    }

    async getLicense(): Promise<SubscriptionStatus> {
        return this.licenseRequest.getLicense();
    }
}
