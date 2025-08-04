/**
 * Planner Prompt Composer
 *
 * Intelligently composes domain-agnostic prompts with optional domain-specific
 * customizations. Balances universal planning patterns with contextual intelligence.
 *
 * High-performance with caching, token optimization, and smart composition.
 */

import type { ToolMetadataForLLM } from '../../../../core/types/tool-types.js';
import type {
    PlannerPromptConfig,
    PromptCompositionContext,
    ComposedPrompt,
    PlanningExample,
} from '../../types/prompt-types.js';
import { createLogger } from '../../../../observability/index.js';

type Logger = ReturnType<typeof createLogger>;

/**
 * Cache for composed prompts to improve performance
 */
class PromptCache {
    private cache = new Map<
        string,
        { prompt: ComposedPrompt; timestamp: number }
    >();
    private readonly ttl = 10 * 60 * 1000; // 10 minutes

    get(key: string): ComposedPrompt | null {
        const cached = this.cache.get(key);

        if (cached && Date.now() - cached.timestamp < this.ttl) {
            return cached.prompt;
        }

        if (cached) {
            this.cache.delete(key);
        }

        return null;
    }

    set(key: string, prompt: ComposedPrompt): void {
        this.cache.set(key, { prompt, timestamp: Date.now() });

        // Prevent memory leaks
        if (this.cache.size > 50) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
    }

    clear(): void {
        this.cache.clear();
    }
}

/**
 * High-performance prompt composer with intelligent context awareness
 */
export class PlannerPromptComposer {
    private static readonly version = '1.0.0';
    private readonly logger: Logger = createLogger('planner-prompt-composer');
    private readonly cache = new PromptCache();

    constructor(private readonly config: PlannerPromptConfig) {
        this.logger.debug('PlannerPromptComposer initialized', {
            hasCustomExamples: !!config.customExamples?.length,
            hasExamplesProvider: !!config.examplesProvider,
            hasPatternsProvider: !!config.patternsProvider,
            additionalPatterns: config.additionalPatterns?.length || 0,
            constraints: config.constraints?.length || 0,
            features: config.features || {},
        });
    }

    /**
     * Compose a complete prompt for the planner
     */
    async composePrompt(
        context: PromptCompositionContext,
    ): Promise<ComposedPrompt> {
        const startTime = Date.now();

        // Check cache if enabled
        const cacheKey = this.generateCacheKey(context);
        if (this.config.features?.enablePromptCaching !== false) {
            const cached = this.cache.get(cacheKey);
            if (cached) {
                this.logger.debug('Using cached prompt', { cacheKey });
                return cached;
            }
        }

        // Compose system prompt
        const systemPrompt = this.composeSystemPrompt();

        // Compose user prompt
        const userPrompt = this.composeUserPrompt(context);

        // Create composed prompt with metadata
        const composedPrompt: ComposedPrompt = {
            systemPrompt,
            userPrompt,
            metadata: {
                estimatedTokens: this.estimateTokenCount(
                    systemPrompt + userPrompt,
                ),
                exampleCount: this.countIncludedExamples(),
                patternCount: this.countIncludedPatterns(),
                includesSmartAnalysis: false,
                timestamp: Date.now(),
                version: PlannerPromptComposer.version,
            },
        };

        // Cache the result
        if (this.config.features?.enablePromptCaching !== false) {
            this.cache.set(cacheKey, composedPrompt);
        }

        this.logger.debug('Prompt composition completed', {
            compositionTime: Date.now() - startTime,
            systemPromptLength: systemPrompt.length,
            userPromptLength: userPrompt.length,
            estimatedTokens: composedPrompt.metadata.estimatedTokens,
        });

        return composedPrompt;
    }

    /**
     * Compose the system prompt with universal patterns and customizations
     */
    private composeSystemPrompt(): string {
        const sections: string[] = [];

        // 1. Core universal planning patterns (always included)
        if (this.config.features?.includeUniversalPatterns !== false) {
            sections.push(this.getUniversalPlanningPatterns());
        }

        // 2. Additional domain patterns
        const additionalPatterns = this.gatherAdditionalPatterns();
        if (additionalPatterns.length > 0) {
            sections.push(this.formatAdditionalPatterns(additionalPatterns));
        }

        // 3. Custom examples
        const examples = this.gatherExamples();
        if (examples.length > 0) {
            sections.push(this.formatExamples(examples));
        }

        // 4. Constraints
        if (this.config.constraints?.length) {
            sections.push(this.formatConstraints(this.config.constraints));
        }

        // 5. Response format
        sections.push(this.getResponseFormat());

        return sections.join('\n\n');
    }

