import { PolicyHandler } from '@/core/domain/permissions/types/policy.types';
import {
    CanActivate,
    ExecutionContext,
    Injectable,
    SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsAbilityFactory } from './permissionsAbility.factory';

const CHECK_POLICIES_KEY = 'check_policy';

export const CheckPolicies = (...handlers: PolicyHandler[]) =>
    SetMetadata(CHECK_POLICIES_KEY, handlers);

@Injectable()
export class PolicyGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly abilityFactory: PermissionsAbilityFactory,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const policyHandlers =
            this.reflector.get<PolicyHandler[]>(
                CHECK_POLICIES_KEY,
                context.getHandler(),
            ) || [];

        const request = context.switchToHttp().getRequest();
        const { user } = request;

        if (!user) {
            return false;
        }

        const ability = await this.abilityFactory.createForUser(user);

        return policyHandlers.every((handler) =>
            typeof handler === 'function'
                ? handler(ability, request)
                : handler.handle(ability, request),
        );
    }
}
