import { CoreDocument } from '@/shared/infrastructure/repositories/model/mongodb';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({
    collection: 'activity_logs',
    timestamps: true,
    autoIndex: true,
})
export class ActivityLogModel extends CoreDocument {
    @Prop({ type: String, required: true, index: true })
    organizationId: string;

    @Prop({ type: String, required: false, index: true })
    teamId?: string;

    @Prop({ type: String, required: false })
    userId?: string;

    @Prop({ type: String, required: false })
    planType?: string;

    @Prop({ type: String, required: true, index: true })
    feature: string;

    @Prop({ type: String, required: true, index: true })
    action: string;

    @Prop({ type: Object, required: false })
    metadata?: Record<string, any>;
}

const ActivityLogSchema = SchemaFactory.createForClass(ActivityLogModel);

ActivityLogSchema.index({ organizationId: 1, createdAt: -1 });
ActivityLogSchema.index({ organizationId: 1, teamId: 1, createdAt: -1 });

export const ActivityLogModelInstance = {
    name: ActivityLogModel.name,
    schema: ActivityLogSchema,
};

export { ActivityLogSchema };