    /**
     * Compose the user prompt with context and dynamic hints
     */
    private composeUserPrompt(context: PromptCompositionContext): string {
        const sections: string[] = [];

        // 1. Tool usage instructions
        sections.push(this.getToolUsageInstructions());

        // 2. Available tools - enhanced list
        sections.push(this.formatAvailableTools(context.availableTools));

        // 3. Context information
        if (context.memoryContext) {
            sections.push(`CONTEXT:\n${context.memoryContext.trim()}`);
        }

        // 4. Planning history
        if (context.planningHistory) {
            sections.push(
                `PREVIOUS ATTEMPTS:\n${context.planningHistory.trim()}`,
            );
        }

        // 5. Additional context
        if (
            context.additionalContext &&
            Object.keys(context.additionalContext).length > 0
        ) {
            sections.push(
                `ADDITIONAL INFO:\n${JSON.stringify(context.additionalContext, null, 2)}`,
            );
        }

        // 6. Simple dynamic hints
        if (this.config.features?.includeDynamicHints !== false) {
            const hints = this.generateSimpleHints(context.goal);
            if (hints) {
                sections.push(`HINTS:\n${hints}`);
            }
        }

        // 7. The user request
        sections.push(`USER REQUEST: "${context.goal}"`);

        // 8. Final instruction
        sections.push(
            'Create an executable plan using the available tools above.',
        );

        return sections.join('\n\n');
    }

    /**
     * Instructions for using tools in the plan
     */
    private getToolUsageInstructions(): string {
        return `TOOL USAGE INSTRUCTIONS:

When creating your plan, follow these guidelines:

1. PARAMETER REQUIREMENTS:
   - REQUIRED fields must be provided with valid values
   - OPTIONAL fields can be omitted or set to null/undefined
   - Use the exact parameter names shown in the tool definitions

2. TOOL SELECTION:
   - Choose tools that match the user's request
   - Start with discovery tools (list_*) to gather information
   - Use specific tools (get_*) for detailed operations
   - Consider parallel execution for independent operations

3. PARAMETER VALUES:
   - String parameters: Use descriptive values (e.g., "active", "main", "feature-branch")
   - Enum parameters: Use exact values from the enum list
   - Object parameters: Provide nested structure with required fields
   - Date parameters: Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)

4. EXECUTION ORDER:
   - Discovery → Analysis → Action
   - Ensure dependencies are met before using dependent tools
   - Use conditional logic when appropriate

5. ERROR HANDLING:
   - Include fallback steps for potential failures
   - Validate inputs before tool execution
   - Consider alternative approaches if primary tools fail`;
    }

