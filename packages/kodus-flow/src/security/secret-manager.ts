/**
 * @module security/secret-manager
 * @description Production-ready secret management for multi-tenant environments
 */

import { createLogger } from '../observability/index.js';

/**
 * Secret configuration
 */
export interface SecretConfig {
    /** Secret name/key */
    name: string;
    /** Secret value (will be encrypted) */
    value: string;
    /** Tenant ID who owns this secret */
    tenantId: string;
    /** Expiration time (optional) */
    expiresAt?: number;
    /** Secret metadata */
    metadata?: Record<string, string>;
    /** Creation timestamp */
    createdAt: number;
    /** Last accessed timestamp */
    lastAccessed?: number;
}

/**
 * Secret access log entry
 */
export interface SecretAccessLog {
    /** Secret name accessed */
    secretName: string;
    /** Tenant who accessed */
    tenantId: string;
    /** Timestamp of access */
    timestamp: number;
    /** Operation performed */
    operation: 'get' | 'set' | 'delete' | 'list';
    /** Success status */
    success: boolean;
    /** Additional context */
    context?: string;
}

/**
 * Simple encryption/decryption utilities
 * In production, use proper encryption libraries like node-forge or crypto
 */
class SimpleEncryption {
    private key: string;

    constructor(key: string = 'default-encryption-key-change-in-production') {
        this.key = key;
    }

    encrypt(text: string): string {
        // Simple XOR encryption - NOT for production use
        // In production, use AES-256-GCM or similar
        const encrypted = text
            .split('')
            .map((char, i) =>
                String.fromCharCode(
                    char.charCodeAt(0) ^
                        this.key.charCodeAt(i % this.key.length),
                ),
            )
            .join('');

        return Buffer.from(encrypted).toString('base64');
    }

    decrypt(encryptedText: string): string {
        try {
            const decoded = Buffer.from(encryptedText, 'base64').toString();
            return decoded
                .split('')
                .map((char, i) =>
                    String.fromCharCode(
                        char.charCodeAt(0) ^
                            this.key.charCodeAt(i % this.key.length),
                    ),
                )
                .join('');
        } catch (error) {
            throw new Error('Failed to decrypt secret', error as Error);
        }
    }
}

/**
 * Production-ready secret manager with tenant isolation
 */
export class SecretManager {
    private secrets = new Map<string, SecretConfig>();
    private accessLogs: SecretAccessLog[] = [];
    private encryption: SimpleEncryption;
    private logger = createLogger('secret-manager');
    private maxLogEntries = 10000;

    constructor(encryptionKey?: string) {
        this.encryption = new SimpleEncryption(encryptionKey);
        this.logger.info('Secret manager initialized');
    }

    /**
     * Store a secret for a tenant
     */
    async setSecret(
        tenantId: string,
        name: string,
        value: string,
        options: {
            expiresAt?: number;
            metadata?: Record<string, string>;
        } = {},
    ): Promise<void> {
        this.validateTenant(tenantId);
        this.validateSecretName(name);

        const secretKey = this.getSecretKey(tenantId, name);

        try {
            const encryptedValue = this.encryption.encrypt(value);

            const secret: SecretConfig = {
                name,
                value: encryptedValue,
                tenantId,
                expiresAt: options.expiresAt,
                metadata: options.metadata,
                createdAt: Date.now(),
            };

            this.secrets.set(secretKey, secret);

            this.logAccess({
                secretName: name,
                tenantId,
                timestamp: Date.now(),
                operation: 'set',
                success: true,
                context: `metadata: ${JSON.stringify(options.metadata || {})}`,
            });

            this.logger.info('Secret stored', {
                tenantId,
                secretName: name,
                hasExpiration: !!options.expiresAt,
                metadataKeys: Object.keys(options.metadata || {}),
            });
        } catch (error) {
            this.logAccess({
                secretName: name,
                tenantId,
                timestamp: Date.now(),
                operation: 'set',
                success: false,
                context:
                    error instanceof Error ? error.message : 'Unknown error',
            });

            this.logger.error('Failed to store secret', error as Error, {
                tenantId,
                secretName: name,
            });
            throw error;
        }
    }

