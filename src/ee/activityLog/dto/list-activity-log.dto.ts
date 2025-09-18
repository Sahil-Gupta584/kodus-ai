import { Type } from 'class-transformer';
import {
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsPositive,
    IsString,
    Max,
    Min,
} from 'class-validator';

export class ActivityLogQueryDto {
    @IsString()
    @IsNotEmpty()
    organizationId: string;

    @IsString()
    @IsOptional()
    teamId?: string;

    @IsString()
    @IsOptional()
    feature?: string;

    @IsString()
    @IsOptional()
    action?: string;

    @IsDateString()
    @IsOptional()
    startDate?: string;

    @IsDateString()
    @IsOptional()
    endDate?: string;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @IsOptional()
    page?: number = 1;

    @Type(() => Number)
    @IsInt()
    @IsPositive()
    @Max(100)
    @IsOptional()
    pageSize?: number = 20;
}
