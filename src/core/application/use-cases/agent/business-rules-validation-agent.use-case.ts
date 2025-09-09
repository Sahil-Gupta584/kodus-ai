import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Injectable } from '@nestjs/common';
import {
    BusinessRulesValidationAgentProvider,
    ValidationResult,
} from '@/core/infrastructure/adapters/services/agent/kodus-flow/businessRulesValidationAgent';

@Injectable()
export class BusinessRulesValidationAgentUseCase implements IUseCase {
    constructor(
        private readonly businessRulesValidationAgentProvider: BusinessRulesValidationAgentProvider,
    ) {}

    async execute(context: any): Promise<ValidationResult> {
        try {
            return await this.businessRulesValidationAgentProvider.validateBusinessRules(
                context,
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
}
