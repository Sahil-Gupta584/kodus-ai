/**
 * Default Domain Providers
 *
 * Provides base implementations and universal examples for the prompt system.
 * Users can extend these or create their own implementations.
 */

import type {
    DomainExamplesProvider,
    DomainPatternsProvider,
    PlanningExample,
} from '../../types/prompt-types.js';

/**
 * Default implementation that provides no domain examples
 * Serves as a base class for custom implementations
 */
export class DefaultDomainExamplesProvider implements DomainExamplesProvider {
    getExamples(): PlanningExample[] {
        return [];
    }

    getRelevantExamples(availableTools: string[]): PlanningExample[] {
        return this.getExamples().filter((example) =>
            example.availableTools.some((tool) =>
                availableTools.includes(tool),
            ),
        );
    }

    getExamplesByTags(tags: string[]): PlanningExample[] {
        return this.getExamples().filter(
            (example) =>
                example.tags && example.tags.some((tag) => tags.includes(tag)),
        );
    }
}

/**
 * Default implementation that provides no additional patterns
 * Serves as a base class for custom implementations
 */
export class DefaultDomainPatternsProvider implements DomainPatternsProvider {
    getPatterns(): string[] {
        return [];
    }

    getContextualPatterns(): string[] {
        return this.getPatterns();
    }
}

/**
 * Universal examples that work across different domains
 * These demonstrate common patterns without being domain-specific
 */
