import { Inject, Injectable } from '@nestjs/common';
import { ProgrammingLanguage } from '@/shared/domain/enums/programming-language.enum';
import {
    IRuleLikeRepository,
    RULE_LIKES_REPOSITORY_TOKEN,
} from '@/core/domain/kodyRules/contracts/ruleLike.repository.contract';
import { RuleLikeEntity } from '@/core/domain/kodyRules/entities/ruleLike.entity';
import { IRuleLikeService } from '@/core/domain/kodyRules/contracts/ruleLike.service.contract';

@Injectable()
export class RuleLikesService implements IRuleLikeService {
    constructor(
        @Inject(RULE_LIKES_REPOSITORY_TOKEN)
        private readonly likesRepo: IRuleLikeRepository,
    ) {}

    getNativeCollection() {
        return this.likesRepo.getNativeCollection();
    }

    async setLike(
        ruleId: string,
        language: ProgrammingLanguage,
        liked: boolean,
        userId?: string,
    ): Promise<{ liked: boolean; count: number }> {
        const count = await this.likesRepo.setLike(
            ruleId,
            language,
            liked,
            userId,
        );
        return { liked, count };
    }

    async countByRule(ruleId: string): Promise<number> {
        return this.likesRepo.countByRule(ruleId);
    }

    async topByLanguage(
        language: ProgrammingLanguage,
        limit = 10,
    ): Promise<{ ruleId: string; count: number }[]> {
        return this.likesRepo.topByLanguage(language, limit);
    }

    async findOne(
        filter?: Partial<RuleLikeEntity>,
    ): Promise<RuleLikeEntity | null> {
        return this.likesRepo.findOne(filter);
    }

    async find(filter?: Partial<RuleLikeEntity>): Promise<RuleLikeEntity[]> {
        return this.likesRepo.find(filter);
    }

    async getAllLikes(): Promise<RuleLikeEntity[]> {
        return this.likesRepo.getAllLikes();
    }

    async getAllRulesWithLikes(
        userId?: string,
    ): Promise<{ ruleId: string; likeCount: number; userLiked: boolean }[]> {
        return this.likesRepo.getAllRulesWithLikes(userId);
    }
}
