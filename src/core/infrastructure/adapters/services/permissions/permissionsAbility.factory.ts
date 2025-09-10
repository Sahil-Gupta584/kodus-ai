import {
    IPermissionsService,
    PERMISSIONS_SERVICE_TOKEN,
} from '@/core/domain/permissions/contracts/permissions.service.contract';
import { Action, Role } from '@/core/domain/permissions/enums/permissions.enum';
import {
    AppAbility,
    ResourceBilling,
    ResourceCockpit,
    ResourceSettings,
    ResourceRepository,
    ResourceIssue,
} from '@/core/domain/permissions/types/permissions.types';
import { IUser } from '@/core/domain/user/interfaces/user.interface';
import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class PermissionsAbilityFactory {
    constructor(
        @Inject(PERMISSIONS_SERVICE_TOKEN)
        private readonly permissionsService: IPermissionsService,
    ) {}

    async createFor(user: IUser): Promise<AppAbility> {
        const { can, cannot, build } = new AbilityBuilder(createMongoAbility);

        const userRoles = user.role || [];
        const userOrganizationId = user.organization?.uuid;
        const permissionsEntity = await this.permissionsService.findOne({
            user: { uuid: user.uuid },
        });
        const assignedRepoUuids =
            permissionsEntity?.assignedRepositoryIds || [];

        if (userRoles.includes(Role.OWNER)) {
            // Owners can do everything in their organization.
            can(Action.Manage, 'all', {
                organizationId: userOrganizationId,
            });
        }

        if (userRoles.includes(Role.BILLING_MANAGER)) {
            // Billing Managers have full control over billing and can view/update settings.
            can(Action.Manage, ResourceBilling, {
                organizationId: userOrganizationId,
            });
            can(Action.Read, ResourceRepository, {
                organizationId: userOrganizationId,
            });
            // Combining VIEW_ACTIVITY_LOG and MANAGE_GIT_SETTINGS under Resource.Settings
            can(Action.Manage, ResourceSettings, {
                organizationId: userOrganizationId,
            });
        }

        if (userRoles.includes(Role.REPO_ADMIN)) {
            // Repo Admins can manage repositories they are assigned to.
            can(Action.Manage, ResourceRepository, {
                uuid: { $in: assignedRepoUuids },
            });

            // They can manage their own issues.
            can(Action.Manage, ResourceIssue, { authorId: user.uuid });
            // And view all issues within their assigned repositories.
            can(Action.Read, ResourceIssue, {
                repositoryUuid: { $in: assignedRepoUuids },
            });

            // They can view their own cockpit data.
            can(Action.Read, ResourceCockpit, { ownerId: user.uuid });

            // They can manage Git settings.
            can(Action.Manage, ResourceSettings, {
                organizationId: userOrganizationId,
            });
        }

        if (userRoles.includes(Role.CONTRIBUTOR)) {
            // Contributors can view repositories they are assigned to.
            can(Action.Read, ResourceRepository, {
                uuid: { $in: assignedRepoUuids },
            });

            // They can view issues they created.
            can(Action.Read, ResourceIssue, { authorId: user.uuid });

            // They can view their own cockpit data.
            can(Action.Read, ResourceCockpit, { ownerId: user.uuid });

            // They can manage Git settings.
            can(Action.Read, ResourceSettings, {
                organizationId: userOrganizationId,
            });
        }

        return build({
            detectSubjectType: (item) => item.constructor as any,
        }) as AppAbility;
    }
}
