import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';

import {
    ACTIVITY_LOG_REPOSITORY_TOKEN,
    IActivityLogRepository,
} from './domain/contracts/activity-log.repository.contract';
import {
    ActivityLogFilter,
    ActivityLogListResult,
    ActivityLogPagination,
    IActivityLog,
} from './domain/interfaces/activity-log.interface';
import { ActivityLogModel } from './schema/activity-log.model';

@Injectable()
export class ActivityLogRepository implements IActivityLogRepository {
    constructor(
        @InjectModel(ActivityLogModel.name)
        private readonly activityLogModel: Model<ActivityLogModel>,
    ) {}

    async create(log: IActivityLog): Promise<IActivityLog> {
        const doc = await this.activityLogModel.create(log);
        return this.toEntity(doc);
    }

    async list(
        filter: ActivityLogFilter,
        pagination: ActivityLogPagination,
    ): Promise<ActivityLogListResult> {
        const query = this.buildFilter(filter);

        const page = Math.max(1, pagination.page);
        const pageSize = Math.min(
            Math.max(1, pagination.pageSize || 20),
            100,
        );

        const [data, total] = await Promise.all([
            this.activityLogModel
                .find(query)
                .sort({ createdAt: -1 })
                .skip((page - 1) * pageSize)
                .limit(pageSize)
                .lean()
                .exec(),
            this.activityLogModel.countDocuments(query).exec(),
        ]);

        return {
            data: data.map(this.toPlainObject),
            total,
            page,
            pageSize,
        };
    }

    private buildFilter(filter: ActivityLogFilter): FilterQuery<ActivityLogModel> {
        const query: FilterQuery<ActivityLogModel> = {
            organizationId: filter.organizationId,
        };

        if (filter.teamId) {
            query.teamId = filter.teamId;
        }

        if (filter.feature) {
            query.feature = filter.feature;
        }

        if (filter.action) {
            query.action = filter.action;
        }

        if (filter.startDate || filter.endDate) {
            query.createdAt = {} as FilterQuery<Date>;

            if (filter.startDate) {
                query.createdAt.$gte = filter.startDate;
            }

            if (filter.endDate) {
                query.createdAt.$lte = filter.endDate;
            }
        }

        return query;
    }

    private toEntity(doc: ActivityLogModel): IActivityLog {
        return this.toPlainObject(doc.toObject());
    }

    private toPlainObject(doc: any): IActivityLog {
        return {
            id: doc._id?.toString(),
            organizationId: doc.organizationId,
            teamId: doc.teamId,
            userId: doc.userId,
            planType: doc.planType,
            feature: doc.feature,
            action: doc.action,
            metadata: doc.metadata,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
        };
    }
}

export const ActivityLogRepositoryProvider = {
    provide: ACTIVITY_LOG_REPOSITORY_TOKEN,
    useClass: ActivityLogRepository,
};
