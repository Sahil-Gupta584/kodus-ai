import { IsNotEmpty, IsString } from "class-validator";

export class PreviewPrSummaryDto {
    @IsNotEmpty()
    @IsString()
    prNumber: string;

    @IsNotEmpty()
    @IsString()
    repositoryId: string;

    @IsNotEmpty()
    @IsString()
    organizationId: string;
}
