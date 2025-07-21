import { z } from 'zod';
import { safeJsonSchemaToZod } from './src/core/utils/json-schema-to-zod.js';

function testSchemaConversion() {
    console.log('🧪 Testando conversão de schema...');

    // Schema original do MCP
    const originalSchema = {
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
        },
        required: ['organizationId', 'teamId'],
        additionalProperties: false,
    };

    console.log('📋 Schema original:', JSON.stringify(originalSchema, null, 2));

    // Converter para Zod
    const zodSchema = safeJsonSchemaToZod(originalSchema);
    console.log('✅ Schema convertido para Zod');

    // Testar validação
    const validData = {
        organizationId: 'org-123',
        teamId: 'team-456',
    };

    try {
        const result = zodSchema.parse(validData);
        console.log('✅ Validação bem-sucedida:', result);
    } catch (error) {
        console.log('❌ Erro na validação:', error);
    }

    console.log('🎉 Teste concluído!');
}

testSchemaConversion();
