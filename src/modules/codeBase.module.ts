import { forwardRef, Module } from '@nestjs/common';
import { IntegrationModule } from './integration.module';
import { IntegrationConfigModule } from './integrationConfig.module';
import { COMMENT_MANAGER_SERVICE_TOKEN } from '@/core/domain/codeBase/contracts/CommentManagerService.contract';
import { CommentManagerService } from '@/core/infrastructure/adapters/services/codeBase/commentManager.service';
import { ParametersModule } from './parameters.module';
import { PlatformIntegrationModule } from './platformIntegration.module';
import { PULL_REQUEST_MANAGER_SERVICE_TOKEN } from '@/core/domain/codeBase/contracts/PullRequestManagerService.contract';
import { PullRequestHandlerService } from '@/core/infrastructure/adapters/services/codeBase/pullRequestManager.service';
import { AutomationStrategyModule } from './automationStrategy.module';
import { AutomationModule } from './automation.module';
import { CODE_BASE_CONFIG_SERVICE_TOKEN } from '@/core/domain/codeBase/contracts/CodeBaseConfigService.contract';
import {
    LLM_ANALYSIS_SERVICE_TOKEN,
    LLMAnalysisService,
} from '@/core/infrastructure/adapters/services/codeBase/llmAnalysis.service';
import { TeamsModule } from './team.module';
import { CodeReviewHandlerService } from '@/core/infrastructure/adapters/services/codeBase/codeReviewHandlerService.service';
import { KodyRulesModule } from './kodyRules.module';
import { PullRequestsModule } from './pullRequests.module';
import { SUGGESTION_SERVICE_TOKEN } from '@/core/domain/codeBase/contracts/SuggestionService.contract';
import { SuggestionEmbeddedModule } from './suggestionEmbedded.module';
import { OrganizationParametersModule } from './organizationParameters.module';
import { CommentAnalysisService } from '@/core/infrastructure/adapters/services/codeBase/commentAnalysis.service';
import { CodeReviewFeedbackModule } from './codeReviewFeedback.module';

import { SuggestionService } from '@/core/infrastructure/adapters/services/codeBase/suggestion.service';
import { PromptService } from '@/core/infrastructure/adapters/services/prompt.service';
import { CodeReviewPipelineModule } from './codeReviewPipeline.module';
import { FileReviewModule } from '@/ee/codeReview/fileReviewContextPreparation/fileReview.module';
import { PipelineModule } from './pipeline.module';
import { KodyASTAnalyzeContextModule } from '@/ee/kodyASTAnalyze/kodyAstAnalyzeContext.module';
import CodeBaseConfigService from '@/ee/codeBase/codeBaseConfig.service';
import { CodeAnalysisOrchestrator } from '@/ee/codeBase/codeAnalysisOrchestrator.service';
import {
    KODY_RULES_ANALYSIS_SERVICE_TOKEN,
    KodyRulesAnalysisService,
} from '@/ee/codeBase/kodyRulesAnalysis.service';
import { GlobalParametersModule } from './global-parameters.module';
import { CodeBaseController } from '@/core/infrastructure/http/controllers/codeBase.controller';
import { ModelTestController } from '@/core/infrastructure/http/controllers/model-test.controller';
import {
    KODY_RULES_PR_LEVEL_ANALYSIS_SERVICE_TOKEN,
    KodyRulesPrLevelAnalysisService,
} from '@/ee/codeBase/kodyRulesPrLevelAnalysis.service';
import {
    CROSS_FILE_ANALYSIS_SERVICE_TOKEN,
    CrossFileAnalysisService,
} from '@/core/infrastructure/adapters/services/codeBase/crossFileAnalysis.service';
import { TokenChunkingModule } from './tokenChunking.module';
import { MessageTemplateProcessor } from '@/core/infrastructure/adapters/services/codeBase/utils/services/messageTemplateProcessor.service';
import { KodyFineTuningService } from '@/core/infrastructure/adapters/services/kodyFineTuning/kodyFineTuning.service';
import { LicenseModule } from '@/ee/license/license.module';
import { LicenseService } from '@/ee/license/license.service';
import { PermissionValidationModule } from '@/ee/shared/permission-validation.module';
import { KodyFineTuningContextModule } from './kodyFineTuningContext.module';

@Module({
    imports: [
        forwardRef(() => IntegrationModule),
        forwardRef(() => IntegrationConfigModule),
        forwardRef(() => ParametersModule),
        forwardRef(() => PlatformIntegrationModule),
        forwardRef(() => AutomationStrategyModule),
        forwardRef(() => AutomationModule),
        forwardRef(() => TeamsModule),
        forwardRef(() => KodyRulesModule),
        forwardRef(() => PullRequestsModule),
        forwardRef(() => SuggestionEmbeddedModule),
        forwardRef(() => OrganizationParametersModule),
        forwardRef(() => CodeReviewFeedbackModule),
        forwardRef(() => FileReviewModule),
        forwardRef(() => CodeReviewPipelineModule),
        forwardRef(() => PipelineModule),
        forwardRef(() => KodyFineTuningContextModule),
        forwardRef(() => KodyASTAnalyzeContextModule),
        forwardRef(() => GlobalParametersModule),
        forwardRef(() => TokenChunkingModule),
        forwardRef(() => LicenseModule),
        PermissionValidationModule,
    ],
    providers: [
        {
            provide: LLM_ANALYSIS_SERVICE_TOKEN,
            useClass: LLMAnalysisService,
        },
        {
            provide: CODE_BASE_CONFIG_SERVICE_TOKEN,
            useClass: CodeBaseConfigService,
        },
        {
            provide: PULL_REQUEST_MANAGER_SERVICE_TOKEN,
            useClass: PullRequestHandlerService,
        },
        {
            provide: COMMENT_MANAGER_SERVICE_TOKEN,
            useClass: CommentManagerService,
        },
        {
            provide: KODY_RULES_ANALYSIS_SERVICE_TOKEN,
            useClass: KodyRulesAnalysisService,
        },
        {
            provide: KODY_RULES_PR_LEVEL_ANALYSIS_SERVICE_TOKEN,
            useClass: KodyRulesPrLevelAnalysisService,
        },
        {
            provide: CROSS_FILE_ANALYSIS_SERVICE_TOKEN,
            useClass: CrossFileAnalysisService,
        },
        {
            provide: SUGGESTION_SERVICE_TOKEN,
            useClass: SuggestionService,
        },
        PromptService,
        CodeAnalysisOrchestrator,
        CodeReviewHandlerService,
        KodyFineTuningService,
        CommentAnalysisService,
        MessageTemplateProcessor,
        LicenseService,
    ],
    exports: [
        PULL_REQUEST_MANAGER_SERVICE_TOKEN,
        LLM_ANALYSIS_SERVICE_TOKEN,
        COMMENT_MANAGER_SERVICE_TOKEN,
        CODE_BASE_CONFIG_SERVICE_TOKEN,
        KODY_RULES_ANALYSIS_SERVICE_TOKEN,
        KODY_RULES_PR_LEVEL_ANALYSIS_SERVICE_TOKEN,
        CROSS_FILE_ANALYSIS_SERVICE_TOKEN,
        SUGGESTION_SERVICE_TOKEN,
        PromptService,
        CodeAnalysisOrchestrator,
        KodyFineTuningService,
        CodeReviewHandlerService,
        CommentAnalysisService,
        MessageTemplateProcessor,
    ],
    controllers: [CodeBaseController, ModelTestController],
})
export class CodebaseModule {}
