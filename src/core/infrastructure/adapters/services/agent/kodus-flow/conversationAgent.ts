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
    DirectLLMAdapter,
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
import { startKodusOtel } from '@/config/log/otel-kodus-flow';

@Injectable()
export class ConversationAgentProvider {
    protected config: DatabaseConnection;

    private orchestration: ReturnType<typeof createOrchestration>;
    private mcpAdapter: ReturnType<typeof createMCPAdapter>;

    private llmAdapter: DirectLLMAdapter;

    constructor(
        private readonly configService: ConfigService,
        private readonly llmProviderService: LLMProviderService,
        private readonly mcpManagerService?: MCPManagerService,
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
            maxReasoningTokens: 800,
            jsonMode: true,
        });

        function sanitizeName(name: string) {
            const cleaned = name.replace(/[^\w.\-]/g, '_');
            return cleaned.slice(0, 64);
        }

        const wrappedLLM = {
            async call(messages: any[], options: any = {}) {
                const lcMessages = messages.map((m) => ({
                    type:
                        m.role === 'system'
                            ? 'system'
                            : m.role === 'user'
                              ? 'human'
                              : 'ai',
                    content: m.content,
                }));

                let model = base;
                if (options.tools?.length) {
                    const toolDefs = options.tools.map((t: any) => ({
                        type: 'function',
                        function: {
                            name: sanitizeName(t.name),
                            description: t.description ?? '',
                            parameters: {
                                ...t.parameters,
                                additionalProperties: false,
                            },
                        },
                    }));

                    const bindOpts: any = {};
                    if (options.toolChoice) {
                        bindOpts.tool_choice = options.toolChoice;
                    }

                    model = (base as any).bindTools(toolDefs, bindOpts);
                }

                const resp = await model.invoke(lcMessages, {
                    stop: options.stop,
                    temperature: options.temperature,
                    maxReasoningTokens: options.maxReasoningTokens,
                });

                console.log('LLM response:', JSON.stringify(resp, null, 2));

                return {
                    content: resp.content,
                    usage: resp.usage_metadata ?? {
                        promptTokens: 0,
                        completionTokens: 0,
                        totalTokens: 0,
                    },
                    tool_calls: resp.tool_calls,
                };
            },
        };

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

        await startKodusOtel();
        const externalTracer = await createOtelTracerAdapter();

        this.orchestration = createOrchestration({
            tenantId: 'kodus-agent-conversation',
            llmAdapter: this.llmAdapter,
            mcpAdapter: this.mcpAdapter,
            observability: {
                logging: { enabled: true, level: 'info' },
                telemetry: {
                    enabled: true,
                    serviceName: 'kodus-flow',
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
                mongodb: {
                    type: 'mongodb',
                    connectionString: uri,
                    database: this.config.database,
                    collections: {
                        logs: 'observability_logs',
                        telemetry: 'observability_telemetry',
                        metrics: 'observability_metrics',
                        errors: 'observability_errors',
                    },
                    batchSize: 100,
                    flushIntervalMs: 5000,
                    ttlDays: 30,
                    enableObservability: true,
                },
            },
            storage: {
                memory: {
                    type: 'mongodb',
                    connectionString: uri,
                    database: this.config.database,
                    collection: 'memories',
                },
                session: {
                    type: 'mongodb',
                    connectionString: uri,
                    database: this.config.database,
                    collection: 'sessions',
                },
                snapshot: {
                    type: 'mongodb',
                    connectionString: uri,
                    database: this.config.database,
                    collection: 'snapshots',
                },
            },
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
            identity: {
                description:
                    'Agente de conversação para interações com usuários.',
            },
            plannerOptions: {
                planner: 'plan-execute',
                replanPolicy: {
                    toolUnavailable: 'replan',
                    maxReplans: 3,
                },
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
            throw new Error('Organization and team data is required ok.');
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

        // Optional timeline (dev only). Guarded to avoid test failures
        const correlationId = result?.context?.correlationId as
            | string
            | undefined;
        if (
            correlationId &&
            typeof (this.orchestration as any)?.getExecutionTimeline ===
                'function'
        ) {
            try {
                const timeline = (
                    this.orchestration as any
                ).getExecutionTimeline(correlationId);
                if (process.env.NODE_ENV !== 'test') {
                    console.log(timeline);
                }
            } catch {}
        }

        return typeof result.result === 'string'
            ? result.result
            : JSON.stringify(result.result);
    }
}
