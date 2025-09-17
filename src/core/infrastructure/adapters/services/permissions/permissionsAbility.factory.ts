import {
    IPermissionsService,
    PERMISSIONS_SERVICE_TOKEN,
} from '@/core/domain/permissions/contracts/permissions.service.contract';
import {
    Action,
    ResourceType,
    Role,
} from '@/core/domain/permissions/enums/permissions.enum';
import { AppAbility } from '@/core/domain/permissions/types/permissions.types';
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
            conditions?: C,
        ) => {
            const repos = [...assignedRepoUuids, 'global'];

            const finalConditions = {
                ...conditions,
                organizationId: userOrganizationId,
                repoId: {
                    $in: repos,
                },
            };

            can(action, subject, finalConditions);
        };

        switch (userRole) {
            case Role.OWNER:
                canInOrg(Action.Manage, 'all');
                break;

            case Role.REPO_ADMIN:
                canInRepo(Action.Read, ResourceType.CodeReviewSettings);
                canInRepo(Action.Update, ResourceType.CodeReviewSettings);
                canInRepo(Action.Create, ResourceType.CodeReviewSettings);

                canInRepo(Action.Read, ResourceType.Cockpit);

                canInRepo(Action.Read, ResourceType.Issues);
                canInRepo(Action.Update, ResourceType.Issues);
                canInRepo(Action.Create, ResourceType.Issues);

                canInRepo(Action.Read, ResourceType.Logs);

                canInRepo(Action.Read, ResourceType.PullRequests);

                canInOrg(Action.Read, ResourceType.GitSettings);

                canInOrg(Action.Read, ResourceType.PluginSettings);
                break;

            case Role.BILLING_MANAGER:
                canInRepo(Action.Read, ResourceType.CodeReviewSettings);

                canInOrg(Action.Manage, ResourceType.Billing);

                canInOrg(Action.Read, ResourceType.GitSettings);

                canInOrg(Action.Read, ResourceType.PluginSettings);

                canInOrg(Action.Read, ResourceType.Logs);
                break;

            case Role.CONTRIBUTOR:
                canInRepo(Action.Read, ResourceType.CodeReviewSettings);

                canInRepo(Action.Read, ResourceType.Issues);
                break;

            default:
                cannot(Action.Manage, 'all');
                break;
        }

        return build() as AppAbility;
    }
}
