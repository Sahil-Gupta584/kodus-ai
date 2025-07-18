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

import type {
    BaseContext,
    AgentContext,
    ExecutionId,
    AgentExecutionOptions,
} from '../types/common-types.js';
import type { WorkflowContext } from '../types/workflow-types.js';
import { IdGenerator } from '../../utils/id-generator.js';
import { ContextStateService } from './services/state-service.js';
import { getGlobalMemoryManager } from '../memory/memory-manager.js';
import { RuntimeRegistry } from './runtime-registry.js';

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
    createBaseContext(config: BaseContext): BaseContext {
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
     * Always uses ExecutionRuntime for consistency
     */
    async createAgentContext(
        agentExecutionOptions: AgentExecutionOptions,
    ): Promise<AgentContext> {
        // Initialize memory manager
        const memoryManager = getGlobalMemoryManager();
        await memoryManager.initialize();

        // Get ExecutionRuntime for this thread (creates if doesn't exist)
        const threadId = agentExecutionOptions.thread?.id || 'default';
        const executionRuntime = RuntimeRegistry.getByThread(threadId);

        // Create BaseContext with defaults for missing values
        const baseContext: BaseContext = {
            tenantId: agentExecutionOptions.tenantId || 'default',
            correlationId:
                agentExecutionOptions.correlationId ||
                IdGenerator.correlationId(),
            startTime: Date.now(),
        };

        // Merge with user options
        const fullOptions = {
            ...baseContext,
            ...agentExecutionOptions,
        };

        return await executionRuntime.initializeAgentContext(
            { name: agentExecutionOptions.agentName }, // Agent with defaults
            fullOptions as BaseContext,
            agentExecutionOptions,
        );
    }

    /**
     * Creates workflow context with basic state management
     * Simplified implementation for essential workflow needs
     */
    createWorkflowContext(
        config: BaseContext & {
            workflowName: string;
            executionId: ExecutionId;
        },
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
export const createAgentContext = async (
    agentExecutionOptions: AgentExecutionOptions,
): Promise<AgentContext> => {
    return defaultContextFactory.createAgentContext(agentExecutionOptions);
};

// ──────────────────────────────────────────────────────────────────────────────
// 🎯 FUNÇÕES HELPER PARA COMPATIBILIDADE
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Helper functions for quick context creation
 */
export const createBaseContext = (config: BaseContext): BaseContext =>
    defaultContextFactory.createBaseContext(config);

export const createWorkflowContext = (
    config: BaseContext & { workflowName: string; executionId: ExecutionId },
): WorkflowContext => defaultContextFactory.createWorkflowContext(config);

// ──────────────────────────────────────────────────────────────────────────────
// 🔄 FUNÇÕES DE COMPATIBILIDADE (DEPRECATED)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Legacy compatibility functions
 */
export const contextFactory = UnifiedContextFactory;
