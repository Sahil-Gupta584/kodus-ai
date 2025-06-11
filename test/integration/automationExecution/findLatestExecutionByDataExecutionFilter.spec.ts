import { AutomationExecutionEntity } from '@/core/domain/automation/entities/automation-execution.entity';
import { AutomationStatus } from '@/core/domain/automation/enums/automation-status';
import { AutomationExecutionRepository } from '@/core/infrastructure/adapters/repositories/typeorm/automationExecution.repository';
import { AutomationExecutionModel } from '@/core/infrastructure/adapters/repositories/typeorm/schema/automationExecution.model';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

describe('AutomationExecutionRepository - Backward Compatibility', () => {
    let repository: AutomationExecutionRepository;
    let mockTypeOrmRepository: jest.Mocked<Repository<AutomationExecutionModel>>;
    let queryBuilder: any;

    const mockTeamAutomationId = 'team-123-uuid';
    const pullRequestNumber = 45;
    const repositoryId = 'repo-456-uuid';

    beforeEach(async () => {
        // Mock do QueryBuilder
        queryBuilder = {
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            getOne: jest.fn(),
        };

        mockTypeOrmRepository = {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AutomationExecutionRepository,
                {
                    provide: getRepositoryToken(AutomationExecutionModel),
                    useValue: mockTypeOrmRepository,
                },
            ],
        }).compile();

        repository = module.get<AutomationExecutionRepository>(AutomationExecutionRepository);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Cenário 1 - Dados apenas no formato antigo (jsonB)', () => {
        it('deve encontrar execution com dados no formato antigo quando não há dados nas colunas separadas', async () => {
            // Arrange
            const oldFormatExecution: AutomationExecutionModel = {
                uuid: 'execution-old-uuid',
                createdAt: new Date('2025-01-15T10:00:00Z'),
                updatedAt: new Date('2025-01-15T10:00:00Z'),
                status: AutomationStatus.SUCCESS,
                dataExecution: {
                    pullRequestNumber: pullRequestNumber,
                    platformType: 'GITHUB',
                    // Outros dados do jsonB
                    noteId: null,
                    threadId: null,
                    commentId: 2960318631,
                    overallComments: []
                },
                // Colunas separadas são null (formato antigo)
                pullRequestNumber: null,
                repositoryId: null,
                teamAutomation: { uuid: mockTeamAutomationId } as any,
                origin: 'github',
                errorMessage: null,
            };

            // Mock: primeira busca (por colunas separadas) retorna null
            // Segunda busca (por jsonB) retorna o dado antigo
            queryBuilder.getOne
                .mockResolvedValueOnce(null) // Primeira tentativa falha
                .mockResolvedValueOnce(oldFormatExecution); // Segunda tentativa encontra

            const dataExecutionFilter = {
                pullRequestNumber: pullRequestNumber,
                platformType: 'GITHUB'
            };

            const additionalFilters = {
                pullRequestNumber: pullRequestNumber,
                repositoryId: repositoryId,
                status: AutomationStatus.SUCCESS,
                teamAutomation: { uuid: mockTeamAutomationId }
            };

            // Act
            const result = await repository.findLatestExecutionByDataExecutionFilter(
                dataExecutionFilter,
                additionalFilters
            );

            // Assert
            expect(result).toBeInstanceOf(AutomationExecutionEntity);
            expect(result.uuid).toBe('execution-old-uuid');
            expect(result.dataExecution.pullRequestNumber).toBe(pullRequestNumber);
            expect(result.pullRequestNumber).toBeNull(); // Coluna separada ainda é null
            expect(result.repositoryId).toBeNull(); // Coluna separada ainda é null

            // Verifica que tentou buscar pelas colunas separadas primeiro
            expect(mockTypeOrmRepository.createQueryBuilder).toHaveBeenCalledTimes(2);

            // Primeira busca - por colunas separadas
            expect(queryBuilder.andWhere).toHaveBeenCalledWith(
                'automation_execution.pullRequestNumber = :pullRequestNumber',
                { pullRequestNumber }
            );
            expect(queryBuilder.andWhere).toHaveBeenCalledWith(
                'automation_execution.repositoryId = :repositoryId',
                { repositoryId }
            );

            // Segunda busca - por jsonB (formato antigo)
            expect(queryBuilder.andWhere).toHaveBeenCalledWith(
                'automation_execution.dataExecution @> :dataExecutionFilter',
                {
                    dataExecutionFilter: JSON.stringify(dataExecutionFilter)
                }
            );
        });

        it('deve retornar a execution mais recente quando há múltiplas executions antigas para o mesmo PR', async () => {
            // Arrange
            const olderExecution: AutomationExecutionModel = {
                uuid: 'execution-older-uuid',
                createdAt: new Date('2025-01-10T10:00:00Z'),
                updatedAt: new Date('2025-01-10T10:00:00Z'),
                status: AutomationStatus.SUCCESS,
                dataExecution: {
                    pullRequestNumber: pullRequestNumber,
                    platformType: 'GITHUB'
                },
                pullRequestNumber: null,
                repositoryId: null,
                teamAutomation: { uuid: mockTeamAutomationId } as any,
                origin: 'github',
                errorMessage: null,
            };

            const newerExecution: AutomationExecutionModel = {
                uuid: 'execution-newer-uuid',
                createdAt: new Date('2025-01-15T10:00:00Z'), // Mais recente
                updatedAt: new Date('2025-01-15T10:00:00Z'),
                status: AutomationStatus.SUCCESS,
                dataExecution: {
                    pullRequestNumber: pullRequestNumber,
                    platformType: 'GITHUB'
                },
                pullRequestNumber: null,
                repositoryId: null,
                teamAutomation: { uuid: mockTeamAutomationId } as any,
                origin: 'github',
                errorMessage: null,
            };

            // Mock: primeira busca falha, segunda busca retorna a mais recente
            queryBuilder.getOne
                .mockResolvedValueOnce(null) // Primeira tentativa falha
                .mockResolvedValueOnce(newerExecution); // Segunda tentativa retorna a mais recente

            const dataExecutionFilter = {
                pullRequestNumber: pullRequestNumber,
                platformType: 'GITHUB'
            };

            const additionalFilters = {
                pullRequestNumber: pullRequestNumber,
                repositoryId: repositoryId,
                status: AutomationStatus.SUCCESS,
                teamAutomation: { uuid: mockTeamAutomationId }
            };

            // Act
            const result = await repository.findLatestExecutionByDataExecutionFilter(
                dataExecutionFilter,
                additionalFilters
            );

            // Assert
            expect(result).toBeInstanceOf(AutomationExecutionEntity);
            expect(result.uuid).toBe('execution-newer-uuid');
            expect(result.createdAt).toEqual(new Date('2025-01-15T10:00:00Z'));

            // Verifica que aplicou ordenação por data de criação DESC
            expect(queryBuilder.orderBy).toHaveBeenCalledWith(
                'automation_execution.createdAt',
                'DESC'
            );
        });

        it('deve filtrar corretamente por status SUCCESS e teamAutomationId no formato antigo', async () => {
            // Arrange
            const successExecution: AutomationExecutionModel = {
                uuid: 'execution-success-uuid',
                createdAt: new Date('2025-01-15T10:00:00Z'),
                updatedAt: new Date('2025-01-15T10:00:00Z'),
                status: AutomationStatus.SUCCESS,
                dataExecution: {
                    pullRequestNumber: pullRequestNumber,
                    platformType: 'GITHUB'
                },
                pullRequestNumber: null,
                repositoryId: null,
                teamAutomation: { uuid: mockTeamAutomationId } as any,
                origin: 'github',
                errorMessage: null,
            };

            queryBuilder.getOne
                .mockResolvedValueOnce(null) // Primeira tentativa falha
                .mockResolvedValueOnce(successExecution); // Segunda tentativa encontra

            const dataExecutionFilter = {
                pullRequestNumber: pullRequestNumber,
                platformType: 'GITHUB'
            };

            const additionalFilters = {
                pullRequestNumber: pullRequestNumber,
                repositoryId: repositoryId,
                status: AutomationStatus.SUCCESS,
                teamAutomation: { uuid: mockTeamAutomationId }
            };

            // Act
            const result = await repository.findLatestExecutionByDataExecutionFilter(
                dataExecutionFilter,
                additionalFilters
            );

            // Assert
            expect(result).toBeInstanceOf(AutomationExecutionEntity);
            expect(result.status).toBe(AutomationStatus.SUCCESS);

            // Verifica que filtrou por status e teamAutomation na segunda busca
            expect(queryBuilder.andWhere).toHaveBeenCalledWith(
                'automation_execution.status = :status',
                { status: AutomationStatus.SUCCESS }
            );
            expect(queryBuilder.andWhere).toHaveBeenCalledWith(
                'automation_execution.teamAutomation = :teamAutomation',
                { teamAutomation: mockTeamAutomationId }
            );
        });

        it('deve retornar null quando não encontra dados nem no formato novo nem no antigo', async () => {
            // Arrange
            queryBuilder.getOne
                .mockResolvedValueOnce(null) // Primeira tentativa falha
                .mockResolvedValueOnce(null); // Segunda tentativa também falha

            const dataExecutionFilter = {
                pullRequestNumber: 999, // PR que não existe
                platformType: 'GITHUB'
            };

            const additionalFilters = {
                pullRequestNumber: 999,
                repositoryId: 'inexistente-repo-id',
                status: AutomationStatus.SUCCESS,
                teamAutomation: { uuid: mockTeamAutomationId }
            };

            // Act
            const result = await repository.findLatestExecutionByDataExecutionFilter(
                dataExecutionFilter,
                additionalFilters
            );

            // Assert
            expect(result).toBeNull();
            expect(mockTypeOrmRepository.createQueryBuilder).toHaveBeenCalledTimes(2);
        });
    });
});

