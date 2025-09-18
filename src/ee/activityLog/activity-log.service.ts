import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import {
    ACTIVITY_LOG_REPOSITORY_TOKEN,
    IActivityLogRepository,
} from './domain/contracts/activity-log.repository.contract';
import {
    ACTIVITY_LOG_SERVICE_TOKEN,
    IActivityLogService,
    ListActivityLogsParams,
    RecordActivityLogParams,
} from './domain/contracts/activity-log.service.contract';
import {
    ActivityLogListResult,
    IActivityLog,
} from './domain/interfaces/activity-log.interface';
import {
    ILicenseService,
    LICENSE_SERVICE_TOKEN,
} from '@/ee/license/interfaces/license.interface';

@Injectable()
export class ActivityLogService implements IActivityLogService {
    constructor(
        @Inject(ACTIVITY_LOG_REPOSITORY_TOKEN)
        private readonly activityLogRepository: IActivityLogRepository,

        @Inject(LICENSE_SERVICE_TOKEN)
        private readonly licenseService: ILicenseService,
    ) {}

    async record(params: RecordActivityLogParams): Promise<IActivityLog | null> {
        if (!this.isEnterprisePlan(params.planType)) {
            return null;
        }

        return this.activityLogRepository.create({
            organizationId: params.organizationId,
            teamId: params.teamId,
            userId: params.userId,
            planType: params.planType,
            feature: params.feature,
            action: params.action,
            metadata: params.metadata,
        });
    }

    async list(params: ListActivityLogsParams): Promise<ActivityLogListResult> {
        const { organizationId } = params.filter;

        if (!organizationId) {
            throw new UnauthorizedException('organizationId is required');
        }

        const validation = await this.licenseService.validateOrganizationLicense(
            { organizationId, teamId: params.filter.teamId },
        );

        if (!this.isEnterprisePlan(validation?.planType)) {
            throw new UnauthorizedException('Activity log is available only for enterprise plans');
        }

        return this.activityLogRepository.list(params.filter, params.pagination);
    }

    private isEnterprisePlan(planType?: string): boolean {
        if (!planType) {
            return false;
        }

        return planType.toLowerCase().includes('enterprise');
    }
}

export const ActivityLogServiceProvider = {
    provide: ACTIVITY_LOG_SERVICE_TOKEN,
    useClass: ActivityLogService,
};
