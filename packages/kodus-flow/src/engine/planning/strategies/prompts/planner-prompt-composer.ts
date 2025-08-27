import {
    ComposedPrompt,
    PlannerPromptConfig,
    PromptCompositionContext,
    ToolMetadataForLLM,
} from '@/core/types/allTypes.js';
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
        const systemPrompt = this.composeSystemPrompt(
            context?.replanContext?.isReplan,
        );

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
    private composeSystemPrompt(isReplan = false): string {
        const sections: string[] = [];

        if (this.config.features?.includeUniversalPatterns !== false) {
            sections.push(this.getUniversalPlanningPatterns(isReplan));
        }

        const additionalPatterns = this.gatherAdditionalPatterns();
        if (additionalPatterns.length > 0) {
            sections.push(this.formatAdditionalPatterns(additionalPatterns));
        }

        return sections.join('\n\n');
    }

    /**
     * Compose the user prompt with context and dynamic hints
     */
    private composeUserPrompt(context: PromptCompositionContext): string {
        const sections: string[] = [];

        sections.push(this.getToolUsageInstructions());

        sections.push(this.formatAvailableTools(context.availableTools));

        if (context.memoryContext) {
            sections.push(`## 📋 CONTEXT\n${context.memoryContext.trim()}`);
        }

        if (context?.replanContext?.isReplan) {
            sections.push(
                this.formatReplanContext({
                    replanContext: context.replanContext,
                    isReplan: context.replanContext?.isReplan,
                }),
            );
        }

        if (
            context.additionalContext &&
            Object.keys(context.additionalContext).length > 0
        ) {
            sections.push(
                this.formatAdditionalContext(context.additionalContext),
            );
        }

        sections.push(`## 🎯 USER REQUEST\n"${context.goal}"`);

        sections.push(
            '## ✅ TASK\nCreate an executable plan using the available tools above.',
        );

        const finalPrompt = sections.join('\n\n');

        return finalPrompt;
    }

    /**
     * Instructions for using tools in the plan
     */
    private getToolUsageInstructions(): string {
        return `## 🔧 TOOL USAGE INSTRUCTIONS

### 📋 CRITICAL CONTRACT
- **NO PLACEHOLDERS**: Never invent IDs/strings. If required params missing → "plan": [] + NEEDS-INPUT
- **NO CONTEXT PATHS**: Inline resolved values, never "CONTEXT.foo.bar" in argsTemplate
- **NO ARRAY INDICES**: Never use [0], [1] inside {{...}} references
- **EXACT TOOL NAMES**: Match runtime tool names exactly (preserve dots/dashes/casing)

### 🎯 PARAMETER HANDLING
- **REQUIRED**: Must be present and valid. Add discovery step if missing
- **OPTIONAL**: Omit when unused (avoid null unless tool allows it)
- **TYPES**: Match exactly (booleans unquoted, numbers unquoted, strings quoted)
- **DATES**: ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)

### 🔄 VALUE SOURCES (Priority Order)
1. **CONTEXT** → Copy literal values directly
2. **{{step-id.result...}}** → Previous step outputs
3. **Literals** → Direct values

### 🛠️ TOOL SELECTION STRATEGY
- **Discovery tools**: list, search, get-all, find, discover
- **Read tools**: get, fetch, retrieve, show, display
- **Action tools**: create, update, delete, send, execute
- **Choose**: Most specific tool with fewest required params

### 📊 PLANNING PATTERNS
- **Minimal steps**: Only what's needed to achieve goal
- **Dependencies**: Use dependsOn for step ordering
- **Parallel**: Only for independent, read-only steps (MAX_FANOUT=5)

### ⚠️ COMMON MISTAKES TO AVOID
\`\`\`
❌ WRONG: "userId": "john" (assuming ID exists)
✅ RIGHT: find-user → use "{{find-user.result.id}}"

❌ WRONG: "{{list.items[0].id}}" (array index)
✅ RIGHT: select-item → use "{{select-item.result.id}}"

❌ WRONG: "{{CONTEXT.user.id}}" (context path)
✅ RIGHT: "abc123" (copy literal value)
\`\`\`

### 🔍 AUDIT REQUIREMENTS
For each step, include:
- **AUDIT:INPUTS** - Source of every required param (CONTEXT | {{step-id.result...}} | literal)
- **AUDIT:TOOL** - Why this tool was selected (1-line reason)
- **AUDIT:ALTERNATIVE** - Why alternatives weren't chosen (if applicable)

### 🚨 VIOLATION HANDLING & SIGNALS

**NEEDS-INPUT:<param>** - Use when user must provide data
- **When**: Required parameter cannot be discovered from CONTEXT or tools
- **Example**: User asks "Send message to John" but no discovery tool exists for "John"
- **Response**: "plan": [], "signals": { "needs": ["user-identifier"] }

**NO-DISCOVERY-PATH:<param>** - Use when no tool can find required data
- **When**: Required parameter exists but no discovery tool available
- **Example**: Need "contextId" but no list-contexts or search-contexts tool exists
- **Response**: "plan": [], "signals": { "noDiscoveryPath": ["contextId"] }

**VIOLATION:UNRESOLVED-CONTEXT-PATH** - Use when CONTEXT path appears in output
- **When**: You accidentally output "CONTEXT.foo.bar" instead of resolved value
- **Example**: argsTemplate: { "userId": "{{CONTEXT.user.id}}" } ❌
- **Correct**: argsTemplate: { "userId": "abc123" } ✅ (if CONTEXT has {"user":{"id":"abc123"}})

**VIOLATION:UNRESOLVED-TEMPLATING** - Use when invalid template syntax
- **When**: Template reference is malformed or references non-existent step
- **Example**: argsTemplate: { "id": "{{step-that-doesnt-exist.result.id}}" } ❌
- **Correct**: argsTemplate: { "id": "{{discover-context.result.id}}" } ✅

**VIOLATION:UNKNOWN-TOOL** - Use when tool name doesn't exist
- **When**: Tool name doesn't match any available runtime tool
- **Example**: "tool": "create-super-item" but only "create-item" exists
- **Correct**: Use exact tool name from available tools list

### ✅ SELF-CHECK CHECKLIST
1. ✅ Raw JSON output (no prose/fences)
2. ✅ argsTemplate has only literals or {{step-id.result...}}
3. ✅ No "CONTEXT." anywhere in values
4. ✅ No array indices in {{...}} references
5. ✅ Tool names match exactly
6. ✅ Numbers/booleans correctly typed
7. ✅ No backticks/Markdown in strings
8. ✅ MAX_STEPS=12, MAX_FANOUT=5 respected`;
    }

    /**
     * Universal planning patterns that work with any domain
     */
    private getUniversalPlanningPatterns(isReplan = false): string {
        return `# System
You are an intelligent planning agent that creates executable plans using runtime tools.

## 🎯 CORE MISSION
**First, understand the user's intent deeply. Then, create the minimal plan that achieves their goal.**

## 🔍 INTENT ANALYSIS FRAMEWORK
Before creating any plan, analyze the user's request:

1. **What is the user trying to accomplish?** (goal)
2. **What would success look like?** (success criteria)
3. **What information do they need?** (data requirements)
4. **What actions are required?** (operations needed)
5. **What constraints exist?** (limitations/context)

**Only proceed with planning after you understand the intent clearly.**

## 📋 STRICT OUTPUT CONTRACT
- Return ONLY raw JSON matching the Output Schema
- No prose, no Markdown, no code fences
- First character MUST be "{" and last MUST be "}"
- Inside strings, use "\\n" for newlines, never code fences

## 🚫 CRITICAL RULES
- **DISCOVERY FIRST**: If data not in CONTEXT, use discovery tools (list/search/get-all) to find it${isReplan ? '\n- **REPLAN INTELLIGENCE**: When this is a replan attempt, analyze previous execution results and learn from them' : ''}

## 🎯 PLANNING PRINCIPLES

### P1: Intent-First Planning
User: "Show me the latest changes in my context"
Intent Analysis:
- Goal: View recent modifications/updates
- Success: See list of recent changes with details
- Data: Context info, change history
- Actions: List/fetch changes
- Constraints: Current user's context

### P0: Data Discovery Strategy
**When data is missing from CONTEXT:**
1. **Identify what you need** based on intent analysis
2. **Look for discovery tools** that can find this data
3. **Use discovery tools first** before any action tools
4. **Examples of discovery patterns:**
   - Need user ID → use find-person, search-people, list-people
   - Need context ID → use discover-context, list-contexts
   - Need valid options → use list-options, get-options, list-statuses
   - Need specific data → use search-items, get-by-name

### P2: Discovery → Action Pattern
1. **Check CONTEXT first** - if data exists, use it directly (Priority 1)
2. **Use discovery tools** (list/search/get-all) to find missing data (Priority 2)
3. **Use discovered data** for targeted operations (Priority 3)
4. **Never assume any data exists** - always discover or ask for input

### P5: Multiple Approach Strategy
**When multiple tools can achieve the same intent:**
1. **Prefer simpler tools** - fewer steps, fewer required params
2. **Prefer direct tools** - if direct action exists, use it over discovery+action
3. **Prefer validated tools** - if validation tools exist, use them for safety
4. **Consider user intent** - what would be most helpful for the user?
5. **Check available tools** - only use tools that actually exist
6. **Examples:**
   - Direct: send-message vs Discovery+Action: find-person + send-message
   - Simple: list-items vs Complex: get-current-user + list-user-items
   - Validated: create-from-template vs Basic: create-item

**Decision making process:**
1. **List all possible approaches** based on available tools
2. **Eliminate approaches** that don't match user intent
3. **Rank remaining approaches** by simplicity and effectiveness
4. **Choose the best approach** that balances simplicity with user needs${
            isReplan
                ? `

### P6: Replan Intelligence Strategy
**When this is a replan attempt (you'll see "🔄 Previous Execution Results" in context):**

1. **Analyze Previous Execution:**
   - Review what succeeded and what failed
   - Understand the failure patterns and primary causes
   - Identify preserved steps that can be reused

2. **Learn from Failures:**
   - **Failed Steps**: Don't repeat the same approach that failed
   - **Failure Patterns**: Avoid similar patterns (auth errors, permission issues, etc.)
   - **Primary Cause**: Address the root cause, not just symptoms

3. **Reuse Successes:**
   - **Preserved Steps**: If steps succeeded, consider reusing their results
   - **Working Patterns**: Use approaches that worked in previous attempts
   - **Validated Data**: Use data that was successfully retrieved

4. **Adapt Strategy:**
   - **Different Approach**: Try alternative tools or methods
   - **Better Discovery**: Use more robust discovery patterns
   - **Error Handling**: Add validation or error-checking steps
   - **Simplified Plan**: Reduce complexity if previous plan was too ambitious

5. **Replan Decision Making:**
   - **Keep What Works**: Preserve successful steps and their results
   - **Fix What Broke**: Address specific failure points
   - **Simplify If Needed**: Reduce plan complexity to avoid cascading failures
   - **Add Validation**: Include checks to prevent similar failures

**Example Replan Analysis:**
Previous: 5 steps, 2 succeeded, 3 failed
- ✅ Steps 1-2: User discovery and validation (PRESERVE)
- ❌ Steps 3-5: Permission operations (FAILED - auth issues)

Replan Strategy:
1. Reuse successful user data from steps 1-2
2. Add permission check before operations
3. Use alternative permission-granting approach
4. Simplify to 3 steps instead of 5
                `
                : ''
        }

## 📚 PRACTICAL EXAMPLES

### Example 1: Data Retrieval Pattern
User: "Show me recent activity"
Intent: View recent data/activity
Plan:
1. discover-context (get current context)
2. list-items (using context ID, limit=10)

### Example 2: Communication Pattern (Multiple Approaches)
User: "Send a message to John"
Intent: Send communication to specific person

**Approach A - Direct messaging:**
1. find-person (name="John") → get target ID
2. send-message (targetId=result, content="...")

**Approach B - Channel-based messaging:**
1. find-person (name="John") → get target ID
2. get-channel (targetId=result) → get channel ID
3. send-message (channelId=result, content="...")

**Approach C - Broadcast messaging:**
1. send-broadcast (recipients=["John"], content="...")

**Selection Guidelines:**
- **Use Approach A** if direct messaging is available and preferred
- **Use Approach B** if channel-based messaging is the standard
- **Use Approach C** if you need to reach multiple people or broadcast
- **Check available tools** and user preferences in CONTEXT

### Example 3: Data Discovery Pattern (Multiple Tools)
User: "Show me all my items"
Intent: List all user's items

**Approach A - Direct listing:**
1. list-items (no params needed if user in context)

**Approach B - User context needed:**
1. get-current-user → get user ID
2. list-user-items (userId=result)

**Approach C - Search-based:**
1. search-items (query="my items")

**Selection Guidelines:**
- **Use Approach A** if user context is already available
- **Use Approach B** if you need to get user info first
- **Use Approach C** if you need to search/filter items
- **Check CONTEXT** for user information and available tools

### Example 4: Creation Pattern (Multiple Strategies)
User: "Create a new item about the issue I found"
Intent: Create item with issue details

**Approach A - Simple creation:**
1. discover-context (get current context)
2. create-item (parentId=result, title="Issue Report", description="...")

**Approach B - Template-based creation:**
1. discover-context (get current context)
2. list-templates (parentId=result) → get available templates
3. create-from-template (parentId=result, templateId=result, title="Issue Report")

**Approach C - Categorized creation:**
1. discover-context (get current context)
2. list-categories (parentId=result) → get valid categories
3. create-categorized-item (parentId=result, categoryId=result, title="Issue Report")

**Selection Guidelines:**
- **Use Approach A** if you just need to create a basic item quickly
- **Use Approach B** if templates exist and you want structured items
- **Use Approach C** if categorization is important for organization
- **Check available tools** and pick the approach that matches your tools

## 🎯 EXCEPTIONS & EDGE CASES

### Conversational Requests
User: "Hello" or "Thanks"
Response: { "plan": [], "signals": { "needs": [] } }

### Context-Only Requests
User: "What's my name?" (if name in CONTEXT)
Response: { "plan": [], "signals": { "needs": [] } }

### Missing Discovery Path
User: "Send notification to unknown-user"
Response: {
  "plan": [],
  "signals": {
    "noDiscoveryPath": ["user-identifier"],
    "suggestedNextStep": "Please provide the user's name or ID"
  }
}

## 📊 OUTPUT SCHEMA
\`\`\`json
{
  "schema_version": 1,
  "strategy": "plan-then-execute",
  "goal": "<clear statement of user intent>",
  "plan": [
    {
      "id": "<kebab-case-step-id>",
      "description": "<what this step accomplishes>",
      "tool": "<exact runtime tool name>",
      "argsTemplate": { "<param>": "<literal | {{step-id.result.<path>}}>" },
      "dependsOn": ["<step-ids>"],
      "parallel": true
    }
  ],
  "signals": {
    "needs": ["<param>", "..."],
    "noDiscoveryPath": ["<id-name>", "..."],
    "errors": ["<short message>", "..."],
    "suggestedNextStep": "<one sentence that unblocks the user>"
  },
  "audit": [
    "AUDIT:INPUTS <step-id> - <param>=<CONTEXT|{{step-id.result...}}|literal>, ...",
    "AUDIT: <toolName> selected - <1-line reason from description>",
    "AUDIT: <altToolName> not_selected - <short reason>"
  ]
}\`\`\`
`;
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
        return `## 🔧 DOMAIN-SPECIFIC PATTERNS\n${patterns.map((pattern, i) => `${i + 1}. ${pattern}`).join('\n')}`;
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
        const sections: string[] = ['## 🛠️ AVAILABLE TOOLS'];

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
                return '## 🛠️ AVAILABLE TOOLS\n[Error parsing tools]';
            }
        } else {
            toolsArray = tools;
        }

        toolsArray.forEach((tool, index) => {
            sections.push(
                `### ${index + 1}. ${tool.name}\n${tool.description}`,
            );

            if (tool.parameters?.properties) {
                const params = this.formatToolParametersEnhanced({
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                } as ToolMetadataForLLM);
                if (params) {
                    sections.push(params);
                }
            }

            // Add output schema if available
            if (tool.outputSchema?.properties) {
                const outputFormat = this.formatOutputSchema(
                    tool.outputSchema,
                    tool.name,
                );

                if (outputFormat) {
                    sections.push(outputFormat);
                }
            }

            sections.push(''); // Add spacing between tools
        });

        return sections.join('\n');
    }

    /**
     * 🚀 Universal output schema formatter - handles ALL JSON Schema types
     * Supports: primitives, objects, arrays, enums, nested structures
     * Detects wrapper patterns and extracts meaningful data
     */
    private formatOutputSchema(
        outputSchema: Record<string, unknown>,
        toolName?: string,
    ): string {
        if (!outputSchema) {
            return '';
        }

        const unwrapped = this.unwrapOutputSchema(outputSchema);

        if (this.isEmptyOutputSchema(unwrapped)) {
            return '';
        }

        const formatted = this.formatSchemaType(unwrapped, 0, false);
        if (!formatted) {
            return '';
        }

        if (this.isGenericTypeOnly(formatted)) {
            return '';
        }

        const toolSuffix = toolName ? ` (from ${toolName})` : '';
        return `\n  Returns: ${formatted}${toolSuffix}`;
    }

    private isEmptyOutputSchema(schema: Record<string, unknown>): boolean {
        if (!schema || Object.keys(schema).length === 0) {
            return true;
        }

        if (schema.type === 'object') {
            const properties = schema.properties as Record<string, unknown>;
            if (!properties || Object.keys(properties).length === 0) {
                return true;
            }
        }

        return false;
    }

    private isGenericTypeOnly(formatted: string): boolean {
        const trimmed = formatted.trim();

        const genericTypes = [
            'Object',
            'Array',
            'string',
            'number',
            'boolean',
            'any',
        ];

        return genericTypes.includes(trimmed);
    }

    private unwrapOutputSchema(
        schema: Record<string, unknown>,
    ): Record<string, unknown> {
        if (schema.type !== 'object' || !schema.properties) {
            return schema;
        }

        const properties = schema.properties as Record<string, unknown>;
        const propNames = Object.keys(properties);

        if (
            propNames.includes('data') &&
            (propNames.includes('success') || propNames.includes('count'))
        ) {
            const dataField = properties.data as Record<string, unknown>;
            if (dataField) {
                return dataField;
            }
        }

        if (propNames.length === 1 && propNames[0] === 'data') {
            const dataField = properties.data as Record<string, unknown>;
            if (dataField) {
                return dataField;
            }
        }

        if (propNames.includes('results') && propNames.length <= 3) {
            const resultsField = properties.results as Record<string, unknown>;
            if (resultsField) {
                return resultsField;
            }
        }

        return schema;
    }

    private formatSchemaType(
        schema: Record<string, unknown>,
        depth: number = 0,
        showRequiredMarkers: boolean = true,
    ): string {
        if (!schema) {
            return 'unknown';
        }

        const indent = '    '.repeat(depth);
        const type = schema.type as string;
        const description = schema.description as string;
        const enumValues = schema.enum as unknown[];

        if (enumValues && enumValues.length > 0) {
            const values = enumValues.map((v) => `"${v}"`).join(' | ');
            const enumType = `(${values})`;
            return description ? `${enumType} - ${description}` : enumType;
        }

        switch (type) {
            case 'string': {
                const format = schema.format as string;
                let typeDisplay = 'string';

                if (format) {
                    typeDisplay += ` (${format})`;
                }

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

                let itemType: string;
                if (items.type === 'object' && items.properties) {
                    const fullStructure = this.formatSchemaType(
                        items,
                        depth,
                        showRequiredMarkers,
                    );
                    itemType = fullStructure;
                } else {
                    itemType = this.formatSchemaType(
                        items,
                        depth,
                        showRequiredMarkers,
                    );
                }

                const arrayType = `${itemType}[]`;

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
                return lines.join('\n');
            }

            default: {
                if (schema.oneOf || schema.anyOf || schema.allOf) {
                    return this.formatUnionTypes(
                        schema,
                        depth,
                        showRequiredMarkers,
                    );
                }

                if (schema.properties) {
                    return this.formatSchemaType(
                        { ...schema, type: 'object' },
                        depth,
                        showRequiredMarkers,
                    );
                }

                return description ? `unknown - ${description}` : 'unknown';
            }
        }
    }

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

    private extractTypeName(schema: Record<string, unknown>): string {
        if (schema.title && typeof schema.title === 'string') {
            return schema.title;
        }

        if (schema.$ref && typeof schema.$ref === 'string') {
            const refMatch = schema.$ref.match(/\/([^\/]+)$/);
            if (refMatch && refMatch[1]) {
                return refMatch[1];
            }
        }

        if (schema.$id && typeof schema.$id === 'string') {
            const idMatch = schema.$id.match(/([^\/]+)\.json?$/);
            if (idMatch && idMatch[1]) {
                return this.capitalize(idMatch[1]);
            }
        }

        if (schema.definitions && typeof schema.definitions === 'object') {
            const definitions = schema.definitions as Record<string, unknown>;
            const defKeys = Object.keys(definitions);
            if (defKeys.length === 1 && defKeys[0]) {
                return defKeys[0];
            }
        }

        if (this.isZodSchema(schema)) {
            return this.extractFromZodSchema(schema);
        }

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

    private isZodSchema(schema: Record<string, unknown>): boolean {
        return !!(
            schema._def ||
            schema.parse ||
            schema.safeParse ||
            (schema.constructor && schema.constructor.name.includes('Zod'))
        );
    }

    private extractFromZodSchema(schema: Record<string, unknown>): string {
        const def = schema._def as { typeName?: string };
        if (def?.typeName) {
            return def.typeName.replace(/^Zod/, '');
        }

        return 'Object';
    }

    private capitalize(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

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

        if (paramStrings.length === 0) {
            return '';
        }

        return `Parameters:\n    ${paramStrings.join('\n    ')}`;
    }

    /**
     * Format additional context section with better structure (user-provided info only)
     */
    private formatAdditionalContext(
        additionalContext: Record<string, unknown>,
    ): string {
        const sections: string[] = ['## 🔍 ADDITIONAL INFO'];

        // ✅ SIMPLES: JSON.stringify em tudo
        const formatValue = (value: unknown): string => {
            if (value === null) return 'null';
            if (value === undefined) return 'undefined';
            return JSON.stringify(value, null, 2);
        };

        // Handle user context generically
        if (additionalContext.userContext) {
            const userCtx = additionalContext.userContext as Record<
                string,
                unknown
            >;
            sections.push('### 👤 USER CONTEXT');

            // Process all user context fields dynamically
            Object.entries(userCtx).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    sections.push(`**${key}:** ${formatValue(value)}`);
                }
            });
        }

        // Handle agent identity generically
        if (additionalContext.agentIdentity) {
            const identity = additionalContext.agentIdentity as Record<
                string,
                unknown
            >;
            sections.push('### 🤖 AGENT IDENTITY');

            // Process all agent identity fields dynamically
            Object.entries(identity).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    sections.push(`**${key}:** ${formatValue(value)}`);
                }
            });
        }

        return sections.join('\n');
    }

    /**
     * Format replan context section
     */
    private formatReplanContext(
        additionalContext: Record<string, unknown>,
    ): string {
        const sections: string[] = ['## 🔄 REPLAN CONTEXT'];

        if (additionalContext.replanContext) {
            const replan = additionalContext.replanContext as Record<
                string,
                unknown
            >;

            if (replan.executedPlan) {
                const executedPlan = replan.executedPlan as Record<
                    string,
                    unknown
                >;
                const plan = executedPlan.plan as Record<string, unknown>;

                sections.push('### 📋 EXECUTED PLAN');
                if (plan.id) {
                    sections.push(`**Plan ID:** ${plan.id}`);
                }

                const executionData = executedPlan.executionData as Record<
                    string,
                    unknown
                >;

                if (executionData) {
                    sections.push('###EXECUTION DATA');

                    const toolsThatWorked =
                        executionData.toolsThatWorked as unknown[];
                    if (toolsThatWorked && toolsThatWorked.length > 0) {
                        toolsThatWorked.forEach((tool: unknown) => {
                            const toolData = tool as Record<string, unknown>;
                            const toolName = toolData.tool || toolData.stepId;
                            const description =
                                toolData.description || 'No description';
                            const result = toolData.result || 'No result';

                            sections.push(`  - ${toolName}: ${description}`);
                            sections.push(
                                `    Result: ${typeof result === 'string' ? result : JSON.stringify(result)}`,
                            );
                        });
                    }

                    const toolsThatFailed =
                        executionData.toolsThatFailed as unknown[];
                    if (toolsThatFailed && toolsThatFailed.length > 0) {
                        sections.push(
                            `**Failed Tools:** ${toolsThatFailed.length}`,
                        );
                        toolsThatFailed.forEach((tool: unknown) => {
                            const toolData = tool as Record<string, unknown>;
                            sections.push(
                                `  - ${toolData.tool || toolData.stepId}: ${toolData.error || 'Unknown error'}`,
                            );
                        });
                    }

                    const toolsNotExecuted =
                        executionData.toolsNotExecuted as unknown[];
                    if (toolsNotExecuted && toolsNotExecuted.length > 0) {
                        sections.push(
                            `**Not Executed:** ${toolsNotExecuted.length}`,
                        );
                        toolsNotExecuted.forEach((tool: unknown) => {
                            const toolData = tool as Record<string, unknown>;
                            sections.push(
                                `  - ${toolData.tool || toolData.stepId}: ${toolData.description || 'No description'}`,
                            );
                        });
                    }
                }

                const signals = executedPlan.signals as Record<string, unknown>;
                if (signals) {
                    const failurePatterns = signals.failurePatterns as string[];
                    const needs = signals.needs as string[];
                    const suggestedNextStep = signals.suggestedNextStep;

                    if (
                        (failurePatterns && failurePatterns.length > 0) ||
                        (needs && needs.length > 0) ||
                        suggestedNextStep
                    ) {
                        sections.push('### 🚨 SIGNALS ANALYSIS');

                        if (failurePatterns && failurePatterns.length > 0) {
                            sections.push(
                                `**Failure Patterns:** ${failurePatterns.join(', ')}`,
                            );
                        }

                        if (needs && needs.length > 0) {
                            sections.push(`**Needs:** ${needs.join(', ')}`);
                        }

                        if (suggestedNextStep) {
                            sections.push(
                                `**Suggested Next Step:** ${suggestedNextStep}`,
                            );
                        }
                    }
                }
            }

            // 📚 Plan History
            if (replan.planHistory && Array.isArray(replan.planHistory)) {
                const history = replan.planHistory as Array<
                    Record<string, unknown>
                >;
                if (history.length > 0) {
                    sections.push('### 📚 PLAN HISTORY');
                    sections.push(`**Previous Attempts:** ${history.length}`);

                    history.forEach((planData, index) => {
                        const plan = planData.plan as Record<string, unknown>;
                        sections.push(
                            `\n**Attempt ${index + 1}:** ${plan.id || 'Unknown Plan'}`,
                        );
                        if (plan.goal) sections.push(`  Goal: "${plan.goal}"`);

                        const signals = planData.signals as Record<
                            string,
                            unknown
                        >;
                        if (signals?.primaryCause) {
                            sections.push(`  Failed: ${signals.primaryCause}`);
                        }
                    });
                }
            }
        }

        sections.push(
            '\n**⚠️ REPLAN MODE:** Use the preserved results and failure analysis to create a better plan.',
        );
        return sections.join('\n');
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
        return Math.ceil(text.length / 4);
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
