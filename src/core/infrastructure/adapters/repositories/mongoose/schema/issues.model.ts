import { IssueStatus } from '@/config/types/general/issues.type';
import { ISuggestion } from '@/core/domain/pullRequests/interfaces/pullRequests.interface';
import { IContributingSuggestion } from '@/ee/kodyIssuesManagement/domain/kodyIssuesManagement.interface';
import { CoreDocument } from '@/shared/infrastructure/repositories/model/mongodb';
import { LabelType } from '@/shared/utils/codeManagement/labels';
import { SeverityLevel } from '@/shared/utils/enums/severityLevel.enum';
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

    @Prop({ type: String, required: true })
    public label: LabelType;

    @Prop({ type: String, required: true })
    public severity: SeverityLevel;

    @Prop({ type: Object, required: true })
    public representativeSuggestion: ISuggestion;

    @Prop({
        type: [{
            id: { type: String, required: true },
            prNumber: { type: Number, required: true }
        }],
        required: true,
        _id: false
    })
    public contributingSuggestions: IContributingSuggestion[];


    @Prop({ type: String, required: true })
    public status: IssueStatus;

    @Prop({
        type: {
            id: { type: String, required: true },
            name: { type: String, required: true }
        },
        required: true,
        _id: false
    })
    public repository: { id: string, name: string };

    @Prop({ type: String, required: true })
    public organizationId: string;
}

export const IssuesSchema = SchemaFactory.createForClass(IssuesModel);