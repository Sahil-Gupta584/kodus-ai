import { Inject, Injectable } from '@nestjs/common';
import {
    IRuleLikeService,
    RULE_LIKE_SERVICE_TOKEN,
} from '@/core/domain/kodyRules/contracts/ruleLike.service.contract';

@Injectable()
export class GetAllRuleLikesUseCase {
    constructor(
        @Inject(RULE_LIKE_SERVICE_TOKEN)
        private readonly ruleLikeService: IRuleLikeService,
    ) {}

    async execute() {
        return this.ruleLikeService.getAllLikes();
    }
}
