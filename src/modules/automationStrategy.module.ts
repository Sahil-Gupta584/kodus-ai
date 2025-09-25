import { Module, forwardRef } from '@nestjs/common';
import { AutomationModule } from './automation.module';
import { EXECUTE_AUTOMATION_SERVICE_TOKEN } from '@/shared/domain/contracts/execute.automation.service.contracts';
import { GithubModule } from './github.module';
import { JiraModule } from './jira.module';
import { SlackModule } from './slack.module';
import { TeamMembersModule } from './teamMembers.module';
import { ExecuteAutomationService } from '@/core/infrastructure/adapters/services/automation/processAutomation/config/execute.automation';
import { AutomationRegistry } from '@/core/infrastructure/adapters/services/automation/processAutomation/config/register.automation';
import { TeamAutomationModule } from './teamAutomation.module';
import { PlatformIntegrationModule } from './platformIntegration.module';
import { AuthIntegrationModule } from './authIntegration.module';
import { IntegrationModule } from './integration.module';
import { IntegrationConfigModule } from './integrationConfig.module';
import { TeamsModule } from '@/modules/team.module';
import { PromptService } from '@/core/infrastructure/adapters/services/prompt.service';
import { OrganizationAutomationModule } from './organizationAutomation.module';
import { ProfileConfigModule } from './profileConfig.module';
import { UseCases } from '@/core/application/use-cases/automation';
import { AutomationCodeReviewService } from '@/core/infrastructure/adapters/services/automation/processAutomation/strategies/automationCodeReview';
import { ParametersModule } from './parameters.module';
import { GetConnectionsUseCase } from '@/core/application/use-cases/integrations/get-connections.use-case';
import { CodebaseModule } from './codeBase.module';
import { UseCases as SaveCodeReviewFeedbackUseCase } from '@/core/application/use-cases/codeReviewFeedback';
import { CodeReviewFeedbackModule } from './codeReviewFeedback.module';
import { OrganizationModule } from './organization.module';
import { PullRequestsModule } from './pullRequests.module';
import { LicenseModule } from '@/ee/license/license.module';
import { CodeReviewExecutionModule } from './codeReviewExecution.module';
import { OrganizationParametersModule } from './organizationParameters.module';
import { BYOKDeterminationService } from '@/shared/infrastructure/services/byokDetermination.service';

@Module({
    imports: [
        forwardRef(() => JiraModule),
        forwardRef(() => GithubModule),
        forwardRef(() => SlackModule),
        forwardRef(() => TeamAutomationModule),
        forwardRef(() => OrganizationAutomationModule),
        forwardRef(() => AutomationModule),
        forwardRef(() => TeamMembersModule),
        forwardRef(() => PlatformIntegrationModule),
        forwardRef(() => IntegrationModule),
        forwardRef(() => IntegrationConfigModule),
        forwardRef(() => TeamsModule),
        forwardRef(() => ProfileConfigModule),
        forwardRef(() => ParametersModule),
        forwardRef(() => CodebaseModule),
        forwardRef(() => OrganizationModule),
        forwardRef(() => CodeReviewFeedbackModule),
        forwardRef(() => PullRequestsModule),
        forwardRef(() => OrganizationParametersModule),
        AuthIntegrationModule,
        LicenseModule,
        forwardRef(() => CodeReviewExecutionModule),
    ],
    providers: [
        ...UseCases,
        ...SaveCodeReviewFeedbackUseCase,
        GetConnectionsUseCase,
        AutomationCodeReviewService,
        PromptService,
        BYOKDeterminationService,
        {
            provide: EXECUTE_AUTOMATION_SERVICE_TOKEN,
            useClass: ExecuteAutomationService,
        },
        {
            provide: 'STRATEGIES_AUTOMATION',
            useFactory: (
                automationCodeReviewService: AutomationCodeReviewService,
            ) => {
                return [automationCodeReviewService];
            },
            inject: [AutomationCodeReviewService],
        },
        AutomationRegistry,
    ],
    exports: [
        'STRATEGIES_AUTOMATION',
        EXECUTE_AUTOMATION_SERVICE_TOKEN,
        AutomationRegistry,
    ],
})
export class AutomationStrategyModule {}
