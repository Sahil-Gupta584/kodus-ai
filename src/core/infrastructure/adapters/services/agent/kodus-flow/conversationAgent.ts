import { Injectable } from '@nestjs/common';
import {
    createDirectLLMAdapter,
    createMCPAdapter,
    createOrchestration,
    Thread,
    MCPServerConfig,
    DirectLLMAdapter,
    PlannerType,
    StorageEnum,
    getExecutionTraceability,
} from '@kodus/flow';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { MCPManagerService } from '../../../mcp/services/mcp-manager.service';
import { ConfigService } from '@nestjs/config';
import { DatabaseConnection } from '@/config/types';
import { ConnectionString } from 'connection-string';
import { LLMProviderService, LLMModelProvider } from '@kodus/kodus-common/llm';
import { SDKOrchestrator } from '@kodus/flow/dist/orchestration';
import { PinoLoggerService } from '../../logger/pino.service';

@Injectable()
export class ConversationAgentProvider {
    protected config: DatabaseConnection;

    private orchestration: SDKOrchestrator;
    private mcpAdapter: ReturnType<typeof createMCPAdapter>;

    private llmAdapter: DirectLLMAdapter;

    constructor(
        private readonly configService: ConfigService,
        private readonly llmProviderService: LLMProviderService,
        private readonly logger: PinoLoggerService,
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
            maxTokens: 20000,
            maxReasoningTokens: 800,
        });

        function sanitizeName(name: string) {
            const cleaned = name.replace(/[^\w.\-]/g, '_');
            return cleaned.slice(0, 64);
        }

        function contentToString(content: unknown): string {
            if (typeof content === 'string') {
                return content;
            }
            if (Array.isArray(content)) {
                return content
                    .filter(
                        (b: unknown): b is { type: string; text?: string } =>
                            !!b &&
                            typeof b === 'object' &&
                            'type' in (b as any),
                    )
                    .map((b) =>
                        (b as any).type === 'text'
                            ? String((b as any).text ?? '')
                            : '',
                    )
                    .join('');
            }
            return '';
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
                const resp = await model.invoke(lcMessages, {
                    stop: options.stop,
                    temperature: options.temperature,
                    maxReasoningTokens: options.maxReasoningTokens,
                });

                console.log('LLM response:', JSON.stringify(resp, null, 2));

                const text = contentToString(resp.content);

                return {
                    content: text,
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

        this.orchestration = await createOrchestration({
            tenantId: 'kodus-agent-conversation',
            llmAdapter: this.llmAdapter,
            mcpAdapter: this.mcpAdapter,
            observability: {
                logging: { enabled: true, level: 'info' },
                mongodb: {
                    type: 'mongodb',
                    connectionString: uri,
                    database: this.config.database,
                    collections: {
                        logs: 'observability_logs',
                        telemetry: 'observability_telemetry',
                        errors: 'observability_errors',
                    },
                    batchSize: 100,
                    flushIntervalMs: 5000,
                    ttlDays: 30,
                    enableObservability: true,
                },
                telemetry: {
                    enabled: true,
                    serviceName: 'kodus-flow',
                    sampling: { rate: 1, strategy: 'probabilistic' },
                    privacy: { includeSensitiveData: false },
                    spanTimeouts: {
                        enabled: true,
                        maxDurationMs: 5 * 60 * 1000,
                    },
                },
            },
            storage: {
                type: StorageEnum.MONGODB,
                connectionString: uri,
                database: this.config.database,
            },
        });
    }

    // -------------------------------------------------------------------------
    private async initialize(organizationAndTeamData: OrganizationAndTeamData) {
        await this.createMCPAdapter(organizationAndTeamData);
        await this.createOrchestration();

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
                type: PlannerType.REACT,
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
        try {
            this.logger.log({
                message: 'Starting conversation agent execution',
                context: ConversationAgentProvider.name,
                serviceName: ConversationAgentProvider.name,
                metadata: { organizationAndTeamData, thread },
            });

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

            let uri = new ConnectionString('', {
                user: this.config.username,
                password: this.config.password,
                protocol: this.config.port ? 'mongodb' : 'mongodb+srv',
                hosts: [{ name: this.config.host, port: this.config.port }],
            }).toString();

            const corr = (result?.context?.correlationId as string) ?? '';

            const traceability = await getExecutionTraceability(
                uri,
                corr,
                'kodus_db',
            );

            console.log(
                'Conversation Agent Traceability:',
                JSON.stringify(traceability, null, 2),
            );

            this.logger.log({
                message: 'Finish conversation agent execution',
                context: ConversationAgentProvider.name,
                serviceName: ConversationAgentProvider.name,
                metadata: {
                    organizationAndTeamData,
                    thread,
                    result: {
                        correlationId: result.context.correlationId ?? null,
                        threadId: result.context.threadId ?? null,
                        sessionId: result.context.sessionId ?? null,
                    },
                },
            });

            return typeof result.result === 'string'
                ? result.result
                : JSON.stringify(result.result);
        } catch (error) {
            this.logger.error({
                message: 'Error during conversation agent execution',
                context: ConversationAgentProvider.name,
                serviceName: ConversationAgentProvider.name,
                metadata: { error, organizationAndTeamData, thread },
            });
            throw error;
        }
    }
}
