import * as path from 'path';
import {
    CodeAnalysisAST,
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
import { CodeAnalyzerService } from './code-analyzer.service';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom, reduce, map } from 'rxjs';
import * as CircuitBreaker from 'opossum';
import { LLMProviderService } from '@/core/infrastructure/adapters/services/llmProviders/llmProvider.service';
import { LLM_PROVIDER_SERVICE_TOKEN } from '@/core/infrastructure/adapters/services/llmProviders/llmProvider.service.contract';
import { concatUint8Arrays } from '@/shared/utils/buffer/arrays';
import { DiffAnalyzerService } from './diffAnalyzer.service';
import {
    ASTDeserializer,
    SerializedGetGraphsResponseData,
} from '@kodus/kodus-proto/serialization/ast';
import {
    ASTAnalyzerServiceClient,
    AST_ANALYZER_SERVICE_NAME,
    RepositoryData,
    ProtoAuthMode,
    ProtoPlatformType,
} from '@kodus/kodus-proto/v2';
import {
    ChangeResult,
    FunctionsAffectResult,
    FunctionSimilarity,
} from '../codeBase/types/diff-analyzer.types';
import { AuthMode } from '@/core/domain/platformIntegrations/enums/codeManagement/authMode.enum';
import { PlatformType } from '@/shared/domain/enums/platform-type.enum';

