import { safeJsonSchemaToZod } from './src/core/utils/json-schema-to-zod.js';
import { zodToJSONSchema } from './src/core/utils/zod-to-json-schema.js';

function testSchemaConversion() {
    console.log('🧪 Testando conversão completa de schema...');

    // Simular o schema do MCP
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
        },
        required: ['organizationId', 'teamId'],
        additionalProperties: false,
    };

    console.log('📋 1. Schema original do MCP:');
    console.log('   Properties:', Object.keys(mcpToolSchema.properties));
    console.log('   Required:', mcpToolSchema.required);

    // Simular a conversão que acontece no registerMCPTools
    const zodSchema = safeJsonSchemaToZod(mcpToolSchema);
    console.log('\n✅ 2. Schema convertido para Zod');

    // Simular a conversão de volta para JSON Schema (como acontece no getToolsForLLM)
    try {
        const convertedBack = zodToJSONSchema(
            zodSchema,
            'test-tool',
            'Test tool',
        );

        console.log('\n📋 3. Schema convertido de volta para JSON Schema:');
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
        const originalProps = Object.keys(mcpToolSchema.properties);
        const convertedProps = Object.keys(convertedBack.parameters.properties);
        const originalRequired = mcpToolSchema.required;
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
            JSON.stringify(originalRequired) ===
                JSON.stringify(convertedRequired)
        ) {
            console.log('   ✅ Dados mantidos corretamente!');
        } else {
            console.log('   ❌ Dados perdidos na conversão!');
        }
    } catch (error) {
        console.log('\n❌ Erro na conversão de volta:', error);
    }
}

testSchemaConversion();
