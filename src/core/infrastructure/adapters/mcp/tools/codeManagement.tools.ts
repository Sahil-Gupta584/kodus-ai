import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { CodeManagementService } from '../../services/platformIntegration/codeManagement.service';
import { PinoLoggerService } from '../../services/logger/pino.service';
import { wrapToolHandler } from '../utils/mcp-protocol.utils';
import { BaseResponse, McpToolDefinition } from '../types/mcp-tool.interface';
import { Repositories } from '@/core/domain/platformIntegrations/types/codeManagement/repositories.type';
import {
    PullRequests,
    PullRequestDetails as PullRequestDetailsType,
} from '@/core/domain/platformIntegrations/types/codeManagement/pullRequests.type';

const RepositorySchema = z
    .object({
        id: z.string(),
        name: z.string(),
        http_url: z.string(),
        avatar_url: z.string(),
        organizationName: z.string(),
        visibility: z.enum(['public', 'private']),
        selected: z.boolean(),
        default_branch: z.string().optional(),
        project: z
            .object({
                id: z.string(),
                name: z.string(),
            })
            .optional(),
        workspaceId: z.string().optional(),
    })
    .passthrough();

const PullRequestSchema = z
    .object({
        id: z
            .union([z.string(), z.number()])
            .transform((val) => val?.toString()),
        author_id: z
            .union([z.string(), z.number()])
            .optional()
            .transform((val) => val?.toString()),
        author_name: z.string().optional(),
        message: z.string().optional(),
        created_at: z.string().optional(),
        closed_at: z.union([z.string(), z.null()]).optional(),
        targetRefName: z.string().optional(),
        sourceRefName: z.string().optional(),
        state: z.string().optional(),
        organizationId: z.string().optional(),
        pull_number: z.number().optional(),
        repository: z.string().optional(),
        repositoryId: z.string().optional(),
    })
    .passthrough();

const CommitSchema = z.any();

const RepositoryFileSchema = z
    .object({
        path: z.string(),
        content: z.string().optional(),
        sha: z.string().optional(),
        size: z.number().optional(),
        type: z.string().optional(),
        encoding: z.string().optional(),
        filename: z.string().optional(),
    })
    .passthrough();

const PullRequestDetailsSchema = PullRequestSchema.extend({
    prURL: z.union([z.string().url(), z.null()]).optional(),
    number: z.number().optional(),
    body: z.union([z.string(), z.null()]).optional(),
    title: z.union([z.string(), z.null()]).optional(),
    updated_at: z.union([z.string(), z.null()]).optional(),
    merged_at: z.union([z.string(), z.null()]).optional(),

    participants: z
        .array(
            z.object({
                id: z
                    .union([z.string(), z.number()])
                    .transform((val) => val?.toString()),
                approved: z.boolean().optional(),
                state: z.string().optional(),
                type: z.string().optional(),
            }),
        )
        .optional(),

    reviewers: z
        .array(
            z.object({
                id: z
                    .union([z.string(), z.number()])
                    .transform((val) => val?.toString()),
            }),
        )
        .optional(),

    head: z
        .object({
            ref: z.union([z.string(), z.null()]).optional(),
            repo: z
                .object({
                    id: z
                        .union([z.string(), z.number(), z.null()])
                        .optional()
                        .transform((val) => val?.toString()),
                    name: z.union([z.string(), z.null()]).optional(),
                })
                .passthrough(),
        })
        .passthrough()
        .optional(),

    base: z
        .object({
            ref: z.union([z.string(), z.null()]).optional(),
        })
        .passthrough()
        .optional(),

    user: z
        .object({
            login: z.string().optional(),
            name: z.union([z.string(), z.null()]).optional(),
            id: z
                .union([z.string(), z.number(), z.null()])
                .optional()
                .transform((val) => val?.toString()),
        })
        .passthrough()
        .optional(),
}).passthrough();

const PullRequestDetailsWithFilesSchema = PullRequestDetailsSchema.extend({
    modified_files: z
        .array(
            z.object({
                filename: z.string(),
            }),
        )
        .optional(),
}).passthrough();

interface RepositoriesResponse extends BaseResponse {
    data: Repositories[];
}

interface PullRequestsResponse extends BaseResponse {
    data: PullRequests[];
}

