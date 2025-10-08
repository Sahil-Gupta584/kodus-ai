import { UseCases } from '@/core/application/use-cases/automation';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutomationModel } from '@/core/infrastructure/adapters/repositories/typeorm/schema/automation.model';
import { AUTOMATION_REPOSITORY_TOKEN } from '@/core/domain/automation/contracts/automation.repository';
import { AUTOMATION_SERVICE_TOKEN } from '@/core/domain/automation/contracts/automation.service';
import { AutomationRepository } from '@/core/infrastructure/adapters/repositories/typeorm/automation.repository';
import { AutomationService } from '@/core/infrastructure/adapters/services/automation/automation.service';
import { AUTOMATION_EXECUTION_REPOSITORY_TOKEN } from '@/core/domain/automation/contracts/automation-execution.repository';
import { AUTOMATION_EXECUTION_SERVICE_TOKEN } from '@/core/domain/automation/contracts/automation-execution.service';
import { AutomationExecutionRepository } from '@/core/infrastructure/adapters/repositories/typeorm/automationExecution.repository';
import { AutomationExecutionService } from '@/core/infrastructure/adapters/services/automation/automation-execution.service';
import { AutomationExecutionModel } from '@/core/infrastructure/adapters/repositories/typeorm/schema/automationExecution.model';
import { JiraModule } from './jira.module';
import { GithubModule } from './github.module';
import { TeamsModule } from './team.module';
import { Module, forwardRef } from '@nestjs/common';
import { AutomationController } from '@/core/infrastructure/http/controllers/automation.controller';
import { TeamAutomationModule } from './teamAutomation.module';
import { AutomationStrategyModule } from './automationStrategy.module';
import { PlatformIntegrationModule } from './platformIntegration.module';
import { IntegrationModule } from './integration.module';
import { PromptService } from '@/core/infrastructure/adapters/services/prompt.service';
import { IntegrationConfigModule } from './integrationConfig.module';
import { AuthIntegrationModule } from './authIntegration.module';
import { OrganizationAutomationExecutionModel } from '@/core/infrastructure/adapters/repositories/typeorm/schema/organizationAutomationExecution.model';
import { ORGANIZATION_AUTOMATION_EXECUTION_SERVICE_TOKEN } from '@/core/domain/automation/contracts/organization-automation-execution.service';
import { OrganizationAutomationExecutionService } from '@/core/infrastructure/adapters/services/automation/organization-automation-execution.service';
import { ORGANIZATION_AUTOMATION_EXECUTION_REPOSITORY_TOKEN } from '@/core/domain/automation/contracts/organization-automation-execution.repository';
import { OrganizationAutomationExecutionRepository } from '@/core/infrastructure/adapters/repositories/typeorm/organizationAutomationExecution.repository';
import { OrganizationAutomationModule } from './organizationAutomation.module';
import { UseCases as OrganizationAutomationUseCases } from '@/core/application/use-cases/organizationAutomation';
import { OrganizationModule } from './organization.module';
import { ParametersModule } from './parameters.module';
import { RunCodeReviewAutomationUseCase } from '@/ee/automation/runCodeReview.use-case';
import { CodebaseModule } from './codeBase.module';
import { UseCases as SaveCodeReviewFeedbackUseCase } from '@/core/application/use-cases/codeReviewFeedback';
import { CodeReviewFeedbackModule } from './codeReviewFeedback.module';
import { PullRequestsModule } from './pullRequests.module';
import { LicenseModule } from '@/ee/license/license.module';
import { CodeReviewExecutionModule } from './codeReviewExecution.module';
import { OrganizationParametersModule } from './organizationParameters.module';
import { PermissionValidationModule } from '@/ee/shared/permission-validation.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            AutomationModel,
            AutomationExecutionModel,
            OrganizationAutomationExecutionModel,
        ]),
        forwardRef(() => TeamsModule),
        forwardRef(() => JiraModule),
        forwardRef(() => GithubModule),
        forwardRef(() => TeamAutomationModule),
        forwardRef(() => OrganizationAutomationModule),
        forwardRef(() => AutomationStrategyModule),
        forwardRef(() => PlatformIntegrationModule),
        forwardRef(() => IntegrationModule),
        forwardRef(() => IntegrationConfigModule),
        forwardRef(() => OrganizationModule),
        forwardRef(() => AuthIntegrationModule),
        forwardRef(() => ParametersModule),
        forwardRef(() => CodeReviewFeedbackModule),
        forwardRef(() => CodebaseModule),
        forwardRef(() => PullRequestsModule),
        forwardRef(() => OrganizationParametersModule),
        AuthIntegrationModule,
        LicenseModule,
        forwardRef(() => CodeReviewExecutionModule),
        PermissionValidationModule,
    ],
    providers: [
        ...UseCases,
        ...OrganizationAutomationUseCases,
        ...SaveCodeReviewFeedbackUseCase,
        PromptService,
        {
            provide: AUTOMATION_REPOSITORY_TOKEN,
            useClass: AutomationRepository,
        },
        {
            provide: AUTOMATION_SERVICE_TOKEN,
            useClass: AutomationService,
        },
        {
            provide: AUTOMATION_EXECUTION_SERVICE_TOKEN,
            useClass: AutomationExecutionService,
        },
        {
            provide: AUTOMATION_EXECUTION_REPOSITORY_TOKEN,
            useClass: AutomationExecutionRepository,
        },
        {
            provide: ORGANIZATION_AUTOMATION_EXECUTION_SERVICE_TOKEN,
            useClass: OrganizationAutomationExecutionService,
        },
        {
            provide: ORGANIZATION_AUTOMATION_EXECUTION_REPOSITORY_TOKEN,
            useClass: OrganizationAutomationExecutionRepository,
        },
    ],
    controllers: [AutomationController],
    exports: [
        AUTOMATION_REPOSITORY_TOKEN,
        AUTOMATION_SERVICE_TOKEN,
        AUTOMATION_EXECUTION_SERVICE_TOKEN,
        AUTOMATION_EXECUTION_REPOSITORY_TOKEN,
        ORGANIZATION_AUTOMATION_EXECUTION_SERVICE_TOKEN,
        ORGANIZATION_AUTOMATION_EXECUTION_REPOSITORY_TOKEN,
        RunCodeReviewAutomationUseCase,
    ],
})
export class AutomationModule {}