    /**
     * Universal planning patterns that work with any domain
     */
    private getUniversalPlanningPatterns(): string {
        return `You are a planning agent that creates executable plans using available tools.

CORE PLANNING PRINCIPLES:
1. ANALYZE: Understand what the user is asking for
2. DISCOVER: Use available tools to gather missing information
3. SEQUENCE: Order steps based on logical dependencies
4. OPTIMIZE: Identify opportunities for parallel execution
5. VALIDATE: Ensure each step has required parameters

UNIVERSAL REASONING PATTERNS:

Pattern 0 - Simple Conversational Input
When user provides greetings, thanks, or basic conversation:
→ Return EMPTY PLAN [] - no tools needed for basic social interaction
→ The system will handle conversational responses naturally
→ This applies to any casual interaction that doesn't require tool usage

Pattern 1 - Context Discovery
When user mentions implicit context or references unclear items:
→ Look for tools that can discover or list items (check descriptions for "list", "search", "find", "get all")
→ Use these first to establish context
→ Then proceed with specific operations using discovered identifiers

Pattern 2 - Parameter Resolution
CRITICAL: Parameters can come from 3 sources. Extract the actual values:

A) DIRECT VALUES - when you know the exact value:
   "argsTemplate": { "name": "exact-value", "count": 10, "enabled": true }

B) CONTEXT VALUES - extract actual values from the CONTEXT section:
   → Look at the CONTEXT section in the prompt
   → Find the data you need (navigate nested objects with dot notation)
   → Extract the ACTUAL VALUE, not a template reference
   → Example: if CONTEXT shows { "user": { "id": "123" } }, use "userId": "123"

C) STEP RESULTS - reference output from previous steps:
   "argsTemplate": { "paramName": "{{step-id.result}}" }
   "argsTemplate": { "nestedData": "{{step-id.result.fieldName}}" }
   "argsTemplate": { "firstItem": "{{step-id.result.items[0]}}" }
   → Use template syntax {{step-id.result}} for step dependencies
   → This will be resolved at execution time

D) MIXED SOURCES - combine context values and step results:
   "argsTemplate": {
     "contextValue": "actual-value-from-context",
     "stepResult": "{{previous-step.result.id}}",
     "directValue": "static-value"
   }

Pattern 3 - Dependency Management
Tools often depend on results from previous tools:
→ Use "dependsOn": ["step-id"] to enforce execution order
→ Reference dependent step results in argsTemplate
→ Example flow: list-items → get-details → perform-action
→ Never reference a step result without adding it to dependsOn

Pattern 4 - Tool Analysis
Read tool descriptions to understand what each tool does:
→ Tools that mention returning multiple items, lists, or arrays usually provide discovery
→ Tools that require specific identifiers in parameters usually need those IDs first
→ Tools that mention creating, updating, or deleting modify data
→ Always read the tool description - it contains the most reliable information

Pattern 5 - Parallel Optimization
Execute simultaneously when:
→ Operations are independent (no shared data dependencies)
→ Different resource types or endpoints
→ Read-only operations that don't conflict
→ Mark with parallel:true for concurrent execution
→ NEVER parallelize steps that depend on each other

Pattern 6 - Intelligent Fallback
When specific data is missing:
→ Don't give up - use available tools creatively
→ Use partial matches, filters, or approximations
→ Chain multiple operations to build needed context
→ Use empty objects {} for optional filter parameters`;
    }

    /**
     * Gather additional patterns from various sources
     */
    private gatherAdditionalPatterns(): string[] {
        const patterns: string[] = [];

        // Add patterns from provider
        if (this.config.patternsProvider) {
            patterns.push(...this.config.patternsProvider.getPatterns());
        }

        // Add additional patterns from config
        if (this.config.additionalPatterns) {
            patterns.push(...this.config.additionalPatterns);
        }

        return patterns;
    }

    /**
     * Format additional patterns section
     */
    private formatAdditionalPatterns(patterns: string[]): string {
        return `DOMAIN-SPECIFIC PATTERNS:\n${patterns.map((pattern, i) => `${i + 1}. ${pattern}`).join('\n')}`;
    }

    /**
     * Gather examples from various sources
     */
    private gatherExamples(): PlanningExample[] {
        const examples: PlanningExample[] = [];

        // Add custom examples from config
        if (this.config.customExamples) {
            examples.push(...this.config.customExamples);
        }

        // Add examples from provider
        if (this.config.examplesProvider) {
            examples.push(...this.config.examplesProvider.getExamples());
        }

        // Sort by weight (if specified) and limit to prevent token overflow
        return examples
            .sort((a, b) => (b.weight || 1) - (a.weight || 1))
            .slice(0, 3); // Limit to 3 examples for token efficiency
    }

    /**
     * Format examples section
     */
    private formatExamples(examples: PlanningExample[]): string {
        const formatted = examples
            .map(
                (example, i) => `
Example ${i + 1}: ${example.scenario}
Context: ${example.context}
Available Tools: [${example.availableTools.join(', ')}]

Response:
${JSON.stringify(example.expectedPlan, null, 2)}`,
            )
            .join('\n');

        return `EXAMPLES:${formatted}`;
    }

    /**
     * Format constraints section
     */
    private formatConstraints(constraints: string[]): string {
        return `CONSTRAINTS:\n${constraints.map((c) => `• ${c}`).join('\n')}`;
    }

