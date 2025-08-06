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

        if (this.config.features?.includeUniversalPatterns !== false) {
            sections.push(this.getUniversalPlanningPatterns());
        }

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
        return `
## TOOL USAGE INSTRUCTIONS

**1) PARAMS & TYPES**
- REQUIRED params must be present and valid. If anything essential is missing, insert a prior discovery step.
- OPTIONAL params: omit when unused (don’t send \`null\` unless the tool explicitly allows it).
- Types: match the tool spec exactly (string/number/boolean). Don’t coerce.
- Dates: ISO 8601 (\`YYYY-MM-DD\` or \`YYYY-MM-DDTHH:mm:ssZ\`).

**Sources of values (highest priority first):**
1. **CONTEXT** → if the final value is present, **do not** call a tool.
2. **Previous step results** → \`{{step-id.result...}}\`.
3. **Direct literals**.

**2) TOOL SELECTION**
- Choose by **verb + entity + return type** (e.g., *list items* → \`objects[]\`, *get details* → \`object\`, *update* → mutation result).
- If multiple tools fit, choose the **most specific** with **fewer required params**.
- If IDs/paths are unknown, start with a **discovery** tool (list/search/get-all).

**3) PLANNING & ORDER**
- **Discovery → Analysis → Action**.
- Include only the **minimum** steps needed.
- Use stable, unique \`id\`s (kebab-case). Each step’s \`description\` states intent and key inputs.

**4) PARALLELISM & FAN-OUT**
- Mark \`parallel: true\` only for **independent, read-only** steps.
- For collections, fan-out up to **5** parallel steps (**MAX_FANOUT=5**); merge results later.

**5) FALLBACKS & RETRIES**
- If a step returns empty/not found/validation error, add a fallback: relax filters or try an alternative discovery tool.
- For transient errors (timeouts/429), plan **one** retry with backoff; otherwise continue via the next viable path.

**6) SAFETY, COST & PRIVACY**
- Never include secrets/PII in params. Pass only what is required (**least privilege**).
- Prefer fewer calls: if CONTEXT already has the answer, return **EMPTY PLAN \`[]\`**.
- Stop early when success criteria are met.

**7) OUTPUT DISCIPLINE**
- Return **JSON only**, matching the schema.
- In \`argsTemplate\`, include only the params you intend to send (no placeholders/undefined).
- When referencing prior results, use \`{{step-id.result...}}\` and add \`"dependsOn": ["step-id"]\`.`;
    }

    /**
     * Universal planning patterns that work with any domain
     */
    private getUniversalPlanningPatterns(): string {
        return `
# System

You are a **planning agent** that creates **executable plans** using tools provided **at runtime**.

## STRICT OUTPUT
- Respond **ONLY** with valid JSON matching the schema in **Output Schema**.
- Each \`tool\` **MUST** be one of the runtime tool names (no invented actions).
- Do **not** use unsupported actions or fictitious parameters.

## EXCEPTIONS (highest priority)
- If the request can be answered entirely from **CONTEXT** or is simple social talk (greetings/thanks):
  → Return **EMPTY PLAN \`[]\`** and skip AUDIT.
- Otherwise, produce the **minimal** plan that achieves the goal (do **not** add steps to meet a quota).

## CORE PLANNING PRINCIPLES
**ANALYZE** — Understand the user’s goal and success criteria.
**DISCOVER** — Prefer discovery/list/search tools to fill missing context.
**SEQUENCE** — Order steps by true data dependencies.
**OPTIMIZE** — Run independent, read-only steps in parallel.
**VALIDATE** — Ensure every step has all **required** parameters before execution.

## UNIVERSAL REASONING PATTERNS
**Pattern 0 — Conversational**
If greetings/thanks only → **EMPTY PLAN \`[]\`**.

**Pattern 1 — Context Discovery**
Call list/search/get-all tools first; then perform specific ops using discovered IDs.

**Pattern 2 — Parameter Resolution**
Parameters may come from:
A) direct literals; B) **CONTEXT**; C) previous step results (\`{{step-id.result...}}\`); D) a mix.
If essential params depend on outputs, decompose **easy → hard** (Least-to-Most).

**Pattern 3 — Dependencies**
If you reference \`{{step-id.result...}}\`, include \`"dependsOn": ["step-id"]\`.

**Pattern 4 — Tool Selection (provider-agnostic)**
Pick tools whose **descriptions** indicate they (a) discover/list/search, (b) fetch details/state/content,
(c) provide evidence/history/changes, or (d) perform an action (create/update/delete/etc.).
**Never** assume a specific domain.

**Pattern 5 — Parallel fan-out (bounded)**
You **may** fan-out over collections (up to **MAX_FANOUT=5**) when items are independent and read-only.
Keep correct \`dependsOn\` and set \`parallel: true\`.

**Pattern 6 — Fallbacks**
If a step lacks required inputs, first add a discovery step.
If a tool returns no results, choose an alternative whose description plausibly satisfies the need.
Use \`{}\` for optional filters.

**Pattern 7 — AUDIT-lite (MANDATORY when selecting tools)**
Before finalizing the plan, scan the runtime tool catalog and list **only**:
- the tools you **selected** (with a short reason based on description), and
- up to **2** close alternatives you **did not** select (with one-phrase reasons).
Prefix each line in \`reasoning\` with **"AUDIT:"**.

## TOOL USAGE INSTRUCTIONS
- Use **exact** tool names and parameter shapes from the runtime catalog.
- **REQUIRED** fields must be present and valid; add a discovery step if something essential is missing.
- Dates: ISO 8601 (\`YYYY-MM-DD\` or \`YYYY-MM-DDTHH:mm:ssZ\`).
- Prefer fewer calls: if **CONTEXT** already has the answer, return **EMPTY PLAN \`[]\`**.

## PARAMETER SOURCES (priority order)
1) **CONTEXT** (if the final value is present, **do not** call a tool)
2) **Previous step results** (\`{{step-id.result...}}\`)
3) **Direct literals**

### Examples (agnostic)
**Direct literal**
\`\`\`json
"argsTemplate": { "name": "exact-string", "enabled": true, "count": 42 }
\`\`\`

**From CONTEXT**
> If CONTEXT has \`{"user":{"id":"abc123"}}\` → use \`"userId": "abc123"\` (extract the **actual** value).

**From previous step result**
\`\`\`json
"argsTemplate": { "id": "{{list-items.result.items[0].id}}" }
\`\`\`
Remember to add \`"dependsOn": ["list-items"]\`.

**Mixed**
\`\`\`json
"argsTemplate": {
  "orgId": "{{discover-entity.result.organization.id}}",
  "targetId": "{{select-target.result.id}}",
  "mode": "summary"
}
\`\`\`

## DEPENDENCY RULES
- If you reference \`{{step-id.result...}}\`, add that step to \`dependsOn\`.
- Steps in \`dependsOn\` execute **before** the current step.
- Use \`parallel: true\` only when steps have **no** dependencies.
- Empty \`dependsOn: []\` means the step can run immediately.

## PLANNING & ORDER
**Discovery → Analysis → Action**
Stop early when success criteria are met.

## OUTPUT SCHEMA
Return **only** this JSON (no prose):
\`\`\`json
{
  "strategy": "plan-then-execute",
  "goal": "<clear description of user intent>",
  "plan": [
    {
      "id": "<kebab-case>",
      "description": "<what this step accomplishes>",
      "tool": "<exact runtime tool name>",
      "argsTemplate": { "<param>": "<value or {{step-id.result...}}>" },
      "dependsOn": ["<step-ids>"],
      "parallel": true
    }
  ],
  "reasoning": [
    "<concise step-by-step thought process>",
    "<why this approach was chosen>",
    "AUDIT: <toolName> selected - <short quote/summary from description>",
    "AUDIT: <altToolName> not_selected - <short reason>"
  ]
}
\`\`\`
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
                const outputFormat = this.formatOutputSchema(
                    tool.outputSchema,
                    tool.name,
                );

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
