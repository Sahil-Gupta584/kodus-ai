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
 *       type: 'http',
 *       url: 'http://localhost:3000',
 *     },
 *     {
 *       name: 'github',
 *       type: 'http',
 *       url: 'http://localhost:3001',
 *       headers: {
 *         Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
 *       }
 *     }
 *   ],
 *   // Tool filtering
 *   allowedTools: {
 *     names: ['read_file', 'write_file'],
 *     servers: ['filesystem'],
 *   },
 *   blockedTools: {
 *     names: ['dangerous_tool'],
 *     patterns: [/delete/],
 *   },
 *   // Error handling
 *   onError: (error, serverName) => {
 *     console.error(`MCP server ${serverName} error:`, error);
 *   }
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
        allowedTools: config.allowedTools,
        blockedTools: config.blockedTools,
    });

    let isConnected = false;

    const adapter: MCPAdapter = {
        /**
         * Connect to all configured MCP servers
         */
        async connect(): Promise<void> {
            // Always reconnect to ensure fresh connections
            if (isConnected) {
                await this.disconnect();
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
        },

        /**
         * Disconnect from all MCP servers
         */
        async disconnect(): Promise<void> {
            if (!isConnected) {
                return;
            }

            try {
                registry.destroy();
            } catch (error) {
                // Log error but don't throw to ensure cleanup
                console.warn('Error during MCP disconnect:', error);
            } finally {
                isConnected = false;
            }
        },

        /**
         * Get all tools as engine-compatible tools
         */
        async getTools(): Promise<MCPTool[]> {
            debugger;
            if (!isConnected) {
                throw new Error(
                    'MCP adapter not connected. Call connect() first.',
                );
            }

            // Ensure fresh connection for each request
            await this.ensureConnection();

            const mcpTools = await registry.listAllTools();
            const engineTools = mcpToolsToEngineTools(mcpTools);

            // Override execute functions to use the registry and propagate schemas correctly
            return engineTools.map((tool: EngineTool) => ({
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
        },

        /**
         * Check if a tool exists
         */
        async hasTool(name: string): Promise<boolean> {
            if (!isConnected) {
                return false;
            }

            try {
                await this.ensureConnection();
                const tools = await registry.listAllTools();
                return tools.some((tool) => tool.name === name);
            } catch {
                return false;
            }
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

            await this.ensureConnection();

            const { serverName: parsedServer, toolName } = parseToolName(name);
            return registry.executeTool(
                toolName,
                args,
                serverName || parsedServer,
            );
        },

        /**
         * Ensure connection is fresh and working
         */
        async ensureConnection(): Promise<void> {
            if (!isConnected) {
                await this.connect();
                return;
            }

            // Try to list tools to check if connection is still working
            try {
                await registry.listAllTools();
            } catch {
                // Connection lost, reconnect
                console.warn('MCP connection lost, reconnecting...');
                await this.disconnect();
                await this.connect();
            }
        },

        /**
         * Get metrics from all servers
         */
        getMetrics(): Record<string, unknown> {
            const metrics: Record<string, unknown> = {};

            // Adiciona métricas de health checks
            // const serverStatuses = registry.getServerStatuses();
            // for (const [serverName, status] of serverStatuses) {
            //     metrics[`${serverName}_health`] = status;
            // }

            // Schema cache removed - keeping it simple

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
