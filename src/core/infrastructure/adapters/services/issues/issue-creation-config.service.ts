import { Injectable, Inject } from '@nestjs/common';
import { ParametersKey } from '@/shared/domain/enums/parameters-key.enum';
import { IssueCreationConfig } from '@/core/domain/issues/entities/issue-creation-config.entity';
import {
    IParametersService,
    PARAMETERS_SERVICE_TOKEN,
} from '@/core/domain/parameters/contracts/parameters.service.contract';

@Injectable()
export class IssueCreationConfigService {
    constructor(
        @Inject(PARAMETERS_SERVICE_TOKEN)
        private readonly parametersService: IParametersService,
    ) {}

    async get(orgId: string, teamId?: string): Promise<IssueCreationConfig | null> {
        const params = await this.parametersService.findByKey(
            ParametersKey.ISSUE_CREATION_CONFIG,
            { organizationId: orgId, teamId },
        );
        return (params?.configValue as IssueCreationConfig) || null;
    }

    async set(
        config: IssueCreationConfig,
        ctx: { organizationId: string; teamId?: string },
    ): Promise<void> {
        await this.parametersService.createOrUpdateConfig(
            ParametersKey.ISSUE_CREATION_CONFIG,
            config,
            ctx,
        );
    }
}


