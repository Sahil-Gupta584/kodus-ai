import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
    mapSimpleModelToEntity,
    mapSimpleModelsToEntities,
} from '@/shared/infrastructure/repositories/mappers';
import { IssuesModel } from './schema/issues.model';
import { IIssuesRepository } from '@/core/domain/issues/contracts/issues.repository';
import { IssuesEntity } from '@/core/domain/issues/entities/issues.entity';
import { IIssue } from '@/core/domain/issues/interfaces/issues.interface';
import { IssueStatus } from '@/config/types/general/issues.type';

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

    async create(issue: Omit<IIssue, 'uuid'>): Promise<IssuesEntity> {
        try {
            const saved = await this.issuesModel.create(issue);
            return mapSimpleModelToEntity(saved, IssuesEntity);
        } catch (error) {
            throw error;
        }
    }

    async findById(uuid: string): Promise<IssuesEntity | null> {
        try {
            const doc = await this.issuesModel.findById(uuid).exec();
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

    async findByFileAndStatus(
        organizationId: string,
        repositoryId: string,
        filePath: string,
        status?: IssueStatus,
    ): Promise<IssuesEntity[] | null> {
        try {
            const issues = await this.issuesModel.find({
                'organizationId': organizationId,
                'repository.id': repositoryId,
                'filePath': filePath,
                'status': status ? status : { $ne: IssueStatus.OPEN },
            });

            return issues
                ? mapSimpleModelsToEntities(issues, IssuesEntity)
                : null;
        } catch (error) {
            throw error;
        }
    }

    async find(
        filter?: Partial<IIssue>,
        options?: {
            limit?: number;
            skip?: number;
            sort?: any;
        },
    ): Promise<IssuesEntity[]> {
        try {
            let query = this.issuesModel.find(filter);

            if (options?.sort) {
                query = query.sort(options.sort);
            }

            if (options?.skip) {
                query = query.skip(options.skip);
            }

            if (options?.limit) {
                query = query.limit(options.limit);
            }

            const docs = await query.exec();
            return mapSimpleModelsToEntities(docs, IssuesEntity);
        } catch (error) {
            throw error;
        }
    }

    async count(filter?: Partial<IIssue>): Promise<number> {
        try {
            return await this.issuesModel.countDocuments(filter).exec();
        } catch (error) {
            throw error;
        }
    }

    async findBySuggestionId(
        suggestionId: string,
    ): Promise<IssuesEntity | null> {
        try {
            const doc = await this.issuesModel
                .findOne({
                    contributingSuggestionIds: suggestionId,
                })
                .exec();

            return doc ? mapSimpleModelToEntity(doc, IssuesEntity) : null;
        } catch (error) {
            throw error;
        }
    }

    async update(
        issue: IssuesEntity,
        updateData: Omit<Partial<IIssue>, 'uuid' | 'id'>,
    ): Promise<IssuesEntity | null> {
        try {
            const doc = await this.issuesModel.findByIdAndUpdate(
                issue.uuid,
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
            const doc = await this.issuesModel.findByIdAndUpdate(
                uuid,
                {
                    $set: {
                        'representativeSuggestion.implementationStatus': status,
                    },
                },
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
            const doc = await this.issuesModel.findByIdAndUpdate(
                uuid,
                {
                    $addToSet: {
                        contributingSuggestionIds: { $each: suggestionIds },
                    },
                },
                { new: true },
            );
            return doc ? mapSimpleModelToEntity(doc, IssuesEntity) : null;
        } catch (error) {
            throw error;
        }
    }
}
