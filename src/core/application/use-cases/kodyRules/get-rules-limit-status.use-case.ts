import { Inject, Injectable } from '@nestjs/common';
import {
    IKodyRulesService,
    KODY_RULES_SERVICE_TOKEN,
} from '@/core/domain/kodyRules/contracts/kodyRules.service.contract';
import { REQUEST } from '@nestjs/core';
import { UserRequest } from '@/config/types/http/user-request.type';

@Injectable()
export class GetRulesLimitStatusUseCase {
    constructor(
        @Inject(KODY_RULES_SERVICE_TOKEN)
        private readonly kodyRulesService: IKodyRulesService,
        @Inject(REQUEST)
        private readonly request: UserRequest,
    ) {}

    async execute(): Promise<{
        total: number;
    }> {
        const organizationId = this.request.user.organization.uuid;

        if (!organizationId) {
            throw new Error('Organization ID not found');
        }

        return this.kodyRulesService.getRulesLimitStatus({
            organizationId,
        });
    }
}
