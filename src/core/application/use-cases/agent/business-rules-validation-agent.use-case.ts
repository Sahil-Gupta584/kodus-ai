import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Injectable } from '@nestjs/common';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { Thread } from '@kodus/flow';
import {
    BusinessRulesValidationAgentProvider,
    BusinessRulesValidationContext,
    ValidationResult,
} from '@/core/infrastructure/adapters/services/agent/kodus-flow/businessRulesValidationAgent';

export interface BusinessRulesValidationRequest {
    organizationAndTeamData: OrganizationAndTeamData;
    thread?: Thread;
    pullRequestData?: any;
    repositoryData?: any;
}

@Injectable()
export class BusinessRulesValidationAgentUseCase implements IUseCase {
    constructor(
        private readonly businessRulesValidationAgentProvider: BusinessRulesValidationAgentProvider,
    ) {}

    async execute(
        request: BusinessRulesValidationRequest,
    ): Promise<ValidationResult> {
        try {
            const {
                organizationAndTeamData,
                thread,
                pullRequestData,
                repositoryData,
            } = request;

            const context: BusinessRulesValidationContext = {
                organizationAndTeamData,
                validationScope: 'pull_request',
                pullRequestData,
                repositoryData,
            };

            return await this.businessRulesValidationAgentProvider.validateBusinessRules(
                context,
                thread,
            );
        } catch (error) {
            console.error(
                'Erro no use-case de validação de regras de negócio:',
                error,
            );
            throw new Error(
                `Falha ao processar validação de regras de negócio: ${error.message}`,
            );
        }
    }

    async validatePullRequest(
        organizationAndTeamData: OrganizationAndTeamData,
        pullRequestData: any,
        repositoryData: any,
        thread?: Thread,
    ): Promise<ValidationResult> {
        return this.execute({
            organizationAndTeamData,
            thread,
            pullRequestData,
            repositoryData,
        });
    }
}
