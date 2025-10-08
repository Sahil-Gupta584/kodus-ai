import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ICodeReviewSettingsLogRepository } from '@/ee/codeReviewSettingsLog/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.repository.contract';
import { CodeReviewSettingsLogEntity } from '@/ee/codeReviewSettingsLog/domain/codeReviewSettingsLog/entities/codeReviewSettingsLog.entity';
import {
    mapSimpleModelsToEntities,
    mapSimpleModelToEntity,
} from '@/shared/infrastructure/repositories/mappers';
import { ICodeReviewSettingsLog } from '@/ee/codeReviewSettingsLog/domain/codeReviewSettingsLog/interfaces/codeReviewSettingsLog.interface';
import { CodeReviewSettingsLogModel } from '@/core/infrastructure/adapters/repositories/mongoose/schema/codeReviewSettingsLog.model';

@Injectable()
export class CodeReviewSettingsLogRepository
    implements ICodeReviewSettingsLogRepository
{
    constructor(
        @InjectModel(CodeReviewSettingsLogModel.name)
        private readonly codeReviewSettingsLogModel: Model<CodeReviewSettingsLogModel>,
    ) {}

    async create(
        codeReviewSettingsLog: Omit<ICodeReviewSettingsLog, 'uuid'>,
    ): Promise<CodeReviewSettingsLogEntity> {
        try {
            const saved = await this.codeReviewSettingsLogModel.create(
                codeReviewSettingsLog,
            );
            return mapSimpleModelToEntity(saved, CodeReviewSettingsLogEntity);
        } catch (error) {
            throw error;
        }
    }

    async find(
        filter?: Partial<ICodeReviewSettingsLog>,
    ): Promise<CodeReviewSettingsLogEntity[]> {
        try {
            const query = this.codeReviewSettingsLogModel.find(filter);

            query.sort({ createdAt: -1 });

            const codeReviewSettingsLog = await query.exec();

            return mapSimpleModelsToEntities(
                codeReviewSettingsLog,
                CodeReviewSettingsLogEntity,
            );
        } catch (error) {
            throw error;
        }
    }
}
