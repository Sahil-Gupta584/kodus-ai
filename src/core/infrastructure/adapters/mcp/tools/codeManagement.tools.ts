import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { CodeManagementService } from '../../services/platformIntegration/codeManagement.service';
import { PinoLoggerService } from '../../services/logger/pino.service';
import { wrapToolHandler } from '../utils/mcp-protocol.utils';

@Injectable()
export class CodeManagementTools {
    constructor(
        private readonly codeManagementService: CodeManagementService,
        private readonly logger: PinoLoggerService,
    ) {}

    listRepositories() {
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
            execute: wrapToolHandler(async (args: InputType) => {
                const params = {
                    organizationAndTeamData: {
                        organizationId: args.organizationId,
                        teamId: args.teamId,
                    },
                    ...args.filters,
                };

                const repositories = (
                    await this.codeManagementService.getRepositories(params)
                ).filter((repo) => repo.selected === true);

                return {
                    success: true,
                    count: repositories?.length,
                    data: repositories,
                };
            }),
        };
    }

    listPullRequests() {
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
            execute: wrapToolHandler(async (args: InputType) => {
                const params = {
                    organizationAndTeamData: {
                        organizationId: args.organizationId,
                        teamId: args.teamId,
                    },
                    filters: args.filters,
                };
                const pullRequests =
                    await this.codeManagementService.getPullRequests(params);

                return {
                    success: true,
                    count: pullRequests?.length,
                    data: pullRequests,
                };
            }),
        };
    }

    listCommits() {
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
            execute: wrapToolHandler(async (args: InputType) => {
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
            }),
        };
    }

    getPullRequestDetails() {
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
            execute: wrapToolHandler(async (args: InputType) => {
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

                const files =
                    await this.codeManagementService.getFilesByPullRequestId(
                        params,
                    );

                const prDetails = {
                    ...details,
                    modified_files: files.map((file) => ({
                        filename: file.filename,
                    })),
                };

                return {
                    success: true,
                    data: prDetails,
                };
            }),
        };
    }

    getRepositoryFiles() {
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
            execute: wrapToolHandler(async (args: InputType) => {
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
                    count: files.length,
                    data: files,
                };
            }),
        };
    }

    getRepositoryContent() {
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
            execute: wrapToolHandler(async (args: InputType) => {
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

                const content = fileContent?.data?.content;
                let decodedContent = content;

                if (content && fileContent?.data?.encoding === 'base64') {
                    decodedContent = Buffer.from(content, 'base64').toString(
                        'utf-8',
                    );
                }

                return {
                    success: true,
                    data: decodedContent,
                };
            }),
        };
    }

    getRepositoryLanguages() {
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
            execute: wrapToolHandler(async (args: InputType) => {
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
            }),
        };
    }

    getPullRequestFileContent() {
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
            execute: wrapToolHandler(async (args: InputType) => {
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

                const file = files.find((f) => f.filename === args.filePath);

                return {
                    success: true,
                    data: file.content,
                };
            }),
        };
    }

    getDiffForFile() {
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
            execute: wrapToolHandler(async (args: InputType) => {
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

                const file = files.find((f) => f.filename === params.filePath);

                return {
                    success: true,
                    data: file?.patch,
                };
            }),
        };
    }

    // Método que retorna todas as tools desta categoria
    getAllTools() {
        return [
            this.listRepositories(),
            this.listPullRequests(),
            this.listCommits(),
            this.getPullRequestDetails(),
            this.getRepositoryFiles(),
            this.getRepositoryContent(),
            this.getRepositoryLanguages(),
            this.getPullRequestFileContent(),
            this.getDiffForFile(),
        ];
    }
}
