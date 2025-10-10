import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
    FindManyOptions,
    FindOneOptions,
    Repository,
    UpdateQueryBuilder,
} from 'typeorm';
import {
    mapSimpleModelToEntity,
    mapSimpleModelsToEntities,
} from '@/shared/infrastructure/repositories/mappers';
import { createNestedConditions } from '@/shared/infrastructure/repositories/filters';
import { ParametersModel } from './schema/parameters.model';
import { ParametersEntity } from '@/core/domain/parameters/entities/parameters.entity';
import { IParameters } from '@/core/domain/parameters/interfaces/parameters.interface';
import { IParametersRepository } from '@/core/domain/parameters/contracts/parameters.repository.contracts';
import { ParametersKey } from '@/shared/domain/enums/parameters-key.enum';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';

@Injectable()
export class ParametersRepository implements IParametersRepository {
    constructor(
        @InjectRepository(ParametersModel)
        private readonly parametersRepository: Repository<ParametersModel>,
    ) {}

    async find<K extends ParametersKey>(
        filter?: Partial<IParameters<K>>,
    ): Promise<ParametersEntity<K>[]> {
        try {
            const { team, ...otherFilterAttributes } = filter || {};

            const teamCondition = createNestedConditions('team', team);

            const findOptions: FindManyOptions<ParametersModel> = {
                where: {
                    ...otherFilterAttributes,
                    ...teamCondition,
                },
                relations: ['team'],
            };

            const integrationConfigModel =
                await this.parametersRepository.find(findOptions);

            return mapSimpleModelsToEntities(
                integrationConfigModel,
                ParametersEntity,
            );
        } catch (error) {
            throw error;
        }
    }

    async findOne<K extends ParametersKey>(
        filter?: Partial<IParameters<K>>,
    ): Promise<ParametersEntity<K>> {
        try {
            const { team, ...otherFilterAttributes } = filter || {};

            const teamCondition = createNestedConditions('team', team);

            const findOptions: FindManyOptions<ParametersModel> = {
                where: {
                    ...otherFilterAttributes,
                    ...teamCondition,
                },
                relations: ['team'],
            };

            const integrationConfigModel =
                await this.parametersRepository.findOne(findOptions);

            return mapSimpleModelToEntity(
                integrationConfigModel,
                ParametersEntity,
            );
        } catch (error) {
            throw error;
        }
    }

    async findByOrganizationName<K extends ParametersKey>(
        organizationName: string,
    ): Promise<ParametersEntity<K> | undefined> {
        try {
            const response = await this.parametersRepository
                .createQueryBuilder('parameters')
                .leftJoinAndSelect('parameters.integration', 'integration')
                .where('parameters.configValue @> :item::jsonb', {
                    item: JSON.stringify({
                        organizationName: organizationName,
                    }),
                })
                .andWhere('parameters.active = :active', { active: true })
                .getOne();

            if (!response) {
                return null;
            }

            return mapSimpleModelToEntity(response, ParametersEntity);
        } catch (err) {
            throw err;
        }
    }

    async findById<K extends ParametersKey>(
        uuid: string,
    ): Promise<ParametersEntity<K>> {
        try {
            const queryBuilder =
                this.parametersRepository.createQueryBuilder('parameters');

            const integrationConfigSelected = await queryBuilder
                .where('parameters.uuid = :uuid', { uuid })
                .getOne();

            return mapSimpleModelToEntity(
                integrationConfigSelected,
                ParametersEntity,
            );
        } catch (error) {
            throw error;
        }
    }

    async create<K extends ParametersKey>(
        integrationConfig: IParameters<K>,
    ): Promise<ParametersEntity<K>> {
        try {
            const queryBuilder =
                this.parametersRepository.createQueryBuilder('parameters');

            const integrationConfigModel =
                this.parametersRepository.create(integrationConfig);

            const integrationConfigCreated = await queryBuilder
                .insert()
                .values(integrationConfigModel)
                .execute();

            if (integrationConfigCreated?.identifiers[0]?.uuid) {
                const findOneOptions: FindOneOptions<ParametersModel> = {
                    where: {
                        uuid: integrationConfigCreated.identifiers[0].uuid,
                    },
                };

                const integrationConfig =
                    await this.parametersRepository.findOne(findOneOptions);

                if (!integrationConfig) return undefined;

                return mapSimpleModelToEntity(
                    integrationConfig,
                    ParametersEntity,
                );
            }
        } catch (error) {
            throw error;
        }
    }

    async update<K extends ParametersKey>(
        filter: Partial<IParameters<K>>,
        data: Partial<IParameters<K>>,
    ): Promise<ParametersEntity<K>> {
        try {
            const queryBuilder: UpdateQueryBuilder<ParametersModel> =
                this.parametersRepository
                    .createQueryBuilder('parameters')
                    .update(ParametersModel)
                    .where(filter)
                    .set(data);

            const result = await queryBuilder.execute();

            if (result.affected > 0) {
                const { team, ...otherFilterAttributes } = filter || {};

                const teamCondition = createNestedConditions('team', team);

                const findOptions: FindManyOptions<ParametersModel> = {
                    where: {
                        ...otherFilterAttributes,
                        ...teamCondition,
                    },
                };

                const integrationConfig =
                    await this.parametersRepository.findOne(findOptions);

                if (integrationConfig) {
                    return mapSimpleModelToEntity(
                        integrationConfig,
                        ParametersEntity,
                    );
                }
            }

            return undefined;
        } catch (error) {
            throw error;
        }
    }
    async delete(uuid: string): Promise<void> {
        try {
            await this.parametersRepository.delete(uuid);
        } catch (error) {
            throw error;
        }
    }

    async findByKey<K extends ParametersKey>(
        configKey: K,
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<ParametersEntity<K>> {
        const queryBuilder =
            this.parametersRepository.createQueryBuilder('parameters');

        const parametersSelected = await queryBuilder
            .where('parameters.configKey = :configKey', { configKey })
            .andWhere('parameters.team_id = :teamId', {
                teamId: organizationAndTeamData.teamId,
            })
            .andWhere('parameters.active = :active', { active: true })
            .getOne();

        return mapSimpleModelToEntity(parametersSelected, ParametersEntity);
    }
}
