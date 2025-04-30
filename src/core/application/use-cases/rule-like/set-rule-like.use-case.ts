import { Inject, Injectable } from '@nestjs/common';
import { ProgrammingLanguage } from '@/shared/domain/enums/programming-language.enum';
import {
    IRuleLikeService,
    RULE_LIKE_SERVICE_TOKEN,
} from '@/core/domain/kodyRules/contracts/ruleLike.service.contract';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';

@Injectable()
export class SetRuleLikeUseCase {
    constructor(
        @Inject(RULE_LIKE_SERVICE_TOKEN)
        private readonly ruleLikeService: IRuleLikeService,

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(
        ruleId: string,
        language: ProgrammingLanguage,
        liked: boolean,
        userId?: string,
    ): Promise<any> {
        try {
            return this.ruleLikeService.setLike(
                ruleId,
                language,
                liked,
                userId,
            );
        } catch (error) {
            this.logger.error({
                message: `Failed to save rule likes`,
                context: SetRuleLikeUseCase.name,
                error,
                metadata: {
                    ruleId,
                    language,
                    liked,
                    userId,
                },
            });
        }
    }
}
