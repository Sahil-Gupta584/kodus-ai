import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PinoLoggerService } from '../../services/logger/pino.service';
import { createToolResponse, wrapToolHandler } from '../utils';
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
    >
> & {
    severity: KodyRuleSeverity;
};

@Injectable()
export class KodyRulesTools {
    constructor(
        @Inject(KODY_RULES_SERVICE_TOKEN)
        private readonly kodyRulesService: IKodyRulesService,
        private readonly logger: PinoLoggerService,
    ) {}

    getKodyRules() {
        const inputSchema = z.object({
            organizationId: z.string(),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'get_kody_rules',
            description: 'Get all Kody Rules for a specific organization',
            inputSchema,
            execute: wrapToolHandler(async (args: InputType) => {
                const params = {
                    organizationAndTeamData: {
                        organizationId: args.organizationId,
                    },
                };

                const entity = await this.kodyRulesService.findByOrganizationId(
                    params.organizationAndTeamData.organizationId,
                );

                const allRules = entity.rules || [];

                const rules = allRules.filter(
                    (rule) => rule.status === KodyRulesStatus.ACTIVE,
                );

                return {
                    success: true,
                    count: rules.length,
                    data: rules,
                };
            }),
        };
    }

    getKodyRulesRepository() {
        const inputSchema = z.object({
            organizationId: z.string(),
            repositoryId: z.string(),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'get_kody_rules_repository',
            description: 'Get the Kody Rules for a specific repository',
            inputSchema,
            execute: wrapToolHandler(async (args: InputType) => {
                const params = {
                    organizationAndTeamData: {
                        organizationId: args.organizationId,
                    },
                    repositoryId: args.repositoryId,
                };

                const entity = await this.kodyRulesService.findByOrganizationId(
                    params.organizationAndTeamData.organizationId,
                );

                const allRules = entity.rules || [];

                const repositoryRules = allRules.filter(
                    (rule) =>
                        rule.repositoryId &&
                        rule.repositoryId === params.repositoryId &&
                        rule.status === KodyRulesStatus.ACTIVE,
                );

                return {
                    success: true,
                    count: repositoryRules.length,
                    data: repositoryRules,
                };
            }),
        };
    }

    createKodyRule() {
        const inputSchema = z.object({
            organizationId: z.string(),
            kodyRule: z.object({
                title: z.string(),
                rule: z.string(),
                severity: z.nativeEnum(KodyRuleSeverity),
                scope: z.nativeEnum(KodyRulesScope),
                repositoryId: z.string().optional(),
                path: z.string().optional(),
                examples: z
                    .array(
                        z.object({
                            snippet: z.string(),
                            isCorrect: z.boolean(),
                        }),
                    )
                    .optional(),
            }),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'create_kody_rule',
            description: 'Create a new Kody Rule',
            inputSchema,
            execute: wrapToolHandler(async (args: InputType) => {
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
                        examples:
                            (args.kodyRule.examples as IKodyRulesExample[]) ||
                            [],
                        origin: KodyRulesOrigin.GENERATED,
                        status: KodyRulesStatus.PENDING,
                        repositoryId: args.kodyRule.repositoryId || 'global',
                        path:
                            (args.kodyRule.scope === KodyRulesScope.FILE
                                ? args.kodyRule.path
                                : '') || '',
                    },
                };

                const result = await this.kodyRulesService.createOrUpdate(
                    params.organizationAndTeamData,
                    params.kodyRule,
                );

                return createToolResponse({
                    success: true,
                    data: result,
                });
            }),
        };
    }

    // Returns all tools in this category
    getAllTools() {
        return [
            this.getKodyRules(),
            this.getKodyRulesRepository(),
            this.createKodyRule(),
        ];
    }
}
