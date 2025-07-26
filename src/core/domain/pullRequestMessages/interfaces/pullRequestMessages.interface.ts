import {
    PullRequestMessageStatus,
    PullRequestMessageType,
} from '@/config/types/general/pullRequestMessages.type';

export interface IPullRequestMessages {
    uuid: string;
    organizationId: string;
    teamId: string;
    pullRequestMessageType: PullRequestMessageType;
    content: string;
    status: PullRequestMessageStatus;
    repository: { id: string; name: string };
}
