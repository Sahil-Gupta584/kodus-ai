import { Module, forwardRef } from '@nestjs/common';
import { TeamAutomationModule } from './teamAutomation.module';
import { AutomationModule } from './automation.module';
import { UseCases } from '@/core/application/use-cases/agent';
import { AgentController } from '@/core/infrastructure/http/controllers/agent.controller';
import { AuthIntegrationModule } from './authIntegration.module';
import { PlatformIntegrationModule } from './platformIntegration.module';
import { IntegrationConfigModule } from './integrationConfig.module';
import { IntegrationModule } from './integration.module';
import { TeamMembersModule } from './teamMembers.module';
import { TeamsModule } from './team.module';
import { PromptService } from '@/core/infrastructure/adapters/services/prompt.service';
import { UsersModule } from './user.module';
import { ProfileConfigModule } from './profileConfig.module';
import { ParametersModule } from './parameters.module';
import { OrganizationParametersModule } from './organizationParameters.module';
import { McpAgentModule } from './mcpAgent.module';

@Module({
    imports: [
        forwardRef(() => PlatformIntegrationModule),
        forwardRef(() => TeamAutomationModule),
        forwardRef(() => AutomationModule),
        forwardRef(() => IntegrationConfigModule),
        forwardRef(() => IntegrationModule),
        forwardRef(() => TeamMembersModule),
        forwardRef(() => TeamsModule),
        forwardRef(() => ProfileConfigModule),
        forwardRef(() => UsersModule),
        forwardRef(() => AuthIntegrationModule),
        forwardRef(() => ParametersModule),
        forwardRef(() => OrganizationParametersModule),
        McpAgentModule,
    ],
    providers: [...UseCases, PromptService],
    controllers: [AgentController],
})
export class AgentModule {}
