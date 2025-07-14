/**
 * @module core/types/context-separation
 * @description Separação clara entre contexto do usuário vs sistema
 */

import { z } from 'zod';

export interface UserContext {
    metadata?: Record<string, unknown>;
}

/**
 * Schema de validação para contexto do usuário
 */
export const userContextSchema = z.object({
    metadata: z.record(z.unknown()).optional(),
});

// =============================================================================
// 🔧 CONTEXTO DO SISTEMA
// =============================================================================

/**
 * Contexto do Sistema - Dados gerados automaticamente pelo SDK
 * Não pode ser modificado pelo usuário, apenas leitura
 */
export interface SystemContext {
    // 🔧 Identificação da execução
    executionId: string;
    correlationId: string;
    sessionId?: string;
    threadId: string;
    tenantId: string;

    // 📊 Estado da execução
    iteration: number;
    toolsUsed: number;
    lastToolResult?: unknown;
    lastToolName?: string;

    // 🧠 Memória e persistência
    conversationHistory: unknown[];
    memoryData?: unknown;

    // 📈 Métricas e timing
    startTime: number;
    duration?: number;
    status: 'running' | 'completed' | 'failed' | 'paused';

    // 🔍 Debugging e observabilidade
    debugInfo?: {
        agentName: string;
        invocationId: string;
        parentId?: string;
        [key: string]: unknown;
    };

    // 🛠️ Recursos disponíveis
    availableTools: Array<{
        name: string;
        description: string;
        schema: unknown;
    }>;

    // 📊 Performance
    performanceMetrics?: {
        memoryUsage?: number;
        cpuUsage?: number;
        networkLatency?: number;
        [key: string]: unknown;
    };
}

/**
 * Schema de validação para contexto do sistema
 */
export const systemContextSchema = z.object({
    executionId: z.string(),
    correlationId: z.string(),
    sessionId: z.string().optional(),
    threadId: z.string(),
    tenantId: z.string(),
    iteration: z.number(),
    toolsUsed: z.number(),
    lastToolResult: z.unknown().optional(),
    lastToolName: z.string().optional(),
    conversationHistory: z.array(z.unknown()),
    memoryData: z.unknown().optional(),
    startTime: z.number(),
    duration: z.number().optional(),
    status: z.enum(['running', 'completed', 'failed', 'paused']),
    debugInfo: z.record(z.unknown()).optional(),
    availableTools: z.array(
        z.object({
            name: z.string(),
            description: z.string(),
            schema: z.unknown().optional(),
        }),
    ),
    performanceMetrics: z.record(z.unknown()).optional(),
});

// =============================================================================
// 🎯 CONTEXTO SEPARADO
// =============================================================================

/**
 * Contexto Separado - Combina contexto do usuário e sistema
 * Mantém separação clara entre responsabilidades
 */
export interface SeparatedContext {
    // 👤 Contexto do usuário (controlado pelo usuário)
    user: UserContext;

    // 🔧 Contexto do sistema (gerado automaticamente)
    system: SystemContext;
}

/**
 * Schema de validação para contexto separado
 */
export const separatedContextSchema = z.object({
    user: userContextSchema,
    system: systemContextSchema,
});

// =============================================================================
// 🏭 FACTORY FUNCTIONS
// =============================================================================

/**
 * Cria contexto do sistema com valores padrão
 */
export function createSystemContext(
    executionId: string,
    correlationId: string,
    threadId: string,
    tenantId: string,
    agentName: string,
    overrides?: Partial<SystemContext>,
): SystemContext {
    return {
        executionId,
        correlationId,
        threadId,
        tenantId,
        iteration: 0,
        toolsUsed: 0,
        conversationHistory: [],
        startTime: Date.now(),
        status: 'running',
        availableTools: [],
        debugInfo: {
            agentName,
            invocationId: executionId,
        },
        ...overrides,
    };
}

/**
 * Cria contexto separado completo
 */
export function createSeparatedContext(
    userContext: UserContext,
    systemContext: SystemContext,
): SeparatedContext {
    return {
        user: userContext,
        system: systemContext,
    };
}

// =============================================================================
// 🔍 UTILITY FUNCTIONS
// =============================================================================

/**
 * Verifica se um objeto é UserContext
 */
export function isUserContext(obj: unknown): obj is UserContext {
    return typeof obj === 'object' && obj !== null && 'userName' in obj;
}

/**
 * Verifica se um objeto é SystemContext
 */
export function isSystemContext(obj: unknown): obj is SystemContext {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'executionId' in obj &&
        'correlationId' in obj &&
        'threadId' in obj
    );
}

/**
 * Verifica se um objeto é SeparatedContext
 */
export function isSeparatedContext(obj: unknown): obj is SeparatedContext {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'user' in obj &&
        'system' in obj &&
        isUserContext((obj as SeparatedContext).user) &&
        isSystemContext((obj as SeparatedContext).system)
    );
}

/**
 * Extrai apenas dados do usuário de um contexto separado
 */
export function extractUserData(context: SeparatedContext): UserContext {
    return context.user;
}

/**
 * Extrai apenas dados do sistema de um contexto separado
 */
export function extractSystemData(context: SeparatedContext): SystemContext {
    return context.system;
}

/**
 * Atualiza contexto do sistema (apenas campos permitidos)
 */
export function updateSystemContext(
    existing: SystemContext,
    updates: Partial<
        Pick<
            SystemContext,
            | 'iteration'
            | 'toolsUsed'
            | 'lastToolResult'
            | 'lastToolName'
            | 'conversationHistory'
            | 'duration'
            | 'status'
            | 'performanceMetrics'
        >
    >,
): SystemContext {
    return {
        ...existing,
        ...updates,
    };
}
