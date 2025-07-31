import { Injectable, Inject } from '@nestjs/common';
import {
    createDirectLLMAdapter,
    createMCPAdapter,
    createOrchestration,
    Thread,
    MCPServerConfig,
    PersistorType,
    MongoDBPersistorConfig,
} from '@kodus/flow';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { MCPManagerService } from '../../../mcp/services/mcp-manager.service';
import { ConfigService } from '@nestjs/config';
import { DatabaseConnection } from '@/config/types';
import { ConnectionString } from 'connection-string';
import { LLMProviderService, LLMModelProvider } from '@kodus/kodus-common/llm';

@Injectable()
export class ConversationAgentProvider {
    protected config: DatabaseConnection;

    private orchestration: ReturnType<typeof createOrchestration>;
    private mcpAdapter: ReturnType<typeof createMCPAdapter>;

    private llmAdapter: any;

    constructor(
        private readonly configService: ConfigService,

        private readonly mcpManagerService: MCPManagerService,
        private readonly llmProviderService: LLMProviderService,
    ) {
        this.config =
            this.configService.get<DatabaseConnection>('mongoDatabase');
        this.llmAdapter = this.createLLMAdapter();
    }

    private createLLMAdapter() {
        const llm = this.llmProviderService.getLLMProvider({
            model: LLMModelProvider.OPENAI_GPT_4_1,
            temperature: 0,
            maxTokens: 8000,
        });

        // ✅ WRAPPER para compatibilizar com nossa interface
        const wrappedLLM = {
            async call(messages: any[]): Promise<any> {
                // Converter nossas mensagens para formato LangChain
                const langchainMessages = messages.map((msg) => ({
                    type:
                        msg.role === 'system'
                            ? 'system'
                            : msg.role === 'user'
                              ? 'human'
                              : 'ai',
                    content: msg.content,
                }));

                const response = await llm.invoke(langchainMessages);

                return {
                    content: response.content,
                    usage: response.usage || {
                        promptTokens: 0,
                        completionTokens: 0,
                        totalTokens: 0,
                    },
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

    private createOrchestration() {
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

        this.orchestration = createOrchestration({
            tenantId: 'kodus-agent-conversation',
            llmAdapter: this.llmAdapter,
            mcpAdapter: this.mcpAdapter,
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
        this.createOrchestration();

        // 1️⃣ conecta MCP (opcional)
        try {
            await this.orchestration.connectMCP();
            await this.orchestration.registerMCPTools();
        } catch (error) {
            console.warn('MCP offline, prosseguindo.');
        }

        await this.orchestration.createAgent({
            name: 'conversational-agent',
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
            'conversational-agent',
            prompt,
            {
                thread: thread,
                userContext: {
                    organizationAndTeamData: organizationAndTeamData,
                    prepareContext: prepareContext,
                },
            },
        );

        return typeof result.result === 'string'
            ? result.result
            : JSON.stringify(result.result);
    }
}