describe('AutomationExecutionRepository - Forward Compatibility', () => {
    let repository: AutomationExecutionRepository;
    let mockTypeOrmRepository: jest.Mocked<Repository<AutomationExecutionModel>>;
    let queryBuilder: any;

    const mockTeamAutomationId = 'team-456-uuid';
    const pullRequestNumber = 14000;
    const repositoryId = 'repo-789-uuid';

    beforeEach(async () => {
        queryBuilder = {
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            getOne: jest.fn(),
        };

        mockTypeOrmRepository = {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AutomationExecutionRepository,
                {
                    provide: getRepositoryToken(AutomationExecutionModel),
                    useValue: mockTypeOrmRepository,
                },
            ],
        }).compile();

        repository = module.get<AutomationExecutionRepository>(AutomationExecutionRepository);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Cenário 2 - Dados no formato novo (colunas separadas)', () => {
        it('deve encontrar execution com dados nas colunas separadas na primeira tentativa', async () => {
            // Arrange
            const newFormatExecution: AutomationExecutionModel = {
                uuid: 'execution-new-uuid',
                createdAt: new Date('2025-06-10T15:30:00Z'),
                updatedAt: new Date('2025-06-10T15:30:00Z'),
                status: AutomationStatus.SUCCESS,
                dataExecution: {
                    // jsonB ainda tem os dados, mas agora também temos colunas separadas
                    pullRequestNumber: pullRequestNumber,
                    platformType: 'GITHUB',
                    noteId: null,
                    threadId: null,
                    commentId: 2960318631,
                    overallComments: []
                },
                // Colunas separadas preenchidas (formato novo)
                pullRequestNumber: pullRequestNumber,
                repositoryId: repositoryId,
                teamAutomation: { uuid: mockTeamAutomationId } as any,
                origin: 'github',
                errorMessage: null,
            };

            // Mock: primeira busca (por colunas separadas) já encontra o resultado
            queryBuilder.getOne.mockResolvedValueOnce(newFormatExecution);

            const dataExecutionFilter = {
                pullRequestNumber: pullRequestNumber,
                platformType: 'GITHUB'
            };

            const additionalFilters = {
                pullRequestNumber: pullRequestNumber,
                repositoryId: repositoryId,
                status: AutomationStatus.SUCCESS,
                teamAutomation: { uuid: mockTeamAutomationId }
            };

            // Act
            const result = await repository.findLatestExecutionByDataExecutionFilter(
                dataExecutionFilter,
                additionalFilters
            );

            // Assert
            expect(result).toBeInstanceOf(AutomationExecutionEntity);
            expect(result.uuid).toBe('execution-new-uuid');
            expect(result.pullRequestNumber).toBe(pullRequestNumber);
            expect(result.repositoryId).toBe(repositoryId);

            // Verifica que fez apenas uma busca (primeira tentativa funcionou)
            expect(mockTypeOrmRepository.createQueryBuilder).toHaveBeenCalledTimes(1);

            // Verifica que usou as colunas separadas
            expect(queryBuilder.andWhere).toHaveBeenCalledWith(
                'automation_execution.pullRequestNumber = :pullRequestNumber',
                { pullRequestNumber }
            );
            expect(queryBuilder.andWhere).toHaveBeenCalledWith(
                'automation_execution.repositoryId = :repositoryId',
                { repositoryId }
            );
            expect(queryBuilder.andWhere).toHaveBeenCalledWith(
                'automation_execution.status = :status',
                { status: AutomationStatus.SUCCESS }
            );

            // Não deve tentar buscar no jsonB
            expect(queryBuilder.andWhere).not.toHaveBeenCalledWith(
                'automation_execution.dataExecution @> :dataExecutionFilter',
                expect.any(Object)
            );
        });

        it('deve distinguir entre PRs com mesmo número em repositórios diferentes', async () => {
            // Arrange
            const repo1Execution: AutomationExecutionModel = {
                uuid: 'execution-repo1-uuid',
                createdAt: new Date('2025-06-10T15:30:00Z'),
                updatedAt: new Date('2025-06-10T15:30:00Z'),
                status: AutomationStatus.SUCCESS,
                dataExecution: {
                    pullRequestNumber: 45,
                    platformType: 'GITHUB'
                },
                pullRequestNumber: 45,
                repositoryId: 'repo-1-uuid',
                teamAutomation: { uuid: mockTeamAutomationId } as any,
                origin: 'github',
                errorMessage: null,
            };

            queryBuilder.getOne.mockResolvedValueOnce(repo1Execution);

            const dataExecutionFilter = {
                pullRequestNumber: 45,
                platformType: 'GITHUB'
            };

            const additionalFilters = {
                pullRequestNumber: 45,
                repositoryId: 'repo-1-uuid', // Específico para repo 1
                status: AutomationStatus.SUCCESS,
                teamAutomation: { uuid: mockTeamAutomationId }
            };

            // Act
            const result = await repository.findLatestExecutionByDataExecutionFilter(
                dataExecutionFilter,
                additionalFilters
            );

            // Assert
            expect(result).toBeInstanceOf(AutomationExecutionEntity);
            expect(result.uuid).toBe('execution-repo1-uuid');
            expect(result.pullRequestNumber).toBe(45);
            expect(result.repositoryId).toBe('repo-1-uuid');

            // Verifica que filtrou pelo repositoryId específico
            expect(queryBuilder.andWhere).toHaveBeenCalledWith(
                'automation_execution.repositoryId = :repositoryId',
                { repositoryId: 'repo-1-uuid' }
            );
        });

        it('deve retornar a execution mais recente quando há múltiplas executions novas para o mesmo PR e repositório', async () => {
            // Arrange
            const newestExecution: AutomationExecutionModel = {
                uuid: 'execution-newest-uuid',
                createdAt: new Date('2025-06-11T10:00:00Z'), // Mais recente
                updatedAt: new Date('2025-06-11T10:00:00Z'),
                status: AutomationStatus.SUCCESS,
                dataExecution: {
                    pullRequestNumber: pullRequestNumber,
                    platformType: 'GITHUB'
                },
                pullRequestNumber: pullRequestNumber,
                repositoryId: repositoryId,
                teamAutomation: { uuid: mockTeamAutomationId } as any,
                origin: 'github',
                errorMessage: null,
            };

            queryBuilder.getOne.mockResolvedValueOnce(newestExecution);

            const dataExecutionFilter = {
                pullRequestNumber: pullRequestNumber,
                platformType: 'GITHUB'
            };

            const additionalFilters = {
                pullRequestNumber: pullRequestNumber,
                repositoryId: repositoryId,
                status: AutomationStatus.SUCCESS,
                teamAutomation: { uuid: mockTeamAutomationId }
            };

            // Act
            const result = await repository.findLatestExecutionByDataExecutionFilter(
                dataExecutionFilter,
                additionalFilters
            );

            // Assert
            expect(result).toBeInstanceOf(AutomationExecutionEntity);
            expect(result.uuid).toBe('execution-newest-uuid');
            expect(result.createdAt).toEqual(new Date('2025-06-11T10:00:00Z'));

            // Verifica que aplicou ordenação por data de criação DESC
            expect(queryBuilder.orderBy).toHaveBeenCalledWith(
                'automation_execution.createdAt',
                'DESC'
            );
        });

        it('deve filtrar corretamente executions com status diferente de SUCCESS', async () => {
            // Arrange
            queryBuilder.getOne.mockResolvedValueOnce(null); // Não encontra execution com status SUCCESS

            const dataExecutionFilter = {
                pullRequestNumber: pullRequestNumber,
                platformType: 'GITHUB'
            };

            const additionalFilters = {
                pullRequestNumber: pullRequestNumber,
                repositoryId: repositoryId,
                status: AutomationStatus.SUCCESS, // Busca apenas SUCCESS
                teamAutomation: { uuid: mockTeamAutomationId }
            };

            // Act
            const result = await repository.findLatestExecutionByDataExecutionFilter(
                dataExecutionFilter,
                additionalFilters
            );

            // Assert
            expect(result).toBeNull();

            // Verifica que filtrou por status SUCCESS
            expect(queryBuilder.andWhere).toHaveBeenCalledWith(
                'automation_execution.status = :status',
                { status: AutomationStatus.SUCCESS }
            );
        });

        it('deve considerar teamAutomationId quando busca por dados do formato novo', async () => {
            // Arrange
            const correctTeamExecution: AutomationExecutionModel = {
                uuid: 'execution-correct-team-uuid',
                createdAt: new Date('2025-06-10T15:30:00Z'),
                updatedAt: new Date('2025-06-10T15:30:00Z'),
                status: AutomationStatus.SUCCESS,
                dataExecution: {
                    pullRequestNumber: pullRequestNumber,
                    platformType: 'GITHUB'
                },
                pullRequestNumber: pullRequestNumber,
                repositoryId: repositoryId,
                teamAutomation: { uuid: mockTeamAutomationId } as any,
                origin: 'github',
                errorMessage: null,
            };

            queryBuilder.getOne.mockResolvedValueOnce(correctTeamExecution);

            const dataExecutionFilter = {
                pullRequestNumber: pullRequestNumber,
                platformType: 'GITHUB'
            };

            const additionalFilters = {
                pullRequestNumber: pullRequestNumber,
                repositoryId: repositoryId,
                status: AutomationStatus.SUCCESS,
                teamAutomation: { uuid: mockTeamAutomationId }
            };

            // Act
            const result = await repository.findLatestExecutionByDataExecutionFilter(
                dataExecutionFilter,
                additionalFilters
            );

            // Assert
            expect(result).toBeInstanceOf(AutomationExecutionEntity);
            expect(result.teamAutomation.uuid).toBe(mockTeamAutomationId);

            // Verifica que filtrou pelo teamAutomationId correto
            expect(queryBuilder.andWhere).toHaveBeenCalledWith(
                'automation_execution.teamAutomation = :teamAutomation',
                { teamAutomation: mockTeamAutomationId }
            );
        });

        it('deve trabalhar com diferentes plataformas no formato novo', async () => {
            // Arrange
            const azureExecution: AutomationExecutionModel = {
                uuid: 'execution-azure-uuid',
                createdAt: new Date('2025-06-10T15:30:00Z'),
                updatedAt: new Date('2025-06-10T15:30:00Z'),
                status: AutomationStatus.SUCCESS,
                dataExecution: {
                    pullRequestNumber: pullRequestNumber,
                    platformType: 'AZURE_REPOS' // Diferente plataforma
                },
                pullRequestNumber: pullRequestNumber,
                repositoryId: repositoryId,
                teamAutomation: { uuid: mockTeamAutomationId } as any,
                origin: 'azure',
                errorMessage: null,
            };

            queryBuilder.getOne.mockResolvedValueOnce(azureExecution);

            const dataExecutionFilter = {
                pullRequestNumber: pullRequestNumber,
                platformType: 'AZURE_REPOS'
            };

            const additionalFilters = {
                pullRequestNumber: pullRequestNumber,
                repositoryId: repositoryId,
                status: AutomationStatus.SUCCESS,
                teamAutomation: { uuid: mockTeamAutomationId }
            };

            // Act
            const result = await repository.findLatestExecutionByDataExecutionFilter(
                dataExecutionFilter,
                additionalFilters
            );

            // Assert
            expect(result).toBeInstanceOf(AutomationExecutionEntity);
            expect(result.dataExecution.platformType).toBe('AZURE_REPOS');
            expect(result.origin).toBe('azure');

            // No formato novo, não filtramos por platformType, apenas pelas colunas
            expect(queryBuilder.andWhere).toHaveBeenCalledWith(
                'automation_execution.pullRequestNumber = :pullRequestNumber',
                { pullRequestNumber }
            );
            expect(queryBuilder.andWhere).toHaveBeenCalledWith(
                'automation_execution.repositoryId = :repositoryId',
                { repositoryId }
            );
        });
    });
});