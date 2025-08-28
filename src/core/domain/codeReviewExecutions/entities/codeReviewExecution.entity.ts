import { Entity } from '@/shared/domain/interfaces/entity';
import { CodeReviewExecution } from '../interfaces/codeReviewExecution.interface';

export class CodeReviewExecutionEntity implements Entity<CodeReviewExecution> {
    private readonly _uuid: CodeReviewExecution['uuid'];
    private readonly _createdAt: CodeReviewExecution['createdAt'];
    private readonly _updatedAt: CodeReviewExecution['updatedAt'];

    private readonly _organizationId: CodeReviewExecution['organizationId'];
    private readonly _teamId: CodeReviewExecution['teamId'];
    private readonly _pullRequestId: CodeReviewExecution['pullRequestId'];
    private readonly _trigger: CodeReviewExecution['trigger'];
    private readonly _status: CodeReviewExecution['status'];
    private readonly _message?: CodeReviewExecution['message'];
    private readonly _lastCommitSha?: CodeReviewExecution['lastCommitSha'];
    private readonly _dependsOn?: CodeReviewExecution['dependsOn'];
    private readonly _startedAt: CodeReviewExecution['startedAt'];
    private readonly _finishedAt?: CodeReviewExecution['finishedAt'];

    constructor(codeReviewExecution: CodeReviewExecution) {
        this._uuid = codeReviewExecution.uuid;
        this._createdAt = codeReviewExecution.createdAt;
        this._updatedAt = codeReviewExecution.updatedAt;
        this._organizationId = codeReviewExecution.organizationId;
        this._teamId = codeReviewExecution.teamId;
        this._pullRequestId = codeReviewExecution.pullRequestId;
        this._trigger = codeReviewExecution.trigger;
        this._status = codeReviewExecution.status;
        this._message = codeReviewExecution.message;
        this._lastCommitSha = codeReviewExecution.lastCommitSha;
        this._dependsOn = codeReviewExecution.dependsOn;
        this._startedAt = codeReviewExecution.startedAt;
        this._finishedAt = codeReviewExecution.finishedAt;
    }

    toObject(): CodeReviewExecution {
        return {
            uuid: this.uuid,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            organizationId: this.organizationId,
            teamId: this.teamId,
            pullRequestId: this.pullRequestId,
            trigger: this.trigger,
            status: this.status,
            message: this.message,
            lastCommitSha: this.lastCommitSha,
            dependsOn: this.dependsOn,
            startedAt: this.startedAt,
            finishedAt: this.finishedAt,
        };
    }

    toJson(): CodeReviewExecution {
        return this.toObject();
    }

    public static create(
        execution: CodeReviewExecution,
    ): CodeReviewExecutionEntity {
        return new CodeReviewExecutionEntity(execution);
    }

    get uuid(): CodeReviewExecution['uuid'] {
        return this._uuid;
    }

    get createdAt(): CodeReviewExecution['createdAt'] {
        return this._createdAt;
    }

    get updatedAt(): CodeReviewExecution['updatedAt'] {
        return this._updatedAt;
    }

    get organizationId(): CodeReviewExecution['organizationId'] {
        return this._organizationId;
    }

    get teamId(): CodeReviewExecution['teamId'] {
        return this._teamId;
    }

    get pullRequestId(): CodeReviewExecution['pullRequestId'] {
        return this._pullRequestId;
    }

    get trigger(): CodeReviewExecution['trigger'] {
        return this._trigger;
    }

    get status(): CodeReviewExecution['status'] {
        return this._status;
    }

    get message(): CodeReviewExecution['message'] {
        return this._message;
    }

    get lastCommitSha(): CodeReviewExecution['lastCommitSha'] {
        return this._lastCommitSha;
    }

    get dependsOn(): CodeReviewExecution['dependsOn'] {
        return this._dependsOn;
    }

    get startedAt(): CodeReviewExecution['startedAt'] {
        return this._startedAt;
    }

    get finishedAt(): CodeReviewExecution['finishedAt'] {
        return this._finishedAt;
    }
}
