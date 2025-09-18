import {
    ActivityLogFilter,
    ActivityLogListResult,
    ActivityLogPagination,
    IActivityLog,
} from '../interfaces/activity-log.interface';

export const ACTIVITY_LOG_SERVICE_TOKEN = Symbol('ActivityLogService');

export interface RecordActivityLogParams {
    organizationId: string;
    teamId?: string;
    userId?: string;
    planType?: string;
    feature: string;
    action: string;
    metadata?: Record<string, any>;
}

export interface ListActivityLogsParams {
    filter: ActivityLogFilter;
    pagination: ActivityLogPagination;
}

export interface IActivityLogService {
    record(params: RecordActivityLogParams): Promise<IActivityLog | null>;

    list(params: ListActivityLogsParams): Promise<ActivityLogListResult>;
}
