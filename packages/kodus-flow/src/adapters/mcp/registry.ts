import type {
    GetPromptResult,
    ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js';
import {
    MCPClientConfig,
    MCPPromptWithServer,
    MCPResourceWithServer,
    MCPServerConfig,
    MCPToolRawWithServer,
    TransportType,
} from './types.js';
import { SpecCompliantMCPClient } from './client.js';

export interface MCPRegistryOptions {
    /** timeout padrão dos clientes (ms) */
    defaultTimeout?: number;
    /** tentativas de retry */
    maxRetries?: number;
}

export class MCPRegistry {
    /** clientes já conectados */
    private clients = new Map<string, SpecCompliantMCPClient>();
    /** promessas em andamento p/ evitar corrida */
    private pending = new Map<string, Promise<void>>();
    /** opções globais */
    private options: Required<MCPRegistryOptions>;

    constructor(opts: MCPRegistryOptions = {}) {
        this.options = {
            defaultTimeout: opts.defaultTimeout ?? 30_000,
            maxRetries: opts.maxRetries ?? 3,
        };
    }

    // ────────────────────────────────────────────────────────────────────────────
    // REGISTRO DE SERVIDOR
    // ────────────────────────────────────────────────────────────────────────────
    async register(config: MCPServerConfig): Promise<void> {
        // se já existe cliente, nada a fazer
        if (this.clients.has(config.name)) {
            return;
        }

        // se já existe uma promessa pendente, espera ela terminar (e sai)
        if (this.pending.has(config.name)) {
            await this.pending.get(config.name);
            return;
        }

        // cria a promessa de registro e salva no map
        const job = (async () => {
            try {
                // ─── 1. Normalizar tipo de transporte ───────────────────────────────

                const transportType: TransportType = config.type ?? 'http';

                // ─── 2. Montar configuração p/ SpecCompliantMCPClient ───────────────
                const clientConfig: MCPClientConfig = {
                    clientInfo: {
                        name: `mcp-registry-client-${config.name}`,
                        version: '1.0.0',
                    },
                    transport: {
                        type: transportType,
                        url: config.url, // obrigatório para http/sse/ws
                        headers: config.headers,
                        timeout: config.timeout ?? this.options.defaultTimeout,
                        retries: config.retries ?? this.options.maxRetries,
                    },
                    capabilities: {
                        roots: { listChanged: true },
                        sampling: {},
                        elicitation: {},
                    },
                };

                // ─── 3. Criar & conectar cliente ───────────────────────────────────
                const client = new SpecCompliantMCPClient(clientConfig);
                await client.connect();
                this.clients.set(config.name, client);
            } finally {
                // remove promessa pendente (sucesso ou erro)
                this.pending.delete(config.name);
            }
        })();

        // salva e aguarda
        this.pending.set(config.name, job);
        await job;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // UNREGISTER
    // ────────────────────────────────────────────────────────────────────────────
    async unregister(name: string): Promise<void> {
        const client = this.clients.get(name);

        if (!client) {
            throw new Error(`MCP server ${name} not found`);
        }

        await client.disconnect();
        this.clients.delete(name);
    }

    // ────────────────────────────────────────────────────────────────────────────
    // GETTERS BÁSICOS
    // ────────────────────────────────────────────────────────────────────────────
    getClient(name: string) {
        return this.clients.get(name);
    }
    getAllClients(): Map<string, SpecCompliantMCPClient> {
        return new Map(this.clients);
    }

    // ────────────────────────────────────────────────────────────────────────────
    // LIST/EXEC HELPERS (igual ao que já havia, apenas identação ajustada)
    // ────────────────────────────────────────────────────────────────────────────
    async listAllTools(): Promise<MCPToolRawWithServer[]> {
        const outputTools: MCPToolRawWithServer[] = [];

        for (const [serverName, client] of this.clients) {
            try {
                const tools = await client.listTools();

                outputTools.push(
                    ...tools
                        .filter((tool) => tool.name)
                        .map((tool) => ({
                            ...tool,
                            name: tool.name!,
                            inputSchema: tool.inputSchema || {},
                            serverName: serverName,
                        })),
                );
            } catch {
                /* ignora */
            }
        }

        return outputTools;
    }

    async listAllResources(): Promise<MCPResourceWithServer[]> {
        const outputResources: MCPResourceWithServer[] = [];

        for (const [serverName, client] of this.clients) {
            try {
                const resources = await client.listResources();

                outputResources.push(
                    ...resources
                        .filter((resource) => resource.uri)
                        .map((resource) => ({
                            ...resource,
                            uri: resource.uri!,
                            name: resource.name || resource.uri!,
                            serverName: serverName,
                        })),
                );
            } catch {
                /* ignora */
            }
        }

        return outputResources;
    }

    async listAllPrompts(): Promise<MCPPromptWithServer[]> {
        const outputPrompts: MCPPromptWithServer[] = [];

        for (const [serverName, client] of this.clients) {
            try {
                const prompts = await client.listPrompts();

                outputPrompts.push(
                    ...prompts
                        .filter((prompt) => prompt.name)
                        .map((prompt) => ({
                            ...prompt,
                            name: prompt.name!,
                            arguments: prompt.arguments
                                ?.filter((argument) => argument.name)
                                .map((argument) => ({
                                    name: argument.name!,
                                    description: argument.description,
                                    required: argument.required,
                                })),
                            serverName: serverName,
                        })),
                );
            } catch {
                /* ignora */
            }
        }

        return outputPrompts;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // EXEC / READ / PROMPT (sem mudanças de lógica)
    // ────────────────────────────────────────────────────────────────────────────
    async executeTool(
        toolName: string,
        args?: Record<string, unknown>,
        serverName?: string,
    ): Promise<unknown> {
        debugger;
        if (serverName) {
            const client = this.clients.get(serverName);

            if (!client) {
                throw new Error(`MCP server ${serverName} not found`);
            }

            return client.executeTool(toolName, args);
        }

        for (const [, client] of this.clients) {
            try {
                const tools = await client.listTools();

                if (tools.some((tool) => tool.name === toolName)) {
                    return client.executeTool(toolName, args);
                }
            } catch {
                /* ignora */
            }
        }
        throw new Error(
            `Tool ${toolName} not found in any registered MCP server`,
        );
    }

    async readResource(
        uri: string,
        serverName?: string,
    ): Promise<ReadResourceResult> {
        if (serverName) {
            const client = this.clients.get(serverName);

            if (!client) {
                throw new Error(`MCP server ${serverName} not found`);
            }

            return client.readResource(uri);
        }

        for (const [, client] of this.clients) {
            try {
                const resources = await client.listResources();

                if (resources.some((resource) => resource.uri === uri)) {
                    return client.readResource(uri);
                }
            } catch {
                /* ignora */
            }
        }
        throw new Error(
            `Resource ${uri} not found in any registered MCP server`,
        );
    }

    async getPrompt(
        name: string,
        args?: Record<string, string>,
        serverName?: string,
    ): Promise<GetPromptResult> {
        if (serverName) {
            const client = this.clients.get(serverName);

            if (!client) {
                throw new Error(`MCP server ${serverName} not found`);
            }

            return client.getPrompt(name, args);
        }

        for (const [, client] of this.clients) {
            try {
                const prompts = await client.listPrompts();

                if (prompts.some((prompt) => prompt.name === name)) {
                    return client.getPrompt(name, args);
                }
            } catch {
                /* ignora */
            }
        }
        throw new Error(
            `Prompt ${name} not found in any registered MCP server`,
        );
    }

    // ────────────────────────────────────────────────────────────────────────────
    // DISCONNECT & METRICS (inalterado)
    // ────────────────────────────────────────────────────────────────────────────
    async disconnectAll(): Promise<void> {
        await Promise.all(
            [...this.clients.values()].map((client) =>
                client.disconnect().catch(() => {}),
            ),
        );
        this.clients.clear();
    }

    getMetrics(): Record<string, unknown> {
        const metrics: Record<string, unknown> = {};

        for (const [serverName, client] of this.clients) {
            metrics[serverName] = client.getMetrics();
        }

        return metrics;
    }
}
