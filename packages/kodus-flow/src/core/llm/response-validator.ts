/**
 * @module core/llm/response-validator
 * @description AJV-based validation for LLM responses with type safety and error handling
 *
 * PHILOSOPHY:
 * ✅ Industry-standard validation with AJV
 * ✅ Type-safe schema definitions
 * ✅ Detailed error reporting
 * ✅ Flexible response parsing
 * ✅ Performance optimized with compiled validators
 */

import { default as Ajv } from 'ajv';
import { default as addFormats } from 'ajv-formats';
import { createLogger } from '../../observability/index.js';
import type {
    PlanningResult,
    RoutingResult,
    LangChainResponse,
} from './direct-llm-adapter.js';

const logger = createLogger('response-validator');

// ──────────────────────────────────────────────────────────────────────────────
// 🎯 AJV INSTANCE - Configured for LLM response validation
// ──────────────────────────────────────────────────────────────────────────────

const ajvConstructor = Ajv as unknown as typeof Ajv.default;
const ajv = new ajvConstructor({
    allErrors: true,
    verbose: true,
    strict: false, // LLM responses might have extra fields
    coerceTypes: true, // Convert string numbers to numbers
    removeAdditional: 'failing', // Keep unknown fields but mark as failing
    // ✅ AJV PERFORMANCE: Optimize for large schemas
    code: { optimize: true },
    // ✅ AJV PERFORMANCE: Loop optimization for arrays
    loopRequired: 20, // Use loop for >20 required properties
    loopEnum: 20, // Use loop for >20 enum values
});

// Add format validators (email, uri, date-time, etc)
const addFormatsFunction = addFormats as unknown as typeof addFormats.default;
addFormatsFunction(ajv);

// ──────────────────────────────────────────────────────────────────────────────
// 📋 JSON SCHEMAS FOR VALIDATION
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Schema for PlanStep in PlanningResult
 */
const planStepSchema = {
    type: 'object',
    properties: {
        id: { type: 'string', pattern: '^[a-z0-9-]+$' }, // kebab-case
        description: { type: 'string', minLength: 1 },
        tool: { type: 'string', nullable: true },
        arguments: {
            type: 'object',
            additionalProperties: true,
            nullable: true,
        },
        dependencies: {
            type: 'array',
            items: { type: 'string' },
            nullable: true,
        },
        type: {
            type: 'string',
            enum: [
                'analysis',
                'action',
                'decision',
                'observation',
                'verification',
            ],
        },
        parallel: { type: 'boolean', nullable: true },
        argsTemplate: {
            type: 'object',
            additionalProperties: true,
            nullable: true,
        },
        expectedOutcome: { type: 'string', nullable: true },
        retry: { type: 'number', nullable: true },
        status: {
            type: 'string',
            enum: ['pending', 'executing', 'completed', 'failed', 'skipped'],
            nullable: true,
        },
    },
    required: ['id', 'description'],
    additionalProperties: true,
};

/**
 * Schema for PlanningResult
 */
const planningResultSchema = {
    type: 'object',
    properties: {
        strategy: { type: 'string', minLength: 1 },
        goal: { type: 'string', minLength: 1 },
        steps: {
            type: 'array',
            items: planStepSchema,
            minItems: 0,
        },
        plan: {
            type: 'array',
            items: planStepSchema,
            minItems: 0,
        },
        signals: {
            type: 'object',
            properties: {
                needs: {
                    type: 'array',
                    items: { type: 'string' },
                    nullable: true,
                },
                noDiscoveryPath: {
                    type: 'array',
                    items: { type: 'string' },
                    nullable: true,
                },
                errors: {
                    type: 'array',
                    items: { type: 'string' },
                    nullable: true,
                },
                suggestedNextStep: { type: 'string', nullable: true },
            },
            additionalProperties: true,
            nullable: true,
        },
        audit: {
            type: 'array',
            items: { type: 'string' },
            nullable: true,
        },
        reasoning: {
            oneOf: [
                { type: 'string' },
                {
                    type: 'array',
                    items: { type: 'string' },
                },
            ],
        },
        complexity: {
            type: 'string',
            enum: ['simple', 'medium', 'complex'],
            nullable: true,
        },
        estimatedTime: { type: 'number', nullable: true },
        metadata: {
            type: 'object',
            additionalProperties: true,
            nullable: true,
        },
    },
    oneOf: [
        { required: ['strategy', 'goal', 'steps'] },
        { required: ['strategy', 'goal', 'plan'] },
    ],
    additionalProperties: true,
};

