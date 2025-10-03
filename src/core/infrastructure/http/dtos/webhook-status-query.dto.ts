import { IsNotEmpty, IsString } from 'class-validator';

export class WebhookStatusQueryDto {
    @IsString()
    @IsNotEmpty()
    readonly organizationId: string;

    @IsString()
    @IsNotEmpty()
    readonly teamId: string;

    @IsString()
    @IsNotEmpty()
    readonly repositoryId: string;
}
