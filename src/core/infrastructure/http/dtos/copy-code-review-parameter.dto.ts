import { IsString } from 'class-validator';

export class CopyCodeReviewParameterDTO {
    @IsString()
    sourceRepositoryId: string;

    @IsString()
    targetRepositoryId: string;

    @IsString()
    targetDirectoryPath: string;

    @IsString()
    teamId: string;
}
