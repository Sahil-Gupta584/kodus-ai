import { Test, TestingModule } from '@nestjs/testing';
import { ValidateConfigStage } from '@/core/infrastructure/adapters/services/codeBase/codeReviewPipeline/stages/validate-config.stage';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import {
    AUTOMATION_EXECUTION_SERVICE_TOKEN,
    IAutomationExecutionService,
} from '@/core/domain/automation/contracts/automation-execution.service';
import {
    ORGANIZATION_PARAMETERS_SERVICE_TOKEN,
    IOrganizationParametersService,
} from '@/core/domain/organizationParameters/contracts/organizationParameters.service.contract';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';

describe('Azure Branch Normalization', () => {
    let validateConfigStage: ValidateConfigStage;

    const mockAutomationExecutionService = {
        findLatestExecutionByFilters: jest.fn(),
        findByPeriodAndTeamAutomationId: jest.fn(),
    };

    const mockOrganizationParametersService = {
        findByKey: jest.fn(),
    };

    const mockCodeManagementService = {
        createSingleIssueComment: jest.fn(),
    };

    const mockLogger = {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ValidateConfigStage,
                {
                    provide: AUTOMATION_EXECUTION_SERVICE_TOKEN,
                    useValue: mockAutomationExecutionService,
                },
                {
                    provide: ORGANIZATION_PARAMETERS_SERVICE_TOKEN,
                    useValue: mockOrganizationParametersService,
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

        validateConfigStage =
            module.get<ValidateConfigStage>(ValidateConfigStage);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('normalizeBranchesForPlatform', () => {
        it('should normalize patterns for Azure DevOps', () => {
            const branches = ['develop', 'feature/*', 'release/*'];
            const sourceBranch = 'refs/heads/topic/PLT-9221';
            const targetBranch = 'refs/heads/feature/PLT-4873';

            const result = (
                validateConfigStage as any
            ).normalizeBranchesForPlatform(
                branches,
                sourceBranch,
                targetBranch,
            );

            expect(result).toEqual([
                'refs/heads/develop',
                'refs/heads/feature/*',
                'refs/heads/release/*',
            ]);
        });

        it('should not normalize for non-Azure platforms', () => {
            const branches = ['develop', 'feature/*', 'release/*'];
            const sourceBranch = 'topic/PLT-9221';
            const targetBranch = 'feature/PLT-4873';

            const result = (
                validateConfigStage as any
            ).normalizeBranchesForPlatform(
                branches,
                sourceBranch,
                targetBranch,
            );

            expect(result).toEqual(['develop', 'feature/*', 'release/*']);
        });

        it('should preserve already normalized patterns', () => {
            const branches = [
                'refs/heads/develop',
                'feature/*',
                'refs/heads/release/*',
            ];
            const sourceBranch = 'refs/heads/topic/PLT-9221';
            const targetBranch = 'refs/heads/feature/PLT-4873';

            const result = (
                validateConfigStage as any
            ).normalizeBranchesForPlatform(
                branches,
                sourceBranch,
                targetBranch,
            );

            expect(result).toEqual([
                'refs/heads/develop',
                'refs/heads/feature/*',
                'refs/heads/release/*',
            ]);
        });

        it('should handle exclusion patterns correctly', () => {
            const branches = ['develop', '!main', 'feature/*'];
            const sourceBranch = 'refs/heads/topic/PLT-9221';
            const targetBranch = 'refs/heads/feature/PLT-4873';

            const result = (
                validateConfigStage as any
            ).normalizeBranchesForPlatform(
                branches,
                sourceBranch,
                targetBranch,
            );

            expect(result).toEqual([
                'refs/heads/develop',
                '!main', // Exclusion patterns should not be normalized
                'refs/heads/feature/*',
            ]);
        });

        it('should handle exact match patterns correctly', () => {
            const branches = ['=develop', 'feature/*', '=main'];
            const sourceBranch = 'refs/heads/topic/PLT-9221';
            const targetBranch = 'refs/heads/feature/PLT-4873';

            const result = (
                validateConfigStage as any
            ).normalizeBranchesForPlatform(
                branches,
                sourceBranch,
                targetBranch,
            );

            expect(result).toEqual([
                '=develop', // Exact match patterns should not be normalized
                'refs/heads/feature/*',
                '=main', // Exact match patterns should not be normalized
            ]);
        });

        it('should handle contains patterns correctly', () => {
            const branches = ['contains:demo', 'feature/*', 'contains:test'];
            const sourceBranch = 'refs/heads/topic/PLT-9221';
            const targetBranch = 'refs/heads/feature/PLT-4873';

            const result = (
                validateConfigStage as any
            ).normalizeBranchesForPlatform(
                branches,
                sourceBranch,
                targetBranch,
            );

            expect(result).toEqual([
                'contains:demo', // Contains patterns should not be normalized
                'refs/heads/feature/*',
                'contains:test', // Contains patterns should not be normalized
            ]);
        });

        it('should detect Azure DevOps by source branch prefix', () => {
            const branches = ['develop', 'feature/*'];
            const sourceBranch = 'refs/heads/topic/PLT-9221';
            const targetBranch = 'feature/PLT-4873'; // No prefix

            const result = (
                validateConfigStage as any
            ).normalizeBranchesForPlatform(
                branches,
                sourceBranch,
                targetBranch,
            );

            expect(result).toEqual([
                'refs/heads/develop',
                'refs/heads/feature/*',
            ]);
        });

        it('should detect Azure DevOps by target branch prefix', () => {
            const branches = ['develop', 'feature/*'];
            const sourceBranch = 'topic/PLT-9221'; // No prefix
            const targetBranch = 'refs/heads/feature/PLT-4873';

            const result = (
                validateConfigStage as any
            ).normalizeBranchesForPlatform(
                branches,
                sourceBranch,
                targetBranch,
            );

            expect(result).toEqual([
                'refs/heads/develop',
                'refs/heads/feature/*',
            ]);
        });

        it('should handle mixed patterns correctly', () => {
            const branches = [
                'develop',
                'refs/heads/main',
                'feature/*',
                '!hotfix/*',
                '=staging',
                'contains:demo',
            ];
            const sourceBranch = 'refs/heads/topic/PLT-9221';
            const targetBranch = 'refs/heads/feature/PLT-4873';

            const result = (
                validateConfigStage as any
            ).normalizeBranchesForPlatform(
                branches,
                sourceBranch,
                targetBranch,
            );

            expect(result).toEqual([
                'refs/heads/develop',
                'refs/heads/main', // Already normalized
                'refs/heads/feature/*',
                '!hotfix/*', // Exclusion - not normalized
                '=staging', // Exact match - not normalized
                'contains:demo', // Contains - not normalized
            ]);
        });
    });

    describe('Integration with shouldExecuteReview', () => {
        const organizationAndTeamData: OrganizationAndTeamData = {
            organizationName: 'test-org',
            teamName: 'test-team',
        };

        it('should work with Azure DevOps branches after normalization', () => {
            const result = (validateConfigStage as any).shouldExecuteReview(
                'Test PR',
                'refs/heads/feature/PLT-4873', // Target
                'refs/heads/topic/PLT-9221', // Source
                false,
                {
                    automatedReviewActive: true,
                    baseBranches: ['develop', 'feature/*', 'release/*'],
                    runOnDraft: false,
                },
                'webhook',
                organizationAndTeamData,
            );

            // Should return true because feature/* gets normalized to refs/heads/feature/*
            expect(result).toBe(true);
        });

        it('should work with GitHub branches without normalization', () => {
            const result = (validateConfigStage as any).shouldExecuteReview(
                'Test PR',
                'feature/PLT-4873', // Target (no prefix)
                'topic/PLT-9221', // Source (no prefix)
                false,
                {
                    automatedReviewActive: true,
                    baseBranches: ['develop', 'feature/*', 'release/*'],
                    runOnDraft: false,
                },
                'webhook',
                organizationAndTeamData,
            );

            // Should return true because feature/* matches feature/PLT-4873
            expect(result).toBe(true);
        });

        it('should handle mixed Azure and GitHub patterns', () => {
            const result = (validateConfigStage as any).shouldExecuteReview(
                'Test PR',
                'refs/heads/feature/PLT-4873', // Azure target
                'refs/heads/topic/PLT-9221', // Azure source
                false,
                {
                    automatedReviewActive: true,
                    baseBranches: [
                        'develop', // Will be normalized
                        'refs/heads/main', // Already normalized
                        'feature/*', // Will be normalized
                    ],
                    runOnDraft: false,
                },
                'webhook',
                organizationAndTeamData,
            );

            // Should return true because develop and feature/* get normalized
            expect(result).toBe(true);
        });
    });
});
