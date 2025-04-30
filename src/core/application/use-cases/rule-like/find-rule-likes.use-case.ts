import { Inject, Injectable } from '@nestjs/common';
import { ProgrammingLanguage } from '@/shared/domain/enums/programming-language.enum';
import { IRuleLikeService, RULE_LIKE_SERVICE_TOKEN } from '@/core/domain/kodyRules/contracts/ruleLike.service.contract';

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

    async execute(filter: FindRuleLikesFilter) {
        return this.ruleLikeService.find(filter);
    }
}
