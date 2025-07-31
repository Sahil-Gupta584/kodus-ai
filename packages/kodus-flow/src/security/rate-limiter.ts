/**
 * @module security/rate-limiter
 * @description Production-ready rate limiting for multi-tenant environments
 */

import { createLogger } from '../observability/index.js';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
    /** Requests per minute */
    requestsPerMinute: number;
    /** Burst allowance */
    burstLimit?: number;
    /** Window size in milliseconds */
    windowMs?: number;
}

/**
 * Rate limit status
 */
export interface RateLimitStatus {
    /** Is the request allowed */
    allowed: boolean;
    /** Current count in window */
    current: number;
    /** Maximum allowed in window */
    limit: number;
    /** Time until window resets (ms) */
    resetTime: number;
    /** Remaining requests in window */
    remaining: number;
}

/**
 * Rate limit bucket for tracking requests
 */
interface RateLimitBucket {
    /** Request timestamps in current window */
    requests: number[];
    /** Window start time */
    windowStart: number;
    /** Burst tokens available */
    burstTokens: number;
    /** Last reset time */
    lastReset: number;
}

/**
 * Production-ready rate limiter with tenant isolation
 */
export class RateLimiter {
    private buckets = new Map<string, RateLimitBucket>();
    private logger = createLogger('rate-limiter');
    private cleanupTimer?: NodeJS.Timeout;

    constructor() {
        // Cleanup old buckets every 5 minutes
        this.cleanupTimer = setInterval(
            () => {
                this.cleanup();
            },
            5 * 60 * 1000,
        );
    }

    /**
     * Check if request is allowed for tenant
     */
    async checkLimit(
        tenantId: string,
        config: RateLimitConfig,
        operation: string = 'request',
    ): Promise<RateLimitStatus> {
        const now = Date.now();
        const windowMs = config.windowMs || 60000; // Default 1 minute
        const burstLimit =
            config.burstLimit || Math.ceil(config.requestsPerMinute * 0.1);

        // Get or create bucket for tenant
        let bucket = this.buckets.get(tenantId);
        if (!bucket) {
            bucket = {
                requests: [],
                windowStart: now,
                burstTokens: burstLimit,
                lastReset: now,
            };
            this.buckets.set(tenantId, bucket);
        }

        // Reset window if needed
        if (now - bucket.windowStart >= windowMs) {
            bucket.requests = [];
            bucket.windowStart = now;
            bucket.burstTokens = Math.min(burstLimit, bucket.burstTokens + 1);
        }

        // Clean old requests from current window
        const cutoff = now - windowMs;
        bucket.requests = bucket.requests.filter((time) => time > cutoff);

        // Check burst allowance first
        const currentCount = bucket.requests.length;
        let allowed = false;

        if (bucket.burstTokens > 0) {
            // Use burst token
            allowed = true;
            bucket.burstTokens--;
        } else if (currentCount < config.requestsPerMinute) {
            // Within normal limit
            allowed = true;
        }

        // Record request if allowed
        if (allowed) {
            bucket.requests.push(now);
        }

        const resetTime = bucket.windowStart + windowMs - now;
        const remaining = Math.max(
            0,
            config.requestsPerMinute - currentCount - (allowed ? 1 : 0),
        );

        const status: RateLimitStatus = {
            allowed,
            current: currentCount + (allowed ? 1 : 0),
            limit: config.requestsPerMinute,
            resetTime,
            remaining,
        };

        // Log rate limit violations
        if (!allowed) {
            this.logger.warn('Rate limit exceeded', {
                tenantId,
                operation,
                current: currentCount,
                limit: config.requestsPerMinute,
                burstTokens: bucket.burstTokens,
            });
        }

        return status;
    }

    /**
     * Consume a rate limit token (when request is actually processed)
     */
    async consumeToken(
        tenantId: string,
        config: RateLimitConfig,
        operation: string = 'request',
    ): Promise<boolean> {
        const status = await this.checkLimit(tenantId, config, operation);

        if (!status.allowed) {
            this.logger.warn('Rate limit token consumption denied', {
                tenantId,
                operation,
                status,
            });
        }

        return status.allowed;
    }

