export interface IActivityLog {
    id?: string;
    organizationId: string;
    teamId?: string;
    userId?: string;
    planType?: string;
    feature: string;
    action: string;
    metadata?: Record<string, any>;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface ActivityLogFilter {
    organizationId: string;
    teamId?: string;
    feature?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
}

export interface ActivityLogPagination {
    page: number;
    pageSize: number;
}

export interface ActivityLogListResult {
    data: IActivityLog[];
    total: number;
    page: number;
    pageSize: number;
}
