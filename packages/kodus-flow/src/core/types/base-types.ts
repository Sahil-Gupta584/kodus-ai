/**
 * @module core/types/base-types
 * @description Fundação universal de tipos para o framework
 *
 * Este módulo contém todos os tipos base que são reutilizados
 * em diferentes partes do framework, seguindo a arquitetura:
 *
 * base-types.ts (fundação)
 *     ↓
 * agent-types.ts (específico)
 * tool-types.ts (específico)
 * workflow-types.ts (específico)
 */

import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────────────
// 🆔 IDENTIFICADORES BASE DO SISTEMA
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Identificadores de entidades e contexto
 * Simplificados para string - mais prático para framework enterprise
 */
export type EntityId = string;
export type TenantId = string;
export type SessionId = string;
export type ThreadId = string;
export type CorrelationId = string;
export type UserId = string;
export type InvocationId = string;

/**
 * Identificadores de execução e workflow
 */
export type ExecutionId = string;
export type WorkflowId = string;
export type StepId = string;

/**
 * Identificadores de agentes e ferramentas
 */
export type AgentId = string;
export type ToolId = string;

/**
 * Identificadores de eventos e operações
 */
export type EventId = string;
export type OperationId = string;
export type ParentId = string;
export type SnapshotId = string;

// ──────────────────────────────────────────────────────────────────────────────
// 📋 SCHEMAS DE VALIDAÇÃO
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Schemas Zod para validação de identificadores
 * Seguindo o princípio de validação centralizada
 */
