import { OrchestrationConfig } from '@/core/types/allTypes.js';
import { SDKOrchestrator } from './sdk-orchestrator.js';

export function createOrchestration(
    config?: OrchestrationConfig,
): SDKOrchestrator {
    if (!config) {
        throw new Error('OrchestrationConfig is required');
    }

    return new SDKOrchestrator(config);
}
