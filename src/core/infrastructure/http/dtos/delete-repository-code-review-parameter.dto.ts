import { IsString } from 'class-validator';

export class DeleteRepositoryCodeReviewParameterDto {
    @IsString()
    repositoryId: string;

    @IsString()
    teamId: string;
}