/**
 * Schema for RoutingResult
 */
const routingResultSchema = {
    type: 'object',
    properties: {
        strategy: { type: 'string', minLength: 1 },
        selectedTool: { type: 'string', minLength: 1 },
        confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
        },
        reasoning: { type: 'string', minLength: 1 },
        alternatives: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    tool: { type: 'string', minLength: 1 },
                    confidence: {
                        type: 'number',
                        minimum: 0,
                        maximum: 1,
                    },
                    reason: { type: 'string' },
                },
                required: ['tool', 'confidence'],
            },
            nullable: true,
        },
    },
    required: ['strategy', 'selectedTool', 'confidence', 'reasoning'],
    additionalProperties: true,
};

/**
 * Schema for generic LLM response
 */
const llmResponseSchema = {
    type: 'object',
    properties: {
        content: { type: 'string' },
        toolCalls: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    type: { type: 'string' },
                    function: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            arguments: { type: 'string' },
                        },
                        required: ['name', 'arguments'],
                    },
                },
                required: ['id', 'type', 'function'],
            },
            nullable: true,
        },
        usage: {
            type: 'object',
            properties: {
                promptTokens: { type: 'number', nullable: true },
                completionTokens: { type: 'number', nullable: true },
                totalTokens: { type: 'number', nullable: true },
            },
            nullable: true,
        },
        additionalKwargs: {
            type: 'object',
            additionalProperties: true,
            nullable: true,
        },
    },
    required: ['content'],
    additionalProperties: true,
};

// ──────────────────────────────────────────────────────────────────────────────
// 🚀 COMPILED VALIDATORS - For performance
// ──────────────────────────────────────────────────────────────────────────────

const validatePlanningResultSchema = ajv.compile(planningResultSchema);
const validateRoutingResultSchema = ajv.compile(routingResultSchema);
const validateLLMResponseSchema = ajv.compile(llmResponseSchema);

// ──────────────────────────────────────────────────────────────────────────────
// 🛡️ VALIDATION FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Extract content from various response formats
 */
function extractContent(response: unknown): string {
    // String response
    if (typeof response === 'string') {
        return response;
    }

    // LangChain response object
    if (typeof response === 'object' && response !== null) {
        const obj = response as Record<string, unknown>;

        // ✅ ENHANCED: Handle array content with text blocks (Claude/Anthropic format)
        if (Array.isArray(obj.content)) {
            // Find text block in content array
            const textBlock = obj.content.find((block: unknown) => {
                if (typeof block === 'object' && block !== null) {
                    const blockObj = block as Record<string, unknown>;
                    return (
                        blockObj.type === 'text' &&
                        typeof blockObj.text === 'string'
                    );
                }
                return false;
            });

            if (textBlock) {
                const textObj = textBlock as Record<string, unknown>;
                return textObj.text as string;
            }

            // Fallback: concatenate all text content
            return obj.content
                .map((block: unknown) => {
                    if (typeof block === 'string') return block;
                    if (typeof block === 'object' && block !== null) {
                        const blockObj = block as Record<string, unknown>;
                        if (blockObj.text) return blockObj.text;
                        if (blockObj.reasoning) return blockObj.reasoning;
                    }
                    return '';
                })
                .filter(Boolean)
                .join('\n');
        }

        // Direct content field (string)
        if (typeof obj.content === 'string') {
            return obj.content;
        }

        // Message format
        if (obj.message && typeof obj.message === 'object') {
            const msg = obj.message as Record<string, unknown>;
            if (typeof msg.content === 'string') {
                return msg.content;
            }
        }

        // Text field
        if (typeof obj.text === 'string') {
            return obj.text;
        }

        // Completion field
        if (typeof obj.completion === 'string') {
            return obj.completion;
        }
    }

    // Fallback to JSON string
    return JSON.stringify(response);
}

