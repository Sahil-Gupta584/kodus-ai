import { IsString, IsOptional, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';
import { KodyRuleFilters } from '@/config/types/kodyRules.type';
import { ProgrammingLanguage } from '@/shared/domain/enums/programming-language.enum';
import { PaginationDto } from './pagination.dto';

export class FindLibraryKodyRulesDto extends PaginationDto implements KodyRuleFilters {
    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    severity?: string;

    @IsOptional()
    @Transform(({ value }) => {
        if (typeof value === 'string') {
            return value.split(',').map(tag => tag.trim());
        }
        return Array.isArray(value) ? value : [];
    })
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    @IsOptional()
    language?: ProgrammingLanguage;

    @IsOptional()
    @Transform(({ value }) => {
        if (typeof value === 'string') {
            return value.split(',').map(bucket => bucket.trim());
        }
        return Array.isArray(value) ? value : [];
    })
    @IsArray()
    @IsString({ each: true })
    buckets?: string[];
}
