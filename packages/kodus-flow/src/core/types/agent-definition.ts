// /**
//  * @module core/types/agent-definition
//  * @description Clean agent definition types (what an agent IS)
//  *
//  * PRINCIPLES:
//  * - Definition describes what agent can do
//  * - No runtime concerns here
//  * - Stateless and serializable
//  * - Clear separation from execution
//  */

// import { z } from 'zod';
// // AgentExecutionContext removed - using ExecutionRuntime pattern instead

// /**
//  * Agent identity - who the agent is and what it does
//  */
// export type AgentIdentity = {
//     /**
//      * Agent's role/position (what they are)
//      * Example: "Senior Software Engineer", "Data Analyst"
//      */
//     role?: string;

//     /**
//      * Agent's specific goal (what they should achieve)
//      * Example: "Write clean, efficient, and well-tested Python code"
//      */
//     goal?: string;

//     /**
//      * General description (fallback/legacy support)
//      */
//     description?: string;

//     /**
//      * Agent's expertise areas
//      * Example: ["Python", "Data Analysis", "Machine Learning"]
//      */
//     expertise?: string[];

//     /**
//      * Agent's personality/backstory for context
//      */
//     personality?: string;

//     /**
//      * Communication style
//      * Example: "professional", "casual", "technical", "friendly"
//      */
//     style?: string;

//     /**
//      * Custom system prompt (overrides generated prompt)
//      */
//     systemPrompt?: string;
// };

// /**
//  * Agent action types - what an agent can decide to do
//  */
// export type AgentActionType =
//     | 'final_answer'
//     | 'need_more_info'
//     | 'tool_call'
//     | 'delegate_to_agent'
//     | 'parallel_tools'
//     | 'sequential_tools'
//     | 'conditional_tools'
//     | 'mixed_tools'
//     | 'dependency_tools';

// /**
//  * Base agent action interface
//  */
// export interface AgentAction<TContent = unknown> {
//     type: AgentActionType;
//     content?: TContent;
//     reasoning?: string;
// }

// /**
//  * Agent thought - result of thinking process
//  */
// export interface AgentThought<TContent = unknown> {
//     reasoning: string;
//     action: AgentAction<TContent>;
//     confidence?: number;
//     metadata?: Record<string, unknown>;
// }

// /**
//  * Think function signature
//  * - Takes input and execution context
//  * - Returns thought with action
//  * - Has access to services through context
//  */
// export type ThinkFunction<TInput = unknown, TOutput = unknown> = (
//     input: TInput,
//     context: Record<string, unknown>, // TODO: Import proper AgentContext type
// ) => Promise<AgentThought<TOutput>>;

// /**
//  * Agent configuration options
//  */
// export interface AgentConfig {
//     /**
//      * Maximum iterations for looping agents
//      */
//     maxIterations?: number;

//     /**
//      * Execution timeout in milliseconds
//      */
//     timeout?: number;

//     /**
//      * Required tools for this agent
//      */
//     requiredTools?: string[];

//     /**
//      * Optional tools that enhance this agent
//      */
//     optionalTools?: string[];

//     /**
//      * Enable specific capabilities
//      */
//     capabilities?: {
//         enableMemory?: boolean;
//         enableState?: boolean;
//         enableSession?: boolean;
//         enableTools?: boolean;
//     };
// }

// /**
//  * Clean agent definition - what an agent IS
//  * Contains only static definition, no runtime state
//  */
// export interface AgentDefinition<TInput = unknown, TOutput = unknown> {
//     /**
//      * Agent name (unique identifier)
//      */
//     name: string;

//     /**
//      * Agent identity (who they are)
//      */
//     identity: AgentIdentity;

//     /**
//      * Core thinking function
//      */
//     think: ThinkFunction<TInput, TOutput>;

//     /**
//      * Agent configuration
//      */
//     config?: AgentConfig;

//     /**
//      * Version for tracking
//      */
//     version?: string;

//     /**
//      * Additional metadata
//      */
//     metadata?: Record<string, unknown>;

//     /**
//      * Optional response formatting
//      */
//     formatResponse?: (thought: AgentThought<TOutput>) => TOutput;

//     /**
//      * Optional input validation
//      */
//     validateInput?: (input: unknown) => input is TInput;
// }

// /**
//  * Validation schemas
//  */
// export const agentIdentitySchema = z
//     .object({
//         role: z.string().optional(),
//         goal: z.string().optional(),
//         description: z.string().optional(),
//         expertise: z.array(z.string()).optional(),
//         personality: z.string().optional(),
//         style: z.string().optional(),
//         systemPrompt: z.string().optional(),
//     })
//     .refine(
//         (data) => {
//             // At least one field must be provided
//             const fields = [
//                 data.role,
//                 data.goal,
//                 data.description,
//                 data.expertise,
//                 data.personality,
//                 data.style,
//                 data.systemPrompt,
//             ];
//             return fields.some(
//                 (field) =>
//                     field !== undefined &&
//                     field !== null &&
//                     (Array.isArray(field)
//                         ? field.length > 0
//                         : field.trim?.() !== ''),
//             );
//         },
//         {
//             message: 'At least one identity field must be provided',
//         },
//     );

// export const agentConfigSchema = z.object({
//     maxIterations: z.number().positive().optional(),
//     timeout: z.number().positive().optional(),
//     requiredTools: z.array(z.string()).optional(),
//     optionalTools: z.array(z.string()).optional(),
//     capabilities: z
//         .object({
//             enableMemory: z.boolean().optional(),
//             enableState: z.boolean().optional(),
//             enableSession: z.boolean().optional(),
//             enableTools: z.boolean().optional(),
//         })
//         .optional(),
// });

// export const agentDefinitionSchema = z.object({
//     name: z.string().min(1),
//     identity: agentIdentitySchema,
//     think: z.function(),
//     config: agentConfigSchema.optional(),
//     version: z.string().optional(),
//     metadata: z.record(z.string(), z.unknown()).optional(),
//     formatResponse: z.instanceof(Function).optional(),
//     validateInput: z.instanceof(Function).optional(),
// });

// /**
//  * Validate agent definition
//  */
// export function validateAgentDefinition(
//     definition: unknown,
// ): definition is AgentDefinition {
//     try {
//         agentDefinitionSchema.parse(definition);
//         return true;
//     } catch {
//         return false;
//     }
// }

// /**
//  * Generate system prompt from identity
//  */
// export function generateSystemPrompt(identity: AgentIdentity): string {
//     if (identity.systemPrompt) {
//         return identity.systemPrompt;
//     }

//     const parts: string[] = [];

//     if (identity.role) {
//         parts.push(`You are a ${identity.role}.`);
//     }

//     if (identity.goal) {
//         parts.push(`Your goal is: ${identity.goal}`);
//     }

//     if (identity.expertise && identity.expertise.length > 0) {
//         parts.push(
//             `Your areas of expertise include: ${identity.expertise.join(', ')}.`,
//         );
//     }

//     if (identity.personality) {
//         parts.push(identity.personality);
//     }

//     if (identity.style) {
//         parts.push(`Communication style: ${identity.style}.`);
//     }

//     if (identity.description) {
//         if (parts.length === 0) {
//             parts.push(identity.description);
//         } else {
//             parts.push(`Additional context: ${identity.description}`);
//         }
//     }

//     if (parts.length === 0) {
//         parts.push(
//             'You are a helpful AI assistant ready to assist with various tasks.',
//         );
//     }

//     return parts.join(' ');
// }