    /**
     * Get response format specification
     */
    private getResponseFormat(): string {
        return (
            this.config.templates?.responseFormat ||
            `OUTPUT FORMAT:
{
  "strategy": "plan-execute",
  "goal": "<clear description of user intent>",
  "plan": [
    {
      "id": "<unique-kebab-case-id>",
      "description": "<what this step accomplishes>",
      "tool": "<exact tool name from available list>",
      "argsTemplate": {
        "<param>": "<see PARAMETER VALUES guide below>"
      },
      "dependsOn": ["<step-ids-this-depends-on>"],
      "parallel": <true|false>
    }
  ],
  "reasoning": [
    "<step-by-step thought process>",
    "<why this approach was chosen>",
    "<any assumptions made>"
  ]
}

PARAMETER VALUES - Choose the right approach:

1. DIRECT VALUE (when you know it):
   "name": "exact-string"
   "count": 42
   "enabled": true
   "filters": { "status": "active" }

2. CONTEXT VALUE (extract from CONTEXT section):
   → Look at the CONTEXT section in the prompt
   → Navigate to the data you need using mental dot notation
   → Extract the ACTUAL VALUE and use it directly
   → Example: if CONTEXT has {"user":{"id":"abc123"}}, use "userId": "abc123"

3. STEP RESULT (from previous step output):
   "paramName": "{{step-id.result}}"
   "nestedField": "{{step-id.result.fieldName}}"
   "arrayItem": "{{step-id.result.items[0]}}"
   → Use template syntax for step dependencies
   → This will be resolved at execution time

4. MIXED (combine multiple sources):
   {
     "contextValue": "actual-extracted-value",
     "stepResult": "{{previous-step.result.id}}",
     "directValue": "static-value"
   }

DEPENDENCY RULES:
- If you reference {{step-id.result}}, add "step-id" to dependsOn
- Steps in dependsOn execute BEFORE current step
- Use parallel:true only when steps have no dependencies
- Empty dependsOn [] means step can run immediately`
        );
    }

    /**
     * Format available tools - enhanced list with better structure
     */
    private formatAvailableTools(tools: ToolMetadataForLLM[] | string): string {
        const sections: string[] = ['TOOLS:'];

        // Handle case where tools is a JSON string
        let toolsArray: ToolMetadataForLLM[];
        if (typeof tools === 'string') {
            try {
                toolsArray = JSON.parse(tools);
            } catch (error) {
                this.logger.warn('Failed to parse tools JSON string', {
                    error,
                });
                return 'TOOLS: [Error parsing tools]';
            }
        } else {
            toolsArray = tools;
        }

        toolsArray.forEach((tool) => {
            // Tool name and description
            sections.push(`- ${tool.name}: ${tool.description}`);

            if (tool.parameters?.properties) {
                const params = this.formatToolParametersEnhanced(tool);
                if (params) sections.push(`  ${params}`);
            }

            sections.push(''); // Empty line between tools
        });

        return sections.join('\n');
    }

