/**
 * Runtime constants for default values
 */

/**
 * Default timeout in milliseconds (30 seconds)
 */
export const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Default retry options
 */
export const DEFAULT_RETRY_OPTIONS = {
    /**
     * Maximum number of retry attempts
     */
    maxRetries: 3,

    /**
     * Base delay in milliseconds
     */
    baseMs: 100,

    /**
     * Exponential backoff factor
     */
    factor: 2,

    /**
     * Jitter factor (0-1) to add randomness to backoff
     */
    jitter: 0.1,
};

/**
 * Default concurrency options
 */
export const DEFAULT_CONCURRENCY_OPTIONS = {
    /**
     * Maximum number of concurrent executions
     */
    maxConcurrent: 5,

    /**
     * Default concurrency mode
     */
    mode: 'drop' as 'drop' | 'wait',
};

/**
 * Default schedule options
 */
export const DEFAULT_SCHEDULE_OPTIONS = {
    /**
     * Default interval in milliseconds
     */
    intervalMs: 1000,
};
