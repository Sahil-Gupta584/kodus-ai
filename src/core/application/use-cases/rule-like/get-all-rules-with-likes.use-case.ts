import { Inject, Injectable } from '@nestjs/common';
import {
    IRuleLikeService,
    RULE_LIKE_SERVICE_TOKEN,
} from '@/core/domain/kodyRules/contracts/ruleLike.service.contract';
import { REQUEST } from '@nestjs/core';

@Injectable()
export class GetAllRulesWithLikesUseCase {
    constructor(
        @Inject(RULE_LIKE_SERVICE_TOKEN)
        private readonly ruleLikeService: IRuleLikeService,
        @Inject(REQUEST)
        private readonly request: Request & {
            user: { organization: { uuid: string }, uuid: string };
        },
    ) {}

    async execute() {
        return this.ruleLikeService.getAllRulesWithLikes(this.request.user.uuid);
    }
}
