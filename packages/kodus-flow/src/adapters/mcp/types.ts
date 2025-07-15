/**
 * MCP Adapter Types - Kodus Flow specific
 *
 * Para tipos oficiais do MCP, importe diretamente de:
 * @modelcontextprotocol/sdk/types.js
 */

import {
    CancelledNotification,
    InitializeResult,
    ProgressNotification,
} from '@modelcontextprotocol/sdk/types.js';

// =============================================================================
// MCP ELICITATION TYPES (when not available in SDK)
// =============================================================================

export interface CreateElicitationRequest {
    params: {
        message: string;
        requestedSchema?: unknown;
        timeout?: number;
    };
}

export type TransportType = 'http' | 'sse' | 'websocket';

export interface MCPTransport {
    connect(): Promise<void>;
    request<T>(
        method: string,
        params?: unknown,
        signal?: AbortSignal,
    ): Promise<T>;
    close(): Promise<void>;
}

export interface CreateElicitationResult {
    action: 'continue' | 'retry' | 'cancel';
    data?: unknown;
    message?: string;
}

// =============================================================================
// CLIENT CAPABILITIES
// =============================================================================

export interface CompleteClientCapabilities {
    tools?: {
        listChanged?: boolean;
    };
    resources?: {
        listChanged?: boolean;
        subscribe?: boolean;
    };
    prompts?: {
        listChanged?: boolean;
    };
    roots?: {
        listChanged?: boolean;
    };
    sampling?: Record<string, unknown>;
    elicitation?: Record<string, unknown>;
}

// =============================================================================
// KODUS FLOW ADAPTER TYPES - apenas o que não existe no SDK oficial
// =============================================================================

// =============================================================================
// SECURITY & MULTI-TENANT TYPES
// =============================================================================

export interface TenantContext {
    tenantId: string;
    userId?: string;
    permissions: string[];
    allowedRoots: string[];
    quotas: {
        maxRequests: number;
        maxTokens: number;
        rateLimit: number;
    };
}

export interface SecurityPolicy {
    /** Allowed file URI patterns */
    allowedUriPatterns: RegExp[];
    /** Blocked file URI patterns */
    blockedUriPatterns: RegExp[];
    /** Maximum file size for reads */
    maxFileSize: number;
    /** Path traversal protection */
    preventPathTraversal: boolean;
    /** Require human approval for sampling */
    requireHumanApproval: boolean;
}

// =============================================================================
// OBSERVABILITY & MONITORING TYPES
// =============================================================================

export interface MCPMetrics {
    // Connection metrics
    connectionsTotal: number;
    connectionsActive: number;
    connectionErrors: number;

    // Request metrics
    requestsTotal: number;
    requestsSuccessful: number;
    requestsFailed: number;
    requestDuration: number[];

    // Feature usage
    toolCalls: number;
    resourceReads: number;
    promptGets: number;
    samplingRequests: number;
    elicitationRequests: number;

    // Security events
    securityViolations: number;
    unauthorizedAccess: number;
    pathTraversalAttempts: number;

    // Per-tenant metrics
    tenantMetrics: Record<
        string,
        {
            requests: number;
            tokensUsed: number;
            errors: number;
        }
    >;
}

export interface AuditEvent {
    timestamp: number;
    tenantId: string;
    userId?: string;
    event: string;
    resource?: string;
    success: boolean;
    error?: string;
    metadata?: Record<string, unknown>;
}

// =============================================================================
// CLIENT CONFIGURATION
// =============================================================================

export interface MCPClientConfig {
    clientInfo: {
        name: string;
        version: string;
    };

    /** Transport configuration */
    transport: {
        type: TransportType;

        // Stdio config
        command?: string;
        args?: string[];
        env?: Record<string, string>;
        cwd?: string;

        // Network config
        url?: string;
        headers?: Record<string, string>;

        // Connection options
        timeout?: number;
        retries?: number;
        keepAlive?: boolean;
    };

