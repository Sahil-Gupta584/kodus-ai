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

jest.mock('@kodus/kodus-common/llm', () => ({
    ...jest.requireActual('@kodus/kodus-common/llm'),
    PromptRunnerService: jest.fn(),
    LLMModelProvider: {
        GEMINI_2_5_FLASH: 'gemini-2.5-flash',
        GEMINI_2_5_PRO: 'gemini-2.5-pro',
    },
}));

jest.mock('@/shared/utils/crypto', () => ({
    encrypt: jest.fn((text) => `encrypted_${text}`),
    decrypt: jest.fn((text) => text.replace('encrypted_', '')),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { CreateOrUpdateKodyRulesUseCase } from '@/core/application/use-cases/kodyRules/create-or-update.use-case';
import { ExternalReferenceDetectorService } from '@/core/infrastructure/adapters/services/kodyRules/externalReferenceDetector.service';
import { ExternalReferenceLoaderService } from '@/core/infrastructure/adapters/services/kodyRules/externalReferenceLoader.service';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { KodyRulesAnalysisService } from '@/ee/codeBase/kodyRulesAnalysis.service';
import {
    CreateKodyRuleDto,
    KodyRuleSeverity,
} from '@/core/infrastructure/http/dtos/create-kody-rule.dto';
import {
    KodyRulesOrigin,
    KodyRulesStatus,
    KodyRulesScope,
} from '@/core/domain/kodyRules/interfaces/kodyRules.interface';
import { AnalysisContext } from '@/config/types/general/codeReview.type';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { ObservabilityService } from '@/core/infrastructure/adapters/services/logger/observability.service';
import { PromptRunnerService } from '@kodus/kodus-common/llm';

describe('External References - Integration Tests', () => {
    let createOrUpdateUseCase: CreateOrUpdateKodyRulesUseCase;
    let detectorService: ExternalReferenceDetectorService;
    let loaderService: ExternalReferenceLoaderService;
    let mockCodeManagementService: jest.Mocked<CodeManagementService>;
    let mockKodyRulesService: any;
    let mockLogger: jest.Mocked<PinoLoggerService>;
    let mockObservabilityService: jest.Mocked<ObservabilityService>;
    let mockPromptRunnerService: any;

    beforeEach(async () => {
        mockCodeManagementService = {
            getRepositoryAllFiles: jest.fn(),
            getRepositoryContentFile: jest.fn(),
        } as any;

        mockKodyRulesService = {
            createOrUpdate: jest.fn().mockResolvedValue({ uuid: 'rule-123' }),
        };

        mockLogger = {
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any;

        mockObservabilityService = {
            runLLMInSpan: jest.fn().mockImplementation(async ({ exec }) => {
                return { result: await exec([]) };
            }),
        } as any;

        mockPromptRunnerService = {} as any;

        const mockRequest = {
            user: {
                organization: { uuid: 'org-123' },
                uuid: 'user-456',
                email: 'test@test.com',
            },
        };

        const mockAuthService = {
            ensure: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CreateOrUpdateKodyRulesUseCase,
                ExternalReferenceDetectorService,
                ExternalReferenceLoaderService,
                {
                    provide: CodeManagementService,
                    useValue: mockCodeManagementService,
                },
                {
                    provide: PinoLoggerService,
                    useValue: mockLogger,
                },
                {
                    provide: ObservabilityService,
                    useValue: mockObservabilityService,
                },
                {
                    provide: PromptRunnerService,
                    useValue: mockPromptRunnerService,
                },
                {
                    provide: 'KODY_RULES_SERVICE_TOKEN',
                    useValue: mockKodyRulesService,
                },
                {
                    provide: 'REQUEST',
                    useValue: mockRequest,
                },
                {
                    provide: 'AuthorizationService',
                    useValue: mockAuthService,
                },
            ],
        }).compile();

        createOrUpdateUseCase = module.get<CreateOrUpdateKodyRulesUseCase>(
            CreateOrUpdateKodyRulesUseCase,
        );
        detectorService = module.get<ExternalReferenceDetectorService>(
            ExternalReferenceDetectorService,
        );
        loaderService = module.get<ExternalReferenceLoaderService>(
            ExternalReferenceLoaderService,
        );
    });

    describe('End-to-End: Rule Creation → Detection → Execution → Loading', () => {
        it('should complete full flow: create rule with CODEOWNERS reference', async () => {
            const mockLLMDetectionResult = {
                references: [
                    {
                        fileName: 'CODEOWNERS',
                        description: 'file ownership mapping',
                    },
                ],
            };

            jest.spyOn(
                detectorService as any,
                'detectReferences',
            ).mockResolvedValue(mockLLMDetectionResult.references);

            mockCodeManagementService.getRepositoryAllFiles.mockResolvedValue([
                { path: '.github/CODEOWNERS', size: 100, sha: 'abc' },
            ] as any);

            const kodyRule: CreateKodyRuleDto = {
                title: 'Validate file ownership',
                rule: 'All modified files must have an owner defined in CODEOWNERS',
                repositoryId: 'repo-123',
                severity: KodyRuleSeverity.HIGH,
                origin: KodyRulesOrigin.USER,
                status: KodyRulesStatus.ACTIVE,
                scope: KodyRulesScope.FILE,
                examples: [],
                path: '**/*',
            };

            const createdRule = await createOrUpdateUseCase.execute(
                kodyRule,
                'org-123',
                { userId: 'kody-system', userEmail: 'kody@kodus.io' },
            );

            expect(createdRule).toBeDefined();
            expect(kodyRule.externalReferences).toEqual([
                {
                    filePath: '.github/CODEOWNERS',
                    description: 'file ownership mapping',
                },
            ]);

            const codeownersContent = 'admin/* @admin-team\napi/* @api-team';
            mockCodeManagementService.getRepositoryContentFile.mockResolvedValue({
                data: {
                    content: Buffer.from(codeownersContent).toString('base64'),
                    encoding: 'base64',
                },
            });

            const loadedRefs = await loaderService.loadReferences(
                kodyRule as any,
                {
                    organizationAndTeamData: { organizationId: 'org-123' },
                    repository: { id: 'repo-123', name: 'test-repo' },
                    pullRequest: { number: 1 },
                } as any,
            );

            expect(loadedRefs).toEqual([
                {
                    filePath: '.github/CODEOWNERS',
                    content: codeownersContent,
                    description: 'file ownership mapping',
                },
            ]);
        });

        it('should handle multiple references in single rule', async () => {
            const mockLLMDetectionResult = {
                references: [
                    { fileName: 'CODEOWNERS' },
                    { fileName: 'UserRole.enum.ts' },
                    { fileName: 'openapi.yml' },
                ],
            };

            jest.spyOn(
                detectorService as any,
                'detectReferences',
            ).mockResolvedValue(mockLLMDetectionResult.references);

            mockCodeManagementService.getRepositoryAllFiles
                .mockResolvedValueOnce([
                    { path: '.github/CODEOWNERS', size: 100 },
                ] as any)
                .mockResolvedValueOnce([
                    { path: 'src/types/UserRole.enum.ts', size: 200 },
                ] as any)
                .mockResolvedValueOnce([
                    { path: 'docs/openapi.yml', size: 5000 },
                ] as any);

            const kodyRule: CreateKodyRuleDto = {
                title: 'Multi-reference rule',
                rule: 'Check CODEOWNERS, validate UserRole.enum.ts, and follow openapi.yml',
                repositoryId: 'repo-123',
                severity: KodyRuleSeverity.HIGH,
                origin: KodyRulesOrigin.USER,
                status: KodyRulesStatus.ACTIVE,
                examples: [],
            };

            await createOrUpdateUseCase.execute(kodyRule, 'org-123', {
                userId: 'kody-system',
                userEmail: 'kody@kodus.io',
            });

            expect(kodyRule.externalReferences).toHaveLength(3);
            expect(kodyRule.externalReferences?.map((r) => r.filePath)).toEqual([
                '.github/CODEOWNERS',
                'src/types/UserRole.enum.ts',
                'docs/openapi.yml',
            ]);
        });

        it('should not create rule when referenced file does not exist', async () => {
            const mockLLMDetectionResult = {
                references: [
                    {
                        fileName: 'NonExistentFile.ts',
                    },
                ],
            };

            jest.spyOn(
                detectorService as any,
                'detectReferences',
            ).mockResolvedValue(mockLLMDetectionResult.references);

            mockCodeManagementService.getRepositoryAllFiles.mockResolvedValue([]);

            const kodyRule: CreateKodyRuleDto = {
                title: 'Missing ref rule',
                rule: 'Check NonExistentFile.ts',
                repositoryId: 'repo-123',
                severity: KodyRuleSeverity.MEDIUM,
                origin: KodyRulesOrigin.USER,
                status: KodyRulesStatus.ACTIVE,
                examples: [],
            };

            await createOrUpdateUseCase.execute(kodyRule, 'org-123', {
                userId: 'kody-system',
                userEmail: 'kody@kodus.io',
            });

            expect(kodyRule.externalReferences).toBeUndefined();
        });

        it('should update references when rule text changes', async () => {
            jest.spyOn(
                detectorService as any,
                'detectReferences',
            ).mockResolvedValueOnce([
                { fileName: 'CODEOWNERS' },
            ]);

            mockCodeManagementService.getRepositoryAllFiles.mockResolvedValueOnce([
                { path: '.github/CODEOWNERS', size: 100 },
            ] as any);

            const kodyRule: CreateKodyRuleDto = {
                uuid: 'existing-rule',
                title: 'Check owners',
                rule: 'Check CODEOWNERS',
                repositoryId: 'repo-123',
                severity: KodyRuleSeverity.HIGH,
                origin: KodyRulesOrigin.USER,
                status: KodyRulesStatus.ACTIVE,
                examples: [],
            };

            await createOrUpdateUseCase.execute(kodyRule, 'org-123', {
                userId: 'kody-system',
                userEmail: 'kody@kodus.io',
            });

            expect(kodyRule.externalReferences).toHaveLength(1);
            expect(kodyRule.externalReferences?.[0].filePath).toBe(
                '.github/CODEOWNERS',
            );

            jest.spyOn(
                detectorService as any,
                'detectReferences',
            ).mockResolvedValueOnce([
                { fileName: 'UserRole.enum.ts' },
            ]);

            mockCodeManagementService.getRepositoryAllFiles.mockResolvedValueOnce([
                { path: 'src/types/UserRole.enum.ts', size: 200 },
            ] as any);

            kodyRule.rule = 'Validate against UserRole.enum.ts';

            await createOrUpdateUseCase.execute(kodyRule, 'org-123', {
                userId: 'kody-system',
                userEmail: 'kody@kodus.io',
            });

            expect(kodyRule.externalReferences).toHaveLength(1);
            expect(kodyRule.externalReferences?.[0].filePath).toBe(
                'src/types/UserRole.enum.ts',
            );
        });
    });

    describe('Platform-agnostic file search', () => {
        it('should work with partial paths', async () => {
            const mockLLMDetectionResult = {
                references: [
                    {
                        fileName: 'types/UserRole.enum.ts',
                        fileType: 'enum',
                    },
                ],
            };

            jest.spyOn(
                detectorService as any,
                'detectReferences',
            ).mockResolvedValue(mockLLMDetectionResult.references);

            mockCodeManagementService.getRepositoryAllFiles.mockResolvedValue([
                { path: 'src/types/UserRole.enum.ts', size: 150 },
            ] as any);

            const result = await detectorService.detectAndResolveReferences({
                ruleText: 'Validate types/UserRole.enum.ts',
                repositoryId: 'repo-123',
                organizationAndTeamData: { organizationId: 'org-123' },
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

        it('should work with glob patterns', async () => {
            const mockLLMDetectionResult = {
                references: [
                    {
                        fileName: '*.enum.ts',
                        filePattern: '**/*.enum.ts',
                    },
                ],
            };

            jest.spyOn(
                detectorService as any,
                'detectReferences',
            ).mockResolvedValue(mockLLMDetectionResult.references);

            mockCodeManagementService.getRepositoryAllFiles.mockResolvedValue([
                { path: 'src/types/UserRole.enum.ts', size: 150 },
                { path: 'src/types/Status.enum.ts', size: 100 },
                { path: 'src/models/Priority.enum.ts', size: 80 },
            ] as any);

            const result = await detectorService.detectAndResolveReferences({
                ruleText: 'All enums must follow pattern',
                repositoryId: 'repo-123',
                organizationAndTeamData: { organizationId: 'org-123' },
            });

            expect(result).toHaveLength(3);
            expect(result.map((r) => r.filePath)).toEqual([
                'src/types/UserRole.enum.ts',
                'src/types/Status.enum.ts',
                'src/models/Priority.enum.ts',
            ]);
        });
    });

    describe('Error scenarios', () => {
        it('should handle repository API errors during file search', async () => {
            const mockLLMDetectionResult = {
                references: [{ fileName: 'CODEOWNERS' }],
            };

            jest.spyOn(
                detectorService as any,
                'detectReferences',
            ).mockResolvedValue(mockLLMDetectionResult.references);

            mockCodeManagementService.getRepositoryAllFiles.mockRejectedValue(
                new Error('GitHub API rate limit exceeded'),
            );

            const result = await detectorService.detectAndResolveReferences({
                ruleText: 'Check CODEOWNERS',
                repositoryId: 'repo-123',
                organizationAndTeamData: { organizationId: 'org-123' },
            });

            expect(result).toEqual([]);
        });

        it('should handle file loading errors during PR analysis', async () => {
            const mockContext: AnalysisContext = {
                organizationAndTeamData: { organizationId: 'org-123' },
                repository: { id: 'repo-123', name: 'test-repo' },
                pullRequest: { number: 42 },
            } as any;

            const rule = {
                uuid: 'rule-1',
                externalReferences: [
                    { filePath: '.github/CODEOWNERS' },
                ],
            } as any;

            mockCodeManagementService.getRepositoryContentFile.mockRejectedValue(
                new Error('File not found'),
            );

            const result = await loaderService.loadReferences(rule, mockContext);

            expect(result).toEqual([]);
        });
    });

    describe('Performance and limits', () => {
        it('should respect maxFiles limit when searching', async () => {
            const mockLLMDetectionResult = {
                references: [
                    {
                        fileName: '*.ts',
                        filePattern: '**/*.ts',
                    },
                ],
            };

            jest.spyOn(
                detectorService as any,
                'detectReferences',
            ).mockResolvedValue(mockLLMDetectionResult.references);

            const manyFiles = Array.from({ length: 100 }, (_, i) => ({
                path: `file${i}.ts`,
                size: 100,
            }));

            mockCodeManagementService.getRepositoryAllFiles.mockResolvedValue(
                manyFiles as any,
            );

            const result = await detectorService.detectAndResolveReferences({
                ruleText: 'Check all TypeScript files',
                repositoryId: 'repo-123',
                organizationAndTeamData: { organizationId: 'org-123' },
            });

            expect(result.length).toBeLessThanOrEqual(10);
            expect(mockCodeManagementService.getRepositoryAllFiles).toHaveBeenCalledWith(
                expect.objectContaining({
                    filters: expect.objectContaining({
                        maxFiles: 10,
                    }),
                }),
            );
        });
    });

    describe('Real-world scenarios', () => {
        it('should handle OpenAPI spec reference', async () => {
            const mockLLMDetectionResult = {
                references: [
                    {
                        fileName: 'openapi.yml',
                        description: 'API specification',
                    },
                ],
            };

            jest.spyOn(
                detectorService as any,
                'detectReferences',
            ).mockResolvedValue(mockLLMDetectionResult.references);

            mockCodeManagementService.getRepositoryAllFiles.mockResolvedValue([
                { path: 'docs/api/openapi.yml', size: 15000 },
            ] as any);

            const kodyRule: CreateKodyRuleDto = {
                title: 'API compliance',
                rule: 'All API endpoints must follow the schema defined in openapi.yml',
                repositoryId: 'repo-123',
                severity: KodyRuleSeverity.CRITICAL,
                origin: KodyRulesOrigin.USER,
                status: KodyRulesStatus.ACTIVE,
                examples: [],
            };

            await createOrUpdateUseCase.execute(kodyRule, 'org-123', {
                userId: 'kody-system',
                userEmail: 'kody@kodus.io',
            });

            expect(kodyRule.externalReferences).toEqual([
                {
                    filePath: 'docs/api/openapi.yml',
                    description: 'API specification',
                },
            ]);
        });

        it('should handle enum reference with partial path', async () => {
            const mockLLMDetectionResult = {
                references: [
                    {
                        fileName: 'types/UserRole.enum.ts',
                        description: 'user role definitions',
                    },
                ],
            };

            jest.spyOn(
                detectorService as any,
                'detectReferences',
            ).mockResolvedValue(mockLLMDetectionResult.references);

            mockCodeManagementService.getRepositoryAllFiles.mockResolvedValue([
                { path: 'src/shared/types/UserRole.enum.ts', size: 250 },
            ] as any);

            const kodyRule: CreateKodyRuleDto = {
                title: 'Role validation',
                rule: 'User roles must match values defined in types/UserRole.enum.ts',
                repositoryId: 'repo-123',
                severity: KodyRuleSeverity.HIGH,
                origin: KodyRulesOrigin.USER,
                status: KodyRulesStatus.ACTIVE,
                examples: [],
            };

            await createOrUpdateUseCase.execute(kodyRule, 'org-123', {
                userId: 'kody-system',
                userEmail: 'kody@kodus.io',
            });

            expect(kodyRule.externalReferences?.[0].filePath).toBe(
                'src/shared/types/UserRole.enum.ts',
            );
        });

        it('should handle config file references', async () => {
            const mockLLMDetectionResult = {
                references: [
                    {
                        fileName: 'package.json',
                        description: 'package dependencies',
                    },
                ],
            };

            jest.spyOn(
                detectorService as any,
                'detectReferences',
            ).mockResolvedValue(mockLLMDetectionResult.references);

            mockCodeManagementService.getRepositoryAllFiles.mockResolvedValue([
                { path: 'package.json', size: 2000 },
            ] as any);

            const result = await detectorService.detectAndResolveReferences({
                ruleText:
                    'Dependencies must be defined in package.json devDependencies',
                repositoryId: 'repo-123',
                organizationAndTeamData: { organizationId: 'org-123' },
            });

            expect(result[0].filePath).toBe('package.json');
        });
    });
});

