import {
    IsOptional,
    IsString,
    IsNumberString,
    Min,
    Max,
    IsBoolean,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class EnrichedPullRequestsQueryDto {
    @IsOptional()
    @IsString()
    repositoryId?: string;

    @IsOptional()
    @IsString()
    repositoryName?: string;

    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @Min(1)
    @Max(100)
    limit?: number = 30;

    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @IsBoolean()
    @Type(() => String)
    @Transform(({ value }) => {
        if (value === undefined || value === null || value === '') {
            return undefined;
        }

        const normalized = String(value).trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;

        return undefined;
    })
    hasSentSuggestions?: boolean;

    @IsOptional()
    @IsString()
    pullRequestTitle?: string;
}
