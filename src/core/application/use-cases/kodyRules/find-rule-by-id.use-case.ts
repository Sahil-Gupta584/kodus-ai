import {
    KODY_RULES_SERVICE_TOKEN,
    IKodyRulesService,
} from '@/core/domain/kodyRules/contracts/kodyRules.service.contract';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class FindRuleByIdKodyRulesUseCase {
    constructor(
        @Inject(KODY_RULES_SERVICE_TOKEN)
        private readonly kodyRulesService: IKodyRulesService,

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(ruleId: string) {
        try {
            const rule = await this.kodyRulesService.findById(ruleId);

            if (!rule) {
                throw new NotFoundException('Rule not found');
            }

            return rule;
        } catch (error) {
            this.logger.error({
                message: 'Error finding Kody Rule by ID',
                context: FindRuleByIdKodyRulesUseCase.name,
                error: error,
                metadata: {
                    ruleId,
                },
            });
            throw error;
        }
    }
}
