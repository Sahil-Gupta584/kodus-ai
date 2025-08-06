import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { RepositoryTreeType } from '@/shared/utils/enums/repositoryTree.enum';
import { Inject, Injectable } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

export interface TreeItem {
    path: string;
    type: 'file' | 'directory';
    sha: string;
    size?: number;
    url: string;
}

export interface DirectoryStructure {
    name: string;
    path: string;
    files: Array<{ name: string; path: string }>;
    subdirectories: DirectoryStructure[];
}

export interface FileItem {
    name: string;
    path: string;
}

@Injectable()
export class GetRepositoryTreeUseCase implements IUseCase {
    constructor(
        private readonly codeManagementService: CodeManagementService,

        @Inject(REQUEST)
        private readonly request: Request & { user },
        private readonly logger: PinoLoggerService,
    ) {}

    public async execute(params: {
        organizationId: string;
        repositoryId: string;
        treeType?: RepositoryTreeType;
    }) {
        try {
            const repositoryTree =
                await this.codeManagementService.getRepositoryTree({
                    organizationAndTeamData: {
                        organizationId: params.organizationId,
                    },
                    repositoryId: params.repositoryId,
                });

            switch (params.treeType) {
                case RepositoryTreeType.DIRECTORIES:
                    return this.formatDirectoriesOnly(repositoryTree);

                case RepositoryTreeType.FILES:
                    return this.formatFilesOnly(repositoryTree);

                case RepositoryTreeType.ALL:
                default:
                    return this.formatAllTree(repositoryTree);
            }
        } catch (error) {
            this.logger.error({
                message: 'Error while getting repository tree',
                context: GetRepositoryTreeUseCase.name,
                error: error,
                metadata: {
                    organizationId: params.organizationId,
                    repositoryId: params.repositoryId,
                },
            });
            return [];
        }
    }

    private formatAllTree(treeData: TreeItem[]): DirectoryStructure[] {
        const rootDirectories: DirectoryStructure[] = [];
        const directoryMap = new Map<string, DirectoryStructure>();

        // Primeiro, criar todos os diretórios
        treeData
            .filter((item) => item.type === 'directory')
            .forEach((dir) => {
                const pathParts = dir.path.split('/');
                const dirName = pathParts[pathParts.length - 1];

                const directoryStructure: DirectoryStructure = {
                    name: dirName,
                    path: dir.path,
                    files: [],
                    subdirectories: [],
                };

                directoryMap.set(dir.path, directoryStructure);
            });

        // Adicionar arquivos aos diretórios correspondentes
        treeData
            .filter((item) => item.type === 'file')
            .forEach((file) => {
                const pathParts = file.path.split('/');
                const fileName = pathParts[pathParts.length - 1];
                const parentPath = pathParts.slice(0, -1).join('/');

                if (parentPath === '') {
                    // Arquivo na raiz - criar um diretório raiz se necessário
                    let rootDir = rootDirectories.find(
                        (dir) => dir.name === 'root',
                    );
                    if (!rootDir) {
                        rootDir = {
                            name: 'root',
                            path: '',
                            files: [],
                            subdirectories: [],
                        };
                        rootDirectories.push(rootDir);
                    }
                    rootDir.files.push({ name: fileName, path: file.path });
                } else {
                    const parentDir = directoryMap.get(parentPath);
                    if (parentDir) {
                        parentDir.files.push({
                            name: fileName,
                            path: file.path,
                        });
                    }
                }
            });

        // Organizar hierarquia de diretórios
        directoryMap.forEach((dir, path) => {
            const pathParts = path.split('/');
            if (pathParts.length === 1) {
                // Diretório raiz
                rootDirectories.push(dir);
            } else {
                // Subdiretório
                const parentPath = pathParts.slice(0, -1).join('/');
                const parentDir = directoryMap.get(parentPath);
                if (parentDir) {
                    parentDir.subdirectories.push(dir);
                }
            }
        });

        return rootDirectories;
    }

    private formatDirectoriesOnly(treeData: TreeItem[]): DirectoryStructure[] {
        const rootDirectories: DirectoryStructure[] = [];
        const directoryMap = new Map<string, DirectoryStructure>();

        // Criar todos os diretórios
        treeData
            .filter((item) => item.type === 'directory')
            .forEach((dir) => {
                const pathParts = dir.path.split('/');
                const dirName = pathParts[pathParts.length - 1];

                const directoryStructure: DirectoryStructure = {
                    name: dirName,
                    path: dir.path,
                    files: [], // Sempre vazio para directories only
                    subdirectories: [],
                };

                directoryMap.set(dir.path, directoryStructure);
            });

        // Organizar hierarquia de diretórios
        directoryMap.forEach((dir, path) => {
            const pathParts = path.split('/');
            if (pathParts.length === 1) {
                // Diretório raiz
                rootDirectories.push(dir);
            } else {
                // Subdiretório
                const parentPath = pathParts.slice(0, -1).join('/');
                const parentDir = directoryMap.get(parentPath);
                if (parentDir) {
                    parentDir.subdirectories.push(dir);
                }
            }
        });

        return rootDirectories;
    }

    private formatFilesOnly(treeData: TreeItem[]): FileItem[] {
        return treeData
            .filter((item) => item.type === 'file')
            .map((file) => {
                const pathParts = file.path.split('/');
                const fileName = pathParts[pathParts.length - 1];

                return {
                    name: fileName,
                    path: file.path,
                };
            });
    }
}
