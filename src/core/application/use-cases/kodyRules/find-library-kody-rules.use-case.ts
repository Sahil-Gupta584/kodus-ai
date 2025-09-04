import { KodyRuleFilters } from '@/config/types/kodyRules.type';
import {
    KODY_RULES_SERVICE_TOKEN,
    IKodyRulesService,
} from '@/core/domain/kodyRules/contracts/kodyRules.service.contract';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class FindLibraryKodyRulesUseCase {
    constructor(
        @Inject(KODY_RULES_SERVICE_TOKEN)
        private readonly kodyRulesService: IKodyRulesService,

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(kodyRuleFilters?: KodyRuleFilters) {
        try {
            // Para rota pública, usa getLibraryKodyRulesWithFeedback mas sem userId
            // Isso traz as contagens gerais mas não o userFeedback
            const libraryKodyRules =
                await this.kodyRulesService.getLibraryKodyRulesWithFeedback(
                    kodyRuleFilters,
                );

            return libraryKodyRules;
        } catch (error) {
            this.logger.error({
                message: 'Error finding library Kody Rules',
                context: FindLibraryKodyRulesUseCase.name,
                error: error,
            });
            throw error;
        }
    }
}
