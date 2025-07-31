/**
 * Factory Functions
 *
 * Convenience functions for creating prompt composers and configurations
 * with sensible defaults and common patterns.
 */

import type {
    PlannerPromptConfig,
    PlanningExample,
} from '../../types/prompt-types.js';
import { PlannerPromptComposer } from './planner-prompt-composer.js';
import { createDefaultProviders } from './default-domain-providers.js';

/**
 * Create a prompt composer with smart defaults
 */
export function createPlannerPromptComposer(
    config?: PlannerPromptConfig,
): PlannerPromptComposer {
    // Apply default configuration
    const defaultConfig: PlannerPromptConfig = {
        features: {
            includeUniversalPatterns: true,
            includeDynamicHints: true,
            enablePromptCaching: true,
        },
        behavior: {
            preferParallelExecution: true,
            autoDiscoverRelationships: true,
            verboseReasoning: false,
            maxStepsPerPlan: 10,
            preferDiscoveryOnAmbiguity: true,
            planningTimeout: 30000, // 30 seconds
        },
    };

    // Merge user config with defaults
    const mergedConfig: PlannerPromptConfig = {
        ...defaultConfig,
        ...config,
        features: {
            ...defaultConfig.features,
            ...config?.features,
        },
        behavior: {
            ...defaultConfig.behavior,
            ...config?.behavior,
        },
    };

    return new PlannerPromptComposer(mergedConfig);
}

/**
 * Create a universal configuration with default providers
 */
export function createUniversalPromptConfig(
    overrides?: Partial<PlannerPromptConfig>,
): PlannerPromptConfig {
    const { examplesProvider, patternsProvider } = createDefaultProviders({
        includeUniversalExamples:
            overrides?.features?.includeUniversalPatterns !== false,
        includeUniversalPatterns:
            overrides?.features?.includeUniversalPatterns !== false,
    });

    return {
        examplesProvider,
        patternsProvider,
        features: {
            includeUniversalPatterns: true,
            includeDynamicHints: true,
            enablePromptCaching: true,
        },
        behavior: {
            preferParallelExecution: true,
            autoDiscoverRelationships: true,
            verboseReasoning: false,
            maxStepsPerPlan: 10,
            preferDiscoveryOnAmbiguity: true,
            planningTimeout: 30000,
        },
        ...overrides,
    };
}

/**
 * Create a minimal configuration for basic usage
 */
export function createMinimalPromptConfig(
    overrides?: Partial<PlannerPromptConfig>,
): PlannerPromptConfig {
    return {
        features: {
            includeUniversalPatterns: true,
            includeDynamicHints: false,
            enablePromptCaching: false,
        },
        behavior: {
            preferParallelExecution: false,
            autoDiscoverRelationships: true,
            verboseReasoning: false,
            maxStepsPerPlan: 5,
            preferDiscoveryOnAmbiguity: true,
            planningTimeout: 15000,
        },
        ...overrides,
    };
}

/**
 * Create a performance-optimized configuration
 */
export function createPerformancePromptConfig(
    overrides?: Partial<PlannerPromptConfig>,
): PlannerPromptConfig {
    return {
        features: {
            includeUniversalPatterns: true,
            includeDynamicHints: true,
            enablePromptCaching: true,
        },
        behavior: {
            preferParallelExecution: true,
            autoDiscoverRelationships: true,
            verboseReasoning: false,
            maxStepsPerPlan: 15,
            preferDiscoveryOnAmbiguity: true,
            planningTimeout: 45000,
        },
        additionalPatterns: [
            'Maximize parallel execution for independent operations',
            'Use efficient tool combinations to minimize total execution time',
            'Cache intermediate results when possible',
        ],
        ...overrides,
    };
}

/**
 * Create a development/debugging configuration
 */
export function createDebugPromptConfig(
    overrides?: Partial<PlannerPromptConfig>,
): PlannerPromptConfig {
    const { examplesProvider, patternsProvider } = createDefaultProviders();

    return {
        examplesProvider,
        patternsProvider,
        features: {
            includeUniversalPatterns: true,
            includeDynamicHints: true,
            enablePromptCaching: false, // Disable caching for debugging
        },
        behavior: {
            preferParallelExecution: false, // Simpler execution for debugging
            autoDiscoverRelationships: true,
            verboseReasoning: true, // Detailed reasoning for debugging
            maxStepsPerPlan: 20,
            preferDiscoveryOnAmbiguity: true,
            planningTimeout: 60000, // Longer timeout for debugging
        },
        additionalPatterns: [
            'Include detailed reasoning for each decision',
            'Prefer explicit over implicit operations',
            'Add validation steps where appropriate',
        ],
        constraints: [
            'Always explain why each tool was chosen',
            'Include error handling considerations',
            'Document assumptions clearly',
        ],
        ...overrides,
    };
}

/**
 * Helper to create domain-specific examples easily
 */
export function createDomainExample(
    scenario: string,
    context: string,
    tools: string[],
    plan: unknown,
    options?: {
        weight?: number;
        tags?: string[];
    },
): PlanningExample {
    return {
        scenario,
        context,
        availableTools: tools,
        expectedPlan: {
            strategy: 'plan-execute',
            goal: scenario,
            plan: Array.isArray(plan) ? plan : [plan],
            reasoning: ['Domain-specific example'],
        },
        weight: options?.weight || 1,
        tags: options?.tags || [],
    };
}

/**
 * Validate a prompt configuration
 */
export function validatePromptConfig(config: PlannerPromptConfig): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
} {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate behavior settings
    if (
        config.behavior?.maxStepsPerPlan &&
        config.behavior.maxStepsPerPlan < 1
    ) {
        errors.push('maxStepsPerPlan must be at least 1');
    }

    if (
        config.behavior?.maxStepsPerPlan &&
        config.behavior.maxStepsPerPlan > 50
    ) {
        warnings.push('maxStepsPerPlan > 50 may lead to very long prompts');
    }

    if (
        config.behavior?.planningTimeout &&
        config.behavior.planningTimeout < 1000
    ) {
        warnings.push(
            'planningTimeout < 1000ms may be too short for complex planning',
        );
    }

    // Validate examples
    if (config.customExamples) {
        config.customExamples.forEach((example, index) => {
            if (!example.scenario || !example.context) {
                errors.push(
                    `Custom example ${index}: missing scenario or context`,
                );
            }

            if (
                !example.availableTools ||
                example.availableTools.length === 0
            ) {
                errors.push(
                    `Custom example ${index}: no available tools specified`,
                );
            }

            if (!example.expectedPlan || !example.expectedPlan.plan) {
                errors.push(
                    `Custom example ${index}: missing expectedPlan.plan`,
                );
            }
        });
    }

    // Validate constraints
    if (config.constraints) {
        config.constraints.forEach((constraint, index) => {
            if (!constraint || constraint.trim().length === 0) {
                warnings.push(`Empty constraint at index ${index}`);
            }
        });
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
    };
}
