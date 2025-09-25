import { Test, TestingModule } from '@nestjs/testing';
import { GetEnrichedPullRequestsUseCase } from '@/core/application/use-cases/pullRequests/get-enriched-pull-requests.use-case';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import {
    AUTOMATION_EXECUTION_SERVICE_TOKEN,
    IAutomationExecutionService,
} from '@/core/domain/automation/contracts/automation-execution.service';
import {
    PULL_REQUESTS_SERVICE_TOKEN,
    IPullRequestsService,
} from '@/core/domain/pullRequests/contracts/pullRequests.service.contracts';
import {
    CODE_REVIEW_EXECUTION_SERVICE,
    ICodeReviewExecutionService,
} from '@/core/domain/codeReviewExecutions/contracts/codeReviewExecution.service.contract';
import { AutomationExecutionEntity } from '@/core/domain/automation/entities/automation-execution.entity';
import { PullRequestsEntity } from '@/core/domain/pullRequests/entities/pullRequests.entity';
import { CodeReviewExecutionEntity } from '@/core/domain/codeReviewExecutions/entities/codeReviewExecution.entity';
import { AutomationStatus } from '@/core/domain/automation/enums/automation-status';
import { AuthorizationService } from '@/core/infrastructure/adapters/services/permissions/authorization.service';

const buildAutomationExecution = (overrides: Partial<AutomationExecutionEntity> = {}) =>
    new AutomationExecutionEntity({
        uuid: 'execution-id',
        pullRequestNumber: 123,
        repositoryId: 'test-repo-id',
        status: AutomationStatus.SUCCESS,
        createdAt: new Date(),
        updatedAt: new Date(),
        origin: 'test',
        ...overrides,
    });

