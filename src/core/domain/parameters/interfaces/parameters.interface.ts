import { ITeam } from '../../team/interfaces/team.interface';
import { ParametersKey } from '@/shared/domain/enums/parameters-key.enum';
import { ConfigValueMap } from '../types/configValue.type';

export interface IParameters<K extends ParametersKey> {
    uuid: string;
    team?: Partial<ITeam>;
    configKey: K;
    configValue: ConfigValueMap[K];
    createdAt?: Date;
    updatedAt?: Date;
    active: boolean;
}