interface CommitsResponse extends BaseResponse {
    data: z.infer<typeof CommitSchema>[];
}

interface PullRequestDetailsResponse extends BaseResponse {
    data: PullRequestDetailsType | null;
}

interface RepositoryFilesResponse extends BaseResponse {
    data: z.infer<typeof RepositoryFileSchema>[];
}

interface RepositoryContentResponse extends BaseResponse {
    success: boolean;
    data: string;
}

interface RepositoryLanguagesResponse extends BaseResponse {
    success: boolean;
    data: string;
}
interface PullRequestFileContentResponse extends BaseResponse {
    success: boolean;
    data: string;
}

interface DiffForFileResponse {
    success: boolean;
    data: string;
}

@Injectable()
export class CodeManagementTools {
    constructor(
        private readonly codeManagementService: CodeManagementService,
        private readonly logger: PinoLoggerService,
    ) {}

    listRepositories(): McpToolDefinition {
        const inputSchema = z.object({
            organizationId: z
                .string()
                .describe(
                    'Organization UUID - unique identifier for the organization in the system',
                ),
            teamId: z
                .string()
                .describe(
                    'Team UUID - unique identifier for the team within the organization',
                ),
            filters: z
                .object({
                    archived: z
                        .boolean()
                        .optional()
                        .describe(
                            'Filter by archived status: true (only archived repos), false (only active repos), undefined (all repos)',
                        ),
                    private: z
                        .boolean()
                        .optional()
                        .describe(
                            'Filter by visibility: true (only private repos), false (only public repos), undefined (all repos)',
                        ),
                    language: z
                        .string()
                        .optional()
                        .describe(
                            'Filter by primary programming language (e.g., "JavaScript", "TypeScript", "Python")',
                        ),
                })
                .optional()
                .describe('Optional filters to narrow down repository results'),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'list_repositories',
            description:
                'List all repositories accessible to the team. Use this to discover available repositories, check repository metadata (private/public, archived status, languages), or when you need to see what repositories exist before performing other operations.',
            inputSchema,
            outputSchema: z.object({
                success: z.boolean(),
                count: z.number(),
                data: z.array(RepositorySchema),
            }),
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                destructiveHint: false,
                openWorldHint: true,
            },
            execute: wrapToolHandler(
                async (args: InputType): Promise<RepositoriesResponse> => {
                    const params = {
                        organizationAndTeamData: {
                            organizationId: args.organizationId,
                            teamId: args.teamId,
                        },
                        ...args.filters,
                    };

                    const repositories: Repositories[] = (
                        await this.codeManagementService.getRepositories(params)
                    ).filter((repo) => repo.selected === true);

                    return {
                        success: true,
                        count: repositories?.length,
                        data: repositories,
                    };
                },
                'list_repositories',
                () => ({ success: false, count: 0, data: [] }),
            ),
        };
    }

