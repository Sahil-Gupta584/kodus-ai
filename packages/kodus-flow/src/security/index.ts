/**
 * @module security
 * @description Unified security manager for production multi-tenancy
 */

export * from './rate-limiter.js';
export * from './secret-manager.js';
export * from './context-redactor.js';
export * from './tenant-validator.js';

import { createLogger } from '../observability/index.js';
import {
    RateLimiter,
    getRateLimiter,
    resetRateLimiter,
    type RateLimitConfig,
} from './rate-limiter.js';
import {
    SecretManager,
    getSecretManager,
    resetSecretManager,
} from './secret-manager.js';
import {
    ContextRedactor,
    getContextRedactor,
    resetContextRedactor,
    type RedactionConfig,
} from './context-redactor.js';
import {
    TenantValidator,
    getTenantValidator,
    resetTenantValidator,
    type TenantConfig,
} from './tenant-validator.js';

/**
 * Unified security configuration
 */
export interface SecurityConfig {
    /** Rate limiting configuration */
    rateLimiting?: {
        enabled: boolean;
        defaultLimits?: RateLimitConfig;
    };
    /** Secret management configuration */
    secretManagement?: {
        enabled: boolean;
        encryptionKey?: string;
    };
    /** Context redaction configuration */
    contextRedaction?: {
        enabled: boolean;
        config?: Partial<RedactionConfig>;
    };
    /** Tenant validation configuration */
    tenantValidation?: {
        enabled: boolean;
        strictMode?: boolean;
    };
}

/**
 * Security check result
 */
export interface SecurityCheckResult {
    /** Is the operation allowed */
    allowed: boolean;
    /** Security violations found */
    violations: Array<{
        type: 'rate_limit' | 'tenant_invalid' | 'security_policy';
        message: string;
        code: string;
    }>;
    /** Tenant information if valid */
    tenant?: TenantConfig;
    /** Rate limit status */
    rateLimit?: {
        remaining: number;
        resetTime: number;
    };
}

/**
 * Unified security manager for production
 */
export class SecurityManager {
    private rateLimiter: RateLimiter;
    private secretManager: SecretManager;
    private contextRedactor: ContextRedactor;
    private tenantValidator: TenantValidator;
    private config: SecurityConfig;
    private logger = createLogger('security-manager');

    constructor(config: SecurityConfig = {}) {
        this.config = {
            rateLimiting: { enabled: true, ...config.rateLimiting },
            secretManagement: { enabled: true, ...config.secretManagement },
            contextRedaction: { enabled: true, ...config.contextRedaction },
            tenantValidation: {
                enabled: true,
                strictMode: true,
                ...config.tenantValidation,
            },
        };

        // Initialize components
        this.rateLimiter = getRateLimiter();
        this.secretManager = getSecretManager(
            this.config.secretManagement?.encryptionKey,
        );
        this.contextRedactor = getContextRedactor(
            this.config.contextRedaction?.config,
        );
        this.tenantValidator = getTenantValidator();

        this.logger.info('Security manager initialized', {
            rateLimitingEnabled: this.config.rateLimiting?.enabled,
            secretManagementEnabled: this.config.secretManagement?.enabled,
            contextRedactionEnabled: this.config.contextRedaction?.enabled,
            tenantValidationEnabled: this.config.tenantValidation?.enabled,
            strictMode: this.config.tenantValidation?.strictMode,
        });
    }

    /**
     * Perform comprehensive security check for an operation
     */
    async checkSecurity(
        tenantId: string,
        operation: string,
        context?: {
            ipAddress?: string;
            userAgent?: string;
            rateLimitConfig?: RateLimitConfig;
            additionalContext?: Record<string, unknown>;
        },
    ): Promise<SecurityCheckResult> {
        const violations: SecurityCheckResult['violations'] = [];
        let tenant: TenantConfig | undefined;
        let rateLimit: SecurityCheckResult['rateLimit'] | undefined;

        try {
            // 1. Tenant validation
            if (this.config.tenantValidation?.enabled) {
                const tenantResult = await this.tenantValidator.validateTenant(
                    tenantId,
                    operation,
                    {
                        ipAddress: context?.ipAddress,
                        userAgent: context?.userAgent,
                        additionalContext: context?.additionalContext,
                    },
                );

                if (!tenantResult.valid) {
                    violations.push({
                        type: 'tenant_invalid',
                        message:
                            tenantResult.error || 'Tenant validation failed',
                        code: tenantResult.errorCode || 'TENANT_INVALID',
                    });

                    // In strict mode, fail immediately on tenant validation
                    if (this.config.tenantValidation?.strictMode) {
                        return {
                            allowed: false,
                            violations,
                        };
                    }
                } else {
                    tenant = tenantResult.tenant;
                }
            }

            // 2. Rate limiting check
            if (this.config.rateLimiting?.enabled) {
                let rateLimitConfig = context?.rateLimitConfig;

                // Use tenant-specific rate limits if available
                if (tenant?.limits?.rateLimit && !rateLimitConfig) {
                    rateLimitConfig = tenant.limits.rateLimit;
                }

                // Fallback to default limits
                if (
                    !rateLimitConfig &&
                    this.config.rateLimiting?.defaultLimits
                ) {
                    rateLimitConfig = this.config.rateLimiting.defaultLimits;
                }

                if (rateLimitConfig) {
                    const rateLimitStatus = await this.rateLimiter.checkLimit(
                        tenantId,
                        rateLimitConfig,
                        operation,
                    );

                    rateLimit = {
                        remaining: rateLimitStatus.remaining,
                        resetTime: rateLimitStatus.resetTime,
                    };

                    if (!rateLimitStatus.allowed) {
                        violations.push({
                            type: 'rate_limit',
                            message: `Rate limit exceeded: ${rateLimitStatus.current}/${rateLimitStatus.limit}`,
                            code: 'RATE_LIMIT_EXCEEDED',
                        });
                    }
                }
            }

            // 3. Additional security policy checks could go here
            // For example: operation-specific policies, time-based restrictions, etc.

            const allowed = violations.length === 0;

            this.logger.debug('Security check completed', {
                tenantId,
                operation,
                allowed,
                violationCount: violations.length,
                violationTypes: violations.map((v) => v.type),
            });

            return {
                allowed,
                violations,
                tenant,
                rateLimit,
            };
        } catch (error) {
            this.logger.error('Security check failed', error as Error, {
                tenantId,
                operation,
            });

            return {
                allowed: false,
                violations: [
                    {
                        type: 'security_policy',
                        message: 'Security check failed',
                        code: 'SECURITY_CHECK_ERROR',
                    },
                ],
            };
        }
    }

