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

export interface ValidationResult {
    needsMoreInfo?: boolean;
    missingInfo?: string;
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
    confidence?: 'high' | 'medium' | 'low';

    // Novos campos para análise mais detalhada
    implementedCorrectly?: string[];
    missingOrIncomplete?: Array<{
        requirement: string;
        impact: string;
        suggestion: string;
    }>;
    edgeCasesAndAssumptions?: Array<{
        scenario: string;
        risk: string;
        recommendation: string;
    }>;
    businessLogicIssues?: Array<{
        issue: string;
        severity: 'error' | 'warning' | 'info';
        fix: string;
    }>;
    rulesFound?: string[];
}

// Removed TaskInfo, PreValidationResult, and ValidationContext interfaces
// as we no longer perform pre-validation - the agent handles everything via MCP tools

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
                timeout: 15_000,
                retries: 2,
                headers: { contentType: 'application/json' },
                allowedTools: [
                    'KODUS_GET_PULL_REQUEST_DIFF',
                    'KODUS_GET_PULL_REQUEST',
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
                goal: 'Analyze and validate business rules compliance - identify what is missing, forgotten, or not properly considered',
                description: `Senior Business Rules Analyst - Expert at identifying gaps, missing requirements, and overlooked business scenarios in code implementations.

                Responsibilities:
                - Fetch and analyze task requirements from external systems (Jira, Notion, Google Docs)
                - Extract business rules, acceptance criteria, and edge cases from task descriptions
                - Analyze code changes against business requirements to find gaps
                - Identify missing business logic implementations
                - Spot forgotten validation rules and business constraints
                - Alert about business hypotheses that may not have been considered
                - Flag potential business risks and edge cases
                - Provide clear, actionable feedback on business compliance,

                Critical Analysis Focus:
                - What business requirements are NOT implemented in the code?
                - What acceptance criteria are missing or incomplete?
                - What business edge cases were forgotten?
                - What validation rules are missing?
                - What business assumptions might be incorrect?
                - What security/compliance requirements are overlooked?

                Methodology:
                - MANDATORY CONTEXT FIRST: Never analyze code without understanding business requirements
                - STRICT VALIDATION: If no task information is found, immediately ask user for task details
                - NO ASSUMPTIONS: Never proceed with validation using only PR description as task context
                - SYSTEMATIC APPROACH: 1) Get explicit task context from external systems → 2) Extract requirements → 3) Get PR diff → 4) Compare vs requirements → 5) Identify gaps
                - REQUIREMENT-DRIVEN: Every validation question must be answered against specific business requirements from EXTERNAL TASK
                - GAP ANALYSIS: Focus on what SHOULD exist in code but doesn't, based on EXTERNAL task requirements
                - RISK ASSESSMENT: Flag business scenarios that may cause problems if not properly handled
                - COMPLIANCE VALIDATION: Ensure all business rules from EXTERNAL task are correctly implemented in code`,
                expertise: [
                    'Business requirements extraction from external task management systems',
                    'Task context analysis and interpretation',
                    'PR diff analysis in context of business requirements',
                    'Gap analysis between requirements and implementation',
                    'Missing business logic identification',
                    'Edge case and assumption validation',
                    'Business risk assessment and alerting',
                    'Acceptance criteria compliance verification',
                    'Security and compliance requirement validation',
                    'Business workflow implementation verification',
                ],
                personality:
                    'Detail-oriented business analyst. Focuses on finding what is missing or overlooked rather than what is present. Always thinks about business impact and potential risks.',
                style: 'Clear and direct feedback. Uses bullet points and specific examples. Prioritizes business clarity over technical jargon. Always explains the business impact of findings.',
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

    async validateBusinessRules(context: any): Promise<ValidationResult> {
        try {
            this.logger.log({
                message:
                    'Starting business rules validation with advanced orchestration',
                context: BusinessRulesValidationAgentProvider.name,
                serviceName: BusinessRulesValidationAgentProvider.name,
                metadata: {
                    organizationAndTeamData: context.organizationAndTeamData,
                    validationScope: context.validationScope,
                    thread: context.thread,
                },
            });

            if (!context.organizationAndTeamData) {
                throw new Error(
                    'Organization and team data is required for business rules validation.',
                );
            }

            await this.initialize(context.organizationAndTeamData);

            // No pre-validation needed - let the agent handle context discovery via MCP tools

            // 🔍 STEP 1: Validation execution - let agent discover context via MCP tools
            const validationPrompt = this.buildValidationPrompt(context);
            const result = await this.orchestration.callAgent(
                'kodus-business-rules-validation-agent',
                validationPrompt,
                {
                    thread: context.thread,
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
                    thread: context.thread,
                    result: {
                        correlationId: result.context.correlationId ?? null,
                        threadId: result.context.threadId ?? null,
                        sessionId: result.context.sessionId ?? null,
                    },
                },
            });

            return this.parseValidationResult(result.result);
        } catch (error) {
            this.logger.error({
                message: 'Error during business rules validation',
                context: BusinessRulesValidationAgentProvider.name,
                serviceName: BusinessRulesValidationAgentProvider.name,
                metadata: {
                    error,
                    organizationAndTeamData: context.organizationAndTeamData,
                    thread: context.thread,
                },
            });
            throw error;
        }
    }

    private buildValidationPrompt(context: any): string {
        return `BUSINESS RULES GAP ANALYSIS - Find what's missing, forgotten, or overlooked

USER REQUEST: ${context.userMessage || 'Analyze business rules compliance'}

CRITICAL VALIDATION CHECK:
- Did I successfully find task information from available external systems?
- If NO task information was found, I MUST set needsMoreInfo=true and ask for task details
- If ONLY PR description is available, I MUST still ask for explicit task information
- NEVER proceed with validation using only PR context as "task requirements"

CRITICAL ANALYSIS QUESTIONS:
❌ What business requirements are NOT implemented in the code?
❌ What validation rules were forgotten?
❌ What business edge cases were overlooked?
❌ What security/compliance requirements are missing?
❌ What business assumptions might be incorrect?
❌ What potential business risks exist?

CRITICAL EXECUTION ORDER (MANDATORY):
1. 🔍 FIRST: Get complete task context from available external systems (use any MCP tools available)
2. 📋 SECOND: Extract all business requirements, rules, and acceptance criteria from the task
3. 🔄 THIRD: Get PR diff using available tools
4. 🔍 FOURTH: Analyze what code actually changed vs what should have changed based on task requirements
5. ✅ FIFTH: Confirm what's implemented correctly
6. ❌ SIXTH: Identify what's missing or incomplete
7. ⚠️  SEVENTH: Alert about forgotten edge cases or assumptions
8. 📊 EIGHTH: Score compliance with business requirements

VALIDATION FRAMEWORK:
- 🔴 EXTERNAL CONTEXT IS CRITICAL: PR description alone is NOT sufficient. Must have task context from external sources
- 🚫 NO ASSUMPTIONS: Never proceed without understanding what SHOULD be implemented
- 🔄 REQUIREMENT-DRIVEN ANALYSIS: Every validation must be based on specific business requirements
- 🔍 GAP IDENTIFICATION: Find business logic that SHOULD exist but doesn't
- ⚠️ RISK ASSESSMENT: Flag business scenarios that may cause problems
- ✅ COMPLIANCE VALIDATION: Ensure all business rules are correctly implemented

REMEMBER: Use whatever MCP tools are available to get task information. If no tools can provide context, ask the user for task details.

RESPONSE FORMAT:
{
  "needsMoreInfo": boolean,
  "missingInfo": "Preciso do link ou descrição da tarefa para validar. Forneça informações sobre o que deve ser implementado.",

  "implementedCorrectly": [
    "Business rule/feature that is properly implemented",
    "Another correctly implemented requirement"
  ],

  "missingOrIncomplete": [
    {
      "requirement": "Business requirement not found in code",
      "impact": "What this missing piece affects",
      "suggestion": "How to implement it"
    }
  ],

  "edgeCasesAndAssumptions": [
    {
      "scenario": "Edge case that may have been overlooked",
      "risk": "Potential business impact",
      "recommendation": "How to handle it"
    }
  ],

  "businessLogicIssues": [
    {
      "issue": "Problem with business logic implementation",
      "severity": "error|warning|info",
      "fix": "Suggested correction"
    }
  ],

  "summary": "Overall assessment of business requirements compliance",
  "complianceScore": 0-100,
  "confidence": "high|medium|low"
}`;
    }

    private parseValidationResult(result: any): ValidationResult {
        try {
            let parsed: any;

            // Se é uma string, tenta fazer parse do JSON
            if (typeof result === 'string') {
                parsed = JSON.parse(result);
            } else if (typeof result === 'object') {
                parsed = result;
            } else {
                throw new Error('Invalid result format');
            }

            // Valida se tem os campos necessários
            if (parsed.needsMoreInfo !== undefined) {
                return {
                    needsMoreInfo: parsed.needsMoreInfo,
                    missingInfo: parsed.missingInfo,
                    isValid: parsed.isValid || false,
                    violations: parsed.violations || [],
                    summary: parsed.summary || 'Validation completed',
                    complianceScore: parsed.complianceScore || 0,
                    confidence: parsed.confidence || 'medium',
                    implementedCorrectly: parsed.implementedCorrectly || [],
                    missingOrIncomplete: parsed.missingOrIncomplete || [],
                    edgeCasesAndAssumptions:
                        parsed.edgeCasesAndAssumptions || [],
                    businessLogicIssues: parsed.businessLogicIssues || [],
                };
            }

            // Fallback para formato antigo
            return {
                isValid: parsed.isValid || false,
                violations: parsed.violations || [],
                summary: parsed.summary || 'Validation completed',
                complianceScore: parsed.complianceScore || 0,
            };
        } catch (error) {
            this.logger.error({
                message: 'Error parsing validation result',
                context: BusinessRulesValidationAgentProvider.name,
                error,
                metadata: { result },
            });

            return {
                needsMoreInfo: true,
                missingInfo:
                    'Unable to process validation result. Please try again.',
                isValid: false,
                violations: [],
                summary: 'Error during validation',
                complianceScore: 0,
            };
        }
    }
}
