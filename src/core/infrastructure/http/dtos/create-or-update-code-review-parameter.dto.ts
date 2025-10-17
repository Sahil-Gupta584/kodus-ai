import {
    IsObject,
    IsString,
    IsOptional,
    IsArray,
    IsBoolean,
    ValidateNested,
    IsNumber,
    IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrganizationAndTeamDataDto } from './organizationAndTeamData.dto';
import {
    BehaviourForExistingDescription,
    BehaviourForNewCommits,
    CodeReviewVersion,
    GroupingModeSuggestions,
    LimitationType,
    ReviewCadenceType,
} from '@/config/types/general/codeReview.type';
import { SeverityLevel } from '@/shared/utils/enums/severityLevel.enum';
import { PullRequestMessageStatus } from '@/config/types/general/pullRequestMessages.type';

class ReviewOptionsDto {
    @IsBoolean()
    @IsOptional()
    security?: boolean;

    @IsBoolean()
    @IsOptional()
    code_style?: boolean;

    @IsBoolean()
    @IsOptional()
    refactoring?: boolean;

    @IsBoolean()
    @IsOptional()
    error_handling?: boolean;

    @IsBoolean()
    @IsOptional()
    maintainability?: boolean;

    @IsBoolean()
    @IsOptional()
    potential_issues?: boolean;

    @IsBoolean()
    @IsOptional()
    documentation_and_comments?: boolean;

    @IsBoolean()
    @IsOptional()
    performance_and_optimization?: boolean;

    @IsBoolean()
    @IsOptional()
    kody_rules?: boolean;

    @IsBoolean()
    @IsOptional()
    breaking_changes?: boolean;

    @IsOptional()
    @IsBoolean()
    bug?: boolean;

    @IsOptional()
    @IsBoolean()
    performance?: boolean;

    @IsOptional()
    @IsBoolean()
    cross_file?: boolean;
}

class SummaryConfigDto {
    @IsOptional()
    @IsBoolean()
    generatePRSummary?: boolean;

    @IsOptional()
    @IsString()
    customInstructions?: string;

    @IsOptional()
    @IsEnum(BehaviourForExistingDescription)
    behaviourForExistingDescription?: BehaviourForExistingDescription;

    @IsOptional()
    @IsEnum(BehaviourForNewCommits)
    behaviourForNewCommits?: BehaviourForNewCommits;
}

class SeverityLimitsDto {
    @IsNumber()
    @IsOptional()
    low?: number;

    @IsNumber()
    @IsOptional()
    medium?: number;

    @IsNumber()
    @IsOptional()
    high?: number;

    @IsNumber()
    @IsOptional()
    critical?: number;
}

class SuggestionControlConfigDto {
    @IsOptional()
    @IsEnum(GroupingModeSuggestions)
    groupingMode?: GroupingModeSuggestions;

    @IsOptional()
    @IsEnum(LimitationType)
    limitationType?: LimitationType;

    @IsOptional()
    @IsNumber()
    maxSuggestions?: number;

    @IsOptional()
    @IsEnum(SeverityLevel)
    severityLevelFilter?: SeverityLevel;

    @IsOptional()
    @IsBoolean()
    applyFiltersToKodyRules?: boolean;

    @IsOptional()
    @ValidateNested()
    @Type(() => SeverityLimitsDto)
    severityLimits?: SeverityLimitsDto;
}

class ReviewCadenceDto {
    @IsEnum(ReviewCadenceType)
    @IsOptional()
    type?: ReviewCadenceType;

    @IsOptional()
    @IsNumber()
    timeWindow?: number;

    @IsOptional()
    @IsNumber()
    pushesToTrigger?: number;
}

class PathInstructionDto {
    @IsOptional()
    @IsString()
    path?: string;

    @IsOptional()
    @IsString()
    instructions?: string;
}

// -------------------- v2 Prompt Overrides DTOs (must be declared before usage) --------------------
class V2PromptOverridesSeverityFlagsDto {
    @IsOptional()
    @IsString()
    critical?: string;

    @IsOptional()
    @IsString()
    high?: string;

    @IsOptional()
    @IsString()
    medium?: string;

    @IsOptional()
    @IsString()
    low?: string;
}

class V2PromptOverridesSeverityDto {
    @IsOptional()
    @ValidateNested()
    @Type(() => V2PromptOverridesSeverityFlagsDto)
    flags?: V2PromptOverridesSeverityFlagsDto;
}

class V2PromptOverridesCategoriesDescriptionsDto {
    @IsOptional()
    @IsString()
    bug?: string;

