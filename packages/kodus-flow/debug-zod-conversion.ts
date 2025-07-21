import { z } from 'zod';
import { safeJsonSchemaToZod } from './src/core/utils/json-schema-to-zod.js';
import { zodToJSONSchema } from './src/core/utils/zod-to-json-schema.js';

function debugZodConversion() {
    console.log('🧪 Debugando conversão Zod → JSON Schema...');

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

    console.log('📋 1. Schema original:');
    console.log('   Properties:', Object.keys(originalSchema.properties));
    console.log('   Required:', originalSchema.required);

    // Converter para Zod
    const zodSchema = safeJsonSchemaToZod(originalSchema);
    console.log('\n✅ 2. Schema convertido para Zod');

    // Testar validação do Zod
    try {
        const testData = {
            organizationId: 'org-123',
            teamId: 'team-456',
        };
        const result = zodSchema.parse(testData);
        console.log('   ✅ Validação Zod bem-sucedida:', result);
    } catch (error) {
        console.log('   ❌ Erro na validação Zod:', error);
    }

    // Converter de volta para JSON Schema
    const convertedBack = zodToJSONSchema(zodSchema, 'test-tool', 'Test tool');

    console.log('\n📋 3. Schema convertido de volta:');
    console.log(
        '   Properties:',
        Object.keys(convertedBack.parameters.properties),
    );
    console.log('   Required:', convertedBack.parameters.required);
    console.log(
        '   Schema completo:',
        JSON.stringify(convertedBack.parameters, null, 2),
    );

    // Verificar se os dados foram mantidos
    const originalProps = Object.keys(originalSchema.properties);
    const convertedProps = Object.keys(convertedBack.parameters.properties);
    const originalRequired = originalSchema.required;
    const convertedRequired = convertedBack.parameters.required;

    console.log('\n🔍 4. Comparação:');
    console.log(
        `   Properties iguais: ${JSON.stringify(originalProps) === JSON.stringify(convertedProps)}`,
    );
    console.log(
        `   Required iguais: ${JSON.stringify(originalRequired) === JSON.stringify(convertedRequired)}`,
    );

    if (
        JSON.stringify(originalProps) === JSON.stringify(convertedProps) &&
        JSON.stringify(originalRequired) === JSON.stringify(convertedRequired)
    ) {
        console.log('   ✅ Dados mantidos corretamente!');
    } else {
        console.log('   ❌ Dados perdidos na conversão!');
        console.log('   🔍 Investigando o problema...');

        // Debug adicional
        console.log('\n🔍 5. Debug do Zod schema:');
        console.log('   Tipo do schema:', typeof zodSchema);
        console.log('   Definição:', (zodSchema as any)._def);
    }
}

debugZodConversion();
