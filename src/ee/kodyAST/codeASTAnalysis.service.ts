import {
    Repository,
    ReviewModeResponse,
    AnalysisContext,
    AIAnalysisResult,
    CodeSuggestion,
} from '@/config/types/general/codeReview.type';
import { IASTAnalysisService } from '@/core/domain/codeBase/contracts/ASTAnalysisService.contract';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { LLMModelProvider } from '@/core/infrastructure/adapters/services/llmProviders/llmModelProvider.helper';
import { prompt_detectBreakingChanges } from '@/shared/utils/langchainCommon/prompts/detectBreakingChanges';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { SeverityLevel } from '@/shared/utils/enums/severityLevel.enum';
import { LLMResponseProcessor } from '@/core/infrastructure/adapters/services/codeBase/utils/transforms/llmResponseProcessor.transform';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom, reduce, map } from 'rxjs';
import { LLMProviderService } from '@/core/infrastructure/adapters/services/llmProviders/llmProvider.service';
import { LLM_PROVIDER_SERVICE_TOKEN } from '@/core/infrastructure/adapters/services/llmProviders/llmProvider.service.contract';
import { concatUint8Arrays } from '@/shared/utils/buffer/arrays';
import {
    ASTAnalyzerServiceClient,
    AST_ANALYZER_SERVICE_NAME,
    GetImpactAnalysisResponse,
    InitializeImpactAnalysisResponse,
    InitializeRepositoryResponse,
} from '@kodus/kodus-proto/ast';
import {
    RepositoryData,
    ProtoAuthMode,
    ProtoPlatformType,
} from '@kodus/kodus-proto/ast/v2';
import { AuthMode } from '@/core/domain/platformIntegrations/enums/codeManagement/authMode.enum';
import { PlatformType } from '@/shared/domain/enums/platform-type.enum';
import {
    TASK_MANAGER_SERVICE_NAME,
    TaskManagerServiceClient,
    TaskStatus,
} from '@kodus/kodus-proto/task';
import { TASK_MICROSERVICE_OPTIONS } from '../configs/microservices/task-options';

