import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
    mapSimpleModelToEntity,
    mapSimpleModelsToEntities,
} from '@/shared/infrastructure/repositories/mappers';
import { IssuesModel } from './schema/issues.model';
import { IssuesEntity } from '@/core/domain/issues/entities/issues.entity';
import { IIssue } from '@/core/domain/issues/interfaces/issues.interface';


@Injectable()
export class IssuesRepository implements IIssuesRepository {
    constructor(
        @InjectModel(IssuesModel.name)
        private readonly issuesModel: Model<IssuesModel>,
    ) {}

    getNativeCollection() {
        try {
            return this.issuesModel.db.collection('issues');
        } catch (error) {
            throw error;
        }
    }

    //#region Create
    async create(issue: Omit<IIssue, 'uuid'>): Promise<IssuesEntity> {
        try {
            const saved = await this.issuesModel.create(issue);
            return mapSimpleModelToEntity(saved, IssuesEntity);
        } catch (error) {
            throw error;
        }
    }
    //#endregion

    //#region Get/Find
    async findById(uuid: string): Promise<IssuesEntity | null> {
        try {
            const doc = await this.issuesModel.findOne({ uuid }).exec();
            return doc ? mapSimpleModelToEntity(doc, IssuesEntity) : null;
        } catch (error) {
            throw error;
        }
    }

    async findOne(filter?: Partial<IIssue>): Promise<IssuesEntity | null> {
        try {
            const doc = await this.issuesModel.findOne(filter).exec();
            return doc ? mapSimpleModelToEntity(doc, IssuesEntity) : null;
        } catch (error) {
            throw error;
        }
    }

    async find(filter?: Partial<IIssue>): Promise<IssuesEntity[]> {
        try {
            const docs = await this.issuesModel.find(filter).exec();
            return mapSimpleModelsToEntities(docs, IssuesEntity);
        } catch (error) {
            throw error;
        }
    }

    async findOpenByFile(
        organizationId: string,
        repositoryId: string,
        filePath: string,
    ): Promise<IssuesEntity[]> {
        try {
            const docs = await this.issuesModel.find({
                'representativeSuggestion.organizationId': organizationId,
                'representativeSuggestion.repository.id': repositoryId,
                filePath: filePath,
                status: 'open',
            }).exec();

            return mapSimpleModelsToEntities(docs, IssuesEntity);
        } catch (error) {
            throw error;
        }
    }

    async findBySuggestionId(suggestionId: string): Promise<IssuesEntity | null> {
        try {
            const doc = await this.issuesModel.findOne({
                contributingSuggestionIds: suggestionId,
            }).exec();

            return doc ? mapSimpleModelToEntity(doc, IssuesEntity) : null;
        } catch (error) {
            throw error;
        }
    }
    //#endregion

    //#region Update
    async update(
        issue: IssuesEntity,
        updateData: Omit<Partial<IIssue>, 'uuid' | 'id'>,
    ): Promise<IssuesEntity | null> {
        try {
            const doc = await this.issuesModel.findOneAndUpdate(
                { _id: issue.uuid },
                { $set: updateData },
                { new: true },
            );
            return doc ? mapSimpleModelToEntity(doc, IssuesEntity) : null;
        } catch (error) {
            throw error;
        }
    }

    async updateStatus(
        uuid: string,
        status: 'open' | 'resolved' | 'dismissed',
    ): Promise<IssuesEntity | null> {
        try {
            const doc = await this.issuesModel.findOneAndUpdate(
                { _id: uuid },
                { $set: { status } },
                { new: true },
            );
            return doc ? mapSimpleModelToEntity(doc, IssuesEntity) : null;
        } catch (error) {
            throw error;
        }
    }

    async addSuggestionIds(
        uuid: string,
        suggestionIds: string[],
    ): Promise<IssuesEntity | null> {
        try {
            const doc = await this.issuesModel.findOneAndUpdate(
                { _id: uuid },
                {
                    $addToSet: {
                        contributingSuggestionIds: { $each: suggestionIds }
                    }
                },
                { new: true },
            );
            return doc ? mapSimpleModelToEntity(doc, IssuesEntity) : null;
        } catch (error) {
            throw error;
        }
    }
    //#endregion
}