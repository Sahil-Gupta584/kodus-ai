/**
 * Schema for structured ReAct agent output
 * Eliminates parsing errors by forcing JSON structure
 */

import * as z from 'zod';

export const reActOutputSchema = z.object({
    reasoning: z.string().describe("Agent's thought process and reasoning"),
    action: z.discriminatedUnion('type', [
        z.object({
            type: z.literal('tool_call'),
            tool: z.string().describe('Exact tool name from available tools'),
            arguments: z
                .record(z.unknown())
                .describe('Tool arguments as key-value pairs'),
        }),
        z.object({
            type: z.literal('final_answer'),
            content: z.string().describe('Final response to the user'),
        }),
    ]),
    confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('Confidence level 0-1'),
});

export type ReActOutput = z.infer<typeof reActOutputSchema>;

/**
 * Validation helper for legacy LLM responses
 */
export function validateReActOutput(output: unknown): ReActOutput | null {
    try {
        return reActOutputSchema.parse(output);
    } catch {
        return null;
    }
}

/**
 * Legacy plan step interface
 */
interface LegacyPlanStep {
    tool?: string;
    arguments?: Record<string, unknown>;
    description?: string;
}

/**
 * Legacy plan interface
 */
interface LegacyPlan {
    reasoning?: string;
    steps?: LegacyPlanStep[];
}

/**
 * Convert legacy plan format to ReActOutput
 */
export function convertPlanToReActOutput(plan: LegacyPlan): ReActOutput {
    const nextStep = plan.steps?.[0];

    if (!nextStep) {
        return {
            reasoning: plan.reasoning || 'No clear action identified',
            action: {
                type: 'final_answer',
                content: 'Unable to determine next action',
            },
        };
    }

    if (nextStep.tool && nextStep.tool !== 'none') {
        return {
            reasoning:
                plan.reasoning || nextStep.description || 'Tool call action',
            action: {
                type: 'tool_call',
                tool: nextStep.tool,
                arguments: nextStep.arguments || {},
            },
        };
    }

    return {
        reasoning:
            plan.reasoning || nextStep.description || 'Final answer action',
        action: {
            type: 'final_answer',
            content: nextStep.description || 'Task completed',
        },
    };
}
