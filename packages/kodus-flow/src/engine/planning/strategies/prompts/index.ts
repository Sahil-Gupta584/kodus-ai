/**
 * Prompt System Exports
 *
 * Clean API for the intelligent prompt composition system.
 * Provides domain-agnostic planning with optional customization.
 */

// Core types
export type {
    PlanningExample,
    DomainExamplesProvider,
    DomainPatternsProvider,
    PlannerBehavior,
    PlannerPromptConfig,
    PromptCompositionContext,
    ComposedPrompt,
} from '../../types/prompt-types.js';

// Main composer
export { PlannerPromptComposer } from './planner-prompt-composer.js';

// Default providers
export {
    DefaultDomainExamplesProvider,
    DefaultDomainPatternsProvider,
    UniversalExamplesProvider,
    UniversalPatternsProvider,
    createDefaultProviders,
} from './default-domain-providers.js';

// Convenience factory functions
export {
    createPlannerPromptComposer,
    createUniversalPromptConfig,
} from './factory.js';
