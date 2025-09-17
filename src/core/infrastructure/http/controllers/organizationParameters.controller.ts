import { CreateOrUpdateOrganizationParametersUseCase } from '@/core/application/use-cases/organizationParameters/create-or-update.use-case';
import { FindByKeyOrganizationParametersUseCase } from '@/core/application/use-cases/organizationParameters/find-by-key.use-case';
import {
    GetModelsByProviderUseCase,
    ModelResponse,
} from '@/core/application/use-cases/organizationParameters/get-models-by-provider.use-case';
import { OrganizationParametersKey } from '@/shared/domain/enums/organization-parameters-key.enum';
import { ProviderService } from '@/core/infrastructure/adapters/services/providers/provider.service';

import { Body, Controller, Get, Post, Query } from '@nestjs/common';

@Controller('organization-parameters')
export class OrgnizationParametersController {
    constructor(
        private readonly createOrUpdateOrganizationParametersUseCase: CreateOrUpdateOrganizationParametersUseCase,
        private readonly findByKeyOrganizationParametersUseCase: FindByKeyOrganizationParametersUseCase,
        private readonly getModelsByProviderUseCase: GetModelsByProviderUseCase,
        private readonly providerService: ProviderService,
    ) {}

    @Post('/create-or-update')
    public async createOrUpdate(
        @Body()
        body: {
            key: OrganizationParametersKey;
            configValue: any;
            organizationAndTeamData: { organizationId: string; teamId: string };
        },
    ) {
        return await this.createOrUpdateOrganizationParametersUseCase.execute(
            body.key,
            body.configValue,
            body.organizationAndTeamData,
        );
    }

    @Get('/find-by-key')
    public async findByKey(
        @Query('key') key: OrganizationParametersKey,
        @Query('organizationId') organizationId: string,
    ) {
        return await this.findByKeyOrganizationParametersUseCase.execute(key, {
            organizationId,
        });
    }

    @Get('/byok-config')
    public async getByokConfig(
        @Query('organizationId') organizationId: string,
    ) {
        return await this.findByKeyOrganizationParametersUseCase.execute(
            OrganizationParametersKey.BYOK_CONFIG,
            { organizationId },
        );
    }

    @Get('/list-providers')
    public async listProviders() {
        const providers = this.providerService.getAllProviders();
        return {
            providers: providers.map((provider) => ({
                id: provider.id,
                name: provider.name,
                description: provider.description,
                requiresApiKey: provider.requiresApiKey,
                requiresBaseUrl: provider.requiresBaseUrl,
            })),
        };
    }

    @Get('/list-models')
    public async listModels(
        @Query('provider') provider: string,
    ): Promise<ModelResponse> {
        return await this.getModelsByProviderUseCase.execute(provider);
    }
}
