/**
 * @module security/tenant-validator
 * @description Rigorous tenant validation for production multi-tenancy
 */

import { createLogger } from '../observability/index.js';

/**
 * Tenant configuration
 */
export interface TenantConfig {
    /** Unique tenant identifier */
    tenantId: string;
    /** Tenant display name */
    name: string;
    /** Tenant status */
    status: 'active' | 'suspended' | 'inactive';
    /** Creation timestamp */
    createdAt: number;
    /** Last activity timestamp */
    lastActivity?: number;
    /** Tenant-specific configuration */
    config: Record<string, unknown>;
    /** Resource limits */
    limits: {
        maxExecutions?: number;
        maxMemoryMB?: number;
        maxStorageMB?: number;
        maxConcurrency?: number;
        rateLimit?: {
            requestsPerMinute: number;
            burstLimit?: number;
        };
    };
    /** Contact information */
    contact?: {
        email?: string;
        organization?: string;
    };
    /** Security settings */
    security?: {
        ipWhitelist?: string[];
        requireMFA?: boolean;
        sessionTimeoutMs?: number;
    };
}

/**
 * Tenant validation result
 */
export interface TenantValidationResult {
    /** Is the tenant valid */
    valid: boolean;
    /** Validation error message if invalid */
    error?: string;
    /** Error code for programmatic handling */
    errorCode?: string;
    /** Tenant configuration if valid */
    tenant?: TenantConfig;
    /** Additional validation context */
    context?: Record<string, unknown>;
}

/**
 * Tenant access log entry
 */
export interface TenantAccessLog {
    /** Tenant ID */
    tenantId: string;
    /** Operation attempted */
    operation: string;
    /** Timestamp */
    timestamp: number;
    /** Success status */
    success: boolean;
    /** Error code if failed */
    errorCode?: string;
    /** IP address (if available) */
    ipAddress?: string;
    /** User agent (if available) */
    userAgent?: string;
    /** Additional context */
    context?: Record<string, unknown>;
}

/**
 * Production-ready tenant validator
 */
export class TenantValidator {
    private tenants = new Map<string, TenantConfig>();
    private accessLogs: TenantAccessLog[] = [];
    private logger = createLogger('tenant-validator');
    private maxLogEntries = 10000;

    constructor() {
        this.logger.info('Tenant validator initialized');
    }

    /**
     * Register a tenant
     */
    async registerTenant(
        tenant: Omit<TenantConfig, 'createdAt' | 'lastActivity'>,
    ): Promise<void> {
        this.validateTenantId(tenant.tenantId);

        if (this.tenants.has(tenant.tenantId)) {
            throw new Error(`Tenant ${tenant.tenantId} already exists`);
        }

        const fullTenant: TenantConfig = {
            ...tenant,
            createdAt: Date.now(),
            lastActivity: Date.now(),
        };

        this.tenants.set(tenant.tenantId, fullTenant);

        this.logger.info('Tenant registered', {
            tenantId: tenant.tenantId,
            name: tenant.name,
            status: tenant.status,
        });

        this.logAccess({
            tenantId: tenant.tenantId,
            operation: 'register',
            timestamp: Date.now(),
            success: true,
        });
    }

    /**
     * Update tenant configuration
     */
    async updateTenant(
        tenantId: string,
        updates: Partial<Omit<TenantConfig, 'tenantId' | 'createdAt'>>,
    ): Promise<void> {
        const tenant = this.tenants.get(tenantId);
        if (!tenant) {
            throw new Error(`Tenant ${tenantId} not found`);
        }

        const updatedTenant: TenantConfig = {
            ...tenant,
            ...updates,
            tenantId, // Ensure tenantId cannot be changed
            createdAt: tenant.createdAt, // Preserve creation time
            lastActivity: Date.now(),
        };

        this.tenants.set(tenantId, updatedTenant);

        this.logger.info('Tenant updated', {
            tenantId,
            updates: Object.keys(updates),
        });

        this.logAccess({
            tenantId,
            operation: 'update',
            timestamp: Date.now(),
            success: true,
            context: { updatedFields: Object.keys(updates) },
        });
    }

