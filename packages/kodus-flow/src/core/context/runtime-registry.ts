/**
 * Runtime Registry - Per-Thread ExecutionRuntime Management
 *
 * RESPONSABILIDADES:
 * - Manter uma instância de ExecutionRuntime por threadId
 * - Garantir isolamento entre threads/conversas
 * - Cleanup automático de threads inativas
 * - Thread-safe access pattern
 */

import { createLogger } from '../../observability/index.js';
import { ExecutionRuntime } from './execution-runtime.js';
import { getGlobalMemoryManager } from '../memory/memory-manager.js';

const logger = createLogger('runtime-registry');

/**
 * Registry para gerenciar ExecutionRuntimes por thread
 * Garante que cada thread/conversa tenha sua própria instância persistente
 */
export class RuntimeRegistry {
    private static instances = new Map<string, ExecutionRuntime>();
    private static lastAccess = new Map<string, number>();
    private static cleanupInterval?: NodeJS.Timeout;

    // Configurações
    private static readonly cleanupIntervalMs = 10 * 60 * 1000; // 10 minutos
    private static readonly threadTimeoutMs = 30 * 60 * 1000; // 30 minutos

    /**
     * Obter ExecutionRuntime para uma thread específica
     * Cria nova instância se não existir
     */
    static getByThread(threadId: string): ExecutionRuntime {
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

        let executionRuntime = this.instances.get(threadId);

        if (!executionRuntime) {
            logger.debug('Creating new ExecutionRuntime for thread', {
                threadId,
            });

            // Criar nova instância
            const memoryManager = getGlobalMemoryManager();
            executionRuntime = new ExecutionRuntime(memoryManager);

            this.instances.set(threadId, executionRuntime);
            this.startCleanupIfNeeded();
        }

        // Atualizar último acesso
        this.lastAccess.set(threadId, Date.now());

        logger.debug('ExecutionRuntime accessed for thread', {
            threadId,
            totalThreads: this.instances.size,
        });

        return executionRuntime;
    }

    /**
     * Verificar se existe ExecutionRuntime para thread
     */
    static hasThread(threadId: string): boolean {
        return this.instances.has(threadId);
    }

    /**
     * Remover ExecutionRuntime de uma thread específica
     * Útil para cleanup manual ou quando thread finaliza
     */
    static removeThread(threadId: string): boolean {
        const had = this.instances.delete(threadId);
        this.lastAccess.delete(threadId);

        if (had) {
            logger.debug('ExecutionRuntime removed for thread', {
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
export function getExecutionRuntimeByThread(
    threadId: string,
): ExecutionRuntime {
    return RuntimeRegistry.getByThread(threadId);
}
