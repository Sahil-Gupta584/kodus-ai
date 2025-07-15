/**
 * MCP Schema Cache
 * Cache de schemas para melhorar performance
 */

import type { MCPSchemaCache } from './types.js';
import { createLogger } from '../../observability/index.js';

export class MCPSchemaCacheManager {
    private logger = createLogger('mcp-schema-cache');
    private cache: Map<string, { schema: unknown; timestamp: number }>;
    private config: MCPSchemaCache;

    constructor(config: Partial<MCPSchemaCache> = {}) {
        this.config = {
            ttl: 5 * 60 * 1000, // 5 minutos
            maxSize: 100,
            invalidateOnChange: true,
            cache: new Map(),
            ...config,
        };
        this.cache = this.config.cache;

        // Limpa cache expirado periodicamente
        setInterval(() => {
            this.cleanupExpired();
        }, 60000); // A cada minuto

        this.logger.info('MCP Schema Cache initialized', {
            config: this.config,
        });
    }

    /**
     * Obtém schema do cache
     */
    get(key: string): unknown | null {
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }

        // Verifica se expirou
        if (Date.now() - entry.timestamp > this.config.ttl) {
            this.cache.delete(key);
            return null;
        }

        this.logger.debug('Schema cache hit', { key });
        return entry.schema;
    }

    /**
     * Adiciona schema ao cache
     */
    set(key: string, schema: unknown): void {
        // Verifica limite de tamanho
        if (this.cache.size >= this.config.maxSize) {
            this.evictOldest();
        }

        this.cache.set(key, {
            schema,
            timestamp: Date.now(),
        });

        this.logger.debug('Schema cached', { key, cacheSize: this.cache.size });
    }

    /**
     * Remove schema do cache
     */
    delete(key: string): boolean {
        const deleted = this.cache.delete(key);
        if (deleted) {
            this.logger.debug('Schema removed from cache', { key });
        }
        return deleted;
    }

    /**
     * Limpa todo o cache
     */
    clear(): void {
        this.cache.clear();
        this.logger.info('Schema cache cleared');
    }

    /**
     * Obtém estatísticas do cache
     */
    getStats(): {
        size: number;
        maxSize: number;
        hitRate: number;
        missRate: number;
        totalRequests: number;
    } {
        return {
            size: this.cache.size,
            maxSize: this.config.maxSize,
            hitRate: 0, // TODO: Implementar tracking de hits
            missRate: 0, // TODO: Implementar tracking de misses
            totalRequests: 0, // TODO: Implementar tracking de requests
        };
    }

    /**
     * Gera chave única para schema
     */
    generateKey(
        serverName: string,
        toolName: string,
        schemaHash: string,
    ): string {
        return `${serverName}:${toolName}:${schemaHash}`;
    }

    /**
     * Gera hash simples do schema
     */
    generateSchemaHash(schema: unknown): string {
        try {
            return JSON.stringify(schema).slice(0, 100); // Primeiros 100 chars
        } catch {
            return 'unknown';
        }
    }

    /**
     * Remove entradas expiradas
     */
    private cleanupExpired(): void {
        const now = Date.now();
        let expiredCount = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.config.ttl) {
                this.cache.delete(key);
                expiredCount++;
            }
        }

        if (expiredCount > 0) {
            this.logger.debug('Cleaned up expired schemas', { expiredCount });
        }
    }

    /**
     * Remove entrada mais antiga (LRU)
     */
    private evictOldest(): void {
        let oldestKey: string | null = null;
        let oldestTime = Date.now();

        for (const [key, entry] of this.cache.entries()) {
            if (entry.timestamp < oldestTime) {
                oldestTime = entry.timestamp;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.logger.debug('Evicted oldest schema', { key: oldestKey });
        }
    }

    /**
     * Remove schemas de um servidor específico
     */
    removeSchemasByServer(serverName: string): number {
        let removedCount = 0;
        const keysToRemove: string[] = [];

        // Encontra todas as chaves que começam com o nome do servidor
        for (const [key] of this.cache.entries()) {
            if (key.startsWith(`${serverName}:`)) {
                keysToRemove.push(key);
            }
        }

        // Remove as chaves encontradas
        for (const key of keysToRemove) {
            if (this.cache.delete(key)) {
                removedCount++;
            }
        }

        this.logger.info('Removed schemas by server', {
            serverName,
            removedCount,
        });

        return removedCount;
    }

    /**
     * Verifica se cache está cheio
     */
    isFull(): boolean {
        return this.cache.size >= this.config.maxSize;
    }

    /**
     * Obtém tamanho atual do cache
     */
    getSize(): number {
        return this.cache.size;
    }

    /**
     * Obtém configuração do cache
     */
    getConfig(): MCPSchemaCache {
        return { ...this.config };
    }

    /**
     * Atualiza configuração do cache
     */
    updateConfig(newConfig: Partial<MCPSchemaCache>): void {
        this.config = { ...this.config, ...newConfig };
        this.logger.info('Schema cache config updated', {
            config: this.config,
        });
    }
}
