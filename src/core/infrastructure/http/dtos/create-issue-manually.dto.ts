import { LabelType } from '@/shared/utils/codeManagement/labels';
import { SeverityLevel } from '@/shared/utils/enums/severityLevel.enum';
import {
    IsString,
    IsEnum,
    IsObject,
    IsOptional,
} from 'class-validator';
import { IRepositoryToIssues } from '../../adapters/services/kodyIssuesManagement/domain/kodyIssuesManagement.interface';

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
    owner: { gitId: string; username: string; };

    @IsObject()
    reporter: { gitId: string; username: string; };
}