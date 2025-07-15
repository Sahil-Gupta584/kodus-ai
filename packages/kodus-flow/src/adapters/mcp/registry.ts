import {
    MCPClientConfig,
    MCPServerConfig,
    MCPToolRawWithServer,
    TransportType,
} from './types.js';
import { SpecCompliantMCPClient } from './client.js';
import { MCPHealthManager } from './health-manager.js';
import { MCPSchemaCacheManager } from './schema-cache.js';
import { createLogger } from '../../observability/index.js';

export interface MCPRegistryOptions {
    /** timeout padrão dos clientes (ms) */
    defaultTimeout?: number;
    /** tentativas de retry */
    maxRetries?: number;
    /** health checks habilitados */
    enableHealthChecks?: boolean;
    /** schema cache habilitado */
    enableSchemaCache?: boolean;
    /** Configuração de filtros para tools */
    allowedTools?: {
        names?: string[];
        patterns?: RegExp[];
        servers?: string[];
        categories?: string[];
    };
    blockedTools?: {
        names?: string[];
        patterns?: RegExp[];
        servers?: string[];
        categories?: string[];
    };
}

export class MCPRegistry {
    private clients = new Map<string, SpecCompliantMCPClient>();
    private pending = new Map<string, Promise<void>>();
    private options: Required<MCPRegistryOptions>;
    private healthManager!: MCPHealthManager;
    private schemaCache!: MCPSchemaCacheManager;
    private logger = createLogger('MCPRegistry');

    constructor(options: MCPRegistryOptions = {}) {
        this.options = {
            defaultTimeout: 30000,
            maxRetries: 3,
            enableHealthChecks: true,
            enableSchemaCache: true,
            allowedTools: options.allowedTools ?? {
                names: [],
                patterns: [],
                servers: [],
                categories: [],
            },
            blockedTools: options.blockedTools ?? {
                names: [],
                patterns: [],
                servers: [],
                categories: [],
            },
        };

        // Inicializa health manager se habilitado
        if (this.options.enableHealthChecks) {
            this.healthManager = new MCPHealthManager();
        }

        // Inicializa schema cache se habilitado
        if (this.options.enableSchemaCache) {
            this.schemaCache = new MCPSchemaCacheManager();
        }
    }

