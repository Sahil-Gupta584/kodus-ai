import { IUser } from '../../user/interfaces/user.interface';
import { Role, Action } from '../enums/permissions.enum';
import { InferSubjects, MongoAbility } from '@casl/ability';

export class ResourceRepository {
    uuid: string;
    organizationId: string;
}

export class ResourceIssue {
    authorId: string;
    repositoryUuid: string;
}

export class ResourceCockpit {
    ownerId: string;
}

export class ResourceBilling {
    organizationId: string;
}

export class ResourceSettings {
    organizationId: string;
}

type Subject =
    | InferSubjects<
          | typeof ResourceRepository
          | typeof ResourceIssue
          | typeof ResourceCockpit
          | typeof ResourceBilling
          | typeof ResourceSettings
      >
    | 'all';

export type AppAbility = MongoAbility<[Action, Subject]>; // has nothing to do with mongo as a database

export type IPermissions = {
    uuid: string;
    assignedRepositoryIds: string[];
    user: Partial<IUser>;
};
