import { IssueStatus } from '@/config/types/general/issues.type';
import { ISuggestion } from '@/core/domain/pullRequests/interfaces/pullRequests.interface';
import { CoreDocument } from '@/shared/infrastructure/repositories/model/mongodb';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({
    collection: 'issues',
    timestamps: true,
    autoIndex: true,
})
export class IssuesModel extends CoreDocument {
    @Prop({ type: String, required: true })
    public title: string;

    @Prop({ type: String, required: true })
    public description: string;

    @Prop({ type: String, required: true })
    public filePath: string;

    @Prop({ type: String, required: true })
    public language: string;

    @Prop({ type: Object, required: true })
    public representativeSuggestion: ISuggestion;

    @Prop({ type: [String], required: true })
    public contributingSuggestionIds: string[];

    @Prop({ type: [String], required: true })
    public status: IssueStatus;

    @Prop({ type: [String], required: true })
    public repositoryId: string;

    @Prop({ type: [String], required: true })
    public organizationId: string;
}

export const IssuesSchema = SchemaFactory.createForClass(IssuesModel);