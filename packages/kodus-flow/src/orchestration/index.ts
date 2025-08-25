import {
    SDKOrchestrator,
    type OrchestrationConfig,
} from './sdk-orchestrator.js';

export function createOrchestration(
    config?: OrchestrationConfig,
): SDKOrchestrator {
    if (!config) {
        throw new Error('OrchestrationConfig is required');
    }

    return new SDKOrchestrator(config);
}

export type {
    OrchestrationConfig,
    OrchestrationResult,
} from './sdk-orchestrator.js';
