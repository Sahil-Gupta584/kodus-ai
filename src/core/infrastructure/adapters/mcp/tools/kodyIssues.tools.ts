import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { wrapToolHandler } from '../utils/mcp-protocol.utils';
import { McpToolDefinition } from '../types/mcp-tool.interface';
import { CreateIssueManuallyUseCase } from '@/core/application/use-cases/issues/create-issue-manually.use-case';
import { UpdateIssuePropertyUseCase } from '@/core/application/use-cases/issues/update-issue-property.use-case';
import {
    IIssuesService,
    ISSUES_SERVICE_TOKEN,
} from '@/core/domain/issues/contracts/issues.service.contract';
import { LabelType } from '@/shared/utils/codeManagement/labels';
import { SeverityLevel } from '@/shared/utils/enums/severityLevel.enum';
import { CreateIssueManuallyDto } from '@/core/infrastructure/http/dtos/create-issue-manually.dto';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { IssueStatus } from '@/config/types/general/issues.type';
import { PinoLoggerService } from '../../services/logger/pino.service';

@Injectable()
export class KodyIssuesTools {
    constructor(
        @Inject(ISSUES_SERVICE_TOKEN)
        private readonly issuesService: IIssuesService,

        private readonly logger: PinoLoggerService,
        private readonly createIssueManuallyUseCase: CreateIssueManuallyUseCase,
        private readonly updateIssuePropertyUseCase: UpdateIssuePropertyUseCase,
    ) {}

    createKodyIssue(): McpToolDefinition {
        const name = 'KODUS_CREATE_KODY_ISSUE';
        const inputSchema = z
            .object({
                organizationId: z.string().describe('Organization ID'),
                title: z.string(),
                description: z.string(),
                filePath: z.string(),
                language: z.string(),
                label: z.nativeEnum(LabelType),
                severity: z.nativeEnum(SeverityLevel),
                repository: z.object({
                    id: z.string(),
                    name: z.string(),
                }),
                owner: z
                    .object({
                        gitId: z.string(),
                        username: z.string(),
                    })
                    .optional()
                    .describe('Details of pull request author'),
                reporter: z
                    .object({
                        gitId: z.string(),
                        username: z.string(),
                    })
                    .optional()
                    .describe('Details of user who is creating this issue'),
            })
            .strict();
        type InputType = z.infer<typeof inputSchema>;

        return {
            name: name,
            description: 'Create a new Kody Issue manually via MCP',
            inputSchema,
            outputSchema: z.object({
                success: z.boolean(),
                data: z.object({}).passthrough(),
            }),
            execute: wrapToolHandler(
                async (args: InputType) => {
                    if (!args.reporter) {
                        args.reporter = {
                            gitId: 'kody',
                            username: 'Kody-MCP',
                        };
                    }

                    // not validating through zod coz its making field optional after parsing
                    const dtoInstance = plainToInstance(
                        CreateIssueManuallyDto,
                        args,
                    );
                    await validateOrReject(dtoInstance);

                    const entity =
                        await this.createIssueManuallyUseCase.execute(
                            dtoInstance,
                        );
                    return { success: true, data: entity };
                },
                name,
                undefined,
                this.logger,
            ),
        };
    }

    listKodyIssues(): McpToolDefinition {
        const inputSchema = z.object({
            organizationId: z.string(),
            repositoryName: z.string().optional(),
            severity: z.nativeEnum(SeverityLevel).optional(),
            label: z.nativeEnum(LabelType).optional(),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'KODUS_LIST_KODY_ISSUES',
            description: 'List Kody Issues with optional filters',
            inputSchema,
            outputSchema: z.object({
                success: z.boolean(),
                count: z.number(),
                data: z.array(z.object({}).passthrough()),
            }),
            execute: wrapToolHandler(async (args: InputType) => {
                const issues = await this.issuesService.findByFilters(args);
                return {
                    success: true,
                    count: issues.length,
                    data: issues,
                };
            }),
        };
    }

    getKodyIssueDetails(): McpToolDefinition {
        const inputSchema = z.object({
            organizationId: z.string().optional(),
            issueId: z.string(),
        });
        type InputType = z.infer<typeof inputSchema>;
        return {
            name: 'KODUS_GET_KODY_ISSUE_DETAILS',
            description: 'Get a Kody Issue by id',
            inputSchema,
            outputSchema: z.object({
                success: z.boolean(),
                data: z.object({}).passthrough().nullable(),
            }),
            execute: wrapToolHandler(async (args: InputType) => {
                const issue = await this.issuesService.findOne({
                    uuid: args.issueId,
                    organizationId: args.organizationId,
                });
                return {
                    success: !!issue,
                    data: issue,
                };
            }),
        };
    }

    updateKodyIssueStatus(): McpToolDefinition {
        const inputSchema = z.object({
            issueId: z.string(),
            status: z.nativeEnum(IssueStatus),
        });
        type InputType = z.infer<typeof inputSchema>;
        return {
            name: 'KODUS_UPDATE_KODY_ISSUE_STATUS',
            description: 'Update issue status',
            inputSchema,
            outputSchema: z.object({
                success: z.boolean(),
                data: z.object({}).passthrough().nullable(),
            }),
            execute: wrapToolHandler(async (args: InputType) => {
                const updated = await this.updateIssuePropertyUseCase.execute(
                    args.issueId,
                    'status',
                    args.status,
                );
                return {
                    success: !!updated,
                    data: updated,
                };
            }),
        };
    }

    updateKodyIssueCategory(): McpToolDefinition {
        const inputSchema = z.object({
            issueId: z.string(),
            label: z.nativeEnum(LabelType),
        });
        type InputType = z.infer<typeof inputSchema>;
        return {
            name: 'KODUS_UPDATE_KODY_ISSUE_CATEGORY',
            description: 'Update issue category/label',
            inputSchema,
            outputSchema: z.object({
                success: z.boolean(),
                data: z.object({}).passthrough().nullable(),
            }),
            execute: wrapToolHandler(async (args: InputType) => {
                const updated = await this.updateIssuePropertyUseCase.execute(
                    args.issueId,
                    'label',
                    args.label,
                );
                return {
                    success: !!updated,
                    data: updated,
                };
            }),
        };
    }

    deleteKodyIssue(): McpToolDefinition {
        const inputSchema = z.object({ issueId: z.string() });
        type InputType = z.infer<typeof inputSchema>;
        return {
            name: 'KODUS_DELETE_KODY_ISSUE',
            description: 'Close/dismiss an issue',
            inputSchema,
            outputSchema: z.object({
                success: z.boolean(),
                data: z.object({}).passthrough().nullable(),
            }),
            execute: wrapToolHandler(async (args: InputType) => {
                const updated = await this.updateIssuePropertyUseCase.execute(
                    args.issueId,
                    'status' as any,
                    IssueStatus.DISMISSED,
                );
                return {
                    success: !!updated,
                    data: updated,
                };
            }),
        };
    }

    getAllTools(): McpToolDefinition[] {
        return [
            this.createKodyIssue(),
            this.listKodyIssues(),
            this.getKodyIssueDetails(),
            this.updateKodyIssueStatus(),
            this.updateKodyIssueCategory(),
            this.deleteKodyIssue(),
        ];
    }
}