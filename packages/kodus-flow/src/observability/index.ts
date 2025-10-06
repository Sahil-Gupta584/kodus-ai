export * from './types.js';

import { ObservabilitySystem } from './observability.js';
export { ObservabilitySystem } from './observability.js';
import { ObservabilityConfig } from './types.js';
export { TelemetrySystem } from './telemetry.js';
export { createLogger } from './logger.js';

export {
    ExecutionTracker,
    executionTracker,
    startExecutionTracking,
    addExecutionStep,
    completeExecutionTracking,
    failExecutionTracking,
    getExecutionTracking,
} from './execution-tracker.js';

let globalObservability: ObservabilitySystem | undefined;

export function getObservability(
    config?: Partial<ObservabilityConfig>,
): ObservabilitySystem {
    if (!globalObservability) {
        globalObservability = new ObservabilitySystem(config);
    }
    return globalObservability;
}

export function initObservability(
    config?: Partial<ObservabilityConfig>,
): ObservabilitySystem {
    globalObservability = new ObservabilitySystem(config);
    return globalObservability;
}

export function markSpanOk(span: any) {
    if (span && typeof span.setStatus === 'function') {
        span.setStatus({ code: 'ok' });
    }
}

export function applyErrorToSpan(span: any, error: Error) {
    if (span && typeof span.recordException === 'function') {
        span.recordException(error);
        span.setStatus({ code: 'error', message: error.message });
    }
}

export {
    getExecutionTraceability,
    getExecutionSummary,
} from './traceability.js';

export type { TraceabilityResponse } from './traceability.js';