    /**
     * Secure context data before snapshot
     */
    async secureContext(
        context: Record<string, unknown>,
        tenantId: string,
    ): Promise<Record<string, unknown>> {
        if (!this.config.contextRedaction?.enabled) {
            return context;
        }

        try {
            const redacted = this.contextRedactor.redactContext(context);

            this.logger.debug('Context secured for snapshot', {
                tenantId,
                originalFields: Object.keys(context).length,
                redactedFields: Object.keys(redacted).length,
            });

            return redacted;
        } catch (error) {
            this.logger.error('Failed to secure context', error as Error, {
                tenantId,
            });
            // Return empty object on failure for security
            return {};
        }
    }

    /**
     * Secure event data
     */
    async secureEvent(
        event: Record<string, unknown>,
        tenantId: string,
    ): Promise<Record<string, unknown>> {
        if (!this.config.contextRedaction?.enabled) {
            return event;
        }

        try {
            return this.contextRedactor.redactEvent(event);
        } catch (error) {
            this.logger.error('Failed to secure event', error as Error, {
                tenantId,
            });
            return {
                type: 'security_error',
                ts: Date.now(),
                data: '[REDACTION_ERROR]',
            };
        }
    }

    /**
     * Get tenant-specific secret
     */
    async getSecret(
        tenantId: string,
        secretName: string,
    ): Promise<string | null> {
        if (!this.config.secretManagement?.enabled) {
            throw new Error('Secret management is disabled');
        }

        return await this.secretManager.getSecret(tenantId, secretName);
    }

    /**
     * Set tenant-specific secret
     */
    async setSecret(
        tenantId: string,
        secretName: string,
        secretValue: string,
        options?: {
            expiresAt?: number;
            metadata?: Record<string, string>;
        },
    ): Promise<void> {
        if (!this.config.secretManagement?.enabled) {
            throw new Error('Secret management is disabled');
        }

        await this.secretManager.setSecret(
            tenantId,
            secretName,
            secretValue,
            options,
        );
    }

    /**
     * Register a new tenant
     */
    async registerTenant(
        tenant: Omit<TenantConfig, 'createdAt' | 'lastActivity'>,
    ): Promise<void> {
        if (!this.config.tenantValidation?.enabled) {
            throw new Error('Tenant validation is disabled');
        }

        await this.tenantValidator.registerTenant(tenant);
    }

    /**
     * Get security statistics
     */
    getSecurityStats(): {
        rateLimiter: ReturnType<RateLimiter['getStats']>;
        secretManager: ReturnType<SecretManager['getStats']>;
        tenantValidator: ReturnType<TenantValidator['getStats']>;
        totalMemoryUsage: number;
    } {
        const rateLimiterStats = this.rateLimiter.getStats();
        const secretManagerStats = this.secretManager.getStats();
        const tenantValidatorStats = this.tenantValidator.getStats();

        return {
            rateLimiter: rateLimiterStats,
            secretManager: secretManagerStats,
            tenantValidator: tenantValidatorStats,
            totalMemoryUsage:
                rateLimiterStats.memoryUsage +
                secretManagerStats.memoryUsage +
                tenantValidatorStats.memoryUsage,
        };
    }

    /**
     * Shutdown security manager
     */
    async shutdown(): Promise<void> {
        this.rateLimiter.shutdown();
        this.logger.info('Security manager shutdown');
    }
}

/**
 * Global security manager instance
 */
let globalSecurityManager: SecurityManager | null = null;

/**
 * Get or create global security manager
 */
export function getSecurityManager(config?: SecurityConfig): SecurityManager {
    if (!globalSecurityManager) {
        globalSecurityManager = new SecurityManager(config);
    }
    return globalSecurityManager;
}

/**
 * Set global security manager (useful for testing)
 */
export function setSecurityManager(manager: SecurityManager): void {
    globalSecurityManager = manager;
}

/**
 * Reset all global security components (useful for testing)
 */
export async function resetSecurityComponents(): Promise<void> {
    // Reset all individual components
    resetRateLimiter();
    resetSecretManager();
    resetContextRedactor();
    resetTenantValidator();

    // Reset security manager
    globalSecurityManager = null;
}

/**
 * Security violation error
 */
export class SecurityViolationError extends Error {
    constructor(
        message: string,
        public tenantId: string,
        public operation: string,
        public violations: SecurityCheckResult['violations'],
    ) {
        super(message);
        this.name = 'SecurityViolationError';
    }
}
