import { Entity } from '@/shared/domain/interfaces/entity';
import { IPullRequestMessages } from '../interfaces/pullRequestMessages.interface';
import {
    ConfigLevel,
    PullRequestMessageStatus,
    PullRequestMessageType,
} from '@/config/types/general/pullRequestMessages.type';

export class PullRequestMessagesEntity implements Entity<IPullRequestMessages> {
    private readonly _uuid: string;
    private readonly _organizationId: string;
    private readonly _teamId: string;
    private readonly _pullRequestMessageType: PullRequestMessageType;
    private readonly _content: string;
    private readonly _status: PullRequestMessageStatus;
    private readonly _configLevel: ConfigLevel;
    private readonly _repositoryId: string;

    constructor(pullRequestMessages: IPullRequestMessages) {
        this._uuid = pullRequestMessages.uuid;
        this._organizationId = pullRequestMessages.organizationId;
        this._teamId = pullRequestMessages.teamId;
        this._pullRequestMessageType =
            pullRequestMessages.pullRequestMessageType;
        this._content = pullRequestMessages.content;
        this._status = pullRequestMessages.status;
        this._configLevel = pullRequestMessages.configLevel;
        this._repositoryId = pullRequestMessages.repositoryId;
    }

    toJson(): IPullRequestMessages {
        return {
            uuid: this._uuid,
            organizationId: this._organizationId,
            teamId: this._teamId,
            pullRequestMessageType: this._pullRequestMessageType,
            content: this._content,
            status: this._status,
            configLevel: this._configLevel,
            repositoryId: this._repositoryId,
        };
    }

    toObject(): IPullRequestMessages {
        return {
            uuid: this._uuid,
            organizationId: this._organizationId,
            teamId: this._teamId,
            pullRequestMessageType: this._pullRequestMessageType,
            content: this._content,
            status: this._status,
            configLevel: this._configLevel,
            repositoryId: this._repositoryId,
        };
    }

    get uuid(): string {
        return this._uuid;
    }

    get organizationId(): string {
        return this._organizationId;
    }

    get teamId(): string {
        return this._teamId;
    }

    get pullRequestMessageType(): PullRequestMessageType {
        return this._pullRequestMessageType;
    }

    get content(): string {
        return this._content;
    }

    get status(): PullRequestMessageStatus {
        return this._status;
    }

    get configLevel(): ConfigLevel {
        return this._configLevel;
    }

    get repositoryId(): string {
        return this._repositoryId;
    }

    public static create(
        pullRequestMessages: IPullRequestMessages,
    ): PullRequestMessagesEntity {
        return new PullRequestMessagesEntity(pullRequestMessages);
    }
}
