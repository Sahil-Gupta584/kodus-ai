import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CodeReviewSettingsLogModel } from './schema/codeReviewSettingsLog.model';
import { ICodeReviewSettingsLogRepository } from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.repository.contract';
import { CodeReviewSettingsLogEntity } from '@/core/domain/codeReviewSettingsLog/entities/codeReviewSettingsLog.entity';
import { mapSimpleModelsToEntities, mapSimpleModelToEntity } from '@/shared/infrastructure/repositories/mappers';
import { ICodeReviewSettingsLog } from '@/core/domain/codeReviewSettingsLog/interfaces/codeReviewSettingsLog.interface';

@Injectable()
export class CodeReviewSettingsLogRepository
    implements ICodeReviewSettingsLogRepository
{
    constructor(
        @InjectModel(CodeReviewSettingsLogModel.name)
        private readonly codeReviewSettingsLogModel: Model<CodeReviewSettingsLogModel>,
    ) {}

    async create(
        codeReviewSettingsLog: CodeReviewSettingsLogEntity,
    ): Promise<CodeReviewSettingsLogEntity> {
        try {
            const codeReviewSettingsLogSaved =
                await this.codeReviewSettingsLogModel.create(codeReviewSettingsLog);

            return mapSimpleModelToEntity(
                codeReviewSettingsLogSaved,
                CodeReviewSettingsLogEntity,
            );
        } catch (error) {
            console.log(error);
        }
    }

    async bulkCreate(
        codeReviewSettingsLog: CodeReviewSettingsLogEntity[],
    ): Promise<CodeReviewSettingsLogEntity[]> {
        try {
            const codeReviewSettingsLogSaved =
                await this.codeReviewSettingsLogModel.insertMany(codeReviewSettingsLog);

            return mapSimpleModelsToEntities(
                codeReviewSettingsLogSaved,
                CodeReviewSettingsLogEntity,
            );
        } catch (error) {
            console.log(error);
        }
    }

    async find(
        filter?: Partial<ICodeReviewSettingsLog>,
    ): Promise<CodeReviewSettingsLogEntity[]> {
        try {
            const codeReviewSettingsLog =
                await this.codeReviewSettingsLogModel.find(filter);

            return mapSimpleModelsToEntities(
                codeReviewSettingsLog,
                CodeReviewSettingsLogEntity,
            );
        } catch (error) {
            console.log(error);
        }
    }
}
