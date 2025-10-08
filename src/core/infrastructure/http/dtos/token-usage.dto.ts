import { IsISO8601, IsNumber, IsOptional, IsString } from 'class-validator';

export class TokenUsageQueryDto {
    @IsString()
    organizationId: string;

    @IsISO8601()
    startDate: string; // ISO date string

    @IsISO8601()
    endDate: string; // ISO date string

    @IsOptional()
    @IsNumber()
    prNumber?: number;

    @IsOptional()
    @IsString()
    timezone?: string; // e.g., 'UTC' or 'America/Sao_Paulo'
}

export type DailyTokenUsage = {
    date: string; // YYYY-MM-DD
    input: number;
    output: number;
    total: number;
    outputReasoning: number;
};

export type TokenUsageSummary = {
    input: number;
    output: number;
    total: number;
    outputReasoning: number;
};

