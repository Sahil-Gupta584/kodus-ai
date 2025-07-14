/**
 * Context Factory - Unified Context Creation Pattern
 *
 * RESPONSABILIDADES:
 * - Criação unificada de contextos para workflows e agents
 * - Gerenciamento de state e memory
 * - Integração com SessionManager
 * - Configurações consistentes e type-safe
 *
 * BOAS PRÁTICAS:
 * - Sempre usar ContextStateManager para isolamento
 * - Integração automática com SessionManager quando aplicável
 * - Configurações unificadas e consistentes
 * - Factory pattern com validação e sanitização
 */

import type { BaseContext, AgentContext } from '../types/common-types.js';
import type { WorkflowContext } from '../types/workflow-types.js';
import { IdGenerator } from '../../utils/id-generator.js';
import { ContextStateService } from './services/state-service.js';
import { sessionService } from './services/session-service.js';

// Basic interfaces for context configuration
export interface BaseContextConfig {
    tenantId: string;
    executionId?: string;
    correlationId?: string;
    parentId?: string;
    metadata?: Record<string, unknown>;
}

export interface AgentContextConfig extends BaseContextConfig {
    agentName: string;
    sessionId?: string;
    threadId?: string;
    enableSession?: boolean;
    enableState?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🎯 CONFIGURAÇÕES UNIFICADAS
// ──────────────────────────────────────────────────────────────────────────────

// Usando tipos importados de context-config.ts

// ──────────────────────────────────────────────────────────────────────────────
// 🏭 FACTORY UNIFICADA
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Simplified Context Factory - Essential context creation only
 * Focuses on core functionality: state management and sessions
 */
export class UnifiedContextFactory {
    constructor() {
        // Simple constructor - no complex dependencies
    }

    /**
     * Cria contexto base - fundação para todos os outros contextos
     * Valida e sanitiza inputs, configura state management
     */
    createBaseContext(config: BaseContextConfig): BaseContext {
        // Validação de tenantId para segurança
        if (
            !config.tenantId ||
            typeof config.tenantId !== 'string' ||
            config.tenantId.trim().length === 0
        ) {
            throw new Error(
                'Valid tenantId is required for multi-tenant isolation',
            );
        }

        // Sanitização de tenantId para prevenir injection attacks
        const sanitizedTenantId = config.tenantId.replace(
            /[^a-zA-Z0-9\-_]/g,
            '',
        );
        if (sanitizedTenantId !== config.tenantId) {
            throw new Error(
                'TenantId contains invalid characters. Only alphanumeric, hyphens, and underscores are allowed',
            );
        }

        const correlationId =
            config.correlationId || IdGenerator.correlationId();

        // Track cleanup functions para proper resource management
        const cleanupFunctions: (() => void | Promise<void>)[] = [];

        return {
            // === IDENTIDADE ===
            tenantId: sanitizedTenantId,
            correlationId: correlationId,

            // === OBSERVABILIDADE ===
            startTime: Date.now(),
            status: 'RUNNING' as const,
            metadata: config.metadata || {},

            // === CLEANUP ===
            cleanup: async () => {
                const cleanupPromises = cleanupFunctions.map(
                    async (cleanupFn) => {
                        try {
                            await cleanupFn();
                        } catch {
                            // Cleanup failures should not crash the application
                        }
                    },
                );
                await Promise.allSettled(cleanupPromises);
                cleanupFunctions.length = 0;
            },

            // Método para registrar cleanup functions
            addCleanupFunction: (fn: () => void | Promise<void>) => {
                cleanupFunctions.push(fn);
            },
        } as BaseContext & {
            addCleanupFunction: (fn: () => void | Promise<void>) => void;
            cleanup: () => Promise<void>;
        };
    }

    /**
     * Creates agent context with state and session management
     * Simple, focused implementation without over-engineering
     */
    createAgentContext(config: AgentContextConfig): AgentContext {
        const baseContext = this.createBaseContext(config);

        // Create state service for this agent
        const stateService = new ContextStateService(baseContext, {
            maxNamespaceSize: 1000,
            maxNamespaces: 50,
        });

        // Create or get session if enabled
        let sessionContext = undefined;
        if (config.enableSession && config.threadId) {
            sessionContext = sessionService.findSessionByThread(
                config.threadId,
                config.tenantId,
            );

            if (!sessionContext) {
                const session = sessionService.createSession(
                    config.tenantId,
                    config.threadId,
                    { agentName: config.agentName },
                );
                sessionContext = sessionService.getSessionContext(session.id);
            }
        }

        return {
            ...baseContext,
            agentName: config.agentName,
            state: new Map<string, unknown>(),
            availableTools: [],
            // TODO
            //sessionId: sessionContext?.sessionId || sessionContext?.id,
            stateManager: stateService,
            invocationId: IdGenerator.executionId(),
            signal: new AbortController().signal,
            cleanup: async () => {
                // TODO
                // await baseContext.cleanup();
                await stateService.clear();
            },
        };
    }

    /**
     * Creates workflow context with basic state management
     * Simplified implementation for essential workflow needs
     */
    createWorkflowContext(
        config: BaseContextConfig & { workflowName: string },
    ): WorkflowContext {
        const baseContext = this.createBaseContext(config);

        const stateService = new ContextStateService(baseContext, {
            maxNamespaceSize: 1000,
            maxNamespaces: 50,
        });

        const executionId = config.executionId || IdGenerator.executionId();

        return {
            ...baseContext,
            workflowName: config.workflowName,
            executionId,
            stateManager: stateService,
            data: {} as Record<string, unknown>,
            currentSteps: [],
            completedSteps: [],
            failedSteps: [],
            signal: new AbortController().signal,
            isPaused: false,
            cleanup: async () => {
                await stateService.clear();
            },
        };
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 🎯 IMPLEMENTAÇÕES PADRÃO
// ──────────────────────────────────────────────────────────────────────────────

// Simple context state interface
export interface ContextState {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): void;
    has(key: string): boolean;
    delete(key: string): boolean;
    clear(): void;
}

// ──────────────────────────────────────────────────────────────────────────────
// 🚀 INSTÂNCIAS E FUNÇÕES HELPER
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Default context factory - simple and focused
 */
export const defaultContextFactory = new UnifiedContextFactory();

/**
 * Main context creation functions
 */
export const createAgentContext = (
    config: AgentContextConfig,
): AgentContext => {
    return defaultContextFactory.createAgentContext(config);
};

// ──────────────────────────────────────────────────────────────────────────────
// 🎯 FUNÇÕES HELPER PARA COMPATIBILIDADE
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Helper functions for quick context creation
 */
export const createBaseContext = (config: BaseContextConfig): BaseContext =>
    defaultContextFactory.createBaseContext(config);

export const createWorkflowContext = (
    config: BaseContextConfig & { workflowName: string },
): WorkflowContext => defaultContextFactory.createWorkflowContext(config);

// ──────────────────────────────────────────────────────────────────────────────
// 🔄 FUNÇÕES DE COMPATIBILIDADE (DEPRECATED)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Legacy compatibility functions
 */
export const contextFactory = UnifiedContextFactory;

export function createAgentBaseContext(
    agentName: string,
    tenantId: string,
): AgentContext {
    return createAgentContext({ agentName, tenantId });
}
