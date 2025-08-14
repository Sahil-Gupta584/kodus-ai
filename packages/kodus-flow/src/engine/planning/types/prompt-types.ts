/**
 * Domain-agnostic prompt system types
 *
 * This module defines the core types for the extensible prompt system
 * that allows customization while maintaining framework-level intelligence.
 */

/**
 * Represents an example planning scenario for training the LLM
 */
export interface PlanningExample {
    /** Brief description of the scenario */
    scenario: string;

    /** Context or situation description */
    context: string;

    /** List of tool names available in this example */
    availableTools: string[];

    /** The expected plan structure for this scenario */
    expectedPlan: {
        strategy: string;
        goal: string;
        plan: Array<{
            id: string;
            description: string;
            tool: string;
            argsTemplate?: Record<string, unknown>;
            dependsOn?: string[];
            parallel?: boolean;
        }>;
        reasoning: string[];
    };

    /** Optional: Weight/priority of this example (higher = more important) */
    weight?: number;

    /** Optional: Tags for categorizing examples */
    tags?: string[];
}

/**
 * Provider interface for domain-specific planning examples
 */
export interface DomainExamplesProvider {
    /**
     * Get all available planning examples
     */
    getExamples(): PlanningExample[];

    /**
     * Get examples filtered by available tools
     * Useful for showing only relevant examples to the LLM
     */
    getRelevantExamples?(availableTools: string[]): PlanningExample[];

    /**
     * Get examples filtered by scenario tags
     */
    getExamplesByTags?(tags: string[]): PlanningExample[];
}

/**
 * Provider interface for domain-specific reasoning patterns
 */
export interface DomainPatternsProvider {
    /**
     * Get domain-specific reasoning patterns
     */
    getPatterns(): string[];

    /**
     * Get contextual patterns based on available tools or context
     */
    getContextualPatterns?(context: {
        availableTools?: string[];
        userContext?: Record<string, unknown>;
        previousAttempts?: number;
    }): string[];
}

/**
 * Behavioral configuration for the planner
 */
export interface PlannerBehavior {
    /** Prefer parallel execution when possible */
    preferParallelExecution?: boolean;

    /** Automatically discover tool relationships */
    autoDiscoverRelationships?: boolean;

    /** Include detailed reasoning in responses */
    verboseReasoning?: boolean;

    /** Maximum steps allowed in a single plan */
    maxStepsPerPlan?: number;

    /** Prefer discovery tools when context is ambiguous */
    preferDiscoveryOnAmbiguity?: boolean;

    /** Timeout for individual planning operations (ms) */
    planningTimeout?: number;
}

/**
 * Main configuration interface for the prompt system
 */
export interface PlannerPromptConfig {
    /** Optional custom examples provider */
    customExamples?: PlanningExample[];

    /** Optional examples provider interface */
    examplesProvider?: DomainExamplesProvider;

    /** Optional patterns provider interface */
    patternsProvider?: DomainPatternsProvider;

    /** Additional reasoning patterns (simple strings) */
    additionalPatterns?: string[];

    /** Custom constraints to apply to planning */
    constraints?: string[];

    /** Behavioral configuration */
    behavior?: PlannerBehavior;

    /** Feature flags */
    features?: {
        /** Include default universal patterns */
        includeUniversalPatterns?: boolean;

        /** Include dynamic hints based on request analysis */
        includeDynamicHints?: boolean;

        /** Use caching for prompt composition */
        enablePromptCaching?: boolean;
    };

    /** Custom prompt templates (advanced usage) */
    templates?: {
        /** Override system prompt template */
        system?: string;

        /** Override user prompt template */
        user?: string;

        /** Custom response format specification */
        responseFormat?: string;
    };
}

/**
 * Context object passed to prompt composition
 */
export interface PromptCompositionContext {
    /** User's goal/request */
    goal: string;

    /** Available tools with metadata */
    availableTools: Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
    }>;

    /** Memory context from previous interactions */
    memoryContext?: string;

    /** Planning history from current session */
    planningHistory?: string;

    /** Additional context data (user-provided info only) */
    additionalContext?: Record<string, unknown>;

    /** Replan context (system information about previous execution) */
    replanContext?: Record<string, unknown>;

    /** Whether this is a replan attempt */
    isReplan?: boolean;

    /** Current iteration number */
    iteration?: number;

    /** Maximum allowed iterations */
    maxIterations?: number;
}

/**
 * Result of prompt composition
 */
export interface ComposedPrompt {
    /** The system prompt */
    systemPrompt: string;

    /** The user prompt */
    userPrompt: string;

    /** Metadata about the composition */
    metadata: {
        /** Total token count estimate */
        estimatedTokens: number;

        /** Number of examples included */
        exampleCount: number;

        /** Number of patterns included */
        patternCount: number;

        /** Whether smart analysis was included */
        includesSmartAnalysis: boolean;

        /** Composition timestamp */
        timestamp: number;

        /** Version of the prompt system */
        version: string;
    };
}
