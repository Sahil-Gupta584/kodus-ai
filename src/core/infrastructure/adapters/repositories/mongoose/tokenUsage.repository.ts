import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LogModel } from '@/core/infrastructure/adapters/repositories/mongoose/schema/log.model';
import {
    DailyUsageResultContract,
    ITokenUsageRepository,
    TokenUsageQueryContract,
    UsageSummaryContract,
} from '@/core/domain/tokenUsage/contracts/tokenUsage.repository.contract';
// debug counts removed

@Injectable()
export class TokenUsageRepository implements ITokenUsageRepository {
    constructor(
        @InjectModel(LogModel.name)
        private readonly logModel: Model<LogModel>,
    ) {}

    async getDailyUsage(
        query: TokenUsageQueryContract,
    ): Promise<DailyUsageResultContract[]> {
        const { timezone = 'UTC' } = query;

        const pipeline = [
            ...this._createBasePipeline(query),
            {
                $addFields: {
                    __day: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$__createdAt',
                            timezone,
                        },
                    },
                },
            },
            {
                $group: {
                    _id: '$__day',
                    input: { $sum: '$__input' },
                    output: { $sum: '$__output' },
                    total: { $sum: '$__total' },
                    outputReasoning: { $sum: '$__outputReasoning' },
                },
            },
            { $sort: { _id: 1 } },
            {
                $project: {
                    _id: 0,
                    date: '$_id',
                    input: 1,
                    output: 1,
                    total: 1,
                    outputReasoning: 1,
                },
            },
        ];

        return this.logModel.aggregate(pipeline).exec();
    }

    async getSummary(
        query: TokenUsageQueryContract,
    ): Promise<UsageSummaryContract> {
        const pipeline = [
            ...this._createBasePipeline(query),
            {
                $group: {
                    _id: null,
                    input: { $sum: '$__input' },
                    output: { $sum: '$__output' },
                    total: { $sum: '$__total' },
                    outputReasoning: { $sum: '$__outputReasoning' },
                },
            },
            {
                $project: {
                    _id: 0,
                    input: { $ifNull: ['$input', 0] },
                    output: { $ifNull: ['$output', 0] },
                    total: { $ifNull: ['$total', 0] },
                    outputReasoning: { $ifNull: ['$outputReasoning', 0] },
                },
            },
        ];

        const result = await this.logModel.aggregate(pipeline).exec();
        return (
            result?.[0] || {
                input: 0,
                output: 0,
                total: 0,
                outputReasoning: 0,
            }
        );
    }

    private _createBasePipeline(query: TokenUsageQueryContract): any[] {
        const { organizationId, start, end, prNumber } = query;

        const dateFilter = {
            $or: [
                { createdAt: { $gte: start, $lte: end } },
                {
                    $and: [
                        { createdAt: { $exists: false } },
                        {
                            $expr: {
                                $and: [
                                    {
                                        $gte: [
                                            { $toDate: '$timestamp' },
                                            start,
                                        ],
                                    },
                                    { $lte: [{ $toDate: '$timestamp' }, end] },
                                ],
                            },
                        },
                    ],
                },
            ],
        };

        const baseMatch: Record<string, any> = {
            $and: [
                {
                    $or: [
                        {
                            'metadata.organizationAndTeamData.organizationId':
                                organizationId,
                        },
                        {
                            'organizationAndTeamData.organizationId':
                                organizationId,
                        },
                        { 'metadata.organizationId': organizationId },
                        { organizationId: organizationId },
                    ],
                },
                typeof prNumber === 'number'
                    ? {
                          $or: [
                              { 'metadata.prNumber': prNumber },
                              { 'metadata.pullRequestId': prNumber },
                              { prNumber: prNumber },
                              { pullRequestId: prNumber },
                          ],
                      }
                    : {},
                {
                    $or: [
                        { 'metadata.tokenUsages.0': { $exists: true } },
                        { 'tokenUsages.0': { $exists: true } },
                    ],
                },
                dateFilter,
            ],
        };

        return [
            { $match: baseMatch },
            {
                $addFields: {
                    __createdAt: {
                        $ifNull: ['$createdAt', { $toDate: '$timestamp' }],
                    },
                },
            },
            {
                $addFields: {
                    __tokenUsages: {
                        $ifNull: ['$metadata.tokenUsages', '$tokenUsages'],
                    },
                },
            },
            { $unwind: '$__tokenUsages' },
            { $addFields: { __usage: '$__tokenUsages' } },
            {
                $project: {
                    __createdAt: 1,
                    __input: {
                        $ifNull: [
                            '$__usage.input_tokens',
                            { $ifNull: ['$__usage.promptTokens', 0] },
                        ],
                    },
                    __output: {
                        $ifNull: [
                            '$__usage.output_tokens',
                            { $ifNull: ['$__usage.completionTokens', 0] },
                        ],
                    },
                    __totalComputed: {
                        $ifNull: [
                            '$__usage.total_tokens',
                            { $ifNull: ['$__usage.totalTokens', null] },
                        ],
                    },
                    __outputReasoning: {
                        $ifNull: ['$__usage.output_reasoning_tokens', 0],
                    },
                },
            },
            {
                $addFields: {
                    __total: {
                        $ifNull: [
                            '$__totalComputed',
                            { $add: ['$__input', '$__output'] },
                        ],
                    },
                },
            },
        ];
    }

    // debug counts removed
}
