import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsDefined,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SeverityLevel } from '@/shared/utils/enums/severityLevel.enum';

class SourceFiltersDto {
  @IsBoolean()
  includeKodyRules: boolean;

  @IsBoolean()
  includeCodeReviewEngine: boolean;
}

class SeverityFiltersDto {
  @IsEnum(SeverityLevel)
  minimumSeverity: SeverityLevel;

  @IsArray()
  @IsEnum(SeverityLevel, { each: true })
  allowedSeverities: SeverityLevel[];
}

export class IssuesParameterDto {
  @IsBoolean()
  automaticCreationEnabled: boolean;

  @ValidateNested()
  @Type(() => SourceFiltersDto)
  sourceFilters: SourceFiltersDto;

  @ValidateNested()
  @Type(() => SeverityFiltersDto)
  severityFilters: SeverityFiltersDto;
}

// required
export class OrganizationAndTeamDataDto {
    @IsString()
    teamId: string;

    @IsString()
    organizationId: string;
}

export class UpdateOrCreateIssuesParameterBodyDto {
  @ValidateNested()
  @Type(() => IssuesParameterDto)
  configValue: IssuesParameterDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => OrganizationAndTeamDataDto)
  organizationAndTeamData: OrganizationAndTeamDataDto;
}
