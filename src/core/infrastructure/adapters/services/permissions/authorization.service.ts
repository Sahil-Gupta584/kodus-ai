import {
    Action,
    ResourceType,
} from '@/core/domain/permissions/enums/permissions.enum';
import { IUser } from '@/core/domain/user/interfaces/user.interface';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { PermissionsAbilityFactory } from './permissionsAbility.factory';
import { subject } from '@casl/ability';
import { ResourceTypeFactory } from './resourceType.factory';

@Injectable()
export class AuthorizationService {
    constructor(
        private readonly permissionsAbilityFactory: PermissionsAbilityFactory,
    ) {}

    async check(params: {
        user: Partial<IUser>;
        action: Action;
        resource: ResourceType;
        repoId?: string;
    }): Promise<boolean> {
        const { user, action, resource, repoId } = params;

        if (!user || !user.uuid) {
            return false;
        }

        const ability = await this.permissionsAbilityFactory.createForUser(
            user as IUser,
        );
        const resourceSubject =
            ResourceTypeFactory.getSubjectOfResource(resource);
        const subjectInstance = subject(resourceSubject as string, {
            ...(repoId ? { repoId } : {}),
        });
        return ability.can(action, subjectInstance);
    }

    async ensure(params: {
        user: Partial<IUser>;
        action: Action;
        resource: ResourceType;
        repoId?: string;
    }): Promise<void> {
        const { user, action, resource, repoId } = params;

        const isAllowed = await this.check({ user, action, resource, repoId });
        if (!isAllowed) {
            throw new ForbiddenException(
                `User does not have permission to ${action} on ${resource}`,
            );
        }
    }
}