/**
 * Parse JSON from various formats (handles code blocks, etc)
 */
function parseJSON(content: string): unknown {
    // Remove markdown code blocks
    const cleanContent = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

    // Try direct parse
    try {
        return JSON.parse(cleanContent);
    } catch {
        // Try to extract JSON from mixed content
        const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch {
                // Continue to next attempt
            }
        }

        // Try to extract array
        const arrayMatch = cleanContent.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
            try {
                return JSON.parse(arrayMatch[0]);
            } catch {
                // Continue to next attempt
            }
        }
    }

    throw new Error('Failed to parse JSON from response');
}

/**
 * Validate and parse planning response
 */
export function validatePlanningResponse(response: unknown): PlanningResult {
    try {
        // Extract content
        const content = extractContent(response);

        // Parse JSON
        const parsed = parseJSON(content);

        // Handle direct array response (list of steps)
        let planData: unknown = parsed;
        if (Array.isArray(parsed)) {
            planData = {
                strategy: 'plan-execute',
                goal: 'Inferred from steps',
                steps: parsed,
                reasoning: 'Steps provided as array',
            };
        }

        // Normalize plan/steps field
        if (typeof planData === 'object' && planData !== null) {
            const obj = planData as Record<string, unknown>;

            // ✅ FIX: Handle case where both plan and steps are empty
            if (obj.plan && obj.steps) {
                // If both exist, prefer steps and remove plan to satisfy oneOf
                if (Array.isArray(obj.steps) && Array.isArray(obj.plan)) {
                    if (obj.steps.length === 0 && obj.plan.length === 0) {
                        // Both empty - keep steps, remove plan
                        delete obj.plan;
                    } else if (obj.steps.length === 0 && obj.plan.length > 0) {
                        // Steps empty, plan has data - copy plan to steps
                        obj.steps = obj.plan;
                        delete obj.plan;
                    } else if (obj.steps.length > 0 && obj.plan.length === 0) {
                        // Steps has data, plan empty - remove plan
                        delete obj.plan;
                    }
                    // If both have data, prefer steps
                }
            }
            // If has 'plan' but not 'steps', copy plan to steps
            else if (obj.plan && !obj.steps) {
                obj.steps = obj.plan;
                delete obj.plan;
            }
            // If has 'steps' but not 'plan', keep as is
            else if (obj.steps && !obj.plan) {
                // Already correct format
            }

            // Normalize reasoning to string
            if (Array.isArray(obj.reasoning)) {
                obj.reasoning = obj.reasoning.join('\n');
            }
        }

        // Validate with AJV
        if (validatePlanningResultSchema(planData)) {
            const validData = planData as unknown as PlanningResult;
            logger.debug('Planning response validated successfully', {
                strategy: validData.strategy,
                stepsCount: validData.steps?.length || 0,
            });
            return validData;
        }

        // Validation failed - log errors and attempt recovery
        // ✅ AJV BEST PRACTICE: Copy errors before they're overwritten
        const validationErrors = validatePlanningResultSchema.errors
            ? [...validatePlanningResultSchema.errors]
            : [];

        logger.warn('Planning response validation failed', {
            errors: validationErrors,
            parsedData: planData,
        });

        // Attempt to recover with defaults
        const planDataRecord = planData as Record<string, unknown>;
        const recovered: PlanningResult = {
            strategy: (planDataRecord?.strategy as string) || 'unknown',
            goal: (planDataRecord?.goal as string) || 'Unknown goal',
            steps:
                (planDataRecord?.steps as PlanningResult['steps']) ||
                (planDataRecord?.plan as PlanningResult['steps']) ||
                [],
            reasoning:
                (planDataRecord?.reasoning as string) ||
                'No reasoning provided',
            complexity:
                (planDataRecord?.complexity as
                    | 'simple'
                    | 'medium'
                    | 'complex') || 'medium',
        };

        // Validate recovered data
        if (validatePlanningResultSchema(recovered)) {
            logger.info('Successfully recovered planning response', {
                strategy: recovered.strategy,
                stepsCount: recovered.steps.length,
            });
            return recovered;
        }

        // ✅ AJV BEST PRACTICE: Copy errors before using
        const recoveryErrors = validatePlanningResultSchema.errors
            ? [...validatePlanningResultSchema.errors]
            : [];

        throw new Error(
            `Validation failed after recovery: ${JSON.stringify(recoveryErrors)}`,
        );
    } catch (error) {
        logger.error('Failed to validate planning response', error as Error, {
            responseType: typeof response,
            responsePreview: JSON.stringify(response).substring(0, 200),
        });

        // Return minimal valid response
        return {
            strategy: 'error-recovery',
            goal: 'Failed to parse response',
            steps: [],
            reasoning: error instanceof Error ? error.message : 'Unknown error',
            complexity: 'simple',
        };
    }
}

