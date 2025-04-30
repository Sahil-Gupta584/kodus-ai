// rule-likes.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import {
    mapSimpleModelToEntity,
    mapSimpleModelsToEntities,
} from '@/shared/infrastructure/repositories/mappers';
import { IRuleLikeRepository } from '@/core/domain/kodyRules/contracts/ruleLike.repository.contract';
import { RuleLikeModel } from './schema/rulesLikes.model';
import { RuleLikeEntity } from '@/core/domain/kodyRules/entities/ruleLike.entity';

@Injectable()
export class RuleLikesRepository implements IRuleLikeRepository {
    constructor(
        @InjectModel(RuleLikeModel.name)
        private readonly likeModel: Model<RuleLikeModel>,
    ) {}

    getNativeCollection() {
        return this.likeModel.db.collection('ruleLikes');
    }

    private async like(
        ruleId: string,
        language: string,
        userId?: string,
    ): Promise<RuleLikeEntity | null> {
        const res = await this.likeModel.updateOne(
            { ruleId, userId },
            { $setOnInsert: { language } },
            { upsert: true },
        );

        if (!res.upsertedId) return null;

        const doc = await this.likeModel.findById(res.upsertedId).exec();
        return mapSimpleModelToEntity(doc, RuleLikeEntity);
    }

    async unlike(ruleId: string, userId?: string): Promise<boolean> {
        const { deletedCount } = await this.likeModel.deleteOne({
            ruleId,
            userId,
        });
        return deletedCount > 0;
    }

    async setLike(
        ruleId: string,
        language: string,
        liked: boolean,
        userId?: string,
    ): Promise<number> {
        if (liked) {
            await this.like(ruleId, language, userId);
        } else {
            await this.unlike(ruleId, userId);
        }
        return this.countByRule(ruleId);
    }

    async findOne(
        filter: FilterQuery<RuleLikeModel>,
    ): Promise<RuleLikeEntity | null> {
        const doc = await this.likeModel.findOne(filter).exec();
        return doc ? mapSimpleModelToEntity(doc, RuleLikeEntity) : null;
    }

    async find(filter?: FilterQuery<RuleLikeModel>): Promise<RuleLikeEntity[]> {
        const docs = await this.likeModel.find(filter).exec();
        return mapSimpleModelsToEntities(docs, RuleLikeEntity);
    }

    async countByRule(ruleId: string): Promise<number> {
        const [res] = await this.likeModel
            .aggregate([
                { $match: { ruleId } },
                { $group: { _id: '$ruleId', count: { $sum: 1 } } },
            ])
            .exec();

        return res?.count ?? 0;
    }

    async topByLanguage(
        language: string,
        limit = 10,
    ): Promise<{ ruleId: string; count: number }[]> {
        return this.likeModel
            .aggregate([
                { $match: { language } },
                { $group: { _id: '$ruleId', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: limit },
                { $project: { _id: 0, ruleId: '$_id', count: 1 } },
            ])
            .exec();
    }

    async getAllLikes(): Promise<RuleLikeEntity[]> {
        const docs = await this.likeModel.find().exec();
        return mapSimpleModelsToEntities(docs, RuleLikeEntity);
    }

    async getAllRulesWithLikes(userId?: string): Promise<{ ruleId: string; likeCount: number; userLiked: boolean }[]> {
        const pipeline = [
            {
                $group: {
                    _id: '$ruleId',
                    likeCount: { $sum: 1 },
                    userLiked: {
                        $sum: {
                            $cond: [
                                { $eq: ['$userId', userId] },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    ruleId: '$_id',
                    likeCount: 1,
                    userLiked: { $gt: ['$userLiked', 0] }
                }
            }
        ];

        return this.likeModel.aggregate(pipeline).exec();
    }
}
