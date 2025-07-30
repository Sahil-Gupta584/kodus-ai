/**
 * @module orchestration/index
 * @description SDK Orchestrator simples
 */

import {
    SDKOrchestrator,
    type OrchestrationConfig,
} from './sdk-orchestrator.js';

/**
 * Factory para criar orchestrator
 */
export function createOrchestration(
    config?: OrchestrationConfig,
): SDKOrchestrator {
    if (!config) {
        throw new Error('OrchestrationConfig is required');
    }
    return new SDKOrchestrator(config);
}

// Re-exportar tipos
export type { OrchestrationConfig } from './sdk-orchestrator.js';
export type { OrchestrationResult } from './sdk-orchestrator.js';