    /**
     * Registra um servidor MCP com health checks
     */
    async register(config: MCPServerConfig): Promise<void> {
        // Verifica se já está registrando
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

                // ─── 4. Configurar health check se habilitado ─────────────────────
                if (this.options.enableHealthChecks && this.healthManager) {
                    this.healthManager.addHealthCheck(config.name, {
                        interval: 30000, // 30s
                        timeout: 5000, // 5s
                        retries: 3,
                        enabled: true,
                    });
                }
            } finally {
                // remove promessa pendente (sucesso ou erro)
                this.pending.delete(config.name);
            }
        })();

        // salva e aguarda
        this.pending.set(config.name, job);
        await job;
    }

    /**
     * Remove um servidor MCP
     */
    async unregister(serverName: string): Promise<void> {
        const client = this.clients.get(serverName);
        if (client) {
            await client.disconnect();
            this.clients.delete(serverName);
        }

        // Remove health check se habilitado
        if (this.options.enableHealthChecks && this.healthManager) {
            this.healthManager.removeHealthCheck(serverName);
        }

        // Remove schemas do cache
        if (this.options.enableSchemaCache && this.schemaCache) {
            // Remove todos os schemas deste servidor
            const removedCount =
                this.schemaCache.removeSchemasByServer(serverName);

            this.logger.info('Removed schemas from cache', {
                serverName,
                removedCount,
            });
        }
    }

    /**
     * Lista todas as tools com cache de schemas
     */
    async listAllTools(): Promise<MCPToolRawWithServer[]> {
        const allTools: MCPToolRawWithServer[] = [];

        for (const [serverName, client] of this.clients) {
            try {
                // Verifica health check se habilitado
                if (this.options.enableHealthChecks && this.healthManager) {
                    if (!this.healthManager.isServerHealthy(serverName)) {
                        continue;
                    }
                }

                // Verifica rate limit se habilitado
                if (this.options.enableHealthChecks && this.healthManager) {
                    if (!this.healthManager.checkRateLimit(serverName)) {
                        continue;
                    }
                }

                const tools = await client.listTools();

                for (const tool of tools) {
                    // Filtra tools baseado na configuração
                    if (!this.isToolAllowed(tool, serverName)) {
                        continue;
                    }

                    // Usa cache de schema se habilitado
                    if (this.options.enableSchemaCache && this.schemaCache) {
                        const schemaHash = this.schemaCache.generateSchemaHash(
                            tool.inputSchema,
                        );
                        const cacheKey = this.schemaCache.generateKey(
                            serverName,
                            tool.name,
                            schemaHash,
                        );

                        // Tenta obter do cache
                        const cachedSchema = this.schemaCache.get(cacheKey);
                        if (
                            cachedSchema &&
                            typeof cachedSchema === 'object' &&
                            'type' in cachedSchema &&
                            (cachedSchema as { type: unknown }).type ===
                                'object'
                        ) {
                            tool.inputSchema = cachedSchema as {
                                [x: string]: unknown;
                                type: 'object';
                                properties?: { [x: string]: unknown };
                                required?: string[];
                            };
                        } else {
                            // Adiciona ao cache
                            this.schemaCache.set(cacheKey, tool.inputSchema);
                        }
                    }

                    allTools.push({
                        ...tool,
                        serverName,
                    });
                }
            } catch {}
        }

        return allTools;
    }

    /**
     * Verifica se uma tool está permitida baseado na configuração
     */
    private isToolAllowed(
        tool: Record<string, unknown>,
        serverName: string,
    ): boolean {
        const config = this.options;

        // Se não há configuração de filtros, permite tudo
        if (!config.allowedTools && !config.blockedTools) {
            return true;
        }

        const toolName = tool.name;
        const fullToolName = `${serverName}.${toolName}`;

        // 1. Verifica blacklist primeiro (tem prioridade)
        if (config.blockedTools) {
            // Verifica nomes específicos
            if (
                config.blockedTools.names?.includes(toolName as string) ||
                config.blockedTools.names?.includes(fullToolName as string)
            ) {
                return false;
            }

            // Verifica padrões regex
            if (
                config.blockedTools.patterns?.some(
                    (pattern: RegExp) =>
                        pattern.test(toolName as string) ||
                        pattern.test(fullToolName as string),
                )
            ) {
                return false;
            }

            // Verifica servidores
            if (config.blockedTools.servers?.includes(serverName)) {
                return false;
            }

            // Verifica categorias (se tool tiver categoria)
            if (
                (tool.category as string) &&
                config.blockedTools.categories?.includes(
                    tool.category as string,
                )
            ) {
                return false;
            }
        }

        // 2. Se há whitelist, verifica se está permitida
        if (config.allowedTools) {
            // Se whitelist está vazia, não permite nada
            if (
                !config.allowedTools.names?.length &&
                !config.allowedTools.patterns?.length &&
                !config.allowedTools.servers?.length &&
                !config.allowedTools.categories?.length
            ) {
                return false;
            }

            // Verifica nomes específicos
            const nameAllowed = config.allowedTools.names?.some(
                (name: string) => name === toolName || name === fullToolName,
            );

            // Verifica padrões regex
            const patternAllowed = config.allowedTools.patterns?.some(
                (pattern: RegExp) =>
                    pattern.test(toolName as string) ||
                    pattern.test(fullToolName as string),
            );

            // Verifica servidores
            const serverAllowed =
                config.allowedTools.servers?.includes(serverName);

            // Verifica categorias
            const categoryAllowed =
                tool.category &&
                config.allowedTools.categories?.includes(
                    tool.category as string,
                );

            // Tool deve estar em pelo menos uma das listas permitidas
            return !!(
                nameAllowed ||
                patternAllowed ||
                serverAllowed ||
                categoryAllowed
            );
        }

        // Se não há whitelist, permite tudo (após passar pela blacklist)
        return true;
    }

    /**
     * Executa tool com health checks e circuit breaker
     */
    async executeTool(
        toolName: string,
        args?: Record<string, unknown>,
        serverName?: string,
    ): Promise<unknown> {
        if (serverName) {
            const client = this.clients.get(serverName);

            if (!client) {
                throw new Error(`MCP server ${serverName} not found`);
            }

            // Verifica health check se habilitado
            if (this.options.enableHealthChecks && this.healthManager) {
                if (!this.healthManager.isServerHealthy(serverName)) {
                    throw new Error(`MCP server ${serverName} is unhealthy`);
                }

                if (!this.healthManager.checkRateLimit(serverName)) {
                    throw new Error(
                        `Rate limit exceeded for server ${serverName}`,
                    );
                }
            }

            return client.executeTool(toolName, args);
        }

        // Tenta encontrar tool em qualquer servidor
        for (const [serverName, client] of this.clients) {
            try {
                // Verifica health check se habilitado
                if (this.options.enableHealthChecks && this.healthManager) {
                    if (!this.healthManager.isServerHealthy(serverName)) {
                        continue;
                    }

                    if (!this.healthManager.checkRateLimit(serverName)) {
                        continue;
                    }
                }

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

    /**
     * Obtém status de todos os servidores
     */
    getServerStatuses(): Map<string, unknown> {
        if (this.options.enableHealthChecks && this.healthManager) {
            return this.healthManager.getServerStatuses();
        }
        return new Map();
    }

    /**
     * Obtém estatísticas do schema cache
     */
    getSchemaCacheStats(): Record<string, unknown> | null {
        if (this.options.enableSchemaCache && this.schemaCache) {
            return this.schemaCache.getStats();
        }
        return null;
    }

    /**
     * Limpa recursos
     */
    destroy(): void {
        // Desconecta todos os clientes
        for (const [, client] of this.clients) {
            client.disconnect().catch(console.error);
        }
        this.clients.clear();

        // Destrói health manager
        if (this.healthManager) {
            this.healthManager.destroy();
        }

        // Limpa schema cache
        if (this.schemaCache) {
            this.schemaCache.clear();
        }
    }
}
