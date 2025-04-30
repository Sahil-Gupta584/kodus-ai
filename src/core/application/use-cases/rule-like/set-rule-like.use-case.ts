import { Inject, Injectable } from '@nestjs/common';
import { ProgrammingLanguage } from '@/shared/domain/enums/programming-language.enum';
import {
    IRuleLikeService,
    RULE_LIKE_SERVICE_TOKEN,
} from '@/core/domain/kodyRules/contracts/ruleLike.service.contract';
import { RuleLikeEntity } from '@/core/domain/kodyRules/entities/ruleLike.entity';

@Injectable()
export class SetRuleLikeUseCase {
    constructor(
        @Inject(RULE_LIKE_SERVICE_TOKEN)
        private readonly ruleLikeService: IRuleLikeService,
    ) {}

    async execute(
        ruleId: string,
        language: ProgrammingLanguage,
        liked: boolean,
        userId?: string,
    ): Promise<any> {
        return this.ruleLikeService.setLike(ruleId, language, liked, userId);
    }
}
