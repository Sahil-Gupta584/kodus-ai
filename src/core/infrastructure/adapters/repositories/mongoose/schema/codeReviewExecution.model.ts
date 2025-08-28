import {
    CodeReviewExecutionStatus,
    CodeReviewExecutionTrigger,
} from '@/core/domain/codeReviewExecutions/enum/codeReviewExecution.enum';
import { CodeReviewExecution } from '@/core/domain/codeReviewExecutions/interfaces/codeReviewExecution.interface';
import { CoreDocument } from '@/shared/infrastructure/repositories/model/mongodb';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({
    collection: 'codeReviewExecutions',
    timestamps: true,
    autoIndex: true,
})
export class CodeReviewExecutionModel extends CoreDocument {
    @Prop({ type: String, required: true })
    organizationId: CodeReviewExecution['organizationId'];

    @Prop({ type: String, required: true })
    teamId: CodeReviewExecution['teamId'];

    @Prop({ type: String, required: true })
    pullRequestId: CodeReviewExecution['pullRequestId'];

    @Prop({ type: String, required: true, enum: CodeReviewExecutionStatus })
    status: CodeReviewExecution['status'];

    @Prop({ type: String, required: false })
    message?: CodeReviewExecution['message'];

    @Prop({ type: String, required: true, enum: CodeReviewExecutionTrigger })
    trigger: CodeReviewExecution['trigger'];

    @Prop({ type: String, required: false })
    lastCommitSha?: CodeReviewExecution['lastCommitSha'];

    @Prop({ type: String, required: false })
    dependsOn?: CodeReviewExecution['dependsOn'];

    @Prop({ type: Date, required: true })
    startedAt: CodeReviewExecution['startedAt'];

    @Prop({ type: Date, required: false })
    finishedAt?: CodeReviewExecution['finishedAt'];
}

export const CodeReviewExecutionSchema = SchemaFactory.createForClass(
    CodeReviewExecutionModel,
);
