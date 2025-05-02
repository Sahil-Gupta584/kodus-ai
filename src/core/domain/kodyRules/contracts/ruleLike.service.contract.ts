import { ProgrammingLanguage } from '@/shared/domain/enums/programming-language.enum';
import { RuleLikeEntity } from '../entities/ruleLike.entity';

export const RULE_LIKE_SERVICE_TOKEN = 'RULE_LIKE_SERVICE_TOKEN';

export interface IRuleLikeService {
    getNativeCollection(): any;
    setLike(
        ruleId: string,
        language: ProgrammingLanguage,
        liked: boolean,
        userId?: string,
    ): Promise<{ liked: boolean; count: number }>;
    countByRule(ruleId: string): Promise<number>;
    topByLanguage(
        language: ProgrammingLanguage,
        limit?: number,
    ): Promise<{ ruleId: string; count: number }[]>;
    findOne(filter?: Partial<RuleLikeEntity>): Promise<RuleLikeEntity | null>;
    find(filter?: Partial<RuleLikeEntity>): Promise<RuleLikeEntity[]>;
    getAllLikes(): Promise<RuleLikeEntity[]>;
    getAllRulesWithLikes(userId?: string): Promise<{ ruleId: string; likeCount: number; userLiked: boolean }[]>;
}
