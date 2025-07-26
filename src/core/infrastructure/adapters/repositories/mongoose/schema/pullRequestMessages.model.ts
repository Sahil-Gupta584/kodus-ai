import {
    PullRequestMessageStatus,
    PullRequestMessageType,
} from '@/config/types/general/pullRequestMessages.type';
import { IRepository } from '@/core/domain/pullRequests/interfaces/pullRequests.interface';
import { CoreDocument } from '@/shared/infrastructure/repositories/model/mongodb';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({
    collection: 'pullRequestMessages',
    timestamps: true,
    autoIndex: true,
})
export class PullRequestMessagesModel extends CoreDocument {
    @Prop({ type: String, required: true })
    organizationId: string;

    @Prop({ type: String, required: true, enum: PullRequestMessageType })
    pullRequestMessageType: PullRequestMessageType;

    @Prop({ type: String, required: true })
    content: string;

    @Prop({ type: String, required: true, enum: PullRequestMessageStatus })
    status: PullRequestMessageStatus;

    @Prop({ type: String, required: true })
    repository: Pick<IRepository, 'id' | 'fullName'>;
}
