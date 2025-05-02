import { RuleLikeEntity } from '../entities/ruleLike.entity';
import { FilterQuery } from 'mongoose';
import { RuleLikeModel } from '@/core/infrastructure/adapters/repositories/mongoose/schema/rulesLikes.model';

export interface IRuleLike {
    language: string;
    ruleId: string;
    userId?: string;
}

export const RULE_LIKES_REPOSITORY_TOKEN = Symbol('RuleLikesRepository');

export interface IRuleLikeRepository {
    getNativeCollection(): any;

    setLike(
        ruleId: string,
        language: string,
        liked: boolean,
        userId?: string,
    ): Promise<number>;

    findOne(filter?: Partial<IRuleLike>): Promise<RuleLikeEntity | null>;

    find(filter?: FilterQuery<RuleLikeModel>): Promise<RuleLikeEntity[]>;

    countByRule(ruleId: string): Promise<number>;

    topByLanguage(
        language: string,
        limit?: number,
    ): Promise<{ ruleId: string; count: number }[]>;

    getAllLikes(): Promise<RuleLikeEntity[]>;

    getAllRulesWithLikes(
        userId?: string,
    ): Promise<{ ruleId: string; likeCount: number; userLiked: boolean }[]>;
}
