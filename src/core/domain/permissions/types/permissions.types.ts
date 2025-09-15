import { IUser } from '../../user/interfaces/user.interface';
import { Role, Action, ResourceType } from '../enums/permissions.enum';
import { InferSubjects, MongoAbility } from '@casl/ability';

export class Resource {
    organizationId: string;
}

export class ResourceWithRepo extends Resource {
    repoId: string;
}

export class ResourcePullRequests extends ResourceWithRepo {}

export class ResourceIssues extends ResourceWithRepo {}

export class ResourceCockpit extends ResourceWithRepo {}

export class ResourceBilling extends Resource {}

export class ResourceCodeReviewSettings extends ResourceWithRepo {}

export class ResourceGitSettings extends Resource {}

export class ResourceUserSettings extends Resource {}

export class ResourceOrganizationSettings extends Resource {}

export class ResourceLogs extends ResourceWithRepo {}

export class ResourcePluginSettings extends Resource {}

export type Subject =
    | InferSubjects<
          | typeof Resource
          | typeof ResourceWithRepo
          | typeof ResourcePullRequests
          | typeof ResourceIssues
          | typeof ResourceCockpit
          | typeof ResourceBilling
          | typeof ResourceCodeReviewSettings
          | typeof ResourceGitSettings
          | typeof ResourceUserSettings
          | typeof ResourceOrganizationSettings
          | typeof ResourceLogs
          | typeof ResourcePluginSettings
      >
    | 'all';

export type AppAbility = MongoAbility<[Action, Subject]>; // has nothing to do with mongo as a database

export type IPermissions = {
    uuid: string;
    assignedRepositoryIds: string[];
    user: Partial<IUser>;
};
