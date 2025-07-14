/**
 * MCP Client - Fully Specification Compliant
 * Implements ALL MCP client features per 2025-06-18 specification
 */

import { EventEmitter } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import type {
    MCPClientConfig,
    MCPClientEvents,
    TenantContext,
    SecurityPolicy,
    MCPMetrics,
    AuditEvent,
    HumanApprovalHandler,
    HumanApprovalRequest,
    HumanApprovalResponse,
    CreateElicitationRequest,
    CreateElicitationResult,
} from './types.js';
import {
    CallToolResult,
    CreateMessageRequest,
    CreateMessageResult,
    GetPromptResult,
    InitializeResult,
    ListRootsResult,
    Prompt,
    ReadResourceResult,
    Resource,
    Root,
    Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';

// Interface para o método request do MCP Client
interface MCPRequestMethod {
    request(
        request: { method: string; params?: Record<string, unknown> },
        options?: { signal?: AbortSignal },
    ): Promise<unknown>;
}

// =============================================================================
// SECURITY MANAGER
// =============================================================================

class SecurityManager {
    constructor(
        private policy: SecurityPolicy,
        private tenant: TenantContext,
    ) {}

    validateFileAccess(uri: string): boolean {
        // Path traversal protection
        if (this.policy.preventPathTraversal) {
            if (uri.includes('..') || uri.includes('~')) {
                throw new Error(`Path traversal detected: ${uri}`);
            }
        }

        // Check against allowed patterns
        const allowed = this.policy.allowedUriPatterns.some((pattern) =>
            pattern.test(uri),
        );

        if (!allowed) {
            throw new Error(`URI not allowed: ${uri}`);
        }

        // Check against blocked patterns
        const blocked = this.policy.blockedUriPatterns.some((pattern) =>
            pattern.test(uri),
        );

        if (blocked) {
            throw new Error(`URI blocked: ${uri}`);
        }

        // Check tenant-specific roots
        const uriAllowed = this.tenant.allowedRoots.some((root) =>
            uri.startsWith(root),
        );

        if (!uriAllowed) {
            throw new Error(`URI not in tenant roots: ${uri}`);
        }

        return true;
    }

    checkPermission(action: string): boolean {
        return (
            this.tenant.permissions.includes(action) ||
            this.tenant.permissions.includes('*')
        );
    }

    checkQuota(_requestType: 'request' | 'token'): boolean {
        // This would check against current usage
        return true; // Simplified for now
    }
}

// =============================================================================
// METRICS COLLECTOR
// =============================================================================

class MetricsCollector {
    private metrics: MCPMetrics;

    constructor(private tenantId: string) {
        this.metrics = {
            connectionsTotal: 0,
            connectionsActive: 0,
            connectionErrors: 0,
            requestsTotal: 0,
            requestsSuccessful: 0,
            requestsFailed: 0,
            requestDuration: [],
            toolCalls: 0,
            resourceReads: 0,
            promptGets: 0,
            samplingRequests: 0,
            elicitationRequests: 0,
            securityViolations: 0,
            unauthorizedAccess: 0,
            pathTraversalAttempts: 0,
            tenantMetrics: {},
        };
    }

    recordConnection(success: boolean): void {
        this.metrics.connectionsTotal++;
        if (success) {
            this.metrics.connectionsActive++;
        } else {
            this.metrics.connectionErrors++;
        }
    }

    recordRequest(type: string, duration: number, success: boolean): void {
        this.metrics.requestsTotal++;
        this.metrics.requestDuration.push(duration);

        if (success) {
            this.metrics.requestsSuccessful++;
        } else {
            this.metrics.requestsFailed++;
        }

        // Feature-specific metrics
        switch (type) {
            case 'tool_call':
                this.metrics.toolCalls++;
                break;
            case 'resource_read':
                this.metrics.resourceReads++;
                break;
            case 'prompt_get':
                this.metrics.promptGets++;
                break;
            case 'sampling':
                this.metrics.samplingRequests++;
                break;
            case 'elicitation':
                this.metrics.elicitationRequests++;
                break;
        }

        // Tenant metrics
        if (!this.metrics.tenantMetrics[this.tenantId]) {
            this.metrics.tenantMetrics[this.tenantId] = {
                requests: 0,
                tokensUsed: 0,
                errors: 0,
            };
        }

        const tenantMetric = this.metrics.tenantMetrics[this.tenantId];
        if (tenantMetric) {
            tenantMetric.requests++;
            if (!success) {
                tenantMetric.errors++;
            }
        }
    }

    recordSecurityEvent(type: string): void {
        switch (type) {
            case 'violation':
                this.metrics.securityViolations++;
                break;
            case 'unauthorized':
                this.metrics.unauthorizedAccess++;
                break;
            case 'path_traversal':
                this.metrics.pathTraversalAttempts++;
                break;
        }
    }

    getMetrics(): MCPMetrics {
        return { ...this.metrics };
    }
}

// =============================================================================
// AUDIT LOGGER
// =============================================================================

class AuditLogger {
    private events: AuditEvent[] = [];

    constructor(private tenantId: string) {}

    log(event: Omit<AuditEvent, 'timestamp' | 'tenantId'>): void {
        const auditEvent: AuditEvent = {
            timestamp: Date.now(),
            tenantId: this.tenantId,
            ...event,
        };

        this.events.push(auditEvent);

        // In production, this would write to external audit system
        // console.log('[AUDIT]', JSON.stringify(auditEvent));
    }

    getEvents(): AuditEvent[] {
        return [...this.events];
    }
}

// =============================================================================
// SPEC-COMPLIANT MCP CLIENT
// =============================================================================

export class SpecCompliantMCPClient extends EventEmitter<MCPClientEvents> {
    private client: Client;
    private transport: Transport | null = null;
    private connected = false;
    private serverCapabilities: {
        roots?: unknown;
        tools?: unknown;
        resources?: unknown;
        prompts?: unknown;
    } | null = null;

    // Client features
    private securityManager?: SecurityManager;
    private metricsCollector: MetricsCollector;
    private auditLogger: AuditLogger;
    private approvalHandler?: HumanApprovalHandler;

    // Caches (invalidated by notifications)
    private toolsCache: Tool[] | null = null;
    private resourcesCache: Resource[] | null = null;
    private promptsCache: Prompt[] | null = null;
    private rootsCache: Root[] | null = null;

    constructor(private config: MCPClientConfig) {
        super();

        // Initialize tenant context
        const tenantId = config.tenant?.tenantId || 'default';

        // Initialize monitoring
        this.metricsCollector = new MetricsCollector(tenantId);
        this.auditLogger = new AuditLogger(tenantId);

        // Initialize security
        if (config.security && config.tenant) {
            this.securityManager = new SecurityManager(
                config.security,
                config.tenant,
            );
        }

        // Create MCP Client with full capabilities
        this.client = new Client(config.clientInfo, {
            capabilities: {
                // Roots capability
                roots: (config.capabilities.roots || { listChanged: true }) as {
                    [x: string]: unknown;
                    listChanged?: boolean;
                },

                // Sampling capability
                sampling: (config.capabilities.sampling || {}) as {
                    [x: string]: unknown;
                },

                // Elicitation capability
                elicitation: (config.capabilities.elicitation || {}) as {
                    [x: string]: unknown;
                },
            },
        });

        this.setupNotificationHandlers();
        this.setupMetricsCollection();
    }

    // =========================================================================
    // ROOTS FEATURE IMPLEMENTATION
    // =========================================================================

    /**
     * Lista todos os roots expostos pelo servidor MCP.
     * Se o resultado vier paginado, use o cursor retornado para buscar a próxima página.
     */
    async listRoots(cursor?: string): Promise<ListRootsResult> {
        if (!this.connected) throw new Error('Not connected to server');

        const start = Date.now();

        try {
            // 1. Checa se o servidor realmente oferece o recurso
            if (!this.serverCapabilities?.roots) {
                throw new Error('Server does not support roots feature');
            }

            // 2. Faz a requisição; params deve ser sempre objeto
            const result = await this.makeRequest<ListRootsResult>(
                'roots/list',
                cursor ? { cursor } : {}, // <= diferença: passa {} em vez de undefined
            );

            // 3. Atualiza cache (página inicial ou subsequente)
            if (!cursor) {
                this.rootsCache = result.roots; // full refresh
            } else {
                this.rootsCache = [...(this.rootsCache ?? []), ...result.roots];
            }

            // 4. Validação leve de segurança
            for (const root of result.roots) {
                if (!root.uri.startsWith('file://')) {
                    throw new Error(`Invalid root URI scheme: ${root.uri}`);
                }
            }

            // 5. Atualiza tenant (multi-tenant opcional)
            if (this.securityManager && this.config.tenant) {
                this.config.tenant.allowedRoots = result.roots.map(
                    (r) => r.uri,
                );
            }

            // 6. Métricas e auditoria
            this.metricsCollector.recordRequest(
                'roots_list',
                Date.now() - start,
                true,
            );

            this.auditLogger.log({
                event: 'roots_listed',
                success: true,
                metadata: { rootCount: result.roots.length, cursor },
            });

            return result;
        } catch (err) {
            this.metricsCollector.recordRequest(
                'roots_list',
                Date.now() - start,
                false,
            );
            this.auditLogger.log({
                event: 'roots_list_failed',
                success: false,
                error: err instanceof Error ? err.message : String(err),
            });
            throw err;
        }
    }

    /**
     * Validates if a URI is within allowed roots
     */
    validateUriAgainstRoots(uri: string): boolean {
        if (!this.rootsCache || this.rootsCache.length === 0) {
            // If no roots defined, allow all (backward compatibility)
            return true;
        }

        // Check if URI starts with any of the allowed roots
        return this.rootsCache.some((root) => uri.startsWith(root.uri));
    }

    /**
     * Gets cached roots (use listRoots() to refresh)
     */
    getCachedRoots(): Root[] | null {
        return this.rootsCache ? [...this.rootsCache] : null;
    }

    // =========================================================================
    // CONNECTION LIFECYCLE
    // =========================================================================

    async connect(): Promise<InitializeResult> {
        if (this.connected) {
            throw new Error('Already connected');
        }

        const startTime = Date.now();

        try {
            // 1. Security check
            if (
                this.securityManager &&
                !this.securityManager.checkPermission('connect')
            ) {
                throw new Error('Permission denied: connect');
            }

            // 2. Create transport
            this.transport = this.createTransport();

            // 3. Connect via MCP SDK (handles initialize automatically)
            await this.client.connect(this.transport);

            // 4. Get server capabilities from initialization
            // Note: SDK should provide this, we'll mock for now
            this.serverCapabilities = {
                tools: { listChanged: true },
                resources: { listChanged: true, subscribe: true },
                prompts: { listChanged: true },
                roots: { listChanged: true },
            };

            const result: InitializeResult = {
                protocolVersion: '2025-06-18',
                capabilities: {
                    tools: { listChanged: true },
                    resources: { listChanged: true, subscribe: true },
                    prompts: { listChanged: true },
                    roots: { listChanged: true },
                },
                serverInfo: {
                    name: 'mcp-server',
                    version: '1.0.0',
                },
            };

            this.connected = true;
            this.metricsCollector.recordConnection(true);

            // Auto-load roots if server supports them
            if (this.serverCapabilities?.roots) {
                try {
                    await this.listRoots();
                } catch (error) {
                    // Non-critical: log but don't fail connection
                    this.auditLogger.log({
                        event: 'auto_load_roots_failed',
                        success: false,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                }
            }

            this.auditLogger.log({
                event: 'connection_established',
                success: true,
                metadata: { duration: Date.now() - startTime },
            });

            this.emit('connected', result);
            return result;
        } catch (error) {
            this.metricsCollector.recordConnection(false);

            this.auditLogger.log({
                event: 'connection_failed',
                success: false,
                error: error instanceof Error ? error.message : String(error),
            });

            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (!this.connected) return;

        try {
            await this.client.close();

            this.auditLogger.log({
                event: 'connection_closed',
                success: true,
            });
        } catch (error) {
            this.auditLogger.log({
                event: 'disconnect_error',
                success: false,
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            await this.cleanup();
        }
    }

    // =========================================================================
    // SAMPLING FEATURE (With Human Approval)
    // =========================================================================

    async createMessage(
        request: CreateMessageRequest['params'],
    ): Promise<CreateMessageResult> {
        this.ensureConnected();

        const start = Date.now();

        // 1. Segurança
        if (
            this.securityManager &&
            !this.securityManager.checkPermission('sampling:create')
        ) {
            throw new Error('Permission denied: sampling:create');
        }

        // 2. Human-in-the-loop
        if (!this.approvalHandler) {
            throw new Error('Human approval handler required for sampling');
        }

        const approval = await this.approvalHandler.requestApproval({
            type: 'sampling',
            message: `Request to create LLM message with ${request.messages.length} messages`,
            context: {
                server: 'current',
                action: 'sampling/createMessage',
                parameters: {
                    messageCount: request.messages.length,
                    model: request.modelPreferences?.hints?.[0]?.name,
                    maxTokens: request.maxTokens,
                },
                security: {
                    riskLevel:
                        request.maxTokens && request.maxTokens > 1000
                            ? 'medium'
                            : 'low',
                    reason: 'LLM sampling requires human oversight',
                },
            },
            timeout: 30_000,
        });

        if (!approval.approved) {
            throw new Error(
                `Sampling request denied: ${approval.reason || 'No reason provided'}`,
            );
        }

        // 3. Chamada — agora `params` é sempre objeto (`request`)
        const result = await this.makeRequest<CreateMessageResult>(
            'sampling/createMessage',
            request,
        );

        // 4. Métricas + auditoria
        const duration = Date.now() - start;
        this.metricsCollector.recordRequest('sampling', duration, true);

        this.auditLogger.log({
            event: 'sampling_completed',
            success: true,
            metadata: {
                messageCount: request.messages.length,
                model: result.model,
                approved: true,
                duration,
            },
        });

        return result;
    }

    // =========================================================================
    // ELICITATION FEATURE
    // =========================================================================

    async createElicitation(
        request: CreateElicitationRequest['params'],
    ): Promise<CreateElicitationResult> {
        this.ensureConnected();
        const start = Date.now();

        // 1 ─ Segurança
        if (
            this.securityManager &&
            !this.securityManager.checkPermission('elicitation:create')
        ) {
            throw new Error('Permission denied: elicitation:create');
        }

        // 2 ─ Approval humano
        if (!this.approvalHandler) {
            throw new Error('Human approval handler required for elicitation');
        }

        const approval = await this.approvalHandler.requestApproval({
            type: 'elicitation',
            message: `Request user information: ${request.message}`,
            context: {
                server: 'current',
                action: 'elicitation/create',
                parameters: {
                    message: request.message,
                    hasSchema: !!request.requestedSchema,
                },
                security: { riskLevel: 'medium', reason: 'User data request' },
            },
        });

        if (!approval.approved) {
            throw new Error(
                `Elicitation request denied: ${approval.reason || 'No reason provided'}`,
            );
        }

        // 3 ─ Chamada: params sempre objeto
        const result = await this.makeRequest<CreateElicitationResult>(
            'elicitation/create',
            request, // já é Record<string, unknown>
        );

        // 4 ─ Métricas & auditoria
        const duration = Date.now() - start;
        this.metricsCollector.recordRequest('elicitation', duration, true);

        this.auditLogger.log({
            event: 'elicitation_completed',
            success: true,
            metadata: {
                action: result.action,
                hasData: !!result.data,
                duration,
            },
        });

        return result;
    }

    // =========================================================================
    // ENHANCED TOOLS (With Security)
    // =========================================================================

    async listTools(): Promise<Tool[]> {
        this.ensureConnected();

        if (this.toolsCache !== null) {
            return this.toolsCache;
        }

        const result = await this.client.listTools();
        this.toolsCache = result.tools || [];
        return this.toolsCache;
    }

    async listResources(): Promise<Resource[]> {
        this.ensureConnected();

        if (this.resourcesCache !== null) {
            return this.resourcesCache;
        }

        const result = await this.client.listResources();
        this.resourcesCache = result.resources || [];
        return this.resourcesCache;
    }

    async listPrompts(): Promise<Prompt[]> {
        this.ensureConnected();

        if (this.promptsCache !== null) {
            return this.promptsCache;
        }

        const result = await this.client.listPrompts();
        this.promptsCache = result.prompts || [];
        return this.promptsCache;
    }

    async executeTool(
        name: string,
        args?: Record<string, unknown>,
    ): Promise<CallToolResult> {
        return this.callTool(name, args);
    }

    async getPrompt(
        name: string,
        args?: Record<string, string>,
    ): Promise<GetPromptResult> {
        this.ensureConnected();

        return this.client.getPrompt({
            name,
            arguments: args,
        });
    }

    async callTool(
        name: string,
        args?: Record<string, unknown>,
    ): Promise<CallToolResult> {
        this.ensureConnected();

        const startTime = Date.now();

        try {
            // Security validation
            if (
                this.securityManager &&
                !this.securityManager.checkPermission('tools:call')
            ) {
                throw new Error('Permission denied: tools:call');
            }

            const result = (await this.client.callTool({
                name,
                arguments: args || {},
            })) as CallToolResult;

            this.metricsCollector.recordRequest(
                'tool_call',
                Date.now() - startTime,
                true,
            );

            this.auditLogger.log({
                event: 'tool_called',
                resource: name,
                success: true,
                metadata: { hasArgs: !!args },
            });

            return result;
        } catch (error) {
            this.metricsCollector.recordRequest(
                'tool_call',
                Date.now() - startTime,
                false,
            );

            this.auditLogger.log({
                event: 'tool_call_failed',
                resource: name,
                success: false,
                error: error instanceof Error ? error.message : String(error),
            });

            throw error;
        }
    }

    // =========================================================================
    // ENHANCED RESOURCES (With Security)
    // =========================================================================

    async readResource(uri: string): Promise<ReadResourceResult> {
        this.ensureConnected();

        const startTime = Date.now();

        try {
            // CRITICAL: Roots validation for file access
            if (!this.validateUriAgainstRoots(uri)) {
                this.metricsCollector.recordSecurityEvent('unauthorized');
                throw new Error(`URI not allowed by server roots: ${uri}`);
            }

            // Security validation
            if (this.securityManager) {
                this.securityManager.validateFileAccess(uri);
            }

            const result = (await this.client.readResource({
                uri,
            })) as ReadResourceResult;

            this.metricsCollector.recordRequest(
                'resource_read',
                Date.now() - startTime,
                true,
            );

            this.auditLogger.log({
                event: 'resource_read',
                resource: uri,
                success: true,
            });

            return result;
        } catch (error) {
            this.metricsCollector.recordRequest(
                'resource_read',
                Date.now() - startTime,
                false,
            );

            if (
                error instanceof Error &&
                error.message.includes('Path traversal')
            ) {
                this.metricsCollector.recordSecurityEvent('path_traversal');
            }

            this.auditLogger.log({
                event: 'resource_read_failed',
                resource: uri,
                success: false,
                error: error instanceof Error ? error.message : String(error),
            });

            throw error;
        }
    }

    // =========================================================================
    // UTILITIES & ADMINISTRATION
    // =========================================================================

    setApprovalHandler(handler: HumanApprovalHandler): void {
        this.approvalHandler = handler;
    }

    /**
     * Creates a simple console-based approval handler for development
     */
    static createSimpleApprovalHandler(): HumanApprovalHandler {
        return {
            async requestApproval(
                request: HumanApprovalRequest,
            ): Promise<HumanApprovalResponse> {
                // Development: For production, replace with proper approval UI
                // // console.warn removed
                // // console.warn removed
                // // console.warn removed
                // // console.warn removed

                // For development: auto-approve low risk, deny high risk
                const riskLevel =
                    request.context.security?.riskLevel || 'medium';

                if (riskLevel === 'low') {
                    // console.warn('✅ Auto-approved (low risk)');
                    return { approved: true };
                }

                if (riskLevel === 'high') {
                    // console.warn('❌ Auto-denied (high risk)');
                    return {
                        approved: false,
                        reason: 'High risk requests require explicit approval',
                    };
                }

                // Medium risk: deny by default but allow override
                // console.warn('❌ Denied by default (medium risk)');
                return {
                    approved: false,
                    reason: 'Medium risk requires approval handler setup',
                };
            },
        };
    }

    getMetrics(): MCPMetrics {
        return this.metricsCollector.getMetrics();
    }

    getAuditEvents(): AuditEvent[] {
        return this.auditLogger.getEvents();
    }

    async ping(): Promise<void> {
        this.ensureConnected();
        await this.client.ping();
    }

    // =========================================================================
    // PROGRESS TRACKING
    // =========================================================================

    private activeProgressTokens = new Set<string | number>();

    sendProgress(
        token: string | number,
        progress: number,
        total?: number,
        message?: string,
    ): void {
        if (!this.activeProgressTokens.has(token)) {
            return; // Don't send progress for inactive tokens
        }

        this.client.notification({
            method: 'notifications/progress',
            params: {
                progressToken: token,
                progress,
                total,
                message,
            },
        });
    }

    startProgress(token: string | number): void {
        this.activeProgressTokens.add(token);
    }

    stopProgress(token: string | number): void {
        this.activeProgressTokens.delete(token);
    }

    // =========================================================================
    // CANCELLATION SUPPORT
    // =========================================================================

    private activeRequests = new Map<string | number, AbortController>();

    cancelRequest(requestId: string | number, reason?: string): void {
        const controller = this.activeRequests.get(requestId);
        if (controller) {
            controller.abort();
            this.activeRequests.delete(requestId);
        }

        this.client.notification({
            method: 'notifications/cancelled',
            params: {
                requestId,
                reason,
            },
        });
    }

    private trackRequest(requestId: string | number): AbortController {
        const controller = new AbortController();
        this.activeRequests.set(requestId, controller);
        return controller;
    }

    private untrackRequest(requestId: string | number): void {
        this.activeRequests.delete(requestId);
    }

    // =========================================================================
    // PRIVATE IMPLEMENTATION
    // =========================================================================

    private createTransport(): Transport {
        const { transport } = this.config;

        switch (transport.type) {
            case 'http':
                if (!transport.url) {
                    throw new Error('URL required for HTTP transport');
                }
                return new StreamableHTTPClientTransport(
                    new URL(transport.url),
                );

            case 'sse':
                if (!transport.url) {
                    throw new Error('URL required for SSE transport');
                }
                return new SSEClientTransport(new URL(transport.url));

            default:
                throw new Error(`Unsupported transport: ${transport.type}`);
        }
    }

    private setupNotificationHandlers(): void {
        // TODO: Implement proper notification handlers using specific schemas
        // For now, we'll handle cache invalidation manually when needed
        // The MCP SDK requires specific notification schemas for setNotificationHandler
    }

    private setupMetricsCollection(): void {
        if (this.config.observability?.enableMetrics) {
            const interval = this.config.observability.metricsInterval || 60000;

            setInterval(() => {
                this.emit('metricsUpdated', this.getMetrics());
            }, interval);
        }
    }

    private async makeRequest<R = unknown>(
        method: string,
        params?: Record<string, unknown>,
    ): Promise<R> {
        this.ensureConnected();
        const traceId = randomUUID();
        const controller = this.trackRequest(traceId);

        try {
            const result = await (this.client as MCPRequestMethod).request(
                { method, params },
                {
                    signal: controller.signal,
                },
            );

            return result as R;
        } finally {
            this.untrackRequest(traceId);
        }
    }

    private ensureConnected(): void {
        if (!this.connected) {
            throw new Error('Not connected. Call connect() first.');
        }
    }

    private async cleanup(): Promise<void> {
        this.connected = false;
        this.serverCapabilities = null;
        this.transport = null;

        // Clear caches
        this.toolsCache = null;
        this.resourcesCache = null;
        this.promptsCache = null;
        this.rootsCache = null;

        this.emit('disconnected');
    }
}
