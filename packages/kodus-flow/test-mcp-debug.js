import { createMCPAdapter } from './src/adapters/mcp/index.js';

async function testMCP() {
    console.log('🔍 Testing MCP adapter...');

    try {
        // Criar adapter sem filtros
        const mcpAdapter = createMCPAdapter({
            servers: [
                {
                    name: 'test-server',
                    type: 'http',
                    url: 'http://localhost:3000', // Ajuste para seu servidor MCP
                },
            ],
            // Sem filtros para testar
            // allowedTools: { names: ['test_tool'] },
            // blockedTools: { names: ['blocked_tool'] },
        });

        console.log('📡 Connecting to MCP servers...');
        await mcpAdapter.connect();

        console.log('🛠️ Getting tools...');
        const tools = await mcpAdapter.getTools();

        console.log('✅ Tools found:', tools.length);
        tools.forEach((tool) => {
            console.log(`  - ${tool.name} (${tool.description})`);
        });

        await mcpAdapter.disconnect();
    } catch (error) {
        console.error('❌ Error testing MCP:', error);
    }
}

testMCP();