@Injectable()
export class CodeAstAnalysisService
    implements IASTAnalysisService, OnModuleInit
{
    private readonly llmResponseProcessor: LLMResponseProcessor;
    private astMicroservice: ASTAnalyzerServiceClient;
    private taskMicroservice: TaskManagerServiceClient;

    constructor(
        private readonly codeManagementService: CodeManagementService,
        private readonly logger: PinoLoggerService,

        @Inject('AST_MICROSERVICE')
        private readonly astMicroserviceClient: ClientGrpc,

        @Inject('TASK_MICROSERVICE')
        private readonly taskMicroserviceClient: ClientGrpc,

        @Inject(LLM_PROVIDER_SERVICE_TOKEN)
        private readonly llmProviderService: LLMProviderService,
    ) {
        this.llmResponseProcessor = new LLMResponseProcessor(logger);
    }

    onModuleInit() {
        this.astMicroservice = this.astMicroserviceClient.getService(
            AST_ANALYZER_SERVICE_NAME,
        );
        this.taskMicroservice = this.taskMicroserviceClient.getService(
            TASK_MANAGER_SERVICE_NAME,
        );
    }

    async analyzeASTWithAI(
        context: AnalysisContext,
        reviewModeResponse: ReviewModeResponse,
    ): Promise<AIAnalysisResult> {
        try {
            const provider = LLMModelProvider.NOVITA_DEEPSEEK_V3_0324;

            const baseContext = await this.prepareAnalysisContext(context);

            const chain = await this.createAnalysisChainWithFallback(
                provider,
                context,
            );

            // Execute analysis
            const result = await chain.invoke(baseContext);

            // Process result and tokens
            const analysisResult = this.llmResponseProcessor.processResponse(
                context.organizationAndTeamData,
                context.pullRequest.number,
                result,
            );

            analysisResult.codeReviewModelUsed = {
                generateSuggestions: provider,
            };

            return {
                ...analysisResult,
                codeSuggestions: analysisResult?.codeSuggestions?.map(
                    (codeSuggestion: CodeSuggestion) => ({
                        ...codeSuggestion,
                        severity: SeverityLevel.CRITICAL,
                        label: 'breaking_changes',
                    }),
                ),
            };
        } catch (error) {
            this.logger.error({
                message: `Error during AST code analysis for PR#${context.pullRequest.number}`,
                context: CodeAstAnalysisService.name,
                metadata: {
                    organizationAndTeamData: context?.organizationAndTeamData,
                    prNumber: context?.pullRequest?.number,
                },
                error,
            });
            throw error;
        }
    }

    async initializeASTAnalysis(
        repository: any,
        pullRequest: any,
        platformType: string,
        organizationAndTeamData: any,
        filePaths: string[] = [],
    ): Promise<InitializeRepositoryResponse> {
        try {
            const { headRepo: headDirParams, baseRepo: baseDirParams } =
                await this.getRepoParams(
                    repository,
                    pullRequest,
                    organizationAndTeamData,
                    platformType,
                );

            const init = this.astMicroservice.initializeRepository({
                baseRepo: baseDirParams,
                headRepo: headDirParams,
                filePaths,
            });

            const task = await lastValueFrom(init);

            return task;
        } catch (error) {
            this.logger.error({
                message: `Error during AST Clone and Generate graph for PR#${pullRequest.number}`,
                context: CodeAstAnalysisService.name,
                metadata: {
                    organizationAndTeamData: organizationAndTeamData,
                    prNumber: pullRequest?.number,
                },
                error,
            });
            return null;
        }
    }

    private static readonly AuthModeMap: Record<AuthMode, ProtoAuthMode> = {
        [AuthMode.OAUTH]: ProtoAuthMode.PROTO_AUTH_MODE_OAUTH,
        [AuthMode.TOKEN]: ProtoAuthMode.PROTO_AUTH_MODE_TOKEN,
    };

    private static readonly PlatformTypeMap: Partial<
        Record<PlatformType, ProtoPlatformType>
    > = {
        [PlatformType.GITHUB]: ProtoPlatformType.PROTO_PLATFORM_TYPE_GITHUB,
        [PlatformType.GITLAB]: ProtoPlatformType.PROTO_PLATFORM_TYPE_GITLAB,
        [PlatformType.BITBUCKET]:
            ProtoPlatformType.PROTO_PLATFORM_TYPE_BITBUCKET,
        [PlatformType.AZURE_REPOS]:
            ProtoPlatformType.PROTO_PLATFORM_TYPE_AZURE_REPOS,
    };

    private async getCloneParams(
        repository: Repository,
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<RepositoryData> {
        const params = await this.codeManagementService.getCloneParams({
            repository,
            organizationAndTeamData,
        });
        return {
            ...params,
            auth: {
                ...params.auth,
                type: CodeAstAnalysisService.AuthModeMap[params.auth.type],
            },
            provider: CodeAstAnalysisService.PlatformTypeMap[params.provider],
        };
    }

    async initializeImpactAnalysis(
        repository: any,
        pullRequest: any,
        platformType: string,
        organizationAndTeamData: OrganizationAndTeamData,
        codeChunk: string,
        fileName: string,
    ): Promise<InitializeImpactAnalysisResponse> {
        try {
            const { headRepo, baseRepo } = await this.getRepoParams(
                repository,
                pullRequest,
                organizationAndTeamData,
                platformType,
            );

            if (!headRepo) {
                throw new Error('Head repository parameters are missing');
            }

            const init = this.astMicroservice.initializeImpactAnalysis({
                baseRepo: baseRepo,
                headRepo: headRepo,
                codeChunk,
                fileName,
            });

            const task = await lastValueFrom(init);

            return task;
        } catch (error) {
            this.logger.error({
                message: `Error during AST Impact Analysis initialization for PR#${pullRequest.number}`,
                context: CodeAstAnalysisService.name,
                metadata: {
                    organizationAndTeamData: organizationAndTeamData,
                    prNumber: pullRequest?.number,
                },
                error,
            });
            throw error;
        }
    }

    async getImpactAnalysis(
        repository: any,
        pullRequest: any,
        platformType: string,
        organizationAndTeamData: any,
    ) {
        try {
            const { headRepo, baseRepo } = await this.getRepoParams(
                repository,
                pullRequest,
                organizationAndTeamData,
                platformType,
            );

            if (!headRepo) {
                throw new Error('Head repository parameters are missing');
            }

            return await this.collectImpactAnalysis(baseRepo, headRepo);
        } catch (error) {
            this.logger.error({
                message: `Error during AST Impact Analysis for PR#${pullRequest.number}`,
                context: CodeAstAnalysisService.name,
                metadata: {
                    organizationAndTeamData: organizationAndTeamData,
                    prNumber: pullRequest?.number,
                },
                error,
            });
            throw error;
        }
    }

    private collectImpactAnalysis(
        baseDirParams: RepositoryData,
        headDirParams: RepositoryData,
    ) {
        return new Promise<GetImpactAnalysisResponse>((resolve, reject) => {
            const functionsAffect = [];
            const functionSimilarity = [];

            this.astMicroservice
                .getImpactAnalysis({
                    baseRepo: baseDirParams,
                    headRepo: headDirParams,
                })
                .subscribe({
                    next: (batch) => {
                        if (batch.functionsAffect) {
                            functionsAffect.push(...batch.functionsAffect);
                        }
                        if (batch.functionSimilarity) {
                            functionSimilarity.push(
                                ...batch.functionSimilarity,
                            );
                        }
                    },
                    error: reject,
                    complete: () => {
                        resolve({
                            functionsAffect,
                            functionSimilarity,
                        });
                    },
                });
        });
    }

    private async createAnalysisChainWithFallback(
        provider: LLMModelProvider,
        context: AnalysisContext,
    ) {
        const fallbackProvider = LLMModelProvider.OPENAI_GPT_4O;

        try {
            const mainChain = await this.createAnalysisProviderChain(provider);
            const fallbackChain =
                await this.createAnalysisProviderChain(fallbackProvider);

            // Usar withFallbacks para configurar o fallback corretamente
            return mainChain
                .withFallbacks({
                    fallbacks: [fallbackChain],
                })
                .withConfig({
                    runName: 'CodeASTAnalysisAI',
                    metadata: {
                        organizationId:
                            context?.organizationAndTeamData?.organizationId,
                        teamId: context?.organizationAndTeamData?.teamId,
                        pullRequestId: context?.pullRequest?.number,
                    },
                });
        } catch (error) {
            this.logger.error({
                message: 'Error creating analysis chain with fallback',
                error,
                context: CodeAstAnalysisService.name,
                metadata: {
                    provider,
                    fallbackProvider,
                },
            });
            throw error;
        }
    }

    private async createAnalysisProviderChain(provider: LLMModelProvider) {
        try {
            let llm = this.llmProviderService.getLLMProvider({
                model: provider,
                temperature: 0,
                jsonMode: true,
            });

            const chain = RunnableSequence.from([
                async (input: any) => {
                    return [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: prompt_detectBreakingChanges(input),
                                },
                            ],
                        },
                    ];
                },
                llm,
                new StringOutputParser(),
            ]);

            return chain;
        } catch (error) {
            this.logger.error({
                message: 'Error creating analysis code chain',
                error,
                context: CodeAstAnalysisService.name,
                metadata: { provider },
            });
            throw error;
        }
    }

    private async prepareAnalysisContext(context: AnalysisContext) {
        const baseContext = {
            language: context?.repository?.language,
            languageResultPrompt:
                context?.codeReviewConfig?.languageResultPrompt,
            impactASTAnalysis: context?.impactASTAnalysis?.functionsAffect
                ? Object.values(context?.impactASTAnalysis?.functionsAffect)
                : [],
        };

        return baseContext;
    }

    async getRelatedContentFromDiff(
        repository: any,
        pullRequest: any,
        platformType: string,
        organizationAndTeamData: OrganizationAndTeamData,
        diff: string,
        filePath: string,
    ): Promise<string> {
        const { headRepo, baseRepo } = await this.getRepoParams(
            repository,
            pullRequest,
            organizationAndTeamData,
            platformType,
        );

        const call = this.astMicroservice.getContentFromDiff({
            baseRepo,
            headRepo,
            diff,
            filePath,
        });

        const relatedContent = await lastValueFrom(
            call.pipe(
                reduce((acc, chunk) => {
                    return {
                        ...acc,
                        data: concatUint8Arrays(acc.data, chunk.data),
                    };
                }),
                map((data) => {
                    const str = new TextDecoder().decode(data.data);
                    return str;
                }),
            ),
        );

        return relatedContent;
    }

    private async getRepoParams(
        repository: any,
        pullRequest: any,
        organizationAndTeamData: OrganizationAndTeamData,
        platformType: string,
    ): Promise<{
        headRepo: RepositoryData | null;
        baseRepo: RepositoryData | null;
    } | null> {
        const headDirParams = await this.getCloneParams(
            {
                id: repository.id,
                name: repository.name,
                defaultBranch: pullRequest.head.ref,
                fullName:
                    repository.full_name ||
                    `${repository.owner}/${repository.name}`,
                platform: platformType as
                    | 'github'
                    | 'gitlab'
                    | 'bitbucket'
                    | 'azure-devops',
                language: repository.language || 'unknown',
            },
            organizationAndTeamData,
        );

        if (!headDirParams) {
            return null;
        }

        const baseDirParams = await this.getCloneParams(
            {
                id: repository.id,
                name: repository.name,
                defaultBranch: pullRequest.base.ref,
                fullName:
                    repository.full_name ||
                    `${repository.owner}/${repository.name}`,
                platform: platformType as
                    | 'github'
                    | 'gitlab'
                    | 'bitbucket'
                    | 'azure-devops',
                language: repository.language || 'unknown',
            },
            organizationAndTeamData,
        );

        if (!baseDirParams) {
            return {
                headRepo: headDirParams,
                baseRepo: null,
            };
        }

        return {
            headRepo: headDirParams,
            baseRepo: baseDirParams,
        };
    }

    async awaitTask(
        taskId: string,
        options: {
            timeout?: number;
            interval?: number;
            maxRetries?: number;
        } = {
            timeout: 60000, // Default timeout of 60 seconds
            interval: 5000, // Check every 5 seconds
            maxRetries: 12, // Maximum of 12 retries (60 seconds / 5 seconds)
        },
    ) {
        const { timeout, interval, maxRetries } = options;

        let retries = 0;
        const startTime = Date.now();

        while (true) {
            if (Date.now() - startTime > timeout) {
                throw new Error(`Task ${taskId} timed out after ${timeout}ms`);
            }

            const taskStatus = await lastValueFrom(
                this.taskMicroservice.getTaskInfo({ taskId }),
            );

            if (taskStatus.task.status === TaskStatus.TASK_STATUS_COMPLETED) {
                return taskStatus;
            }

            if (
                taskStatus.task.status === TaskStatus.TASK_STATUS_FAILED ||
                taskStatus.task.status === TaskStatus.TASK_STATUS_CANCELLED
            ) {
                throw new Error(
                    `Task ${taskId} failed with status: ${taskStatus.task.status}`,
                );
            }

            if (retries >= maxRetries) {
                throw new Error(
                    `Task ${taskId} did not complete within the maximum retries`,
                );
            }

            retries++;
            await new Promise((resolve) => setTimeout(resolve, interval));
        }
    }
}
