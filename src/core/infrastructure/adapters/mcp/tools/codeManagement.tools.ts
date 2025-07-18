import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { CodeManagementService } from '../../services/platformIntegration/codeManagement.service';
import { PinoLoggerService } from '../../services/logger/pino.service';
import {
    createToolResponse,
    wrapToolHandler,
    validateArgs,
    logToolInvocation,
    logToolCompletion,
} from '../utils/mcp-protocol.utils';

@Injectable()
export class CodeManagementTools {
    constructor(
        private readonly codeManagementService: CodeManagementService,
        private readonly logger: PinoLoggerService,
    ) {}

    listRepositories() {
        return {
            name: 'list_repositories',
            description:
                'List repositories from the configured code management platform',
            inputSchema: z.object({
                organizationId: z.string().describe('Organization UUID'),
                teamId: z.string().describe('Team UUID'),
                filters: z
                    .object({
                        archived: z.boolean().optional(),
                        private: z.boolean().optional(),
                        language: z.string().optional(),
                    })
                    .optional(),
            }),
            execute: wrapToolHandler(async (args: any) => {
                const params = {
                    organizationAndTeamData: {
                        organizationId: args.organizationId,
                        teamId: args.teamId,
                    },
                    ...args.filters,
                };

                const repositories =
                    await this.codeManagementService.getRepositories(params);

                return {
                    success: true,
                    count: repositories.length,
                    data: repositories,
                };
            }),
        };
    }

    listPullRequests() {
        return {
            name: 'list_pull_requests',
            description: 'List pull requests with filtering options',
            inputSchema: z.object({
                organizationId: z.string().describe('Organization UUID'),
                teamId: z.string().describe('Team UUID'),
                filters: z.object({
                    state: z.enum(['open', 'closed', 'merged']).optional(),
                    repository: z.string().optional(),
                    author: z.string().optional(),
                    startDate: z.string().optional(),
                    endDate: z.string().optional(),
                }),
            }),
            execute: wrapToolHandler(async (args: any) => {
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
                    count: pullRequests.length,
                    data: pullRequests,
                };
            }),
        };
    }

    listCommits() {
        return {
            name: 'list_commits',
            description: 'List commits from repositories',
            inputSchema: z.object({
                organizationId: z.string().describe('Organization UUID'),
                teamId: z.string().describe('Team UUID'),
                repository: z
                    .object({
                        id: z.string(),
                        name: z.string(),
                    })
                    .optional(),
                filters: z
                    .object({
                        since: z.string().optional(),
                        until: z.string().optional(),
                        author: z.string().optional(),
                        branch: z.string().optional(),
                    })
                    .optional(),
            }),
            execute: wrapToolHandler(async (args: any) => {
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
        return {
            name: 'get_pull_request_details',
            description:
                'Get detailed information about a specific pull request',
            inputSchema: z.object({
                organizationId: z.string(),
                teamId: z.string(),
                repository: z.object({
                    id: z.string(),
                    name: z.string(),
                }),
                prNumber: z.number(),
            }),
            execute: wrapToolHandler(async (args: any) => {
                const params = {
                    organizationAndTeamData: {
                        organizationId: args.organizationId,
                        teamId: args.teamId,
                    },
                    repository: args.repository,
                    prNumber: args.prNumber,
                };

                const details =
                    await this.codeManagementService.getPullRequestDetails(
                        params,
                    );

                return {
                    success: true,
                    data: details,
                };
            }),
        };
    }

    getRepositoryFiles() {
        return {
            name: 'get_repository_files',
            description:
                'Get all files from a repository with optional filtering',
            inputSchema: z.object({
                organizationId: z.string(),
                teamId: z.string(),
                repository: z.string(),
                organizationName: z.string(),
                branch: z.string().default('main'),
                filePatterns: z.array(z.string()).optional(),
                excludePatterns: z.array(z.string()).optional(),
                maxFiles: z.number().default(1000),
            }),
            execute: wrapToolHandler(async (args: any) => {
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
            organizationId: z.string(),
            teamId: z.string(),
            repository: z.object({
                id: z.string(),
                name: z.string(),
            }),
            organizationName: z.string(),
            filePath: z.string(),
            branch: z.string().default('main'),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'get_repository_content',
            description: 'Get content of a specific file from repository',
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
        return {
            name: 'get_repository_languages',
            description: 'Get programming languages used in repository',
            inputSchema: z.object({
                organizationId: z.string(),
                teamId: z.string(),
                repository: z.object({
                    id: z.string(),
                    name: z.string(),
                }),
            }),
            execute: wrapToolHandler(async (args: any) => {
                const params = {
                    organizationAndTeamData: {
                        organizationId: args.organizationId,
                        teamId: args.teamId,
                    },
                    repository: args.repository,
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
            organizationId: z.string(),
            teamId: z.string(),
            repository: z.object({
                id: z.string(),
                name: z.string(),
            }),
            prNumber: z.number(),
            filePath: z.string(),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'get_pull_request_file_content',
            description: 'Get content of a specific file in a pull request',
            inputSchema,
            execute: wrapToolHandler(async (args: InputType) => {
                const getPrParams = {
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
                    },
                    prNumber: args.prNumber,
                };

                const pr =
                    await this.codeManagementService.getPullRequestDetails(
                        getPrParams,
                    );

                const fileContentParams = {
                    ...getPrParams,
                    pullRequest: {
                        head: { ref: pr.head.ref },
                        base: { ref: pr.base.ref },
                        branch: pr.head.ref,
                        number: args.prNumber,
                    },
                };

                const fileContent =
                    await this.codeManagementService.getRepositoryContentFile(
                        fileContentParams,
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

    getDiffForFile() {
        const inputSchema = z.object({
            organizationId: z.string(),
            teamId: z.string(),
            repository: z.object({
                id: z.string(),
                name: z.string(),
            }),
            prNumber: z.number(),
            filePath: z.string(),
        });

        type InputType = z.infer<typeof inputSchema>;

        return {
            name: 'get_diff_for_file',
            description: 'Get the diff for a specific file in a pull request',
            inputSchema,
            execute: wrapToolHandler(async (args: InputType) => {
                const params = {
                    organizationAndTeamData: {
                        organizationId: args.organizationId,
                        teamId: args.teamId,
                    },
                    repository: args.repository,
                    prNumber: args.prNumber,
                    filePath: args.filePath,
                };

                const diff =
                    await this.codeManagementService.getDiffForFile(params);

                return {
                    success: true,
                    data: diff,
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
