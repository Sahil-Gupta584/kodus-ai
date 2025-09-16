import {
    Action,
    ResourceType,
} from '@/core/domain/permissions/enums/permissions.enum';
import { PolicyHandler } from '@/core/domain/permissions/types/policy.types';
import { subject as caslSubject } from '@casl/ability';
import { ResourceTypeFactory } from './resourceType.factory';

export const checkPermissions = (
    action: Action,
    resource: ResourceType,
): PolicyHandler => {
    return (ability) => {
        const resourceSubject =
            ResourceTypeFactory.getSubjectOfResource(resource);

        const subject = caslSubject(resourceSubject as string, {});

        return ability.can(action, subject);
    };
};

export const checkRepoPermissions = (
    action: Action,
    resource: ResourceType,
    key: {
        params?: string;
        query?: string;
        body?: string;
    },
): PolicyHandler => {
    return (ability, request) => {
        const repoId =
            request?.params?.[key?.query] ||
            request?.query?.[key?.query] ||
            request?.body?.[key?.body];

        if (!repoId) {
            return false;
        }

        const resourceSubject =
            ResourceTypeFactory.getSubjectOfResource(resource);

        const subject = caslSubject(resourceSubject as string, { repoId });

        return ability.can(action, subject);
    };
};
