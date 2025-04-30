import { Inject, Injectable } from '@nestjs/common';
import { ProgrammingLanguage } from '@/shared/domain/enums/programming-language.enum';
import {
    IRuleLikeService,
    RULE_LIKE_SERVICE_TOKEN,
} from '@/core/domain/kodyRules/contracts/ruleLike.service.contract';
import { RuleLikeEntity } from '@/core/domain/kodyRules/entities/ruleLike.entity';

interface FindRuleLikesFilter {
    ruleId?: string;
    userId?: string;
    language?: ProgrammingLanguage;
}

@Injectable()
export class FindRuleLikesUseCase {
    constructor(
        @Inject(RULE_LIKE_SERVICE_TOKEN)
        private readonly ruleLikeService: IRuleLikeService,
    ) {}

    async execute(filter: FindRuleLikesFilter): Promise<RuleLikeEntity[]> {
        if (!filter.ruleId && !filter.userId && !filter.language) {
            throw new Error(
                'At least one filter parameter (ruleId, userId, or language) must be provided',
            );
        }
        return this.ruleLikeService.find(filter);
    }
}
