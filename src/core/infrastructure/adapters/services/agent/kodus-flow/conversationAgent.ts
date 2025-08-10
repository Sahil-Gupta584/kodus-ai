import { Injectable } from '@nestjs/common';
import {
    createDirectLLMAdapter,
    createMCPAdapter,
    createOrchestration,
    Thread,
    MCPServerConfig,
    PersistorType,
    MongoDBPersistorConfig,
    getObservability,
    createOtelTracerAdapter,
} from '@kodus/flow';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { MCPManagerService } from '../../../mcp/services/mcp-manager.service';
import { ConfigService } from '@nestjs/config';
import { DatabaseConnection } from '@/config/types';
import { ConnectionString } from 'connection-string';
import {
    LLMProviderService,
    LLMModelProvider,
    PromptRunnerService,
} from '@kodus/kodus-common/llm';

@Injectable()
export class ConversationAgentProvider {
    protected config: DatabaseConnection;

    private orchestration: ReturnType<typeof createOrchestration>;
    private mcpAdapter: ReturnType<typeof createMCPAdapter>;

    private llmAdapter: any;

    constructor(
        private readonly configService: ConfigService,
        private readonly llmProviderService: LLMProviderService,
        private readonly mcpManagerService?: MCPManagerService,
        private readonly promptRunnerService: PromptRunnerService,
    ) {
        this.config =
            this.configService.get<DatabaseConnection>('mongoDatabase');
        this.llmAdapter = this.createLLMAdapter();
    }

    private createLLMAdapter() {
        const base = this.llmProviderService.getLLMProvider({
            model: LLMModelProvider.GEMINI_2_5_PRO,
            temperature: 0,
            maxTokens: 8000,
            maxReasoningTokens: 129,
        });

        function sanitizeName(name: string) {
            const cleaned = name.replace(/[^\w.\-]/g, '_');
            return cleaned.slice(0, 64);
        }

        const wrappedLLM = {
            async call(messages: any[], options: any = {}) {
                const provider = LLMModelProvider.GEMINI_2_5_PRO;
                const fallbackProvider = LLMModelProvider.NOVITA_DEEPSEEK_V3;

                const analysis = await this.promptRunnerService
                    .builder()
                    .setProviders({
                        main: provider,
                        fallback: fallbackProvider,
                    })
                    .setParser(ParserType.STRING)
                    .setLLMJsonMode(true)
                    .setPayload(baseContext)
                    .addPrompt({
                        prompt: prompt_codereview_system_gemini,
                        role: PromptRole.SYSTEM,
                        scope: PromptScope.MAIN,
                    })
                    .addPrompt({
                        prompt: prompt_codereview_user_gemini,
                        role: PromptRole.USER,
                        scope: PromptScope.MAIN,
                    })
                    .addPrompt({
                        prompt: prompt_codereview_user_deepseek,
                        role: PromptRole.USER,
                        scope: PromptScope.FALLBACK,
                    })
                    .setTemperature(0)
                    .addCallbacks([this.tokenTracker])
                    .setRunName('analyzeCodeWithAI')
                    .execute();

                const analysisResult =
                    this.llmResponseProcessor.processResponse(
                        organizationAndTeamData,
                        prNumber,
                        analysis,
                    );

                if (!analysisResult) {
                    return null;
                }

                analysisResult.codeReviewModelUsed = {
                    generateSuggestions: provider,
                };

                return analysisResult;
            },
        };

        // const wrappedLLM = {
        //     async call(messages: any[], options: any = {}) {
        //         const lcMessages = messages.map((m) => ({
        //             type:
        //                 m.role === 'system'
        //                     ? 'system'
        //                     : m.role === 'user'
        //                       ? 'human'
        //                       : 'ai',
        //             content: m.content,
        //         }));

        //         let model = base;
        //         if (options.tools?.length) {
        //             const toolDefs = options.tools.map((t: any) => ({
        //                 type: 'function',
        //                 function: {
        //                     name: sanitizeName(t.name),
        //                     description: t.description ?? '',
        //                     parameters: {
        //                         ...t.parameters,
        //                         additionalProperties: false,
        //                     },
        //                 },
        //             }));

        //             const bindOpts: any = {};
        //             if (options.toolChoice) {
        //                 bindOpts.tool_choice = options.toolChoice;
        //             }

        //             model = (base as any).bindTools(toolDefs, bindOpts);
        //         }

        //         const resp = await model.invoke(lcMessages, {
        //             stop: options.stop,
        //             temperature: options.temperature,
        //             maxReasoningTokens: options.maxReasoningTokens,
        //         });

        //         console.log(resp.response_metadata);

        //         return {
        //             content: resp.content,
        //             usage: resp.usage ?? {
        //                 promptTokens: 0,
        //                 completionTokens: 0,
        //                 totalTokens: 0,
        //             },
        //             tool_calls: resp.tool_calls,
        //         };
        //     },
        // };

        return createDirectLLMAdapter(wrappedLLM);
    }

