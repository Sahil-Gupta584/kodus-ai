import { MCPRegistry } from './registry.js';
import {
    mcpToolsToEngineTools,
    parseToolName,
    type EngineTool,
} from './tools.js';
import type { MCPAdapterConfig, MCPAdapter, MCPTool } from './types.js';

/**
 * Create an MCP adapter for Kodus Flow
 *
 * @example
 * ```typescript
 * const mcpAdapter = createMCPAdapter({
 *   servers: [
 *     {
 *       name: 'filesystem',
 *       command: 'npx',
 *       args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/files'],
 *     },
 *     {
 *       name: 'github',
 *       command: 'npx',
 *       args: ['-y', '@modelcontextprotocol/server-github'],
 *       env: {
 *         GITHUB_TOKEN: process.env.GITHUB_TOKEN
 *       }
 *     }
 *   ]
 * });
 *
 * // Connect all servers
 * await mcpAdapter.connect();
 *
 * // Use with an agent
 * const agent = createAgent({
 *   tools: await mcpAdapter.getTools(),
 * });
 * ```
 */
export function createMCPAdapter(config: MCPAdapterConfig): MCPAdapter {
    const registry = new MCPRegistry({
        defaultTimeout: config.defaultTimeout,
        maxRetries: config.maxRetries,
    });

    let toolsCache: MCPTool[] = [];
    let isConnected = false;

    const adapter: MCPAdapter = {
        /**
         * Connect to all configured MCP servers
         */
        async connect(): Promise<void> {
            if (isConnected) {
                return;
            }

            const promises = config.servers.map((server) =>
                registry.register(server).catch((error) => {
                    if (config.onError) {
                        config.onError(error, server.name);
                    }
                    throw error;
                }),
            );

            await Promise.all(promises);
            isConnected = true;
            toolsCache = []; // Clear cache on reconnect
        },

        /**
         * Disconnect from all MCP servers
         */
        async disconnect(): Promise<void> {
            await registry.disconnectAll();
            isConnected = false;
            toolsCache = [];
        },

        /**
         * Get all tools as engine-compatible tools
         */
        async getTools(): Promise<MCPTool[]> {
            if (!isConnected) {
                throw new Error(
                    'MCP adapter not connected. Call connect() first.',
                );
            }

            if (toolsCache.length > 0) {
                return toolsCache;
            }

            const mcpTools = await registry.listAllTools();
            const engineTools = mcpToolsToEngineTools(mcpTools);

            // Override execute functions to use the registry and propagate schemas correctly
            toolsCache = engineTools.map((tool: EngineTool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.jsonSchema, // Use original JSON Schema from MCP for LLMs
                execute: async (args: unknown, _ctx: unknown) => {
                    const { serverName, toolName } = parseToolName(tool.name);
                    return registry.executeTool(
                        toolName,
                        args as Record<string, unknown>,
                        serverName,
                    );
                },
            }));

            return toolsCache;
        },

        /**
         * List all resources from all MCP servers
         */
        async listResources() {
            if (!isConnected) {
                throw new Error(
                    'MCP adapter not connected. Call connect() first.',
                );
            }
            return registry.listAllResources();
        },

        /**
         * Read a resource
         */
        async readResource(uri: string, serverName?: string) {
            if (!isConnected) {
                throw new Error(
                    'MCP adapter not connected. Call connect() first.',
                );
            }
            return registry.readResource(uri, serverName);
        },

        /**
         * List all prompts from all MCP servers
         */
        async listPrompts() {
            if (!isConnected) {
                throw new Error(
                    'MCP adapter not connected. Call connect() first.',
                );
            }
            return registry.listAllPrompts();
        },

        /**
         * Get a prompt
         */
        async getPrompt(
            name: string,
            args?: Record<string, string>,
            serverName?: string,
        ) {
            if (!isConnected) {
                throw new Error(
                    'MCP adapter not connected. Call connect() first.',
                );
            }
            return registry.getPrompt(name, args, serverName);
        },

        /**
         * Execute a tool directly
         */
        async executeTool(
            name: string,
            args?: Record<string, unknown>,
            serverName?: string,
        ) {
            if (!isConnected) {
                throw new Error(
                    'MCP adapter not connected. Call connect() first.',
                );
            }
            const { serverName: parsedServer, toolName } = parseToolName(name);
            return registry.executeTool(
                toolName,
                args,
                serverName || parsedServer,
            );
        },

        /**
         * Get metrics from all servers
         */
        getMetrics() {
            return registry.getMetrics();
        },

        /**
         * Check if a tool exists
         */
        hasTool(name: string): boolean {
            if (!isConnected) {
                return false;
            }

            // Check if tool exists in cache
            return toolsCache.some((tool) => tool.name === name);
        },

        /**
         * Get access to the internal registry
         */
        getRegistry() {
            return registry;
        },
    };

    return adapter;
}

// Export apenas os tipos essenciais para uso externo
export type {
    MCPAdapterConfig,
    MCPAdapter,
    MCPTool,
    MCPServerConfig,
} from './types.js';

export { MCPRegistry } from './registry.js';
export { SpecCompliantMCPClient as MCPClient } from './client.js';
