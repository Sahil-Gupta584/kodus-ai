import {
    CodeReviewExecutionStatus,
    CodeReviewExecutionTrigger,
} from '../enum/codeReviewExecution.enum';

export type CodeReviewExecution = {
    uuid: string; // MongoDB id

    organizationId: string;
    teamId: string;
    pullRequestId: string; // MongoDB id

    trigger: CodeReviewExecutionTrigger;
    status: CodeReviewExecutionStatus;
    message?: string | undefined;
    lastCommitSha?: string | undefined;
    dependsOn?: CodeReviewExecution['uuid'] | undefined;

    startedAt: Date;
    finishedAt?: Date | undefined;

    createdAt: Date; // MongoDB createdAt
    updatedAt: Date; // MongoDB updatedAt
};