export class UniversalExamplesProvider implements DomainExamplesProvider {
    getExamples(): PlanningExample[] {
        return [
            {
                scenario:
                    'User asks about specific item without providing identifier',
                context:
                    'User mentions "current item" or "this resource" without specifying which one',
                availableTools: [
                    'list_items',
                    'get_item_details',
                    'search_items',
                ],
                expectedPlan: {
                    strategy: 'plan-execute',
                    goal: 'Get information about the current item',
                    plan: [
                        {
                            id: 'discover-context',
                            description:
                                'List recent items to identify current context',
                            tool: 'list_items',
                            argsTemplate: {
                                limit: 5,
                                sort: 'updated_desc',
                            },
                            parallel: false,
                        },
                        {
                            id: 'get-item-details',
                            description:
                                'Get detailed information about the identified item',
                            tool: 'get_item_details',
                            argsTemplate: {
                                itemId: '{{discover-context.result[0].id}}',
                            },
                            dependsOn: ['discover-context'],
                            parallel: false,
                        },
                    ],
                    reasoning: [
                        'User refers to "current item" without specifying which one',
                        'Need to discover context by listing recent items first',
                        'Then get details of the most recently updated item',
                        'Using template reference to chain the results',
                    ],
                },
                weight: 3,
                tags: ['context-discovery', 'parameter-resolution'],
            },
            {
                scenario: 'Simple conversational input',
                context:
                    'User provides greeting or simple question not requiring tools',
                availableTools: [
                    'search_data',
                    'analyze_metrics',
                    'get_status',
                ],
                expectedPlan: {
                    strategy: 'plan-execute',
                    goal: 'Respond to conversational input',
                    plan: [],
                    reasoning: [
                        'This is a conversational greeting or simple question',
                        'No external tools are needed for basic interaction',
                        'System will handle the response naturally',
                    ],
                },
                weight: 3, // Higher weight for better prioritization
                tags: ['conversational', 'empty-plan'],
            },
            {
                scenario: 'Casual conversational input',
                context:
                    "User provides casual interaction that doesn't require tool usage",
                availableTools: ['tool_a', 'tool_b', 'tool_c'],
                expectedPlan: {
                    strategy: 'plan-execute',
                    goal: 'Respond to casual conversation appropriately',
                    plan: [],
                    reasoning: [
                        'User is providing casual conversation',
                        'No specific task or tool usage is requested',
                        'Direct conversational response is most appropriate',
                        'Empty plan allows natural conversation flow',
                    ],
                },
                weight: 4, // Highest weight for exact scenario match
                tags: ['conversational', 'empty-plan'],
            },
            {
                scenario: 'Multiple independent operations',
                context:
                    'User wants to check or retrieve multiple unrelated items',
                availableTools: [
                    'check_item_status',
                    'get_item_details',
                    'fetch_item_data',
                ],
                expectedPlan: {
                    strategy: 'plan-execute',
                    goal: 'Check status of multiple items',
                    plan: [
                        {
                            id: 'check-item-a',
                            description: 'Check status of first item',
                            tool: 'check_item_status',
                            argsTemplate: { itemId: 'item_a' },
                            parallel: true,
                        },
                        {
                            id: 'check-item-b',
                            description: 'Check status of second item',
                            tool: 'check_item_status',
                            argsTemplate: { itemId: 'item_b' },
                            parallel: true,
                        },
                        {
                            id: 'check-item-c',
                            description: 'Check status of third item',
                            tool: 'check_item_status',
                            argsTemplate: { itemId: 'item_c' },
                            parallel: true,
                        },
                    ],
                    reasoning: [
                        'Multiple items need status checks',
                        'Each check is independent of others',
                        'All checks can run in parallel for efficiency',
                        'Using same tool with different parameters',
                    ],
                },
                weight: 3,
                tags: ['parallel-execution', 'independent-operations'],
            },
            {
                scenario: 'Sequential dependency workflow',
                context:
                    'Operations that must be performed in sequence with data dependencies',
                availableTools: [
                    'get_entity_info',
                    'check_entity_permissions',
                    'perform_action',
                ],
                expectedPlan: {
                    strategy: 'plan-execute',
                    goal: 'Execute action with proper authorization',
                    plan: [
                        {
                            id: 'get-entity-info',
                            description: 'Get entity information',
                            tool: 'get_entity_info',
                            argsTemplate: { entityId: 'current_entity' },
                            parallel: false,
                        },
                        {
                            id: 'check-permissions',
                            description:
                                'Verify entity has required permissions',
                            tool: 'check_entity_permissions',
                            argsTemplate: {
                                entityId: '{{get-entity-info.result.id}}',
                                resource: 'target_resource',
                            },
                            dependsOn: ['get-entity-info'],
                            parallel: false,
                        },
                        {
                            id: 'perform-authorized-action',
                            description:
                                'Perform the requested action with authorization',
                            tool: 'perform_action',
                            argsTemplate: {
                                entityId: '{{get-entity-info.result.id}}',
                                permissions: '{{check-permissions.result}}',
                                action: 'requested_action',
                            },
                            dependsOn: ['get-entity-info', 'check-permissions'],
                            parallel: false,
                        },
                    ],
                    reasoning: [
                        'Action requires proper entity authorization',
                        'Must get entity information first to identify entity',
                        'Then check permissions using entity ID',
                        'Finally perform action with both entity info and permissions',
                        'Sequential dependencies prevent parallel execution',
                    ],
                },
                weight: 3,
                tags: ['sequential-dependencies', 'authorization-flow'],
            },
            {
                scenario: 'Mixed parallel and sequential operations',
                context:
                    'Complex workflow with both independent and dependent operations',
                availableTools: [
                    'fetch_configuration',
                    'check_current_state',
                    'save_backup',
                    'process_analysis',
                ],
                expectedPlan: {
                    strategy: 'plan-execute',
                    goal: 'Prepare analysis with backup',
                    plan: [
                        {
                            id: 'fetch-configuration',
                            description: 'Fetch current configuration',
                            tool: 'fetch_configuration',
                            argsTemplate: { configType: 'current' },
                            parallel: true,
                        },
                        {
                            id: 'check-state',
                            description: 'Check current state',
                            tool: 'check_current_state',
                            argsTemplate: { scope: 'all' },
                            parallel: true,
                        },
                        {
                            id: 'save-backup',
                            description: 'Save backup of current data',
                            tool: 'save_backup',
                            argsTemplate: {
                                backupType: 'incremental',
                                timestamp: 'current',
                            },
                            parallel: false,
                        },
                        {
                            id: 'process-analysis',
                            description:
                                'Process analysis with configuration and state',
                            tool: 'process_analysis',
                            argsTemplate: {
                                config: '{{fetch-configuration.result}}',
                                state: '{{check-state.result}}',
                                backupRef: '{{save-backup.result.backupId}}',
                            },
                            dependsOn: [
                                'fetch-configuration',
                                'check-state',
                                'save-backup',
                            ],
                            parallel: false,
                        },
                    ],
                    reasoning: [
                        'Configuration and state can be retrieved in parallel (independent)',
                        'Backup runs separately as it might take longer',
                        'Analysis depends on all three previous operations',
                        'Mixed execution strategy optimizes performance while respecting dependencies',
                    ],
                },
                weight: 2,
                tags: ['mixed-execution', 'complex-workflow'],
            },
        ];
    }

