import { ORGANIZATION_PARAMETERS_REPOSITORY_TOKEN } from '@/core/domain/organizationParameters/contracts/organizationParameters.repository.contract';
import { ORGANIZATION_PARAMETERS_SERVICE_TOKEN } from '@/core/domain/organizationParameters/contracts/organizationParameters.service.contract';
import { OrganizationParametersRepository } from '@/core/infrastructure/adapters/repositories/typeorm/organizationParameters.repository';
import { OrganizationParametersModel } from '@/core/infrastructure/adapters/repositories/typeorm/schema/organizationParameters.model';
import { OrganizationParametersService } from '@/core/infrastructure/adapters/services/organizationParameters.service';
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromptService } from '@/core/infrastructure/adapters/services/prompt.service';
import { IntegrationModule } from './integration.module';
import { IntegrationConfigModule } from './integrationConfig.module';
import { TeamsModule } from './team.module';
import { ProjectManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/projectManagement.service';
import { PlatformIntegrationFactory } from '@/core/infrastructure/adapters/services/platformIntegration/platformIntegration.factory';
import { ParametersModule } from './parameters.module';
import { OrgnizationParametersController } from '@/core/infrastructure/http/controllers/organizationParameters.controller';
import { CreateOrUpdateOrganizationParametersUseCase } from '@/core/application/use-cases/organizationParameters/create-or-update.use-case';
import { FindByKeyOrganizationParametersUseCase } from '@/core/application/use-cases/organizationParameters/find-by-key.use-case';
import { GetModelsByProviderUseCase } from '@/core/application/use-cases/organizationParameters/get-models-by-provider.use-case';
import { DeleteByokConfigUseCase } from '@/core/application/use-cases/organizationParameters/delete-byok-config.use-case';
import { ProviderService } from '@/core/infrastructure/adapters/services/providers/provider.service';
import { LicenseModule } from '@/ee/license/license.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([OrganizationParametersModel]),
        forwardRef(() => IntegrationModule),
        forwardRef(() => IntegrationConfigModule),
        forwardRef(() => TeamsModule),
        forwardRef(() => ParametersModule),
        forwardRef(() => LicenseModule),
    ],
    providers: [
        CreateOrUpdateOrganizationParametersUseCase,
        FindByKeyOrganizationParametersUseCase,
        GetModelsByProviderUseCase,
        DeleteByokConfigUseCase,
        OrganizationParametersService,
        PromptService,
        ProjectManagementService,
        PlatformIntegrationFactory,
        ProviderService,
        {
            provide: ORGANIZATION_PARAMETERS_SERVICE_TOKEN,
            useClass: OrganizationParametersService,
        },
        {
            provide: ORGANIZATION_PARAMETERS_REPOSITORY_TOKEN,
            useClass: OrganizationParametersRepository,
        },
    ],
    controllers: [OrgnizationParametersController],
    exports: [
        ORGANIZATION_PARAMETERS_SERVICE_TOKEN,
        ORGANIZATION_PARAMETERS_REPOSITORY_TOKEN,
        OrganizationParametersService,
        GetModelsByProviderUseCase,
        DeleteByokConfigUseCase,
    ],
})
export class OrganizationParametersModule {}