    listPullRequests(): McpToolDefinition {
        const inputSchema = z.object({
            organizationId: z
                .string()
                .describe(
                    'Organization UUID - unique identifier for the organization in the system',
                ),
            teamId: z
                .string()
                .describe(
                    'Team UUID - unique identifier for the team within the organization',
                ),
            filters: z
                .object({
                    state: z
                        .enum(['open', 'closed', 'merged'])
                        .optional()
                        .describe(
                            'PR state filter: "open" (active PRs awaiting review), "closed" (rejected/abandoned PRs), "merged" (accepted and merged PRs)',
                        ),
                    repository: z
                        .string()
                        .optional()
                        .describe(
                            'Repository name or ID to filter PRs from a specific repository only',
                        ),
                    author: z
                        .string()
                        .optional()
                        .describe(
                            'GitHub username or email to filter PRs created by a specific author',
                        ),
                    startDate: z
                        .string()
                        .optional()
                        .describe(
                            'ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ) to filter PRs created after this date',
                        ),
                    endDate: z
                        .string()
                        .optional()
                        .describe(
                            'ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ) to filter PRs created before this date',
                        ),
                })
                .describe(
                    'Filter criteria to narrow down pull request results',
                ),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'list_pull_requests',
            description:
                'List pull requests with advanced filtering (by state, repository, author, date range). Use this to find specific PRs, analyze PR patterns, or get overview of team activity. Returns PR metadata only - use get_pull_request_details for full PR content.',
            inputSchema,
            outputSchema: z.object({
                success: z.boolean(),
                count: z.number(),
                data: z.array(PullRequestSchema),
            }),
            execute: wrapToolHandler(
                async (args: InputType): Promise<PullRequestsResponse> => {
                    const params = {
                        organizationAndTeamData: {
                            organizationId: args.organizationId,
                            teamId: args.teamId,
                        },
                        filters: args.filters,
                    };
                    const pullRequests =
                        await this.codeManagementService.getPullRequests(
                            params,
                        );

                    return {
                        success: true,
                        count: pullRequests?.length,
                        data: pullRequests,
                    };
                },
            ),
        };
    }

    listCommits(): McpToolDefinition {
        const inputSchema = z.object({
            organizationId: z
                .string()
                .describe(
                    'Organization UUID - unique identifier for the organization in the system',
                ),
            teamId: z
                .string()
                .describe(
                    'Team UUID - unique identifier for the team within the organization',
                ),
            repository: z
                .object({
                    id: z
                        .string()
                        .describe(
                            'Repository unique identifier (UUID or platform-specific ID)',
                        ),
                    name: z
                        .string()
                        .describe(
                            'Repository name (e.g., "my-awesome-project")',
                        ),
                })
                .optional()
                .describe(
                    'Specific repository to get commits from. If not provided, gets commits from all accessible repositories',
                ),
            filters: z
                .object({
                    since: z
                        .string()
                        .optional()
                        .describe(
                            'ISO date string (YYYY-MM-DDTHH:mm:ssZ) to get commits created after this date',
                        ),
                    until: z
                        .string()
                        .optional()
                        .describe(
                            'ISO date string (YYYY-MM-DDTHH:mm:ssZ) to get commits created before this date',
                        ),
                    author: z
                        .string()
                        .optional()
                        .describe(
                            'Git author name or email to filter commits by specific contributor',
                        ),
                    branch: z
                        .string()
                        .optional()
                        .describe(
                            'Branch name to get commits from (e.g., "main", "develop", "feature/new-feature")',
                        ),
                })
                .optional()
                .describe(
                    'Optional filters to narrow down commit history results',
                ),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'list_commits',
            description:
                'List commit history from repositories with filtering by author, date range, or branch. Use this to analyze commit patterns, find specific commits, or track development activity. Returns commit metadata and messages.',
            inputSchema,
            outputSchema: z.object({
                success: z.boolean(),
                count: z.number(),
                data: z.array(CommitSchema),
            }),
            execute: wrapToolHandler(
                async (args: InputType): Promise<CommitsResponse> => {
                    const params = {
                        organizationAndTeamData: {
                            organizationId: args.organizationId,
                            teamId: args.teamId,
                        },
                        repository: args.repository,
                        ...args.filters,
                    };
                    const commits =
                        await this.codeManagementService.getCommits(params);

                    return {
                        success: true,
                        count: commits.length,
                        data: commits,
                    };
                },
            ),
        };
    }

    getPullRequestDetails(): McpToolDefinition {
        const inputSchema = z.object({
            organizationId: z
                .string()
                .describe(
                    'Organization UUID - unique identifier for the organization in the system',
                ),
            teamId: z
                .string()
                .describe(
                    'Team UUID - unique identifier for the team within the organization',
                ),
            repository: z
                .object({
                    id: z
                        .string()
                        .describe(
                            'Repository unique identifier (UUID or platform-specific ID)',
                        ),
                    name: z
                        .string()
                        .describe(
                            'Repository name (e.g., "my-awesome-project")',
                        ),
                })
                .describe(
                    'Repository information where the pull request is located',
                ),
            prNumber: z
                .number()
                .describe(
                    'Pull request number (e.g., 123 for PR #123) - the sequential number assigned by the platform',
                ),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'get_pull_request_details',
            description:
                'Get complete details of a specific pull request including description, commits, reviews, and list of modified files. Use this when you need full PR context - NOT for file content (use get_pull_request_file_content for that).',
            inputSchema,
            outputSchema: z.object({
                success: z.boolean(),
                count: z.number(),
                data: z.union([PullRequestDetailsWithFilesSchema, z.null()]),
            }),
            execute: wrapToolHandler(
                async (
                    args: InputType,
                ): Promise<PullRequestDetailsResponse> => {
                    const params = {
                        organizationAndTeamData: {
                            organizationId: args.organizationId,
                            teamId: args.teamId,
                        },
                        repository: {
                            id: args.repository.id || args.repository.name,
                            name: args.repository.name || args.repository.id,
                        },
                        prNumber: args.prNumber,
                    };

                    const details =
                        await this.codeManagementService.getPullRequestDetails(
                            params,
                        );

                    if (!details) {
                        return {
                            success: false,
                            count: 0,
                            data: null,
                        };
                    }

                    const files =
                        await this.codeManagementService.getFilesByPullRequestId(
                            params,
                        );

                    const prDetails = {
                        ...details,
                        modified_files:
                            files?.map((file) => ({
                                filename: file.filename,
                            })) || [],
                    };

                    return {
                        success: true,
                        count: 1,
                        data: prDetails,
                    };
                },
            ),
        };
    }

    getRepositoryFiles(): McpToolDefinition {
        const inputSchema = z.object({
            organizationId: z
                .string()
                .describe(
                    'Organization UUID - unique identifier for the organization in the system',
                ),
            teamId: z
                .string()
                .describe(
                    'Team UUID - unique identifier for the team within the organization',
                ),
            repository: z
                .string()
                .describe('Repository name or identifier to get files from'),
            organizationName: z
                .string()
                .describe(
                    'Organization name as it appears in the code management platform (e.g., GitHub org name)',
                ),
            branch: z
                .string()
                .default('main')
                .describe(
                    'Branch name to get files from (defaults to "main" if not specified)',
                ),
            filePatterns: z
                .array(z.string())
                .optional()
                .describe(
                    'Array of glob patterns to include specific files (e.g., ["*.ts", "src/**/*.js"])',
                ),
            excludePatterns: z
                .array(z.string())
                .optional()
                .describe(
                    'Array of glob patterns to exclude files (e.g., ["node_modules/**", "*.log"])',
                ),
            maxFiles: z
                .number()
                .default(1000)
                .describe(
                    'Maximum number of files to return (defaults to 1000 to prevent overwhelming responses)',
                ),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'get_repository_files',
            description:
                'Get file tree/listing from a repository branch with pattern filtering. Use this to explore repository structure, find specific files by pattern, or get overview of codebase organization. Returns file paths only - NOT file content.',
            inputSchema,
            outputSchema: z.object({
                success: z.boolean(),
                count: z.number(),
                data: z.array(RepositoryFileSchema),
            }),
            execute: wrapToolHandler(
                async (args: InputType): Promise<RepositoryFilesResponse> => {
                    const params = {
                        repository: args.repository,
                        organizationName: args.organizationName,
                        branch: args.branch,
                        organizationAndTeamData: {
                            organizationId: args.organizationId,
                            teamId: args.teamId,
                        },
                        filePatterns: args.filePatterns,
                        excludePatterns: args.excludePatterns,
                        maxFiles: args.maxFiles,
                    };
                    const files =
                        await this.codeManagementService.getRepositoryAllFiles(
                            params,
                        );

                    return {
                        success: true,
                        count: files?.length ?? 0,
                        data: files,
                    };
                },
            ),
        };
    }

    getRepositoryContent(): McpToolDefinition {
        const inputSchema = z.object({
            organizationId: z
                .string()
                .describe(
                    'Organization UUID - unique identifier for the organization in the system',
                ),
            teamId: z
                .string()
                .describe(
                    'Team UUID - unique identifier for the team within the organization',
                ),
            repository: z
                .object({
                    id: z
                        .string()
                        .describe(
                            'Repository unique identifier (UUID or platform-specific ID)',
                        ),
                    name: z
                        .string()
                        .describe(
                            'Repository name (e.g., "my-awesome-project")',
                        ),
                })
                .describe('Repository information where the file is located'),
            organizationName: z
                .string()
                .describe(
                    'Organization name as it appears in the code management platform (e.g., GitHub org name)',
                ),
            filePath: z
                .string()
                .describe(
                    'Full path to the file within the repository (e.g., "src/components/Button.tsx", "README.md")',
                ),
            branch: z
                .string()
                .default('main')
                .describe(
                    'Branch name to get the file from (defaults to "main" if not specified)',
                ),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'get_repository_content',
            description:
                'Get the current content of a specific file from a repository branch. Use this to read files from the main/current branch - NOT from pull requests (use get_pull_request_file_content for PR files).',
            inputSchema,
            outputSchema: z.object({
                success: z.boolean(),
                data: z.string(),
            }),
            execute: wrapToolHandler(
                async (args: InputType): Promise<RepositoryContentResponse> => {
                    const params = {
                        organizationAndTeamData: {
                            organizationId: args.organizationId,
                            teamId: args.teamId,
                        },
                        repository: {
                            id: args.repository.id || args.repository.name,
                            name: args.repository.name || args.repository.id,
                        },
                        file: {
                            path: args.filePath,
                            filename: args.filePath,
                            organizationName: args.organizationName,
                        },
                        pullRequest: {
                            head: { ref: args.branch },
                            base: { ref: args.branch },
                            branch: args.branch,
                        },
                    };

                    const fileContent =
                        await this.codeManagementService.getRepositoryContentFile(
                            params,
                        );

                    const content =
                        fileContent?.data?.content ?? 'NOT FIND CONTENT';
                    let decodedContent = content;

                    if (content && fileContent?.data?.encoding === 'base64') {
                        decodedContent = Buffer.from(
                            content,
                            'base64',
                        ).toString('utf-8');
                    }

                    return {
                        success: true,
                        data: decodedContent,
                    };
                },
            ),
        };
    }

    getRepositoryLanguages(): McpToolDefinition {
        const inputSchema = z.object({
            organizationId: z
                .string()
                .describe(
                    'Organization UUID - unique identifier for the organization in the system',
                ),
            teamId: z
                .string()
                .describe(
                    'Team UUID - unique identifier for the team within the organization',
                ),
            repository: z
                .object({
                    id: z
                        .string()
                        .describe(
                            'Repository unique identifier (UUID or platform-specific ID)',
                        ),
                    name: z
                        .string()
                        .describe(
                            'Repository name (e.g., "my-awesome-project")',
                        ),
                })
                .describe(
                    'Repository information to analyze language distribution',
                ),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'get_repository_languages',
            description:
                'Get programming languages breakdown and statistics for a repository. Use this to understand technology stack, language distribution, or filter repositories by technology.',
            inputSchema,
            outputSchema: z.object({
                success: z.boolean(),
                data: z.string(),
            }),
            execute: wrapToolHandler(
                async (
                    args: InputType,
                ): Promise<RepositoryLanguagesResponse> => {
                    const params = {
                        organizationAndTeamData: {
                            organizationId: args.organizationId,
                            teamId: args.teamId,
                        },
                        repository: {
                            id: args.repository.id || args.repository.name,
                            name: args.repository.name || args.repository.id,
                        },
                    };
                    const languages =
                        await this.codeManagementService.getLanguageRepository(
                            params,
                        );

                    return {
                        success: true,
                        data: languages,
                    };
                },
            ),
        };
    }

    getPullRequestFileContent(): McpToolDefinition {
        const inputSchema = z.object({
            organizationId: z
                .string()
                .describe(
                    'Organization UUID - unique identifier for the organization in the system',
                ),
            teamId: z
                .string()
                .describe(
                    'Team UUID - unique identifier for the team within the organization',
                ),
            repository: z
                .object({
                    id: z
                        .string()
                        .describe(
                            'Repository unique identifier (UUID or platform-specific ID)',
                        ),
                    name: z
                        .string()
                        .describe(
                            'Repository name (e.g., "my-awesome-project")',
                        ),
                })
                .describe(
                    'Repository information where the pull request is located',
                ),
            prNumber: z
                .number()
                .describe(
                    'Pull request number (e.g., 123 for PR #123) - the sequential number assigned by the platform',
                ),
            filePath: z
                .string()
                .describe(
                    'Full path to the file within the repository as it appears in the PR (e.g., "src/components/Button.tsx")',
                ),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'get_pull_request_file_content',
            description:
                'Get the modified content of a specific file within a pull request context. Use this to read how a file looks AFTER the PR changes are applied - NOT the original version.',
            inputSchema,
            outputSchema: z.object({
                success: z.boolean(),
                data: z.string(),
            }),
            execute: wrapToolHandler(
                async (
                    args: InputType,
                ): Promise<PullRequestFileContentResponse> => {
                    const params = {
                        organizationAndTeamData: {
                            organizationId: args.organizationId,
                            teamId: args.teamId,
                        },
                        repository: {
                            id: args.repository.id || args.repository.name,
                            name: args.repository.name || args.repository.id,
                        },
                        prNumber: args.prNumber,
                    };

                    const files =
                        await this.codeManagementService.getFilesByPullRequestId(
                            params,
                        );

                    const file = files.find(
                        (f) => f.filename === args.filePath,
                    );

                    if (!file) {
                        return {
                            success: false,
                            data: 'NOT FIND CONTENT',
                        };
                    }

                    const pullRequest =
                        await this.codeManagementService.getPullRequestByNumber(
                            params,
                        );

                    if (!pullRequest) {
                        return {
                            success: false,
                            data: 'NOT FIND CONTENT',
                        };
                    }

                    const fileContent =
                        await this.codeManagementService.getRepositoryContentFile(
                            {
                                organizationAndTeamData:
                                    params.organizationAndTeamData,
                                repository: params.repository,
                                file: { filename: file.filename },
                                pullRequest: {
                                    branch: pullRequest.head.ref,
                                    head: { ref: pullRequest.head.ref },
                                    base: { ref: pullRequest.base.ref },
                                },
                            },
                        );

                    const content =
                        fileContent?.data?.content ?? 'NOT FIND CONTENT';
                    let decodedContent = content;

                    if (content && fileContent?.data?.encoding === 'base64') {
                        decodedContent = Buffer.from(
                            content,
                            'base64',
                        ).toString('utf-8');
                    }

                    return {
                        success: true,
                        data: decodedContent,
                    };
                },
            ),
        };
    }

    getDiffForFile(): McpToolDefinition {
        const inputSchema = z.object({
            organizationId: z
                .string()
                .describe(
                    'Organization UUID - unique identifier for the organization in the system',
                ),
            teamId: z
                .string()
                .describe(
                    'Team UUID - unique identifier for the team within the organization',
                ),
            repository: z
                .object({
                    id: z
                        .string()
                        .describe(
                            'Repository unique identifier (UUID or platform-specific ID)',
                        ),
                    name: z
                        .string()
                        .describe(
                            'Repository name (e.g., "my-awesome-project")',
                        ),
                })
                .describe(
                    'Repository information where the pull request is located',
                ),
            prNumber: z
                .number()
                .describe(
                    'Pull request number (e.g., 123 for PR #123) - the sequential number assigned by the platform',
                ),
            filePath: z
                .string()
                .describe(
                    'Full path to the file within the repository to get diff for (e.g., "src/components/Button.tsx")',
                ),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'get_diff_for_file',
            description:
                'Get the exact diff/patch showing what changed in a specific file within a pull request. Use this to see the precise changes made - additions, deletions, and modifications line by line.',
            inputSchema,
            outputSchema: z.object({
                success: z.boolean(),
                data: z.string(),
            }),
            execute: wrapToolHandler(
                async (args: InputType): Promise<DiffForFileResponse> => {
                    const params = {
                        organizationAndTeamData: {
                            organizationId: args.organizationId,
                            teamId: args.teamId,
                        },
                        repository: {
                            id: args.repository.id || args.repository.name,
                            name: args.repository.name || args.repository.id,
                        },
                        prNumber: args.prNumber,
                        filePath: args.filePath,
                    };

                    const files =
                        await this.codeManagementService.getFilesByPullRequestId(
                            params,
                        );

                    const file = files.find(
                        (f) => f.filename === params.filePath,
                    );

                    return {
                        success: true,
                        data: file?.patch,
                    };
                },
            ),
        };
    }

    getAllTools(): McpToolDefinition[] {
        return [
            this.listRepositories(),
            this.listPullRequests(),
            this.listCommits(),
            this.getPullRequestDetails(),
            this.getRepositoryFiles(),
            this.getRepositoryContent(),
            //TODO: Uncomment this when we have a way to get the languages
            //this.getRepositoryLanguages(),
            this.getPullRequestFileContent(),
            this.getDiffForFile(),
        ];
    }
}
