import { Injectable } from '@nestjs/common';
import {
    createMCPAdapter,
    createOrchestration,
    Thread,
    PlannerType,
    StorageEnum,
    getExecutionTraceability,
    LLMAdapter,
} from '@kodus/flow';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { MCPManagerService } from '../../../mcp/services/mcp-manager.service';
import { ConfigService } from '@nestjs/config';
import { DatabaseConnection } from '@/config/types';
import { LLMModelProvider, PromptRunnerService } from '@kodus/kodus-common/llm';
import { SDKOrchestrator } from '@kodus/flow/dist/orchestration';
import { PinoLoggerService } from '../../logger/pino.service';
import { ParametersKey } from '@/shared/domain/enums/parameters-key.enum';
import {
    PARAMETERS_SERVICE_TOKEN,
    IParametersService,
} from '@/core/domain/parameters/contracts/parameters.service.contract';
import { Inject } from '@nestjs/common';
import { PermissionValidationService } from '@/ee/shared/services/permissionValidation.service';
import { BaseAgentProvider } from './base-agent.provider';
import { ObservabilityService } from '../../logger/observability.service';

@Injectable()
export class ConversationAgentProvider extends BaseAgentProvider {
    protected config: DatabaseConnection;
    private orchestration: SDKOrchestrator;
    private mcpAdapter: ReturnType<typeof createMCPAdapter>;
    private llmAdapter: LLMAdapter;
    protected readonly defaultLLMConfig = {
        llmProvider: LLMModelProvider.GEMINI_2_5_PRO,
        temperature: 0,
        maxTokens: 20000,
        maxReasoningTokens: 800,
        stop: undefined as string[] | undefined,
    };

    constructor(
        @Inject(PARAMETERS_SERVICE_TOKEN)
        private readonly parametersService: IParametersService,
        private readonly configService: ConfigService,
        promptRunnerService: PromptRunnerService,
        private readonly logger: PinoLoggerService,
        permissionValidationService: PermissionValidationService,
        observabilityService: ObservabilityService,
        private readonly mcpManagerService?: MCPManagerService,
    ) {
        super(
            promptRunnerService,
            permissionValidationService,
            observabilityService,
        );
        this.config =
            this.configService.get<DatabaseConnection>('mongoDatabase');
    }

    protected async createMCPAdapter(
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<void> {
        const mcpManagerServers = await this.mcpManagerService.getConnections(
            organizationAndTeamData,
        );

        const servers = [...mcpManagerServers];

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
        this.llmAdapter = super.createLLMAdapter(
            'ConversationalAgent',
            'conversationAgent',
        );

        this.orchestration = await createOrchestration({
            tenantId: 'kodus-agent-conversation',
            llmAdapter: this.llmAdapter,
            mcpAdapter: this.mcpAdapter,
            observability:
                this.observabilityService.createAgentObservabilityConfig(
                    this.config,
                    'kodus-flow',
                ),
            storage: {
                type: StorageEnum.MONGODB,
                connectionString:
                    this.observabilityService.buildConnectionString(
                        this.config,
                    ),
                database: this.config.database,
            },
        });
    }

    private async initialize(
        organizationAndTeamData: OrganizationAndTeamData,
        userLanguage: string,
    ) {
        await this.createMCPAdapter(organizationAndTeamData);
        await this.createOrchestration();

        try {
            await this.orchestration.connectMCP();
            await this.orchestration.registerMCPTools();
        } catch (error) {
            this.logger.warn({
                message: 'MCP offline, prosseguindo.',
                context: ConversationAgentProvider.name,
                error,
            });
        }

        await this.orchestration.createAgent({
            name: 'kodus-conversational-agent',
            identity: {
                description:
                    'Agente de conversação inteligente para interações com usuários.',
                goal: 'Engage in natural, helpful conversations while respecting user language preferences',
                language: userLanguage,
                languageInstructions: `LANGUAGE REQUIREMENTS:
- Respond in the user's preferred language: ${userLanguage}
- Default to English if no language preference is configured
- Maintain consistent language throughout conversation
- Use appropriate terminology and formatting for the selected language
- Adapt communication style to the target language conventions`,
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
            context || ({} as any);
        try {
            const userLanguage = await this.getLanguage(
                organizationAndTeamData,
            );

            this.logger.log({
                message: 'Starting conversation agent execution',
                context: ConversationAgentProvider.name,
                serviceName: ConversationAgentProvider.name,
                metadata: { organizationAndTeamData, thread, userLanguage },
            });

            if (!organizationAndTeamData) {
                throw new Error('Organization and team data is required ok.');
            }

            if (!thread) {
                throw new Error('thread and team data is required.');
            }

            await this.fetchBYOKConfig(organizationAndTeamData);

            await this.initialize(organizationAndTeamData, userLanguage);

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

            const uri = this.observabilityService.buildConnectionString(
                this.config,
            );

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

    private async getLanguage(
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<string> {
        let language = null;

        if (organizationAndTeamData && organizationAndTeamData.teamId) {
            language = await this.parametersService.findByKey(
                ParametersKey.LANGUAGE_CONFIG,
                organizationAndTeamData,
            );
        }

        if (!language) {
            return 'en-US';
        }

        return language?.configValue || 'en-US';
    }
}
