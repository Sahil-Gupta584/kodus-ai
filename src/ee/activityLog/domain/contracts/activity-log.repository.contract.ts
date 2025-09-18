import {
    ActivityLogFilter,
    ActivityLogListResult,
    ActivityLogPagination,
    IActivityLog,
} from '../interfaces/activity-log.interface';

export const ACTIVITY_LOG_REPOSITORY_TOKEN = Symbol('ActivityLogRepository');

export interface IActivityLogRepository {
    create(log: IActivityLog): Promise<IActivityLog>;

    list(
        filter: ActivityLogFilter,
        pagination: ActivityLogPagination,
    ): Promise<ActivityLogListResult>;
}