export const identifierSchemas = {
    entityId: z.string().min(1),
    tenantId: z.string().min(1).max(100),
    sessionId: z.string().min(1),
    threadId: z.string().min(1),
    correlationId: z.string().min(1).max(100),
    userId: z.string().min(1),
    invocationId: z.string().min(1),
    executionId: z.string().min(1),
    workflowId: z.string().min(1),
    stepId: z.string().min(1),
    agentId: z.string().min(1),
    toolId: z.string().min(1),
    eventId: z.string().min(1),
    operationId: z.string().min(1),
    parentId: z.string().min(1),
    snapshotId: z.string().min(1),
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// 🔧 INTERFACES BASE
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Interface base para todos os contextos
 * Seguindo o princípio de composição sobre herança
 */
export interface BaseContext {
    tenantId: TenantId;
    correlationId: CorrelationId;
    startTime: number;
    status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED';
    metadata: Record<string, unknown>;
    cleanup(): Promise<void>;
}

/**
 * Contexto de execução com identificadores de sessão
 */
export interface ExecutionContext extends BaseContext {
    executionId: ExecutionId;
    sessionId?: SessionId;
    threadId?: ThreadId;
}

// WorkflowContext é definido em workflow-types.ts para evitar conflitos

/**
 * Contexto específico para operações
 */
export interface OperationContext extends BaseContext {
    operationId: OperationId;
    executionId: ExecutionId;
}

/**
 * Contexto específico para eventos
 */
export interface EventContext extends BaseContext {
    eventId: EventId;
    threadId?: ThreadId;
    sessionId?: SessionId;
    parentId?: ParentId;
}

// ──────────────────────────────────────────────────────────────────────────────
// 👤 CONTEXTOS SEPARADOS - User vs System
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Contexto do Usuário - Dados controlados pelo usuário
 * IMUTÁVEL durante a execução
 */
export type UserContext = Record<string, unknown>;

/**
 * Contexto do Sistema - Dados gerados automaticamente pelo runtime
 * MUTÁVEL durante a execução
 */
export type SystemContext = {
    // === IDENTIDADE ===
    executionId: ExecutionId;
    correlationId: CorrelationId;
    sessionId?: SessionId;
    threadId: ThreadId;
    tenantId: TenantId;

    // === ESTADO DA EXECUÇÃO ===
    iteration: number;
    toolsUsed: number;
    lastToolResult?: unknown;
    lastToolName?: string;

    // === MEMÓRIA E HISTÓRICO ===
    conversationHistory: unknown[];
    memoryData?: unknown;

    // === MÉTRICAS E TIMING ===
    startTime: number;
    duration?: number;
    status: 'running' | 'completed' | 'failed' | 'paused';

    // === DEBUGGING ===
    debugInfo?: {
        agentName: string;
        invocationId: InvocationId;
        parentId?: string;
        [key: string]: unknown;
    };

    // === RECURSOS DISPONÍVEIS ===
    availableTools: Array<{
        name: string;
        description: string;
        schema: unknown;
    }>;

    // === PERFORMANCE ===
    performanceMetrics?: {
        memoryUsage?: number;
        cpuUsage?: number;
        networkLatency?: number;
        [key: string]: unknown;
    };
};

// SeparatedContext removed - use AgentContext with user/runtime pattern instead

/**
 * Runtime Context - Dados técnicos/internos do sistema
 * Alias mais claro para SystemContext
 */
export type RuntimeContext = SystemContext;

// AgentContextPattern integrated directly into AgentContext interface

/**
 * Contexto específico para snapshots
 */
export interface SnapshotContext extends BaseContext {
    snapshotId: SnapshotId;
    executionId: ExecutionId;
    parentId?: ParentId;
}

/**
 * Contexto específico para observabilidade
 */
export interface ObservabilityContext extends BaseContext {
    sessionId?: SessionId;
    threadId?: ThreadId;
}

/**
 * Contexto específico para segurança
 */
export interface SecurityContext extends BaseContext {
    sessionId?: SessionId;
    operationId?: OperationId;
}

/**
 * Contexto específico para rate limiting
 */
export interface RateLimitContext extends BaseContext {
    sessionId?: SessionId;
    operationId?: OperationId;
}

/**
 * Contexto específico para MCP
 */
export interface MCPContext extends BaseContext {
    sessionId?: SessionId;
    serverName?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// 📊 MÉTRICAS E TRACKING
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Interface para métricas de identificadores
 */
export interface IdentifierMetrics {
    tenantId: TenantId;
    correlationId: CorrelationId;
    timestamp: number;
    operation: string;
    duration?: number;
    success?: boolean;
    error?: string;
}

/**
 * Interface para tracking de identificadores
 */
export interface IdentifierTracking {
    tenantId: TenantId;
    correlationId: CorrelationId;
    sessionId?: SessionId;
    threadId?: ThreadId;
    executionId?: ExecutionId;
    agentId?: AgentId;
    workflowId?: WorkflowId;
    operationId?: OperationId;
    eventId?: EventId;
    parentId?: ParentId;
    snapshotId?: SnapshotId;
}

// ──────────────────────────────────────────────────────────────────────────────
// 📋 TIPOS DE STATUS E METADADOS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Status de execução
 */
export type ExecutionStatus =
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled';

/**
 * Status de operação
 */
export type OperationStatus =
    | 'idle'
    | 'active'
    | 'completed'
    | 'failed'
    | 'timeout';

/**
 * Status de workflow
 */
export type WorkflowStatus =
    | 'draft'
    | 'active'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'cancelled';

/**
 * Interface para metadados genéricos
 */
export interface Metadata {
    [key: string]: unknown;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🏗️ INTERFACES BASE PARA DEFINIÇÕES
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Interface base para definições
 */
export interface BaseDefinition {
    name: string;
    description?: string;
    version?: string;
    metadata?: Metadata;
}

/**
 * Interface base para resultados de execução
 */
export interface BaseExecutionResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: Error;
    duration: number;
    metadata?: Metadata;
}

/**
 * Interface base para configurações de engine
 */
export interface BaseEngineConfig {
    debug?: boolean;
    monitor?: boolean;
    timeout?: number;
    retries?: number;
    metadata?: Metadata;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🔧 FUNÇÕES UTILITÁRIAS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Valida se um objeto é um BaseContext válido
 */
export function validateBaseContext(obj: unknown): obj is BaseContext {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'tenantId' in obj &&
        'correlationId' in obj &&
        typeof (obj as Record<string, unknown>).tenantId === 'string' &&
        typeof (obj as Record<string, unknown>).correlationId === 'string'
    );
}

/**
 * Cria um contexto base a partir de strings
 */
export function createBaseContext(
    tenantIdValue: string,
    correlationIdValue: string,
    metadata: Record<string, unknown> = {},
): BaseContext {
    return {
        tenantId: tenantIdValue,
        correlationId: correlationIdValue,
        startTime: Date.now(),
        status: 'RUNNING',
        metadata,
        cleanup: async () => {
            // Implementação padrão de cleanup
        },
    };
}
