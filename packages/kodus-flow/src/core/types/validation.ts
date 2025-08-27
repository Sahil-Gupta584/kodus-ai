// /**
//  * @module core/types/validation
//  * @description Validation utilities for core types
//  */

// import { z } from 'zod';
// import type { ToolId, AgentId } from './base-types.js';

// // ──────────────────────────────────────────────────────────────────────────────
// // 🎯 VALIDATION SCHEMAS
// // ──────────────────────────────────────────────────────────────────────────────

// /**
//  * Tool ID validation schema
//  */
// export const toolIdValidationSchema = z.string().min(1).max(100);

// /**
//  * Agent ID validation schema
//  */
// export const agentIdValidationSchema = z.string().min(1).max(100);

// /**
//  * Execution ID validation schema
//  */
// export const executionIdValidationSchema = z.string().min(1).max(100);

// /**
//  * Tenant ID validation schema
//  */
// export const tenantIdValidationSchema = z.string().min(1).max(100);

// /**
//  * Correlation ID validation schema
//  */
// export const correlationIdValidationSchema = z.string().min(1).max(100);

// /**
//  * Plan step parameters validation schema
//  */
// export const planStepParametersSchema = z.object({
//     tool: z
//         .object({
//             input: z.unknown().optional(),
//             options: z.record(z.string(), z.unknown()).optional(),
//             timeout: z.number().positive().optional(),
//             retry: z.number().nonnegative().optional(),
//         })
//         .optional(),
//     agent: z
//         .object({
//             input: z.unknown().optional(),
//             context: z.record(z.string(), z.unknown()).optional(),
//             options: z.record(z.string(), z.unknown()).optional(),
//             timeout: z.number().positive().optional(),
//         })
//         .optional(),
//     custom: z.record(z.string(), z.unknown()).optional(),
// });

// // ✅ Zod v4: Novos recursos para validação avançada
// export const enhancedValidationSchema = z.object({
//     // ✅ z.preprocess() para limpeza automática
//     email: z.preprocess(
//         (val) => (typeof val === 'string' ? val.toLowerCase().trim() : val),
//         z.string().email(),
//     ),

//     // ✅ z.transform() para conversão automática
//     age: z.number().transform((val) => Math.floor(val)),

//     // ✅ z.coerce() para conversão automática de tipos
//     userId: z.coerce.number().positive(),
//     isActive: z.coerce.boolean(),

//     // ✅ z.nullish() para valores null/undefined
//     optionalField: z.string().nullish(),

//     // ✅ z.brand() para tipos branded (quando necessário)
//     tenantId: z.string().brand<'TenantId'>(),
// });

// // ✅ Zod v4: Validação customizada mais robusta
// export const customValidationSchema = z
//     .object({
//         input: z.unknown().optional(),
//         options: z.record(z.string(), z.unknown()).optional(),
//     })
//     .refine(
//         (data) => {
//             // ✅ Validação customizada mais performática
//             return (
//                 data.input !== undefined ||
//                 Object.keys(data.options || {}).length > 0
//             );
//         },
//         {
//             message: 'Either input or options must be provided',
//             path: ['input'], // ✅ Path específico para erro
//         },
//     );

// // ✅ Zod v4: Validação condicional
// export const conditionalValidationSchema = z
//     .object({
//         type: z.enum(['user', 'admin']),
//         permissions: z.array(z.string()).optional(),
//     })
//     .refine(
//         (data) => {
//             if (data.type === 'admin') {
//                 return data.permissions && data.permissions.length > 0;
//             }
//             return true;
//         },
//         {
//             message: 'Admin users must have permissions',
//             path: ['permissions'],
//         },
//     );

// // ✅ Zod v4: Validação cross-field
// export const crossFieldValidationSchema = z
//     .object({
//         startDate: z.date(),
//         endDate: z.date(),
//         custom: z.record(z.string(), z.unknown()).optional(),
//     })
//     .refine((data) => data.endDate > data.startDate, {
//         message: 'End date must be after start date',
//         path: ['endDate'],
//     });

// // ──────────────────────────────────────────────────────────────────────────────
// // 🔍 VALIDATION FUNCTIONS
// // ──────────────────────────────────────────────────────────────────────────────

// /**
//  * Validates if a value is a valid ToolId
//  */
// export function validateToolId(id: unknown): id is ToolId {
//     return toolIdValidationSchema.safeParse(id).success;
// }