    /**
     * Validate tenant for operation
     */
    async validateTenant(
        tenantId: string,
        operation: string,
        context?: {
            ipAddress?: string;
            userAgent?: string;
            additionalContext?: Record<string, unknown>;
        },
    ): Promise<TenantValidationResult> {
        const timestamp = Date.now();

        try {
            // Basic tenant ID validation
            this.validateTenantId(tenantId);

            // Get tenant configuration
            const tenant = this.tenants.get(tenantId);
            if (!tenant) {
                const result: TenantValidationResult = {
                    valid: false,
                    error: `Tenant ${tenantId} not found`,
                    errorCode: 'TENANT_NOT_FOUND',
                };

                this.logAccess({
                    tenantId,
                    operation,
                    timestamp,
                    success: false,
                    errorCode: 'TENANT_NOT_FOUND',
                    ipAddress: context?.ipAddress,
                    userAgent: context?.userAgent,
                    context: context?.additionalContext,
                });

                return result;
            }

            // Check tenant status
            if (tenant.status !== 'active') {
                const result: TenantValidationResult = {
                    valid: false,
                    error: `Tenant ${tenantId} is ${tenant.status}`,
                    errorCode: `TENANT_${tenant.status.toUpperCase()}`,
                };

                this.logAccess({
                    tenantId,
                    operation,
                    timestamp,
                    success: false,
                    errorCode: result.errorCode,
                    ipAddress: context?.ipAddress,
                    userAgent: context?.userAgent,
                    context: context?.additionalContext,
                });

                return result;
            }

            // Check IP whitelist if configured
            if (tenant.security?.ipWhitelist && context?.ipAddress) {
                if (!tenant.security.ipWhitelist.includes(context.ipAddress)) {
                    const result: TenantValidationResult = {
                        valid: false,
                        error: `IP address ${context.ipAddress} not whitelisted for tenant ${tenantId}`,
                        errorCode: 'IP_NOT_WHITELISTED',
                    };

                    this.logAccess({
                        tenantId,
                        operation,
                        timestamp,
                        success: false,
                        errorCode: 'IP_NOT_WHITELISTED',
                        ipAddress: context.ipAddress,
                        userAgent: context?.userAgent,
                        context: context?.additionalContext,
                    });

                    return result;
                }
            }

            // Update last activity
            tenant.lastActivity = timestamp;
            this.tenants.set(tenantId, tenant);

            // Log successful validation
            this.logAccess({
                tenantId,
                operation,
                timestamp,
                success: true,
                ipAddress: context?.ipAddress,
                userAgent: context?.userAgent,
                context: context?.additionalContext,
            });

            return {
                valid: true,
                tenant,
                context: {
                    lastActivity: tenant.lastActivity,
                    limits: tenant.limits,
                },
            };
        } catch (error) {
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : 'Unknown validation error';

            const result: TenantValidationResult = {
                valid: false,
                error: errorMessage,
                errorCode: 'VALIDATION_ERROR',
            };

            this.logAccess({
                tenantId,
                operation,
                timestamp,
                success: false,
                errorCode: 'VALIDATION_ERROR',
                ipAddress: context?.ipAddress,
                userAgent: context?.userAgent,
                context: { error: errorMessage, ...context?.additionalContext },
            });

            this.logger.error('Tenant validation error', error as Error, {
                tenantId,
                operation,
            });

            return result;
        }
    }

    /**
     * Get tenant configuration
     */
    async getTenant(tenantId: string): Promise<TenantConfig | null> {
        this.validateTenantId(tenantId);
        return this.tenants.get(tenantId) || null;
    }

    /**
     * List all tenants
     */
    async listTenants(filter?: {
        status?: TenantConfig['status'];
        activeSince?: number;
    }): Promise<TenantConfig[]> {
        let tenants = Array.from(this.tenants.values());

        if (filter) {
            tenants = tenants.filter((tenant) => {
                if (filter.status && tenant.status !== filter.status)
                    return false;
                if (
                    filter.activeSince &&
                    (!tenant.lastActivity ||
                        tenant.lastActivity < filter.activeSince)
                )
                    return false;
                return true;
            });
        }

        return tenants;
    }

    /**
     * Suspend a tenant
     */
    async suspendTenant(tenantId: string, reason: string): Promise<void> {
        const tenant = this.tenants.get(tenantId);
        if (!tenant) {
            throw new Error(`Tenant ${tenantId} not found`);
        }

        tenant.status = 'suspended';
        tenant.lastActivity = Date.now();
        this.tenants.set(tenantId, tenant);

        this.logger.warn('Tenant suspended', { tenantId, reason });

        this.logAccess({
            tenantId,
            operation: 'suspend',
            timestamp: Date.now(),
            success: true,
            context: { reason },
        });
    }

