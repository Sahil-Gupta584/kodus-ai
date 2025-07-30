import { Injectable, Inject } from '@nestjs/common';
import { ICodeReviewSettingsLogService, CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN } from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.service.contract';
import { CodeReviewSettingsLogEntity } from '@/core/domain/codeReviewSettingsLog/entities/codeReviewSettingsLog.entity';
import { CodeReviewSettingsLogFiltersDto } from '@/core/infrastructure/http/dtos/code-review-settings-log-filters.dto';

export interface FindCodeReviewSettingsLogsResponse {
    logs: CodeReviewSettingsLogEntity[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

@Injectable()
export class FindCodeReviewSettingsLogsUseCase {
    constructor(
        @Inject(CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN)
        private readonly codeReviewSettingsLogService: ICodeReviewSettingsLogService,
    ) {}

    async execute(filters: CodeReviewSettingsLogFiltersDto): Promise<FindCodeReviewSettingsLogsResponse> {
        const { page = 1, limit = 100, skip, ...filterParams } = filters;
        
        const filter: any = {};
        
        if (filterParams.organizationId) {
            filter.organizationId = filterParams.organizationId;
        }
        
        if (filterParams.teamId) {
            filter.teamId = filterParams.teamId;
        }
        
        if (filterParams.action) {
            filter.action = filterParams.action;
        }
        
        if (filterParams.configLevel) {
            filter.configLevel = filterParams.configLevel;
        }
        
        if (filterParams.userId) {
            filter['userInfo.userId'] = filterParams.userId;
        }
        
        if (filterParams.userEmail) {
            filter['userInfo.userEmail'] = filterParams.userEmail;
        }
        
        if (filterParams.repositoryId) {
            filter['repository.id'] = filterParams.repositoryId;
        }

        // Adicionar filtros de data se fornecidos
        if (filterParams.startDate || filterParams.endDate) {
            filter.createdAt = {};
            
            if (filterParams.startDate) {
                filter.createdAt.$gte = filterParams.startDate;
            }
            
            if (filterParams.endDate) {
                filter.createdAt.$lte = filterParams.endDate;
            }
        }

        const logs = await this.codeReviewSettingsLogService.find(filter);
        
        const filteredLogs = logs;

        const total = filteredLogs.length;
        const totalPages = Math.ceil(total / limit);
        const startIndex = skip || (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

        return {
            logs: paginatedLogs,
            total,
            page,
            limit,
            totalPages,
        };
    }
} 