import { Module, forwardRef } from '@nestjs/common';
import { TeamsModule } from './team.module';
import { TeamAutomationModule } from './teamAutomation.module';
import { AutomationStrategyModule } from './automationStrategy.module';
import { AutomationModule } from './automation.module';
import { IntegrationModule } from './integration.module';
import { AuthIntegrationModule } from './authIntegration.module';
import { PlatformIntegrationModule } from './platformIntegration.module';
import { IntegrationConfigModule } from './integrationConfig.module';

import { OrganizationModule } from './organization.module';

import { OrganizationAutomationModule } from './organizationAutomation.module';
import { ParametersModule } from './parameters.module';
import { CodeReviewFeedbackCronProvider } from '@/core/infrastructure/adapters/services/cron/codeReviewFeedback.cron';
import { KodyLearningCronProvider } from '@/core/infrastructure/adapters/services/cron/kodyLearning.cron';
import { KodyRulesModule } from './kodyRules.module';
import { PullRequestsModule } from './pullRequests.module';
import { CheckIfPRCanBeApprovedCronProvider } from '@/core/infrastructure/adapters/services/cron/CheckIfPRCanBeApproved.cron';

@Module({
    imports: [
        forwardRef(() => TeamsModule),
        forwardRef(() => PlatformIntegrationModule),
        forwardRef(() => ParametersModule),
        forwardRef(() => KodyRulesModule),
        PullRequestsModule,
        TeamAutomationModule,
        AutomationModule,
        AutomationStrategyModule,
        AuthIntegrationModule,
        IntegrationModule,
        IntegrationConfigModule,
        OrganizationModule,
        OrganizationAutomationModule,
    ],
    providers: [
        CodeReviewFeedbackCronProvider,
        KodyLearningCronProvider,
        CheckIfPRCanBeApprovedCronProvider,
    ],
    exports: [
        CodeReviewFeedbackCronProvider,
        CheckIfPRCanBeApprovedCronProvider,
    ],
})
export class CronModule {}
