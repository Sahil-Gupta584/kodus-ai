import { UseCases } from '@/core/application/use-cases/team';
import { CreateTeamUseCase } from '@/core/application/use-cases/team/create.use-case';
import { TEAM_REPOSITORY_TOKEN } from '@/core/domain/team/contracts/team.repository.contract';
import { TEAM_SERVICE_TOKEN } from '@/core/domain/team/contracts/team.service.contract';
import { TeamModel } from '@/core/infrastructure/adapters/repositories/typeorm/schema/team.model';
import { TeamDatabaseRepository } from '@/core/infrastructure/adapters/repositories/typeorm/team.repository';
import { TeamService } from '@/core/infrastructure/adapters/services/team.service';
import { TeamController } from '@/core/infrastructure/http/controllers/team.controller';
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileConfigModule } from './profileConfig.module';
import { UsersModule } from './user.module';
import { OrganizationParametersModule } from './organizationParameters.module';
import { OrganizationParametersService } from '@/core/infrastructure/adapters/services/organizationParameters.service';
import { PromptService } from '@/core/infrastructure/adapters/services/prompt.service';
import { IntegrationModule } from './integration.module';
import { IntegrationConfigModule } from './integrationConfig.module';
import { CreateOrUpdateParametersUseCase } from '@/core/application/use-cases/parameters/create-or-update-use-case';
import { ParametersModule } from './parameters.module';

import { ProjectManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/projectManagement.service';
import { PlatformIntegrationFactory } from '@/core/infrastructure/adapters/services/platformIntegration/platformIntegration.factory';
import { IntegrationModel } from '@/core/infrastructure/adapters/repositories/typeorm/schema/integration.model';

@Module({
    imports: [
        TypeOrmModule.forFeature([TeamModel, IntegrationModel]),
        forwardRef(() => ProfileConfigModule),
        forwardRef(() => UsersModule),
        forwardRef(() => OrganizationParametersModule),
        forwardRef(() => IntegrationModule),
        forwardRef(() => IntegrationConfigModule),
        forwardRef(() => ParametersModule),
    ],
    providers: [
        ...UseCases,
        CreateOrUpdateParametersUseCase,
        OrganizationParametersService,
        ProjectManagementService,
        PlatformIntegrationFactory,
        PromptService,
        TeamService,
        {
            provide: TEAM_SERVICE_TOKEN,
            useClass: TeamService,
        },
        {
            provide: TEAM_REPOSITORY_TOKEN,
            useClass: TeamDatabaseRepository,
        },
    ],
    exports: [TEAM_SERVICE_TOKEN, TEAM_REPOSITORY_TOKEN, CreateTeamUseCase],
    controllers: [TeamController],
})
export class TeamsModule {}
