import { Test } from '@nestjs/testing';
import { SuggestionService } from '@/core/infrastructure/adapters/services/codeBase/suggestion.service';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import {
    CodeSuggestion,
    SuggestionControlConfig,
    GroupingModeSuggestions,
    LimitationType
} from '@/config/types/general/codeReview.type';
import { SeverityLevel } from '@/shared/utils/enums/severityLevel.enum';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { PriorityStatus } from '@/core/domain/pullRequests/enums/priorityStatus.enum';
import { LLM_ANALYSIS_SERVICE_TOKEN } from '@/core/infrastructure/adapters/services/codeBase/llmAnalysis.service';
import { PULL_REQUESTS_SERVICE_TOKEN } from '@/core/domain/pullRequests/contracts/pullRequests.service.contracts';
import { COMMENT_MANAGER_SERVICE_TOKEN } from '@/core/domain/codeBase/contracts/CommentManagerService.contract';

describe('SuggestionService - Kody Rules Filter Control', () => {
    let service: SuggestionService;
    let mockLogger: jest.Mocked<PinoLoggerService>;

    const mockOrgData: OrganizationAndTeamData = {
        organizationId: 'org1',
        teamId: '123',
    };

    const createMockSuggestion = (severity: SeverityLevel, label: string): CodeSuggestion => ({
        id: Math.random().toString(),
        relevantFile: 'test.ts',
        language: 'typescript',
        suggestionContent: 'Test suggestion',
        improvedCode: 'improved code',
        relevantLinesStart: 1,
        relevantLinesEnd: 1,
        label,
        severity,
        priorityStatus: PriorityStatus.PRIORITIZED
    });

    beforeEach(async () => {
        mockLogger = {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
        } as any;

        const module = await Test.createTestingModule({
            providers: [
                SuggestionService,
                { provide: PinoLoggerService, useValue: mockLogger },
                { 
                    provide: LLM_ANALYSIS_SERVICE_TOKEN, 
                    useValue: { 
                        validateImplementedSuggestions: jest.fn(),
                        filterSuggestionsSafeGuard: jest.fn(),
                        severityAnalysisAssignment: jest.fn(),
                    } 
                },
                { 
                    provide: PULL_REQUESTS_SERVICE_TOKEN, 
                    useValue: { 
                        updateSuggestion: jest.fn(),
                    } 
                },
                { 
                    provide: COMMENT_MANAGER_SERVICE_TOKEN, 
                    useValue: { 
                        repeatedCodeReviewSuggestionClustering: jest.fn(),
                        enrichParentSuggestionsWithRelated: jest.fn(),
                    } 
                },
            ],
        }).compile();

        service = module.get<SuggestionService>(SuggestionService);
    });

    describe('🎯 Controle de Filtros para Kody Rules', () => {
        it('deve aplicar filtros nas Kody Rules quando applyFiltersToKodyRules = true', async () => {
            const suggestionControl: SuggestionControlConfig = {
                maxSuggestions: 2,
                limitationType: LimitationType.PR,
                groupingMode: GroupingModeSuggestions.MINIMAL,
                severityLevelFilter: SeverityLevel.HIGH,
                applyFiltersToKodyRules: true, // ✅ Aplicar filtros
            };

            const suggestions = [
                createMockSuggestion(SeverityLevel.LOW, 'kody_rules'),      // ❌ Filtrado por severidade
                createMockSuggestion(SeverityLevel.HIGH, 'kody_rules'),     // ✅ Passa
                createMockSuggestion(SeverityLevel.CRITICAL, 'kody_rules'), // ✅ Passa  
                createMockSuggestion(SeverityLevel.HIGH, 'security'),       // ✅ Passa
                createMockSuggestion(SeverityLevel.LOW, 'security'),        // ❌ Filtrado por severidade
            ];

            const result = await service.prioritizeSuggestions(mockOrgData, suggestionControl, 123, suggestions);

            // Deve aplicar filtros: severidade + quantidade (max 2)
            expect(result.prioritizedSuggestions).toHaveLength(2);
            expect(result.discardedSuggestionsBySeverityOrQuantity).toHaveLength(3);
            
            // Kody Rules de severidade baixa devem ter sido filtradas
            const kodyRulesDiscarded = result.discardedSuggestionsBySeverityOrQuantity.filter(s => s.label === 'kody_rules');
            expect(kodyRulesDiscarded).toHaveLength(1);
            expect(kodyRulesDiscarded[0].severity).toBe(SeverityLevel.LOW);
        });

        it('deve NÃO aplicar filtros nas Kody Rules quando applyFiltersToKodyRules = false', async () => {
            const suggestionControl: SuggestionControlConfig = {
                maxSuggestions: 2,
                limitationType: LimitationType.PR,
                groupingMode: GroupingModeSuggestions.MINIMAL,
                severityLevelFilter: SeverityLevel.HIGH,
                applyFiltersToKodyRules: false, // ✅ NÃO aplicar filtros
            };

            const suggestions = [
                createMockSuggestion(SeverityLevel.LOW, 'kody_rules'),      // ✅ Passa (filtros ignorados)
                createMockSuggestion(SeverityLevel.HIGH, 'kody_rules'),     // ✅ Passa
                createMockSuggestion(SeverityLevel.HIGH, 'security'),       // ✅ Passa
                createMockSuggestion(SeverityLevel.LOW, 'security'),        // ❌ Filtrado por severidade
            ];

            const result = await service.prioritizeSuggestions(mockOrgData, suggestionControl, 123, suggestions);

            // Kody Rules passam todas, outros são filtrados
            const kodyRulesPrioritized = result.prioritizedSuggestions.filter(s => s.label === 'kody_rules');
            const securityPrioritized = result.prioritizedSuggestions.filter(s => s.label === 'security');
            
            expect(kodyRulesPrioritized).toHaveLength(2); // Todas as Kody Rules passaram
            expect(securityPrioritized).toHaveLength(1);  // Apenas security HIGH passou
            
            // Verifica que security LOW foi descartada, mas nenhuma Kody Rule
            const kodyRulesDiscarded = result.discardedSuggestionsBySeverityOrQuantity.filter(s => s.label === 'kody_rules');
            expect(kodyRulesDiscarded).toHaveLength(0); // Nenhuma Kody Rule descartada
        });

        it('deve usar padrão (false) quando applyFiltersToKodyRules não está definido', async () => {
            const suggestionControl: SuggestionControlConfig = {
                maxSuggestions: 5,
                limitationType: LimitationType.PR,
                groupingMode: GroupingModeSuggestions.MINIMAL,
                severityLevelFilter: SeverityLevel.CRITICAL,
                // applyFiltersToKodyRules não definido (undefined)
            };

            const suggestions = [
                createMockSuggestion(SeverityLevel.LOW, 'kody_rules'),    // ✅ Passa (filtros ignorados)
                createMockSuggestion(SeverityLevel.CRITICAL, 'security'), // ✅ Passa
                createMockSuggestion(SeverityLevel.HIGH, 'security'),     // ❌ Filtrado por severidade
            ];

            const result = await service.prioritizeSuggestions(mockOrgData, suggestionControl, 123, suggestions);

            // Kody Rules sempre passam quando filtros não são aplicados (padrão)
            const kodyRulesPrioritized = result.prioritizedSuggestions.filter(s => s.label === 'kody_rules');
            expect(kodyRulesPrioritized).toHaveLength(1);
            
            // Apenas security CRITICAL passou
            const securityPrioritized = result.prioritizedSuggestions.filter(s => s.label === 'security');
            expect(securityPrioritized).toHaveLength(1);
        });

        it('deve processar sugestões normalmente quando não há Kody Rules', async () => {
            const suggestionControl: SuggestionControlConfig = {
                maxSuggestions: 2,
                limitationType: LimitationType.PR,
                groupingMode: GroupingModeSuggestions.MINIMAL,
                severityLevelFilter: SeverityLevel.HIGH,
                applyFiltersToKodyRules: false, // Não importa, não há Kody Rules
            };

            const suggestions = [
                createMockSuggestion(SeverityLevel.HIGH, 'security'),       // ✅ Passa
                createMockSuggestion(SeverityLevel.CRITICAL, 'security'),   // ✅ Passa
                createMockSuggestion(SeverityLevel.LOW, 'security'),        // ❌ Filtrado por severidade
            ];

            const result = await service.prioritizeSuggestions(mockOrgData, suggestionControl, 123, suggestions);

            // Deve usar lógica original sem Kody Rules
            expect(result.prioritizedSuggestions).toHaveLength(2);
            expect(result.discardedSuggestionsBySeverityOrQuantity).toHaveLength(1);
        });

        it('deve normalizar labels corretamente', () => {
            expect(service.normalizeLabel('Kody Rules')).toBe('kody_rules');
            expect(service.normalizeLabel('CODE_STYLE')).toBe('code_style');
            expect(service.normalizeLabel('  test  ')).toBe('_test_');
            expect(service.normalizeLabel('')).toBe('');
            expect(service.normalizeLabel('Performance and Optimization')).toBe('performance_and_optimization');
        });
    });
}); 