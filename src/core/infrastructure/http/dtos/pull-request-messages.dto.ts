import { PullRequestMessageStatus, PullRequestMessageType } from '@/config/types/general/pullRequestMessages.type';
import { IsObject, IsString } from 'class-validator';

export class PullRequestMessagesDto {
    @IsString()
    public organizationId: string;

    @IsString()
    public teamId: string;

    @IsString()
    public pullRequestMessageType: PullRequestMessageType;

    @IsString()
    public status: PullRequestMessageStatus;

    @IsString()
    public content: string;

    @IsObject()
    public repository?: { id: string; name: string };
}
