import { Injectable } from '@nestjs/common';
import { IPullRequestMessagesRepository } from '@/core/domain/pullRequestMessages/contracts/pullRequestMessages.repository.contract';
import { IPullRequestMessages } from '@/core/domain/pullRequestMessages/interfaces/pullRequestMessages.interface';
import { PullRequestMessagesEntity } from '@/core/domain/pullRequestMessages/entities/pullRequestMessages.entity';
import { PullRequestMessagesModel } from './schema/pullRequestMessages.model';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { mapSimpleModelToEntity } from '@/shared/infrastructure/repositories/mappers';

@Injectable()
export class PullRequestMessagesRepository
    implements IPullRequestMessagesRepository
{
    constructor(
        @InjectModel(PullRequestMessagesModel.name)
        private readonly pullRequestMessagesModel: Model<PullRequestMessagesModel>,
    ) {}

    async create(
        pullRequestMessages: IPullRequestMessages,
    ): Promise<PullRequestMessagesEntity> {
        const saved =
            await this.pullRequestMessagesModel.create(pullRequestMessages);
        return mapSimpleModelToEntity(saved, PullRequestMessagesEntity);
    }

    async update(
        pullRequestMessages: IPullRequestMessages,
    ): Promise<PullRequestMessagesEntity> {
        const updated = await this.pullRequestMessagesModel.findByIdAndUpdate(
            pullRequestMessages.uuid,
            pullRequestMessages,
            { new: true },
        );
        return mapSimpleModelToEntity(updated, PullRequestMessagesEntity);
    }

    async delete(uuid: string): Promise<void> {
        await this.pullRequestMessagesModel.findByIdAndDelete(uuid);
    }

    async find(
        filter?: Partial<IPullRequestMessages>,
    ): Promise<PullRequestMessagesEntity[]> {
        return this.pullRequestMessagesModel.find(filter);
    }

    async findOne(
        filter?: Partial<IPullRequestMessages>,
    ): Promise<PullRequestMessagesEntity | null> {
        return this.pullRequestMessagesModel.findOne(filter);
    }

    async findById(uuid: string): Promise<PullRequestMessagesEntity | null> {
        return this.pullRequestMessagesModel.findById(uuid);
    }
}
