/**
 * Middleware Exports
 *
 * Central export point for all middleware functions and types
 */

// Core middleware functions
export { withRetry } from './retry.js';
export { withTimeout } from './timeout.js';
export { withConcurrency } from './concurrency.js';
export { schedule } from './schedule.js';
export { withValidate, withValidateMiddleware } from './validate.js';
export { withObservability } from './observability.js';

// Middleware types
export {
    type Middleware,
    type MiddlewareFactory,
    type MiddlewareChain,
    type MiddlewareError,
    composeMiddleware,
    createMiddlewareChain,
    safeMiddleware,
    type ExtractEventType,
    type ExtractReturnType,
    type ConfigValidator,
    createConfigValidator,
} from './types.js';

// Specific middleware options
export type { RetryOptions } from '../../core/types/retry-types.js';
export type { TimeoutOptions } from './timeout.js';
export type { ConcurrencyOptions } from './concurrency.js';
export type { ScheduleOptions } from './schedule.js';
export type { ValidateOptions } from './validate.js';

// Monitoring middleware
// export { withMonitoring } from '../../observability/index.js';

// Composite middleware patterns
export { createStandardMiddleware } from './composites.js';

export * from './circuit-breaker.js';
