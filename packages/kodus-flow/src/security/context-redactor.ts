/**
 * @module security/context-redactor
 * @description Context redaction for secure snapshot storage in production
 */

import { createLogger } from '../observability/index.js';

/**
 * Redaction configuration
 */
export interface RedactionConfig {
    /** Sensitive field patterns to redact */
    sensitiveFields: string[];
    /** Regex patterns for sensitive data */
    sensitivePatterns: RegExp[];
    /** Custom redaction function */
    customRedactor?: (key: string, value: unknown) => unknown;
    /** Whether to redact deeply nested objects */
    deepRedaction: boolean;
    /** Redaction placeholder */
    placeholder: string;
}

/**
 * Default redaction configuration for production
 */
export const DEFAULT_REDACTION_CONFIG: RedactionConfig = {
    sensitiveFields: [
        // Common sensitive field names
        'password',
        'pwd',
        'secret',
        'token',
        'key',
        'apikey',
        'api_key',
        'accesstoken',
        'access_token',
        'refreshtoken',
        'refresh_token',
        'authorization',
        'auth',
        'bearer',
        'jwt',
        'sessionid',
        'session_id',
        'cookie',
        'cookies',

        // Personal information
        'email',
        'phone',
        'ssn',
        'social_security',
        'credit_card',
        'creditcard',
        'card_number',
        'cvv',
        'pin',

        // Internal data
        'database_url',
        'db_url',
        'connection_string',
        'private_key',
        'privatekey',
        'client_secret',
        'webhook_secret',
    ],
    sensitivePatterns: [
        // Email pattern
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        // Phone pattern
        /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
        // Credit card pattern
        /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
        // Social Security Number
        /\b\d{3}-\d{2}-\d{4}\b/g,
        // API keys (common patterns)
        /\b[A-Za-z0-9]{32,}\b/g,
        // JWT tokens
        /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\b/g,
        // Bearer tokens
        /Bearer\s+[A-Za-z0-9_-]+/gi,
    ],
    deepRedaction: true,
    placeholder: '[REDACTED]',
};

/**
 * Context redactor for secure data handling
 */
export class ContextRedactor {
    private config: RedactionConfig;
    private logger = createLogger('context-redactor');

    constructor(config: Partial<RedactionConfig> = {}) {
        this.config = {
            ...DEFAULT_REDACTION_CONFIG,
            ...config,
            // Merge arrays properly
            sensitiveFields: [
                ...DEFAULT_REDACTION_CONFIG.sensitiveFields,
                ...(config.sensitiveFields || []),
            ],
            sensitivePatterns: [
                ...DEFAULT_REDACTION_CONFIG.sensitivePatterns,
                ...(config.sensitivePatterns || []),
            ],
        };

        this.logger.info('Context redactor initialized', {
            sensitiveFieldCount: this.config.sensitiveFields.length,
            sensitivePatternCount: this.config.sensitivePatterns.length,
            deepRedaction: this.config.deepRedaction,
        });
    }

    /**
     * Redact sensitive data from context before snapshot
     */
    redactContext(context: Record<string, unknown>): Record<string, unknown> {
        try {
            const redacted = this.deepCloneAndRedact(context) as Record<
                string,
                unknown
            >;

            this.logger.debug('Context redacted for snapshot', {
                originalKeys: Object.keys(context).length,
                redactedKeys: Object.keys(redacted).length,
            });

            return redacted;
        } catch (error) {
            this.logger.error('Failed to redact context', error as Error);
            // Return empty object on redaction failure for security
            return {};
        }
    }

    /**
     * Redact sensitive data from an event
     */
    redactEvent(event: Record<string, unknown>): Record<string, unknown> {
        try {
            const redacted = this.deepCloneAndRedact(event) as Record<
                string,
                unknown
            >;

            this.logger.debug('Event redacted', {
                eventType: event.type as string,
                hasData: !!event.data,
            });

            return redacted;
        } catch (error) {
            this.logger.error('Failed to redact event', error as Error);
            // Return minimal event structure on failure
            return {
                type: typeof event.type === 'string' ? event.type : 'unknown',
                ts: typeof event.ts === 'number' ? event.ts : Date.now(),
                data: '[REDACTION_ERROR]',
            };
        }
    }

    /**
     * Check if a field name is sensitive
     */
    isSensitiveField(fieldName: string): boolean {
        const lowerFieldName = fieldName.toLowerCase();
        return this.config.sensitiveFields.some((pattern) =>
            lowerFieldName.includes(pattern.toLowerCase()),
        );
    }

    /**
     * Check if a value contains sensitive patterns
     */
    containsSensitivePattern(value: string): boolean {
        return this.config.sensitivePatterns.some((pattern) =>
            pattern.test(value),
        );
    }

