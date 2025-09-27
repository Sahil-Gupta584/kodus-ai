import {
    IRepositoryToIssues,
} from '@/ee/kodyIssuesManagement/domain/kodyIssuesManagement.interface';
import { LabelType } from '@/shared/utils/codeManagement/labels';
import { SeverityLevel } from '@/shared/utils/enums/severityLevel.enum';
import {
    IsString,
    IsEnum,
    IsObject,
    IsOptional,
} from 'class-validator';

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
    @IsObject()
    owner: { id: string; name: string; email: string };

    @IsOptional()
    @IsObject()
    reporter: { id: string; name: string; email: string };
}