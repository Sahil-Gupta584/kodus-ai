import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { GithubModule } from './github.module';
import { BitbucketModule } from './bitbucket.module';
import { ICodeManagementService } from '@/core/domain/platformIntegrations/interfaces/code-management.interface';
import { PlatformIntegrationFactory } from '@/core/infrastructure/adapters/services/platformIntegration/platformIntegration.factory';
import { IntegrationModule } from './integration.module';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { ProjectManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/projectManagement.service';
import { IntegrationConfigModule } from './integrationConfig.module';
import { AuthIntegrationModule } from './authIntegration.module';
import { CodeManagementController } from '@/core/infrastructure/http/controllers/platformIntegration/codeManagement.controller';
import { UseCases } from '@/core/application/use-cases/platformIntegration';
import { MSTeamsService } from '@/core/infrastructure/adapters/services/msTeams.service';
import { GitlabService } from '@/core/infrastructure/adapters/services/gitlab.service';
import { TeamMembersModule } from './teamMembers.module';
import { TeamsModule } from './team.module';
import { ProfileConfigModule } from './profileConfig.module';
import { PromptService } from '@/core/infrastructure/adapters/services/prompt.service';
import { ParametersModule } from './parameters.module';
import { GitlabModule } from './gitlab.module';
import { AgentModule } from './agent.module';
import { AutomationModule } from './automation.module';
import { ReceiveWebhookUseCase } from '@/core/application/use-cases/platformIntegration/codeManagement/receiveWebhook.use-case';
import { TeamAutomationModule } from './teamAutomation.module';
import { FinishProjectConfigUseCase } from '@/core/application/use-cases/platformIntegration/projectManagement/finish-project-config.use-case';
import { OrganizationParametersModule } from './organizationParameters.module';
import { CodeReviewFeedbackModule } from './codeReviewFeedback.module';
import { PullRequestsModule } from './pullRequests.module';
import { CodebaseModule } from './codeBase.module';
import { KodyRulesModule } from './kodyRules.module';
import { AzureReposModule } from './azureRepos.module';
import { GitHubPullRequestHandler } from '@/core/infrastructure/adapters/webhooks/github/githubPullRequest.handler';
import { GitLabMergeRequestHandler } from '@/core/infrastructure/adapters/webhooks/gitlab/gitlabPullRequest.handler';
import { BitbucketPullRequestHandler } from '@/core/infrastructure/adapters/webhooks/bitbucket/bitbucketPullRequest.handler';
import { AzureReposPullRequestHandler } from '@/core/infrastructure/adapters/webhooks/azureRepos/azureReposPullRequest.handler';
import { IssuesModule } from './issues.module';
import { CodeReviewSettingsLogModule } from './codeReviewSettingsLog.module';
import { McpAgentModule } from './mcpAgent.module';
import { GetAdditionalInfoHelper } from '@/shared/utils/helpers/getAdditionalInfo.helper';
import { PullRequestMessagesModule } from './pullRequestMessages.module';
@Module({
    imports: [
        forwardRef(() => IntegrationModule),
        forwardRef(() => IntegrationConfigModule),
        forwardRef(() => AuthIntegrationModule),
        forwardRef(() => GithubModule),
        forwardRef(() => GitlabModule),
        forwardRef(() => TeamMembersModule),
        forwardRef(() => TeamsModule),
        forwardRef(() => ProfileConfigModule),
        forwardRef(() => AgentModule),
        forwardRef(() => AutomationModule),
        forwardRef(() => TeamAutomationModule),
        forwardRef(() => ParametersModule),
        forwardRef(() => OrganizationParametersModule),
        forwardRef(() => CodeReviewFeedbackModule),
        forwardRef(() => CodebaseModule),
        forwardRef(() => KodyRulesModule),
        forwardRef(() => AzureReposModule),
        forwardRef(() => BitbucketModule),
        forwardRef(() => IssuesModule),
        forwardRef(() => CodeReviewSettingsLogModule),
        forwardRef(() => PullRequestMessagesModule),
        PullRequestsModule,
        McpAgentModule,
    ],
    providers: [
        ...UseCases,
        PromptService,
        PlatformIntegrationFactory,
        CodeManagementService,
        ProjectManagementService,
        // CommunicationService,

        //Integrations tools
        MSTeamsService,
        GitlabService,

        // Webhook handlers
        GitHubPullRequestHandler,
        {
            provide: 'GITHUB_WEBHOOK_HANDLER',
            useExisting: GitHubPullRequestHandler,
        },
        GitLabMergeRequestHandler,
        {
            provide: 'GITLAB_WEBHOOK_HANDLER',
            useExisting: GitLabMergeRequestHandler,
        },
        BitbucketPullRequestHandler,
        {
            provide: 'BITBUCKET_WEBHOOK_HANDLER',
            useExisting: BitbucketPullRequestHandler,
        },
        AzureReposPullRequestHandler,
        {
            provide: 'AZURE_REPOS_WEBHOOK_HANDLER',
            useExisting: AzureReposPullRequestHandler,
        },
        GetAdditionalInfoHelper,
    ],
    controllers: [CodeManagementController],
    exports: [
        PlatformIntegrationFactory,
        CodeManagementService,
        ProjectManagementService,
        // CommunicationService,
        ReceiveWebhookUseCase,
        FinishProjectConfigUseCase,
    ],
})
export class PlatformIntegrationModule implements OnModuleInit {
    constructor(
        private modulesContainer: ModulesContainer,
        private integrationFactory: PlatformIntegrationFactory,
    ) {}

    onModuleInit() {
        const providers = [...this.modulesContainer.values()]
            .map((module) => module.providers)
            .reduce((acc, map) => [...acc, ...map.values()], [])
            .filter((provider) => provider.instance);

        providers.forEach((provider) => {
            const { instance } = provider;
            const integrationMetadata = Reflect.getMetadata(
                'integration',
                instance.constructor,
            );

            if (integrationMetadata) {
                const { type, serviceType } = integrationMetadata;
                if (serviceType === 'codeManagement') {
                    this.integrationFactory.registerCodeManagementService(
                        type,
                        instance as ICodeManagementService,
                    );
                }
                // else if (serviceType === 'projectManagement') {
                //     this.integrationFactory.registerProjectManagementService(
                //         type,
                //         instance as IProjectManagementService,
                //     );
                // } else if (serviceType === 'communication') {
                //     this.integrationFactory.registerCommunicationService(
                //         type,
                //         instance as ICommunicationService,
                //     );
                // }
            }
        });
    }
}