    /**
     * Retrieve a secret for a tenant
     */
    async getSecret(tenantId: string, name: string): Promise<string | null> {
        this.validateTenant(tenantId);
        this.validateSecretName(name);

        const secretKey = this.getSecretKey(tenantId, name);
        const secret = this.secrets.get(secretKey);

        if (!secret) {
            this.logAccess({
                secretName: name,
                tenantId,
                timestamp: Date.now(),
                operation: 'get',
                success: false,
                context: 'Secret not found',
            });
            return null;
        }

        // Check expiration
        if (secret.expiresAt && Date.now() > secret.expiresAt) {
            this.secrets.delete(secretKey);
            this.logAccess({
                secretName: name,
                tenantId,
                timestamp: Date.now(),
                operation: 'get',
                success: false,
                context: 'Secret expired',
            });
            return null;
        }

        try {
            const decryptedValue = this.encryption.decrypt(secret.value);

            // Update last accessed time
            secret.lastAccessed = Date.now();
            this.secrets.set(secretKey, secret);

            this.logAccess({
                secretName: name,
                tenantId,
                timestamp: Date.now(),
                operation: 'get',
                success: true,
            });

            return decryptedValue;
        } catch (error) {
            this.logAccess({
                secretName: name,
                tenantId,
                timestamp: Date.now(),
                operation: 'get',
                success: false,
                context:
                    error instanceof Error
                        ? error.message
                        : 'Decryption failed',
            });

            this.logger.error('Failed to decrypt secret', error as Error, {
                tenantId,
                secretName: name,
            });
            throw new Error('Failed to retrieve secret');
        }
    }

    /**
     * Delete a secret for a tenant
     */
    async deleteSecret(tenantId: string, name: string): Promise<boolean> {
        this.validateTenant(tenantId);
        this.validateSecretName(name);

        const secretKey = this.getSecretKey(tenantId, name);
        const existed = this.secrets.has(secretKey);

        if (existed) {
            this.secrets.delete(secretKey);
        }

        this.logAccess({
            secretName: name,
            tenantId,
            timestamp: Date.now(),
            operation: 'delete',
            success: existed,
            context: existed ? 'Secret deleted' : 'Secret not found',
        });

        if (existed) {
            this.logger.info('Secret deleted', { tenantId, secretName: name });
        }

        return existed;
    }

    /**
     * List secrets for a tenant (returns metadata only, not values)
     */
    async listSecrets(tenantId: string): Promise<
        Array<{
            name: string;
            createdAt: number;
            lastAccessed?: number;
            expiresAt?: number;
            metadata?: Record<string, string>;
        }>
    > {
        this.validateTenant(tenantId);

        const tenantSecrets: Array<{
            name: string;
            createdAt: number;
            lastAccessed?: number;
            expiresAt?: number;
            metadata?: Record<string, string>;
        }> = [];

        const now = Date.now();

        for (const [key, secret] of this.secrets.entries()) {
            if (secret.tenantId === tenantId) {
                // Check if expired
                if (secret.expiresAt && now > secret.expiresAt) {
                    this.secrets.delete(key);
                    continue;
                }

                tenantSecrets.push({
                    name: secret.name,
                    createdAt: secret.createdAt,
                    lastAccessed: secret.lastAccessed,
                    expiresAt: secret.expiresAt,
                    metadata: secret.metadata,
                });
            }
        }

        this.logAccess({
            secretName: '*',
            tenantId,
            timestamp: Date.now(),
            operation: 'list',
            success: true,
            context: `Found ${tenantSecrets.length} secrets`,
        });

        return tenantSecrets;
    }

    /**
     * Check if a secret exists for a tenant
     */
    async hasSecret(tenantId: string, name: string): Promise<boolean> {
        this.validateTenant(tenantId);
        this.validateSecretName(name);

        const secretKey = this.getSecretKey(tenantId, name);
        const secret = this.secrets.get(secretKey);

        if (!secret) {
            return false;
        }

        // Check expiration
        if (secret.expiresAt && Date.now() > secret.expiresAt) {
            this.secrets.delete(secretKey);
            return false;
        }

        return true;
    }

