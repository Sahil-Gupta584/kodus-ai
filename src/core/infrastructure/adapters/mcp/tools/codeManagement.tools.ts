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

    // Método que retorna todas as tools desta categoria
    getAllTools() {
        return [
            this.listRepositories(),
            this.listPullRequests(),
            this.listCommits(),
            this.getPullRequestDetails(),
        ];
    }
}
