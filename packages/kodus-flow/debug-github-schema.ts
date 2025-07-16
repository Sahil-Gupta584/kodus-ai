/**
 * Debug script para testar schema GitHub MCP
 */

import { safeJsonSchemaToZod } from './src/core/utils/json-schema-to-zod.js';

// Schema do GitHub MCP que está causando problema
const githubSchema = {
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

console.log('🔍 Testando schema GitHub MCP...');
console.log('Schema:', JSON.stringify(githubSchema, null, 2));

try {
    const zodSchema = safeJsonSchemaToZod(githubSchema);
    console.log('✅ Conversão bem-sucedida!');
    console.log('Zod schema criado:', typeof zodSchema);

    // Teste de validação
    const validInput = {
        organizationId: 'org-123',
        teamId: 'team-456',
        filters: {
            archived: false,
            private: true,
            language: 'typescript',
        },
    };

    const invalidInput = {
        organizationId: 'org-123',
        // teamId faltando
        filters: {
            archived: 'invalid', // deveria ser boolean
            private: true,
        },
    };

    console.log('\n🧪 Testando validação...');
    console.log('Input válido:', JSON.stringify(validInput, null, 2));
    const validResult = zodSchema.safeParse(validInput);
    console.log('Resultado válido:', validResult.success ? '✅' : '❌');
    if (!validResult.success) {
        console.log('Erros:', validResult.error);
    }

    console.log('\nInput inválido:', JSON.stringify(invalidInput, null, 2));
    const invalidResult = zodSchema.safeParse(invalidInput);
    console.log('Resultado inválido:', invalidResult.success ? '❌' : '✅');
    if (!invalidResult.success) {
        console.log('Erros esperados:', invalidResult.error);
    }
} catch (error) {
    console.error('❌ Erro na conversão:', error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack');
}