@Injectable()
export class CodeAstAnalysisService
    implements IASTAnalysisService, OnModuleInit
{
    private readonly llmResponseProcessor: LLMResponseProcessor;
    private astMicroservice: ASTAnalyzerServiceClient;

    constructor(
        private readonly codeAnalyzerService: CodeAnalyzerService,
        private readonly diffAnalyzerService: DiffAnalyzerService,
        private readonly codeManagementService: CodeManagementService,
        private readonly logger: PinoLoggerService,

        @Inject('AST_MICROSERVICE')
        private readonly astMicroserviceClient: ClientGrpc,
        @Inject(LLM_PROVIDER_SERVICE_TOKEN)
        private readonly llmProviderService: LLMProviderService,
    ) {
        this.llmResponseProcessor = new LLMResponseProcessor(logger);
    }

    onModuleInit() {
        this.astMicroservice = this.astMicroserviceClient.getService(
            AST_ANALYZER_SERVICE_NAME,
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

    async cloneAndGenerate(
        repository: any,
        pullRequest: any,
        platformType: string,
        organizationAndTeamData: any,
    ): Promise<CodeAnalysisAST> {
        try {
            const { headRepo: headDirParams, baseRepo: baseDirParams } =
                await this.getRepoParams(
                    repository,
                    pullRequest,
                    organizationAndTeamData,
                    platformType,
                );

            let result: CodeAnalysisAST;
            const breaker = new CircuitBreaker(
                async () => {
                    const init = this.astMicroservice.initializeRepository({
                        baseRepo: baseDirParams,
                        headRepo: headDirParams,
                    });

                    await lastValueFrom(init);

                    const buildEnrichedGraphRes =
                        this.astMicroservice.getGraphs({
                            baseRepo: baseDirParams,
                            headRepo: headDirParams,
                        });

                    result = await lastValueFrom(
                        buildEnrichedGraphRes.pipe(
                            reduce((acc, chunk) => {
                                return {
                                    ...acc,
                                    data: concatUint8Arrays(
                                        acc.data,
                                        chunk.data,
                                    ),
                                };
                            }),
                            map((data) => {
                                const jsonData = new TextDecoder().decode(
                                    data.data,
                                );
                                return this.parseGraphResponse(jsonData);
                            }),
                        ),
                    );

                    const end = this.astMicroservice.deleteRepository({
                        baseRepo: baseDirParams,
                        headRepo: headDirParams,
                    });

                    await lastValueFrom(end);
                },
                {
                    timeout: 900000, // 15 minutes
                    errorThresholdPercentage: 50, // 50% of failures
                    resetTimeout: 30000, // 30 seconds
                },
            );
            await breaker.fire();

            return result;
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

    private parseGraphResponse(graph: string): CodeAnalysisAST | null {
        if (!graph) {
            return null;
        }

        const parsedGraph = JSON.parse(
            graph,
        ) as SerializedGetGraphsResponseData;
        if (!parsedGraph) {
            throw new Error('Error parsing graph data');
        }

        const deserialized =
            ASTDeserializer.deserializeGetGraphsResponseData(parsedGraph);

        return {
            baseCodeGraph: {
                codeGraphFunctions: deserialized.baseGraph.graph.functions,
                cloneDir: deserialized.baseGraph.dir,
            },
            headCodeGraph: {
                codeGraphFunctions: deserialized.headGraph.graph.functions,
                cloneDir: deserialized.headGraph.dir,
            },
            headCodeGraphEnriched: deserialized.enrichHeadGraph,
        };
    }

    private static readonly AuthModeMap: Record<AuthMode, ProtoAuthMode> = {
        [AuthMode.OAUTH]: ProtoAuthMode.PROTO_AUTH_MODE_OAUTH,
        [AuthMode.TOKEN]: ProtoAuthMode.PROTO_AUTH_MODE_TOKEN,
    };

    private static readonly PlatformTypeMap: Record<
        PlatformType,
        ProtoPlatformType
    > = {
        [PlatformType.GITHUB]: ProtoPlatformType.PROTO_PLATFORM_TYPE_GITHUB,
        [PlatformType.GITLAB]: ProtoPlatformType.PROTO_PLATFORM_TYPE_GITLAB,
        [PlatformType.BITBUCKET]:
            ProtoPlatformType.PROTO_PLATFORM_TYPE_BITBUCKET,
        [PlatformType.AZURE_REPOS]:
            ProtoPlatformType.PROTO_PLATFORM_TYPE_AZURE_REPOS,
        [PlatformType.AZURE_BOARDS]:
            ProtoPlatformType.PROTO_PLATFORM_TYPE_AZURE_BOARDS,
        [PlatformType.KODUS_WEB]:
            ProtoPlatformType.PROTO_PLATFORM_TYPE_KODUS_WEB,
        [PlatformType.JIRA]: ProtoPlatformType.PROTO_PLATFORM_TYPE_JIRA,
        [PlatformType.SLACK]: ProtoPlatformType.PROTO_PLATFORM_TYPE_SLACK,
        [PlatformType.NOTION]: ProtoPlatformType.PROTO_PLATFORM_TYPE_NOTION,
        [PlatformType.MSTEAMS]: ProtoPlatformType.PROTO_PLATFORM_TYPE_MSTEAMS,
        [PlatformType.DISCORD]: ProtoPlatformType.PROTO_PLATFORM_TYPE_DISCORD,
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

    async analyzeCodeWithGraph(
        codeChunk: string,
        fileName: string,
        organizationAndTeamData: OrganizationAndTeamData,
        pullRequest: any,
        codeAnalysisAST: CodeAnalysisAST,
    ): Promise<ChangeResult> {
        try {
            const processedChunk =
                this.codeAnalyzerService.preprocessCustomDiff(codeChunk);

            const prFilePath = path.join(
                codeAnalysisAST?.headCodeGraph?.cloneDir,
                fileName,
            );
            const baseFilePath = path.join(
                codeAnalysisAST?.baseCodeGraph?.cloneDir,
                fileName,
            );

            const functionsAffected: ChangeResult =
                await this.diffAnalyzerService.analyzeDiff(
                    {
                        diff: processedChunk,
                        headCodeGraphFunctions:
                            codeAnalysisAST?.headCodeGraph?.codeGraphFunctions,
                        prFilePath,
                    },
                    {
                        baseCodeGraphFunctions:
                            codeAnalysisAST?.baseCodeGraph?.codeGraphFunctions,
                        baseFilePath,
                    },
                );

            return functionsAffected;
        } catch (error) {
            this.logger.error({
                message: `Error during AST analyze CodeWith Graph for PR#${pullRequest.number}`,
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

    async generateImpactAnalysis(
        codeAnalysis: CodeAnalysisAST,
        functionsAffected: ChangeResult,
        pullRequest: any,
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<{
        functionsAffectResult: FunctionsAffectResult[];
        functionSimilarity: FunctionSimilarity[];
    }> {
        try {
            const impactedNodes =
                await this.codeAnalyzerService.computeImpactAnalysis(
                    codeAnalysis?.headCodeGraphEnriched,
                    [functionsAffected],
                    1,
                    'backward',
                );

            const functionSimilarity: FunctionSimilarity[] =
                await this.codeAnalyzerService.checkFunctionSimilarity(
                    {
                        organizationAndTeamData,
                        pullRequest,
                    },
                    functionsAffected.added,
                    Object.values(
                        codeAnalysis.headCodeGraph.codeGraphFunctions,
                    ),
                );

            const functionsAffectResult: FunctionsAffectResult[] =
                this.codeAnalyzerService.buildFunctionsAffect(
                    impactedNodes,
                    codeAnalysis.baseCodeGraph.codeGraphFunctions,
                    codeAnalysis.headCodeGraph.codeGraphFunctions,
                );

            return {
                functionSimilarity,
                functionsAffectResult,
            };
        } catch (error) {
            this.logger.error({
                message: `Error during AST generate Impact Analysis for PR#${pullRequest.number}`,
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
            impactASTAnalysis: context?.impactASTAnalysis?.functionsAffectResult
                ? Object.values(
                      context?.impactASTAnalysis?.functionsAffectResult,
                  )
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
}