    @IsOptional()
    @IsString()
    performance?: string;

    @IsOptional()
    @IsString()
    security?: string;
}

class V2PromptOverridesCategoriesDto {
    @IsOptional()
    @ValidateNested()
    @Type(() => V2PromptOverridesCategoriesDescriptionsDto)
    descriptions?: V2PromptOverridesCategoriesDescriptionsDto;
}

class V2PromptOverridesGenerationDto {
    @IsOptional()
    @IsString()
    main?: string;
}

class V2PromptOverridesDto {
    @IsOptional()
    @ValidateNested()
    @Type(() => V2PromptOverridesCategoriesDto)
    categories?: V2PromptOverridesCategoriesDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => V2PromptOverridesSeverityDto)
    severity?: V2PromptOverridesSeverityDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => V2PromptOverridesGenerationDto)
    generation?: V2PromptOverridesGenerationDto;
}

class CustomMessagesGlobalSettingsDto {
    @IsOptional()
    @IsBoolean()
    hideComments?: boolean;
}

class CustomMessagesStartReviewMessageDto {
    @IsOptional()
    @IsEnum(PullRequestMessageStatus)
    status?: PullRequestMessageStatus;

    @IsOptional()
    @IsString()
    content?: string;
}

class CustomMessagesEndReviewMessageDto {
    @IsOptional()
    @IsEnum(PullRequestMessageStatus)
    status?: PullRequestMessageStatus;

    @IsOptional()
    @IsString()
    content?: string;
}

class CustomMessagesDto {
    @IsOptional()
    @ValidateNested()
    @Type(() => CustomMessagesGlobalSettingsDto)
    globalSettings?: CustomMessagesGlobalSettingsDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => CustomMessagesStartReviewMessageDto)
    startReviewMessage?: CustomMessagesStartReviewMessageDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => CustomMessagesEndReviewMessageDto)
    endReviewMessage?: CustomMessagesEndReviewMessageDto;
}

class CodeReviewConfigWithoutLLMProviderDto {
    @IsOptional()
    @IsString()
    id?: string;

    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    path?: string;

    @IsOptional()
    @IsBoolean()
    isSelected?: boolean;

    @IsOptional()
    @IsArray()
    ignorePaths?: string[];

    @IsOptional()
    @ValidateNested()
    @Type(() => ReviewOptionsDto)
    reviewOptions?: ReviewOptionsDto;

    @IsOptional()
    @IsArray()
    ignoredTitleKeywords?: string[];

    @IsOptional()
    @IsArray()
    baseBranches?: string[];

    @IsOptional()
    @IsBoolean()
    automatedReviewActive?: boolean;

    @IsOptional()
    @ValidateNested()
    @Type(() => SummaryConfigDto)
    summary?: SummaryConfigDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => SuggestionControlConfigDto)
    suggestionControl?: SuggestionControlConfigDto;

    @IsOptional()
    @IsBoolean()
    pullRequestApprovalActive?: boolean;

    @IsOptional()
    @IsBoolean()
    kodusConfigFileOverridesWebPreferences?: boolean;

    @IsOptional()
    @IsBoolean()
    isRequestChangesActive?: boolean;

    @IsOptional()
    @IsBoolean()
    ideRulesSyncEnabled?: boolean;

    @IsOptional()
    @IsBoolean()
    kodyRulesGeneratorEnabled?: boolean;

    @IsOptional()
    @ValidateNested()
    @Type(() => ReviewCadenceDto)
    reviewCadence?: ReviewCadenceDto;

    @IsOptional()
    @IsBoolean()
    runOnDraft?: boolean;

    @IsOptional()
    @IsEnum(CodeReviewVersion)
    codeReviewVersion?: CodeReviewVersion;

    @IsOptional()
    @ValidateNested()
    @Type(() => V2PromptOverridesDto)
    v2PromptOverrides?: V2PromptOverridesDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => CustomMessagesDto)
    customMessages?: CustomMessagesDto;
}

export class CreateOrUpdateCodeReviewParameterDto {
    @IsObject()
    organizationAndTeamData: OrganizationAndTeamDataDto;

    @ValidateNested()
    @Type(() => CodeReviewConfigWithoutLLMProviderDto)
    configValue: CodeReviewConfigWithoutLLMProviderDto;

    @IsString()
    @IsOptional()
    repositoryId: string;

    @IsString()
    @IsOptional()
    directoryId?: string;

    @IsString()
    @IsOptional()
    directoryPath?: string;
}
