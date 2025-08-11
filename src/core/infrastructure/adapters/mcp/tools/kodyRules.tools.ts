import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PinoLoggerService } from '../../services/logger/pino.service';
import { wrapToolHandler } from '../utils/mcp-protocol.utils';
import { BaseResponse, McpToolDefinition } from '../types/mcp-tool.interface';
import {
    IKodyRulesService,
    KODY_RULES_SERVICE_TOKEN,
} from '@/core/domain/kodyRules/contracts/kodyRules.service.contract';
import {
    IKodyRule,
    IKodyRulesExample,
    KodyRulesOrigin,
    KodyRulesScope,
    KodyRulesStatus,
} from '@/core/domain/kodyRules/interfaces/kodyRules.interface';
import { KodyRuleSeverity } from '@/core/infrastructure/http/dtos/create-kody-rule.dto';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';

type KodyRuleInput = Required<
    Omit<
        IKodyRule,
        | 'uuid'
        | 'createdAt'
        | 'updatedAt'
        | 'type'
        | 'label'
        | 'extendedContext'
        | 'reason'
        | 'severity'
        | 'sourcePath'
    >
> & {
    severity: KodyRuleSeverity;
};

interface KodyRulesResponse extends BaseResponse {
    data: Partial<IKodyRule>[];
}

interface CreateKodyRuleResponse extends BaseResponse {
    data: Partial<IKodyRule>;
}

@Injectable()
export class KodyRulesTools {
    constructor(
        @Inject(KODY_RULES_SERVICE_TOKEN)
        private readonly kodyRulesService: IKodyRulesService,
        private readonly logger: PinoLoggerService,
    ) {}

