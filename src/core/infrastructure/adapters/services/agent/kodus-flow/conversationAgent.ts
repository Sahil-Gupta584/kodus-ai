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
import { LLMProviderService } from '../../llmProviders/llmProvider.service';
import { LLM_PROVIDER_SERVICE_TOKEN } from '../../llmProviders/llmProvider.service.contract';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { LLMModelProvider } from '../../llmProviders/llmModelProvider.helper';
import { MCPManagerService } from '../../../mcp/services/mcp-manager.service';
import { ConfigService } from '@nestjs/config';
import { DatabaseConnection } from '@/config/types';
import { ConnectionString } from 'connection-string';

@Injectable()
export class ConversationAgentProvider {
    protected config: DatabaseConnection;

    private orchestration: ReturnType<typeof createOrchestration>;
    private mcpAdapter: ReturnType<typeof createMCPAdapter>;

    private llmAdapter: any;
    private isInitialized = false;

    constructor(
        private readonly configService: ConfigService,

        @Inject(LLM_PROVIDER_SERVICE_TOKEN)
        private readonly llmProviderService: LLMProviderService,

        private readonly mcpManagerService: MCPManagerService,
    ) {
        this.config = configService.get<DatabaseConnection>('mongoDatabase');
        this.llmAdapter = this.createLLMAdapter();
    }

    private createLLMAdapter() {
        const llm = this.llmProviderService.getLLMProvider({
            model: LLMModelProvider.OPENAI_GPT_4O_MINI,
            temperature: 0.1,
            maxTokens: 1500,
        });

        // ✅ WRAPPER para compatibilizar com nossa interface
        const wrappedLLM = {
            name: 'openai-gpt-4o-mini',
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
                name: 'github-mcp',
                type: 'http' as const,
                url: process.env.MCP_SERVER_URL ?? 'http://localhost:3001/mcp',
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

        const persistorConfig = {
            type: 'mongodb' as any,
            connectionString: uri,
            database: this.config.database,
            collection: 'kodus-snapshots',
        };

        console.log(
            'Persistor Config:',
            JSON.stringify(persistorConfig, null, 2),
        );

        this.orchestration = createOrchestration({
            tenantId: 'kodus-agent-conversation',
            llmAdapter: this.llmAdapter,
            mcpAdapter: this.mcpAdapter,
            persistorConfig,
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

        const tools = this.orchestration.getRegisteredTools();

        console.log(
            'REGISTERED TOOLS!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
            tools,
        );
        await this.orchestration.createAgent({
            name: 'conversational-agent',
            planner: 'plan-execute',
            identity: {
                description:
                    'Agente de conversação para interações com usuários.',
            },
        });

        this.isInitialized = true;
        console.log('🚀 Conversational-agent pronto!');
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

        return {
            response:
                typeof result.result === 'string'
                    ? result.result
                    : JSON.stringify(result.result),
            reasoning:
                'Processado pelo agente de conversação (Router + Planner)',
            agentType: 'conversation',
            timestamp: new Date().toISOString(),
            toolUsed: result.context?.toolName as string,
            toolResult: result.context?.toolResult,
        };
    }
}