    /**
     * Reactivate a tenant
     */
    async reactivateTenant(tenantId: string): Promise<void> {
        const tenant = this.tenants.get(tenantId);
        if (!tenant) {
            throw new Error(`Tenant ${tenantId} not found`);
        }

        tenant.status = 'active';
        tenant.lastActivity = Date.now();
        this.tenants.set(tenantId, tenant);

        this.logger.info('Tenant reactivated', { tenantId });

        this.logAccess({
            tenantId,
            operation: 'reactivate',
            timestamp: Date.now(),
            success: true,
        });
    }

    /**
     * Delete a tenant
     */
    async deleteTenant(tenantId: string): Promise<void> {
        const existed = this.tenants.delete(tenantId);

        if (!existed) {
            throw new Error(`Tenant ${tenantId} not found`);
        }

        this.logger.info('Tenant deleted', { tenantId });

        this.logAccess({
            tenantId,
            operation: 'delete',
            timestamp: Date.now(),
            success: true,
        });
    }

    /**
     * Get access logs for audit
     */
    getAccessLogs(filter?: {
        tenantId?: string;
        operation?: string;
        success?: boolean;
        since?: number;
    }): TenantAccessLog[] {
        let logs = this.accessLogs;

        if (filter) {
            logs = logs.filter((log) => {
                if (filter.tenantId && log.tenantId !== filter.tenantId)
                    return false;
                if (filter.operation && log.operation !== filter.operation)
                    return false;
                if (
                    filter.success !== undefined &&
                    log.success !== filter.success
                )
                    return false;
                if (filter.since && log.timestamp < filter.since) return false;
                return true;
            });
        }

        return logs.slice(); // Return copy
    }

    /**
     * Get validation statistics
     */
    getStats(): {
        totalTenants: number;
        activeTenants: number;
        suspendedTenants: number;
        inactiveTenants: number;
        totalValidations: number;
        recentFailures: number;
        memoryUsage: number;
    } {
        const tenants = Array.from(this.tenants.values());
        const activeTenants = tenants.filter(
            (t) => t.status === 'active',
        ).length;
        const suspendedTenants = tenants.filter(
            (t) => t.status === 'suspended',
        ).length;
        const inactiveTenants = tenants.filter(
            (t) => t.status === 'inactive',
        ).length;

        const recentFailures = this.accessLogs.filter(
            (log) =>
                !log.success &&
                Date.now() - log.timestamp < 24 * 60 * 60 * 1000, // Last 24 hours
        ).length;

        // Estimate memory usage
        const memoryUsage =
            this.tenants.size * 1000 + this.accessLogs.length * 300;

        return {
            totalTenants: this.tenants.size,
            activeTenants,
            suspendedTenants,
            inactiveTenants,
            totalValidations: this.accessLogs.length,
            recentFailures,
            memoryUsage,
        };
    }

    // Private helper methods

    private validateTenantId(tenantId: string): void {
        if (!tenantId || typeof tenantId !== 'string') {
            throw new Error('Tenant ID must be a non-empty string');
        }

        if (tenantId.length < 3 || tenantId.length > 64) {
            throw new Error('Tenant ID must be between 3 and 64 characters');
        }

        // Alphanumeric, hyphens, and underscores only
        if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
            throw new Error('Tenant ID contains invalid characters');
        }

        // Cannot start or end with hyphen or underscore
        if (/^[-_]|[-_]$/.test(tenantId)) {
            throw new Error(
                'Tenant ID cannot start or end with hyphen or underscore',
            );
        }
    }

    private logAccess(log: TenantAccessLog): void {
        this.accessLogs.push(log);

        // Cleanup old logs
        if (this.accessLogs.length > this.maxLogEntries) {
            this.accessLogs = this.accessLogs.slice(-this.maxLogEntries * 0.8);
        }
    }
}

/**
 * Global tenant validator instance
 */
let globalTenantValidator: TenantValidator | null = null;

/**
 * Get or create global tenant validator
 */
export function getTenantValidator(): TenantValidator {
    if (!globalTenantValidator) {
        globalTenantValidator = new TenantValidator();
    }
    return globalTenantValidator;
}

/**
 * Set global tenant validator (useful for testing)
 */
export function setTenantValidator(validator: TenantValidator): void {
    globalTenantValidator = validator;
}

/**
 * Reset global tenant validator (useful for testing)
 */
export function resetTenantValidator(): void {
    globalTenantValidator = null;
}

/**
 * Tenant validation error
 */
export class TenantValidationError extends Error {
    constructor(
        message: string,
        public tenantId: string,
        public errorCode: string,
        public operation: string,
    ) {
        super(message);
        this.name = 'TenantValidationError';
    }
}
