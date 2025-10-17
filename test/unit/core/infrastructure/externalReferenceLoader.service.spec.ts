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
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ExternalReferenceLoaderService } from '@/core/infrastructure/adapters/services/kodyRules/externalReferenceLoader.service';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { IKodyRule } from '@/core/domain/kodyRules/interfaces/kodyRules.interface';
import { AnalysisContext } from '@/config/types/general/codeReview.type';

describe('ExternalReferenceLoaderService', () => {
    let service: ExternalReferenceLoaderService;
    let mockCodeManagementService: jest.Mocked<CodeManagementService>;
    let mockLogger: jest.Mocked<PinoLoggerService>;

    const mockContext: AnalysisContext = {
        organizationAndTeamData: {
            organizationId: 'org-123',
            teamId: 'team-456',
        },
        repository: {
            id: 'repo-123',
            name: 'test-repo',
        },
        pullRequest: {
            number: 42,
            head: { ref: 'feature-branch' },
            base: { ref: 'main' },
        },
    } as any;

    beforeEach(async () => {
        mockCodeManagementService = {
            getRepositoryContentFile: jest.fn(),
        } as any;

        mockLogger = {
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ExternalReferenceLoaderService,
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

        service = module.get<ExternalReferenceLoaderService>(
            ExternalReferenceLoaderService,
        );
    });

    describe('loadReferences', () => {
        it('should load and decode base64 content', async () => {
            const rule: IKodyRule = {
                uuid: 'rule-1',
                title: 'Check owners',
                externalReferences: [
                    {
                        filePath: '.github/CODEOWNERS',
                        description: 'file ownership',
                    },
                ],
            } as any;

            const content = 'admin/* @team-admin\napi/* @team-api';
            mockCodeManagementService.getRepositoryContentFile.mockResolvedValue({
                data: {
                    content: Buffer.from(content).toString('base64'),
                    encoding: 'base64',
                },
            });

            const result = await service.loadReferences(rule, mockContext);

            expect(result).toEqual([
                {
                    filePath: '.github/CODEOWNERS',
                    content: 'admin/* @team-admin\napi/* @team-api',
                    description: 'file ownership',
                },
            ]);
        });

        it('should handle plain text content without encoding', async () => {
            const rule: IKodyRule = {
                uuid: 'rule-1',
                externalReferences: [
                    {
                        filePath: 'package.json',
                    },
                ],
            } as any;

            const content = '{"name": "test-package", "version": "1.0.0"}';
            mockCodeManagementService.getRepositoryContentFile.mockResolvedValue({
                data: {
                    content,
                    encoding: '',
                },
            });

            const result = await service.loadReferences(rule, mockContext);

            expect(result[0].content).toBe(content);
        });

        it('should load multiple references for a single rule', async () => {
            const rule: IKodyRule = {
                uuid: 'rule-1',
                externalReferences: [
                    { filePath: 'CODEOWNERS', fileType: 'codeowners' },
                    { filePath: 'src/types/UserRole.enum.ts', fileType: 'enum' },
                ],
            } as any;

            mockCodeManagementService.getRepositoryContentFile
                .mockResolvedValueOnce({
                    data: { content: 'owner1', encoding: '' },
                })
                .mockResolvedValueOnce({
                    data: { content: 'enum UserRole {}', encoding: '' },
                });

            const result = await service.loadReferences(rule, mockContext);

            expect(result).toHaveLength(2);
            expect(result[0].content).toBe('owner1');
            expect(result[1].content).toBe('enum UserRole {}');
        });

        it('should return empty array for rule without external references', async () => {
            const rule: IKodyRule = {
                uuid: 'rule-1',
                title: 'Simple rule',
            } as any;

            const result = await service.loadReferences(rule, mockContext);

            expect(result).toEqual([]);
            expect(
                mockCodeManagementService.getRepositoryContentFile,
            ).not.toHaveBeenCalled();
        });

        it('should skip references that fail to load', async () => {
            const rule: IKodyRule = {
                uuid: 'rule-1',
                externalReferences: [
                    { filePath: 'file1.ts' },
                    { filePath: 'file2.ts' },
                    { filePath: 'file3.ts' },
                ],
            } as any;

            mockCodeManagementService.getRepositoryContentFile
                .mockResolvedValueOnce({ data: { content: 'content1' } })
                .mockRejectedValueOnce(new Error('404 Not Found'))
                .mockResolvedValueOnce({ data: { content: 'content3' } });

            const result = await service.loadReferences(rule, mockContext);

            expect(result).toHaveLength(2);
            expect(result[0].filePath).toBe('file1.ts');
            expect(result[1].filePath).toBe('file3.ts');
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Failed to load external reference file',
                }),
            );
        });

        it('should warn when file exists but content is empty', async () => {
            const rule: IKodyRule = {
                uuid: 'rule-1',
                externalReferences: [
                    { filePath: 'empty.ts' },
                ],
            } as any;

            mockCodeManagementService.getRepositoryContentFile.mockResolvedValue({
                data: {
                    content: '',
                    encoding: '',
                },
            });

            const result = await service.loadReferences(rule, mockContext);

            expect(result).toEqual([]);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'External reference file found but content is empty',
                }),
            );
        });

        it('should call getRepositoryContentFile with correct parameters', async () => {
            const rule: IKodyRule = {
                uuid: 'rule-1',
                externalReferences: [
                    { filePath: 'test.ts' },
                ],
            } as any;

            mockCodeManagementService.getRepositoryContentFile.mockResolvedValue({
                data: { content: 'test content' },
            });

            await service.loadReferences(rule, mockContext);

            expect(
                mockCodeManagementService.getRepositoryContentFile,
            ).toHaveBeenCalledWith({
                organizationAndTeamData: mockContext.organizationAndTeamData,
                repository: {
                    id: 'repo-123',
                    name: 'test-repo',
                },
                file: { filename: 'test.ts' },
                pullRequest: mockContext.pullRequest,
            });
        });
    });

    describe('loadReferencesForRules', () => {
        it('should load references for multiple rules', async () => {
            const rules: Partial<IKodyRule>[] = [
                {
                    uuid: 'rule-1',
                    externalReferences: [{ filePath: 'file1.ts', fileType: 'enum' }],
                },
                {
                    uuid: 'rule-2',
                    externalReferences: [{ filePath: 'file2.ts', fileType: 'config' }],
                },
            ];

            mockCodeManagementService.getRepositoryContentFile
                .mockResolvedValueOnce({ data: { content: 'content1' } })
                .mockResolvedValueOnce({ data: { content: 'content2' } });

            const result = await service.loadReferencesForRules(
                rules,
                mockContext,
            );

            expect(result.size).toBe(2);
            expect(result.get('rule-1')).toHaveLength(1);
            expect(result.get('rule-1')?.[0].content).toBe('content1');
            expect(result.get('rule-2')).toHaveLength(1);
            expect(result.get('rule-2')?.[0].content).toBe('content2');
        });

        it('should skip rules without uuid', async () => {
            const rules: Partial<IKodyRule>[] = [
                {
                    externalReferences: [{ filePath: 'file1.ts' }],
                },
            ];

            const result = await service.loadReferencesForRules(
                rules,
                mockContext,
            );

            expect(result.size).toBe(0);
            expect(
                mockCodeManagementService.getRepositoryContentFile,
            ).not.toHaveBeenCalled();
        });

        it('should skip rules without external references', async () => {
            const rules: Partial<IKodyRule>[] = [
                {
                    uuid: 'rule-1',
                    title: 'Simple rule',
                },
            ];

            const result = await service.loadReferencesForRules(
                rules,
                mockContext,
            );

            expect(result.size).toBe(0);
            expect(
                mockCodeManagementService.getRepositoryContentFile,
            ).not.toHaveBeenCalled();
        });

        it('should not include rules where all references failed to load', async () => {
            const rules: Partial<IKodyRule>[] = [
                {
                    uuid: 'rule-1',
                    externalReferences: [{ filePath: 'missing.ts' }],
                },
            ];

            mockCodeManagementService.getRepositoryContentFile.mockRejectedValue(
                new Error('404'),
            );

            const result = await service.loadReferencesForRules(
                rules,
                mockContext,
            );

            expect(result.size).toBe(0);
        });

        it('should log aggregated statistics', async () => {
            const rules: Partial<IKodyRule>[] = [
                {
                    uuid: 'rule-1',
                    externalReferences: [
                        { filePath: 'file1.ts' },
                        { filePath: 'file2.ts' },
                    ],
                },
                {
                    uuid: 'rule-2',
                    externalReferences: [{ filePath: 'file3.ts' }],
                },
            ];

            mockCodeManagementService.getRepositoryContentFile.mockResolvedValue({
                data: { content: 'test' },
            });

            await service.loadReferencesForRules(rules, mockContext);

            expect(mockLogger.log).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Loaded external references for rules',
                    metadata: expect.objectContaining({
                        totalRules: 2,
                        rulesWithReferences: 2,
                        totalReferencesLoaded: 3,
                    }),
                }),
            );
        });
    });
});

