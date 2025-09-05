import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationExecutionRepository } from '@/core/infrastructure/adapters/repositories/typeorm/automationExecution.repository';
import { AutomationExecutionModel } from '@/core/infrastructure/adapters/repositories/typeorm/schema/automationExecution.model';
import { IAutomationExecution } from '@/core/domain/automation/interfaces/automation-execution.interface';
import { AutomationStatus } from '@/core/domain/automation/enums/automation-status';

describe('AutomationExecutionRepository', () => {
    let repository: AutomationExecutionRepository;
    let mockTypeOrmRepository: jest.Mocked<Repository<AutomationExecutionModel>>;

    beforeEach(async () => {
        const mockTypeOrmRepositoryValue = {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AutomationExecutionRepository,
                {
                    provide: getRepositoryToken(AutomationExecutionModel),
                    useValue: mockTypeOrmRepositoryValue,
                },
            ],
        }).compile();

        repository = module.get<AutomationExecutionRepository>(AutomationExecutionRepository);
        mockTypeOrmRepository = module.get(getRepositoryToken(AutomationExecutionModel));
    });

    describe('find', () => {
        it('should use getFilterConditions for nested filtering', async () => {
            // Arrange
            const filter: Partial<IAutomationExecution> = {
                status: AutomationStatus.SUCCESS,
                teamAutomation: {
                    team: {
                        organization: {
                            uuid: 'test-org-id',
                        },
                    },
                },
            };

            const mockExecutions = [
                {
                    uuid: 'execution-1',
                    status: AutomationStatus.SUCCESS,
                    pullRequestNumber: 123,
                    repositoryId: 'repo-1',
                    teamAutomation: {
                        team: {
                            organization: {
                                uuid: 'test-org-id',
                            },
                        },
                    },
                },
            ];

            mockTypeOrmRepository.find.mockResolvedValue(mockExecutions as AutomationExecutionModel[]);

            // Act
            await repository.find(filter);

            // Assert
            expect(mockTypeOrmRepository.find).toHaveBeenCalledWith({
                where: {
                    status: AutomationStatus.SUCCESS,
                    'teamAutomation.team.organization.uuid': 'test-org-id',
                },
                relations: [
                    'teamAutomation',
                    'teamAutomation.team',
                    'teamAutomation.team.organization',
                    'codeReviewExecutions',
                ],
            });
        });

        it('should handle filters without nested objects', async () => {
            // Arrange
            const filter: Partial<IAutomationExecution> = {
                status: AutomationStatus.SUCCESS,
                pullRequestNumber: 123,
            };

            const mockExecutions = [
                {
                    uuid: 'execution-1',
                    status: AutomationStatus.SUCCESS,
                    pullRequestNumber: 123,
                },
            ];

            mockTypeOrmRepository.find.mockResolvedValue(mockExecutions as AutomationExecutionModel[]);

            // Act
            await repository.find(filter);

            // Assert
            expect(mockTypeOrmRepository.find).toHaveBeenCalledWith({
                where: {
                    status: AutomationStatus.SUCCESS,
                    pullRequestNumber: 123,
                },
                relations: [
                    'teamAutomation',
                    'teamAutomation.team',
                    'teamAutomation.team.organization',
                    'codeReviewExecutions',
                ],
            });
        });

        it('should handle complex nested filters', async () => {
            // Arrange
            const filter: Partial<IAutomationExecution> = {
                teamAutomation: {
                    uuid: 'team-automation-id',
                    team: {
                        uuid: 'team-id',
                        organization: {
                            uuid: 'org-id',
                        },
                    },
                },
                codeReviewExecutions: {
                    status: AutomationStatus.SUCCESS,
                },
            };

            mockTypeOrmRepository.find.mockResolvedValue([]);

            // Act
            await repository.find(filter);

            // Assert
            expect(mockTypeOrmRepository.find).toHaveBeenCalledWith({
                where: {
                    'teamAutomation.uuid': 'team-automation-id',
                    'teamAutomation.team.uuid': 'team-id',
                    'teamAutomation.team.organization.uuid': 'org-id',
                    'codeReviewExecutions.status': AutomationStatus.SUCCESS,
                },
                relations: [
                    'teamAutomation',
                    'teamAutomation.team',
                    'teamAutomation.team.organization',
                    'codeReviewExecutions',
                ],
            });
        });

        it('should handle empty filter', async () => {
            // Arrange
            const filter = {};

            mockTypeOrmRepository.find.mockResolvedValue([]);

            // Act
            await repository.find(filter);

            // Assert
            expect(mockTypeOrmRepository.find).toHaveBeenCalledWith({
                where: {},
                relations: [
                    'teamAutomation',
                    'teamAutomation.team',
                    'teamAutomation.team.organization',
                    'codeReviewExecutions',
                ],
            });
        });

        it('should handle undefined filter', async () => {
            // Arrange
            mockTypeOrmRepository.find.mockResolvedValue([]);

            // Act
            await repository.find(undefined);

            // Assert
            expect(mockTypeOrmRepository.find).toHaveBeenCalledWith({
                where: {},
                relations: [
                    'teamAutomation',
                    'teamAutomation.team',
                    'teamAutomation.team.organization',
                    'codeReviewExecutions',
                ],
            });
        });
    });

    describe('getFilterConditions (private method testing via find)', () => {
        it('should correctly transform nested filter objects into TypeORM query conditions', async () => {
            // Arrange
            const filter: Partial<IAutomationExecution> = {
                status: AutomationStatus.SUCCESS,
                pullRequestNumber: 123,
                teamAutomation: {
                    uuid: 'team-automation-id',
                    status: true,
                    team: {
                        uuid: 'team-id',
                        name: 'Test Team',
                        organization: {
                            uuid: 'org-id',
                            name: 'Test Organization',
                        },
                    },
                },
            };

            mockTypeOrmRepository.find.mockResolvedValue([]);

            // Act
            await repository.find(filter);

            // Assert - Verify that nested objects are flattened correctly
            expect(mockTypeOrmRepository.find).toHaveBeenCalledWith({
                where: {
                    status: AutomationStatus.SUCCESS,
                    pullRequestNumber: 123,
                    'teamAutomation.uuid': 'team-automation-id',
                    'teamAutomation.status': true,
                    'teamAutomation.team.uuid': 'team-id',
                    'teamAutomation.team.name': 'Test Team',
                    'teamAutomation.team.organization.uuid': 'org-id',
                    'teamAutomation.team.organization.name': 'Test Organization',
                },
                relations: [
                    'teamAutomation',
                    'teamAutomation.team',
                    'teamAutomation.team.organization',
                    'codeReviewExecutions',
                ],
            });
        });
    });
});
