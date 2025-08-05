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
import { ConversationHistory } from '../context/services/session-service.js';

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
export type CallId = string;

export type ExecutionId = string;
export type WorkflowId = string;
export type StepId = string;

export type AgentId = string;
export type ToolId = string;

export type EventId = string;
export type OperationId = string;
export type ParentId = string;
export type SnapshotId = string;

// Additional identifiers consolidated from other files
export type ContextId = string;
export type MemoryId = string;
export type StateId = string;
export type WorkflowExecutionId = string;
export type ToolCallId = string;

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
export type BaseContext = {
    tenantId: TenantId;
    correlationId: CorrelationId;
    startTime: number;
};

/**
 * Contexto de execução com identificadores de sessão
 */
export type ExecutionContext = BaseContext & {
    executionId: ExecutionId;
    sessionId?: SessionId;
    threadId?: ThreadId;
    status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED';
};

// WorkflowContext é definido em workflow-types.ts para evitar conflitos

/**
 * Contexto específico para operações
 */
export type OperationContext = BaseContext & {
    operationId: OperationId;
    executionId: ExecutionId;
};

// EventContext removed - use ExecutionContext for event tracking or UnifiedEventContext from events-unified.ts for event metadata

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
export type SystemContext = BaseContext & {
    // === IDENTIDADE ===
    threadId: ThreadId;
    status: 'running' | 'completed' | 'failed' | 'paused';

    executionId: ExecutionId;
    sessionId?: SessionId;

    // === ESTADO DA EXECUÇÃO ===
    iteration?: number;
    toolsUsed?: number;
    lastToolResult?: unknown;
    // === MEMÓRIA E HISTÓRICO ===
    conversationHistory?: ConversationHistory[];
    memoryData?: unknown;

    // === MÉTRICAS E TIMING ===
    duration?: number;
};

// SeparatedContext removed - use AgentContext with user/runtime pattern instead

// RuntimeContext removed - use SystemContext directly

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
