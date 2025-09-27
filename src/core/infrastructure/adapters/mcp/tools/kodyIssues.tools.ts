import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PinoLoggerService } from '../../services/logger/pino.service';
import { wrapToolHandler } from '../utils/mcp-protocol.utils';
import { McpToolDefinition } from '../types/mcp-tool.interface';
import { CreateIssueManuallyUseCase } from '@/core/application/use-cases/issues/create-issue-manually.use-case';
import { UpdateIssuePropertyUseCase } from '@/core/application/use-cases/issues/update-issue-property.use-case';
import { IIssuesService, ISSUES_SERVICE_TOKEN } from '@/core/domain/issues/contracts/issues.service.contract';
import { LabelType } from '@/shared/utils/codeManagement/labels';
import { SeverityLevel } from '@/shared/utils/enums/severityLevel.enum';
import { GetIssuesByFiltersDto } from '@/core/infrastructure/http/dtos/get-issues-by-filters.dto';

@Injectable()
export class KodyIssuesTools {
    constructor(
        @Inject(ISSUES_SERVICE_TOKEN) private issuesService: IIssuesService,
        private createIssueManuallyUseCase: CreateIssueManuallyUseCase,
        private updateIssuePropertyUseCase: UpdateIssuePropertyUseCase,
    ) {}

    createKodyIssue(): McpToolDefinition {
        const inputSchema = z.object({
            organizationId: z.string().describe('Organization UUID'),
            issue: z.object({
                title: z.string(),
                description: z.string(),
                filePath: z.string(),
                language: z.string(),
                label: z.nativeEnum(LabelType),
                severity: z.nativeEnum(SeverityLevel),
                repository: z.object({
                    id: z.string(),
                    name: z.string(),
                }).passthrough(),
                owner: z
                    .object({ id: z.string(), name: z.string(), email: z.string().email() })
                    .optional(),
            }),
            reporter: z
                .object({ id: z.string(), email: z.string().email(), name: z.string().optional() })
                .optional(),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'KODUS_CREATE_KODY_ISSUE',
            description: 'Create a new Kody Issue manually via MCP',
            inputSchema,
            outputSchema: z.object({ success: z.boolean(), data: z.object({}).passthrough() }),
            execute: wrapToolHandler(async (args: InputType) => {
                const dto = {
                    ...args.issue,
                    organizationId: args.organizationId,
                } as any;

                const user = args.reporter
                    ? { uuid: args.reporter.id, organization: { uuid: args.organizationId }, email: args.reporter.email }
                    : { uuid: 'kody-mcp', organization: { uuid: args.organizationId }, email: 'kody@kodus.io' };

                const entity = await this.createIssueManuallyUseCase.execute(dto as any);
                return { success: true, data: entity.toObject?.() || entity };
            }),
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
            outputSchema: z.object({ success: z.boolean(), count: z.number(), data: z.array(z.object({}).passthrough()) }),
            execute: wrapToolHandler(async (args: InputType) => {
                const filters: GetIssuesByFiltersDto = {
                    organizationId: args.organizationId,
                    ...(args.repositoryName && { repositoryName: args.repositoryName as any }),
                    ...(args.severity && { severity: args.severity as any }),
                    ...(args.label && { label: args.label as any }),
                } as any;
                const issues = await this.issuesService.findByFilters(filters);
                return { success: true, count: issues.length, data: issues.map((i) => i.toObject?.() || i) };
            }),
        };
    }

    getKodyIssueDetails(): McpToolDefinition {
        const inputSchema = z.object({ organizationId: z.string(), issueId: z.string() });
        type InputType = z.infer<typeof inputSchema>;
        return {
            name: 'KODUS_GET_KODY_ISSUE_DETAILS',
            description: 'Get a Kody Issue by id',
            inputSchema,
            outputSchema: z.object({ success: z.boolean(), data: z.object({}).passthrough().nullable() }),
            execute: wrapToolHandler(async (args: InputType) => {
                const issue = await this.issuesService.findById(args.issueId);
                return { success: !!issue, data: issue?.toObject?.() || issue || null };
            }),
        };
    }

    updateKodyIssueStatus(): McpToolDefinition {
        const inputSchema = z.object({ issueId: z.string(), status: z.enum(['open', 'resolved', 'dismissed']) });
        type InputType = z.infer<typeof inputSchema>;
        return {
            name: 'KODUS_UPDATE_KODY_ISSUE_STATUS',
            description: 'Update issue status',
            inputSchema,
            outputSchema: z.object({ success: z.boolean(), data: z.object({}).passthrough().nullable() }),
            execute: wrapToolHandler(async (args: InputType) => {
                const updated = await this.updateIssuePropertyUseCase.execute(args.issueId, 'status' as any, args.status as any);
                return { success: !!updated, data: updated?.toObject?.() || updated || null };
            }),
        };
    }

    updateKodyIssueCategory(): McpToolDefinition {
        const inputSchema = z.object({ issueId: z.string(), label: z.nativeEnum(LabelType) });
        type InputType = z.infer<typeof inputSchema>;
        return {
            name: 'KODUS_UPDATE_KODY_ISSUE_CATEGORY',
            description: 'Update issue category/label',
            inputSchema,
            outputSchema: z.object({ success: z.boolean(), data: z.object({}).passthrough().nullable() }),
            execute: wrapToolHandler(async (args: InputType) => {
                const updated = await this.updateIssuePropertyUseCase.execute(args.issueId, 'label', args.label as any);
                return { success: !!updated, data: updated?.toObject?.() || updated || null };
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
            outputSchema: z.object({ success: z.boolean(), data: z.object({}).passthrough().nullable() }),
            execute: wrapToolHandler(async (args: InputType) => {
                const updated = await this.updateIssuePropertyUseCase.execute(args.issueId, 'status' as any, 'dismissed' as any);
                return { success: !!updated, data: updated?.toObject?.() || updated || null };
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