    /**
     * Enhanced tool parameters formatting with better structure
     */
    private formatToolParametersEnhanced(tool: ToolMetadataForLLM): string {
        if (!tool.parameters?.properties) return '';

        const properties = tool.parameters.properties as Record<
            string,
            unknown
        >;
        const required = (tool.parameters.required as string[]) || [];

        const paramStrings: string[] = [];

        for (const [name, prop] of Object.entries(properties)) {
            const isRequired = required.includes(name);
            const propObj = prop as {
                type?: string;
                description?: string;
                enum?: unknown[];
                format?: string;
                properties?: Record<string, unknown>;
            };

            // Determine the type display
            let typeDisplay = propObj.type || 'unknown';

            // Handle complex types
            if (typeDisplay === 'object' && propObj.properties) {
                const propKeys = Object.keys(propObj.properties);
                if (propKeys.length > 0) {
                    typeDisplay = `object{${propKeys.join(',')}}`;
                }
            }

            // Handle enums
            if (propObj.enum && Array.isArray(propObj.enum)) {
                const enumValues = propObj.enum as unknown[];
                if (enumValues.length <= 3) {
                    typeDisplay = `enum[${enumValues.join('|')}]`;
                } else {
                    typeDisplay = `enum(${enumValues.length} values)`;
                }
            }

            // Handle specific formats
            if (propObj.format) {
                typeDisplay = `${typeDisplay}:${propObj.format}`;
            }

            const marker = isRequired ? 'REQUIRED' : 'OPTIONAL';
            const paramLine = `- ${name} (${typeDisplay}, ${marker})${
                propObj.description ? `: ${propObj.description}` : ''
            }`;

            paramStrings.push(paramLine);

            // Handle nested object properties
            if (typeDisplay.startsWith('object{') && propObj.properties) {
                const nestedProps = propObj.properties as Record<
                    string,
                    unknown
                >;
                for (const [nestedName, nestedProp] of Object.entries(
                    nestedProps,
                )) {
                    const nestedPropObj = nestedProp as {
                        type?: string;
                        description?: string;
                        enum?: unknown[];
                    };

                    let nestedTypeDisplay = nestedPropObj.type || 'unknown';

                    // Handle nested enums
                    if (
                        nestedPropObj.enum &&
                        Array.isArray(nestedPropObj.enum)
                    ) {
                        const nestedEnumValues =
                            nestedPropObj.enum as unknown[];
                        if (nestedEnumValues.length <= 3) {
                            nestedTypeDisplay = `enum[${nestedEnumValues.join(
                                '|',
                            )}]`;
                        } else {
                            nestedTypeDisplay = `enum(${nestedEnumValues.length} values)`;
                        }
                    }

                    const nestedLine = `    - ${nestedName} (${nestedTypeDisplay}, OPTIONAL)${
                        nestedPropObj.description
                            ? `: ${nestedPropObj.description}`
                            : ''
                    }`;
                    paramStrings.push(nestedLine);
                }
            }
        }

        return `Parameters:\n    ${paramStrings.join('\n    ')}`;
    }

    /**
     * Generate simple hints based on request analysis
     */
    private generateSimpleHints(goal: string): string | null {
        const hints: string[] = [];
        const lowerGoal = goal.toLowerCase();

        // Detect simple greetings - highest priority
        if (
            /\b(hello|hi|hey|greetings?|good\s+(morning|afternoon|evening))\b/.test(
                lowerGoal,
            )
        ) {
            hints.push(
                'Simple greeting detected - return empty plan [] for natural conversation flow',
            );
            return hints.join('\n');
        }

        // Detect context-less references
        if (/\b(this|current|latest|recent|active)\b/.test(lowerGoal)) {
            hints.push(
                'User refers to implicit context - look for tools that can discover or list items first',
            );
        }

        // Detect plural operations
        if (/\b(all|multiple|several|list|many)\b/.test(lowerGoal)) {
            hints.push(
                'Multiple items mentioned - consider parallel execution opportunities',
            );
        }

        // Detect urgency or time constraints
        if (/\b(quick|fast|urgent|immediately|asap)\b/.test(lowerGoal)) {
            hints.push(
                'Time-sensitive request - maximize parallel execution where safe',
            );
        }

        return hints.length > 0 ? hints.join('\n') : null;
    }

    /**
     * Generate cache key for prompt caching
     */
    private generateCacheKey(context: PromptCompositionContext): string {
        const keyData = {
            goal: context.goal,
            tools: context.availableTools
                .map((t) => t.name)
                .sort()
                .join(','),
            config: {
                hasExamples: !!this.config.customExamples?.length,
                hasProvider: !!this.config.examplesProvider,
                patterns: this.config.additionalPatterns?.join(',') || '',
                constraints: this.config.constraints?.join(',') || '',
            },
        };

        return Buffer.from(JSON.stringify(keyData))
            .toString('base64')
            .substring(0, 32);
    }

    /**
     * Estimate token count (rough approximation)
     */
    private estimateTokenCount(text: string): number {
        // Rough estimation: 1 token ≈ 4 characters for English text
        return Math.ceil(text.length / 4);
    }

    /**
     * Count included examples for metadata
     */
    private countIncludedExamples(): number {
        const examples = this.gatherExamples();
        return examples.length;
    }

    /**
     * Count included patterns for metadata
     */
    private countIncludedPatterns(): number {
        const patterns = this.gatherAdditionalPatterns();
        return (
            patterns.length +
            (this.config.features?.includeUniversalPatterns !== false ? 4 : 0)
        );
    }

    /**
     * Clear prompt cache
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { size: number } {
        return {
            size: this.cache['cache'].size,
        };
    }
}
