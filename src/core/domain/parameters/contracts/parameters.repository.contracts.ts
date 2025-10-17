import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { ParametersEntity } from '../entities/parameters.entity';
import { IParameters } from '../interfaces/parameters.interface';
import { ParametersKey } from '@/shared/domain/enums/parameters-key.enum';

export const PARAMETERS_REPOSITORY_TOKEN = Symbol('ParametersRepository');

export interface IParametersRepository {
    find<K extends ParametersKey>(
        filter?: Partial<IParameters<K>>,
    ): Promise<ParametersEntity<K>[]>;
    findOne<K extends ParametersKey>(
        filter?: Partial<IParameters<K>>,
    ): Promise<ParametersEntity<K>>;
    findById<K extends ParametersKey>(
        uuid: string,
    ): Promise<ParametersEntity<K> | undefined>;
    findByOrganizationName<K extends ParametersKey>(
        organizationName: string,
    ): Promise<ParametersEntity<K> | undefined>;
    create<K extends ParametersKey>(
        integrationConfig: IParameters<K>,
    ): Promise<ParametersEntity<K> | undefined>;
    update<K extends ParametersKey>(
        filter: Partial<IParameters<K>>,
        data: Partial<IParameters<K>>,
    ): Promise<ParametersEntity<K> | undefined>;
    delete(uuid: string): Promise<void>;
    findByKey<K extends ParametersKey>(
        configKey: K,
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<ParametersEntity<K>>;
}
