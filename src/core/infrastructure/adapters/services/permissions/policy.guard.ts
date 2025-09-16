import {
    IPolicyHandler,
    PolicyHandler,
    PolicyHandlerCallback,
} from '@/core/domain/permissions/types/policy.types';
import {
    CanActivate,
    ExecutionContext,
    Injectable,
    SetMetadata,
    Type,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { PermissionsAbilityFactory } from './permissionsAbility.factory';

const CHECK_POLICIES_KEY = 'check_policy';

export const CheckPolicies = (...handlers: PolicyHandler[]) =>
    SetMetadata(CHECK_POLICIES_KEY, handlers);

@Injectable()
export class PolicyGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly abilityFactory: PermissionsAbilityFactory,
        private readonly moduleRef: ModuleRef,
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
            this.executeHandler(handler, ability, request),
        );
    }

    private async executeHandler(
        handler: PolicyHandler,
        ability: any,
        request: any,
    ): Promise<boolean> {
        // Check if the handler is a class constructor (an injectable handler)
        if (typeof handler === 'function' && 'prototype' in handler) {
            const instance = this.moduleRef.get(
                handler as Type<IPolicyHandler>,
                { strict: false },
            );

            if (!instance) {
                throw new Error(
                    `Policy handler ${handler.name} is not registered in the module.`,
                );
            }

            return instance.handle(ability, request);
        }

        // Check if it's an inline function
        if (typeof handler === 'function') {
            return (handler as PolicyHandlerCallback)(ability, request);
        }

        // It's an instance that implements the interface
        return handler.handle(ability, request);
    }
}
