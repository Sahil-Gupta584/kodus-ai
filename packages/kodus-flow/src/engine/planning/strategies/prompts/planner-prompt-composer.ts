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

    private formatAvailableTools(
        tools:
            | ToolMetadataForLLM[]
            | Array<{
                  name: string;
                  description: string;
                  parameters: Record<string, unknown>;
                  outputSchema?: Record<string, unknown>;
              }>
            | string,
    ): string {
        const sections: string[] = ['TOOLS:'];

        let toolsArray: Array<{
            name: string;
            description: string;
            parameters?: Record<string, unknown>;
            outputSchema?: Record<string, unknown>;
        }>;
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
            sections.push(`- ${tool.name}: ${tool.description}`);

            if (tool.parameters?.properties) {
                const params = this.formatToolParametersEnhanced({
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                } as ToolMetadataForLLM);
                if (params) {
                    sections.push(`  ${params}`);
                }
            }

            // Add output schema if available
            if (tool.outputSchema?.properties) {
                const outputFormat = this.formatOutputSchema(tool.outputSchema);

                if (outputFormat) {
                    sections.push(outputFormat);
                }
            }

            sections.push('');
        });

        return sections.join('\n');
    }

    /**
     * 🚀 Universal output schema formatter - handles ALL JSON Schema types
     * Supports: primitives, objects, arrays, enums, nested structures
     * Detects wrapper patterns and extracts meaningful data
     */
    private formatOutputSchema(outputSchema: Record<string, unknown>): string {
        if (!outputSchema) return '';

        // 🎯 Detect common wrapper patterns (success/count/data)
        const unwrapped = this.unwrapOutputSchema(outputSchema);

        // 🎯 Format the schema recursively (without required markers for outputs)
        const formatted = this.formatSchemaType(unwrapped, 0, false);
        return formatted ? `\n  Response: ${formatted}` : '';
    }

    /**
     * 🚀 Unwrap common output wrapper patterns
     * Patterns: { success, count, data }, { success, data }, { data }
     */
    private unwrapOutputSchema(
        schema: Record<string, unknown>,
    ): Record<string, unknown> {
        if (schema.type !== 'object' || !schema.properties) {
            return schema;
        }

        const properties = schema.properties as Record<string, unknown>;
        const propNames = Object.keys(properties);

        // 🎯 Pattern 1: { success, count, data } - Extract data field
        if (
            propNames.includes('data') &&
            (propNames.includes('success') || propNames.includes('count'))
        ) {
            const dataField = properties.data as Record<string, unknown>;
            if (dataField) {
                return dataField;
            }
        }

        // 🎯 Pattern 2: { data } only - Extract data field
        if (propNames.length === 1 && propNames[0] === 'data') {
            const dataField = properties.data as Record<string, unknown>;
            if (dataField) {
                return dataField;
            }
        }

        // 🎯 Pattern 3: { results } - Extract results field
        if (propNames.includes('results') && propNames.length <= 3) {
            const resultsField = properties.results as Record<string, unknown>;
            if (resultsField) {
                return resultsField;
            }
        }

        // 🎯 No wrapper pattern detected, return as-is
        return schema;
    }

    /**
     * 🚀 Recursively format any JSON Schema type with proper indentation
     */
    private formatSchemaType(
        schema: Record<string, unknown>,
        depth: number = 0,
        showRequiredMarkers: boolean = true,
    ): string {
        if (!schema) return 'unknown';

        const indent = '    '.repeat(depth);
        const type = schema.type as string;
        const description = schema.description as string;
        const enumValues = schema.enum as unknown[];

        // 🎯 Handle enums first (can be any type)
        if (enumValues && enumValues.length > 0) {
            const values = enumValues.map((v) => `"${v}"`).join(' | ');
            const enumType = `(${values})`;
            return description ? `${enumType} - ${description}` : enumType;
        }

        switch (type) {
            case 'string': {
                const format = schema.format as string;
                let typeDisplay = 'string';

                // Add format info if available
                if (format) {
                    typeDisplay += ` (${format})`;
                }

                // Add length constraints
                const minLength = schema.minLength as number;
                const maxLength = schema.maxLength as number;
                if (minLength !== undefined || maxLength !== undefined) {
                    const constraints = [];
                    if (minLength !== undefined)
                        constraints.push(`min: ${minLength}`);
                    if (maxLength !== undefined)
                        constraints.push(`max: ${maxLength}`);
                    typeDisplay += ` [${constraints.join(', ')}]`;
                }

                return description
                    ? `${typeDisplay} - ${description}`
                    : typeDisplay;
            }

            case 'number':
            case 'integer': {
                let typeDisplay = type;

                // Add numeric constraints
                const minimum = schema.minimum as number;
                const maximum = schema.maximum as number;
                if (minimum !== undefined || maximum !== undefined) {
                    const constraints = [];
                    if (minimum !== undefined)
                        constraints.push(`min: ${minimum}`);
                    if (maximum !== undefined)
                        constraints.push(`max: ${maximum}`);
                    typeDisplay += ` [${constraints.join(', ')}]`;
                }

                return description
                    ? `${typeDisplay} - ${description}`
                    : typeDisplay;
            }

            case 'boolean':
                return description ? `boolean - ${description}` : 'boolean';

            case 'null':
                return description ? `null - ${description}` : 'null';

            case 'array': {
                const items = schema.items as Record<string, unknown>;

                if (!items) {
                    return description ? `array - ${description}` : 'array';
                }

                // 🚀 Use extractTypeName for better type names in arrays of objects
                let itemType: string;
                if (items.type === 'object' && items.properties) {
                    const typeName = this.extractTypeName(items);
                    itemType = typeName;
                } else {
                    itemType = this.formatSchemaType(
                        items,
                        depth,
                        showRequiredMarkers,
                    );
                }

                const arrayType = `${itemType}[]`;

                // Add array constraints
                const minItems = schema.minItems as number;
                const maxItems = schema.maxItems as number;
                let constraints = '';
                if (minItems !== undefined || maxItems !== undefined) {
                    const constraintList = [];
                    if (minItems !== undefined)
                        constraintList.push(`min: ${minItems}`);
                    if (maxItems !== undefined)
                        constraintList.push(`max: ${maxItems}`);
                    constraints = ` [${constraintList.join(', ')}]`;
                }

                return description
                    ? `${arrayType}${constraints} - ${description}`
                    : `${arrayType}${constraints}`;
            }

            case 'object': {
                const properties = schema.properties as Record<string, unknown>;
                const required = (schema.required as string[]) || [];

                if (!properties || Object.keys(properties).length === 0) {
                    const typeName = this.extractTypeName(schema);
                    return description
                        ? `${typeName} - ${description}`
                        : typeName;
                }

                // 🚀 Build object structure with meaningful type names
                const lines: string[] = [];
                const typeName = this.extractTypeName(schema);
                const objectHeader = description
                    ? `${typeName} - ${description}`
                    : typeName;
                lines.push(`${objectHeader} {`);

                for (const [propName, propSchema] of Object.entries(
                    properties,
                )) {
                    const isRequired = required.includes(propName);
                    const requiredMark = showRequiredMarkers
                        ? isRequired
                            ? ' (required)'
                            : ' (optional)'
                        : '';
                    const propType = this.formatSchemaType(
                        propSchema as Record<string, unknown>,
                        depth + 1,
                        showRequiredMarkers,
                    );

                    lines.push(
                        `${indent}    ${propName}: ${propType}${requiredMark}`,
                    );
                }

                lines.push(`${indent}}`);
                return lines.join('\n' + indent);
            }

            default: {
                // 🎯 Handle special cases and union types
                if (schema.oneOf || schema.anyOf || schema.allOf) {
                    return this.formatUnionTypes(
                        schema,
                        depth,
                        showRequiredMarkers,
                    );
                }

                // Handle schema with direct properties (object without explicit type)
                if (schema.properties) {
                    return this.formatSchemaType(
                        { ...schema, type: 'object' },
                        depth,
                        showRequiredMarkers,
                    );
                }

                // Fallback
                return description ? `unknown - ${description}` : 'unknown';
            }
        }
    }

    /**
     * 🚀 Format union types (oneOf, anyOf, allOf)
     */
    private formatUnionTypes(
        schema: Record<string, unknown>,
        depth: number,
        showRequiredMarkers: boolean = true,
    ): string {
        const oneOf = schema.oneOf as Record<string, unknown>[];
        const anyOf = schema.anyOf as Record<string, unknown>[];
        const allOf = schema.allOf as Record<string, unknown>[];

        if (oneOf && oneOf.length > 0) {
            const types = oneOf.map((s) =>
                this.formatSchemaType(s, depth, showRequiredMarkers),
            );
            return `(${types.join(' | ')})`;
        }

        if (anyOf && anyOf.length > 0) {
            const types = anyOf.map((s) =>
                this.formatSchemaType(s, depth, showRequiredMarkers),
            );
            return `(${types.join(' | ')})`;
        }

        if (allOf && allOf.length > 0) {
            const types = allOf.map((s) =>
                this.formatSchemaType(s, depth, showRequiredMarkers),
            );
            return `(${types.join(' & ')})`;
        }

        return 'union';
    }

    /**
     * 🚀 Extract precise type name from JSON Schema or Zod Schema
     * Uses structured schema information instead of pattern matching
     */
    private extractTypeName(schema: Record<string, unknown>): string {
        // 🎯 JSON Schema: Use standard fields (highest priority)

        // 1. title field (explicit type name)
        if (schema.title && typeof schema.title === 'string') {
            return schema.title;
        }

        // 2. $ref (reference to definition)
        if (schema.$ref && typeof schema.$ref === 'string') {
            // Extract type name from $ref like "#/definitions/User" → "User"
            const refMatch = schema.$ref.match(/\/([^\/]+)$/);
            if (refMatch && refMatch[1]) {
                return refMatch[1];
            }
        }

        // 3. $id (schema identifier)
        if (schema.$id && typeof schema.$id === 'string') {
            // Extract from URI-like IDs
            const idMatch = schema.$id.match(/([^\/]+)\.json?$/);
            if (idMatch && idMatch[1]) {
                return this.capitalize(idMatch[1]);
            }
        }

        // 4. definitions key (when schema contains definitions)
        if (schema.definitions && typeof schema.definitions === 'object') {
            const definitions = schema.definitions as Record<string, unknown>;
            const defKeys = Object.keys(definitions);
            if (defKeys.length === 1 && defKeys[0]) {
                return defKeys[0]; // Single definition, likely the main type
            }
        }

        // 🎯 Zod Schema: Extract from Zod type information
        if (this.isZodSchema(schema)) {
            return this.extractFromZodSchema(schema);
        }

        // 🎯 OpenAPI/Swagger: Extract from component schemas
        if (
            schema.components &&
            typeof schema.components === 'object' &&
            (schema.components as Record<string, unknown>).schemas &&
            typeof (schema.components as Record<string, unknown>).schemas ===
                'object'
        ) {
            const schemas = (schema.components as Record<string, unknown>)
                .schemas as Record<string, unknown>;
            const schemaKeys = Object.keys(schemas);
            if (schemaKeys.length === 1 && schemaKeys[0]) {
                return schemaKeys[0];
            }
        }

        // 🎯 Schema-agnostic fallback: use only structural information

        // 🎯 Fallback: Use type field or generic names
        const type = schema.type as string;
        switch (type) {
            case 'object':
                return 'Object';
            case 'array':
                return 'Array';
            case 'string':
                return 'String';
            case 'number':
            case 'integer':
                return 'Number';
            case 'boolean':
                return 'Boolean';
            default:
                return 'Object';
        }
    }

    /**
     * 🔍 Detect if schema contains Zod-specific information
     */
    private isZodSchema(schema: Record<string, unknown>): boolean {
        return !!(
            schema._def ||
            schema.parse ||
            schema.safeParse ||
            (schema.constructor && schema.constructor.name.includes('Zod'))
        );
    }

    /**
     * 🚀 Extract type information from Zod Schema
     */
    private extractFromZodSchema(schema: Record<string, unknown>): string {
        // Try to extract from Zod _def
        const def = schema._def as { typeName?: string };
        if (def?.typeName) {
            // Convert ZodString → String, ZodObject → Object, etc.
            return def.typeName.replace(/^Zod/, '');
        }

        // Fallback for Zod schemas
        return 'Object';
    }

    /**
     * 🔧 Utility: Capitalize first letter
     */
    private capitalize(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Enhanced tool parameters formatting with better structure
     */
    private formatToolParametersEnhanced(tool: ToolMetadataForLLM): string {
        if (!tool.parameters?.properties) {
            return '';
        }

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

            // Handle arrays
            if (
                typeDisplay === 'array' &&
                (propObj as Record<string, unknown>).items
            ) {
                const items = (propObj as Record<string, unknown>)
                    .items as Record<string, unknown>;
                if (items.type === 'object' && items.properties) {
                    const itemKeys = Object.keys(
                        items.properties as Record<string, unknown>,
                    );
                    if (itemKeys.length > 0) {
                        typeDisplay = `array<object{${itemKeys.join(',')}}>`;
                    } else {
                        typeDisplay = 'array<object>';
                    }
                } else if (items.type) {
                    // Check if items has enum
                    if (items.enum && Array.isArray(items.enum)) {
                        const enumValues = items.enum as unknown[];
                        typeDisplay = `array<enum[${enumValues.join('|')}]>`;
                    } else {
                        typeDisplay = `array<${items.type as string}>`;
                    }
                } else {
                    typeDisplay = 'array';
                }
            }

            // Handle complex types
            if (typeDisplay === 'object' && propObj.properties) {
                const propKeys = Object.keys(propObj.properties);
                if (propKeys.length > 0) {
                    typeDisplay = `object{${propKeys.join(',')}}`;
                }
            }

            // Handle enums with detailed formatting
            if (propObj.enum && Array.isArray(propObj.enum)) {
                const enumValues = propObj.enum as unknown[];
                const formattedValues = enumValues
                    .map((v) => `"${v}"`)
                    .join(' | ');
                typeDisplay = `(${formattedValues})`;
            }

            // Handle anyOf (unions)
            if ((propObj as Record<string, unknown>).anyOf) {
                typeDisplay = 'union';
            }

            // Handle specific formats
            if (propObj.format) {
                typeDisplay = `${typeDisplay}:${propObj.format}`;
            }

            // Handle nullable
            if ((propObj as Record<string, unknown>).nullable) {
                typeDisplay = `${typeDisplay} | null`;
            }

            // Handle default
            if ((propObj as Record<string, unknown>).default !== undefined) {
                typeDisplay = `${typeDisplay} (default: ${(propObj as Record<string, unknown>).default})`;
            }

            const marker = isRequired ? 'REQUIRED' : 'OPTIONAL';
            const paramLine = `- ${name} (${typeDisplay}, ${marker})${
                propObj.description ? `: ${propObj.description}` : ''
            }`;

            paramStrings.push(paramLine);

            // Handle array of objects - show nested properties
            if (
                typeDisplay.startsWith('array<object{') &&
                (propObj as Record<string, unknown>).items
            ) {
                const items = (propObj as Record<string, unknown>)
                    .items as Record<string, unknown>;
                if (items.type === 'object' && items.properties) {
                    const nestedProps = items.properties as Record<
                        string,
                        unknown
                    >;
                    const nestedRequired = (items.required as string[]) || [];

                    for (const [nestedName, nestedProp] of Object.entries(
                        nestedProps,
                    )) {
                        const nestedPropObj = nestedProp as {
                            type?: string;
                            description?: string;
                            enum?: unknown[];
                        };

                        let nestedTypeDisplay = nestedPropObj.type || 'unknown';

                        // Handle nested enums in array items
                        if (
                            nestedPropObj.enum &&
                            Array.isArray(nestedPropObj.enum)
                        ) {
                            const nestedEnumValues =
                                nestedPropObj.enum as unknown[];
                            nestedTypeDisplay = `enum[${nestedEnumValues.join(
                                '|',
                            )}]`;
                        }

                        const isNestedRequired =
                            nestedRequired.includes(nestedName);
                        const nestedMarker = isNestedRequired
                            ? 'REQUIRED'
                            : 'OPTIONAL';

                        const nestedLine = `    - ${nestedName} (${nestedTypeDisplay}, ${nestedMarker})${
                            nestedPropObj.description
                                ? `: ${nestedPropObj.description}`
                                : ''
                        }`;
                        paramStrings.push(nestedLine);
                    }
                }
            }

            // Handle nested object properties
            if (typeDisplay.startsWith('object{') && propObj.properties) {
                const nestedProps = propObj.properties as Record<
                    string,
                    unknown
                >;

                // Check if this object has a required array
                const nestedRequired =
                    ((propObj as Record<string, unknown>)
                        .required as string[]) || [];

                for (const [nestedName, nestedProp] of Object.entries(
                    nestedProps,
                )) {
                    const nestedPropObj = nestedProp as {
                        type?: string;
                        description?: string;
                        enum?: unknown[];
                    };

                    let nestedTypeDisplay = nestedPropObj.type || 'unknown';

                    // Handle nested arrays
                    if (
                        nestedTypeDisplay === 'array' &&
                        (nestedPropObj as Record<string, unknown>).items
                    ) {
                        const items = (nestedPropObj as Record<string, unknown>)
                            .items as Record<string, unknown>;
                        if (items.type === 'object' && items.properties) {
                            const itemKeys = Object.keys(
                                items.properties as Record<string, unknown>,
                            );
                            if (itemKeys.length > 0) {
                                nestedTypeDisplay = `array<object{${itemKeys.join(',')}}>`;
                            } else {
                                nestedTypeDisplay = 'array<object>';
                            }
                        } else if (items.type) {
                            // Check if items has enum
                            if (items.enum && Array.isArray(items.enum)) {
                                const enumValues = items.enum as unknown[];
                                nestedTypeDisplay = `array<enum[${enumValues.join('|')}]>`;
                            } else {
                                nestedTypeDisplay = `array<${items.type as string}>`;
                            }
                        } else {
                            nestedTypeDisplay = 'array';
                        }
                    }

                    // Handle nested enums
                    if (
                        nestedPropObj.enum &&
                        Array.isArray(nestedPropObj.enum)
                    ) {
                        const nestedEnumValues =
                            nestedPropObj.enum as unknown[];
                        nestedTypeDisplay = `enum[${nestedEnumValues.join(
                            '|',
                        )}]`;
                    }

                    const isNestedRequired =
                        nestedRequired.includes(nestedName);
                    const nestedMarker = isNestedRequired
                        ? 'REQUIRED'
                        : 'OPTIONAL';

                    const nestedLine = `    - ${nestedName} (${nestedTypeDisplay}, ${nestedMarker})${
                        nestedPropObj.description
                            ? `: ${nestedPropObj.description}`
                            : ''
                    }`;
                    paramStrings.push(nestedLine);

                    // ✅ ADDED: Handle nested array of objects - show nested properties
                    if (
                        nestedTypeDisplay.startsWith('array<object{') &&
                        (nestedPropObj as Record<string, unknown>).items
                    ) {
                        const items = (nestedPropObj as Record<string, unknown>)
                            .items as Record<string, unknown>;
                        if (items.type === 'object' && items.properties) {
                            const nestedArrayProps = items.properties as Record<
                                string,
                                unknown
                            >;
                            const nestedArrayRequired =
                                (items.required as string[]) || [];

                            for (const [
                                nestedArrayName,
                                nestedArrayProp,
                            ] of Object.entries(nestedArrayProps)) {
                                const nestedArrayPropObj = nestedArrayProp as {
                                    type?: string;
                                    description?: string;
                                    enum?: unknown[];
                                };

                                let nestedArrayTypeDisplay =
                                    nestedArrayPropObj.type || 'unknown';

                                // Handle nested array enums
                                if (
                                    nestedArrayPropObj.enum &&
                                    Array.isArray(nestedArrayPropObj.enum)
                                ) {
                                    const nestedArrayEnumValues =
                                        nestedArrayPropObj.enum as unknown[];
                                    nestedArrayTypeDisplay = `enum[${nestedArrayEnumValues.join(
                                        '|',
                                    )}]`;
                                }

                                const isNestedArrayRequired =
                                    nestedArrayRequired.includes(
                                        nestedArrayName,
                                    );
                                const nestedArrayMarker = isNestedArrayRequired
                                    ? 'REQUIRED'
                                    : 'OPTIONAL';

                                const nestedArrayLine = `        - ${nestedArrayName} (${nestedArrayTypeDisplay}, ${nestedArrayMarker})${
                                    nestedArrayPropObj.description
                                        ? `: ${nestedArrayPropObj.description}`
                                        : ''
                                }`;
                                paramStrings.push(nestedArrayLine);
                            }
                        }
                    }
                }
            }
        }

        return `Parameters:\n    ${paramStrings.join('\n    ')}`;
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
