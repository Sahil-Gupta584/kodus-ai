import {
    IKodyRulesExample,
    IKodyRuleExternalReference,
    KodyRulesOrigin,
    KodyRulesScope,
    KodyRulesStatus,
} from '@/core/domain/kodyRules/interfaces/kodyRules.interface';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

export enum KodyRuleSeverity {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical',
}

export class KodyRulesExampleDto implements IKodyRulesExample {
    @IsString()
    snippet: string;

    @IsBoolean()
    isCorrect: boolean;
}

export class KodyRulesInheritanceDto {
    @IsBoolean()
    inheritable: boolean;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    exclude: string[];

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    include: string[];
}

export class KodyRuleExternalReferenceDto
    implements IKodyRuleExternalReference
{
    @IsString()
    filePath: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    repositoryName?: string;
}

export class CreateKodyRuleDto {
    @IsOptional()
    @IsString()
    uuid?: string;

    @IsNotEmpty()
    @IsString()
    title: string;

    @IsOptional()
    @IsString()
    scope?: KodyRulesScope;

    @IsNotEmpty()
    @IsString()
    rule: string;

    @IsOptional()
    @IsString()
    path: string;

    @IsOptional()
    @IsString()
    sourcePath?: string;

    @IsOptional()
    @IsString()
    sourceAnchor?: string;

    @IsNotEmpty()
    @IsEnum(KodyRuleSeverity)
    severity: KodyRuleSeverity;

    @IsOptional()
    @IsString()
    repositoryId?: string;

    @IsOptional()
    @IsString()
    directoryId?: string;

    @IsEnum(KodyRulesOrigin)
    origin: KodyRulesOrigin;

    @IsEnum(KodyRulesStatus)
    @IsOptional()
    status?: KodyRulesStatus;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => KodyRulesExampleDto)
    examples: KodyRulesExampleDto[];

    @IsOptional()
    @ValidateNested()
    @Type(() => KodyRulesInheritanceDto)
    inheritance?: KodyRulesInheritanceDto;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => KodyRuleExternalReferenceDto)
    externalReferences?: KodyRuleExternalReferenceDto[];
}
