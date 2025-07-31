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

        // 1. Available tools - simple list
        sections.push(this.formatAvailableTools(context.availableTools));

        // 2. Context information
        if (context.memoryContext) {
            sections.push(`CONTEXT:\n${context.memoryContext.trim()}`);
        }

        // 3. Planning history
        if (context.planningHistory) {
            sections.push(
                `PREVIOUS ATTEMPTS:\n${context.planningHistory.trim()}`,
            );
        }

        // 4. Additional context
        if (
            context.additionalContext &&
            Object.keys(context.additionalContext).length > 0
        ) {
            sections.push(
                `ADDITIONAL INFO:\n${JSON.stringify(context.additionalContext, null, 2)}`,
            );
        }

        // 5. Simple dynamic hints
        if (this.config.features?.includeDynamicHints !== false) {
            const hints = this.generateSimpleHints(context.goal);
            if (hints) {
                sections.push(`HINTS:\n${hints}`);
            }
        }

        // 6. The user request
        sections.push(`USER REQUEST: "${context.goal}"`);

        // 7. Final instruction
        sections.push(
            'Create an executable plan using the available tools above.',
        );

        return sections.join('\n\n');
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
When a tool needs parameters you don't have:
→ Find tools that can provide those parameters
→ Common flow: list → get details → perform action
→ Chain results using {{step-id.result}} references

Pattern 3 - Tool Analysis
Read tool descriptions to understand what each tool does:
→ Tools that mention returning multiple items, lists, or arrays usually provide discovery
→ Tools that require specific identifiers in parameters usually need those IDs first
→ Tools that mention creating, updating, or deleting modify data
→ Always read the tool description - it contains the most reliable information

Pattern 4 - Parallel Optimization
Execute simultaneously when:
→ Operations are independent (no shared data dependencies)
→ Different resource types or endpoints
→ Read-only operations that don't conflict
→ Mark with parallel:true for concurrent execution

Pattern 5 - Intelligent Fallback
When specific data is missing:
→ Don't give up - use available tools creatively
→ Use partial matches, filters, or approximations
→ Chain multiple operations to build needed context`;
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
        "<param>": "<value or {{step-id.result}} reference>"
      },
      "dependsOn": ["<previous-step-ids>"],
      "parallel": <true|false>
    }
  ],
  "reasoning": [
    "<step-by-step thought process>",
    "<why this approach was chosen>",
    "<any assumptions made>"
  ]
}`
        );
    }

    /**
     * Format available tools - simple list
     */
    private formatAvailableTools(tools: ToolMetadataForLLM[]): string {
        const sections: string[] = ['AVAILABLE TOOLS:'];

        tools.forEach((tool) => {
            sections.push(`\n• ${tool.name}: ${tool.description}`);
            if (tool.parameters?.properties) {
                const params = this.formatToolParameters(tool);
                if (params) sections.push(`  ${params}`);
            }
        });

        return sections.join('\n');
    }

    /**
     * Format tool parameters concisely
     */
    private formatToolParameters(tool: ToolMetadataForLLM): string {
        if (!tool.parameters?.properties) return '';

        const properties = tool.parameters.properties as Record<
            string,
            unknown
        >;
        const required = (tool.parameters.required as string[]) || [];

        const paramStrings = Object.entries(properties).map(([name, prop]) => {
            const isRequired = required.includes(name);
            const propObj = prop as { type?: string };
            const type = propObj.type || 'unknown';
            const marker = isRequired ? '[REQUIRED]' : '[optional]';
            return `${name} (${type}) ${marker}`;
        });

        return `Parameters: ${paramStrings.join(', ')}`;
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
