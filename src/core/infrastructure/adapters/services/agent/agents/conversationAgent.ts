import { Injectable, Inject } from '@nestjs/common';
import {
    createDirectLLMAdapter,
    createMCPAdapter,
    createOrchestration,
} from '@kodus/flow';
import { LLMProviderService } from '../../llmProviders/llmProvider.service';
import { LLM_PROVIDER_SERVICE_TOKEN } from '../../llmProviders/llmProvider.service.contract';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { LLMModelProvider } from '../../llmProviders/llmModelProvider.helper';

@Injectable()
export class ConversationAgentProvider {
    private orchestration: ReturnType<typeof createOrchestration>;
    private mcpAdapter: ReturnType<typeof createMCPAdapter>;

    private llmAdapter: any;
    private isInitialized = false;

    constructor(
        @Inject(LLM_PROVIDER_SERVICE_TOKEN)
        private readonly llmProviderService: LLMProviderService,
    ) {
        this.llmAdapter = this.createLLMAdapter();
        // === MCP ================================================================
        this.mcpAdapter = createMCPAdapter({
            servers: [
                {
                    name: 'github-mcp',
                    type: 'http' as const,
                    url:
                        process.env.MCP_SERVER_URL ??
                        'http://localhost:3001/mcp',
                    timeout: 10_000,
                    retries: 1,
                    headers: { contentType: 'application/json' },
                },
            ],
            defaultTimeout: 10_000,
            maxRetries: 1,
            onError: (err) => {
                console.error('MCP error:', err.message);
            },
        });
        // === ORCHESTRATION ======================================================
        this.orchestration = createOrchestration({
            tenantId: 'conversation-agent',
            mcpAdapter: this.mcpAdapter,
            llmAdapter: this.llmAdapter,
        });
    }

    private createLLMAdapter() {
        const llm = this.llmProviderService.getLLMProvider({
            model: LLMModelProvider.OPENAI_GPT_4O_MINI,
            temperature: 0.1,
            maxTokens: 500,
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

    // -------------------------------------------------------------------------
    private async initialize() {
        if (this.isInitialized) return;

        // 1️⃣ conecta MCP (opcional)
        try {
            await this.orchestration.connectMCP();
        } catch {
            console.warn('MCP offline, prosseguindo.');
        }

        await this.orchestration.createAgent({
            name: 'conversational-agent',
            planner: 'react',
            identity: {
                description:
                    'Agente de conversação para interações com usuários.',
            },
        });

        this.isInitialized = true;
        console.log('🚀 Conversational-agent pronto!');
    }

    // -------------------------------------------------------------------------
    async execute(prompt: string, org?: OrganizationAndTeamData) {
        await this.initialize();

        const result = await this.orchestration.callAgent(
            'conversational-agent',
            prompt,
            {
                thread: {
                    id: 'conversation-thread',
                    metadata: {
                        title: 'Chat Kodus Flow',
                        description: 'Interação com o agente conversacional',
                    },
                },
                context: {
                    user: { metadata: { organizationAndTeamData: org ?? {} } },
                },
            },
        );
        return null;

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
