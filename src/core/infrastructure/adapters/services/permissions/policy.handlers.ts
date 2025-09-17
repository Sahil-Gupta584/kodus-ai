import {
    Action,
    ResourceType,
} from '@/core/domain/permissions/enums/permissions.enum';
import { PolicyHandler } from '@/core/domain/permissions/types/policy.types';
import { subject as caslSubject } from '@casl/ability';

const getNestedValue = (obj: any, path: string): any => {
    return path.split('.').reduce((acc, key) => acc?.[key], obj);
};

export const checkPermissions = (
    action: Action,
    resource: ResourceType,
): PolicyHandler => {
    return (ability, request) => {
        if (!request.user?.organization?.uuid) {
            return false;
        }

        const subject = caslSubject(resource, {
            organizationId: request.user.organization.uuid,
        });

        return ability.can(action, subject as any);
    };
};

export const checkRepoPermissions = (
    action: Action,
    resource: ResourceType,
    key?: {
        params?: string;
        query?: string;
        body?: string;
    },
    customRepoId?: string | number | (() => string | number) | null,
): PolicyHandler => {
    return (ability, request) => {
        if (!request.user?.organization?.uuid) {
            return false;
        }

        const repoId =
            getNestedValue(request?.params, key?.params || '') ||
            getNestedValue(request?.query, key?.query || '') ||
            getNestedValue(request?.body, key?.body || '') ||
            (typeof customRepoId === 'function'
                ? customRepoId()
                : customRepoId) ||
            null;

        if (!repoId) {
            return false;
        }

        const subject = caslSubject(resource, {
            organizationId: request.user.organization.uuid,
            repoId,
        });

        return ability.can(action, subject as any);
    };
};
