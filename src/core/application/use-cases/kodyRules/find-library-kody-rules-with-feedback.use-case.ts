import { KodyRuleFilters } from '@/config/types/kodyRules.type';
import {
    KODY_RULES_SERVICE_TOKEN,
    IKodyRulesService,
} from '@/core/domain/kodyRules/contracts/kodyRules.service.contract';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { Inject, Injectable } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';

@Injectable()
export class FindLibraryKodyRulesWithFeedbackUseCase {
    constructor(
        @Inject(KODY_RULES_SERVICE_TOKEN)
        private readonly kodyRulesService: IKodyRulesService,

        private readonly logger: PinoLoggerService,

        @Inject(REQUEST)
        private readonly request: Request & {
            user?: { uuid: string; organization: { uuid: string } };
        },
    ) { }

    async execute(kodyRuleFilters?: KodyRuleFilters) {
        try {
            // Passa userId se o usuário estiver logado
            const userId = this.request.user?.uuid;
            console.log('🔍 FindLibraryKodyRulesWithFeedbackUseCase - userId:', userId);
            console.log('🔍 FindLibraryKodyRulesWithFeedbackUseCase - filters:', kodyRuleFilters);
            
            const libraryKodyRules =
                await this.kodyRulesService.getLibraryKodyRulesWithFeedback(kodyRuleFilters, userId);

            console.log('🔍 FindLibraryKodyRulesWithFeedbackUseCase - result count:', libraryKodyRules.length);
            console.log('🔍 FindLibraryKodyRulesWithFeedbackUseCase - first rule sample:', libraryKodyRules[0]);

            return libraryKodyRules;
        } catch (error) {
            this.logger.error({
                message: 'Error finding library Kody Rules with feedback',
                context: FindLibraryKodyRulesWithFeedbackUseCase.name,
                error: error,
            });
            throw error;
        }
    }
}

