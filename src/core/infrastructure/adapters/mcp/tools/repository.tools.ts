import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { CodeManagementService } from '../../services/platformIntegration/codeManagement.service';
import { PinoLoggerService } from '../../services/logger/pino.service';
import { createToolResponse, wrapToolHandler } from '../utils';

@Injectable()
export class RepositoryTools {
    constructor(
        private readonly codeManagementService: CodeManagementService,
        private readonly logger: PinoLoggerService,
    ) {}


    getRepositoryFiles() {
        return {
            name: 'get_repository_files',
            description: 'Get all files from a repository with optional filtering',
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
                    organizationAndTeamData: { organizationId: args.organizationId, teamId: args.teamId },
                    filePatterns: args.filePatterns,
                    excludePatterns: args.excludePatterns,
                    maxFiles: args.maxFiles,
                };
                const files = await this.codeManagementService.getRepositoryAllFiles(params);
                
                return {
                    success: true,
                    count: files.length,
                    data: files,
                };
            })
        };
    }

    getRepositoryContent() {
        return {
            name: 'get_repository_content',
            description: 'Get content of a specific file from repository',
            inputSchema: z.object({
                organizationId: z.string(),
                teamId: z.string(),
                repository: z.string(),
                organizationName: z.string(),
                filePath: z.string(),
                branch: z.string().default('main'),
            }),
            execute: wrapToolHandler(async (args: any) => {
                const params = {
                    organizationAndTeamData: { organizationId: args.organizationId, teamId: args.teamId },
                    repository: { name: args.repository, id: args.repository },
                    file: { path: args.filePath, organizationName: args.organizationName },
                    pullRequest: { branch: args.branch },
                };
                const content = await this.codeManagementService.getRepositoryContentFile(params);
                
                return {
                    success: true,
                    data: content,
                };
            })
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
                    organizationAndTeamData: { organizationId: args.organizationId, teamId: args.teamId },
                    repository: args.repository,
                };
                const languages = await this.codeManagementService.getLanguageRepository(params);
                
                return {
                    success: true,
                    data: languages,
                };
            })
        };
    }

    // Método que retorna todas as tools desta categoria
    getAllTools() {
        return [
            this.getRepositoryFiles(),
            this.getRepositoryContent(),
            this.getRepositoryLanguages(),
        ];
    }
}