    getRelevantExamples(availableTools: string[]): PlanningExample[] {
        // Return examples that have at least one matching tool
        return this.getExamples().filter((example) =>
            example.availableTools.some((tool) =>
                availableTools.some(
                    (available) =>
                        // Fuzzy matching for similar tool names
                        available.toLowerCase().includes(tool.toLowerCase()) ||
                        tool.toLowerCase().includes(available.toLowerCase()),
                ),
            ),
        );
    }

    getExamplesByTags(tags: string[]): PlanningExample[] {
        return this.getExamples().filter(
            (example) =>
                example.tags && example.tags.some((tag) => tags.includes(tag)),
        );
    }
}

/**
 * Universal patterns that apply across different domains
 */
export class UniversalPatternsProvider implements DomainPatternsProvider {
    getPatterns(): string[] {
        return [
            'When user refers to "current" or "this" without context, prioritize discovery tools',
            'Use specific tools over generic ones when both are available',
            'Group independent operations for parallel execution to improve performance',
            'Always validate required data exists before attempting operations',
            'Chain tool results using {{step-id.result}} template references',
            'Consider rate limits when planning multiple parallel operations',
            'Prefer read-only operations for parallel execution',
            'Use descriptive step IDs that reflect the operation purpose',
            'Include clear reasoning that explains the chosen approach',
            'Fail gracefully by providing alternative approaches when primary tools unavailable',
        ];
    }

    getContextualPatterns(context?: {
        availableTools?: string[];
        userContext?: Record<string, unknown>;
        previousAttempts?: number;
    }): string[] {
        const basePatterns = this.getPatterns();
        const contextualPatterns: string[] = [];

        if (context?.previousAttempts && context.previousAttempts > 1) {
            contextualPatterns.push(
                'Previous attempts failed - try alternative approaches or simpler steps',
                'Consider breaking complex operations into smaller, more reliable steps',
            );
        }

        if (context?.availableTools) {
            const hasListTools = context.availableTools.some((tool) =>
                /^(list|get_all|search)_/.test(tool),
            );
            const hasDetailTools = context.availableTools.some(
                (tool) =>
                    /^(get|fetch)_/.test(tool) &&
                    !/^(get_all|get_list)_/.test(tool),
            );

            if (hasListTools && hasDetailTools) {
                contextualPatterns.push(
                    'Both discovery and detail tools available - use list→detail pattern',
                );
            }

            const actionToolCount = context.availableTools.filter((tool) =>
                /^(create|update|delete|modify)_/.test(tool),
            ).length;

            if (actionToolCount > 0) {
                contextualPatterns.push(
                    'Modification tools available - ensure proper authorization and validation',
                );
            }
        }

        return [...basePatterns, ...contextualPatterns];
    }
}

/**
 * Factory function to create default providers based on configuration
 */
export function createDefaultProviders(config?: {
    includeUniversalExamples?: boolean;
    includeUniversalPatterns?: boolean;
}): {
    examplesProvider: DomainExamplesProvider;
    patternsProvider: DomainPatternsProvider;
} {
    return {
        examplesProvider:
            config?.includeUniversalExamples !== false
                ? new UniversalExamplesProvider()
                : new DefaultDomainExamplesProvider(),
        patternsProvider:
            config?.includeUniversalPatterns !== false
                ? new UniversalPatternsProvider()
                : new DefaultDomainPatternsProvider(),
    };
}
