export enum CodeReviewExecutionTrigger {
    AUTOMATIC = 'AUTOMATIC',
    COMMAND = 'COMMAND',
    COMMIT_PUSH = 'COMMIT_PUSH',
}

export enum CodeReviewExecutionStatus {
    PENDING = 'PENDING',
    IN_PROGRESS = 'IN_PROGRESS',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    SKIPPED = 'SKIPPED',
}