const buildPullRequest = (overrides: Partial<PullRequestsEntity> = {}) =>
    new PullRequestsEntity({
        uuid: 'pr-uuid',
        number: 123,
        title: 'Test PR',
        status: 'OPEN',
        merged: false,
        url: 'https://github.com/test/repo/pull/123',
        baseBranchRef: 'main',
        headBranchRef: 'feature-branch',
        repository: {
            id: 'test-repo-id',
            name: 'test-repo',
            fullName: 'test/test-repo',
            language: 'typescript',
            url: 'https://github.com/test/repo',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
        openedAt: new Date().toISOString(),
        closedAt: null,
        files: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        totalAdded: 0,
        totalDeleted: 0,
        totalChanges: 0,
        provider: 'GITHUB',
        user: {
            id: 'user-id',
            username: 'testuser',
            name: 'Test User',
            email: 'test@example.com',
        },
        reviewers: [],
        assignees: [],
        organizationId: 'test-org-id',
        commits: [],
        syncedEmbeddedSuggestions: false,
        syncedWithIssues: false,
        prLevelSuggestions: [],
        isDraft: false,
        ...overrides,
    });

describe('GetEnrichedPullRequestsUseCase', () => {
    let useCase: GetEnrichedPullRequestsUseCase;
    let mockAutomationExecutionService: jest.Mocked<IAutomationExecutionService>;
    let mockPullRequestsService: jest.Mocked<IPullRequestsService>;
    let mockCodeReviewExecutionService: jest.Mocked<ICodeReviewExecutionService>;
    let mockLogger: jest.Mocked<PinoLoggerService>;
    let mockAuthorizationService: jest.Mocked<AuthorizationService>;

    const mockRequest = {
        user: {
            organization: {
                uuid: 'test-org-id',
            },
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GetEnrichedPullRequestsUseCase,
                {
                    provide: AUTOMATION_EXECUTION_SERVICE_TOKEN,
                    useValue: {
                        findPullRequestExecutionsByOrganization: jest.fn(),
                    },
                },
                {
                    provide: PULL_REQUESTS_SERVICE_TOKEN,
                    useValue: {
                        findByNumberAndRepositoryId: jest.fn(),
                    },
                },
                {
                    provide: CODE_REVIEW_EXECUTION_SERVICE,
                    useValue: {
                        find: jest.fn(),
                    },
                },
                {
                    provide: PinoLoggerService,
                    useValue: {
                        warn: jest.fn(),
                        log: jest.fn(),
                        debug: jest.fn(),
                        error: jest.fn(),
                    },
                },
                {
                    provide: AuthorizationService,
                    useValue: {
                        ensure: jest.fn().mockResolvedValue(undefined),
                        getRepositoryScope: jest.fn().mockResolvedValue(null),
                    },
                },
                {
                    provide: 'REQUEST',
                    useValue: mockRequest,
                },
            ],
        }).compile();

        useCase = module.get<GetEnrichedPullRequestsUseCase>(
            GetEnrichedPullRequestsUseCase,
        );
        mockAutomationExecutionService = module.get(
            AUTOMATION_EXECUTION_SERVICE_TOKEN,
        );
        mockPullRequestsService = module.get(PULL_REQUESTS_SERVICE_TOKEN);
        mockCodeReviewExecutionService = module.get(CODE_REVIEW_EXECUTION_SERVICE);
        mockLogger = module.get(PinoLoggerService);
        mockAuthorizationService = module.get(AuthorizationService);
    });

    describe('execute', () => {
        it('returns pull requests that have code review history', async () => {
            const query = { repositoryId: 'test-repo-id', limit: 10, page: 1 };

            const executionWithHistory = buildAutomationExecution({ uuid: 'exec-1' });
            const executionWithoutHistory = buildAutomationExecution({
                uuid: 'exec-2',
                pullRequestNumber: 456,
            });

            mockAutomationExecutionService
                .findPullRequestExecutionsByOrganization.mockResolvedValueOnce({
                    data: [executionWithHistory, executionWithoutHistory],
                    total: 2,
                });

            mockPullRequestsService.findByNumberAndRepositoryId
                .mockResolvedValueOnce(buildPullRequest())
                .mockResolvedValueOnce(buildPullRequest({ number: 456 }));

            mockCodeReviewExecutionService.find
                .mockResolvedValueOnce([
                    new CodeReviewExecutionEntity({
                        uuid: 'cre-uuid-1',
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        automationExecution: { uuid: 'exec-1' },
                        status: AutomationStatus.SUCCESS,
                        message: 'completed',
                    }),
                ])
                .mockResolvedValueOnce([]);

            const result = await useCase.execute(query as any);

            expect(result.data).toHaveLength(1);
            expect(result.data[0].automationExecution.uuid).toBe('exec-1');
            expect(
                mockAutomationExecutionService.findPullRequestExecutionsByOrganization,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    organizationId: 'test-org-id',
                    repositoryIds: ['test-repo-id'],
                    skip: 0,
                    take: 10,
                }),
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Skipping PR without code review history',
                    metadata: expect.objectContaining({
                        executionUuid: 'exec-2',
                    }),
                }),
            );
        });

        it('returns empty data when there are no executions', async () => {
            mockAutomationExecutionService.findPullRequestExecutionsByOrganization.mockResolvedValue({
                data: [],
                total: 0,
            });

            const result = await useCase.execute({ limit: 10, page: 1 } as any);

            expect(result.data).toHaveLength(0);
            expect(result.pagination.totalItems).toBe(0);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'No automation executions with PR data found',
                }),
            );
        });

        it('invokes authorization ensure when filtering by repositoryId', async () => {
            mockAutomationExecutionService.findPullRequestExecutionsByOrganization.mockResolvedValue({
                data: [],
                total: 0,
            });

            await useCase.execute({ repositoryId: 'repo-id', limit: 10, page: 1 } as any);

            expect(mockAuthorizationService.ensure).toHaveBeenCalledWith({
                user: mockRequest.user,
                action: expect.anything(),
                resource: expect.anything(),
                repoIds: ['repo-id'],
            });
        });

        it('passes pagination parameters to automation execution service', async () => {
            mockAutomationExecutionService.findPullRequestExecutionsByOrganization.mockResolvedValue({
                data: [],
                total: 0,
            });

            await useCase.execute({ limit: 15, page: 2 } as any);

            expect(
                mockAutomationExecutionService.findPullRequestExecutionsByOrganization,
            ).toHaveBeenCalledWith(
                expect.objectContaining({ skip: 15, take: 15 }),
            );
        });

        it('throws when no organization is present in the request', async () => {
            const useCaseWithoutOrg = new GetEnrichedPullRequestsUseCase(
                mockLogger,
                mockAutomationExecutionService,
                mockPullRequestsService,
                mockCodeReviewExecutionService,
                { user: {} } as any,
                mockAuthorizationService,
            );

            await expect(
                useCaseWithoutOrg.execute({ limit: 10, page: 1 } as any),
            ).rejects.toThrow('No organization found in request');
        });
    });
});
