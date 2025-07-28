import { z } from 'zod';
import { zodToJSONSchema } from './src/core/utils/zod-to-json-schema.js';

function debugSchemaLoss() {
    console.log('🧪 Debugando perda de informações no schema...');

    // Schema original do MCP (como você mostrou)
    const originalSchema = z.object({
        organizationId: z
            .string()
            .describe(
                'Organization UUID - unique identifier for the organization in the system',
            ),
        teamId: z
            .string()
            .describe(
                'Team UUID - unique identifier for the team within the organization',
            ),
        filters: z
            .object({
                archived: z
                    .boolean()
                    .optional()
                    .describe(
                        'Filter by archived status: true (only archived repos), false (only active repos), undefined (all repos)',
                    ),
                private: z
                    .boolean()
                    .optional()
                    .describe(
                        'Filter by visibility: true (only private repos), false (only public repos), undefined (all repos)',
                    ),
                language: z
                    .string()
                    .optional()
                    .describe(
                        'Filter by primary programming language (e.g., "JavaScript", "TypeScript", "Python")',
                    ),
            })
            .optional()
            .describe('Optional filters to narrow down repository results'),
    });

    console.log('📋 1. Schema Zod original:');
    console.log('   - organizationId: required string');
    console.log('   - teamId: required string');
    console.log('   - filters: optional object');

    // Converter para JSON Schema
    const jsonSchema = zodToJSONSchema(
        originalSchema,
        'list_repositories',
        'List all repositories accessible to the team',
    );

    console.log('\n📋 2. JSON Schema convertido:');
    console.log(
        '   Properties:',
        Object.keys(jsonSchema.parameters.properties),
    );
    console.log('   Required:', jsonSchema.parameters.required);
    console.log(
        '   Schema completo:',
        JSON.stringify(jsonSchema.parameters, null, 2),
    );

    // Verificar se filters está sendo marcado como required incorretamente
    const filtersProperty = jsonSchema.parameters.properties.filters;
    console.log('\n🔍 3. Propriedade filters:');
    console.log('   Tipo:', filtersProperty?.type);
    console.log('   Descrição:', filtersProperty?.description);
    console.log(
        '   Está em required?',
        jsonSchema.parameters.required?.includes('filters'),
    );

    // Testar validação
    console.log('\n🧪 4. Testando validação:');

    // Teste 1: Dados válidos sem filters
    try {
        const result1 = originalSchema.parse({
            organizationId: 'org-123',
            teamId: 'team-456',
        });
        console.log('   ✅ Válido sem filters:', result1);
    } catch (error) {
        console.log('   ❌ Erro sem filters:', error);
    }

    // Teste 2: Dados válidos com filters
    try {
        const result2 = originalSchema.parse({
            organizationId: 'org-123',
            teamId: 'team-456',
            filters: {
                archived: false,
                language: 'TypeScript',
            },
        });
        console.log('   ✅ Válido com filters:', result2);
    } catch (error) {
        console.log('   ❌ Erro com filters:', error);
    }

    // Teste 3: Dados inválidos (faltando required)
    try {
        const result3 = originalSchema.parse({
            organizationId: 'org-123',
            // teamId faltando
        });
        console.log('   ✅ Válido sem teamId (deveria falhar):', result3);
    } catch (error) {
        console.log('   ❌ Erro sem teamId (correto):', error);
    }
}

debugSchemaLoss();