    private async createMCPAdapter(
        organizationAndTeamData: OrganizationAndTeamData,
    ) {
        const mcpManagerServers = await this.mcpManagerService.getConnections(
            organizationAndTeamData,
        );

        const defaultServers: MCPServerConfig[] = [
            {
                name: 'kodus-mcp-server',
                type: 'http' as const,
                url: process.env.API_KODUS_MCP_SERVER_URL,
                timeout: 10_000,
                retries: 1,
                headers: { contentType: 'application/json' },
                allowedTools: [],
            },
        ];

        const servers = [...defaultServers, ...mcpManagerServers];

        this.mcpAdapter = createMCPAdapter({
            servers,
            defaultTimeout: 10_000,
            maxRetries: 1,
            onError: (err) => {
                console.error('MCP error:', err.message);
            },
        });
    }

    private async createOrchestration() {
        let uri = new ConnectionString('', {
            user: this.config.username,
            password: this.config.password,
            protocol: this.config.port ? 'mongodb' : 'mongodb+srv',
            hosts: [{ name: this.config.host, port: this.config.port }],
        }).toString();

        console.log(
            'Creating orchestration with MongoDB URI:',
            uri,
            this.config,
        );

        const externalTracer = await createOtelTracerAdapter();

        this.orchestration = await createOrchestration({
            tenantId: 'kodus-agent-conversation',
            llmAdapter: this.llmAdapter,
            mcpAdapter: this.mcpAdapter,
            observability: {
                logging: { enabled: true, level: 'info' },
                telemetry: {
                    enabled: true,
                    serviceName: 'kodus-service',
                    sampling: { rate: 1, strategy: 'probabilistic' },
                    externalTracer,
                    privacy: { includeSensitiveData: false },
                    spanTimeouts: {
                        enabled: true,
                        maxDurationMs: 5 * 60 * 1000,
                    },
                },
                correlation: {
                    enabled: true,
                    generateIds: true,
                    propagateContext: true,
                },
            },
            // storage: {
            //     memory: {
            //         type: 'mongodb',
            //         connectionString: uri,
            //         database: this.config.database,
            //         collection: 'memories',
            //     },
            //     session: {
            //         type: 'mongodb',
            //         connectionString: uri,
            //         database: this.config.database,
            //         collection: 'sessions',
            //     },
            //     persistor: {
            //         type: 'mongodb',
            //         connectionString: uri,
            //         database: this.config.database,
            //         collection: 'snapshots',
            //     },
            // },
        });
    }

    // -------------------------------------------------------------------------
    private async initialize(organizationAndTeamData: OrganizationAndTeamData) {
        await this.createMCPAdapter(organizationAndTeamData);
        await this.createOrchestration();

        // 1️⃣ conecta MCP (opcional)
        try {
            await this.orchestration.connectMCP();
            await this.orchestration.registerMCPTools();
        } catch (error) {
            console.warn('MCP offline, prosseguindo.');
        }

        await this.orchestration.createAgent({
            name: 'kodus-conversational-agent',
            planner: 'plan-execute',
            identity: {
                description:
                    'Agente de conversação para interações com usuários.',
            },
        });
    }

    // -------------------------------------------------------------------------
    async execute(
        prompt: string,
        context?: {
            organizationAndTeamData: OrganizationAndTeamData;
            prepareContext?: any;
            thread?: Thread;
        },
    ) {
        const { organizationAndTeamData, prepareContext, thread } =
            context || {};

        if (!organizationAndTeamData) {
            throw new Error('Organization and team data is required.');
        }

        if (!thread) {
            throw new Error('thread and team data is required.');
        }

        await this.initialize(organizationAndTeamData);

        const result = await this.orchestration.callAgent(
            'kodus-conversational-agent',
            prompt,
            {
                thread: thread,
                userContext: {
                    organizationAndTeamData: organizationAndTeamData,
                    additional_information: prepareContext,
                },
            },
        );

        return typeof result.result === 'string'
            ? result.result
            : JSON.stringify(result.result);
    }
}
