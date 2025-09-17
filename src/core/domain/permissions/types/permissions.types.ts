import { IUser } from '../../user/interfaces/user.interface';
import { Action, ResourceType } from '../enums/permissions.enum';
import { MongoAbility } from '@casl/ability';

export type Subject = ResourceType | 'all';

export type AppAbility = MongoAbility<[Action, Subject]>; // has nothing to do with mongo as a database

export type IPermissions = {
    uuid: string;
    assignedRepositoryIds: string[];
    user: Partial<IUser>;
};
