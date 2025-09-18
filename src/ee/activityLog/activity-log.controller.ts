import { Controller, Get, Inject, Query } from '@nestjs/common';

import {
    ACTIVITY_LOG_SERVICE_TOKEN,
    IActivityLogService,
} from './domain/contracts/activity-log.service.contract';
import { ActivityLogQueryDto } from './dto/list-activity-log.dto';

@Controller('ee/activity-log')
export class ActivityLogController {
    constructor(
        @Inject(ACTIVITY_LOG_SERVICE_TOKEN)
        private readonly activityLogService: IActivityLogService,
    ) {}

    @Get()
    async list(@Query() query: ActivityLogQueryDto) {
        const { organizationId, teamId, feature, action, startDate, endDate } =
            query;

        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;

        const result = await this.activityLogService.list({
            filter: {
                organizationId,
                teamId,
                feature,
                action,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
            },
            pagination: { page, pageSize },
        });

        return {
            data: result.data,
            pagination: {
                total: result.total,
                page: result.page,
                pageSize: result.pageSize,
            },
        };
    }
}