    /**
     * Redact a specific value
     */
    redactValue(key: string, value: unknown): unknown {
        // Use custom redactor if provided
        if (this.config.customRedactor) {
            try {
                return this.config.customRedactor(key, value);
            } catch (error) {
                this.logger.warn('Custom redactor failed', { key, error });
                // Fall through to default redaction
            }
        }

        // Check if field name is sensitive
        if (this.isSensitiveField(key)) {
            return this.config.placeholder;
        }

        // Check string values for sensitive patterns
        if (typeof value === 'string') {
            if (this.containsSensitivePattern(value)) {
                return this.config.placeholder;
            }

            // Redact patterns within strings
            let redactedString = value;
            for (const pattern of this.config.sensitivePatterns) {
                redactedString = redactedString.replace(
                    pattern,
                    this.config.placeholder,
                );
            }

            return redactedString !== value ? redactedString : value;
        }

        return value;
    }

    /**
     * Deep clone and redact an object
     */
    private deepCloneAndRedact(obj: unknown): unknown {
        // Handle null/undefined
        if (obj === null || obj === undefined) {
            return obj;
        }

        // Handle primitives
        if (typeof obj !== 'object') {
            return obj;
        }

        // Handle arrays
        if (Array.isArray(obj)) {
            return obj.map((item) => this.deepCloneAndRedact(item));
        }

        // Handle Date objects
        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }

        // Handle regular objects
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(
            obj as Record<string, unknown>,
        )) {
            // First redact the value based on key name and patterns
            const redactedValue = this.redactValue(key, value);

            // Then recursively process if deep redaction is enabled
            if (
                this.config.deepRedaction &&
                typeof redactedValue === 'object' &&
                redactedValue !== null
            ) {
                result[key] = this.deepCloneAndRedact(redactedValue);
            } else {
                result[key] = redactedValue;
            }
        }

        return result;
    }

    /**
     * Update redaction configuration
     */
    updateConfig(newConfig: Partial<RedactionConfig>): void {
        this.config = {
            ...this.config,
            ...newConfig,
            // Merge arrays properly
            sensitiveFields: [
                ...this.config.sensitiveFields,
                ...(newConfig.sensitiveFields || []),
            ],
            sensitivePatterns: [
                ...this.config.sensitivePatterns,
                ...(newConfig.sensitivePatterns || []),
            ],
        };

        this.logger.info('Redaction config updated', {
            sensitiveFieldCount: this.config.sensitiveFields.length,
            sensitivePatternCount: this.config.sensitivePatterns.length,
        });
    }

    /**
     * Get current configuration (for audit)
     */
    getConfig(): RedactionConfig {
        return { ...this.config };
    }

    /**
     * Test redaction on sample data
     */
    testRedaction(sampleData: Record<string, unknown>): {
        original: Record<string, unknown>;
        redacted: Record<string, unknown>;
        fieldsRedacted: string[];
    } {
        const fieldsRedacted: string[] = [];
        const originalCopy = JSON.parse(JSON.stringify(sampleData));

        // Track redacted fields
        const trackingRedactor = (key: string, value: unknown) => {
            const redacted = this.redactValue(key, value);
            if (redacted !== value) {
                fieldsRedacted.push(key);
            }
            return redacted;
        };

        const originalCustomRedactor = this.config.customRedactor;
        this.config.customRedactor = trackingRedactor;

        const redacted = this.redactContext(sampleData);

        this.config.customRedactor = originalCustomRedactor;

        return {
            original: originalCopy,
            redacted,
            fieldsRedacted,
        };
    }
}

/**
 * Global context redactor instance
 */
let globalContextRedactor: ContextRedactor | null = null;

/**
 * Get or create global context redactor
 */
export function getContextRedactor(
    config?: Partial<RedactionConfig>,
): ContextRedactor {
    if (!globalContextRedactor) {
        globalContextRedactor = new ContextRedactor(config);
    }
    return globalContextRedactor;
}

/**
 * Set global context redactor (useful for testing)
 */
export function setContextRedactor(redactor: ContextRedactor): void {
    globalContextRedactor = redactor;
}

/**
 * Reset global context redactor (useful for testing)
 */
export function resetContextRedactor(): void {
    globalContextRedactor = null;
}

/**
 * Utility function to redact context quickly
 */
export function redactContext(
    context: Record<string, unknown>,
    config?: Partial<RedactionConfig>,
): Record<string, unknown> {
    const redactor = getContextRedactor(config);
    return redactor.redactContext(context);
}

/**
 * Utility function to redact event quickly
 */
export function redactEvent(
    event: Record<string, unknown>,
    config?: Partial<RedactionConfig>,
): Record<string, unknown> {
    const redactor = getContextRedactor(config);
    return redactor.redactEvent(event);
}
