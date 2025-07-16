/**
 * Teste completo do processo de registro de MCP tools
 */

import { createOrchestration } from './src/orchestration/sdk-orchestrator.js';
import { createMCPAdapter } from './src/adapters/mcp/index.js';
import { createLLMAdapter } from './src/adapters/llm/index.js';
import { createMockLLMProvider } from './src/adapters/llm/mock-provider.js';
import { safeJsonSchemaToZod } from './src/core/utils/json-schema-to-zod.js';

async function testMCPRegistration() {
    console.log('🧪 Testando registro completo de MCP tools...');

    // 1. Criar LLM adapter
    const llmAdapter = createLLMAdapter(mockProvider);

    // 2. Criar MCP adapter
    const mcpAdapter = createMCPAdapter({
        servers: [
            {
                name: 'github-mcp',
                type: 'http',
                url: 'http://localhost:3000', // Simulado
            },
        ],
    });

    // 3. Criar orchestrator
    const orchestrator = createOrchestration({
        llmAdapter,
        mcpAdapter,
        tenantId: 'test-tenant',
    });

    try {
        // 4. Conectar MCP
        await orchestrator.connectMCP();
        console.log('✅ MCP conectado');

        // 5. Registrar tools
        await orchestrator.registerMCPTools();
        console.log('✅ MCP tools registradas');

        // 6. Verificar tools registradas
        const registeredTools = orchestrator.getRegisteredTools();
        console.log('📋 Tools registradas:', registeredTools.length);

        for (const tool of registeredTools) {
            console.log(`  - ${tool.name}: ${tool.description}`);
        }

        // 7. Testar conversão de schema específico
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
            },
            required: ['organizationId', 'teamId'],
            additionalProperties: false,
        };

        console.log('\n🔍 Testando conversão de schema...');
        const zodSchema = safeJsonSchemaToZod(testSchema);
        console.log('✅ Schema convertido:', typeof zodSchema);

        // 8. Testar validação
        const validInput = {
            organizationId: 'org-123',
            teamId: 'team-456',
        };

        const result = zodSchema.safeParse(validInput);
        console.log('✅ Validação:', result.success ? 'PASSOU' : 'FALHOU');
    } catch (error) {
        console.error('❌ Erro no teste:', error);
        if (error instanceof Error) {
            console.error('Stack:', error.stack);
        }
    }
}

testMCPRegistration().catch(console.error);