    /** Client capabilities */
    capabilities: CompleteClientCapabilities;

    /** Security configuration */
    security?: SecurityPolicy;

    /** Multi-tenant configuration */
    tenant?: TenantContext;

    /** Observability configuration */
    observability?: {
        enableMetrics: boolean;
        enableTracing: boolean;
        enableAuditLog: boolean;
        metricsInterval: number;
    };
}

// =============================================================================
// HUMAN APPROVAL INTERFACES
// =============================================================================

export interface HumanApprovalRequest {
    type: 'sampling' | 'elicitation' | 'tool_call' | 'resource_access';
    message: string;
    context: {
        server: string;
        action: string;
        parameters?: Record<string, unknown>;
        security?: {
            riskLevel: 'low' | 'medium' | 'high';
            reason: string;
        };
    };
    timeout?: number;
}

export interface HumanApprovalResponse {
    approved: boolean;
    reason?: string;
    remember?: boolean;
    conditions?: string[];
}

export interface HumanApprovalHandler {
    requestApproval(
        request: HumanApprovalRequest,
    ): Promise<HumanApprovalResponse>;
}

// =============================================================================
// EVENT SYSTEM
// =============================================================================

export interface MCPClientEvents {
    // Connection events
    connected: [InitializeResult];
    disconnected: [string?];
    error: [Error];

    // Server notifications
    toolsListChanged: [];
    resourcesListChanged: [];
    promptsListChanged: [];
    rootsListChanged: [];

    // Progress events
    progress: [ProgressNotification];
    cancelled: [CancelledNotification];

    // Security events
    securityViolation: [AuditEvent];
    securityApprovalRequired: [HumanApprovalRequest];
    securityApprovalResponse: [HumanApprovalResponse];

    // Tenant events
    tenantQuotaExceeded: [TenantContext];
    tenantRateLimited: [TenantContext];

    // Observability events
    metricsUpdated: [MCPMetrics];
    auditEvent: [AuditEvent];
}

// =============================================================================
// ADAPTER TYPES (for compatibility with existing code)
// =============================================================================

export interface MCPServerConfig {
    name: string;
    type: TransportType;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
    url?: string;
    headers?: Record<string, string>;
    timeout?: number;
    retries?: number;
    allowedTools?: string[];
}

export interface MCPAdapterConfig {
    servers: MCPServerConfig[];
    defaultTimeout?: number;
    maxRetries?: number;
    onError?: (error: Error, serverName: string) => void;
}

// Raw tool from MCP SDK (without execute function)
export interface MCPToolRaw {
    name: string;
    description?: string;
    inputSchema: unknown;
}

// Tool with execute function for engine compatibility
export interface MCPTool extends MCPToolRaw {
    execute: (args: unknown, ctx: unknown) => Promise<unknown>;
}

export interface MCPResource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
}

export interface MCPPrompt {
    name: string;
    description?: string;
    arguments?: Array<{
        name: string;
        description?: string;
        required?: boolean;
    }>;
}

export interface MCPToolRawWithServer extends MCPToolRaw {
    serverName: string;
}

export interface MCPToolWithServer extends MCPTool {
    serverName: string;
}

export interface MCPResourceWithServer extends MCPResource {
    serverName: string;
}

export interface MCPPromptWithServer extends MCPPrompt {
    serverName: string;
}

export interface MCPAdapter {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    getTools(): Promise<MCPTool[]>;
    hasTool(name: string): boolean;
    listResources(): Promise<MCPResourceWithServer[]>;
    readResource(uri: string, serverName?: string): Promise<unknown>;
    listPrompts(): Promise<MCPPromptWithServer[]>;
    getPrompt(
        name: string,
        args?: Record<string, string>,
        serverName?: string,
    ): Promise<unknown>;
    executeTool(
        name: string,
        args?: Record<string, unknown>,
        serverName?: string,
    ): Promise<unknown>;
    getMetrics(): Record<string, unknown>;
    getRegistry(): unknown;
}
