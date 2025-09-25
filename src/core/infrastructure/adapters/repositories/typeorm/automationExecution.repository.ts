import { IAutomationExecutionRepository } from '@/core/domain/automation/contracts/automation-execution.repository';
import { AutomationExecutionEntity } from '@/core/domain/automation/entities/automation-execution.entity';
import { IAutomationExecution } from '@/core/domain/automation/interfaces/automation-execution.interface';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { AutomationExecutionModel } from './schema/automationExecution.model';
import {
    FindManyOptions,
    FindOneOptions,
    FindOptionsWhere,
    Repository,
} from 'typeorm';
import {
    mapSimpleModelToEntity,
    mapSimpleModelsToEntities,
} from '@/shared/infrastructure/repositories/mappers';
import { createNestedConditions } from '@/shared/infrastructure/repositories/filters';

@Injectable()
export class AutomationExecutionRepository
    implements IAutomationExecutionRepository
{
    constructor(
        @InjectRepository(AutomationExecutionModel)
        private readonly automationExecutionRepository: Repository<AutomationExecutionModel>,
        private readonly logger: PinoLoggerService,
    ) {}

    async create(
        automationExecution: IAutomationExecution,
    ): Promise<AutomationExecutionEntity> {
        try {
            const queryBuilder =
                this.automationExecutionRepository.createQueryBuilder(
                    'automationExecution',
                );

            const automationExecutionModel =
                this.automationExecutionRepository.create(automationExecution);

            const automationExecutionCreated = await queryBuilder
                .insert()
                .values(automationExecutionModel)
                .execute();

            if (automationExecutionCreated) {
                const findOneOptions: FindOneOptions<AutomationExecutionModel> =
                    {
                        where: {
                            uuid: automationExecutionCreated.identifiers[0]
                                .uuid,
                        },
                    };

                const selectedAutomationExecution =
                    await this.automationExecutionRepository.findOne(
                        findOneOptions,
                    );

                if (!selectedAutomationExecution) return undefined;

                return mapSimpleModelToEntity(
                    selectedAutomationExecution,
                    AutomationExecutionEntity,
                );
            }
        } catch (error) {
            this.logger.error({
                message: 'Failed to create automation execution',
                context: AutomationExecutionRepository.name,
                error,
            });
        }
    }

    async update(
        filter: Partial<IAutomationExecution>,
        data: Omit<
            Partial<IAutomationExecution>,
            'uuid' | 'createdAt' | 'updatedAt'
        >,
    ): Promise<AutomationExecutionEntity> {
        try {
            const conditions = this.getFilterConditions(filter);

            const updateResult =
                await this.automationExecutionRepository.update(
                    conditions,
                    data,
                );

            if (updateResult.affected === 0) {
                this.logger.warn({
                    message: 'No automation execution found for update',
                    context: AutomationExecutionRepository.name,
                    metadata: { filter },
                });
                return null;
            }

            // 3. Fetch the updated entity to return it. This ensures you get the fresh data.
            const updatedEntity =
                await this.automationExecutionRepository.findOne({
                    where: conditions,
                });

            return mapSimpleModelToEntity(
                updatedEntity,
                AutomationExecutionEntity,
            );
        } catch (error) {
            this.logger.error({
                message: 'Failed to update automation execution',
                context: AutomationExecutionRepository.name,
                error,
                metadata: { filter },
            });
        }
    }

    async delete(uuid: string): Promise<void> {
        try {
            await this.automationExecutionRepository.delete(uuid);
        } catch (error) {
            this.logger.error({
                message: 'Failed to delete automation execution',
                context: AutomationExecutionRepository.name,
                error,
                metadata: { uuid },
            });
        }
    }

    async findById(uuid: string): Promise<AutomationExecutionEntity> {
        try {
            const queryBuilder =
                this.automationExecutionRepository.createQueryBuilder(
                    'automationExecution',
                );

            const automationExecutionSelected = await queryBuilder
                .where('user.uuid = :uuid', { uuid })
                .getOne();

            return mapSimpleModelToEntity(
                automationExecutionSelected,
                AutomationExecutionEntity,
            );
        } catch (error) {
            this.logger.error({
                message: 'Failed to find automation execution by id',
                context: AutomationExecutionRepository.name,
                error,
                metadata: { uuid },
            });
        }
    }

    async find(
        filter?: Partial<IAutomationExecution>,
    ): Promise<AutomationExecutionEntity[]> {
        try {
            // Determine which relations to load based on the filter
            const relations = ['teamAutomation', 'codeReviewExecutions'];

            // Only load deep nested relations if the filter requires them
            if (filter?.teamAutomation) {
                const teamAutomationFilter = filter.teamAutomation;
                if (teamAutomationFilter.team) {
                    relations.push('teamAutomation.team');
                    if (teamAutomationFilter.team.organization) {
                        relations.push('teamAutomation.team.organization');
                    }
                }
            }

            const findOneOptions: FindManyOptions<AutomationExecutionModel> = {
                where: filter as FindOptionsWhere<AutomationExecutionModel>,
                relations,
            };

            const automationModel =
                await this.automationExecutionRepository.find(findOneOptions);

            return mapSimpleModelsToEntities(
                automationModel,
                AutomationExecutionEntity,
            );
        } catch (error) {
            this.logger.error({
                message: 'Failed to find automation executions',
                context: AutomationExecutionRepository.name,
                error,
                metadata: { filter },
            });
        }
    }

    async findPullRequestExecutionsByOrganization(params: {
        organizationId: string;
        repositoryIds?: string[];
        skip?: number;
        take?: number;
        order?: 'ASC' | 'DESC';
    }): Promise<{ data: AutomationExecutionEntity[]; total: number }> {
        const {
            organizationId,
            repositoryIds,
            skip = 0,
            take = 30,
            order = 'DESC',
        } = params;

        try {
            const queryBuilder =
                this.automationExecutionRepository.createQueryBuilder(
                    'automation_execution',
                );

            queryBuilder
                .select([
                    'automation_execution.uuid',
                    'automation_execution.createdAt',
                    'automation_execution.updatedAt',
                    'automation_execution.status',
                    'automation_execution.errorMessage',
                    'automation_execution.origin',
                    'automation_execution.pullRequestNumber',
                    'automation_execution.repositoryId',
                    'automation_execution.dataExecution',
                    'teamAutomation.uuid',
                    'team.name',
                    'codeReviewExecutions.uuid',
                ])
                .leftJoin(
                    'automation_execution.teamAutomation',
                    'teamAutomation',
                )
                .leftJoin('teamAutomation.team', 'team')
                .leftJoin('team.organization', 'organization')
                .leftJoin(
                    'automation_execution.codeReviewExecutions',
                    'codeReviewExecutions',
                )
                .where('automation_execution.pullRequestNumber IS NOT NULL')
                .andWhere('automation_execution.repositoryId IS NOT NULL')
                .andWhere('organization.uuid = :organizationId', {
                    organizationId,
                });

            if (repositoryIds?.length) {
                if (repositoryIds.length === 1) {
                    queryBuilder.andWhere(
                        'automation_execution.repositoryId = :repositoryId',
                        { repositoryId: repositoryIds[0] },
                    );
                } else {
                    queryBuilder.andWhere(
                        'automation_execution.repositoryId IN (:...repositoryIds)',
                        { repositoryIds },
                    );
                }
            }

            const total = await queryBuilder.getCount();

            if (total === 0) {
                return { data: [], total: 0 };
            }

            const executions = await queryBuilder
                .orderBy('automation_execution.createdAt', order)
                .skip(skip)
                .take(take)
                .getMany();

            const mapped =
                (mapSimpleModelsToEntities(
                    executions,
                    AutomationExecutionEntity,
                ) as AutomationExecutionEntity[]) ?? [];

            return { data: mapped, total };
        } catch (error) {
            this.logger.error({
                message: 'Failed to find pull request executions by organization',
                context: AutomationExecutionRepository.name,
                error,
                metadata: { params },
            });
            return { data: [], total: 0 };
        }
    }

    async findLatestExecutionByFilters(
        filters?: Partial<any>,
    ): Promise<AutomationExecutionEntity | null> {
        try {
            const queryBuilder =
                this.automationExecutionRepository.createQueryBuilder(
                    'automation_execution',
                );

            let result: AutomationExecutionModel | null = null;

            if (filters) {
                Object.keys(filters).forEach((key) => {
                    const value =
                        typeof filters[key] === 'object' && filters[key]?.uuid
                            ? filters[key].uuid
                            : filters[key];

                    queryBuilder.andWhere(
                        `automation_execution.${key} = :${key}`,
                        { [key]: value },
                    );
                });

                result = await queryBuilder
                    .orderBy('automation_execution.createdAt', 'DESC')
                    .getOne();
            }

            return mapSimpleModelToEntity(result, AutomationExecutionEntity);
        } catch (error) {
            this.logger.error({
                message: 'Failed to find latest execution by filters',
                context: AutomationExecutionRepository.name,
                error,
                metadata: { filters },
            });
        }
    }

    async findByPeriodAndTeamAutomationId(
        startDate: Date,
        endDate: Date,
        teamAutomationId: string,
    ): Promise<AutomationExecutionEntity[]> {
        try {
            const queryBuilder =
                this.automationExecutionRepository.createQueryBuilder(
                    'automation_execution',
                );
            queryBuilder.where(
                'automation_execution.createdAt BETWEEN :startDate AND :endDate',
                { startDate, endDate },
            );
            queryBuilder.andWhere(
                'automation_execution.team_automation_id = :teamAutomationId',
                { teamAutomationId },
            );
            const result = await queryBuilder.getMany();
            return mapSimpleModelsToEntities(result, AutomationExecutionEntity);
        } catch (error) {
            this.logger.error({
                message: 'Failed to find automation executions by period and team automation id',
                context: AutomationExecutionRepository.name,
                error,
                metadata: { startDate, endDate, teamAutomationId },
            });
        }
    }

    private getFilterConditions(
        filter: Partial<IAutomationExecution>,
    ): FindOptionsWhere<AutomationExecutionModel> {
        const { teamAutomation, codeReviewExecutions, ...restFilter } =
            filter || {};

        const teamAutomationCondition = createNestedConditions(
            'teamAutomation',
            teamAutomation,
        );
        const codeReviewExecutionsCondition = createNestedConditions(
            'codeReviewExecutions',
            codeReviewExecutions,
        );

        return {
            ...restFilter,
            ...codeReviewExecutionsCondition,
            ...teamAutomationCondition,
        };
    }
}
