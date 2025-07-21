import {
    ActionType,
    ChangedData,
    ConfigLevel,
    MenuItem,
} from '@/config/types/general/codeReviewSettingsLog.type';
import { CoreDocument } from '@/shared/infrastructure/repositories/model/mongodb';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({
    collection: 'codeReviewSettingsLog',
    timestamps: true,
    autoIndex: true,
})
export class CodeReviewSettingsLogModel extends CoreDocument {
    @Prop({ type: String, required: true })
    organizationId: string;

    @Prop({ type: String, required: true })
    teamId: string;

    @Prop({ type: String, required: true, enum: ActionType })
    action: ActionType;

    @Prop({ type: Object, required: true })
    userInfo: {
        userId: string;
        userName: string;
        userEmail: string;
    };

    @Prop({ type: Object, required: true })
    changeMetadata: {
        menuItem: MenuItem;
        configLevel: ConfigLevel;
        repositoryId?: string;
    };

    @Prop({ type: [Object], required: true })
    changedData: ChangedData[];
}

export const CodeReviewSettingsLogSchema = SchemaFactory.createForClass(
    CodeReviewSettingsLogModel,
);
