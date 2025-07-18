/**
 * Context Manager Registry - Per-Thread ContextManager Management
 *
 * RESPONSABILIDADES:
 * - Manter uma instância de ContextManager por threadId
 * - Garantir isolamento entre threads/conversas
 * - Cleanup automático de threads inativas
 * - Thread-safe access pattern
 */

import { createLogger } from '../../observability/index.js';
import { ContextManager } from './context-manager.js';
import { getGlobalMemoryManager } from '../memory/memory-manager.js';

const logger = createLogger('context-registry');

/**
 * Registry para gerenciar ContextManagers por thread
 * Garante que cada thread/conversa tenha sua própria instância persistente
 */
export class ContextManagerRegistry {
    private static instances = new Map<string, ContextManager>();
    private static lastAccess = new Map<string, number>();
    private static cleanupInterval?: NodeJS.Timeout;

    // Configurações
    private static readonly cleanupIntervalMs = 10 * 60 * 1000; // 10 minutos
    private static readonly threadTimeoutMs = 30 * 60 * 1000; // 30 minutos

    /**
     * Obter ContextManager para uma thread específica
     * Cria nova instância se não existir
     */
    static getByThread(threadId: string): ContextManager {
        if (!threadId || typeof threadId !== 'string') {
            throw new Error('ThreadId must be a non-empty string');
        }

        // Sanitizar threadId para segurança
        const sanitizedThreadId = threadId.replace(/[^a-zA-Z0-9\-_]/g, '');
        if (sanitizedThreadId !== threadId) {
            throw new Error(
                'ThreadId contains invalid characters. Only alphanumeric, hyphens, and underscores are allowed',
            );
        }

        let contextManager = this.instances.get(threadId);

        if (!contextManager) {
            logger.debug('Creating new ContextManager for thread', {
                threadId,
            });

            // Criar nova instância
            const memoryManager = getGlobalMemoryManager();
            contextManager = new ContextManager(memoryManager);

            this.instances.set(threadId, contextManager);
            this.startCleanupIfNeeded();
        }

        // Atualizar último acesso
        this.lastAccess.set(threadId, Date.now());

        logger.debug('ContextManager accessed for thread', {
            threadId,
            totalThreads: this.instances.size,
        });

        return contextManager;
    }

    /**
     * Verificar se existe ContextManager para thread
     */
    static hasThread(threadId: string): boolean {
        return this.instances.has(threadId);
    }

    /**
     * Remover ContextManager de uma thread específica
     * Útil para cleanup manual ou quando thread finaliza
     */
    static removeThread(threadId: string): boolean {
        const had = this.instances.delete(threadId);
        this.lastAccess.delete(threadId);

        if (had) {
            logger.debug('ContextManager removed for thread', {
                threadId,
                remainingThreads: this.instances.size,
            });
        }

        return had;
    }

    /**
     * Obter estatísticas do registry
     */
    static getStats(): {
        totalThreads: number;
        threadIds: string[];
        oldestThread?: { threadId: string; lastAccess: number };
        newestThread?: { threadId: string; lastAccess: number };
    } {
        const threadIds = Array.from(this.instances.keys());
        const accessTimes = Array.from(this.lastAccess.entries());

        let oldestThread, newestThread;

        if (accessTimes.length > 0) {
            const sorted = accessTimes.sort((a, b) => a[1] - b[1]);
            oldestThread = {
                threadId: sorted[0]?.[0] || '',
                lastAccess: sorted[0]?.[1] || 0,
            };
            newestThread = {
                threadId: sorted[sorted.length - 1]?.[0] || '',
                lastAccess: sorted[sorted.length - 1]?.[1] || 0,
            };
        }

        return {
            totalThreads: this.instances.size,
            threadIds,
            oldestThread,
            newestThread,
        };
    }

    /**
     * Cleanup de threads inativas
     * Remove threads que não foram acessadas há muito tempo
     */
    static cleanup(force = false): number {
        const now = Date.now();
        const threadsToRemove: string[] = [];

        for (const [threadId, lastAccessTime] of this.lastAccess.entries()) {
            const timeSinceAccess = now - lastAccessTime;

            if (force || timeSinceAccess > this.threadTimeoutMs) {
                threadsToRemove.push(threadId);
            }
        }

        let removedCount = 0;
        for (const threadId of threadsToRemove) {
            if (this.removeThread(threadId)) {
                removedCount++;
            }
        }

        if (removedCount > 0) {
            logger.info('Cleaned up inactive threads', {
                removedCount,
                force,
                remainingThreads: this.instances.size,
            });
        }

        return removedCount;
    }

    /**
     * Iniciar cleanup automático se ainda não estiver rodando
     */
    private static startCleanupIfNeeded(): void {
        if (!this.cleanupInterval) {
            this.cleanupInterval = setInterval(() => {
                this.cleanup();
            }, this.cleanupIntervalMs);

            logger.debug('Started automatic cleanup interval', {
                intervalMs: this.cleanupIntervalMs,
                timeoutMs: this.threadTimeoutMs,
            });
        }
    }

    /**
     * Parar cleanup automático
     * Útil para testes ou shutdown
     */
    static stopCleanup(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
            logger.debug('Stopped automatic cleanup interval');
        }
    }

    /**
     * Limpar tudo - útil para testes ou reset
     */
    static clear(): void {
        const threadCount = this.instances.size;
        this.instances.clear();
        this.lastAccess.clear();
        this.stopCleanup();

        logger.info('Registry cleared', { removedThreads: threadCount });
    }
}

/**
 * Função helper para conveniência
 */
export function getContextManagerByThread(threadId: string): ContextManager {
    return ContextManagerRegistry.getByThread(threadId);
}
