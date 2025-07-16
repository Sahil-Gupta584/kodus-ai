import {
    MCPClientConfig,
    MCPServerConfig,
    MCPToolRawWithServer,
    TransportType,
} from './types.js';
import { SpecCompliantMCPClient } from './client.js';
import { createLogger } from '../../observability/index.js';

export interface MCPRegistryOptions {
    /** timeout padrão dos clientes (ms) */
    defaultTimeout?: number;
    /** tentativas de retry */
    maxRetries?: number;
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
    private options: MCPRegistryOptions & {
        defaultTimeout: number;
        maxRetries: number;
    };
    private logger = createLogger('MCPRegistry');

    constructor(_options: MCPRegistryOptions = {}) {
        this.options = {
            defaultTimeout: 30000,
            maxRetries: 3,
            allowedTools: _options.allowedTools,
            blockedTools: _options.blockedTools,
        };

        this.logger.info('MCPRegistry initialized', {
            hasAllowedTools: !!_options.allowedTools,
            hasBlockedTools: !!_options.blockedTools,
            allowedToolsConfig: _options.allowedTools,
            blockedToolsConfig: _options.blockedTools,
        });

        // Valida configurações de filtros
        this.validateFilterConfig();
    }

    /**
     * Valida configurações de filtros
     */
    private validateFilterConfig(): void {
        const { allowedTools, blockedTools } = this.options;

        this.logger.debug('Validating filter configuration', {
            allowedTools,
            blockedTools,
        });

        // Valida allowedTools
        if (allowedTools) {
            if (allowedTools.names && !Array.isArray(allowedTools.names)) {
                throw new Error('Invalid allowedTools.names - must be array');
            }
            if (
                allowedTools.patterns &&
                !Array.isArray(allowedTools.patterns)
            ) {
                throw new Error(
                    'Invalid allowedTools.patterns - must be array',
                );
            }
            if (allowedTools.servers && !Array.isArray(allowedTools.servers)) {
                throw new Error('Invalid allowedTools.servers - must be array');
            }
            if (
                allowedTools.categories &&
                !Array.isArray(allowedTools.categories)
            ) {
                throw new Error(
                    'Invalid allowedTools.categories - must be array',
                );
            }
        }

        // Valida blockedTools
        if (blockedTools) {
            if (blockedTools.names && !Array.isArray(blockedTools.names)) {
                throw new Error('Invalid blockedTools.names - must be array');
            }
            if (
                blockedTools.patterns &&
                !Array.isArray(blockedTools.patterns)
            ) {
                throw new Error(
                    'Invalid blockedTools.patterns - must be array',
                );
            }
            if (blockedTools.servers && !Array.isArray(blockedTools.servers)) {
                throw new Error('Invalid blockedTools.servers - must be array');
            }
            if (
                blockedTools.categories &&
                !Array.isArray(blockedTools.categories)
            ) {
                throw new Error(
                    'Invalid blockedTools.categories - must be array',
                );
            }
        }

        this.logger.debug('Filter validation completed');
    }

