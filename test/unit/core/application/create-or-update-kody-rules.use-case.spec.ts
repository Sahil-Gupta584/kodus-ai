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

jest.mock('@/shared/utils/crypto', () => ({
    encrypt: jest.fn((text) => `encrypted_${text}`),
    decrypt: jest.fn((text) => text.replace('encrypted_', '')),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { CreateOrUpdateKodyRulesUseCase } from '@/core/application/use-cases/kodyRules/create-or-update.use-case';
import { IKodyRulesService } from '@/core/domain/kodyRules/contracts/kodyRules.service.contract';
import { KODY_RULES_SERVICE_TOKEN } from '@/core/domain/kodyRules/contracts/kodyRules.service.contract';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { AuthorizationService } from '@/core/infrastructure/adapters/services/permissions/authorization.service';
import { ExternalReferenceDetectorService } from '@/core/infrastructure/adapters/services/kodyRules/externalReferenceDetector.service';
import {
    CreateKodyRuleDto,
    KodyRuleSeverity,
} from '@/core/infrastructure/http/dtos/create-kody-rule.dto';
import {
    KodyRulesOrigin,
    KodyRulesStatus,
    KodyRulesScope,
} from '@/core/domain/kodyRules/interfaces/kodyRules.interface';
import { REQUEST } from '@nestjs/core';

describe('CreateOrUpdateKodyRulesUseCase', () => {
    let useCase: CreateOrUpdateKodyRulesUseCase;
    let mockKodyRulesService: jest.Mocked<IKodyRulesService>;
    let mockDetectorService: jest.Mocked<ExternalReferenceDetectorService>;
    let mockLogger: jest.Mocked<PinoLoggerService>;
    let mockAuthService: jest.Mocked<AuthorizationService>;
    let mockRequest: any;

    beforeEach(async () => {
        mockKodyRulesService = {
            createOrUpdate: jest.fn().mockResolvedValue({
                uuid: 'created-rule-uuid',
            }),
        } as any;

        mockDetectorService = {
            detectAndResolveReferences: jest.fn(),
        } as any;

        mockLogger = {
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any;

        mockAuthService = {
            ensure: jest.fn(),
        } as any;

        mockRequest = {
            user: {
                organization: { uuid: 'org-123' },
                uuid: 'user-456',
                email: 'test@test.com',
            },
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CreateOrUpdateKodyRulesUseCase,
                {
                    provide: KODY_RULES_SERVICE_TOKEN,
                    useValue: mockKodyRulesService,
                },
                {
                    provide: PinoLoggerService,
                    useValue: mockLogger,
                },
                {
                    provide: REQUEST,
                    useValue: mockRequest,
                },
                {
                    provide: AuthorizationService,
                    useValue: mockAuthService,
                },
                {
                    provide: ExternalReferenceDetectorService,
                    useValue: mockDetectorService,
                },
            ],
        }).compile();

        useCase = module.get<CreateOrUpdateKodyRulesUseCase>(
            CreateOrUpdateKodyRulesUseCase,
        );
    });

    describe('automatic reference detection', () => {
        it('should detect references on rule creation', async () => {
            mockDetectorService.detectAndResolveReferences.mockResolvedValue([
                {
                    filePath: '.github/CODEOWNERS',
                    description: 'ownership file',
                },
            ]);

            const kodyRule: CreateKodyRuleDto = {
                title: 'Check owners',
                rule: 'All files must have owner in CODEOWNERS',
                repositoryId: 'repo-123',
                severity: KodyRuleSeverity.HIGH,
                origin: KodyRulesOrigin.USER,
                status: KodyRulesStatus.ACTIVE,
                examples: [],
            };

            await useCase.execute(kodyRule, 'org-123', {
                userId: 'user-1',
                userEmail: 'test@test.com',
            });

            expect(
                mockDetectorService.detectAndResolveReferences,
            ).toHaveBeenCalledWith({
                ruleText: 'All files must have owner in CODEOWNERS',
                repositoryId: 'repo-123',
                organizationAndTeamData: { organizationId: 'org-123' },
            });

            expect(mockKodyRulesService.createOrUpdate).toHaveBeenCalledWith(
                { organizationId: 'org-123' },
                expect.objectContaining({
                    externalReferences: [
                        {
                            filePath: '.github/CODEOWNERS',
                            description: 'ownership file',
                        },
                    ],
                }),
                expect.any(Object),
            );
        });

        it('should replace references on rule update', async () => {
            mockDetectorService.detectAndResolveReferences.mockResolvedValue([
                {
                    filePath: 'src/types/UserRole.enum.ts',
                },
            ]);

            const kodyRule: CreateKodyRuleDto = {
                title: 'Check enum',
                rule: 'Validate UserRole.enum.ts',
                repositoryId: 'repo-123',
                severity: KodyRuleSeverity.MEDIUM,
                origin: KodyRulesOrigin.USER,
                status: KodyRulesStatus.ACTIVE,
                examples: [],
            };

            await useCase.execute(kodyRule, 'org-123');

            expect(mockKodyRulesService.createOrUpdate).toHaveBeenCalledWith(
                expect.any(Object),
                expect.objectContaining({
                    externalReferences: [
                        {
                            filePath: 'src/types/UserRole.enum.ts',
                        },
                    ],
                }),
                expect.any(Object),
            );
        });

        it('should clear references when none detected', async () => {
            mockDetectorService.detectAndResolveReferences.mockResolvedValue([]);

            const kodyRule: CreateKodyRuleDto = {
                title: 'Simple rule',
                rule: 'Use const instead of let',
                repositoryId: 'repo-123',
                severity: KodyRuleSeverity.LOW,
                origin: KodyRulesOrigin.USER,
                status: KodyRulesStatus.ACTIVE,
                examples: [],
            };

            await useCase.execute(kodyRule, 'org-123');

            expect(mockKodyRulesService.createOrUpdate).toHaveBeenCalledWith(
                expect.any(Object),
                expect.objectContaining({
                    externalReferences: undefined,
                }),
                expect.any(Object),
            );
        });

        it('should NOT detect references for global rules (no repositoryId)', async () => {
            const kodyRule: CreateKodyRuleDto = {
                title: 'Global rule',
                rule: 'Check CODEOWNERS',
                severity: KodyRuleSeverity.HIGH,
                origin: KodyRulesOrigin.USER,
                status: KodyRulesStatus.ACTIVE,
                examples: [],
            };

            await useCase.execute(kodyRule, 'org-123');

            expect(
                mockDetectorService.detectAndResolveReferences,
            ).not.toHaveBeenCalled();
        });

        it('should handle detection errors gracefully without failing rule creation', async () => {
            mockDetectorService.detectAndResolveReferences.mockRejectedValue(
                new Error('Detection failed'),
            );

            const kodyRule: CreateKodyRuleDto = {
                title: 'Check owners',
                rule: 'Check CODEOWNERS',
                repositoryId: 'repo-123',
                severity: KodyRuleSeverity.HIGH,
                origin: KodyRulesOrigin.USER,
                status: KodyRulesStatus.ACTIVE,
                examples: [],
            };

            await expect(
                useCase.execute(kodyRule, 'org-123'),
            ).resolves.not.toThrow();

            expect(mockKodyRulesService.createOrUpdate).toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Failed to detect external references for manual rule creation',
                }),
            );
        });

        it('should log when references are detected', async () => {
            mockDetectorService.detectAndResolveReferences.mockResolvedValue([
                { filePath: 'file1.ts' },
                { filePath: 'file2.ts' },
            ]);

            const kodyRule: CreateKodyRuleDto = {
                title: 'Check enums',
                rule: 'Validate enums',
                repositoryId: 'repo-123',
                severity: KodyRuleSeverity.MEDIUM,
                origin: KodyRulesOrigin.USER,
                status: KodyRulesStatus.ACTIVE,
                examples: [],
            };

            await useCase.execute(kodyRule, 'org-123');

            expect(mockLogger.log).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Detected external references from rule text',
                    metadata: expect.objectContaining({
                        ruleTitle: 'Check enums',
                        referencesCount: 2,
                        paths: ['file1.ts', 'file2.ts'],
                    }),
                }),
            );
        });

        it('should work with kody-system user without authorization check', async () => {
            mockDetectorService.detectAndResolveReferences.mockResolvedValue([]);

            const kodyRule: CreateKodyRuleDto = {
                title: 'System rule',
                rule: 'Test',
                repositoryId: 'repo-123',
                severity: KodyRuleSeverity.LOW,
                origin: KodyRulesOrigin.USER,
                status: KodyRulesStatus.ACTIVE,
                examples: [],
            };

            await useCase.execute(kodyRule, 'org-123', {
                userId: 'kody-system',
                userEmail: 'kody@kodus.io',
            });

            expect(mockAuthService.ensure).not.toHaveBeenCalled();
            expect(mockKodyRulesService.createOrUpdate).toHaveBeenCalled();
        });
    });
});

