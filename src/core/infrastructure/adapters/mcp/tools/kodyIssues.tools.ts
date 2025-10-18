import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { wrapToolHandler } from '../utils/mcp-protocol.utils';
import { McpToolDefinition } from '../types/mcp-tool.interface';
import {
    IIssuesService,
    ISSUES_SERVICE_TOKEN,
} from '@/core/domain/issues/contracts/issues.service.contract';
import { LabelType } from '@/shared/utils/codeManagement/labels';
import { SeverityLevel } from '@/shared/utils/enums/severityLevel.enum';
import { IssueStatus } from '@/config/types/general/issues.type';
import { PinoLoggerService } from '../../services/logger/pino.service';
import { IIssue } from '@/core/domain/issues/interfaces/issues.interface';
import { PullRequestsService } from '../../services/pullRequests/pullRequests.service';
import {
    IPullRequestsService,
    PULL_REQUESTS_SERVICE_TOKEN,
} from '@/core/domain/pullRequests/contracts/pullRequests.service.contracts';
import { PlatformType } from '@/shared/domain/enums/platform-type.enum';
import { DeliveryStatus } from '@/core/domain/pullRequests/enums/deliveryStatus.enum';

@Injectable()
export class KodyIssuesTools {
    constructor(
        @Inject(ISSUES_SERVICE_TOKEN)
        private readonly issuesService: IIssuesService,

        @Inject(PULL_REQUESTS_SERVICE_TOKEN)
        private readonly pullRequestsService: IPullRequestsService,

        private readonly logger: PinoLoggerService,
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
                    platformType: z.nativeEnum(PlatformType),
                }),
                owner: z
                    .object({
                        gitId: z
                            .number()
                            .describe('userId of user from git provider'),
                        username: z
                            .string()
                            .describe('username of user from git provider'),
                    })
                    .optional()
                    .describe('Details of pull request author'),
                reporter: z
                    .object({
                        gitId: z.number(),
                        username: z.string(),
                    })
                    .optional()
                    .describe('Details of user who is creating this issue'),
                originalKodyCommentId: z
                    .number()
                    .describe(
                        'commentId of original Kody comment though which the discussion got started ',
                    ),
                pullRequestNumber: z
                    .number()
                    .describe('Pull request number to make issue for'),
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
                    const { organizationId, pullRequestNumber, repository } =
                        args;

                    if (
                        pullRequestNumber === null ||
                        pullRequestNumber === undefined ||
                        !repository?.id
                    ) {
                        this.logger.error({
                            context: KodyIssuesTools.name,
                            message:
                                "Couldn't find pullRequest number or repository to create an issue via MCP",
                            metadata: { organizationId },
                        });
                        return { success: false };
                    }

                    const reporterInput = args.reporter ?? {
                        gitId: 1,
                        username: 'Kody-MCP',
                    };

                    const pullRequest =
                        await this.pullRequestsService.findByNumberAndRepositoryId(
                            pullRequestNumber,
                            repository.id,
                            { organizationId },
                        );

                    if (!pullRequest) {
                        this.logger.error({
                            context: KodyIssuesTools.name,
                            message: `Couldn't found pullRequest #${pullRequestNumber}  to create an issue via mcp`,
                            metadata: { organizationId },
                        });
                        return { success: false };
                    }

                    const owner =
                        pullRequest?.user?.id && pullRequest?.user?.username
                            ? {
                                  gitId: pullRequest.user.id.toString(),
                                  username: pullRequest.user.username,
                              }
                            : undefined;

                    const now = new Date().toISOString();
                    const issueInstance: IIssue = {
                        organizationId,
                        title: args.title,
                        description: args.description,
                        filePath: args.filePath,
                        language: args.language,
                        label: args.label,
                        severity: args.severity,
                        status: IssueStatus.OPEN,
                        repository: {
                            full_name: pullRequest?.repository?.fullName,
                            id: pullRequest?.repository?.id,
                            name: pullRequest?.repository?.name,
                            platform: repository.platformType,
                        },
                        ...(owner && { owner }),
                        reporter: {
                            gitId: reporterInput.gitId?.toString() ?? '1',
                            username: reporterInput.username,
                        },
                        contributingSuggestions: [],
                        createdAt: now,
                        updatedAt: now,
                    };

                    const resolvedPrAuthor = args.owner
                        ? {
                              id: args.owner.gitId?.toString(),
                              name: args.owner.username,
                          }
                        : owner
                          ? {
                                id: owner.gitId,
                                name: owner.username,
                            }
                          : undefined;

                    const suggestionFromArgs =
                        typeof args.originalKodyCommentId !== 'undefined' &&
                        resolvedPrAuthor
                            ? {
                                  id: args.originalKodyCommentId.toString(),
                                  prNumber: pullRequest?.number,
                                  prAuthor: resolvedPrAuthor,
                              }
                            : undefined;

                    if (
                        suggestionFromArgs?.id &&
                        suggestionFromArgs.prNumber &&
                        suggestionFromArgs.prAuthor.id
                    ) {
                        issueInstance.contributingSuggestions.push(
                            suggestionFromArgs,
                        );
                    } else {
                        const suggestion = pullRequest.files
                            ?.flatMap((file) => file.suggestions ?? [])
                            .find(
                                (candidate) =>
                                    candidate.comment?.id ===
                                        args.originalKodyCommentId &&
                                    candidate.deliveryStatus ===
                                        DeliveryStatus.SENT,
                            );

                        if (suggestion?.id && resolvedPrAuthor) {
                            issueInstance.contributingSuggestions.push({
                                id: suggestion.id,
                                prNumber: pullRequest.number,
                                prAuthor: resolvedPrAuthor,
                            });
                        } else {
                            this.logger.error({
                                context: KodyIssuesTools.name,
                                message: `Couldn't found the related suggestionCommentId, skipping to connect issue with suggestion.`,
                                metadata: { organizationId },
                            });
                        }
                    }

                    const issue =
                        await this.issuesService.create(issueInstance);
                    return { success: true, data: issue };
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
                const updated = await this.issuesService.updateStatus(
                    args.issueId,
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
                const updated = await this.issuesService.updateLabel(
                    args.issueId,
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
                const updated = await this.issuesService.updateStatus(
                    args.issueId,
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