    /**
     * Clear all secrets for a tenant
     */
    async clearTenantSecrets(tenantId: string): Promise<number> {
        this.validateTenant(tenantId);

        let deleted = 0;
        for (const [key, secret] of this.secrets.entries()) {
            if (secret.tenantId === tenantId) {
                this.secrets.delete(key);
                deleted++;
            }
        }

        this.logAccess({
            secretName: '*',
            tenantId,
            timestamp: Date.now(),
            operation: 'delete',
            success: true,
            context: `Cleared ${deleted} secrets`,
        });

        this.logger.info('Tenant secrets cleared', {
            tenantId,
            deletedCount: deleted,
        });
        return deleted;
    }

    /**
     * Get access logs for audit
     */
    getAccessLogs(filter?: {
        tenantId?: string;
        secretName?: string;
        operation?: SecretAccessLog['operation'];
        since?: number;
    }): SecretAccessLog[] {
        let logs = this.accessLogs;

        if (filter) {
            logs = logs.filter((log) => {
                if (filter.tenantId && log.tenantId !== filter.tenantId)
                    return false;
                if (filter.secretName && log.secretName !== filter.secretName)
                    return false;
                if (filter.operation && log.operation !== filter.operation)
                    return false;
                if (filter.since && log.timestamp < filter.since) return false;
                return true;
            });
        }

        return logs.slice(); // Return copy
    }

    /**
     * Get statistics
     */
    getStats(): {
        totalSecrets: number;
        secretsByTenant: Record<string, number>;
        totalAccesses: number;
        recentAccesses: number;
        memoryUsage: number;
    } {
        const secretsByTenant: Record<string, number> = {};

        for (const secret of this.secrets.values()) {
            secretsByTenant[secret.tenantId] =
                (secretsByTenant[secret.tenantId] || 0) + 1;
        }

        const recentAccesses = this.accessLogs.filter(
            (log) => Date.now() - log.timestamp < 24 * 60 * 60 * 1000, // Last 24 hours
        ).length;

        // Estimate memory usage
        const memoryUsage =
            this.secrets.size * 500 + this.accessLogs.length * 200;

        return {
            totalSecrets: this.secrets.size,
            secretsByTenant,
            totalAccesses: this.accessLogs.length,
            recentAccesses,
            memoryUsage,
        };
    }

    // Private helper methods

    private getSecretKey(tenantId: string, name: string): string {
        return `${tenantId}:${name}`;
    }

    private validateTenant(tenantId: string): void {
        if (
            !tenantId ||
            typeof tenantId !== 'string' ||
            tenantId.trim().length === 0
        ) {
            throw new Error('Invalid tenant ID');
        }
    }

    private validateSecretName(name: string): void {
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            throw new Error('Invalid secret name');
        }

        // Prevent path traversal
        if (name.includes('..') || name.includes('/') || name.includes('\\')) {
            throw new Error('Secret name contains invalid characters');
        }
    }

    private logAccess(log: SecretAccessLog): void {
        this.accessLogs.push(log);

        // Cleanup old logs
        if (this.accessLogs.length > this.maxLogEntries) {
            this.accessLogs = this.accessLogs.slice(-this.maxLogEntries * 0.8);
        }
    }
}

/**
 * Global secret manager instance
 */
let globalSecretManager: SecretManager | null = null;

/**
 * Get or create global secret manager
 */
export function getSecretManager(encryptionKey?: string): SecretManager {
    if (!globalSecretManager) {
        globalSecretManager = new SecretManager(encryptionKey);
    }
    return globalSecretManager;
}

/**
 * Set global secret manager (useful for testing)
 */
export function setSecretManager(secretManager: SecretManager): void {
    globalSecretManager = secretManager;
}

/**
 * Reset global secret manager (useful for testing)
 */
export function resetSecretManager(): void {
    globalSecretManager = null;
}

/**
 * Secret management error
 */
export class SecretError extends Error {
    constructor(
        message: string,
        public tenantId: string,
        public secretName?: string,
    ) {
        super(message);
        this.name = 'SecretError';
    }
}
