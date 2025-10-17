import { LabelType } from '@/shared/utils/codeManagement/labels';
import { SeverityLevel } from '@/shared/utils/enums/severityLevel.enum';
import {
    IsString,
    IsEnum,
    IsObject,
    IsOptional,
    ValidateNested,
    IsNumber,
} from 'class-validator';
import { IRepositoryToIssues } from '../../adapters/services/kodyIssuesManagement/domain/kodyIssuesManagement.interface';
import { Type } from 'class-transformer';

class GitUserDto {
    @IsNumber() gitId: number;
    @IsString() username: string;
}

export class CreateIssueManuallyDto {
    @IsString()
    title: string;

    @IsString()
    description: string;

    @IsString()
    filePath: string;

    @IsString()
    language: string;

    @IsEnum(LabelType)
    label: LabelType;

    @IsEnum(SeverityLevel)
    severity: SeverityLevel;

    @IsString()
    organizationId: string;

    @IsObject()
    repository: IRepositoryToIssues;

    @IsOptional()
    @ValidateNested()
    @Type(() => GitUserDto)
    owner: GitUserDto;

    @ValidateNested()
    @Type(() => GitUserDto)
    reporter: GitUserDto;
}
