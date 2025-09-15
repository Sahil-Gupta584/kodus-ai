import {
    IPermissionsService,
    PERMISSIONS_SERVICE_TOKEN,
} from '@/core/domain/permissions/contracts/permissions.service.contract';
import { Action, Role } from '@/core/domain/permissions/enums/permissions.enum';
import {
    AppAbility,
    ResourceBilling,
    ResourceCockpit,
    ResourceCodeReviewSettings,
    ResourcePullRequests,
    ResourceIssues,
    ResourceLogs,
    ResourceGitSettings,
    ResourcePluginSettings,
} from '@/core/domain/permissions/types/permissions.types';
import { IUser } from '@/core/domain/user/interfaces/user.interface';
import { AbilityBuilder, createMongoAbility, Subject } from '@casl/ability';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class PermissionsAbilityFactory {
    constructor(
        @Inject(PERMISSIONS_SERVICE_TOKEN)
        private readonly permissionsService: IPermissionsService,
    ) {}

    async createForUser(user: IUser): Promise<AppAbility> {
        const { can, cannot, build } = new AbilityBuilder(createMongoAbility);

        const userRole = user.role;
        const userOrganizationId = user.organization?.uuid;
        const permissionsEntity = await this.permissionsService.findOne({
            user: { uuid: user.uuid },
        });
        const assignedRepoUuids =
            permissionsEntity?.assignedRepositoryIds || [];

        const canInOrg = <S extends Subject, C>(
            action: Action,
            subject: S,
            conditions?: C,
        ) => {
            const finalConditions = {
                ...conditions,
                organizationId: userOrganizationId,
            };
            can(action, subject, finalConditions);
        };

        const canInRepo = <S extends Subject, C>(
            action: Action,
            subject: S,
            globalAccess = false,
            conditions?: C,
        ) => {
            const finalConditions = {
                ...conditions,
                organizationId: userOrganizationId,
                repoId: {
                    $in: globalAccess
                        ? [...assignedRepoUuids, 'global']
                        : [...assignedRepoUuids],
                },
            };

            can(action, subject, finalConditions);
        };

        switch (userRole) {
            case Role.OWNER:
                canInOrg(Action.Manage, 'all');
                break;

            case Role.REPO_ADMIN:
                canInRepo(Action.Read, ResourceCodeReviewSettings, true);
                canInRepo(Action.Update, ResourceCodeReviewSettings);
                canInRepo(Action.Create, ResourceCodeReviewSettings);

                canInRepo(Action.Read, ResourceCockpit);

                canInRepo(Action.Read, ResourceIssues);
                canInRepo(Action.Update, ResourceIssues);
                canInRepo(Action.Create, ResourceIssues);

                canInRepo(Action.Read, ResourceLogs);

                canInRepo(Action.Read, ResourcePullRequests);

                canInOrg(Action.Read, ResourceGitSettings);

                canInOrg(Action.Read, ResourcePluginSettings);
                break;

            case Role.BILLING_MANAGER:
                canInRepo(Action.Read, ResourceCodeReviewSettings, true);

                canInOrg(Action.Manage, ResourceBilling);

                canInOrg(Action.Read, ResourceGitSettings);

                canInOrg(Action.Read, ResourcePluginSettings);

                canInOrg(Action.Read, ResourceLogs);
                break;

            case Role.CONTRIBUTOR:
                canInRepo(Action.Read, ResourceCodeReviewSettings, true);

                canInRepo(Action.Read, ResourceIssues);
                break;

            default:
                cannot(Action.Manage, 'all');
                break;
        }

        return build({
            detectSubjectType: (item) => item.constructor as any,
        }) as AppAbility;
    }
}
