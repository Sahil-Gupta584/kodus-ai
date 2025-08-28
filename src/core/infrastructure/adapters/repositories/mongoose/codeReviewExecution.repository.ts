import { ICodeReviewExecutionRepository } from '@/core/domain/codeReviewExecutions/contracts/codeReviewExecution.repository.contract';
import { Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../../services/logger/pino.service';
import { InjectModel } from '@nestjs/mongoose';
import { CodeReviewExecutionModel } from './schema/codeReviewExecution.model';
import { Model } from 'mongoose';
import { CodeReviewExecutionEntity } from '@/core/domain/codeReviewExecutions/entities/codeReviewExecution.entity';
import { CodeReviewExecution } from '@/core/domain/codeReviewExecutions/interfaces/codeReviewExecution.interface';
import {
    mapSimpleModelsToEntities,
    mapSimpleModelToEntity,
} from '@/shared/infrastructure/repositories/mappers';

@Injectable()
export class CodeReviewExecutionRepository
    implements ICodeReviewExecutionRepository
{
    constructor(
        @InjectModel(CodeReviewExecutionModel.name)
        private readonly codeReviewExecutionModel: Model<CodeReviewExecutionModel>,

        private readonly logger: PinoLoggerService,
    ) {}

    getNativeCollection() {
        try {
            return this.codeReviewExecutionModel.db.collection(
                this.codeReviewExecutionModel.collection.name,
            );
        } catch (error) {
            throw error;
        }
    }

    async create(
        codeReviewExecution: Omit<
            CodeReviewExecution,
            'uuid' | 'createdAt' | 'updatedAt'
        >,
    ): Promise<CodeReviewExecutionEntity | null> {
        try {
            const doc =
                await this.codeReviewExecutionModel.create(codeReviewExecution);

            if (!doc) {
                return null;
            }

            return mapSimpleModelToEntity(doc, CodeReviewExecutionEntity);
        } catch (error) {
            this.logger.error({
                message: 'Error creating code review execution',
                context: CodeReviewExecutionRepository.name,
                error,
                metadata: { codeReviewExecution },
            });
            return null;
        }
    }

    async update(
        uuid: string,
        codeReviewExecution: Partial<
            Omit<CodeReviewExecution, 'uuid' | 'createdAt' | 'updatedAt'>
        >,
    ): Promise<CodeReviewExecutionEntity | null> {
        try {
            const doc = await this.codeReviewExecutionModel.findOneAndUpdate(
                { _id: uuid },
                codeReviewExecution,
                { new: true },
            );

            if (!doc) {
                return null;
            }

            return mapSimpleModelToEntity(doc, CodeReviewExecutionEntity);
        } catch (error) {
            this.logger.error({
                message: 'Error updating code review execution',
                context: CodeReviewExecutionRepository.name,
                error,
                metadata: { uuid, codeReviewExecution },
            });
            return null;
        }
    }

    async find(
        filter?: Partial<CodeReviewExecution>,
    ): Promise<CodeReviewExecutionEntity[]> {
        try {
            const docs = await this.codeReviewExecutionModel.find(filter || {});

            return mapSimpleModelsToEntities(docs, CodeReviewExecutionEntity);
        } catch (error) {
            this.logger.error({
                message: 'Error finding code review executions',
                context: CodeReviewExecutionRepository.name,
                error,
                metadata: { filter },
            });
            return [];
        }
    }

    async findOne(
        filter?: Partial<CodeReviewExecution>,
    ): Promise<CodeReviewExecutionEntity | null> {
        try {
            const doc = await this.codeReviewExecutionModel.findOne(
                filter || {},
            );

            if (!doc) {
                return null;
            }

            return mapSimpleModelToEntity(doc, CodeReviewExecutionEntity);
        } catch (error) {
            this.logger.error({
                message: 'Error finding code review execution',
                context: CodeReviewExecutionRepository.name,
                error,
                metadata: { filter },
            });
            return null;
        }
    }
}
