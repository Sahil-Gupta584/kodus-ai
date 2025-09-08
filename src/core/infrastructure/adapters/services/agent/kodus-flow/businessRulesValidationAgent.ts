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

export interface BusinessRulesValidationContext {
    // Contexto obrigatório
    organizationAndTeamData: OrganizationAndTeamData;

    // Código para análise
    codeContent?: string;
    pullRequestData?: any;
    repositoryData?: any;

    // Escopo de validação
    validationScope?: 'file' | 'pull_request' | 'repository';
}

export interface ValidationResult {
    isValid: boolean;
    violations: Array<{
        rule: string;
        severity: 'error' | 'warning' | 'info';
        message: string;
        line?: number;
        file?: string;
        suggestion?: string;
    }>;
    summary: string;
    complianceScore: number;
    rulesFound?: string[]; // Regras de negócio encontradas via ferramentas MCP
}

@Injectable()
export class BusinessRulesValidationAgentProvider {
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
            temperature: 0.1, // Baixa temperatura para validações consistentes
            maxTokens: 20000,
            maxReasoningTokens: 1000,
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

                console.log(
                    'Business Rules LLM response:',
                    JSON.stringify(resp, null, 2),
                );

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
                timeout: 15_000, // Timeout maior para validações complexas
                retries: 2,
                headers: { contentType: 'application/json' },
                allowedTools: [
                    'KODUS_GET_PULL_REQUEST_DIFF',
                    'KODUS_GET_PULL_REQUEST',
                    'KODUS_GET_REPOSITORY_FILES',
                ],
            },
        ];

        const servers = [...defaultServers, ...mcpManagerServers];

        this.mcpAdapter = createMCPAdapter({
            servers,
            defaultTimeout: 15_000,
            maxRetries: 2,
            onError: (err) => {
                console.error('Business Rules MCP error:', err.message);
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
            tenantId: 'kodus-agent-business-rules',
            llmAdapter: this.llmAdapter,
            mcpAdapter: this.mcpAdapter,
            observability: {
                logging: { enabled: true, level: 'info' },
                mongodb: {
                    type: 'mongodb',
                    connectionString: uri,
                    database: this.config.database,
                    collections: {
                        logs: 'business_rules_validation_logs',
                        telemetry: 'business_rules_validation_telemetry',
                        errors: 'business_rules_validation_errors',
                    },
                    batchSize: 100,
                    flushIntervalMs: 5000,
                    ttlDays: 30,
                    enableObservability: true,
                },
                telemetry: {
                    enabled: true,
                    serviceName: 'kodus-business-rules-validation',
                    sampling: { rate: 1, strategy: 'probabilistic' },
                    privacy: { includeSensitiveData: false },
                    spanTimeouts: {
                        enabled: true,
                        maxDurationMs: 10 * 60 * 1000, // 10 minutos para validações complexas
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

    private async initialize(organizationAndTeamData: OrganizationAndTeamData) {
        await this.createMCPAdapter(organizationAndTeamData);
        await this.createOrchestration();

        try {
            await this.orchestration.connectMCP();
            await this.orchestration.registerMCPTools();
        } catch (error) {
            console.warn('Business Rules MCP offline, prosseguindo.');
        }

        await this.orchestration.createAgent({
            name: 'kodus-business-rules-validation-agent',
            identity: {
                goal: 'Validate code against specific business rules, ensuring compliance with domain logic and business policies',
                description: `Specialist in business rules validation and domain logic.

                Responsibilities:
                - Analyze code against specific business rules
                - Validate compliance with domain logic
                - Verify business policies and rules
                - Identify business rules violations
                - Suggest corrections based on business rules
                - Generate business compliance reports

                Methodology:
                - Business rules focused analysis
                - Prioritization by severity (error > warning > info)
                - Contextualization with domain rules
                - Focus on actionable and specific business rules`,
                expertise: [
                    'Business rules analysis',
                    'Domain logic validation',
                    'Business policies and rules',
                    'Business compliance',
                    'Functional requirements analysis',
                    'Business flow validation',
                    'Data validation rules',
                    'Business security policies',
                    'Authorization and permission rules',
                    'Business transaction validation',
                    'Use case analysis',
                    'Domain-specific business rules',
                ],
                personality:
                    'Methodical, detailed and quality-focused. Always seeks technical excellence and provides constructive and actionable feedback.',
                style: 'Technical and precise, with clear explanations and practical suggestions. Uses professional but accessible language.',
                systemPrompt: `You are a business rules validation specialist.

Your mission is to analyze code and identify business rules violations, providing structured and actionable feedback.

ReAct STRATEGY:
1. THINK: Identify MCP tools available in the prompt
2. ACT: Use MCP tools to search for business rules (Jira, Notion, Google Docs, etc.)
3. OBSERVE: Analyze the context found
4. REPEAT: Continue searching until you have sufficient context
5. VALIDATE: Analyze code against found rules

AVAILABLE MCP TOOLS:
- Automatically identify MCP tools in the prompt
- Use tools to search for business context
- Adapt to available tools

ALWAYS:
- SEARCH for context using available MCP tools
- Analyze code against found business rules
- Identify domain logic violations
- Classify by severity (error > warning > info)
- Provide specific correction suggestions
- Calculate a compliance score (0-100)

NEVER:
- Ignore critical business rules
- Provide vague or generic feedback
- Assume rules without searching for context first`,
            },
            maxIterations: 10,
            timeout: 300000,
            enableSession: true,
            enableMemory: true,
            plannerOptions: {
                type: PlannerType.REACT,
                replanPolicy: {
                    toolUnavailable: 'replan',
                    maxReplans: 5,
                },
            },
        });
    }

    async validateBusinessRules(
        context: BusinessRulesValidationContext,
        thread?: Thread,
    ): Promise<ValidationResult> {
        try {
            this.logger.log({
                message: 'Starting business rules validation',
                context: BusinessRulesValidationAgentProvider.name,
                serviceName: BusinessRulesValidationAgentProvider.name,
                metadata: {
                    organizationAndTeamData: context.organizationAndTeamData,
                    validationScope: context.validationScope,
                    thread,
                },
            });

            if (!context.organizationAndTeamData) {
                throw new Error(
                    'Organization and team data is required for business rules validation.',
                );
            }

            await this.initialize(context.organizationAndTeamData);

            const validationPrompt = this.buildValidationPrompt(context);

            const result = await this.orchestration.callAgent(
                'kodus-business-rules-validation-agent',
                validationPrompt,
                {
                    thread: thread,
                    userContext: {
                        organizationAndTeamData:
                            context.organizationAndTeamData,
                        validationContext: context,
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
                'Business Rules Validation Traceability:',
                JSON.stringify(traceability, null, 2),
            );

            this.logger.log({
                message: 'Finish business rules validation',
                context: BusinessRulesValidationAgentProvider.name,
                serviceName: BusinessRulesValidationAgentProvider.name,
                metadata: {
                    organizationAndTeamData: context.organizationAndTeamData,
                    thread,
                    result: {
                        correlationId: result.context.correlationId ?? null,
                        threadId: result.context.threadId ?? null,
                        sessionId: result.context.sessionId ?? null,
                    },
                },
            });

            // Parse the result into ValidationResult format
            return this.parseValidationResult(result.result);
        } catch (error) {
            this.logger.error({
                message: 'Error during business rules validation',
                context: BusinessRulesValidationAgentProvider.name,
                serviceName: BusinessRulesValidationAgentProvider.name,
                metadata: {
                    error,
                    organizationAndTeamData: context.organizationAndTeamData,
                    thread,
                },
            });
            throw error;
        }
    }

    private buildValidationPrompt(
        context: BusinessRulesValidationContext,
    ): string {
        const scope = context.validationScope || 'file';
        const hasCodeContent = !!context.codeContent;
        const hasPullRequestData = !!context.pullRequestData;

        let prompt = `Perform business rules validation for scope: ${scope.toUpperCase()}.

CONTEXT:
- Organization: ${context.organizationAndTeamData.organizationId}
- Scope: ${scope}
- Code available: ${hasCodeContent ? 'Yes' : 'No'}
- PR data available: ${hasPullRequestData ? 'Yes' : 'No'}

INSTRUCTIONS:
1. IDENTIFY MCP tools available in the prompt
2. SEARCH for business rules using MCP tools (Jira, Notion, Google Docs, etc.)
3. ANALYZE code against found rules
4. IDENTIFY domain logic violations
5. CLASSIFY by severity (error > warning > info)
6. PROVIDE specific correction suggestions
7. CALCULATE a compliance score (0-100)

IMPORTANT: If no code or PR data is available, respond with:
{
  "isValid": false,
  "violations": [],
  "summary": "No code or PR data provided for validation. Please provide: 1) Code content to analyze, or 2) Pull Request information, or 3) Repository details for business rules validation.",
  "complianceScore": 0,
  "rulesFound": []
}

EXPECTED RESPONSE FORMAT:
{
  "isValid": boolean,
  "violations": [
    {
      "rule": "description of violated business rule",
      "severity": "error|warning|info",
      "message": "description of found violation",
      "line": line_number (optional),
      "file": "file_name (optional)",
      "suggestion": "correction suggestion"
    }
  ],
  "summary": "executive validation summary",
  "complianceScore": number_from_0_to_100,
  "rulesFound": [
    "list of business rules found via MCP tools"
  ]
}`;

        if (context.codeContent) {
            prompt += `\n\nCODE FOR ANALYSIS:\n\`\`\`\n${context.codeContent}\n\`\`\``;
        }

        if (context.pullRequestData) {
            prompt += `\n\nPULL REQUEST DATA:\n- Title: ${context.pullRequestData.title || 'N/A'}\n- Number: ${context.pullRequestData.number || 'N/A'}\n- State: ${context.pullRequestData.state || 'N/A'}\n- Author: ${context.pullRequestData.user?.login || 'N/A'}`;
        }

        if (context.repositoryData) {
            prompt += `\n\nREPOSITORY DATA:\n- Name: ${context.repositoryData.name || 'N/A'}\n- ID: ${context.repositoryData.id || 'N/A'}\n- Platform: ${context.repositoryData.platform || 'N/A'}`;
        }

        return prompt;
    }

    private parseValidationResult(result: any): ValidationResult {
        try {
            // Se o resultado já está no formato correto
            if (typeof result === 'object' && result.isValid !== undefined) {
                return result as ValidationResult;
            }

            // Se é uma string, tenta fazer parse do JSON
            if (typeof result === 'string') {
                const parsed = JSON.parse(result);
                return parsed as ValidationResult;
            }

            // Fallback: cria um resultado básico
            return {
                isValid: true,
                violations: [],
                summary: 'Validação concluída com sucesso',
                complianceScore: 100,
            };
        } catch (error) {
            this.logger.error({
                message: 'Error parsing validation result',
                context: BusinessRulesValidationAgentProvider.name,
                error,
                metadata: { result },
            });

            return {
                isValid: false,
                violations: [
                    {
                        rule: 'parse_error',
                        severity: 'error',
                        message: 'Erro ao processar resultado da validação',
                    },
                ],
                summary: 'Erro durante a validação',
                complianceScore: 0,
            };
        }
    }

    // Método de conveniência para validação de arquivo único
    async validateFile(
        organizationAndTeamData: OrganizationAndTeamData,
        codeContent: string,
        fileName: string,
        thread?: Thread,
    ): Promise<ValidationResult> {
        return this.validateBusinessRules(
            {
                organizationAndTeamData,
                codeContent,
                validationScope: 'file',
            },
            thread,
        );
    }

    // Método de conveniência para validação de Pull Request
    async validatePullRequest(
        organizationAndTeamData: OrganizationAndTeamData,
        pullRequestData: any,
        repositoryData: any,
        thread?: Thread,
    ): Promise<ValidationResult> {
        return this.validateBusinessRules(
            {
                organizationAndTeamData,
                pullRequestData,
                repositoryData,
                validationScope: 'pull_request',
            },
            thread,
        );
    }

    // Método de conveniência para validação de repositório
    async validateRepository(
        organizationAndTeamData: OrganizationAndTeamData,
        repositoryData: any,
        thread?: Thread,
    ): Promise<ValidationResult> {
        return this.validateBusinessRules(
            {
                organizationAndTeamData,
                repositoryData,
                validationScope: 'repository',
            },
            thread,
        );
    }
}