    getKodyRules(): McpToolDefinition {
        const inputSchema = z.object({
            organizationId: z
                .string()
                .describe(
                    'Organization UUID - unique identifier for the organization in the system to get all organization-level rules',
                ),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'get_kody_rules',
            description:
                'Get all active Kody Rules at organization level. Use this to see organization-wide coding standards, global rules that apply across all repositories, or when you need a complete overview of all active rules. Returns only ACTIVE status rules.',
            inputSchema,
            outputSchema: z.object({
                success: z.boolean(),
                count: z.number(),
                data: z.array(
                    z
                        .object({
                            uuid: z.string().optional(),
                            title: z.string().optional(),
                            rule: z.string().optional(),
                            path: z.string().optional(),
                            status: z.nativeEnum(KodyRulesStatus).optional(),
                            severity: z.string().optional(),
                            label: z.string().optional(),
                            type: z.string().optional(),
                            examples: z
                                .array(
                                    z.object({
                                        snippet: z.string(),
                                        isCorrect: z.boolean(),
                                    }),
                                )
                                .optional(),
                            repositoryId: z.string().optional(),
                            origin: z.nativeEnum(KodyRulesOrigin).optional(),
                            createdAt: z.date().optional(),
                            updatedAt: z.date().optional(),
                            reason: z.string().nullable().optional(),
                            scope: z.nativeEnum(KodyRulesScope).optional(),
                        })
                        .passthrough(),
                ),
            }),
            execute: wrapToolHandler(
                async (args: InputType): Promise<KodyRulesResponse> => {
                    const params = {
                        organizationAndTeamData: {
                            organizationId: args.organizationId,
                        },
                    };

                    const entity =
                        await this.kodyRulesService.findByOrganizationId(
                            params.organizationAndTeamData.organizationId,
                        );

                    const allRules: Partial<IKodyRule>[] = entity.rules || [];

                    const rules: Partial<IKodyRule>[] = allRules.filter(
                        (rule: Partial<IKodyRule>) =>
                            rule.status === KodyRulesStatus.ACTIVE,
                    );

                    return {
                        success: true,
                        count: rules.length,
                        data: rules,
                    };
                },
            ),
        };
    }

    getKodyRulesRepository(): McpToolDefinition {
        const inputSchema = z.object({
            organizationId: z
                .string()
                .describe(
                    'Organization UUID - unique identifier for the organization in the system',
                ),
            repositoryId: z
                .string()
                .describe(
                    'Repository unique identifier to get rules specific to this repository only (not organization-wide rules)',
                ),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'get_kody_rules_repository',
            description:
                'Get active Kody Rules specific to a particular repository. Use this to see repository-specific coding standards, rules that only apply to one codebase, or when analyzing rules for a specific project. More focused than get_kody_rules.',
            inputSchema,
            outputSchema: z.object({
                success: z.boolean(),
                count: z.number(),
                data: z.array(
                    z
                        .object({
                            uuid: z.string().optional(),
                            title: z.string().optional(),
                            rule: z.string().optional(),
                            path: z.string().optional(),
                            status: z.nativeEnum(KodyRulesStatus).optional(),
                            severity: z.string().optional(),
                            label: z.string().optional(),
                            type: z.string().optional(),
                            examples: z
                                .array(
                                    z.object({
                                        snippet: z.string(),
                                        isCorrect: z.boolean(),
                                    }),
                                )
                                .optional(),
                            repositoryId: z.string().optional(),
                            origin: z.nativeEnum(KodyRulesOrigin).optional(),
                            createdAt: z.date().optional(),
                            updatedAt: z.date().optional(),
                            reason: z.string().nullable().optional(),
                            scope: z.nativeEnum(KodyRulesScope).optional(),
                        })
                        .passthrough(),
                ),
            }),
            execute: wrapToolHandler(
                async (args: InputType): Promise<KodyRulesResponse> => {
                    const params = {
                        organizationAndTeamData: {
                            organizationId: args.organizationId,
                        },
                        repositoryId: args.repositoryId,
                    };

                    const entity =
                        await this.kodyRulesService.findByOrganizationId(
                            params.organizationAndTeamData.organizationId,
                        );

                    const allRules: Partial<IKodyRule>[] = entity.rules || [];

                    const repositoryRules: Partial<IKodyRule>[] =
                        allRules.filter(
                            (rule: Partial<IKodyRule>) =>
                                rule.repositoryId &&
                                rule.repositoryId === params.repositoryId &&
                                rule.status === KodyRulesStatus.ACTIVE,
                        );

                    return {
                        success: true,
                        count: repositoryRules?.length,
                        data: repositoryRules,
                    };
                },
            ),
        };
    }

    createKodyRule(): McpToolDefinition {
        const inputSchema = z.object({
            organizationId: z
                .string()
                .describe(
                    'Organization UUID - unique identifier for the organization in the system where the rule will be created',
                ),
            kodyRule: z
                .object({
                    title: z
                        .string()
                        .describe(
                            'Descriptive title for the rule (e.g., "Use arrow functions for components", "Avoid console.log in production")',
                        ),
                    rule: z
                        .string()
                        .describe(
                            'Detailed description of the coding rule/standard to enforce (e.g., "All React components should use arrow function syntax")',
                        ),
                    severity: z
                        .nativeEnum(KodyRuleSeverity)
                        .describe(
                            'Rule severity level: determines how violations are handled (ERROR, WARNING, INFO)',
                        ),
                    scope: z
                        .nativeEnum(KodyRulesScope)
                        .describe(
                            'Rule scope: pull_request (analyzes entire PR context), file (analyzes individual files one by one)',
                        ),
                    repositoryId: z
                        .string()
                        .optional()
                        .describe(
                            'Repository unique identifier - can be used with both scopes to limit rule to specific repository',
                        ),
                    path: z
                        .string()
                        .optional()
                        .describe(
                            'File path pattern - used with FILE scope to target specific files (e.g., "src/components/*.tsx")',
                        ),
                    examples: z
                        .array(
                            z
                                .object({
                                    snippet: z
                                        .string()
                                        .describe(
                                            'Code example snippet demonstrating the rule',
                                        ),
                                    isCorrect: z
                                        .boolean()
                                        .describe(
                                            'Whether this snippet follows the rule (true) or violates it (false)',
                                        ),
                                })
                                .describe(
                                    'Code example showing correct or incorrect usage of the rule',
                                ),
                        )
                        .optional()
                        .describe(
                            'Array of code examples to help understand and apply the rule',
                        ),
                })
                .describe(
                    'Complete rule definition with title, description, scope, and examples',
                ),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'create_kody_rule',
            description:
                'Create a new Kody Rule with custom scope and severity. pull_request scope: analyzes entire PR context for PR-level rules. file scope: analyzes individual files one by one for file-level rules. Rule starts in pending status.',
            inputSchema,
            outputSchema: z.object({
                success: z.boolean(),
                count: z.number(),
                data: z
                    .object({
                        uuid: z.string(),
                        title: z.string(),
                        rule: z.string(),
                    })
                    .passthrough(),
            }),
            execute: wrapToolHandler(
                async (args: InputType): Promise<CreateKodyRuleResponse> => {
                    const params: {
                        organizationAndTeamData: OrganizationAndTeamData;
                        kodyRule: KodyRuleInput;
                    } = {
                        organizationAndTeamData: {
                            organizationId: args.organizationId,
                        },
                        kodyRule: {
                            title: args.kodyRule.title,
                            rule: args.kodyRule.rule,
                            severity: args.kodyRule.severity,
                            scope: args.kodyRule.scope,
                            examples: (args.kodyRule.examples ||
                                []) as IKodyRulesExample[],
                            origin: KodyRulesOrigin.GENERATED,
                            status: KodyRulesStatus.PENDING,
                            repositoryId:
                                args.kodyRule.repositoryId || 'global',
                            path:
                                (args.kodyRule.scope === KodyRulesScope.FILE
                                    ? args.kodyRule.path
                                    : '') || '',
                        },
                    };

                    const result: Partial<IKodyRule> =
                        await this.kodyRulesService.createOrUpdate(
                            params.organizationAndTeamData,
                            params.kodyRule,
                        );

                    return {
                        success: true,
                        count: 1,
                        data: result,
                    };
                },
            ),
        };
    }

    getAllTools(): McpToolDefinition[] {
        return [
            this.getKodyRules(),
            this.getKodyRulesRepository(),
            this.createKodyRule(),
        ];
    }
}
