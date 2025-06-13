import { IsOptional, IsString, IsNumber } from 'class-validator';
import { SeverityLevel } from '@sentry/node';
import { LabelType } from '@/shared/utils/codeManagement/labels';
import { IssueStatus } from '@/config/types/general/issues.type';
import { PaginationDto } from './pagination.dto';

export class GetIssuesByFiltersDto extends PaginationDto {
    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    severity?: SeverityLevel;

    @IsOptional()
    category?: LabelType;

    @IsOptional()
    status?: IssueStatus = IssueStatus.OPEN;

    @IsOptional()
    @IsString()
    organizationId?: string;

    @IsOptional()
    @IsString()
    repositoryName?: string;

    @IsOptional()
    @IsNumber()
    prNumber?: number;

    @IsOptional()
    @IsString()
    filePath?: string;

    @IsOptional()
    @IsString()
    beforeAt?: string;

    @IsOptional()
    @IsString()
    afterAt?: string;
}
