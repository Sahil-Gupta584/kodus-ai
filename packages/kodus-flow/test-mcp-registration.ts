/**
 * Teste da conversão de JSON Schema para Zod
 */

import { safeJsonSchemaToZod } from './src/core/utils/json-schema-to-zod.js';

async function testSchemaConversion() {
    console.log('🧪 Testando conversão de JSON Schema para Zod...');

    // Teste com um schema do GitHub MCP
    const testSchema = {
        type: 'object',
        properties: {
            organizationId: {
                type: 'string',
                description: 'Organization UUID',
            },
            teamId: {
                type: 'string',
                description: 'Team UUID',
            },
            filters: {
                type: 'object',
                properties: {
                    archived: {
                        type: 'boolean',
                    },
                    private: {
                        type: 'boolean',
                    },
                    language: {
                        type: 'string',
                    },
                },
                additionalProperties: false,
            },
        },
        required: ['organizationId', 'teamId'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#',
    };

    console.log('\n📋 Schema original:');
    console.log(JSON.stringify(testSchema, null, 2));

    try {
        // Converter para Zod
        const zodSchema = safeJsonSchemaToZod(testSchema);
        console.log('\n✅ Schema convertido para Zod:', typeof zodSchema);

        // Testar validação com dados válidos
        const validInput = {
            organizationId: 'org-123',
            teamId: 'team-456',
            filters: {
                archived: false,
                private: true,
                language: 'typescript',
            },
        };

        console.log('\n🧪 Testando validação com dados válidos...');
        const validResult = zodSchema.safeParse(validInput);
        console.log('✅ Resultado:', validResult.success ? 'PASSOU' : 'FALHOU');
        if (!validResult.success) {
            console.log('❌ Erros:', validResult.error);
        }

        // Testar validação com dados inválidos
        const invalidInput = {
            organizationId: 'org-123',
            // Falta teamId (required)
        };

        console.log('\n🧪 Testando validação com dados inválidos...');
        const invalidResult = zodSchema.safeParse(invalidInput);
        console.log(
            '✅ Resultado:',
            invalidResult.success ? 'PASSOU' : 'FALHOU',
        );
        if (!invalidResult.success) {
            console.log('❌ Erros esperados:', invalidResult.error);
        }

        console.log('\n🎉 Teste concluído com sucesso!');
    } catch (error) {
        console.error('❌ Erro no teste:', error);
        if (error instanceof Error) {
            console.error('Stack:', error.stack);
        }
    }
}

testSchemaConversion().catch(console.error);
