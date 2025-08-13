import { describe, test, expect } from 'vitest';
import { PlannerPromptComposer } from '../../../../../src/engine/planning/strategies/prompts/planner-prompt-composer.js';

describe('🔍 formatAdditionalContext - Teste Abrangente', () => {
    const composer = new PlannerPromptComposer({
        customExamples: [],
        examplesProvider: undefined,
        patternsProvider: undefined,
    });

    // Acessar o método privado para teste
    const formatAdditionalContext = (
        composer as unknown as { formatAdditionalContext: () => string }
    ).formatAdditionalContext.bind(composer);

    describe('✅ Casos Reais do Contexto', () => {
        test('deve formatar organizationAndTeamData real', () => {
            const additionalContext = {
                userContext: {
                    organizationAndTeamData: {
                        organization: {
                            id: 'org-123',
                            name: 'Kodus',
                            plan: 'enterprise',
                        },
                        team: {
                            id: 'team-456',
                            name: 'Engineering',
                            members: ['john', 'jane', 'bob'],
                        },
                        permissions: ['read', 'write', 'admin'],
                        settings: {
                            notifications: true,
                            theme: 'dark',
                        },
                    },
                    additionalInformation: {
                        priority: 'high',
                        category: 'bug',
                        severity: 'critical',
                        assignee: 'john@example.com',
                        dueDate: '2024-01-20',
                        tags: ['urgent', 'frontend'],
                    },
                },
                agentIdentity: {
                    description:
                        'Agente de conversação para interações com usuários.',
                },
            };

            const result = formatAdditionalContext(additionalContext);

            // Verificar se não mostra [Object]
            expect(result).not.toContain('[Object]');

            // Verificar se mostra conteúdo real
            expect(result).toContain('Kodus');
            expect(result).toContain('Engineering');
            expect(result).toContain('priority: high');
            expect(result).toContain('category: bug');
            expect(result).toContain('urgent, frontend');

            // Verificar estrutura
            expect(result).toContain('## 🔍 ADDITIONAL INFO');
            expect(result).toContain('### 👤 USER CONTEXT');
            expect(result).toContain('### 🤖 AGENT IDENTITY');
        });

        test('deve lidar com objetos grandes (deve mostrar resumo)', () => {
            const bigObject = {
                prop1: 'value1',
                prop2: 'value2',
                prop3: 'value3',
                prop4: 'value4',
                prop5: 'value5',
                prop6: 'value6',
                prop7: 'value7',
            };

            const additionalContext = {
                userContext: {
                    bigData: bigObject,
                },
            };

            const result = formatAdditionalContext(additionalContext);

            // Deve mostrar resumo para objetos grandes
            expect(result).toContain('prop1, prop2, prop3, ... +4 more');
        });

        test('deve lidar com valores nulos e undefined', () => {
            const additionalContext = {
                userContext: {
                    testData: {
                        name: 'John',
                        age: null,
                        email: undefined,
                        active: true,
                    },
                },
            };

            const result = formatAdditionalContext(additionalContext);

            expect(result).toContain('name: John');
            expect(result).toContain('age: null');
            expect(result).toContain('email: undefined');
            expect(result).toContain('active: true');
        });

        test('deve lidar com arrays', () => {
            const additionalContext = {
                userContext: {
                    tags: ['bug', 'urgent', 'frontend'],
                    numbers: [1, 2, 3, 4, 5],
                    mixed: ['text', 42, true, null],
                },
            };

            const result = formatAdditionalContext(additionalContext);

            expect(result).toContain('tags: bug, urgent, frontend');
            expect(result).toContain('numbers: 1, 2, 3, 4, 5');
            expect(result).toContain('mixed: text, 42, true, null');
        });
    });
});