    /**
     * Get current rate limit status for tenant
     */
    async getStatus(
        tenantId: string,
        config: RateLimitConfig,
    ): Promise<RateLimitStatus> {
        const now = Date.now();
        const windowMs = config.windowMs || 60000;

        const bucket = this.buckets.get(tenantId);
        if (!bucket) {
            return {
                allowed: true,
                current: 0,
                limit: config.requestsPerMinute,
                resetTime: windowMs,
                remaining: config.requestsPerMinute,
            };
        }

        // Clean old requests
        const cutoff = now - windowMs;
        bucket.requests = bucket.requests.filter((time) => time > cutoff);

        const currentCount = bucket.requests.length;
        const resetTime = bucket.windowStart + windowMs - now;
        const remaining = Math.max(0, config.requestsPerMinute - currentCount);

        return {
            allowed:
                currentCount < config.requestsPerMinute ||
                bucket.burstTokens > 0,
            current: currentCount,
            limit: config.requestsPerMinute,
            resetTime,
            remaining,
        };
    }

    /**
     * Reset rate limits for a tenant
     */
    async resetTenant(tenantId: string): Promise<void> {
        this.buckets.delete(tenantId);
        this.logger.info('Rate limit reset for tenant', { tenantId });
    }

    /**
     * Get rate limiting statistics
     */
    getStats(): {
        activeTenants: number;
        totalBuckets: number;
        memoryUsage: number;
    } {
        const activeTenants = this.buckets.size;
        let totalRequests = 0;

        for (const bucket of this.buckets.values()) {
            totalRequests += bucket.requests.length;
        }

        // Estimate memory usage
        const memoryUsage = activeTenants * 200 + totalRequests * 8; // rough estimate

        return {
            activeTenants,
            totalBuckets: this.buckets.size,
            memoryUsage,
        };
    }

    /**
     * Cleanup old buckets
     */
    private cleanup(): void {
        const now = Date.now();
        const maxAge = 10 * 60 * 1000; // 10 minutes

        let cleaned = 0;
        for (const [tenantId, bucket] of this.buckets.entries()) {
            if (
                now - bucket.lastReset > maxAge &&
                bucket.requests.length === 0
            ) {
                this.buckets.delete(tenantId);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.logger.debug('Rate limiter cleanup completed', {
                bucketsRemoved: cleaned,
                activeBuckets: this.buckets.size,
            });
        }
    }

    /**
     * Shutdown rate limiter
     */
    shutdown(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
        this.buckets.clear();
        this.logger.info('Rate limiter shutdown');
    }
}

/**
 * Global rate limiter instance
 */
let globalRateLimiter: RateLimiter | null = null;

/**
 * Get or create global rate limiter
 */
export function getRateLimiter(): RateLimiter {
    if (!globalRateLimiter) {
        globalRateLimiter = new RateLimiter();
    }
    return globalRateLimiter;
}

/**
 * Set global rate limiter (useful for testing)
 */
export function setRateLimiter(rateLimiter: RateLimiter): void {
    globalRateLimiter = rateLimiter;
}

/**
 * Reset global rate limiter (useful for testing)
 */
export function resetRateLimiter(): void {
    if (globalRateLimiter) {
        globalRateLimiter.shutdown();
        globalRateLimiter = null;
    }
}

/**
 * Middleware factory for rate limiting
 */
export function createRateLimitMiddleware(
    getRateConfig: (tenantId: string) => RateLimitConfig | null,
) {
    const rateLimiter = getRateLimiter();

    return async function rateLimitMiddleware(
        tenantId: string,
        operation: string,
    ): Promise<void> {
        const config = getRateConfig(tenantId);
        if (!config) {
            return; // No rate limiting configured
        }

        const allowed = await rateLimiter.consumeToken(
            tenantId,
            config,
            operation,
        );
        if (!allowed) {
            throw new Error(
                `Rate limit exceeded for tenant ${tenantId} on operation ${operation}`,
            );
        }
    };
}

/**
 * Rate limiting error class
 */
export class RateLimitError extends Error {
    constructor(
        public tenantId: string,
        public operation: string,
        public status: RateLimitStatus,
    ) {
        super(
            `Rate limit exceeded for tenant ${tenantId}: ${status.current}/${status.limit} requests`,
        );
        this.name = 'RateLimitError';
    }
}