/**
 * Validate generic LLM response
 */
export function validateLLMResponse(response: unknown): LangChainResponse {
    try {
        // Handle string response
        if (typeof response === 'string') {
            return { content: response };
        }

        // Validate with AJV
        if (validateLLMResponseSchema(response)) {
            return response as unknown as LangChainResponse;
        }

        // Extract content for simple response
        const content = extractContent(response);
        return { content };
    } catch (error) {
        logger.error('Failed to validate LLM response', error as Error);
        return { content: 'Failed to parse LLM response' };
    }
}

/**
 * Validate routing response
 */
export function validateRoutingResponse(response: unknown): RoutingResult {
    try {
        // Extract content
        const content = extractContent(response);

        // Parse JSON
        const parsed = parseJSON(content);

        // Validate with AJV
        if (validateRoutingResultSchema(parsed)) {
            const validData = parsed as unknown as RoutingResult;
            logger.debug('Routing response validated successfully', {
                selectedTool: validData.selectedTool,
                confidence: validData.confidence,
            });
            return validData;
        }

        // Validation failed - log errors
        // ✅ AJV BEST PRACTICE: Copy errors before they're overwritten
        const validationErrors = validateRoutingResultSchema.errors
            ? [...validateRoutingResultSchema.errors]
            : [];

        logger.warn('Routing response validation failed', {
            errors: validationErrors,
            parsedData: parsed,
        });

        throw new Error(
            `Validation failed: ${JSON.stringify(validationErrors)}`,
        );
    } catch (error) {
        logger.error('Failed to validate routing response', error as Error);

        // Return fallback
        return {
            strategy: 'error-recovery',
            selectedTool: 'unknown',
            confidence: 0,
            reasoning:
                error instanceof Error
                    ? error.message
                    : 'Failed to parse routing response',
        };
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 🔧 UTILITY FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Get detailed validation errors in human-readable format
 */
export function getValidationErrors(validator: {
    errors?: Array<{ instancePath?: string; message?: string }>;
}): string[] {
    if (!validator.errors) return [];

    return validator.errors.map((err) => {
        const path = err.instancePath || 'root';
        const message = err.message || 'Unknown error';
        return `${path}: ${message}`;
    });
}

/**
 * Validate any JSON against a custom schema
 */
export function validateCustomSchema(data: unknown, schema: object): boolean {
    const validate = ajv.compile(schema);
    const valid = validate(data);

    if (!valid) {
        logger.warn('Custom schema validation failed', {
            errors: validate.errors,
            data,
        });
    }

    return valid;
}
