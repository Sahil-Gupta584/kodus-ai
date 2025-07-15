import { MCPRegistry } from './registry.js';
import {
    mcpToolsToEngineTools,
    parseToolName,
    type EngineTool,
} from './tools.js';
import type {
    MCPAdapterConfig,
    MCPAdapter,
    MCPTool,
    MCPResourceWithServer,
    MCPPromptWithServer,
} from './types.js';

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
 *   ],
 *   enableHealthChecks: true,
 *   enableSchemaCache: true,
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
        enableHealthChecks: true,
        enableSchemaCache: true,
        // Passa configuração de filtros
        allowedTools: config.allowedTools,
        blockedTools: config.blockedTools,
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
            if (!isConnected) {
                return;
            }

            registry.destroy();
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
         * Check if a tool exists
         */
        hasTool(name: string): boolean {
            return toolsCache.some((tool) => tool.name === name);
        },

        /**
         * List all resources from all servers
         */
        async listResources(): Promise<MCPResourceWithServer[]> {
            if (!isConnected) {
                throw new Error(
                    'MCP adapter not connected. Call connect() first.',
                );
            }

            // TODO: Implement resource listing with health checks
            return [];
        },

        /**
         * Read a resource
         */
        async readResource(
            _uri: string,
            _serverName?: string,
        ): Promise<unknown> {
            if (!isConnected) {
                throw new Error(
                    'MCP adapter not connected. Call connect() first.',
                );
            }

            // TODO: Implement resource reading with health checks
            throw new Error('Resource reading not implemented');
        },

        /**
         * List all prompts from all servers
         */
        async listPrompts(): Promise<MCPPromptWithServer[]> {
            if (!isConnected) {
                throw new Error(
                    'MCP adapter not connected. Call connect() first.',
                );
            }

            // TODO: Implement prompt listing with health checks
            return [];
        },

        /**
         * Get a prompt
         */
        async getPrompt(
            _name: string,
            _args?: Record<string, string>,
            _serverName?: string,
        ): Promise<unknown> {
            if (!isConnected) {
                throw new Error(
                    'MCP adapter not connected. Call connect() first.',
                );
            }

            // TODO: Implement prompt getting with health checks
            throw new Error('Prompt getting not implemented');
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
        getMetrics(): Record<string, unknown> {
            const metrics: Record<string, unknown> = {};

            // Adiciona métricas de health checks
            const serverStatuses = registry.getServerStatuses();
            for (const [serverName, status] of serverStatuses) {
                metrics[`${serverName}_health`] = status;
            }

            // Adiciona métricas de schema cache
            const cacheStats = registry.getSchemaCacheStats();
            if (cacheStats) {
                metrics.schemaCache = cacheStats;
            }

            return metrics;
        },

        /**
         * Get registry for advanced operations
         */
        getRegistry(): unknown {
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