// /**
//  * Validates if a value is a valid AgentId
//  */
// export function validateAgentId(id: unknown): id is AgentId {
//     return agentIdValidationSchema.safeParse(id).success;
// }

// /**
//  * Validates if a value is a valid ExecutionId
//  */
// export function validateExecutionId(id: unknown): id is string {
//     return executionIdValidationSchema.safeParse(id).success;
// }

// /**
//  * Validates if a value is a valid TenantId
//  */
// export function validateTenantId(id: unknown): id is string {
//     return tenantIdValidationSchema.safeParse(id).success;
// }

// /**
//  * Validates if a value is a valid CorrelationId
//  */
// export function validateCorrelationId(id: unknown): id is string {
//     return correlationIdValidationSchema.safeParse(id).success;
// }

// /**
//  * Validate plan step parameters
//  */
// export function validatePlanStepParameters(params: unknown): boolean {
//     return planStepParametersSchema.safeParse(params).success;
// }

// /**
//  * Validate that all required fields are present
//  */
// export function validateRequiredFields<T extends Record<string, unknown>>(
//     obj: T,
//     requiredFields: (keyof T)[],
// ): boolean {
//     return requiredFields.every(
//         (field) => obj[field] !== undefined && obj[field] !== null,
//     );
// }

// /**
//  * Type guard for checking if an object has specific properties
//  */
// export function hasProperties<
//     T extends Record<string, unknown>,
//     K extends keyof T,
// >(obj: T, properties: K[]): obj is T & Required<Pick<T, K>> {
//     return properties.every((prop) => prop in obj && obj[prop] !== undefined);
// }

// // ──────────────────────────────────────────────────────────────────────────────
// // 🛡️ RUNTIME TYPE CHECKS
// // ──────────────────────────────────────────────────────────────────────────────

// /**
//  * Runtime type checking utilities
//  */
// export const typeChecks = {
//     /**
//      * Check if value is a valid string ID
//      */
//     isValidId: (value: unknown): value is string => {
//         return (
//             typeof value === 'string' && value.length > 0 && value.length <= 100
//         );
//     },

//     /**
//      * Check if value is a valid object
//      */
//     isValidObject: (value: unknown): value is Record<string, unknown> => {
//         return (
//             typeof value === 'object' && value !== null && !Array.isArray(value)
//         );
//     },

//     /**
//      * Check if value is a valid array
//      */
//     isValidArray: (value: unknown): value is unknown[] => {
//         return Array.isArray(value);
//     },

//     /**
//      * Check if value is a valid function
//      */
//     isValidFunction: (
//         value: unknown,
//     ): value is (...args: unknown[]) => unknown => {
//         return typeof value === 'function';
//     },

//     /**
//      * Check if value is a valid number
//      */
//     isValidNumber: (value: unknown): value is number => {
//         return typeof value === 'number' && !isNaN(value);
//     },

//     /**
//      * Check if value is a valid boolean
//      */
//     isValidBoolean: (value: unknown): value is boolean => {
//         return typeof value === 'boolean';
//     },
// } as const;

// // ──────────────────────────────────────────────────────────────────────────────
// // 📊 VALIDATION RESULTS
// // ──────────────────────────────────────────────────────────────────────────────

// /**
//  * Validation result with detailed error information
//  */
// export interface ValidationResult<T = unknown> {
//     isValid: boolean;
//     value?: T;
//     errors: string[];
//     warnings: string[];
// }

// /**
//  * Create a validation result
//  */
// export function createValidationResult<T>(
//     isValid: boolean,
//     value?: T,
//     errors: string[] = [],
//     warnings: string[] = [],
// ): ValidationResult<T> {
//     return { isValid, value, errors, warnings };
// }

// /**
//  * Combine multiple validation results
//  */
// export function combineValidationResults(
//     ...results: ValidationResult[]
// ): ValidationResult {
//     const isValid = results.every((r) => r.isValid);
//     const errors = results.flatMap((r) => r.errors);
//     const warnings = results.flatMap((r) => r.warnings);

//     return createValidationResult(isValid, undefined, errors, warnings);
// }

// // ===== UTILITY FUNCTIONS =====

// /**
//  * Creates a safe ID by validating and converting to branded type
//  */
// export function createToolId(id: string): ToolId | null {
//     return validateToolId(id) ? (id as ToolId) : null;
// }

// /**
//  * Creates a safe AgentId by validating and converting to branded type
//  */
// export function createAgentId(id: string): AgentId | null {
//     return validateAgentId(id) ? (id as AgentId) : null;
// }
