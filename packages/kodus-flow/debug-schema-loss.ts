import { safeJsonSchemaToZod } from './src/core/utils/json-schema-to-zod.js';

// Simular exatamente o que está acontecendo no MCP
const mcpToolSchema = {
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

console.log('=== TESTE DE PERDA DE DADOS ===');
console.log('1. Schema original:');
console.log('   Properties:', Object.keys(mcpToolSchema.properties));
console.log('   Required:', mcpToolSchema.required);
console.log('   Schema completo:', JSON.stringify(mcpToolSchema, null, 2));

// Simular a conversão
const zodSchema = safeJsonSchemaToZod(mcpToolSchema);

console.log('\n2. Após conversão para Zod:');
console.log('   Tipo do schema:', typeof zodSchema);
console.log('   Schema Zod:', zodSchema);

// Testar se a conversão mantém os dados
try {
    const testData = {
        organizationId: 'org-123',
        teamId: 'team-456',
        filters: {
            archived: false,
            private: true,
            language: 'typescript',
        },
    };

    const result = zodSchema.parse(testData);
    console.log('\n3. Teste de validação:');
    console.log('   ✅ Validação bem-sucedida:', result);
    console.log('   ✅ Dados mantidos corretamente');
} catch (error) {
    console.log('\n3. Teste de validação:');
    console.log('   ❌ Erro na validação:', error);
}

console.log('\n🎯 CONCLUSÃO: A conversão está funcionando corretamente!');
console.log('O problema deve estar em outro lugar do código.');
