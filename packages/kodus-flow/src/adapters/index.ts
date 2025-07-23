/**
 * @kodus/flow - Adapters
 * Exporta todos os adapters disponíveis no Kodus Flow
 */

// MCP Adapter
export { createMCPAdapter } from './mcp/index.js';
export type {
    MCPServerConfig,
    MCPAdapterConfig,
    MCPAdapter,
    MCPTool,
} from './mcp/types.js';
