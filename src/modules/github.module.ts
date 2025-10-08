import { OrganizationModule } from '@/modules/organization.module';
import { Module, forwardRef } from '@nestjs/common';
import { UseCases } from '@/core/application/use-cases/github';
import { GITHUB_SERVICE_TOKEN } from '@/core/domain/github/contracts/github.service.contract';
import { GithubController } from '@/core/infrastructure/http/controllers/github.controller';
import { UsersModule } from '@/modules/user.module';
import { TeamsModule } from '@/modules/team.module';
import { IntegrationModule } from './integration.module';
import { AuthIntegrationModule } from './authIntegration.module';
import { IntegrationConfigModule } from './integrationConfig.module';
import { PlatformIntegrationModule } from './platformIntegration.module';
import { PromptService } from '@/core/infrastructure/adapters/services/prompt.service';
import { ParametersModule } from './parameters.module';
import { GithubService } from '@/core/infrastructure/adapters/services/github/github.service';
import { GlobalCacheModule } from './cache.module';
import { AutomationModule } from './automation.module';
import { TeamAutomationModule } from './teamAutomation.module';
import { AutomationStrategyModule } from './automationStrategy.module';
import { AgentModule } from './agent.module';
import { RunCodeReviewAutomationUseCase } from '@/ee/automation/runCodeReview.use-case';
import { CodeReviewFeedbackModule } from './codeReviewFeedback.module';
import { CodebaseModule } from './codeBase.module';
import { LicenseModule } from '@/ee/license/license.module';
import { OrganizationParametersModule } from './organizationParameters.module';
import { WebhookLogModule } from './webhookLog.module';
import { PermissionValidationModule } from '@/ee/shared/permission-validation.module';

@Module({
    imports: [
        forwardRef(() => TeamsModule),
        forwardRef(() => AuthIntegrationModule),
        forwardRef(() => IntegrationModule),
        forwardRef(() => IntegrationConfigModule),
        forwardRef(() => PlatformIntegrationModule),
        forwardRef(() => OrganizationModule),
        forwardRef(() => UsersModule),
        forwardRef(() => ParametersModule),
        forwardRef(() => GlobalCacheModule),
        forwardRef(() => AutomationModule),
        forwardRef(() => TeamAutomationModule),
        forwardRef(() => AutomationStrategyModule),
        forwardRef(() => AgentModule),
        forwardRef(() => CodeReviewFeedbackModule),
        forwardRef(() => CodebaseModule),
        forwardRef(() => OrganizationParametersModule),
        forwardRef(() => WebhookLogModule),
        LicenseModule,
        PermissionValidationModule,
    ],
    providers: [
        ...UseCases,
        RunCodeReviewAutomationUseCase,
        PromptService,
        {
            provide: GITHUB_SERVICE_TOKEN,
            useClass: GithubService,
        },
    ],
    exports: [GITHUB_SERVICE_TOKEN],
    controllers: [GithubController],
})
export class GithubModule {}