    /**
     * Registra um servidor MCP
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
                this.logger.info('Registering MCP server', {
                    serverName: config.name,
                });

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

                this.logger.info('Successfully registered MCP server', {
                    serverName: config.name,
                });
            } catch (error) {
                this.logger.error(
                    'Failed to register MCP server',
                    error instanceof Error ? error : undefined,
                    { serverName: config.name, config },
                );
                throw error;
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
    }

    /**
     * Lista todas as tools
     */
    async listAllTools(): Promise<MCPToolRawWithServer[]> {
        const allTools: MCPToolRawWithServer[] = [];

        this.logger.info('Listing all tools from MCP registry', {
            totalClients: this.clients.size,
            filterConfig: {
                hasAllowedTools: !!this.options.allowedTools,
                hasBlockedTools: !!this.options.blockedTools,
            },
        });

        // Lista todas as tools
        for (const [serverName, client] of this.clients) {
            try {
                this.logger.debug('Listing tools from server', { serverName });

                // Check if client is still connected
                if (!client.isConnected()) {
                    this.logger.warn(
                        'Client not connected, attempting to reconnect',
                        { serverName },
                    );
                    try {
                        await client.connect();
                    } catch (reconnectError) {
                        this.logger.error(
                            'Failed to reconnect to server',
                            reconnectError instanceof Error
                                ? reconnectError
                                : undefined,
                            { serverName },
                        );
                        continue; // Skip this server
                    }
                }

                const tools = await client.listTools();
                this.logger.debug('Received tools from server', {
                    serverName,
                    toolCount: tools.length,
                    toolNames: tools.map((t) => t.name),
                });

                for (const tool of tools) {
                    // Filtra tools baseado na configuração
                    if (!this.isToolAllowed(tool, serverName)) {
                        this.logger.debug('Tool filtered out', {
                            toolName: tool.name,
                            serverName,
                            reason: 'not allowed by filters',
                        });
                        continue;
                    }

                    this.logger.debug('Tool allowed', {
                        toolName: tool.name,
                        serverName,
                    });

                    allTools.push({
                        ...tool,
                        serverName,
                    });
                }
            } catch (error) {
                this.logger.error(
                    'Error listing tools from server',
                    error instanceof Error ? error : undefined,
                    {
                        serverName,
                        errorMessage:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                );
            }
        }

        this.logger.info('Finished listing tools', {
            totalToolsFound: allTools.length,
            toolsByServer: allTools.reduce(
                (acc, tool) => {
                    acc[tool.serverName] = (acc[tool.serverName] || 0) + 1;
                    return acc;
                },
                {} as Record<string, number>,
            ),
        });

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
            this.logger.debug('No filters configured, allowing tool', {
                toolName: tool.name,
                serverName,
            });
            return true;
        }

        const toolName = tool.name;
        const fullToolName = `${serverName}.${toolName}`;

        this.logger.debug('Checking tool against filters', {
            toolName,
            serverName,
            fullToolName,
            hasBlockedTools: !!config.blockedTools,
            hasAllowedTools: !!config.allowedTools,
        });

        // 1. Verifica blacklist primeiro (tem prioridade)
        if (config.blockedTools) {
            // Verifica nomes específicos
            if (
                config.blockedTools.names?.includes(toolName as string) ||
                config.blockedTools.names?.includes(fullToolName as string)
            ) {
                this.logger.debug('Tool blocked by name', {
                    toolName,
                    serverName,
                    blockedNames: config.blockedTools.names,
                });
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
                this.logger.debug('Tool blocked by pattern', {
                    toolName,
                    serverName,
                    blockedPatterns: config.blockedTools.patterns.map(
                        (p) => p.source,
                    ),
                });
                return false;
            }

            // Verifica servidores
            if (config.blockedTools.servers?.includes(serverName)) {
                this.logger.debug('Tool blocked by server', {
                    toolName,
                    serverName,
                    blockedServers: config.blockedTools.servers,
                });
                return false;
            }

            // Verifica categorias (se tool tiver categoria)
            if (
                tool.category &&
                typeof tool.category === 'string' &&
                config.blockedTools.categories?.includes(tool.category)
            ) {
                this.logger.debug('Tool blocked by category', {
                    toolName,
                    serverName,
                    toolCategory: tool.category,
                    blockedCategories: config.blockedTools.categories,
                });
                return false;
            }
        }

        // 2. Se há whitelist, verifica se está permitida
        if (config.allowedTools) {
            // Verifica se há conteúdo na whitelist
            const hasAllowedContent =
                (config.allowedTools.names &&
                    config.allowedTools.names.length > 0) ||
                (config.allowedTools.patterns &&
                    config.allowedTools.patterns.length > 0) ||
                (config.allowedTools.servers &&
                    config.allowedTools.servers.length > 0) ||
                (config.allowedTools.categories &&
                    config.allowedTools.categories.length > 0);

            // Se whitelist está vazia, permite tudo (não restringe)
            if (!hasAllowedContent) {
                this.logger.debug('Whitelist is empty, allowing tool', {
                    toolName,
                    serverName,
                });
                return true; // ✅ PERMITE TUDO se whitelist vazia
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
                typeof tool.category === 'string' &&
                config.allowedTools.categories?.includes(tool.category);

            const isAllowed = !!(
                nameAllowed ||
                patternAllowed ||
                serverAllowed ||
                categoryAllowed
            );

            this.logger.debug('Whitelist check result', {
                toolName,
                serverName,
                isAllowed,
                nameAllowed,
                patternAllowed,
                serverAllowed,
                categoryAllowed,
                allowedNames: config.allowedTools.names,
                allowedPatterns: config.allowedTools.patterns?.map(
                    (p) => p.source,
                ),
                allowedServers: config.allowedTools.servers,
                allowedCategories: config.allowedTools.categories,
            });

            // Tool deve estar em pelo menos uma das listas permitidas
            return isAllowed;
        }

        // Se não há whitelist, permite tudo (após passar pela blacklist)
        this.logger.debug('No whitelist configured, allowing tool', {
            toolName,
            serverName,
        });
        return true;
    }

    /**
     * Executa tool
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

            return client.executeTool(toolName, args);
        }

        // Tenta encontrar tool em qualquer servidor
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

    /**
     * Limpa recursos
     */
    destroy(): void {
        // Desconecta todos os clientes
        for (const [, client] of this.clients) {
            client.disconnect().catch(console.error);
        }
        this.clients.clear();
    }
}
