jest.mock('@kodus/flow', () => ({
    getObservability: jest.fn().mockReturnValue({
        getTracer: jest.fn().mockReturnValue({
            startSpan: jest.fn().mockReturnValue({
                end: jest.fn(),
                setAttribute: jest.fn(),
                setAttributes: jest.fn(),
            }),
        }),
    }),
    IdGenerator: {
        generate: jest.fn().mockReturnValue('mock-id'),
    },
}));

jest.mock('@/shared/utils/crypto', () => ({
    encrypt: jest.fn((text) => `encrypted_${text}`),
    decrypt: jest.fn((text) => text.replace('encrypted_', '')),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ExternalReferenceDetectorService } from '@/core/infrastructure/adapters/services/kodyRules/externalReferenceDetector.service';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { ObservabilityService } from '@/core/infrastructure/adapters/services/logger/observability.service';
import { PromptRunnerService } from '@kodus/kodus-common/llm';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';

describe('ExternalReferenceDetectorService', () => {
    let service: ExternalReferenceDetectorService;
    let mockCodeManagementService: jest.Mocked<CodeManagementService>;
    let mockPromptRunnerService: jest.Mocked<PromptRunnerService>;
    let mockObservabilityService: jest.Mocked<ObservabilityService>;
    let mockLogger: jest.Mocked<PinoLoggerService>;

    const mockOrganizationAndTeamData: OrganizationAndTeamData = {
        organizationId: 'org-123',
        teamId: 'team-456',
    };

    beforeEach(async () => {
        mockCodeManagementService = {
            getRepositoryAllFiles: jest.fn(),
        } as any;

        mockPromptRunnerService = {} as any;

        mockObservabilityService = {
            runLLMInSpan: jest.fn().mockImplementation(async ({ exec }) => {
                const mockCallbacks = [];
                return { result: await exec(mockCallbacks) };
            }),
        } as any;

        mockLogger = {
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ExternalReferenceDetectorService,
                {
                    provide: PromptRunnerService,
                    useValue: mockPromptRunnerService,
                },
                {
                    provide: ObservabilityService,
                    useValue: mockObservabilityService,
                },
                {
                    provide: CodeManagementService,
                    useValue: mockCodeManagementService,
                },
                {
                    provide: PinoLoggerService,
                    useValue: mockLogger,
                },
            ],
        }).compile();

        service = module.get<ExternalReferenceDetectorService>(
            ExternalReferenceDetectorService,
        );
    });

    describe('detectAndResolveReferences', () => {
        it('should detect and resolve CODEOWNERS file', async () => {
            const mockPromptBuilder = {
                setParser: jest.fn().mockReturnThis(),
                setLLMJsonMode: jest.fn().mockReturnThis(),
                setPayload: jest.fn().mockReturnThis(),
                addPrompt: jest.fn().mockReturnThis(),
                addCallbacks: jest.fn().mockReturnThis(),
                addMetadata: jest.fn().mockReturnThis(),
                setRunName: jest.fn().mockReturnThis(),
                execute: jest.fn().mockResolvedValue({
                    references: [
                        {
                            fileName: 'CODEOWNERS',
                            description: 'file ownership mapping',
                        },
                    ],
                }),
            };

            mockObservabilityService.runLLMInSpan.mockImplementation(
                async ({ exec }) => {
                    const mockRunner = {
                        builder: jest.fn().mockReturnValue(mockPromptBuilder),
                    };
                    return { result: await exec([]) };
                },
            );

            mockCodeManagementService.getRepositoryAllFiles.mockResolvedValue([
                { path: '.github/CODEOWNERS', size: 100, sha: 'abc123' },
            ] as any);

            const result = await service.detectAndResolveReferences({
                ruleText: 'All files must have owner in CODEOWNERS',
                repositoryId: 'repo-123',
                organizationAndTeamData: mockOrganizationAndTeamData,
            });

            expect(result).toEqual([
                {
                    filePath: '.github/CODEOWNERS',
                    description: 'file ownership mapping',
                },
            ]);

            expect(mockCodeManagementService.getRepositoryAllFiles).toHaveBeenCalledWith({
                organizationAndTeamData: mockOrganizationAndTeamData,
                repository: { id: 'repo-123', name: '' },
                filters: {
                    filePatterns: ['**/CODEOWNERS'],
                    maxFiles: 10,
                },
            });
        });

        it('should handle multiple references in rule text', async () => {
            const mockPromptBuilder = {
                setParser: jest.fn().mockReturnThis(),
                setLLMJsonMode: jest.fn().mockReturnThis(),
                setPayload: jest.fn().mockReturnThis(),
                addPrompt: jest.fn().mockReturnThis(),
                addCallbacks: jest.fn().mockReturnThis(),
                addMetadata: jest.fn().mockReturnThis(),
                setRunName: jest.fn().mockReturnThis(),
                execute: jest.fn().mockResolvedValue({
                    references: [
                        {
                            fileName: 'CODEOWNERS',
                        },
                        {
                            fileName: 'UserRole.enum.ts',
                        },
                    ],
                }),
            };

            mockObservabilityService.runLLMInSpan.mockImplementation(
                async ({ exec }) => {
                    return { result: await exec([]) };
                },
            );

            mockCodeManagementService.getRepositoryAllFiles
                .mockResolvedValueOnce([
                    { path: '.github/CODEOWNERS', size: 100 },
                ] as any)
                .mockResolvedValueOnce([
                    { path: 'src/types/UserRole.enum.ts', size: 200 },
                ] as any);

            const result = await service.detectAndResolveReferences({
                ruleText:
                    'Check CODEOWNERS and validate enum values from UserRole.enum.ts',
                repositoryId: 'repo-123',
                organizationAndTeamData: mockOrganizationAndTeamData,
            });

            expect(result).toHaveLength(2);
            expect(result[0].filePath).toBe('.github/CODEOWNERS');
            expect(result[1].filePath).toBe('src/types/UserRole.enum.ts');
        });

        it('should return empty array when LLM detects no references', async () => {
            const mockPromptBuilder = {
                setParser: jest.fn().mockReturnThis(),
                setLLMJsonMode: jest.fn().mockReturnThis(),
                setPayload: jest.fn().mockReturnThis(),
                addPrompt: jest.fn().mockReturnThis(),
                addCallbacks: jest.fn().mockReturnThis(),
                addMetadata: jest.fn().mockReturnThis(),
                setRunName: jest.fn().mockReturnThis(),
                execute: jest.fn().mockResolvedValue({
                    references: [],
                }),
            };

            mockObservabilityService.runLLMInSpan.mockImplementation(
                async ({ exec }) => {
                    return { result: await exec([]) };
                },
            );

            const result = await service.detectAndResolveReferences({
                ruleText: 'Use const instead of let',
                repositoryId: 'repo-123',
                organizationAndTeamData: mockOrganizationAndTeamData,
            });

            expect(result).toEqual([]);
            expect(
                mockCodeManagementService.getRepositoryAllFiles,
            ).not.toHaveBeenCalled();
        });

        it('should return empty array when file not found in repository', async () => {
            const mockPromptBuilder = {
                setParser: jest.fn().mockReturnThis(),
                setLLMJsonMode: jest.fn().mockReturnThis(),
                setPayload: jest.fn().mockReturnThis(),
                addPrompt: jest.fn().mockReturnThis(),
                addCallbacks: jest.fn().mockReturnThis(),
                addMetadata: jest.fn().mockReturnThis(),
                setRunName: jest.fn().mockReturnThis(),
                execute: jest.fn().mockResolvedValue({
                    references: [
                        {
                            fileName: 'NonExistent.ts',
                            fileType: 'other',
                        },
                    ],
                }),
            };

            mockObservabilityService.runLLMInSpan.mockImplementation(
                async ({ exec }) => {
                    return { result: await exec([]) };
                },
            );

            mockCodeManagementService.getRepositoryAllFiles.mockResolvedValue([]);

            const result = await service.detectAndResolveReferences({
                ruleText: 'Check NonExistent.ts',
                repositoryId: 'repo-123',
                organizationAndTeamData: mockOrganizationAndTeamData,
            });

            expect(result).toEqual([]);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'No files found for external reference',
                }),
            );
        });

        it('should handle search errors gracefully', async () => {
            const mockPromptBuilder = {
                setParser: jest.fn().mockReturnThis(),
                setLLMJsonMode: jest.fn().mockReturnThis(),
                setPayload: jest.fn().mockReturnThis(),
                addPrompt: jest.fn().mockReturnThis(),
                addCallbacks: jest.fn().mockReturnThis(),
                addMetadata: jest.fn().mockReturnThis(),
                setRunName: jest.fn().mockReturnThis(),
                execute: jest.fn().mockResolvedValue({
                    references: [
                        {
                            fileName: 'CODEOWNERS',
                            fileType: 'codeowners',
                        },
                    ],
                }),
            };

            mockObservabilityService.runLLMInSpan.mockImplementation(
                async ({ exec }) => {
                    return { result: await exec([]) };
                },
            );

            mockCodeManagementService.getRepositoryAllFiles.mockRejectedValue(
                new Error('API error'),
            );

            const result = await service.detectAndResolveReferences({
                ruleText: 'Check CODEOWNERS',
                repositoryId: 'repo-123',
                organizationAndTeamData: mockOrganizationAndTeamData,
            });

            expect(result).toEqual([]);
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Error searching for external reference file',
                }),
            );
        });

        it('should handle partial file paths correctly', async () => {
            const mockPromptBuilder = {
                setParser: jest.fn().mockReturnThis(),
                setLLMJsonMode: jest.fn().mockReturnThis(),
                setPayload: jest.fn().mockReturnThis(),
                addPrompt: jest.fn().mockReturnThis(),
                addCallbacks: jest.fn().mockReturnThis(),
                addMetadata: jest.fn().mockReturnThis(),
                setRunName: jest.fn().mockReturnThis(),
                execute: jest.fn().mockResolvedValue({
                    references: [
                    {
                        fileName: 'types/UserRole.enum.ts',
                    },
                    ],
                }),
            };

            mockObservabilityService.runLLMInSpan.mockImplementation(
                async ({ exec }) => {
                    return { result: await exec([]) };
                },
            );

            mockCodeManagementService.getRepositoryAllFiles.mockResolvedValue([
                { path: 'src/types/UserRole.enum.ts', size: 150 },
            ] as any);

            const result = await service.detectAndResolveReferences({
                ruleText: 'Validate against types/UserRole.enum.ts',
                repositoryId: 'repo-123',
                organizationAndTeamData: mockOrganizationAndTeamData,
            });

            expect(result[0].filePath).toBe('src/types/UserRole.enum.ts');
            expect(mockCodeManagementService.getRepositoryAllFiles).toHaveBeenCalledWith(
                expect.objectContaining({
                    filters: expect.objectContaining({
                        filePatterns: ['**/types/UserRole.enum.ts'],
                    }),
                }),
            );
        });

        it('should use custom filePattern when provided by LLM', async () => {
            const mockPromptBuilder = {
                setParser: jest.fn().mockReturnThis(),
                setLLMJsonMode: jest.fn().mockReturnThis(),
                setPayload: jest.fn().mockReturnThis(),
                addPrompt: jest.fn().mockReturnThis(),
                addCallbacks: jest.fn().mockReturnThis(),
                addMetadata: jest.fn().mockReturnThis(),
                setRunName: jest.fn().mockReturnThis(),
                execute: jest.fn().mockResolvedValue({
                    references: [
                        {
                            fileName: 'UserRole.enum.ts',
                            filePattern: '**/*.enum.ts',
                        },
                    ],
                }),
            };

            mockObservabilityService.runLLMInSpan.mockImplementation(
                async ({ exec }) => {
                    return { result: await exec([]) };
                },
            );

            mockCodeManagementService.getRepositoryAllFiles.mockResolvedValue([
                { path: 'src/types/UserRole.enum.ts', size: 150 },
                { path: 'src/models/Status.enum.ts', size: 100 },
            ] as any);

            const result = await service.detectAndResolveReferences({
                ruleText: 'Check all enum files',
                repositoryId: 'repo-123',
                organizationAndTeamData: mockOrganizationAndTeamData,
            });

            expect(result).toHaveLength(2);
            expect(mockCodeManagementService.getRepositoryAllFiles).toHaveBeenCalledWith(
                expect.objectContaining({
                    filters: expect.objectContaining({
                        filePatterns: expect.arrayContaining(['**/*.enum.ts']),
                    }),
                }),
            );
        });

        it('should handle LLM errors gracefully', async () => {
            mockObservabilityService.runLLMInSpan.mockRejectedValue(
                new Error('LLM timeout'),
            );

            const result = await service.detectAndResolveReferences({
                ruleText: 'Check CODEOWNERS',
                repositoryId: 'repo-123',
                organizationAndTeamData: mockOrganizationAndTeamData,
            });

            expect(result).toEqual([]);
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Error calling LLM for reference detection',
                }),
            );
        });

        it('should handle invalid LLM response schema', async () => {
            const mockPromptBuilder = {
                setParser: jest.fn().mockReturnThis(),
                setLLMJsonMode: jest.fn().mockReturnThis(),
                setPayload: jest.fn().mockReturnThis(),
                addPrompt: jest.fn().mockReturnThis(),
                addCallbacks: jest.fn().mockReturnThis(),
                addMetadata: jest.fn().mockReturnThis(),
                setRunName: jest.fn().mockReturnThis(),
                execute: jest.fn().mockResolvedValue({
                    invalid: 'response',
                }),
            };

            mockObservabilityService.runLLMInSpan.mockImplementation(
                async ({ exec }) => {
                    return { result: await exec([]) };
                },
            );

            const result = await service.detectAndResolveReferences({
                ruleText: 'Check CODEOWNERS',
                repositoryId: 'repo-123',
                organizationAndTeamData: mockOrganizationAndTeamData,
            });

            expect(result).toEqual([]);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Failed to parse detected references',
                }),
            );
        });

        it('should limit results to maxFiles', async () => {
            const mockPromptBuilder = {
                setParser: jest.fn().mockReturnThis(),
                setLLMJsonMode: jest.fn().mockReturnThis(),
                setPayload: jest.fn().mockReturnThis(),
                addPrompt: jest.fn().mockReturnThis(),
                addCallbacks: jest.fn().mockReturnThis(),
                addMetadata: jest.fn().mockReturnThis(),
                setRunName: jest.fn().mockReturnThis(),
                execute: jest.fn().mockResolvedValue({
                    references: [
                        {
                            fileName: '*.ts',
                            filePattern: '**/*.ts',
                        },
                    ],
                }),
            };

            mockObservabilityService.runLLMInSpan.mockImplementation(
                async ({ exec }) => {
                    return { result: await exec([]) };
                },
            );

            mockCodeManagementService.getRepositoryAllFiles.mockResolvedValue(
                Array.from({ length: 15 }, (_, i) => ({
                    path: `file${i}.ts`,
                    size: 100,
                })) as any,
            );

            const result = await service.detectAndResolveReferences({
                ruleText: 'Check all TypeScript files',
                repositoryId: 'repo-123',
                organizationAndTeamData: mockOrganizationAndTeamData,
            });

            expect(result.length).toBeLessThanOrEqual(10);
        });
    });

    describe('buildSearchPatterns', () => {
        it('should build pattern for simple file name', () => {
            const patterns = service['buildSearchPatterns']({
                fileName: 'CODEOWNERS',
            });

            expect(patterns).toEqual(['**/CODEOWNERS']);
        });

        it('should build pattern for file with partial path', () => {
            const patterns = service['buildSearchPatterns']({
                fileName: 'types/UserRole.enum.ts',
            });

            expect(patterns).toEqual(['**/types/UserRole.enum.ts']);
        });

        it('should include custom filePattern when provided', () => {
            const patterns = service['buildSearchPatterns']({
                fileName: 'UserRole.enum.ts',
                filePattern: '**/*.enum.ts',
            });

            expect(patterns).toContain('**/*.enum.ts');
            expect(patterns).toContain('**/UserRole.enum.ts');
        });

        it('should not duplicate patterns', () => {
            const patterns = service['buildSearchPatterns']({
                fileName: 'test.ts',
                filePattern: '**/test.ts',
            });

            const uniquePatterns = new Set(patterns);
            expect(patterns.length).toBe(uniquePatterns.size);
        });
    });
});

